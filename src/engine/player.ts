import { AudioEngine, LOOKAHEAD } from "./audio";
import { analyseChords, analysisSignature, chordAt, formatTime, measureAt, pedalAt, tempoAt, type Chord, type NoteEvent, type Song } from "./midi";
import { drawFrame } from "./renderer";
import { DEFAULT_SETTINGS, DEFAULT_SYNC } from "./settings";
import { frameOfMidiTime, midiTimeOfFrame, totalFrames } from "./sync";
import type { AudioSettings, RenderSettings, SyncConfig } from "./types";

export interface PlayerSnapshot {
  t: number;
  playing: boolean;
  bpm: number;
  chord: Chord | null;
  measure: number;
  pedal: boolean;
  frame: number;
}

export interface LoopState {
  on: boolean;
  start: number;
  end: number;
}

/** Owns the transport clock, the live canvas and the audio scheduler. React reads it through subscribe()/getSnapshot(). */
export class Player {
  song: Song;
  settings: RenderSettings = DEFAULT_SETTINGS;
  sync: SyncConfig = DEFAULT_SYNC;
  t = 0;
  playing = false;
  speed = 1;
  loop: LoopState = { on: false, start: 1, end: 4 };
  practice = false;
  readonly audio = new AudioEngine();

  private canvas: HTMLCanvasElement | null = null;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private raf = 0;
  private last = 0;
  private dirty = true;
  private lastEmit = 0;
  private listeners = new Set<() => void>();
  private schedUntil = -Infinity;
  private skipUntil = -Infinity;
  snapshot: PlayerSnapshot;

  constructor(song: Song) {
    this.song = song;
    this.t = -this.sync.leadInSeconds;
    this.snapshot = this.makeSnapshot();
    this.loopFn = this.loopFn.bind(this);
    this.raf = requestAnimationFrame(this.loopFn);
  }

