/* ------------------------------------------------------------------ *
 *  Fahh MIDI · automation surface   →   window.FahhMIDI
 *
 *  Everything the UI can do is reachable from a script (Playwright,
 *  Selenium, Puppeteer…) with zero manual interaction. All methods are
 *  JSON-friendly, never open dialogs and report problems by throwing
 *  (page.evaluate surfaces the message) or via { rejected: [...] }.
 *  See automation/fahh_midi.py for a ready-made Python wrapper.
 * ------------------------------------------------------------------ */
import { CHORD_LIBRARY_SIZE, CHORD_QUALITIES, identifyChord, summariseHarmony } from "./chords";
import { exportWithEvents } from "./exporter";
import { base64ToBytes, measureAt, type Song } from "./midi";
import type { Player } from "./player";
import { drawFrame } from "./renderer";
import {
  APP_NAME,
  DEFAULTS,
  FIELD_BY_PATH,
  SCHEMA,
  THEME_PRESETS,
  changedPaths,
  exportDocument,
  getByPath,
  parseSettingsInput,
  resolvePath,
  setByPath,
  type PatchResult,
} from "./settings";
import { BUILT_IN_IDS, REPERTOIRE, loadBuiltIn, loadCustom } from "./songs";
import { buildManifest, downloadBlob, midiTimeOfFrame, totalFrames } from "./sync";
import type { AllSettings, SyncConfig } from "./types";

export const APP_VERSION = "1.0.0";

export interface Controller {
  player: Player;
  automation: boolean;
  isReady(): boolean;
  getDoc(): AllSettings;
  patch(patch: unknown, prefix?: string): PatchResult;
  reset(paths?: string[]): AllSettings;
  preset(id: string): PatchResult;
  adopt(song: Song): void;
  getSong(): Song;
  setHand(track: number, hand: "auto" | "L" | "R"): void;
  setZen(v: boolean): void;
  isZen(): boolean;
  notify(text: string, kind?: "error" | "info"): void;
}

interface LastExport {
  blob: Blob;
  fileName: string;
  bytes: number;
}

const bytesToBase64 = (bytes: Uint8Array) => {
  let s = "";
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode(...bytes.subarray(i, i + CH));
  return btoa(s);
};

function songInfo(song: Song) {
  return {
    id: song.id,
    name: song.name,
    fileName: song.fileName,
    artist: song.artist ?? null,
    noteCount: song.notes.length,
    durationSeconds: +song.duration.toFixed(6),
    measures: song.measures.length,
    ppq: song.ppq,
    lowestMidiNote: song.minKey + 21,
    highestMidiNote: song.maxKey + 21,
    tracks: song.tracks.map((t) => ({ index: t.index, name: t.name, hand: t.hand, resolvedHand: t.resolvedHand, noteCount: t.noteCount })),
  };
}

