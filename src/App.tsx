import { AlertTriangle, CheckCircle2, FileMusic, Minimize2, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createApi, type Controller } from "./engine/automation";
import { analyseSong, type Song, type TrackHand } from "./engine/midi";
import { Player } from "./engine/player";
import {
  DEFAULTS,
  applyPatch,
  applyPreset,
  exportJson,
  freshDefaults,
  loadPersisted,
  parseSettingsInput,
  savePersisted,
  setByPath,
  type PatchResult,
} from "./engine/settings";
import { loadBuiltIn, loadCustom } from "./engine/songs";
import { downloadBlob } from "./engine/sync";
import { applyUiTheme } from "./engine/theme";
import type { AllSettings, RenderSettings, SyncConfig } from "./engine/types";
import { ExportModal } from "./ui/ExportModal";
import { Header, Transport, type PanelId } from "./ui/chrome";
import { RepertoirePanel, SyncPanel, TracksPanel } from "./ui/panels";
import { HarmonyPanel } from "./ui/HarmonyPanel";
import { SettingsPanel } from "./ui/SettingsPanel";
import { cn } from "./utils/cn";

/* ------------------------------ startup helpers ------------------------------ */

declare global {
  interface Window {
    FAHH_MIDI_CONFIG?: unknown;
    FAHH_MIDI_AUTOMATION?: boolean;
    FahhMIDI?: unknown;
    Clavier?: unknown;
    MidianoAncientAPI?: unknown;
  }
}

const LEGACY_PARAMS: Record<string, string> = {
  colormode: "render.colorMode",
  notelabel: "render.noteLabelMode",
  keylabel: "render.keyLabelMode",
  fps: "video.fps",
  width: "video.width",
  height: "video.height",
  leadin: "video.leadInSeconds",
  tailout: "video.tailOutSeconds",
  speed: "playback.speed",
};

function isAutomation(params: URLSearchParams) {
  return params.get("automation") === "1" || window.FAHH_MIDI_AUTOMATION === true || (typeof navigator !== "undefined" && navigator.webdriver === true);
}

function decodeSettingsParam(raw: string): unknown {
  const t = raw.trim();
  if (t.startsWith("{")) return JSON.parse(t);
  const b64 = t.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(decodeURIComponent(escape(atob(b64))));
}

function buildInitialDoc(params: URLSearchParams, automation: boolean): { doc: AllSettings; warnings: string[] } {
  let doc = freshDefaults();
  const warnings: string[] = [];
  const apply = (patch: unknown, label: string) => {
    try {
      const r = applyPatch(doc, parseSettingsInput(patch));
      doc = r.doc;
      if (r.rejected.length) warnings.push(`${label}: ignored ${r.rejected.length} (${r.rejected.slice(0, 3).map((x) => x.path).join(", ")})`);
    } catch (e) {
      warnings.push(`${label}: ${(e as Error).message}`);
    }
  };
  // Automation runs are deterministic: never read the visitor's saved preferences.
  if (!automation) {
    const saved = loadPersisted();
    if (saved) apply(saved, "saved settings");
  }
  if (window.FAHH_MIDI_CONFIG) apply(window.FAHH_MIDI_CONFIG, "FAHH_MIDI_CONFIG");
  const flat: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(LEGACY_PARAMS)) if (params.has(k)) flat[v] = params.get(k);
  if (params.get("autozoom") === "1") flat["render.autoZoomRange"] = true;
  params.forEach((v, k) => {
    if (k.startsWith("s.")) {
      let val: unknown = v;
      try {
        val = JSON.parse(v);
      } catch {
        /* keep raw string */
      }
      flat[k.slice(2)] = val;
    }
  });
  if (Object.keys(flat).length) apply(flat, "URL parameters");
  const sp = params.get("settings");
  if (sp) {
    try {
      apply(decodeSettingsParam(sp), "settings parameter");
    } catch {
      warnings.push("The ?settings= parameter wasn’t valid JSON / base64 JSON.");
    }
  }
  return { doc, warnings };
}