  /* ---- react binding ---- */
  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };
  getSnapshot = () => this.snapshot;

  private makeSnapshot(): PlayerSnapshot {
    const t = this.t;
    return {
      t,
      playing: this.playing,
      bpm: tempoAt(this.song, Math.max(0, t)).bpm,
      chord: chordAt(this.song, t),
      measure: measureAt(this.song, t),
      pedal: pedalAt(this.song, t),
      frame: frameOfMidiTime(t, this.sync),
    };
  }
  private emit() {
    this.snapshot = this.makeSnapshot();
    this.lastEmit = performance.now();
    this.listeners.forEach((l) => l());
  }

  /* ---- configuration ---- */
  attach(canvas: HTMLCanvasElement | null) {
    this.canvas = canvas;
    if (canvas && this.w) {
      canvas.width = Math.round(this.w * this.dpr);
      canvas.height = Math.round(this.h * this.dpr);
    }
    this.dirty = true;
  }
  setSize(w: number, h: number, dpr: number) {
    this.w = Math.max(320, Math.round(w));
    this.h = Math.max(200, Math.round(h));
    this.dpr = dpr;
    if (this.canvas) {
      this.canvas.width = Math.round(this.w * dpr);
      this.canvas.height = Math.round(this.h * dpr);
    }
    this.dirty = true;
  }
  setSong(song: Song) {
    this.song = song;
    this.playing = false;
    this.audio.stopAll(true);
    this.t = -this.sync.leadInSeconds;
    this.resetAudioPointer(this.t);
    this.dirty = true;
    this.emit();
  }
  configure(settings: RenderSettings, sync: SyncConfig) {
    const leadChanged = sync.leadInSeconds !== this.sync.leadInSeconds;
    this.settings = settings;
    this.sync = sync;
    // harmony analysis follows the Analysis settings (re-run only when they actually changed)
    if (this.song.analysisSig !== analysisSignature(settings.analysis)) analyseChords(this.song, settings.analysis);
    if (leadChanged && !this.playing && this.t < 0) this.t = -sync.leadInSeconds;
    this.dirty = true;
    this.emit();
  }
  setAudio(a: AudioSettings, autoload: boolean) {
    this.audio.setSettings(a, autoload);
  }
  refresh() {
    this.dirty = true;
    this.emit();
  }

  /* ---- audio scheduling ---- */
  private noteVisible(n: NoteEvent) {
    const a = this.audio.settings;
    if (!a || !a.followFilters) return true;
    const s = this.settings;
    const handOk = s.activeHandFilter === "both" || (s.activeHandFilter === "right" ? n.hand === "R" : n.hand === "L");
    return handOk && !s.mutedTracks.includes(n.track);
  }
  private lowerBound(t: number) {
    const ns = this.song.notes;
    let lo = 0;
    let hi = ns.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (ns[m].start < t) lo = m + 1;
      else hi = m;
    }
    return lo;
  }
  private resetAudioPointer(t: number) {
    this.schedUntil = t - 0.002;
    this.skipUntil = -Infinity;
  }
  private scheduleRange(from: number, to: number, nowMedia: number) {
    const a = this.audio;
    if (!a.enabled || !a.running || to <= from) return;
    const ns = this.song.notes;
    const lat = a.settings?.latency ?? 0;
    const pedal = a.settings?.honorPedal ?? true;
    const ctxNow = a.contextTime;
    for (let i = this.lowerBound(from); i < ns.length && ns[i].start < to; i++) {
      const n = ns[i];
      if (!this.noteVisible(n)) continue;
      const delay = (n.start - nowMedia) / this.speed + lat;
      const holdMedia = (pedal ? Math.max(n.end, n.sustainEnd) : n.end) - n.start;
      a.playNote(n, ctxNow + Math.max(0, delay), holdMedia / this.speed);
    }
  }
  /** Sound the notes struck at (about) time `t` immediately – used when stepping and in practice mode. */
  audition(t: number) {
    const a = this.audio;
    if (!a.enabled) return;
    a.unlock();
    this.scheduleRangeNow(t - 1e-4, t + 0.045);
  }
  private scheduleRangeNow(from: number, to: number) {
    const a = this.audio;
    if (!a.running) return;
    const ns = this.song.notes;
    const pedal = a.settings?.honorPedal ?? true;
    for (let i = this.lowerBound(from); i < ns.length && ns[i].start < to; i++) {
      const n = ns[i];
      if (!this.noteVisible(n)) continue;
      const holdMedia = (pedal ? Math.max(n.end, n.sustainEnd) : n.end) - n.start;
      a.playNote(n, a.contextTime, holdMedia / this.speed);
    }
  }

  /* ---- transport ---- */
  play() {
    if (this.playing) return;
    const end = this.song.duration + this.sync.tailOutSeconds;
    if (this.t >= end - 0.01) this.t = -this.sync.leadInSeconds;
    this.playing = true;
    this.last = performance.now();
    this.audio.unlock();
    this.schedUntil = Math.max(this.t - 0.002, this.skipUntil);
    this.emit();
  }
  pause() {
    if (!this.playing) return;
    this.playing = false;
    this.audio.stopAll(false);
    this.dirty = true;
    this.emit();
  }
  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }
  seek(t: number) {
    const end = this.song.duration + this.sync.tailOutSeconds;
    this.t = Math.max(-this.sync.leadInSeconds, Math.min(end, t));
    this.audio.stopAll(true);
    this.resetAudioPointer(this.t);
    this.dirty = true;
    this.emit();
  }
  seekFrame(frame: number) {
    this.pause();
    const f = Math.max(0, Math.min(totalFrames(this.song, this.sync) - 1, frame));
    this.seek(midiTimeOfFrame(f, this.sync));
  }
  stepFrames(n: number) {
    this.pause();
    const f = frameOfMidiTime(this.t, this.sync) + n;
    this.seekFrame(f);
  }
  stepNote(dir: 1 | -1) {
    this.pause();
    const ns = this.song.notes;
    const cur = this.t;
    let target: number | null = null;
    if (dir === 1) {
      for (const n of ns)
        if (n.start > cur + 0.002) {
          target = n.start;
          break;
        }
    } else {
      for (let i = ns.length - 1; i >= 0; i--)
        if (ns[i].start < cur - 0.002) {
          target = ns[i].start;
          break;
        }
    }
    if (target === null) return;
    this.seekFrame(frameOfMidiTime(target, this.sync));
    this.audition(target);
  }
  restart() {
    this.pause();
    this.seek(-this.sync.leadInSeconds);
  }
  setSpeed(v: number) {
    this.speed = Math.max(0.05, v);
  }
  setLoop(l: LoopState) {
    this.loop = l;
  }
  setPractice(v: boolean) {
    this.practice = v;
  }

  /* ---- drawing ---- */
  drawNow(ctx?: CanvasRenderingContext2D) {
    const c = ctx ?? this.canvas?.getContext("2d");
    if (!c || !this.w) return;
    drawFrame(c, this.song, this.t, this.settings, { width: this.w, height: this.h, dpr: this.dpr, hitEps: 0.5 / this.sync.fps });
    this.dirty = false;
  }
  getCanvas() {
    return this.canvas;
  }

  private nextNoteAfter(t: number): NoteEvent | null {
    const ns = this.song.notes;
    let lo = 0;
    let hi = ns.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (ns[m].start <= t + 1e-4) lo = m + 1;
      else hi = m;
    }
    return ns[lo] ?? null;
  }

  private loopFn(now: number) {
    this.raf = requestAnimationFrame(this.loopFn);
    if (this.playing) {
      const dt = Math.min(0.1, ((now - this.last) / 1000) * this.speed);
      this.last = now;
      let nt = this.t + dt;
      const song = this.song;
      const end = song.duration + this.sync.tailOutSeconds;
      let loopEndT = Infinity;
      if (this.loop.on && song.measures.length) {
        const a = song.measures[Math.max(0, Math.min(song.measures.length - 1, this.loop.start - 1))];
        const b = song.measures[this.loop.end]; // start of the measure after the loop end
        const aT = a.time;
        const bT = b ? b.time : song.duration;
        loopEndT = bT;
        if (nt >= bT) {
          nt = aT;
          this.audio.stopAll(false);
          this.schedUntil = aT - 0.002;
        }
      }
      let stopAtNote: NoteEvent | null = null;
      if (this.practice) {
        const n = this.nextNoteAfter(this.t);
        if (n && n.start <= nt + 1e-4 && nt >= this.t) {
          stopAtNote = n;
          nt = n.start;
        }
      }
      if (stopAtNote) {
        this.t = stopAtNote.start;
        this.playing = false;
        this.dirty = true;
        this.audio.stopAll(true);
        this.scheduleRangeNow(stopAtNote.start - 1e-4, stopAtNote.start + 0.045);
        this.skipUntil = stopAtNote.start + 0.0451;
        this.schedUntil = this.skipUntil;
        this.emit();
      } else if (nt >= end) {
        this.t = end;
        this.playing = false;
        this.dirty = true;
        this.audio.stopAll(false);
        this.emit();
      } else {
        this.t = nt;
        this.dirty = true;
        // audio look-ahead scheduling on the WebAudio clock
        if (this.audio.enabled && this.audio.running) {
          if (this.schedUntil < nt - 0.25) this.schedUntil = nt - 0.002; // recover after a stall
          let target = Math.min(nt + LOOKAHEAD * this.speed, loopEndT);
          if (this.practice) {
            const nx = this.nextNoteAfter(nt);
            if (nx) target = Math.min(target, nx.start);
          }
          const from = Math.max(this.schedUntil, this.skipUntil);
          if (target > from) {
            this.scheduleRange(from, target, nt);
            this.schedUntil = target;
          }
        }
        if (now - this.lastEmit > 66) this.emit();
      }
    }
    if (this.dirty) this.drawNow();
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.listeners.clear();
    this.audio.dispose();
  }
}

export { formatTime };
