/* ------------------------------------------------------------------ *
 *  Fahh MIDI · 88-key canvas renderer
 *  Deterministic: the picture is a pure function of (song, t, settings).
 *  Used both for the live view and the frame-exact MP4 exporter.
 *  Every colour / intensity / dimension comes from RenderSettings.
 * ------------------------------------------------------------------ */
import {
  SOLFEGE,
  SOLFEGE_FLAT,
  chordAt,
  firstVisibleIndex,
  isBlack,
  measureAt,
  noteName,
  pedalAt,
  tempoAt,
  type Chord,
  type NoteEvent,
  type Song,
} from "./midi";
import { ihash, keyDepressAt, type KeyNote, type PressParams } from "./keypress";
import { drawKeysPhysical, type PressView } from "./keyboard";
import type { ColorMode, ColorsStyle, PostStyle, RenderSettings } from "./types";

export const SERIF = '"Cormorant", "Iowan Old Style", "Palatino Linotype", Georgia, serif';
export const SANS = '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/* ------------------------------ canvas glue ------------------------------ */

type AnyCanvas = HTMLCanvasElement;
let canvasFactory: (w: number, h: number) => AnyCanvas = (w, h) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};
export function setCanvasFactory(f: (w: number, h: number) => AnyCanvas) {
  canvasFactory = f;
}

/* -------------------------------- colour -------------------------------- */

type RGB = [number, number, number];
const CACHE_CAP = 600;
const rgbCache = new Map<string, RGB>();
function toRgb(hex: string): RGB {
  let v = rgbCache.get(hex);
  if (!v) {
    const h = hex.replace("#", "");
    v = [parseInt(h.slice(0, 2), 16) || 0, parseInt(h.slice(2, 4), 16) || 0, parseInt(h.slice(4, 6), 16) || 0];
    if (rgbCache.size > CACHE_CAP) rgbCache.clear();
    rgbCache.set(hex, v);
  }
  return v;
}
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export function rgba(hex: string, a: number) {
  const [r, g, b] = toRgb(hex);
  return `rgba(${r},${g},${b},${clamp(a, 0, 1)})`;
}
const hx = (v: number) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0");
export function mix(a: string, b: string, t: number) {
  const A = toRgb(a);
  const B = toRgb(b);
  return `#${hx(A[0] + (B[0] - A[0]) * t)}${hx(A[1] + (B[1] - A[1]) * t)}${hx(A[2] + (B[2] - A[2]) * t)}`;
}
/** Multiply every channel – keeps hue, used to derive dark / light tones of a base colour. */
export function scaleHex(hex: string, f: number) {
  const [r, g, b] = toRgb(hex);
  return `#${hx(r * f)}${hx(g * f)}${hx(b * f)}`;
}
const shadeCache = new Map<string, string>();
export function lighten(hex: string, amt: number) {
  const k = hex + "L" + amt;
  let v = shadeCache.get(k);
  if (!v) {
    if (shadeCache.size > CACHE_CAP) shadeCache.clear();
    shadeCache.set(k, (v = mix(hex, "#ffffff", clamp(amt, 0, 1))));
  }
  return v;
}
export function darken(hex: string, amt: number) {
  const k = hex + "D" + amt;
  let v = shadeCache.get(k);
  if (!v) {
    if (shadeCache.size > CACHE_CAP) shadeCache.clear();
    shadeCache.set(k, (v = mix(hex, "#000000", clamp(amt, 0, 1))));
  }
  return v;
}
export function luminance(hex: string) {
  const [r, g, b] = toRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

export function noteColor(n: NoteEvent, mode: ColorMode, c: ColorsStyle): string {
  switch (mode) {
    case "finger":
      return c.finger[n.finger - 1] ?? c.rightHand;
    case "pitch":
      return c.pitch[n.midi % 12] ?? c.rightHand;
    case "colorblind":
      return n.hand === "R" ? c.colorblindRight : c.colorblindLeft;
    case "monochrome":
      return n.hand === "R" ? c.monoRight : c.monoLeft;
    default:
      return n.hand === "R" ? c.rightHand : c.leftHand;
  }
}

/* --------------------------- keyboard geometry --------------------------- */

export const WHITE_IDX: number[] = [];
{
  let w = 0;
  for (let k = 0; k < 88; k++) {
    if (isBlack(k + 21)) WHITE_IDX.push(w - 1);
    else WHITE_IDX.push(w++);
  }
}
export const BLACK_OFFSET: Record<number, number> = { 1: -0.075, 3: 0.075, 6: -0.1, 8: 0, 10: 0.1 };

export interface Layout {
  W: number;
  H: number;
  u: number;
  laneH: number;
  railH: number;
  keysTop: number;
  keysH: number;
  frontY: number;
  frontH: number;
  miniY: number;
  miniH: number;
  lo: number;
  hi: number;
  wkw: number;
  bkw: number;
  bkh: number;
  x0: number;
  kx: Float64Array; // left x of every key (white) / black key body
  kw: Float64Array; // width of every key
  key: string;
}

function computeLayout(W: number, H: number, s: RenderSettings, song: Song): Layout {
  const u = clamp(H / 900, 0.85, 2.6) * s.layout.scale;
  let lo = 0;
  let hi = 87;
  if (s.autoZoomRange) {
    lo = song.minKey;
    hi = song.maxKey;
    if (isBlack(lo + 21)) lo--;
    if (isBlack(hi + 21)) hi++;
    // at least ~3 octaves, rounded out to whole white keys
    while (hi - lo < 35) {
      if (lo > 0) lo--;
      if (hi < 87) hi++;
      if (lo === 0 && hi === 87) break;
    }
    while (lo > 0 && isBlack(lo + 21)) lo--;
    while (hi < 87 && isBlack(hi + 21)) hi++;
    lo = Math.max(0, lo - 1);
    hi = Math.min(87, hi + 1);
    while (lo > 0 && isBlack(lo + 21)) lo--;
    while (hi < 87 && isBlack(hi + 21)) hi++;
  }
  const k = s.keys;
  const w0 = WHITE_IDX[lo];
  const whiteCount = WHITE_IDX[hi] - w0 + 1;
  const wkw = (W / whiteCount) * k.widthScale;
  const span = wkw * whiteCount;
  const x0 = (W - span) * (span > W ? 0.5 + clamp(k.panX, -1, 1) * 0.5 : 0.5);
  const bkw = wkw * k.blackWidthRatio;
  const railH = Math.round(14 * u * s.layout.railHeight);
  const frontH = Math.round(7 * u * s.layout.frontBoardHeight);
  const miniH = s.showKeyMinimap ? Math.round(34 * u * s.layout.minimapHeight) : 0;
  const maxKeys = Math.max(40, H - miniH - frontH - railH - H * 0.12);
  const keysH = Math.round(Math.min(maxKeys, clamp(H * k.heightRatio, 40 * u, H * 0.7)));
  const bkh = keysH * k.blackHeightRatio;
  const laneH = Math.max(24, H - miniH - frontH - keysH - railH);
  const kx = new Float64Array(88);
  const kw = new Float64Array(88);
  for (let i = 0; i < 88; i++) {
    const midi = i + 21;
    if (isBlack(midi)) {
      const off = s.acousticBlackKeyOffsets ? (BLACK_OFFSET[midi % 12] ?? 0) : 0;
      const centre = x0 + (WHITE_IDX[i] + 1 - w0) * wkw + off * wkw;
      kw[i] = bkw;
      kx[i] = centre - bkw / 2;
    } else {
      kw[i] = wkw;
      kx[i] = x0 + (WHITE_IDX[i] - w0) * wkw;
    }
  }
  const c = s.colors;
  const l = s.lines;
  const bgSig = [c.bgTop, c.bgMid, c.bgBottom, c.lamp, c.laneGuide, s.glow.lamp, l.blackLaneShade, l.whiteLaneAlt, l.vignetteTop, l.vignetteSide, l.guideAlphaC, l.guideAlphaF, l.guideWidth, s.finish.laneDepth, s.finish.middleCMarker].join(",");
  return {
    W,
    H,
    u,
    laneH,
    railH,
    keysTop: laneH + railH,
    keysH,
    frontY: laneH + railH + keysH,
    frontH,
    miniY: H - miniH,
    miniH,
    lo,
    hi,
    wkw,
    bkw,
    bkh,
    x0,
    kx,
    kw,
    key: `${W}x${H}|${lo}-${hi}|${laneH}|${x0.toFixed(2)}|${wkw.toFixed(3)}|${k.blackWidthRatio}|${u.toFixed(3)}|${s.acousticBlackKeyOffsets}|${s.showKeyLaneGuides}|${bgSig}`,
  };
}

/* ------------------------------ drawing helpers ------------------------------ */

export function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}
/** rect with only the bottom corners rounded */
export function rrBottom(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.closePath();
}

function setSpacing(ctx: CanvasRenderingContext2D, px: number) {
  const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  if ("letterSpacing" in c) c.letterSpacing = `${px}px`;
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  if (ctx.measureText(text).width <= maxW) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const m = (lo + hi + 1) >> 1;
    if (ctx.measureText(text.slice(0, m) + "…").width <= maxW) lo = m;
    else hi = m - 1;
  }
  return text.slice(0, Math.max(1, lo)).trimEnd() + "…";
}

// seeded hash → [0,1)
export function hash(n: number) {
  let x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  x -= Math.floor(x);
  return x;
}

/** first index whose `start` is >= t (chords are sorted by start) */
function lowerBoundStart(list: { start: number }[], t: number) {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (list[m].start < t) lo = m + 1;
    else hi = m;
  }
  return lo;
}

/* -------------------------------- textures -------------------------------- */