export function createApi(c: Controller) {
  let lastExport: LastExport | null = null;
  let exporting = false;
  const emit = (name: string, detail?: unknown) => window.dispatchEvent(new CustomEvent(name, { detail }));

  const baseName = () => c.getSong().fileName.replace(/\.(mid|midi)$/i, "");

  const loadBytes = (bytes: Uint8Array, name: string) => {
    const s = loadCustom(bytes, name);
    c.adopt(s);
    emit("fahhmidi-song-loaded", songInfo(s));
    return { song: songInfo(s), manifest: buildManifest(s, c.getDoc().video) };
  };

  const setSettings = (patch: unknown) => {
    const r = c.patch(typeof patch === "string" ? parseSettingsInput(patch) : patch);
    return { applied: r.applied, rejected: r.rejected };
  };

  const exportSettings = (o: { pretty?: boolean; onlyChanged?: boolean } = {}) => {
    const doc = c.getDoc();
    const file = exportDocument(doc);
    if (o.onlyChanged) {
      const slim: Record<string, unknown> = {};
      for (const p of changedPaths(doc)) setByPath(slim, p, getByPath(doc, p));
      (file as unknown as { settings: unknown }).settings = slim;
    }
    return JSON.stringify(file, null, o.pretty === false ? 0 : 2);
  };

  type FrameOpts = { frame?: number; time?: number; width?: number; height?: number; type?: string; quality?: number };
  const renderFrame = (o: FrameOpts = {}) => {
    const doc = c.getDoc();
    const sync: SyncConfig = doc.video;
    const w = Math.max(320, Math.round(o.width ?? sync.width)) & ~1;
    const h = Math.max(240, Math.round(o.height ?? sync.height)) & ~1;
    const cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext("2d", { alpha: false })!;
    const t = o.time !== undefined ? o.time : midiTimeOfFrame(o.frame ?? 0, sync);
    drawFrame(ctx, c.getSong(), t, doc.render, { width: w, height: h, dpr: 1, hitEps: 0.5 / sync.fps });
    return cv.toDataURL(o.type ?? "image/png", o.quality);
  };

  const api = {
    app: APP_NAME,
    version: APP_VERSION,
    /** true once fonts are loaded and any ?settingsUrl / ?midiUrl startup tasks finished */
    isReady: () => c.isReady(),
    isAutomation: () => c.automation,

    /* ------------------------------ state ------------------------------ */
    getState() {
      const doc = c.getDoc();
      const p = c.player;
      return {
        app: APP_NAME,
        version: APP_VERSION,
        ready: c.isReady(),
        automation: c.automation,
        song: songInfo(c.getSong()),
        transport: { midiTime: p.t, playing: p.playing, videoFrame: p.snapshot.frame, totalFrames: totalFrames(c.getSong(), doc.video), speed: p.speed },
        audio: { ...p.audio.getStatus() },
        video: { ...doc.video },
        exporting,
        changedSettings: changedPaths(doc),
      };
    },

    /* ----------------------------- settings ----------------------------- */
    /** Machine-readable description of EVERY setting (path, type, range, default, options…). */
    listSettings: () =>
      SCHEMA.map((f) => ({ path: f.path, type: f.type, label: f.label, group: f.group, hint: f.hint ?? null, default: f.def, min: f.min ?? null, max: f.max ?? null, step: f.step ?? null, unit: f.unit ?? null, options: f.options?.map((o) => o.value) ?? null })),
    getDefaults: () => JSON.parse(JSON.stringify(DEFAULTS)) as AllSettings,
    getSettings: () => JSON.parse(JSON.stringify(c.getDoc())) as AllSettings,
    /** Deep-merge a (partial) settings object. Unknown / invalid keys are reported, never thrown. */
    setSettings,
    /** set("keys.widthScale", 1.4)  |  set("render.colors.rightHand", "#ff00aa") */
    set: (path: string, value: unknown) => {
      const full = resolvePath(path);
      if (!full) throw new Error(`Unknown setting “${path}”. Call FahhMIDI.listSettings() for all valid paths.`);
      const r = c.patch({ [full]: value });
      if (r.rejected.length) throw new Error(`“${full}”: ${r.rejected[0].reason}`);
      return getByPath(c.getDoc(), full);
    },
    get: (path: string) => {
      const full = resolvePath(path);
      if (!full) throw new Error(`Unknown setting “${path}”.`);
      return getByPath(c.getDoc(), full);
    },
    /** Reset one path, a group prefix ("render.glow"), or everything when omitted. */
    resetSettings: (path?: string) => {
      if (!path) return c.reset();
      const prefix = path.endsWith(".") ? path : path;
      const hits = SCHEMA.filter((f) => f.path === prefix || f.path.startsWith(prefix + ".") || f.path.startsWith("render." + prefix + ".") || f.path === "render." + prefix).map((f) => f.path);
      if (!hits.length) throw new Error(`Nothing matches “${path}”.`);
      return c.reset(hits);
    },
    /** The settings file as a JSON string (same format as the Export button). */
    exportSettings,
    /** Import a settings file: JSON string, parsed object, or flat { "path": value } map. */
    importSettings: (input: unknown) => {
      const r = c.patch(parseSettingsInput(input));
      return { applied: r.applied.length, appliedPaths: r.applied, rejected: r.rejected };
    },
    /** Triggers a browser download of the settings JSON (for manual use; scripts should use exportSettings()). */
    downloadSettings: (fileName = "fahh-midi-settings.json") => {
      downloadBlob(new Blob([exportSettings()], { type: "application/json" }), fileName);
      return fileName;
    },
    listPresets: () => THEME_PRESETS.map((p) => ({ id: p.id, label: p.label })),
    applyPreset: (id: string) => {
      const r = c.preset(id);
      if (r.rejected.length) throw new Error(`Unknown preset “${id}”. Available: ${THEME_PRESETS.map((p) => p.id).join(", ")}`);
      return { applied: r.applied.length };
    },

    /* ------------------------------ MIDI input ------------------------------ */
    listBuiltInSongs: () => REPERTOIRE.map((m) => ({ id: m.id, name: m.name, artist: m.artist ?? null })),
    loadBuiltInSong: (id: string) => {
      if (!BUILT_IN_IDS.includes(id)) throw new Error(`Unknown built-in song “${id}”. Available: ${BUILT_IN_IDS.join(", ")}`);
      const s = loadBuiltIn(id);
      c.adopt(s);
      emit("fahhmidi-song-loaded", songInfo(s));
      return songInfo(s);
    },
    loadMidiBase64: (b64: string, name = "automated.mid") => loadBytes(base64ToBytes(b64.replace(/^data:[^,]*,/, "")), name),
    loadMidiBytes: (bytes: Uint8Array | number[], name = "automated.mid") => loadBytes(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), name),
    loadMidiUrl: async (url: string, name?: string) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Could not download ${url} (HTTP ${res.status})`);
      return loadBytes(new Uint8Array(await res.arrayBuffer()), name ?? (decodeURIComponent(url.split("?")[0].split("/").pop() || "") || "downloaded.mid"));
    },
    getSongInfo: () => songInfo(c.getSong()),

    /* ------------------------------ harmony ------------------------------ */
    /** Every chord that is really played: time, symbol, tones, Roman numeral, confidence … (JSON-friendly). */
    getChords() {
      const song = c.getSong();
      return song.chords.map((ch) => ({
        time: +ch.start.toFixed(4),
        end: +ch.end.toFixed(4),
        measure: measureAt(song, ch.start),
        symbol: ch.symbol,
        root: ch.root,
        quality: ch.quality,
        bass: ch.bass,
        tones: ch.tones,
        roman: ch.roman,
        function: ch.fn,
        inversion: ch.inversion,
        confidence: ch.confidence,
        kind: ch.kind,
        hand: ch.hand,
        key: ch.key,
      }));
    },
    /** Key estimate + chord statistics + the first 32 chords as a progression. */
    getAnalysis() {
      const song = c.getSong();
      const key = song.key;
      return { ...summariseHarmony(song.chords, key), key: { name: key.name, tonicPitchClass: key.tonic, minor: key.minor, accidentals: key.sharps, confidence: +key.confidence.toFixed(3) }, keySignatureInFile: song.fileKeySig };
    },
    /** Name a chord from MIDI note numbers, e.g. identifyChord([60, 64, 67]) → C major. Null when it isn't a chord. */
    identifyChord(notes: number[], opts?: { sensitivity?: "strict" | "balanced" | "detailed" }) {
      if (!Array.isArray(notes) || notes.some((n) => !Number.isFinite(n))) throw new Error("identifyChord expects an array of MIDI note numbers");
      const ch = identifyChord(notes.map(Math.round), { chordSensitivity: opts?.sensitivity ?? c.getDoc().render.analysis.chordSensitivity });
      return ch ? { symbol: ch.symbol, spelled: ch.spelled, tones: ch.tones, quality: ch.quality, root: ch.root, bass: ch.bass, inversion: ch.inversion, confidence: ch.confidence } : null;
    },
    listChordQualities: () => ({ count: CHORD_LIBRARY_SIZE, qualities: CHORD_QUALITIES }),
    setTrackHand: (track: number, hand: "auto" | "L" | "R") => {
      if (!c.getSong().tracks[track]) throw new Error(`No voice ${track}`);
      c.setHand(track, hand);
    },

    /* ------------------------------ transport ------------------------------ */
    play: () => c.player.play(),
    pause: () => c.player.pause(),
    seekToVideoFrame: (f: number) => {
      c.player.seekFrame(f);
      c.player.drawNow();
      return { frame: f, midiTime: c.player.t };
    },
    seekToMidiTime: (t: number) => {
      c.player.pause();
      c.player.seek(t);
      c.player.drawNow();
      return { midiTime: c.player.t };
    },
    setZen: (v: boolean) => c.setZen(!!v),
    getSyncManifest: () => buildManifest(c.getSong(), c.getDoc().video),

    /* ------------------------------ pixels ------------------------------ */
    /** Pixels of the live canvas (depends on window size). Prefer renderFrame() for reproducible output. */
    getFramePixelsRGBA: () => {
      const cv = c.player.getCanvas();
      const ctx = cv?.getContext("2d");
      return cv && ctx ? ctx.getImageData(0, 0, cv.width, cv.height).data : new Uint8ClampedArray(0);
    },
    getFrameDataUrl: (type = "image/png") => c.player.getCanvas()?.toDataURL(type) ?? "",
    /** Renders any frame OFF-SCREEN at the export resolution – independent of the browser window. Returns a data URL. */
    renderFrame,
    /** Same as renderFrame but returns bare base64 (no "data:" prefix) – easiest to write to disk from Python. */
    renderFrameBase64: (o: FrameOpts = {}) => renderFrame(o).replace(/^data:[^,]*,/, ""),

    /* ------------------------------ video export ------------------------------ */
    /** Frame-exact silent MP4 via WebCodecs. download:false keeps it in memory – fetch it with readLastExportChunk(). */
    exportMp4: async (
      o: { fps?: number; width?: number; height?: number; leadInSeconds?: number; tailOutSeconds?: number; download?: boolean; onProgress?: (pct: number, frame: number, total: number) => void } = {},
    ) => {
      if (exporting) throw new Error("An export is already running.");
      const doc = c.getDoc();
      const sync: SyncConfig = {
        ...doc.video,
        ...(o.fps && { fps: o.fps }),
        ...(o.width && { width: o.width }),
        ...(o.height && { height: o.height }),
        ...(o.leadInSeconds !== undefined && { leadInSeconds: o.leadInSeconds }),
        ...(o.tailOutSeconds !== undefined && { tailOutSeconds: o.tailOutSeconds }),
      };
      exporting = true;
      try {
        const res = await exportWithEvents({ song: c.getSong(), settings: doc.render, sync, onProgress: (p) => o.onProgress?.(p.pct, p.frame, p.total) });
        const fileName = `${baseName()}.mp4`;
        if (res.blob) {
          lastExport = { blob: res.blob, fileName, bytes: res.blob.size };
          if (o.download !== false) downloadBlob(res.blob, fileName);
        }
        return { manifest: res.manifest, bytes: res.bytes, fileName };
      } finally {
        exporting = false;
      }
    },
    getLastExportInfo: (chunkBytes = 4 * 1024 * 1024) =>
      lastExport ? { fileName: lastExport.fileName, bytes: lastExport.bytes, chunkBytes, chunks: Math.ceil(lastExport.bytes / chunkBytes) } : null,
    readLastExportChunk: async (index: number, chunkBytes = 4 * 1024 * 1024) => {
      if (!lastExport) throw new Error("No export in memory. Call exportMp4({download:false}) first.");
      const buf = await lastExport.blob.slice(index * chunkBytes, (index + 1) * chunkBytes).arrayBuffer();
      return bytesToBase64(new Uint8Array(buf));
    },
    clearLastExport: () => {
      lastExport = null;
    },
    isExporting: () => exporting,
    webCodecsSupported: () => typeof VideoEncoder !== "undefined" && typeof VideoFrame !== "undefined",

    /* ------------------------------ audio ------------------------------ */
    audio: {
      status: () => ({ ...c.player.audio.getStatus() }),
      /** Resolves when the soundfont is fully downloaded & decoded (or it failed). */
      preload: async (timeoutMs = 60000) => ({ ...(await c.player.audio.whenReady(timeoutMs)) }),
    },

    /* ------------------------------ legacy names ------------------------------ */
    setRenderConfig: (cfg: unknown) => setSettings({ render: cfg }),
    setSyncConfig: (cfg: unknown) => setSettings({ video: cfg }),
    schemaPaths: () => Array.from(FIELD_BY_PATH.keys()),
  };
  return api;
}

export type FahhMidiApi = ReturnType<typeof createApi>;
