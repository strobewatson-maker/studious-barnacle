/* ------------------------------------------------------------------ *
 *  Fahh MIDI · audio engine
 *  Streams a sampled soundfont from a public CDN (no audio is bundled),
 *  schedules notes on the WebAudio clock and degrades to silence when
 *  offline – nothing else in the app ever depends on it.
 *
 *  Sources
 *   · Salamander Grand Piano V3 (A. Holm, CC-BY 3.0) via Tone.js audio repo
 *   · FluidR3_GM via gleitz/midi-js-soundfonts
 * ------------------------------------------------------------------ */
import type { NoteEvent } from "./midi";
import type { AudioSettings } from "./types";

export type AudioState = "idle" | "loading" | "ready" | "error" | "off";

export interface AudioStatus {
  state: AudioState;
  progress: number; // 0..1
  instrument: string;
  label: string;
  message: string;
  loadedSamples: number;
}

interface Sample {
  midi: number;
  buf: AudioBuffer;
}
interface Bank {
  samples: Sample[]; // sorted by midi
  complete: boolean;
}

interface Voice {
  src: AudioBufferSourceNode;
  gain: GainNode;
  key: number;
  at: number;
}

/* ------------------------------ catalogue ------------------------------ */

const SALAMANDER_BASES = ["https://cdn.jsdelivr.net/gh/Tonejs/audio@master/salamander/", "https://tonejs.github.io/audio/salamander/"];
const FLUID_BASES = ["https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/", "https://cdn.jsdelivr.net/gh/gleitz/midi-js-soundfonts@gh-pages/FluidR3_GM/"];

const FLUID_FILES: Record<string, string> = {
  "fluid-grand": "acoustic_grand_piano",
  "fluid-bright": "bright_acoustic_piano",
  "fluid-epiano": "electric_piano_1",
  "fluid-honky": "honkytonk_piano",
  "fluid-harpsichord": "harpsichord",
  "fluid-celesta": "celesta",
  "fluid-musicbox": "music_box",
  "fluid-vibraphone": "vibraphone",
  "fluid-marimba": "marimba",
  "fluid-harp": "orchestral_harp",
  "fluid-guitar": "acoustic_guitar_nylon",
  "fluid-strings": "string_ensemble_1",
  "fluid-organ": "church_organ",
};

const LABELS: Record<string, string> = {
  salamander: "Salamander Grand Piano",
  "fluid-grand": "FluidR3 Grand Piano",
  "fluid-bright": "FluidR3 Bright Piano",
  "fluid-epiano": "FluidR3 Electric Piano",
  "fluid-honky": "FluidR3 Honky-tonk",
  "fluid-harpsichord": "FluidR3 Harpsichord",
  "fluid-celesta": "FluidR3 Celesta",
  "fluid-musicbox": "FluidR3 Music Box",
  "fluid-vibraphone": "FluidR3 Vibraphone",
  "fluid-marimba": "FluidR3 Marimba",
  "fluid-harp": "FluidR3 Harp",
  "fluid-guitar": "FluidR3 Nylon Guitar",
  "fluid-strings": "FluidR3 Strings",
  "fluid-organ": "FluidR3 Organ",
  custom: "Custom soundfont",
};

/** Salamander sample file names: A0, C1, Ds1, Fs1, A1 … C8 */
const SAL_NAMES: { name: string; midi: number }[] = (() => {
  const out = [{ name: "A0", midi: 21 }];
  const pcs: [string, number][] = [["C", 0], ["Ds", 3], ["Fs", 6], ["A", 9]];
  for (let oct = 1; oct <= 7; oct++) for (const [n, pc] of pcs) out.push({ name: `${n}${oct}`, midi: 12 * (oct + 1) + pc });
  out.push({ name: "C8", midi: 108 });
  return out;
})();

const NOTE_PC: Record<string, number> = { C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11 };

function b64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