let feltPattern: CanvasPattern | null = null;
let woodPattern: CanvasPattern | null = null;
/** periodic 1-D value noise (period `per` lattice cells) from the integer hash */
function pnoise(x: number, per: number, seed: number) {
  const i = Math.floor(x);
  const f = x - i;
  const a = ihash((((i % per) + per) % per) * 7919 + seed * 104729);
  const b = ihash((((i + 1) % per + per) % per) * 7919 + seed * 104729);
  const t = f * f * (3 - 2 * f);
  return a + (b - a) * t;
}
function getFelt(ctx: CanvasRenderingContext2D) {
  if (feltPattern) return feltPattern;
  const N = 96;
  const c = canvasFactory(N, N);
  const g = c.getContext("2d")!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, N, N);
  const img = g.getImageData(0, 0, N, N);
  for (let i = 0; i < N * N; i++) {
    const x = i % N;
    const v = ihash(i * 3 + 1) * 70 + (x % 2 === 0 ? 10 : 0) + pnoise(x / 12, N / 12, 2) * 26;
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v * 0.9;
    img.data[i * 4 + 2] = v * 0.9;
    img.data[i * 4 + 3] = 70;
  }
  g.putImageData(img, 0, 0);
  // loose fibres of the baize: short, slightly curved strokes in every direction (wrapped so the tile repeats)
  g.lineWidth = 0.8;
  for (let i = 0; i < 260; i++) {
    const x = ihash(i * 5 + 1) * N;
    const y = ihash(i * 5 + 2) * N;
    const a = ihash(i * 5 + 3) * Math.PI * 2;
    const len = 2 + ihash(i * 5 + 4) * 5;
    g.strokeStyle = ihash(i * 5 + 5) > 0.55 ? "rgba(255,225,225,0.16)" : "rgba(0,0,0,0.22)";
    for (const ox of [-N, 0, N]) {
      for (const oy of [-N, 0, N]) {
        g.beginPath();
        g.moveTo(x + ox, y + oy);
        g.quadraticCurveTo(x + ox + Math.cos(a + 0.5) * len * 0.5, y + oy + Math.sin(a + 0.5) * len * 0.5, x + ox + Math.cos(a) * len, y + oy + Math.sin(a) * len);
        g.stroke();
      }
    }
  }
  feltPattern = ctx.createPattern(c, "repeat");
  return feltPattern;
}
/** anisotropic wood: long flowing grain lines, growth rings that drift, pores, a clear-coat sheen row */
function woodTile(vertical: boolean) {
  const LEN = 512;
  const T = 48;
  const c = canvasFactory(vertical ? T : LEN, vertical ? LEN : T);
  const g = c.getContext("2d")!;
  const img = g.createImageData(c.width, c.height);
  for (let a = 0; a < LEN; a++) {
    for (let b = 0; b < T; b++) {
      const warp = pnoise(a / 140, LEN / 140, 7) * 5;
      const ring = pnoise((b + warp) / 3.1, T / 3.1 + 100000, 11);
      const fine = ihash(b * 31 + 5) * 0.5 + pnoise(a / 18 + b * 0.7, LEN / 18, 3) * 0.5;
      let dark = Math.pow(ring, 2.2) * 0.2 + fine * 0.07;
      let r = 40;
      let gg = 20;
      let bb = 4;
      let al = dark;
      if (ring < 0.45) {
        r = 255;
        gg = 205;
        bb = 140;
        al = (0.45 - ring) * 0.85 * (0.45 + fine);
      }
      if (ihash(a * 13 + b * 97 + 4) > 0.9965) {
        r = 20;
        gg = 8;
        bb = 0;
        al = 0.3;
      }
      const x = vertical ? b : a;
      const y = vertical ? a : b;
      const i = (y * c.width + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = gg;
      img.data[i + 2] = bb;
      img.data[i + 3] = Math.min(255, al * 255);
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}
function getWood(ctx: CanvasRenderingContext2D) {
  if (woodPattern) return woodPattern;
  woodPattern = ctx.createPattern(woodTile(false), "repeat");
  return woodPattern;
}
let woodVPattern: CanvasPattern | null = null;
function getWoodV(ctx: CanvasRenderingContext2D) {
  if (woodVPattern) return woodVPattern;
  woodVPattern = ctx.createPattern(woodTile(true), "repeat");
  return woodVPattern;
}

let grainPattern: CanvasPattern | null = null;
/** Extremely faint lengthwise grain of ivory / acrylic – felt, never seen. */
function getGrain(ctx: CanvasRenderingContext2D) {
  if (grainPattern) return grainPattern;
  const W = 96;
  const H = 192;
  const c = canvasFactory(W, H);
  const g = c.getContext("2d")!;
  for (let x = 0; x < W; x++) {
    const base = hash(x * 3.7 + 11);
    const wid = 1 + (hash(x * 1.3) > 0.7 ? 1 : 0);
    const gr = g.createLinearGradient(0, 0, 0, H);
    const a = 0.018 + base * 0.05;
    gr.addColorStop(0, `rgba(120,92,52,${a * 0.4})`);
    gr.addColorStop(0.35 + hash(x) * 0.2, `rgba(120,92,52,${a})`);
    gr.addColorStop(1, `rgba(120,92,52,${a * 0.3})`);
    g.fillStyle = hash(x * 5.1) > 0.82 ? `rgba(255,255,255,${0.05 + base * 0.07})` : gr;
    g.fillRect(x, 0, wid, H);
  }
  for (let i = 0; i < 70; i++) {
    g.fillStyle = `rgba(90,64,30,${0.05 + hash(i * 2.9) * 0.07})`;
    g.fillRect(hash(i * 7.7) * W, hash(i * 4.1) * H, 1, 1 + hash(i) * 3);
  }
  grainPattern = ctx.createPattern(c, "repeat");
  return grainPattern;
}

/* --------------------------- static background cache --------------------------- */

interface StaticCache {
  key: string;
  dpr: number;
  canvas: AnyCanvas;
}
const bgCaches = new Map<string, StaticCache>();

function buildBackground(L: Layout, s: RenderSettings, dpr: number): AnyCanvas {
  const c = canvasFactory(Math.max(1, Math.round(L.W * dpr)), Math.max(1, Math.round(L.laneH * dpr)));
  const g = c.getContext("2d")!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const { W, laneH: h, u } = L;
  const col = s.colors;
  const ln = s.lines;
  // base
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, col.bgTop);
  grad.addColorStop(0.5, col.bgMid);
  grad.addColorStop(1, col.bgBottom);
  g.fillStyle = grad;
  g.fillRect(0, 0, W, h);
  // warm lamp glow from the keyboard
  const rg = g.createRadialGradient(W / 2, h, 0, W / 2, h, Math.max(W, h) * 0.75);
  rg.addColorStop(0, rgba(col.lamp, s.glow.lamp));
  rg.addColorStop(0.5, rgba(mix(col.lamp, "#000000", 0.35), s.glow.lamp * 0.31));
  rg.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = rg;
  g.fillRect(0, 0, W, h);
  // black key lanes (darker columns)
  for (let k = L.lo; k <= L.hi; k++) {
    if (!isBlack(k + 21)) continue;
    const lg = g.createLinearGradient(L.kx[k], 0, L.kx[k] + L.kw[k], 0);
    lg.addColorStop(0, `rgba(0,0,0,${ln.blackLaneShade})`);
    lg.addColorStop(0.5, `rgba(0,0,0,${ln.blackLaneShade * 0.647})`);
    lg.addColorStop(1, `rgba(0,0,0,${ln.blackLaneShade})`);
    g.fillStyle = lg;
    g.fillRect(L.kx[k], 0, L.kw[k], h);
  }
  // white-key lane alternation (very subtle) – improves tracking of columns
  if (ln.whiteLaneAlt > 0) {
    g.fillStyle = `rgba(255,226,170,${ln.whiteLaneAlt})`;
    for (let k = L.lo; k <= L.hi; k++) {
      if (isBlack(k + 21)) continue;
      if (WHITE_IDX[k] % 2 === 0) g.fillRect(L.kx[k], 0, L.kw[k], h);
    }
  }
  // lane rules: strong at C, soft at F
  if (s.showKeyLaneGuides) {
    for (let k = L.lo; k <= L.hi; k++) {
      const pc = (k + 21) % 12;
      if (pc !== 0 && pc !== 5) continue;
      const x = Math.round(L.kx[k]) + 0.5;
      const isC = pc === 0;
      const a = isC ? ln.guideAlphaC : ln.guideAlphaF;
      const lg = g.createLinearGradient(0, 0, 0, h);
      lg.addColorStop(0, rgba(col.laneGuide, a * 0.135));
      lg.addColorStop(1, rgba(col.laneGuide, a));
      g.strokeStyle = lg;
      g.lineWidth = Math.max(1, (isC ? 1.3 : 0.9) * u * ln.guideWidth);
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, h);
      g.stroke();
    }
  }
  // the lane of middle C is very slightly warmer – a landmark that never competes with the music
  if (s.finish.middleCMarker && 39 >= L.lo && 39 <= L.hi) {
    const mg = g.createLinearGradient(0, h * 0.2, 0, h);
    mg.addColorStop(0, "rgba(255,214,140,0)");
    mg.addColorStop(1, "rgba(255,214,140,0.05)");
    g.fillStyle = mg;
    g.fillRect(L.kx[39], 0, L.kw[39], h);
  }
  // lane depth: the white lanes catch a little light from the keys, the far end falls away into the dark
  if (s.finish.laneDepth > 0) {
    const ld = s.finish.laneDepth;
    const fl = g.createLinearGradient(0, h * 0.5, 0, h);
    fl.addColorStop(0, "rgba(255,226,170,0)");
    fl.addColorStop(1, `rgba(255,226,170,${clamp(0.03 * ld, 0, 0.3)})`);
    g.fillStyle = fl;
    for (let k = L.lo; k <= L.hi; k++) if (!isBlack(k + 21)) g.fillRect(L.kx[k], h * 0.5, L.kw[k], h * 0.5);
    const far = g.createLinearGradient(0, 0, 0, h * 0.6);
    far.addColorStop(0, `rgba(0,0,0,${clamp(0.22 * ld, 0, 0.8)})`);
    far.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = far;
    g.fillRect(0, 0, W, h * 0.6);
  }
  // vignette top & sides
  const vt = g.createLinearGradient(0, 0, 0, h * 0.32);
  vt.addColorStop(0, `rgba(0,0,0,${ln.vignetteTop})`);
  vt.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = vt;
  g.fillRect(0, 0, W, h * 0.32);
  const vs = g.createLinearGradient(0, 0, W, 0);
  vs.addColorStop(0, `rgba(0,0,0,${ln.vignetteSide})`);
  vs.addColorStop(0.12, "rgba(0,0,0,0)");
  vs.addColorStop(0.88, "rgba(0,0,0,0)");
  vs.addColorStop(1, `rgba(0,0,0,${ln.vignetteSide})`);
  g.fillStyle = vs;
  g.fillRect(0, 0, W, h);
  return c;
}

/* -------------------------------- labels -------------------------------- */

const DEGREES = ["1", "♭2", "2", "♭3", "3", "4", "♯4", "5", "♭6", "6", "♭7", "7"];
function noteLabel(n: NoteEvent, s: RenderSettings, song: Song): string {
  switch (s.noteLabelMode) {
    case "fingering":
      return String(n.finger);
    case "noteName":
      return noteName(n.midi, s.useFlats, false);
    case "solfege":
      return (s.useFlats ? SOLFEGE_FLAT : SOLFEGE)[n.midi % 12];
    case "scaleDegree": {
      const tonic = (((7 * song.keySig.sharps) % 12) + 12) % 12;
      const t = song.keySig.minor ? (tonic + 9) % 12 : tonic;
      return DEGREES[(n.midi - t + 120) % 12];
    }
    default:
      return "";
  }
}

/* --------------------------------- frame --------------------------------- */

export interface FrameOptions {
  width: number; // logical px
  height: number;
  dpr: number;
  hitEps?: number; // strike tolerance in seconds (half a video frame when exporting)
}

export interface FrameStats {
  bpm: number;
  chord: Chord | null;
  measure: number;
  pedal: boolean;
  active: number;
}

export interface KeyState {
  press: number;
  color: string;
  vel: number;
  start: number;
}

export function drawFrame(ctx: CanvasRenderingContext2D, song: Song, t: number, s: RenderSettings, o: FrameOptions): FrameStats {
  const { width: W, height: H, dpr } = o;
  const eps = o.hitEps ?? 0.004;
  const L = computeLayout(W, H, s, song);
  const { u, laneH, railH } = L;
  const col = s.colors;
  const gl = s.glow;
  const ln = s.lines;
  const nt = s.notes;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";

  /* area behind the keys (visible when the keyboard is narrower than the stage) */
  ctx.fillStyle = scaleHex(col.bgBottom, 0.55);
  ctx.fillRect(0, laneH, W, H - laneH);

  /* background */
  const bgKey = `${L.key}@${dpr}`;
  let bg = bgCaches.get(bgKey);
  if (!bg) {
    if (bgCaches.size >= 3) bgCaches.delete(bgCaches.keys().next().value as string);
    bgCaches.set(bgKey, (bg = { key: L.key, dpr, canvas: buildBackground(L, s, dpr) }));
  }
  ctx.drawImage(bg.canvas, 0, 0, W, laneH);

  const fall = s.noteFallSeconds;
  const yOf = (time: number) => laneH - ((time - t) / fall) * laneH;
  const muted = s.mutedTracks.length ? new Set(s.mutedTracks) : null;
  const handOk = (n: NoteEvent) =>
    (s.activeHandFilter === "both" || (s.activeHandFilter === "right" ? n.hand === "R" : n.hand === "L")) && !(muted && muted.has(n.track));

  /* ambient dust */
  if (s.ambientDust && s.dust.count > 0) {
    const d = s.dust;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < d.count; i++) {
      const sp = (0.012 + hash(i * 5.3) * 0.03) * d.speed;
      const x = (hash(i * 1.7) * W + Math.sin(t * d.speed * (0.2 + hash(i) * 0.3) + i) * 26 * u + W) % W;
      const y = ((((hash(i * 3.9) - t * sp) % 1) + 1) % 1) * laneH;
      const r = (0.5 + hash(i * 8.1) * 1.4) * u * d.size;
      const a = (0.1 + 0.25 * (0.5 + 0.5 * Math.sin(t * d.speed * (0.6 + hash(i * 2.2)) + i * 3))) * clamp((laneH - y) / (laneH * 0.4) + 0.2, 0, 1) * d.alpha;
      const dg = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
      dg.addColorStop(0, rgba(col.dust, a));
      dg.addColorStop(1, rgba(col.dust, 0));
      ctx.fillStyle = dg;
      ctx.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
    }
    ctx.restore();
  }

  /* pedal resonance wash */
  const pedal = pedalAt(song, t);
  if (pedal && s.showSustainPedal && gl.pedalWash > 0) {
    const pg = ctx.createLinearGradient(0, laneH * 0.55, 0, laneH);
    pg.addColorStop(0, rgba(col.pedalWash, 0));
    pg.addColorStop(1, rgba(col.pedalWash, gl.pedalWash));
    ctx.fillStyle = pg;
    ctx.fillRect(0, laneH * 0.55, W, laneH * 0.45);
  }

  /* measure & beat lines */
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, laneH);
  ctx.clip();
  const tTop = t + fall;
  if (s.showMeasureLines || s.showBeatLines) {
    const ms = song.measures;
    // binary search for first measure with time >= t - small
    let a = 0;
    let b = ms.length;
    while (a < b) {
      const m = (a + b) >> 1;
      if (ms[m].time < t - 1e-6) a = m + 1;
      else b = m;
    }
    ctx.textBaseline = "alphabetic";
    // include the beats of the previous measure that are still on screen
    const startI = Math.max(0, a - 1);
    for (let i = startI; i < ms.length; i++) {
      const m = ms[i];
      if (m.time > tTop && (m.beats[0] ?? Infinity) > tTop) break;
      if (s.showBeatLines && ln.beatAlpha > 0) {
        for (const bt of m.beats) {
          if (bt < t || bt > tTop) continue;
          const y = Math.round(yOf(bt)) + 0.5;
          ctx.strokeStyle = rgba(col.beatLine, ln.beatAlpha);
          ctx.lineWidth = Math.max(1, 0.9 * u);
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(W, y);
          ctx.stroke();
        }
      }
      if (s.showMeasureLines && m.time >= t - 1e-6 && m.time <= tTop) {
        const y = Math.round(yOf(m.time)) + 0.5;
        const lg = ctx.createLinearGradient(0, 0, W, 0);
        lg.addColorStop(0, rgba(col.measureLine, ln.measureAlpha));
        lg.addColorStop(0.5, rgba(col.measureLine, ln.measureAlpha * 0.53));
        lg.addColorStop(1, rgba(col.measureLine, ln.measureAlpha));
        ctx.strokeStyle = lg;
        ctx.lineWidth = Math.max(1, 1.3 * u * ln.measureWidth);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
        if (s.showMeasureNumbers) {
          ctx.font = `italic 600 ${Math.round(15 * u * ln.measureNumberSize)}px ${SERIF}`;
          ctx.fillStyle = rgba(col.measureNumber, 0.62);
          ctx.textAlign = "left";
          ctx.fillText(String(m.number), 12 * u, y - 5 * u);
        }
      }
    }
  }

  /* gather visible notes, key states */
  const keyState: (KeyState | null)[] = new Array(88).fill(null);
  const visible: NoteEvent[] = [];
  const incoming: NoteEvent[] = [];
  const startIdx = firstVisibleIndex(song, t - 0.12);
  const notes = song.notes;
  let activeCount = 0;
  for (let i = startIdx; i < notes.length; i++) {
    const n = notes[i];
    if (n.start > tTop) break;
    if (!handOk(n)) continue;
    visible.push(n);
    const sounding = n.start <= t + eps && t < n.visEnd;
    let press = 0;
    if (sounding) {
      press = clamp((t - n.start + eps) / 0.045, 0.0, 1);
      press = 1 - Math.pow(1 - Math.max(press, 0.18), 2);
      activeCount++;
    } else if (t >= n.visEnd && t < n.visEnd + 0.11) press = 1 - (t - n.visEnd) / 0.11;
    if (press > 0) {
      const prev = keyState[n.key];
      if (!prev || (sounding && n.start >= prev.start) || press > prev.press) {
        keyState[n.key] = { press: sounding ? press : Math.max(press, 0), color: noteColor(n, s.colorMode, col), vel: n.vel, start: n.start };
      }
    }
    if (n.start > t + eps && n.start <= t + s.incomingLookAheadSeconds) incoming.push(n);
  }

  /* physical key depress: analytic, stateless function of (t, the key's note events) */
  let pressView: (PressView | null)[] | null = null;
  if (s.finish.keyPhysics) {
    const Fz = s.finish;
    const P: PressParams = {
      hold: Fz.pressHold,
      attackSlow: Fz.pressAttackSlow,
      attackFast: Fz.pressAttackFast,
      bottomOut: Fz.pressBottomOut,
      releaseSlow: Fz.pressReleaseSlow,
      releaseFast: Fz.pressReleaseFast,
      overshoot: Fz.pressOvershoot,
      anticipation: Fz.pressAnticipation / 1000,
      variation: Fz.pressVariation,
    };
    const perKey: (KeyNote<NoteEvent>[] | undefined)[] = new Array(88);
    for (let i = firstVisibleIndex(song, t - 0.6); i < notes.length; i++) {
      const n = notes[i];
      if (n.start > t + 0.08) break;
      if (!handOk(n) || n.visEnd + 0.6 < t) continue;
      (perKey[n.key] ||= []).push({ start: n.start, end: n.visEnd, vel: n.vel, ref: n });
    }
    pressView = new Array(88).fill(null);
    for (let k = 0; k < 88; k++) {
      const list = perKey[k];
      if (!list) continue;
      const r = keyDepressAt(list, t, k, P, eps + P.anticipation);
      if (r) pressView[k] = { d: r.d, vf: r.vf, color: noteColor(r.ref, s.colorMode, col) };
    }
  }

  /* sustain tails */
  if (s.showSustainTails && s.showSustainPedal && gl.sustainTail > 0) {
    for (const n of visible) {
      if (n.sustainEnd <= n.visEnd + 0.05) continue;
      const c = noteColor(n, s.colorMode, col);
      const yTop = yOf(n.sustainEnd);
      const yBot = yOf(n.visEnd);
      if (yBot < 0 || yTop > laneH) continue;
      const tw = Math.max(2 * u, L.kw[n.key] * 0.3);
      const x = L.kx[n.key] + (L.kw[n.key] - tw) / 2;
      const tg = ctx.createLinearGradient(0, yTop, 0, yBot);
      tg.addColorStop(0, rgba(c, 0));
      tg.addColorStop(1, rgba(c, gl.sustainTail));
      ctx.fillStyle = tg;
      rr(ctx, x, yTop, tw, Math.max(1, yBot - yTop), tw / 2);
      ctx.fill();
    }
  }

  /* chord brackets */
  if (s.showChordBrackets) {
    ctx.textAlign = "center";
    const bracketCol = col.chordText;
    const romanCol = mix(col.chordText, col.chordRoman, 0.35);
    for (let ci = lowerBoundStart(song.chords, t - 0.02); ci < song.chords.length; ci++) {
      const c = song.chords[ci];
      if (c.start > tTop) break;
      if (c.start < t - 0.02 || c.shownEnd - c.start < 0.2) continue;
      const y = yOf(c.start);
      if (y + 30 * u > laneH || y < 20 * u) continue;
      const x1 = L.kx[c.keyLo];
      const x2 = L.kx[c.keyHi] + L.kw[c.keyHi];
      const by = y + 5 * u;
      ctx.strokeStyle = rgba(bracketCol, 0.55);
      ctx.lineWidth = Math.max(1, 1.3 * u);
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(x1 + 2 * u, by - 4 * u);
      ctx.lineTo(x1 + 2 * u, by);
      ctx.lineTo(x2 - 2 * u, by);
      ctx.lineTo(x2 - 2 * u, by - 4 * u);
      ctx.stroke();
      const cx = (x1 + x2) / 2;
      ctx.font = `italic 700 ${Math.round(15 * u)}px ${SERIF}`;
      ctx.fillStyle = rgba(bracketCol, 0.92);
      ctx.fillText(c.symbol, cx, by + 16 * u);
      if (c.roman) {
        ctx.font = `500 ${Math.round(9.5 * u)}px ${SANS}`;
        ctx.fillStyle = rgba(romanCol, 0.6);
        ctx.fillText(c.roman, cx, by + 28 * u);
      }
    }
  }

  /* falling notes */
  const gap = nt.gap * u;
  const activeBeams: { x: number; w: number; col: string; vel: number; age: number; id: number }[] = [];
  for (const n of visible) {
    const c = noteColor(n, s.colorMode, col);
    const black = isBlack(n.midi);
    const kwid = L.kw[n.key];
    const nw = Math.max(2, kwid * (black ? nt.widthBlack : nt.widthWhite));
    const x = L.kx[n.key] + (kwid - nw) / 2;
    const yb = yOf(n.start) - gap;
    let yt = yOf(n.visEnd);
    if (yb < 0 || yt > laneH) continue;
    if (yb - yt < nt.minHeight * u) yt = yb - nt.minHeight * u;
    const h = yb - yt;
    const active = n.start <= t + eps && t < n.visEnd;
    const r = Math.min(nw * nt.cornerRadius, 9 * u, h / 2);
    const dim = nt.velocityDim * (1 - n.vel / 127) * 0.5 + (black ? nt.blackDarken : 0);
    const base = dim > 0.0005 ? darken(c, dim) : c;
    const tl = nt.topLight;

    ctx.save();
    ctx.globalAlpha = nt.opacity;
    if (active) {
      if (gl.noteActiveBlur > 0 && gl.noteActiveAlpha > 0) {
        ctx.shadowColor = rgba(c, gl.noteActiveAlpha);
        ctx.shadowBlur = gl.noteActiveBlur * u;
      }
    } else if (gl.noteIdleAlpha > 0) {
      // cheap soft glow
      const sp = gl.noteIdleSpread * u;
      ctx.fillStyle = rgba(c, gl.noteIdleAlpha);
      rr(ctx, x - sp, yt - sp, nw + sp * 2, h + sp * 2, r + sp);
      ctx.fill();
    }
    const gr = ctx.createLinearGradient(0, yt, 0, yb);
    gr.addColorStop(0, lighten(base, (active ? 0.34 : 0.2) * tl));
    gr.addColorStop(0.18, lighten(base, (active ? 0.18 : 0.08) * tl));
    gr.addColorStop(0.75, base);
    gr.addColorStop(1, darken(base, 0.26));
    ctx.fillStyle = gr;
    rr(ctx, x, yt, nw, h, r);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = nt.opacity;
    // bevel: left sheen, top rim, bottom edge
    ctx.save();
    rr(ctx, x, yt, nw, h, r);
    ctx.clip();
    if (nt.shine > 0) {
      const sh = ctx.createLinearGradient(x, 0, x + nw, 0);
      sh.addColorStop(0, `rgba(255,255,255,${clamp(0.3 * nt.shine, 0, 1)})`);
      sh.addColorStop(0.18, `rgba(255,255,255,${clamp(0.06 * nt.shine, 0, 1)})`);
      sh.addColorStop(0.7, "rgba(255,255,255,0)");
      sh.addColorStop(1, `rgba(0,0,0,${clamp(0.22 * nt.shine, 0, 1)})`);
      ctx.fillStyle = sh;
      ctx.fillRect(x, yt, nw, h);
    }
    // inner core: a fine glassy line of light that gives every note its depth
    if (s.finish.noteCore > 0 && h > 9 * u && nw > 5) {
      const cw = Math.max(1, nw * 0.075);
      const ca = clamp(0.17 * s.finish.noteCore * (active ? 1.5 : 1), 0, 0.9);
      const cg = ctx.createLinearGradient(0, yt, 0, yb);
      cg.addColorStop(0, "rgba(255,255,255,0)");
      cg.addColorStop(0.18, `rgba(255,255,255,${ca})`);
      cg.addColorStop(0.85, `rgba(255,255,255,${ca * 0.55})`);
      cg.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = cg;
      ctx.fillRect(x + nw * 0.34 - cw / 2, yt + 1, cw, h - 2);
    }
    // bottom (strike) edge flare
    const fh = Math.min(h, 16 * u);
    const fg = ctx.createLinearGradient(0, yb - fh, 0, yb);
    fg.addColorStop(0, "rgba(255,255,255,0)");
    fg.addColorStop(1, `rgba(255,255,255,${clamp((active ? 0.38 : 0.12) * nt.strikeFlare, 0, 1)})`);
    ctx.fillStyle = fg;
    ctx.fillRect(x, yb - fh, nw, fh);
    ctx.restore();
    ctx.lineWidth = Math.max(1, 1 * u);
    if (nt.outline > 0) {
      ctx.strokeStyle = `rgba(255,255,255,${clamp(0.34 * nt.outline, 0, 1)})`;
      rr(ctx, x + 0.5, yt + 0.5, nw - 1, h - 1, Math.max(0, r - 0.5));
      ctx.stroke();
    }
    if (nt.edgeShadow > 0) {
      ctx.strokeStyle = `rgba(0,0,0,${clamp(0.38 * nt.edgeShadow, 0, 1)})`;
      rr(ctx, x - 0.5, yt - 0.5, nw + 1, h + 1, r + 0.5);
      ctx.stroke();
    }

    // label
    if (s.noteLabelMode !== "none") {
      const lab = noteLabel(n, s, song);
      const fs = clamp(nw * 0.5, 8 * u, 18 * u) * nt.labelScale;
      if (lab && nw >= 11 * u * 0.9 && h >= fs * 1.4) {
        ctx.font = `700 ${Math.round(fs)}px ${SANS}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const dark = luminance(base) > 0.5;
        ctx.fillStyle = dark ? "rgba(30,16,4,0.9)" : "rgba(255,247,230,0.95)";
        if (!dark) {
          ctx.shadowColor = "rgba(0,0,0,0.45)";
          ctx.shadowBlur = 2 * u;
        }
        ctx.fillText(lab, x + nw / 2, yb - fs * 0.95);
        ctx.shadowBlur = 0;
        ctx.textBaseline = "alphabetic";
      }
    }
    ctx.restore();
    if (active) activeBeams.push({ x: L.kx[n.key], w: kwid, col: c, vel: n.vel, age: t - n.start, id: n.id });
  }

  /* notes emerge from the dark at the far end of the lane */
  if (s.finish.noteFadeIn > 0) {
    const fh = laneH * clamp(s.finish.noteFadeIn, 0, 0.8);
    const fg = ctx.createLinearGradient(0, 0, 0, fh);
    fg.addColorStop(0, rgba(col.bgTop, 0.94));
    fg.addColorStop(0.5, rgba(col.bgTop, 0.42));
    fg.addColorStop(1, rgba(col.bgTop, 0));
    ctx.fillStyle = fg;
    ctx.fillRect(0, 0, W, fh);
  }

  /* additive bloom: beams, sparks, impact flash */
  if (s.showAcousticBloom && activeBeams.length) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const b of activeBeams) {
      const cx = b.x + b.w / 2;
      const v = 0.5 + 0.5 * (b.vel / 127);
      const env = Math.exp(-Math.max(0, b.age) * gl.bloomDecay) * 0.65 + 0.35;
      const beamH = laneH * gl.beamHeight * v;
      if (beamH > 1 && gl.beamAlpha > 0) {
        const bg2 = ctx.createLinearGradient(0, laneH - beamH, 0, laneH);
        bg2.addColorStop(0, rgba(b.col, 0));
        bg2.addColorStop(1, rgba(b.col, gl.beamAlpha * env));
        ctx.fillStyle = bg2;
        ctx.fillRect(b.x, laneH - beamH, b.w, beamH);
      }
      const R = (b.w * 2.1 + 26 * u) * v * gl.bloomSize;
      if (R > 1 && gl.bloomAlpha > 0) {
        const rg2 = ctx.createRadialGradient(cx, laneH, 0, cx, laneH, R);
        rg2.addColorStop(0, rgba(lighten(b.col, 0.35), gl.bloomAlpha * env));
        rg2.addColorStop(0.35, rgba(b.col, gl.bloomAlpha * 0.355 * env));
        rg2.addColorStop(1, rgba(b.col, 0));
        ctx.fillStyle = rg2;
        ctx.fillRect(cx - R, laneH - R, R * 2, R);
      }
      // impact flash – a brief white pop at the instant of the strike
      if (gl.impactFlash > 0 && b.age >= 0 && b.age < 0.14) {
        const f = (1 - b.age / 0.14) * gl.impactFlash * v;
        const FR = b.w * 1.5 + 18 * u;
        const fg2 = ctx.createRadialGradient(cx, laneH, 0, cx, laneH, FR);
        fg2.addColorStop(0, `rgba(255,255,255,${clamp(f * 0.85, 0, 1)})`);
        fg2.addColorStop(0.4, rgba(lighten(b.col, 0.6), clamp(f * 0.35, 0, 1)));
        fg2.addColorStop(1, rgba(b.col, 0));
        ctx.fillStyle = fg2;
        ctx.fillRect(cx - FR, laneH - FR, FR * 2, FR);
      }
      // sparks
      if (gl.sparkCount > 0 && b.age >= 0 && b.age < 0.42) {
        for (let j = 0; j < gl.sparkCount; j++) {
          const seed = b.id * 13 + j * 3.7;
          const ang = -Math.PI / 2 + (hash(seed) - 0.5) * 1.5;
          const spd = (70 + hash(seed + 1) * 150) * u * gl.sparkSpeed;
          const a = b.age;
          const px = cx + Math.cos(ang) * spd * a;
          const py = laneH + Math.sin(ang) * spd * a + 220 * u * a * a;
          const life = 1 - a / 0.42;
          const sz = (0.8 + hash(seed + 2) * 1.6) * u * (0.4 + life) * gl.sparkSize;
          ctx.fillStyle = rgba(lighten(b.col, 0.5), gl.sparkAlpha * life);
          ctx.beginPath();
          ctx.arc(px, py, sz, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }
  ctx.restore(); // end lane clip

  /* strike contact bar */
  if (s.showStrikeContactBar) {
    const cb = gl.contactBar;
    if (cb > 0) {
      const lg = ctx.createLinearGradient(0, 0, W, 0);
      lg.addColorStop(0, rgba(col.accent, 0));
      lg.addColorStop(0.1, rgba(col.accent, 0.5 * cb));
      lg.addColorStop(0.5, rgba(col.accentLight, 0.85 * cb));
      lg.addColorStop(0.9, rgba(col.accent, 0.5 * cb));
      lg.addColorStop(1, rgba(col.accent, 0));
      ctx.fillStyle = lg;
      ctx.fillRect(0, laneH - 2 * u, W, 2 * u);
      const hg = ctx.createLinearGradient(0, laneH - 14 * u, 0, laneH);
      hg.addColorStop(0, rgba(col.accent, 0));
      hg.addColorStop(1, rgba(col.accent, 0.12 * cb));
      ctx.fillStyle = hg;
      ctx.fillRect(0, laneH - 14 * u, W, 14 * u);
    }
    // lit contact segments on active keys
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let k = L.lo; k <= L.hi; k++) {
      const ks = keyState[k];
      if (!ks) continue;
      ctx.fillStyle = rgba(lighten(ks.color, 0.4), gl.contactSegment * ks.press);
      ctx.fillRect(L.kx[k] + 1, laneH - 2.5 * u, L.kw[k] - 2, 2.5 * u);
    }
    ctx.restore();
  }

  /* damper rail (baize + brass trim) */
  if (railH > 0) {
    const y = laneH;
    const gr = ctx.createLinearGradient(0, y, 0, y + railH);
    gr.addColorStop(0, col.rail);
    gr.addColorStop(0.5, darken(col.rail, 0.2));
    gr.addColorStop(1, darken(col.rail, 0.55));
    ctx.fillStyle = gr;
    ctx.fillRect(0, y, W, railH);
    const felt = getFelt(ctx);
    if (felt) {
      ctx.save();
      ctx.globalAlpha = clamp(s.finish.woodDetail, 0, 2) * 0.5 + 0.5;
      ctx.fillStyle = felt;
      ctx.fillRect(0, y, W, railH);
      ctx.restore();
    }
    // brass trim
    const tg = ctx.createLinearGradient(0, y, 0, y + 2.2 * u);
    tg.addColorStop(0, lighten(col.railTrim, 0.55));
    tg.addColorStop(0.5, col.railTrim);
    tg.addColorStop(1, darken(col.railTrim, 0.32));
    ctx.fillStyle = tg;
    ctx.fillRect(0, y, W, Math.max(1.5, 2.2 * u));
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, y + railH - 1.5 * u, W, 1.5 * u);
    const bt = ctx.createLinearGradient(0, y + railH - 2.8 * u, 0, y + railH);
    bt.addColorStop(0, darken(col.railTrim, 0.05));
    bt.addColorStop(1, darken(col.railTrim, 0.5));
    ctx.fillStyle = bt;
    ctx.fillRect(0, y + railH - 1.2 * u, W, 1.2 * u);
    drawRailPlate(ctx, L, s);
    // glow from active keys onto the baize
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    if (gl.railGlow > 0) {
      for (let k = L.lo; k <= L.hi; k++) {
        const ks = keyState[k];
        if (!ks) continue;
        const cx = L.kx[k] + L.kw[k] / 2;
        const R = L.kw[k] * 1.5 + 8 * u;
        const rg = ctx.createRadialGradient(cx, y + railH / 2, 0, cx, y + railH / 2, R);
        rg.addColorStop(0, rgba(ks.color, gl.railGlow * ks.press));
        rg.addColorStop(1, rgba(ks.color, 0));
        ctx.fillStyle = rg;
        ctx.fillRect(cx - R, y, R * 2, railH);
      }
    }
    // approaching notes are faintly mirrored in the brass trim
    if (s.finish.noteReflection > 0) {
      for (const n of visible) {
        if (n.start <= t) continue;
        const d = (n.start - t) / fall;
        if (d > 0.2) break;
        const ramp = 1 - d / 0.2;
        const c = noteColor(n, s.colorMode, col);
        const wdt = L.kw[n.key] * 0.62;
        const cx = L.kx[n.key] + L.kw[n.key] / 2;
        const rg = ctx.createLinearGradient(cx - wdt / 2, 0, cx + wdt / 2, 0);
        rg.addColorStop(0, rgba(c, 0));
        rg.addColorStop(0.5, rgba(lighten(c, 0.35), 0.5 * ramp * s.finish.noteReflection));
        rg.addColorStop(1, rgba(c, 0));
        ctx.fillStyle = rg;
        ctx.fillRect(cx - wdt / 2, y, wdt, Math.max(1.6, 2.2 * u));
      }
    }
    // incoming key pre-glow: fallboard dots
    if (s.showIncomingKeyPreview && gl.incomingRail > 0) {
      const seen = new Set<number>();
      for (const n of incoming) {
        if (seen.has(n.key)) continue;
        seen.add(n.key);
        const ramp = (1 - (n.start - t) / s.incomingLookAheadSeconds) * gl.incomingRail;
        const c = noteColor(n, s.colorMode, col);
        const cx = L.kx[n.key] + L.kw[n.key] / 2;
        const rad = (2 + 3.2 * clamp(ramp, 0, 2)) * u;
        const dg = ctx.createRadialGradient(cx, y + railH / 2, 0, cx, y + railH / 2, rad * 3);
        dg.addColorStop(0, rgba(lighten(c, 0.3), 0.95 * ramp));
        dg.addColorStop(0.35, rgba(c, 0.5 * ramp));
        dg.addColorStop(1, rgba(c, 0));
        ctx.fillStyle = dg;
        ctx.fillRect(cx - rad * 3, y, rad * 6, railH);
      }
    }
    ctx.restore();
  }

  /* keys */
  if (pressView) drawKeysPhysical(ctx, L, s, pressView, incoming, t, dpr);
  else drawKeys(ctx, L, s, keyState, incoming, t);

  /* front board */
  if (L.frontH > 0) {
    const y = L.frontY;
    const gr = ctx.createLinearGradient(0, y, 0, y + L.frontH);
    gr.addColorStop(0, scaleHex(col.frontBoard, 1.47));
    gr.addColorStop(0.35, col.frontBoard);
    gr.addColorStop(1, scaleHex(col.frontBoard, 0.52));
    ctx.fillStyle = gr;
    ctx.fillRect(0, y, W, L.frontH);
    const wood = getWood(ctx);
    if (wood) {
      ctx.save();
      ctx.globalAlpha = clamp(s.finish.woodDetail, 0, 2);
      ctx.fillStyle = wood;
      ctx.fillRect(0, y, W, L.frontH);
      ctx.restore();
      // clear-coat: a soft reflection of the lamp running along the slip
      if (s.finish.woodDetail > 0) {
        const cc = ctx.createLinearGradient(0, y, 0, y + L.frontH);
        cc.addColorStop(0, "rgba(255,236,200,0.14)");
        cc.addColorStop(0.35, "rgba(255,236,200,0.03)");
        cc.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = cc;
        ctx.fillRect(0, y, W, L.frontH);
      }
    }
    ctx.fillStyle = "rgba(255,214,160,0.28)";
    ctx.fillRect(0, y, W, Math.max(1, 1 * u));
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0, y + L.frontH - 1, W, 1);
    // light spilling from struck keys onto the key slip
    if (gl.frontBoardGlow > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, y, W, L.frontH);
      ctx.clip();
      ctx.globalCompositeOperation = "lighter";
      for (let k = L.lo; k <= L.hi; k++) {
        const ks = keyState[k];
        if (!ks) continue;
        const cx = L.kx[k] + L.kw[k] / 2;
        const R = L.kw[k] * 1.6 + 10 * u;
        const fg = ctx.createRadialGradient(cx, y, 0, cx, y, R);
        fg.addColorStop(0, rgba(ks.color, gl.frontBoardGlow * ks.press));
        fg.addColorStop(1, rgba(ks.color, 0));
        ctx.fillStyle = fg;
        ctx.fillRect(cx - R, y, R * 2, L.frontH);
      }
      ctx.restore();
    }
  }

  /* minimap */
  if (L.miniH > 0) drawMinimap(ctx, L, s, keyState);

  /* HUD */
  const tp = tempoAt(song, Math.max(0, t));
  const chord = chordAt(song, t);
  const measure = measureAt(song, t);
  if (s.hud.opacity > 0) {
    ctx.save();
    ctx.globalAlpha = s.hud.opacity;
    if (s.showHudMetadata) drawHud(ctx, L, s, song, tp.bpm, pedal && s.showSustainPedal, measure);
    if (s.showChordBanner && chord) drawChordBanner(ctx, L, s, chord, t);
    ctx.restore();
  }

  applyPost(ctx, W, H, dpr, s.post);
  return { bpm: tp.bpm, chord, measure, pedal, active: activeCount };
}

/* --------------------------------- keys --------------------------------- */

function drawKeys(ctx: CanvasRenderingContext2D, L: Layout, s: RenderSettings, ks: (KeyState | null)[], incoming: NoteEvent[], t: number) {
  const { u, keysTop: top, keysH: kh, wkw } = L;
  const K = s.keys;
  const col = s.colors;
  const gl = s.glow;
  const gapPx = Math.max(wkw > 3 ? 1 : 0, wkw * K.gap);
  const radius = clamp(wkw * 0.16 * K.cornerRadius, 0, Math.max(6.5 * u, 6.5 * u * K.cornerRadius));

  // shared ivory gradients derived from the white key colour
  const wc = col.whiteKey;
  const iv = [darken(wc, 0.13), darken(wc, 0.025), wc, darken(wc, 0.05), darken(wc, 0.17)];
  const ivory = ctx.createLinearGradient(0, top, 0, top + kh);
  ivory.addColorStop(0, iv[0]);
  ivory.addColorStop(0.06, iv[1]);
  ivory.addColorStop(0.5, iv[2]);
  ivory.addColorStop(0.88, iv[3]);
  ivory.addColorStop(1, iv[4]);

  // pre-compute incoming ramp per key
  const inc = new Map<number, number>();
  if (s.showIncomingKeyPreview) {
    for (const n of incoming) {
      const ramp = 1 - (n.start - t) / s.incomingLookAheadSeconds;
      if (!inc.has(n.key) || ramp > inc.get(n.key)!) inc.set(n.key, ramp);
    }
  }
  const incColor = new Map<number, string>();
  for (const n of incoming) if (!incColor.has(n.key)) incColor.set(n.key, noteColor(n, s.colorMode, col));
  const wash = gl.keyWash;
  const pre = gl.incomingKey;

  const F = s.finish;
  const spanX0 = L.kx[L.lo];
  const spanX1 = L.kx[L.hi] + L.kw[L.hi];
  // keybed: the dark recess the keys sit in – gives every gap real depth
  if (F.keybedDepth > 0) {
    const kb = ctx.createLinearGradient(0, top, 0, top + kh);
    kb.addColorStop(0, "#030201");
    kb.addColorStop(0.5, "#0b0705");
    kb.addColorStop(1, "#160e09");
    ctx.save();
    ctx.globalAlpha = clamp(F.keybedDepth, 0, 1);
    ctx.fillStyle = kb;
    ctx.fillRect(spanX0, top, spanX1 - spanX0, kh);
    ctx.restore();
  }
  const grain = F.keyGrain > 0 ? getGrain(ctx) : null;

  // white keys
  for (let k = L.lo; k <= L.hi; k++) {
    if (isBlack(k + 21)) continue;
    const st = ks[k];
    const p = st ? st.press : 0;
    const x = L.kx[k] + gapPx / 2;
    const w = L.kw[k] - gapPx;
    const dy = p * 2.6 * u * K.pressDepth;
    const y = top + dy;
    const h = kh - dy - p * 1.2 * u * K.pressDepth;
    // body
    if (p > 0.01) {
      const g = ctx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, mix(iv[0], darken(iv[0], 0.23), p));
      g.addColorStop(0.08, mix(iv[1], darken(iv[1], 0.16), p));
      g.addColorStop(0.55, mix(iv[2], darken(iv[2], 0.09), p));
      g.addColorStop(1, mix(iv[4], darken(iv[4], 0.13), p));
      ctx.fillStyle = g;
    } else ctx.fillStyle = ivory;
    rrBottom(ctx, x, y, w, h, radius);
    ctx.fill();

    // no two ivories are exactly alike, and the surface has a faint lengthwise grain
    if (F.keyVariance > 0) {
      const hv = hash(k * 7.31 + 1.7);
      ctx.fillStyle = hv > 0.5 ? `rgba(255,252,238,${(hv - 0.5) * 0.06 * F.keyVariance})` : `rgba(112,84,40,${(0.5 - hv) * 0.08 * F.keyVariance})`;
      rrBottom(ctx, x, y, w, h, radius);
      ctx.fill();
    }
    if (grain) {
      ctx.save();
      ctx.globalAlpha = clamp(F.keyGrain, 0, 2) * 0.9;
      ctx.fillStyle = grain;
      rrBottom(ctx, x, y, w, h, radius);
      ctx.fill();
      ctx.restore();
    }

    // colour wash on press
    if (st && p > 0.01) {
      ctx.save();
      rrBottom(ctx, x, y, w, h, radius);
      ctx.clip();
      const wg = ctx.createLinearGradient(0, y, 0, y + h);
      wg.addColorStop(0, rgba(st.color, 0.92 * p * wash));
      wg.addColorStop(0.45, rgba(st.color, 0.62 * p * wash));
      wg.addColorStop(1, rgba(st.color, 0.28 * p * wash));
      ctx.fillStyle = wg;
      ctx.fillRect(x, y, w, h);
      ctx.restore();
    } else if (inc.has(k)) {
      const r = inc.get(k)!;
      const c = incColor.get(k)!;
      ctx.save();
      rrBottom(ctx, x, y, w, h, radius);
      ctx.clip();
      const wg = ctx.createLinearGradient(0, y, 0, y + h * 0.5);
      wg.addColorStop(0, rgba(c, 0.34 * r * pre));
      wg.addColorStop(1, rgba(c, 0));
      ctx.fillStyle = wg;
      ctx.fillRect(x, y, w, h);
      ctx.restore();
    }

    // a pressed key drops below its neighbours: the side walls fall into shadow
    if (p > 0.04) {
      const sw = Math.max(1.2, 1.7 * u);
      const sg = ctx.createLinearGradient(x, 0, x + sw, 0);
      sg.addColorStop(0, `rgba(14,6,2,${0.34 * p})`);
      sg.addColorStop(1, "rgba(14,6,2,0)");
      ctx.fillStyle = sg;
      ctx.fillRect(x, y, sw, h - 2 * u);
      const sg2 = ctx.createLinearGradient(x + w, 0, x + w - sw, 0);
      sg2.addColorStop(0, `rgba(14,6,2,${0.34 * p})`);
      sg2.addColorStop(1, "rgba(14,6,2,0)");
      ctx.fillStyle = sg2;
      ctx.fillRect(x + w - sw, y, sw, h - 2 * u);
    }

    // side bevels
    if (K.bevel > 0) {
      ctx.fillStyle = `rgba(255,255,255,${clamp(0.6 * K.bevel, 0, 1)})`;
      ctx.fillRect(x + 0.5, y + 2 * u, Math.max(1, wkw * 0.045), h - 10 * u);
      ctx.fillStyle = `rgba(90,66,30,${clamp(0.22 * K.bevel, 0, 1)})`;
      ctx.fillRect(x + w - Math.max(1, wkw * 0.06), y + 2 * u, Math.max(1, wkw * 0.06), h - 10 * u);
    }

    // front face of the key: a crisp lit crest, then the face falling into shade
    const lipH = Math.max(7, 12 * u);
    const lg = ctx.createLinearGradient(0, y + h - lipH, 0, y + h);
    lg.addColorStop(0, `rgba(255,255,255,${clamp(0.7 * K.gloss, 0, 1)})`);
    lg.addColorStop(0.07, "rgba(255,255,255,0)");
    lg.addColorStop(0.16, "rgba(140,108,60,0.06)");
    lg.addColorStop(0.62, "rgba(120,92,48,0.15)");
    lg.addColorStop(1, "rgba(66,44,18,0.5)");
    ctx.save();
    rrBottom(ctx, x, y, w, h, radius);
    ctx.clip();
    ctx.fillStyle = lg;
    ctx.fillRect(x, y + h - lipH, w, lipH);
    // soft glint rolling over the rounded crest
    const gl2 = ctx.createLinearGradient(x, 0, x + w, 0);
    gl2.addColorStop(0, "rgba(255,255,255,0)");
    gl2.addColorStop(0.3, `rgba(255,255,255,${clamp(0.16 * K.gloss, 0, 1)})`);
    gl2.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gl2;
    ctx.fillRect(x, y + h - lipH - 1, w, Math.max(1.5, 2.2 * u));
    ctx.restore();
    // subtle outline
    ctx.strokeStyle = "rgba(60,40,16,0.34)";
    ctx.lineWidth = 1;
    rrBottom(ctx, x + 0.5, y, w - 1, h - 0.5, radius);
    ctx.stroke();

    // engraved landmarks: a notch of brass on every C, a proper dot on middle C
    if (F.middleCMarker && (k + 21) % 12 === 0 && wkw >= 9) {
      const mid = k === 39;
      const rd = clamp(wkw * (mid ? 0.11 : 0.07), 1.1, mid ? 3.6 * u : 2.4 * u);
      const cx = x + w / 2;
      const cy = top + kh - 29 * u - dy;
      const dg = ctx.createRadialGradient(cx - rd * 0.3, cy - rd * 0.3, 0, cx, cy, rd * 1.1);
      dg.addColorStop(0, rgba(lighten(col.keyLabelC, 0.45), mid ? 0.95 : 0.5));
      dg.addColorStop(1, rgba(col.keyLabelC, mid ? 0.9 : 0.4));
      ctx.fillStyle = dg;
      ctx.beginPath();
      ctx.arc(cx, cy, rd, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.fillRect(cx - rd, cy + rd + 0.5, rd * 2, 0.8); // the dot is inset: a hairline catches the light below it
    }
  }

  // lamp falloff: the ends of the keyboard sit a touch further from the lamp
  if (F.lampSheen > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(spanX0, top, spanX1 - spanX0, kh);
    ctx.clip();
    ctx.globalCompositeOperation = "multiply";
    const lf = ctx.createLinearGradient(0, 0, L.W, 0);
    const la = clamp(0.1 * F.lampSheen, 0, 0.5);
    lf.addColorStop(0, `rgba(84,56,24,${la * 1.6})`);
    lf.addColorStop(0.3, "rgba(84,56,24,0)");
    lf.addColorStop(0.7, "rgba(84,56,24,0)");
    lf.addColorStop(1, `rgba(84,56,24,${la * 1.6})`);
    ctx.fillStyle = lf;
    ctx.fillRect(spanX0, top, spanX1 - spanX0, kh);
    // and the rear of every key is a little darker, in the shade of the fallboard
    const rf = ctx.createLinearGradient(0, top, 0, top + kh * 0.5);
    rf.addColorStop(0, `rgba(84,56,24,${la * 1.2})`);
    rf.addColorStop(1, "rgba(84,56,24,0)");
    ctx.fillStyle = rf;
    ctx.fillRect(spanX0, top, spanX1 - spanX0, kh * 0.5);
    ctx.restore();
  }
  // shadow cast by the damper rail
  {
    const sg = ctx.createLinearGradient(0, top, 0, top + 16 * u);
    sg.addColorStop(0, "rgba(20,8,6,0.55)");
    sg.addColorStop(1, "rgba(20,8,6,0)");
    ctx.fillStyle = sg;
    ctx.fillRect(0, top, L.W, 16 * u);
  }

  // black keys
  const bc = col.blackKey;
  const bcr = Math.max(2, L.bkw * 0.13);
  for (let k = L.lo; k <= L.hi; k++) {
    if (!isBlack(k + 21)) continue;
    const st = ks[k];
    const p = st ? st.press : 0;
    const x = L.kx[k];
    const w = L.kw[k];
    const dy = p * 1.4 * u * K.pressDepth;
    const y = top + dy * 0.5;
    const h = L.bkh - dy;
    const rad = Math.max(2, w * 0.13);

    // halo around a struck black key
    if (st && p > 0.01 && gl.blackKeyHalo > 0) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const cx = x + w / 2;
      const R = w * 1.7 + 8 * u;
      const hg = ctx.createRadialGradient(cx, y + h * 0.55, 0, cx, y + h * 0.55, R);
      hg.addColorStop(0, rgba(st.color, gl.blackKeyHalo * p * 0.8));
      hg.addColorStop(1, rgba(st.color, 0));
      ctx.fillStyle = hg;
      ctx.fillRect(cx - R, y - R * 0.2, R * 2, h + R * 0.6);
      ctx.restore();
    }
    // drop shadow on neighbours
    ctx.save();
    ctx.shadowColor = `rgba(10,4,0,${0.55 - p * 0.3})`;
    ctx.shadowBlur = (7 - p * 3) * u;
    ctx.shadowOffsetX = (2.2 - p) * u;
    ctx.shadowOffsetY = (4 - p * 2) * u;
    ctx.fillStyle = darken(bc, 0.25);
    rrBottom(ctx, x, y, w, h, rad);
    ctx.fill();
    ctx.restore();
    // chamfered body
    const bg = ctx.createLinearGradient(x, 0, x + w, 0);
    bg.addColorStop(0, lighten(bc, 0.1));
    bg.addColorStop(0.12, bc);
    bg.addColorStop(0.88, darken(bc, 0.55));
    bg.addColorStop(1, darken(bc, 0.78));
    ctx.fillStyle = bg;
    rrBottom(ctx, x, y, w, h, rad);
    ctx.fill();
    // top facet
    const inset = w * 0.14;
    const fx = x + inset;
    const fw = w - inset * 2;
    const fh = h * 0.86 - p * 1.5 * u * K.pressDepth;
    const fg = ctx.createLinearGradient(fx, 0, fx + fw, 0);
    fg.addColorStop(0, lighten(bc, 0.16));
    fg.addColorStop(0.25, lighten(bc, 0.07));
    fg.addColorStop(0.7, bc);
    fg.addColorStop(1, darken(bc, 0.35));
    ctx.fillStyle = fg;
    rrBottom(ctx, fx, y, fw, fh, Math.max(1.5, fw * 0.14));
    ctx.fill();
    // glossy sheen
    ctx.save();
    rrBottom(ctx, fx, y, fw, fh, Math.max(1.5, fw * 0.14));
    ctx.clip();
    const sg = ctx.createLinearGradient(0, y, 0, y + fh);
    sg.addColorStop(0, `rgba(255,255,255,${clamp(0.2 * K.gloss, 0, 1)})`);
    sg.addColorStop(0.35, `rgba(255,255,255,${clamp(0.05 * K.gloss, 0, 1)})`);
    sg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = sg;
    ctx.fillRect(fx, y, fw, fh);
    ctx.fillStyle = `rgba(255,255,255,${clamp(0.14 * K.gloss, 0, 1)})`;
    ctx.fillRect(fx + 0.5, y, Math.max(1, fw * 0.12), fh);
    if (st && p > 0.01) {
      const wg = ctx.createLinearGradient(0, y, 0, y + fh);
      wg.addColorStop(0, rgba(st.color, 0.95 * p * wash));
      wg.addColorStop(0.6, rgba(st.color, 0.6 * p * wash));
      wg.addColorStop(1, rgba(st.color, 0.35 * p * wash));
      ctx.fillStyle = wg;
      ctx.fillRect(fx, y, fw, fh);
    } else if (inc.has(k)) {
      const r = inc.get(k)!;
      const wg = ctx.createLinearGradient(0, y, 0, y + fh * 0.5);
      wg.addColorStop(0, rgba(incColor.get(k)!, 0.42 * r * pre));
      wg.addColorStop(1, rgba(incColor.get(k)!, 0));
      ctx.fillStyle = wg;
      ctx.fillRect(fx, y, fw, fh);
    }
    ctx.restore();
    // front chamfer
    const cg = ctx.createLinearGradient(0, y + fh, 0, y + h);
    cg.addColorStop(0, lighten(bc, 0.17));
    cg.addColorStop(1, darken(bc, 0.4));
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.moveTo(fx, y + fh);
    ctx.lineTo(fx + fw, y + fh);
    ctx.lineTo(x + w - w * 0.04, y + h - bcr);
    ctx.lineTo(x + w * 0.04, y + h - bcr);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.7)";
    ctx.lineWidth = 1;
    rrBottom(ctx, x + 0.5, y, w - 1, h - 0.5, rad);
    ctx.stroke();
  }

  drawCheeks(ctx, L, s, spanX0, spanX1);

  // labels
  if (s.keyLabelMode !== "none" && wkw >= 10) {
    const fs = Math.round(clamp(wkw * 0.4, 8, 14 * u) * K.labelScale);
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    for (let k = L.lo; k <= L.hi; k++) {
      const midi = k + 21;
      const black = isBlack(midi);
      const pc = midi % 12;
      const oct = Math.floor(midi / 12) - 1;
      let txt = "";
      switch (s.keyLabelMode) {
        case "onlyC":
          if (pc === 0) txt = `C${oct}`;
          else if (k === 0) txt = "A0";
          break;
        case "allWhite":
          if (!black) txt = noteName(midi, s.useFlats, false) + (pc === 0 ? String(oct) : "");
          break;
        case "all88":
          txt = noteName(midi, s.useFlats, false) + (pc === 0 || k === 0 ? String(oct) : "");
          break;
        case "solfege":
          if (!black) txt = SOLFEGE[pc];
          break;
      }
      if (!txt) continue;
      if (black) {
        if (L.kw[k] < 9) continue;
        ctx.font = `600 ${Math.max(7, fs - 3)}px ${SANS}`;
        ctx.fillStyle = rgba(col.keyLabelBlack, 0.8);
        ctx.fillText(txt, L.kx[k] + L.kw[k] / 2, top + L.bkh - 9 * u);
      } else {
        const st = ks[k];
        const isC = pc === 0;
        ctx.font = `${isC ? 700 : 600} ${fs}px ${SANS}`;
        ctx.fillStyle = st && st.press > 0.5 ? (luminance(st.color) > 0.55 ? "rgba(30,16,4,0.9)" : "#fff") : isC ? col.keyLabelC : col.keyLabel;
        ctx.fillText(txt, L.kx[k] + L.kw[k] / 2, top + kh - 9 * u - (st ? st.press * 2 * u * K.pressDepth : 0));
      }
    }
  }
}

/** Wooden cheek blocks beside a narrow keyboard + soft inner shadow at the ends of the keys. */
export function drawCheeks(ctx: CanvasRenderingContext2D, L: Layout, s: RenderSettings, x0: number, x1: number) {
  const amt = s.finish.cheekBlocks;
  if (amt <= 0) return;
  const { u, keysTop: top, keysH: kh, W } = L;
  const wood = s.colors.frontBoard;
  const block = (xa: number, xb: number, inner: "right" | "left") => {
    if (xb - xa < 2) return;
    const g = ctx.createLinearGradient(xa, 0, xb, 0);
    const a = inner === "right" ? [0.95, 1.5] : [1.5, 0.95];
    g.addColorStop(0, scaleHex(wood, a[0] * 0.8));
    g.addColorStop(1, scaleHex(wood, a[1] * 0.8));
    ctx.fillStyle = g;
    ctx.fillRect(xa, top - 1, xb - xa, kh + 1);
    const wp = getWoodV(ctx);
    if (wp) {
      ctx.save();
      ctx.globalAlpha = clamp(0.9 * s.finish.woodDetail, 0, 1.6);
      ctx.fillStyle = wp;
      ctx.fillRect(xa, top - 1, xb - xa, kh + 1);
      ctx.restore();
    }
    if (s.finish.woodDetail > 0) {
      // lacquered end-grain cap at the front of the block + clear-coat streak
      const cap = Math.max(3, 7 * u);
      const eg = ctx.createLinearGradient(0, top + kh - cap, 0, top + kh);
      eg.addColorStop(0, "rgba(255,226,170,0.0)");
      eg.addColorStop(0.2, "rgba(255,226,170,0.16)");
      eg.addColorStop(1, "rgba(30,14,2,0.42)");
      ctx.fillStyle = eg;
      ctx.fillRect(xa, top + kh - cap, xb - xa, cap);
      for (let r = 0; r < Math.min(6, (xb - xa) / 3); r++) {
        ctx.fillStyle = `rgba(40,20,4,${0.07 + 0.05 * ihash(r * 17 + 3)})`;
        ctx.fillRect(xa, top + kh - cap + (r * cap) / 6, xb - xa, Math.max(0.6, 0.7 * u));
      }
      const cs = ctx.createLinearGradient(xa, 0, xb, 0);
      const sx = inner === "right" ? 0.62 : 0.38;
      cs.addColorStop(0, "rgba(255,240,210,0)");
      cs.addColorStop(sx, `rgba(255,240,210,${0.17 * s.finish.woodDetail})`);
      cs.addColorStop(1, "rgba(255,240,210,0)");
      ctx.fillStyle = cs;
      ctx.fillRect(xa, top, xb - xa, kh);
    }
    // lit edge towards the keys, shadow towards the outside
    const ex = inner === "right" ? xb - 1.5 * u : xa;
    ctx.fillStyle = "rgba(255,214,160,0.3)";
    ctx.fillRect(ex, top, Math.max(1, 1.4 * u), kh);
    const sg = ctx.createLinearGradient(0, top, 0, top + kh);
    sg.addColorStop(0, "rgba(0,0,0,0.55)");
    sg.addColorStop(0.25, "rgba(0,0,0,0.05)");
    sg.addColorStop(1, "rgba(0,0,0,0.3)");
    ctx.fillStyle = sg;
    ctx.fillRect(xa, top, xb - xa, kh);
  };
  block(0, x0, "right");
  block(x1, W, "left");
  // shadow cast by the cheeks onto the first / last key
  const sw = Math.min(14 * u, (x1 - x0) * 0.05);
  const gl = ctx.createLinearGradient(x0, 0, x0 + sw, 0);
  gl.addColorStop(0, `rgba(8,3,0,${clamp(0.3 * amt, 0, 0.8)})`);
  gl.addColorStop(1, "rgba(8,3,0,0)");
  ctx.fillStyle = gl;
  ctx.fillRect(x0, top, sw, kh);
  const gr = ctx.createLinearGradient(x1, 0, x1 - sw, 0);
  gr.addColorStop(0, `rgba(8,3,0,${clamp(0.3 * amt, 0, 0.8)})`);
  gr.addColorStop(1, "rgba(8,3,0,0)");
  ctx.fillStyle = gr;
  ctx.fillRect(x1 - sw, top, sw, kh);
}

/** Engraved maker's plate in the damper rail + a brass screw at each end – seen only by those who look. */
function drawRailPlate(ctx: CanvasRenderingContext2D, L: Layout, s: RenderSettings) {
  const { u, railH, W } = L;
  const y = L.laneH;
  const trim = s.colors.railTrim;
  // screws
  if (railH >= 10) {
    const r = clamp(railH * 0.17, 1.6, 3.4 * u);
    for (const sx of [r * 3.4 + 4 * u, W - r * 3.4 - 4 * u]) {
      const cy = y + railH * 0.56;
      const bd = s.finish.brassDetail;
      if (bd > 0) {
        // cast shadow (light from the upper left falls down-right) + countersink ring
        ctx.fillStyle = `rgba(8,2,0,${clamp(0.5 * bd, 0, 1)})`;
        ctx.beginPath();
        ctx.ellipse(sx + r * 0.32, cy + r * 0.42, r * 1.12, r * 1.05, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(20,8,0,${clamp(0.6 * bd, 0, 1)})`;
        ctx.beginPath();
        ctx.arc(sx, cy, r * 1.22, 0, Math.PI * 2);
        ctx.fill();
      }
      const sg = ctx.createRadialGradient(sx - r * 0.35, cy - r * 0.35, 0, sx, cy, r * 1.2);
      sg.addColorStop(0, lighten(trim, 0.6));
      sg.addColorStop(0.6, trim);
      sg.addColorStop(1, darken(trim, 0.6));
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(sx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(20,8,0,0.65)";
      ctx.lineWidth = Math.max(0.8, r * 0.28);
      ctx.beginPath();
      ctx.moveTo(sx - r * 0.7, cy + r * 0.25);
      ctx.lineTo(sx + r * 0.7, cy - r * 0.25);
      ctx.stroke();
      if (bd > 0) {
        // the slot's lit lower lip and a pin-point specular on the dome
        ctx.strokeStyle = rgba(lighten(trim, 0.7), clamp(0.55 * bd, 0, 1));
        ctx.lineWidth = Math.max(0.5, r * 0.12);
        ctx.beginPath();
        ctx.moveTo(sx - r * 0.7, cy + r * 0.25 + r * 0.26);
        ctx.lineTo(sx + r * 0.7, cy - r * 0.25 + r * 0.26);
        ctx.stroke();
        ctx.fillStyle = `rgba(255,252,235,${clamp(0.8 * bd, 0, 1)})`;
        ctx.beginPath();
        ctx.arc(sx - r * 0.42, cy - r * 0.5, Math.max(0.5, r * 0.14), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  const text = (s.finish.brandText || "").trim();
  if (!s.finish.brandPlate || !text || railH < 11 || W < 560) return;
  const fs = clamp(railH * 0.44, 6.5, 13 * u);
  ctx.save();
  ctx.font = `600 ${fs.toFixed(2)}px ${SANS}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  setSpacing(ctx, fs * 0.42);
  const label = text.toUpperCase();
  const tw = ctx.measureText(label).width;
  const cx = W / 2 + fs * 0.21; // letter-spacing adds trailing space
  const by = y + railH * 0.5 + fs * 0.36;
  // hairlines flanking the name
  const hl = Math.min(W * 0.09, 120 * u);
  for (const dir of [-1, 1]) {
    const x0 = cx - fs * 0.21 + dir * (tw / 2 + fs * 1.1);
    const lg = ctx.createLinearGradient(x0, 0, x0 + dir * hl, 0);
    lg.addColorStop(0, rgba(trim, 0.5));
    lg.addColorStop(1, rgba(trim, 0));
    ctx.fillStyle = lg;
    ctx.fillRect(Math.min(x0, x0 + dir * hl), by - fs * 0.34, hl, 1);
  }
  if (s.finish.brassDetail > 0) {
    // the stamped plate: a bevelled brass recess with an inner shadow along its upper edge
    const pw = tw + fs * 3.2;
    const ph = railH * 0.72;
    const px = cx - fs * 0.21 - pw / 2;
    const py = y + railH * 0.5 - ph / 2;
    const bdp = s.finish.brassDetail;
    const pg = ctx.createLinearGradient(0, py, 0, py + ph);
    pg.addColorStop(0, `rgba(10,3,0,${0.5 * bdp})`);
    pg.addColorStop(0.35, `rgba(10,3,0,${0.12 * bdp})`);
    pg.addColorStop(1, `rgba(255,226,160,${0.1 * bdp})`);
    ctx.fillStyle = pg;
    rr(ctx, px, py, pw, ph, ph * 0.3);
    ctx.fill();
    ctx.strokeStyle = rgba(lighten(trim, 0.5), 0.35 * Math.min(1, bdp));
    ctx.lineWidth = 1;
    rr(ctx, px + 0.5, py + 0.5, pw - 1, ph - 1, ph * 0.3);
    ctx.stroke();
  }
  // stamped lettering: shadow below, highlight above, gold in between
  ctx.fillStyle = "rgba(10,2,0,0.65)";
  ctx.fillText(label, cx, by + Math.max(0.8, 0.9 * u));
  ctx.fillStyle = rgba(lighten(trim, 0.7), 0.4);
  ctx.fillText(label, cx, by - 0.6);
  const tg = ctx.createLinearGradient(0, by - fs, 0, by);
  tg.addColorStop(0, rgba(lighten(trim, 0.45), 0.9));
  tg.addColorStop(1, rgba(darken(trim, 0.15), 0.82));
  ctx.fillStyle = tg;
  ctx.fillText(label, cx, by);
  setSpacing(ctx, 0);
  ctx.restore();
}

/* -------------------------------- minimap -------------------------------- */

function drawMinimap(ctx: CanvasRenderingContext2D, L: Layout, s: RenderSettings, ks: (KeyState | null)[]) {
  const { u, W, miniY: y, miniH: h } = L;
  const col = s.colors;
  const bg = ctx.createLinearGradient(0, y, 0, y + h);
  bg.addColorStop(0, scaleHex(col.hudPanel, 0.62));
  bg.addColorStop(1, scaleHex(col.hudPanel, 0.3));
  ctx.fillStyle = bg;
  ctx.fillRect(0, y, W, h);
  ctx.fillStyle = rgba(col.accentLight, 0.1);
  ctx.fillRect(0, y, W, 1);

  const pad = 18 * u;
  const mw = W - pad * 2;
  const wk = mw / 52;
  const kTop = y + 7 * u;
  const kH = h - 21 * u;
  const bH = kH * 0.62;
  const xs = (k: number) => pad + (isBlack(k + 21) ? (WHITE_IDX[k] + 1) * wk - wk * 0.3 : WHITE_IDX[k] * wk);
  const wIn = darken(col.whiteKey, 0.16);
  const wOut = darken(col.whiteKey, 0.55);
  const wHit = darken(col.whiteKey, 0.13);
  const bIn = lighten(col.blackKey, 0.04);
  const bOut = col.blackKey;
  const bHit = lighten(col.blackKey, 0.1);
  // range window
  const x1 = pad + WHITE_IDX[L.lo] * wk;
  const x2 = pad + (WHITE_IDX[L.hi] + 1) * wk;
  // whites
  for (let k = 0; k < 88; k++) {
    if (isBlack(k + 21)) continue;
    const st = ks[k];
    const inRange = k >= L.lo && k <= L.hi;
    ctx.fillStyle = st && st.press > 0.05 ? mix(wHit, st.color, 0.4 + 0.6 * st.press) : inRange ? wIn : wOut;
    rr(ctx, xs(k) + 0.4, kTop, wk - 0.8, kH, Math.min(2, wk * 0.2));
    ctx.fill();
  }
  for (let k = 0; k < 88; k++) {
    if (!isBlack(k + 21)) continue;
    const st = ks[k];
    const inRange = k >= L.lo && k <= L.hi;
    ctx.fillStyle = st && st.press > 0.05 ? mix(bHit, st.color, 0.3 + 0.7 * st.press) : inRange ? bIn : bOut;
    rr(ctx, xs(k), kTop, wk * 0.6, bH, Math.min(1.6, wk * 0.15));
    ctx.fill();
  }
  // dim outside range
  if (L.lo > 0 || L.hi < 87) {
    ctx.fillStyle = "rgba(8,6,4,0.45)";
    ctx.fillRect(pad, kTop, x1 - pad, kH);
    ctx.fillRect(x2, kTop, pad + mw - x2, kH);
  }
  // viewport bracket
  ctx.strokeStyle = rgba(col.accent, 0.9);
  ctx.lineWidth = Math.max(1, 1.4 * u);
  rr(ctx, x1, kTop - 2 * u, x2 - x1, kH + 4 * u, 3 * u);
  ctx.stroke();
  // octave labels
  ctx.font = `600 ${Math.round(8.5 * u)}px ${SANS}`;
  ctx.textAlign = "center";
  ctx.fillStyle = rgba(col.hudSub, 0.55);
  for (let k = 3; k < 88; k += 12) {
    const oct = Math.floor((k + 21) / 12) - 1;
    ctx.fillText(`C${oct}`, xs(k) + wk / 2, y + h - 5 * u);
  }
}

/* ---------------------------------- HUD ---------------------------------- */

function glass(ctx: CanvasRenderingContext2D, s: RenderSettings, x: number, y: number, w: number, h: number, r: number, minAlpha = 0) {
  const col = s.colors;
  const a = Math.max(s.hud.panelAlpha, minAlpha);
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, rgba(col.hudPanel, a));
  g.addColorStop(1, rgba(scaleHex(col.hudPanel, 0.47), a));
  ctx.fillStyle = g;
  rr(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = rgba(col.accentLight, 0.16);
  ctx.lineWidth = 1;
  rr(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r);
  ctx.stroke();
  ctx.strokeStyle = rgba(col.hudText, 0.06);
  rr(ctx, x + 1.5, y + 1.5, w - 3, h - 3, Math.max(0, r - 1));
  ctx.stroke();
}

function drawHud(ctx: CanvasRenderingContext2D, L: Layout, s: RenderSettings, song: Song, bpm: number, pedal: boolean, measure: number) {
  const u = L.u * s.hud.scale;
  const col = s.colors;
  const x = 16 * u;
  const y = 14 * u;
  const pad = 14 * u;
  const maxW = Math.min(L.W * 0.46, 560 * u);
  const title = song.name.split(" — ")[0];
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = `700 ${Math.round(20 * u)}px ${SERIF}`;
  const tShown = fitText(ctx, title, maxW - pad * 2);
  const tW = ctx.measureText(tShown).width;
  const sub = [song.artist, song.piece].filter(Boolean).join("  ·  ");
  ctx.font = `600 ${Math.round(9.5 * u)}px ${SANS}`;
  setSpacing(ctx, 1.4 * u);
  const subShown = sub ? fitText(ctx, sub.toUpperCase(), maxW - pad * 2) : "";
  const sW = ctx.measureText(subShown).width;
  setSpacing(ctx, 0);

  // chips
  const chips: { text: string; accent?: boolean }[] = [{ text: `♩ = ${Math.round(bpm)}`, accent: true }];
  if (measure > 0) chips.push({ text: `m. ${measure}` });
  if (s.analysis.showKeyChip && song.key.confidence >= 0.3) chips.push({ text: song.key.name });
  if (pedal) chips.push({ text: "Ped." });
  ctx.font = `600 ${Math.round(11 * u)}px ${SANS}`;
  const chipH = 20 * u;
  const chipGap = 6 * u;
  const chipWs = chips.map((c) => ctx.measureText(c.text).width + 16 * u);
  const chipsW = chipWs.reduce((a, b) => a + b, 0) + chipGap * (chips.length - 1);

  const contentW = Math.max(tW, sW, chipsW);
  const boxW = contentW + pad * 2 + 6 * u;
  const boxH = pad * 2 + 22 * u + (subShown ? 17 * u : 0) + chipH + 8 * u;
  glass(ctx, s, x, y, boxW, boxH, 12 * u);

  // accent bar
  const ag = ctx.createLinearGradient(0, y, 0, y + boxH);
  ag.addColorStop(0, lighten(col.accent, 0.22));
  ag.addColorStop(1, darken(col.accent, 0.28));
  ctx.fillStyle = ag;
  rr(ctx, x + 5 * u, y + 14 * u, 2.5 * u, boxH - 28 * u, 1.5 * u);
  ctx.fill();

  let cy = y + pad + 17 * u;
  const cx = x + pad + 4 * u;
  ctx.font = `700 ${Math.round(20 * u)}px ${SERIF}`;
  ctx.fillStyle = col.hudText;
  ctx.fillText(tShown, cx, cy);
  if (subShown) {
    cy += 18 * u;
    ctx.font = `600 ${Math.round(9.5 * u)}px ${SANS}`;
    setSpacing(ctx, 1.4 * u);
    ctx.fillStyle = rgba(col.hudSub, 0.85);
    ctx.fillText(subShown, cx, cy);
    setSpacing(ctx, 0);
  }
  cy += 10 * u;
  let chipX = cx;
  const accentText = lighten(col.accent, 0.4);
  const plainText = mix(col.hudText, col.hudPanel, 0.2);
  chips.forEach((c, i) => {
    const w = chipWs[i];
    ctx.fillStyle = c.accent ? rgba(col.accent, 0.16) : rgba(col.hudText, 0.07);
    rr(ctx, chipX, cy, w, chipH, chipH / 2);
    ctx.fill();
    ctx.strokeStyle = c.accent ? rgba(col.accent, 0.5) : rgba(col.hudText, 0.14);
    ctx.lineWidth = 1;
    rr(ctx, chipX + 0.5, cy + 0.5, w - 1, chipH - 1, chipH / 2);
    ctx.stroke();
    ctx.font = `600 ${Math.round(11 * u)}px ${SANS}`;
    ctx.fillStyle = c.accent ? accentText : plainText;
    ctx.textAlign = "center";
    ctx.fillText(c.text, chipX + w / 2, cy + chipH / 2 + 4 * u);
    ctx.textAlign = "left";
    chipX += w + chipGap;
  });
}

function drawChordBanner(ctx: CanvasRenderingContext2D, L: Layout, s: RenderSettings, chord: Chord, t: number) {
  const u = L.u * s.hud.chordScale;
  const col = s.colors;
  // chords that follow one another swap instantly (with a small settle); an isolated chord fades in and out
  const sinceStart = t - chord.start;
  const fadeIn = chord.follows ? 0.5 + 0.5 * clamp(sinceStart / 0.12, 0, 1) : clamp(sinceStart / 0.14, 0, 1);
  const fadeOut = chord.chained ? 1 : clamp((chord.shownEnd - t) / 0.24, 0, 1);
  const a = Math.min(fadeIn, fadeOut);
  if (a <= 0.01) return;
  const settle = chord.follows ? (1 - clamp(sinceStart / 0.16, 0, 1)) * 5 * u : (1 - a) * -6 * u;

  // typography: root large, quality as a raised superscript, slash bass slightly smaller
  const rootPx = Math.round(34 * u);
  const qualPx = Math.round(19 * u);
  const bassPx = Math.round(26 * u);
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.font = `italic 700 ${rootPx}px ${SERIF}`;
  const rootW = ctx.measureText(chord.root).width;
  ctx.font = `italic 600 ${qualPx}px ${SERIF}`;
  const qualW = chord.quality ? ctx.measureText(chord.quality).width + 1.5 * u : 0;
  const bassText = chord.bass ? "/" + chord.bass : "";
  ctx.font = `italic 600 ${bassPx}px ${SERIF}`;
  const bassW = bassText ? ctx.measureText(bassText).width + 1 * u : 0;
  const symW = rootW + qualW + bassW;

  // second line: numeral · chord tones
  const showTones = s.analysis.showChordTones && chord.tones.length > 0;
  const hasLine2 = !!chord.roman || showTones;
  ctx.font = `600 ${Math.round(11 * u)}px ${SANS}`;
  setSpacing(ctx, 0.8 * u);
  const romanW = chord.roman ? ctx.measureText(chord.roman).width : 0;
  setSpacing(ctx, 0);
  ctx.font = `500 ${Math.round(10.5 * u)}px ${SANS}`;
  const toneGap = 7 * u;
  const toneWs = showTones ? chord.tones.map((n) => ctx.measureText(n).width) : [];
  const tonesW = toneWs.reduce((p, c) => p + c, 0) + Math.max(0, toneWs.length - 1) * toneGap;
  const divW = chord.roman && showTones ? 16 * u : 0;
  const line2W = romanW + divW + tonesW;

  const w = Math.max(symW, line2W) + 48 * u;
  const h = hasLine2 ? 78 * u : 58 * u;
  const x = L.W / 2 - w / 2;
  const y = 14 * L.u + s.hud.chordOffsetY + settle;
  glass(ctx, s, x, y, w, h, 14 * u, 0.95);

  // accent hairline along the top edge, brightest at the centre
  const hg = ctx.createLinearGradient(x, 0, x + w, 0);
  hg.addColorStop(0, rgba(col.accentLight, 0));
  hg.addColorStop(0.5, rgba(col.accentLight, 0.5));
  hg.addColorStop(1, rgba(col.accentLight, 0));
  ctx.fillStyle = hg;
  ctx.fillRect(x + 16 * u, y + 1, w - 32 * u, 1);

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  let px = L.W / 2 - symW / 2;
  const base = y + 39 * u;
  ctx.fillStyle = col.chordText;
  ctx.font = `italic 700 ${rootPx}px ${SERIF}`;
  ctx.fillText(chord.root, px, base);
  px += rootW;
  if (chord.quality) {
    ctx.font = `italic 600 ${qualPx}px ${SERIF}`;
    ctx.fillStyle = rgba(col.chordText, 0.92);
    ctx.fillText(chord.quality, px + 1.5 * u, base - 12 * u);
    px += qualW;
  }
  if (bassText) {
    ctx.font = `italic 600 ${bassPx}px ${SERIF}`;
    ctx.fillStyle = rgba(col.chordText, 0.78);
    ctx.fillText(bassText, px, base);
  }

  if (hasLine2) {
    const ly = y + 62 * u;
    let lx = L.W / 2 - line2W / 2;
    if (chord.roman) {
      ctx.font = `600 ${Math.round(11 * u)}px ${SANS}`;
      setSpacing(ctx, 0.8 * u);
      ctx.fillStyle = col.chordRoman;
      ctx.fillText(chord.roman, lx, ly);
      setSpacing(ctx, 0);
      lx += romanW;
      if (showTones) {
        ctx.fillStyle = rgba(col.hudText, 0.22);
        ctx.fillRect(lx + divW / 2, ly - 9 * u, 1, 11 * u);
        lx += divW;
      }
    }
    if (showTones) {
      const bassName = chord.bass ?? chord.root;
      ctx.font = `500 ${Math.round(10.5 * u)}px ${SANS}`;
      chord.tones.forEach((n, i) => {
        const isBass = n === bassName;
        ctx.fillStyle = isBass ? col.chordText : rgba(col.hudSub, 0.78);
        ctx.fillText(n, lx, ly);
        if (isBass) {
          ctx.fillStyle = rgba(col.chordRoman, 0.8);
          ctx.fillRect(lx, ly + 2.5 * u, toneWs[i], Math.max(1, 1.1 * u)); // the sounding bass is underlined
        }
        lx += toneWs[i] + toneGap;
      });
    }
  }
  ctx.restore();
}

/* ------------------------------ post-processing ------------------------------ */

const scratch = new Map<string, AnyCanvas>();
function getScratch(w: number, h: number) {
  const k = `${w}x${h}`;
  let c = scratch.get(k);
  if (!c) {
    if (scratch.size >= 2) scratch.clear();
    c = canvasFactory(w, h);
    scratch.set(k, c);
  }
  return c;
}

function applyPost(ctx: CanvasRenderingContext2D, W: number, H: number, dpr: number, p: PostStyle) {
  const needsFilter = p.brightness !== 1 || p.contrast !== 1 || p.saturation !== 1 || p.hue !== 0 || p.grayscale > 0 || p.sepia > 0;
  const needsBloom = p.bloom > 0;
  if (!needsFilter && !needsBloom && p.vignette <= 0) return;
  const pw = Math.round(W * dpr);
  const ph = Math.round(H * dpr);
  const canFilter = typeof (ctx as unknown as { filter?: unknown }).filter === "string";
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if ((needsFilter || needsBloom) && (canFilter || needsFilter)) {
    const tmp = getScratch(pw, ph);
    const tg = tmp.getContext("2d")!;
    tg.setTransform(1, 0, 0, 1, 0, 0);
    tg.globalCompositeOperation = "copy";
    tg.globalAlpha = 1;
    tg.drawImage(ctx.canvas, 0, 0);
    if (needsFilter) {
      if (canFilter) {
        const f: string[] = [];
        if (p.brightness !== 1) f.push(`brightness(${p.brightness})`);
        if (p.contrast !== 1) f.push(`contrast(${p.contrast})`);
        if (p.saturation !== 1) f.push(`saturate(${p.saturation})`);
        if (p.hue !== 0) f.push(`hue-rotate(${p.hue}deg)`);
        if (p.grayscale > 0) f.push(`grayscale(${p.grayscale})`);
        if (p.sepia > 0) f.push(`sepia(${p.sepia})`);
        const c2 = ctx as unknown as { filter: string };
        c2.filter = f.join(" ");
        ctx.globalCompositeOperation = "copy";
        ctx.drawImage(tmp, 0, 0);
        c2.filter = "none";
      } else {
        pixelGrade(ctx, pw, ph, p); // browsers without canvas filters (older Safari)
      }
    }
    if (needsBloom && canFilter) {
      const c2 = ctx as unknown as { filter: string };
      c2.filter = `blur(${Math.max(1, p.bloomRadius * dpr)}px) brightness(1.25) contrast(1.15)`;
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = clamp(p.bloom, 0, 1.5);
      ctx.drawImage(tmp, 0, 0);
      c2.filter = "none";
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  if (p.vignette > 0) {
    const r = Math.hypot(pw, ph) / 2;
    const vg = ctx.createRadialGradient(pw / 2, ph / 2, r * 0.35, pw / 2, ph / 2, r);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, `rgba(0,0,0,${clamp(p.vignette, 0, 1)})`);
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, pw, ph);
  }
  ctx.restore();
}

function pixelGrade(ctx: CanvasRenderingContext2D, w: number, h: number, p: PostStyle) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) lut[i] = ((i / 255 - 0.5) * p.contrast + 0.5) * 255 * p.brightness;
  for (let i = 0; i < d.length; i += 4) {
    let r = lut[d[i]];
    let g = lut[d[i + 1]];
    let b = lut[d[i + 2]];
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const sat = p.saturation * (1 - p.grayscale);
    r = l + (r - l) * sat;
    g = l + (g - l) * sat;
    b = l + (b - l) * sat;
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
  }
  ctx.putImageData(img, 0, 0);
}

/** offscreen canvas made with the same factory as the renderer (browser, export worker or tests) */
export function newCanvas(w: number, h: number): HTMLCanvasElement {
  return canvasFactory(w, h);
}