function initialSong(id: string | null): Song {
  try {
    return loadBuiltIn(id ?? "bach_846", true);
  } catch {
    return loadBuiltIn("bach_846", true);
  }
}

function pushToPlayer(player: Player, d: AllSettings, autoload: boolean) {
  player.configure(d.render, d.video);
  player.setSpeed(d.playback.speed);
  player.setPractice(d.playback.practice);
  const end = Math.max(d.playback.loopStart, d.playback.loopEnd);
  player.setLoop({ on: d.playback.loopOn, start: d.playback.loopStart, end: Math.min(end, Math.max(1, player.song.measures.length)) });
  player.setAudio(d.audio, autoload);
}

/* ------------------------------ stage ------------------------------ */

function Stage({ player }: { player: Player }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    player.attach(canvas.current);
    const measure = () => {
      const r = wrap.current!.getBoundingClientRect();
      player.setSize(r.width, r.height, Math.min(2, window.devicePixelRatio || 1));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(wrap.current!);
    window.addEventListener("resize", measure); // also fires when moving between monitors / zooming (devicePixelRatio)
    measure();
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      player.attach(null);
    };
  }, [player]);
  return (
    <div ref={wrap} className="absolute inset-0 overflow-hidden bg-ink-950">
      <canvas ref={canvas} id="fahh-midi-canvas" data-testid="stage-canvas" className="absolute inset-0 h-full w-full" />
    </div>
  );
}

/* ------------------------------ app ------------------------------ */

type Notice = { text: string; kind: "error" | "info" };