async function fetchWithFallback(urls: string[], as: "buffer" | "text", signal: AbortSignal): Promise<ArrayBuffer | string> {
  let lastErr: unknown = null;
  for (const url of urls) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(url, { signal, mode: "cors", cache: "force-cache" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return as === "buffer" ? await res.arrayBuffer() : await res.text();
      } catch (e) {
        if ((e as Error).name === "AbortError") throw e;
        lastErr = e;
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("network unavailable");
}

/* -------------------------------- engine -------------------------------- */

const LOOKAHEAD_MEDIA_SECONDS = 0.18;
const MAX_VOICES = 110;

export class AudioEngine {
  private s: AudioSettings | null = null;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private wet: GainNode | null = null;
  private conv: ConvolverNode | null = null;
  private irSize = 0;
  private voices = new Set<Voice>();
  private banks = new Map<string, Bank>();
  private loading = new Map<string, Promise<void>>();
  private abort: AbortController | null = null;
  private listeners = new Set<() => void>();
  private onlineHook = false;
  status: AudioStatus = { state: "idle", progress: 0, instrument: "salamander", label: LABELS.salamander, message: "", loadedSamples: 0 };

  /* ---- react binding ---- */
  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };
  getStatus = () => this.status;
  private setStatus(p: Partial<AudioStatus>) {
    this.status = { ...this.status, ...p };
    this.listeners.forEach((l) => l());
  }

  /* ---- settings ---- */
  get enabled() {
    return !!this.s?.enabled && (this.s?.volume ?? 0) > 0;
  }
  get settings() {
    return this.s;
  }

  setSettings(next: AudioSettings, autoload: boolean) {
    const prev = this.s;
    this.s = next;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(next.enabled ? next.volume : 0, this.ctx.currentTime, 0.02);
    if (this.wet && this.ctx) this.wet.gain.setTargetAtTime(next.reverb, this.ctx.currentTime, 0.05);
    if (this.conv && Math.abs(this.irSize - next.reverbSize) > 0.05) this.buildImpulse();
    const key = this.bankKey();
    if (!next.enabled) {
      this.stopAll(true);
      this.setStatus({ state: "off", message: "Audio is switched off" });
      return;
    }
    const changed = !prev || prev.instrument !== next.instrument || (next.instrument === "custom" && prev.customUrl !== next.customUrl) || !prev.enabled;
    if (changed) {
      this.stopAll(true);
      this.setStatus({ instrument: next.instrument, label: LABELS[next.instrument] ?? next.instrument, state: this.banks.get(key)?.complete ? "ready" : "idle", progress: this.banks.get(key)?.complete ? 1 : 0, message: "" });
      if (autoload) void this.load();
    }
  }

  private bankKey() {
    const s = this.s;
    if (!s) return "salamander";
    return s.instrument === "custom" ? `custom:${s.customUrl.trim()}` : s.instrument;
  }

  /* ---- context ---- */
  private ensureCtx(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) {
      this.setStatus({ state: "error", message: "This browser has no WebAudio support." });
      return null;
    }
    const ctx = new AC({ latencyHint: "interactive" });
    const master = ctx.createGain();
    master.gain.value = this.s?.enabled ? (this.s?.volume ?? 0.8) : 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 18;
    comp.ratio.value = 3.5;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    master.connect(comp);
    comp.connect(ctx.destination);
    const conv = ctx.createConvolver();
    const wet = ctx.createGain();
    wet.gain.value = this.s?.reverb ?? 0.12;
    conv.connect(wet);
    wet.connect(master);
    this.ctx = ctx;
    this.master = master;
    this.conv = conv;
    this.wet = wet;
    this.buildImpulse();
    return ctx;
  }

  private buildImpulse() {
    const ctx = this.ctx;
    if (!ctx || !this.conv) return;
    const size = this.s?.reverbSize ?? 2.2;
    const len = Math.max(1, Math.floor(ctx.sampleRate * size));
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      let seed = 1337 + c * 7919;
      for (let i = 0; i < len; i++) {
        seed = (seed * 1664525 + 1013904223) >>> 0; // deterministic noise
        const n = seed / 4294967296 * 2 - 1;
        d[i] = n * Math.pow(1 - i / len, 2.6);
      }
    }
    this.conv.buffer = ir;
    this.irSize = size;
  }

  /** Call from a user gesture (play button / key press) so browsers allow sound. */
  unlock() {
    if (!this.s?.enabled) return;
    const ctx = this.ensureCtx();
    if (ctx && ctx.state === "suspended") void ctx.resume().catch(() => undefined);
    if (this.status.state === "idle" || this.status.state === "error") void this.load();
  }

  /* ---- loading ---- */
  load(): Promise<void> {
    const key = this.bankKey();
    const existing = this.loading.get(key);
    if (existing) return existing;
    if (this.banks.get(key)?.complete) {
      this.setStatus({ state: "ready", progress: 1, message: "" });
      return Promise.resolve();
    }
    const p = this.doLoad(key).finally(() => this.loading.delete(key));
    this.loading.set(key, p);
    return p;
  }

  private async doLoad(key: string) {
    const s = this.s;
    if (!s || !s.enabled) return;
    const ctx = this.ensureCtx();
    if (!ctx) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      this.setStatus({ state: "error", progress: 0, message: "Offline — playing silently. Audio loads automatically when you reconnect." });
      this.hookOnline();
      return;
    }
    this.abort?.abort();
    const ac = new AbortController();
    this.abort = ac;
    const bank: Bank = this.banks.get(key) ?? { samples: [], complete: false };
    this.banks.set(key, bank);
    this.setStatus({ state: "loading", progress: 0.02, message: "", loadedSamples: bank.samples.length, label: LABELS[s.instrument] ?? "Soundfont", instrument: s.instrument });
    const stale = () => this.bankKey() !== key;
    const addSample = (midi: number, buf: AudioBuffer) => {
      if (bank.samples.some((x) => x.midi === midi)) return;
      bank.samples.push({ midi, buf });
      bank.samples.sort((a, b) => a.midi - b.midi);
    };
    try {
      if (s.instrument === "salamander" || (s.instrument === "custom" && !/\.js(\?.*)?$/i.test(s.customUrl.trim()))) {
        const bases = s.instrument === "salamander" ? SALAMANDER_BASES : [s.customUrl.trim().replace(/\/?$/, "/")];
        if (s.instrument === "custom" && !/^https?:\/\//i.test(bases[0])) throw new Error("Custom soundfont URL must start with http:// or https://");
        let done = 0;
        const queue = SAL_NAMES.filter((n) => !bank.samples.some((x) => x.midi === n.midi));
        const total = SAL_NAMES.length;
        done = total - queue.length;
        let failed = 0;
        const worker = async () => {
          while (queue.length) {
            const n = queue.shift()!;
            try {
              const data = (await fetchWithFallback(bases.map((b) => `${b}${n.name}.mp3`), "buffer", ac.signal)) as ArrayBuffer;
              const buf = await ctx.decodeAudioData(data);
              addSample(n.midi, buf);
            } catch (e) {
              if ((e as Error).name === "AbortError") throw e;
              failed++;
            }
            done++;
            if (!stale()) this.setStatus({ progress: done / total, loadedSamples: bank.samples.length });
          }
        };
        await Promise.all(Array.from({ length: 6 }, worker));
        if (failed > 0 && bank.samples.length === 0) throw new Error("network");
        bank.complete = failed === 0;
      } else {
        const file = FLUID_FILES[s.instrument];
        const urls = s.instrument === "custom" ? [s.customUrl.trim()] : FLUID_BASES.map((b) => `${b}${file}-mp3.js`);
        if (!file && !/^https?:\/\//i.test(urls[0])) throw new Error("Custom soundfont URL must start with http:// or https://");
        this.setStatus({ progress: 0.08 });
        const text = (await fetchWithFallback(urls, "text", ac.signal)) as string;
        this.setStatus({ progress: 0.35 });
        const re = /"([A-G][b#]?)(-?\d)"\s*:\s*"data:audio\/[a-z0-9.+-]+;base64,([^"]+)"/g;
        const entries: { midi: number; b64: string }[] = [];
        for (let m = re.exec(text); m; m = re.exec(text)) {
          const pc = NOTE_PC[m[1]];
          if (pc === undefined) continue;
          entries.push({ midi: 12 * (Number(m[2]) + 1) + pc, b64: m[3] });
        }
        if (!entries.length) throw new Error("That file doesn’t look like a midi-js soundfont.");
        let i = 0;
        for (const e of entries) {
          if (ac.signal.aborted) throw new DOMException("aborted", "AbortError");
          try {
            addSample(e.midi, await ctx.decodeAudioData(b64ToArrayBuffer(e.b64)));
          } catch {
            /* skip an undecodable sample */
          }
          i++;
          if (i % 4 === 0 && !stale()) this.setStatus({ progress: 0.35 + 0.65 * (i / entries.length), loadedSamples: bank.samples.length });
        }
        bank.complete = bank.samples.length > 0;
      }
      if (!stale()) this.setStatus({ state: bank.samples.length ? "ready" : "error", progress: 1, loadedSamples: bank.samples.length, message: bank.samples.length ? "" : "No samples could be decoded." });
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      if (!stale()) {
        const offline = e instanceof TypeError || /network|fetch|HTTP/i.test((e as Error).message);
        this.setStatus({
          state: bank.samples.length ? "ready" : "error",
          message: offline ? "Couldn’t reach the soundfont server — playing silently. Everything else works normally." : (e as Error).message,
        });
        if (offline) this.hookOnline();
      }
    }
  }

  private hookOnline() {
    if (this.onlineHook) return;
    this.onlineHook = true;
    window.addEventListener(
      "online",
      () => {
        this.onlineHook = false;
        if (this.s?.enabled) void this.load();
      },
      { once: true },
    );
  }

  /** Resolves when the current soundfont is fully loaded (or loading failed). */
  async whenReady(timeoutMs = 60000): Promise<AudioStatus> {
    const t0 = performance.now();
    if (this.s?.enabled) void this.load();
    while (this.status.state === "loading" && performance.now() - t0 < timeoutMs) await new Promise((r) => setTimeout(r, 80));
    const p = this.loading.get(this.bankKey());
    if (p) await Promise.race([p, new Promise((r) => setTimeout(r, Math.max(0, timeoutMs - (performance.now() - t0))))]);
    return this.status;
  }

  /* ---- playback ---- */
  get contextTime() {
    return this.ctx?.currentTime ?? 0;
  }
  get running() {
    return !!this.ctx && this.ctx.state === "running";
  }

  /** Schedule one note. `when` is in AudioContext time; `hold` is real seconds until release. */
  playNote(n: NoteEvent, when: number, hold: number) {
    const s = this.s;
    const ctx = this.ctx;
    const bank = this.banks.get(this.bankKey());
    if (!s || !s.enabled || !ctx || !this.master || !this.conv || !bank || !bank.samples.length || ctx.state !== "running") return;
    const midi = n.midi + s.transpose;
    // nearest sample
    let best = bank.samples[0];
    let bd = Math.abs(best.midi - midi);
    for (const sm of bank.samples) {
      const d = Math.abs(sm.midi - midi);
      if (d < bd) {
        best = sm;
        bd = d;
      }
    }
    if (this.voices.size >= MAX_VOICES) {
      let oldest: Voice | null = null;
      for (const v of this.voices) if (!oldest || v.at < oldest.at) oldest = v;
      if (oldest) this.killVoice(oldest, ctx.currentTime, 0.03);
    }
    const t0 = Math.max(when, ctx.currentTime);
    const src = ctx.createBufferSource();
    src.buffer = best.buf;
    src.playbackRate.value = Math.pow(2, (midi - best.midi) / 12);
    const g = ctx.createGain();
    const vel = Math.pow(Math.max(1, n.vel) / 127, s.velocityCurve) * 0.62;
    g.gain.setValueAtTime(vel, t0);
    const rel = Math.max(0.02, s.release);
    const tEnd = t0 + Math.max(0.03, hold);
    g.gain.setValueAtTime(vel, tEnd);
    g.gain.setTargetAtTime(0, tEnd, rel / 3);
    src.connect(g);
    g.connect(this.master);
    if (s.reverb > 0) g.connect(this.conv);
    src.start(t0);
    src.stop(tEnd + rel * 1.6 + 0.05);
    const v: Voice = { src, gain: g, key: n.key, at: t0 };
    this.voices.add(v);
    src.onended = () => {
      this.voices.delete(v);
      try {
        g.disconnect();
      } catch {
        /* already disconnected */
      }
    };
  }

  private killVoice(v: Voice, at: number, fade: number) {
    try {
      v.gain.gain.cancelScheduledValues(at);
      v.gain.gain.setTargetAtTime(0, at, fade / 3);
      v.src.stop(at + fade * 1.6 + 0.02);
    } catch {
      /* already stopped */
    }
  }

  /** Silence everything. `hard` = quick fade, otherwise a natural release. */
  stopAll(hard: boolean) {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const v of this.voices) this.killVoice(v, now, hard ? 0.04 : Math.max(0.1, (this.s?.release ?? 0.35) * 0.5));
  }

  dispose() {
    this.abort?.abort();
    this.stopAll(true);
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.listeners.clear();
  }
}

export const LOOKAHEAD = LOOKAHEAD_MEDIA_SECONDS;