export default function App() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const automation = useMemo(() => isAutomation(params), [params]);
  const [song, setSong] = useState<Song>(() => initialSong(params.get("song")));
  const [rev, setRev] = useState(0);
  const [boot] = useState(() => buildInitialDoc(params, automation));
  const [doc, setDoc] = useState<AllSettings>(boot.doc);
  const [panel, setPanel] = useState<PanelId>("none");
  const [zen, setZen] = useState(params.get("zen") === "1");
  const [exportOpen, setExportOpen] = useState(params.get("autoexport") === "1");
  const [notice, setNotice] = useState<Notice | null>(boot.warnings.length ? { text: boot.warnings.join(" · "), kind: "error" } : null);
  const [dragging, setDragging] = useState(false);

  const docRef = useRef(doc);
  const songRef = useRef(song);
  songRef.current = song;
  const zenRef = useRef(zen);
  zenRef.current = zen;
  const readyRef = useRef(false);
  const persistTimer = useRef(0);

  const playerRef = useRef<Player | null>(null);
  if (!playerRef.current) {
    const p = new Player(song);
    pushToPlayer(p, doc, !automation);
    playerRef.current = p;
  }
  const player = playerRef.current;
  const snap = useSyncExternalStore(player.subscribe, player.getSnapshot);
  const audioStatus = useSyncExternalStore(player.audio.subscribe, player.audio.getStatus);

  /* --- the single settings commit path (UI, import, URL, API all go through here) --- */
  const commit = useCallback(
    (next: AllSettings) => {
      docRef.current = next;
      setDoc(next);
      pushToPlayer(player, next, !automation);
      if (!automation) {
        window.clearTimeout(persistTimer.current);
        persistTimer.current = window.setTimeout(() => savePersisted(docRef.current), 350);
      }
      window.dispatchEvent(new CustomEvent("fahhmidi-settings-changed"));
    },
    [player, automation],
  );
  const patch = useCallback(
    (p: unknown, prefix = ""): PatchResult => {
      const r = applyPatch(docRef.current, p, prefix);
      if (r.applied.length) commit(r.doc);
      return r;
    },
    [commit],
  );
  const setSettings = useCallback((u: (s: RenderSettings) => RenderSettings) => commit({ ...docRef.current, render: u(docRef.current.render) }), [commit]);
  const setSync = useCallback((u: (s: SyncConfig) => SyncConfig) => commit({ ...docRef.current, video: u(docRef.current.video) }), [commit]);
  const resetSettings = useCallback(
    (paths?: string[]) => {
      if (!paths) {
        commit(freshDefaults());
        return docRef.current;
      }
      const p: Record<string, unknown> = {};
      const defs = DEFAULTS as unknown as Record<string, unknown>;
      for (const path of paths) setByPath(p, path, path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], defs));
      patch(p);
      return docRef.current;
    },
    [commit, patch],
  );
  const preset = useCallback(
    (id: string): PatchResult => {
      const r = applyPreset(docRef.current, id);
      if (r.applied.length) commit(r.doc);
      return r;
    },
    [commit],
  );

  useLayoutEffect(() => applyUiTheme(doc.ui), [doc.ui]);

  const showNotice = useCallback((text: string, kind: Notice["kind"] = "error") => setNotice({ text, kind }), []);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), notice.kind === "error" ? 8000 : 4500);
    return () => clearTimeout(id);
  }, [notice]);

  /* --- fonts must be ready before the canvas can use them --- */
  const fontsReady = useMemo(() => {
    const fonts = ["600 12px Inter", "700 12px Inter", "500 12px Inter", "italic 700 20px Cormorant", "italic 600 20px Cormorant", "700 20px Cormorant"];
    return Promise.race([Promise.all(fonts.map((f) => document.fonts.load(f))), new Promise((r) => setTimeout(r, 4000))]).then(() => player.refresh());
  }, [player]);

  /* --- loading songs --- */
  const adopt = useCallback(
    (s: Song) => {
      songRef.current = s;
      setSong(s);
      setRev((r) => r + 1);
      const d = docRef.current;
      player.setSong(s);
      commit({ ...d, render: { ...d.render, mutedTracks: [] }, playback: { ...d.playback, loopOn: false, loopStart: 1, loopEnd: Math.min(4, s.measures.length) } });
    },
    [player, commit],
  );
  const selectBuiltIn = useCallback(
    (id: string) => {
      try {
        adopt(loadBuiltIn(id));
        setPanel("none");
      } catch (e) {
        showNotice((e as Error).message);
      }
    },
    [adopt, showNotice],
  );

  const importSettingsText = useCallback(
    (text: string) => {
      const r = patch(parseSettingsInput(text));
      return { applied: r.applied.length, rejected: r.rejected };
    },
    [patch],
  );

  const loadFile = useCallback(
    async (file: File) => {
      try {
        if (/\.json$/i.test(file.name) || file.type === "application/json") {
          const r = importSettingsText(await file.text());
          showNotice(`Imported ${r.applied} setting${r.applied === 1 ? "" : "s"} from “${file.name}”${r.rejected.length ? ` · ${r.rejected.length} unrecognised entr${r.rejected.length === 1 ? "y" : "ies"} ignored` : ""}.`, r.rejected.length && !r.applied ? "error" : "info");
          return;
        }
        const s = loadCustom(new Uint8Array(await file.arrayBuffer()), file.name);
        adopt(s);
        window.dispatchEvent(new CustomEvent("fahhmidi-song-loaded", { detail: { fileName: file.name } }));
        setPanel("none");
      } catch (e) {
        showNotice(`Couldn’t read “${file.name}”: ${(e as Error).message}`);
      }
    },
    [adopt, importSettingsText, showNotice],
  );
  const fileInput = useRef<HTMLInputElement>(null);
  const settingsInput = useRef<HTMLInputElement>(null);

  /* --- drag & drop (.mid / .midi / settings .json) --- */
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files");
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth++;
      setDragging(true);
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const f = e.dataTransfer?.files?.[0];
      if (f) void loadFile(f);
    };
    window.addEventListener("dragover", over);
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, [loadFile]);

  /* --- keyboard --- */
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) return;
      if (el.getAttribute?.("role") === "slider" && (e.code === "ArrowLeft" || e.code === "ArrowRight")) return;
      if (exportOpen) return;
      if (e.code === "Space") {
        e.preventDefault();
        if (el instanceof HTMLButtonElement) el.blur();
        player.toggle();
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        if (e.shiftKey) player.stepNote(1);
        else player.stepFrames(1);
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        if (e.shiftKey) player.stepNote(-1);
        else player.stepFrames(-1);
      } else if (e.code === "KeyH") {
        e.preventDefault();
        setZen((z) => !z);
      } else if (e.code === "KeyM") {
        e.preventDefault();
        patch({ "audio.enabled": !docRef.current.audio.enabled });
      } else if (e.code === "Home") {
        e.preventDefault();
        player.restart();
      } else if (e.code === "Escape") setPanel("none");
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [player, exportOpen, patch]);

  /* --- hand reassignment --- */
  const onHand = useCallback(
    (track: number, hand: TrackHand) => {
      const s = songRef.current;
      s.tracks[track].hand = hand;
      analyseSong(s, docRef.current.render.analysis);
      setRev((r) => r + 1);
      player.refresh();
    },
    [player],
  );

  /* --- automation surface: window.FahhMIDI --- */
  useEffect(() => {
    const ctrl: Controller = {
      player,
      automation,
      isReady: () => readyRef.current,
      getDoc: () => docRef.current,
      patch,
      reset: resetSettings,
      preset,
      adopt,
      getSong: () => songRef.current,
      setHand: onHand,
      setZen: (v) => setZen(v),
      isZen: () => zenRef.current,
      notify: showNotice,
    };
    const api = createApi(ctrl);
    const w = window as unknown as Record<string, unknown>;
    w.FahhMIDI = api;
    // pre-rename aliases so existing scripts keep working
    w.Clavier = api;
    w.MidianoAncientAPI = api;

    let cancelled = false;
    void (async () => {
      try {
        const settingsUrl = params.get("settingsUrl");
        if (settingsUrl) {
          const res = await fetch(settingsUrl);
          if (!res.ok) throw new Error(`settingsUrl: HTTP ${res.status}`);
          const r = patch(parseSettingsInput(await res.text()));
          if (r.rejected.length) showNotice(`settingsUrl: ${r.rejected.length} unrecognised entries ignored`);
        }
        const midiUrl = params.get("midiUrl");
        if (midiUrl) await api.loadMidiUrl(midiUrl);
      } catch (e) {
        showNotice((e as Error).message);
      }
      await fontsReady;
      if (cancelled) return;
      readyRef.current = true;
      document.documentElement.dataset.fahhReady = "true";
      window.dispatchEvent(new CustomEvent("fahhmidi-ready", { detail: { automation } }));
    })();
    return () => {
      cancelled = true;
    };
  }, [player, automation, patch, resetSettings, preset, adopt, onHand, showNotice, params, fontsReady]);

  const togglePanel = (p: PanelId) => setPanel((cur) => (cur === p ? "none" : p));
  const r = doc.render;
  const loop = useMemo(() => ({ on: doc.playback.loopOn, start: doc.playback.loopStart, end: doc.playback.loopEnd }), [doc.playback.loopOn, doc.playback.loopStart, doc.playback.loopEnd]);
  const exportSettingsFile = () => {
    downloadBlob(new Blob([exportJson(docRef.current)], { type: "application/json" }), "fahh-midi-settings.json");
    showNotice("Settings exported as fahh-midi-settings.json", "info");
  };

  return (
    <div className="app-bg relative flex h-full flex-col overflow-hidden">
      {!zen && (
        <Header
          song={song}
          settings={r}
          setSettings={setSettings}
          panel={panel}
          togglePanel={togglePanel}
          onOpenFile={() => fileInput.current?.click()}
          onExport={() => setExportOpen(true)}
          onZen={() => setZen(true)}
        />
      )}

      <main className="relative min-h-0 flex-1">
        <Stage player={player} />

        {zen && (
          <button className="btn absolute right-3 top-3 z-40 !bg-ink-850/85 backdrop-blur" onClick={() => setZen(false)} title="Restore controls (H)">
            <Minimize2 size={14} className="text-brass-400" />
            Show studio bar
            <span className="kbd">H</span>
          </button>
        )}

        {!zen && panel === "repertoire" && <RepertoirePanel song={song} onSelect={selectBuiltIn} onOpenFile={() => fileInput.current?.click()} onClose={() => setPanel("none")} />}
        {!zen && panel === "tracks" && (
          <TracksPanel
            song={song}
            rev={rev}
            settings={r}
            setSettings={setSettings}
            onHand={onHand}
            loop={loop}
            setLoop={(l) => patch({ "playback.loopOn": l.on, "playback.loopStart": l.start, "playback.loopEnd": l.end })}
            onClose={() => setPanel("none")}
          />
        )}
        {!zen && panel === "settings" && (
          <SettingsPanel
            doc={doc}
            patch={patch}
            reset={resetSettings}
            preset={(id) => void preset(id)}
            onImportText={importSettingsText}
            onPickImportFile={() => settingsInput.current?.click()}
            onExport={exportSettingsFile}
            audio={audioStatus}
            onClose={() => setPanel("none")}
          />
        )}
        {!zen && panel === "harmony" && (
          <HarmonyPanel song={song} rev={rev} t={snap.t} analysis={r.analysis} patch={(p) => void patch(p)} onSeek={(t) => player.seek(t)} onNotify={(m) => showNotice(m, "info")} onClose={() => setPanel("none")} />
        )}
        {!zen && panel === "syncInspector" && <SyncPanel song={song} sync={doc.video} t={snap.t} colors={r.colors} onSeekFrame={(f) => player.seekFrame(f)} onClose={() => setPanel("none")} />}

        {notice && (
          <div role="status" className={cn("glass absolute left-1/2 top-4 z-40 flex max-w-[min(560px,92%)] -translate-x-1/2 animate-pop-in items-center gap-3 rounded-2xl px-4 py-3 text-[12.5px]", notice.kind === "error" ? "!border-red-400/30 text-red-100" : "!border-verdi-400/30 text-bone-100")}>
            {notice.kind === "error" ? <AlertTriangle size={17} className="flex-none text-red-300" /> : <CheckCircle2 size={17} className="flex-none text-verdi-300" />}
            <span className="flex-1">{notice.text}</span>
            <button className="text-bone-400 hover:text-bone-50" onClick={() => setNotice(null)} aria-label="Dismiss">
              <X size={15} />
            </button>
          </div>
        )}

        {dragging && (
          <div className="absolute inset-0 z-50 flex animate-fade-in items-center justify-center bg-ink-950/80 p-8 backdrop-blur-md">
            <div className="flex h-full max-h-[420px] w-full max-w-[760px] flex-col items-center justify-center gap-4 rounded-[32px] border-2 border-dashed border-brass-400/70 bg-brass-500/[0.06] shadow-[0_0_80px_-20px_rgb(var(--accent-rgb)/.6)]">
              <FileMusic size={56} className="text-brass-300" strokeWidth={1.4} />
              <div className="serif text-[34px] font-bold text-bone-50">Drop to load</div>
              <div className="text-[13px] text-bone-400">.mid / .midi files, or a Fahh MIDI settings .json · everything stays in your browser</div>
            </div>
          </div>
        )}
      </main>

      {!zen && (
        <Transport
          player={player}
          snap={snap}
          song={song}
          sync={doc.video}
          speed={doc.playback.speed}
          setSpeed={(v) => patch({ "playback.speed": v })}
          loopRange={loop}
          audio={doc.audio}
          audioStatus={audioStatus}
          onAudio={patch}
        />
      )}

      <input
        ref={fileInput}
        id="fahh-midi-file-input"
        data-testid="midi-file-input"
        type="file"
        accept=".mid,.midi,audio/midi,audio/x-midi,.json,application/json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void loadFile(f);
          e.target.value = "";
        }}
      />
      <input
        ref={settingsInput}
        id="fahh-midi-settings-input"
        data-testid="settings-file-input"
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void loadFile(f);
          e.target.value = "";
        }}
      />

      {exportOpen && <ExportModal song={song} settings={r} sync={doc.video} setSync={setSync} autoStart={params.get("autoexport") === "1"} onClose={() => setExportOpen(false)} />}
    </div>
  );
}
