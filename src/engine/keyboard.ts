/* ------------------------------------------------------------------ *
 *  Fahh MIDI · physically based keyboard
 *
 *  Draws the keys from one continuous "depress" value per key (see keypress.ts).
 *  Every cue — surface drop, nose sinking under the slip, exposed neighbour walls,
 *  dark channel, contact shadows, tilt shading, black-key shadow, overhang shadow,
 *  colour bounce — is a function of that value, so a key reads as ONE object.
 *
 *  One light model: a key-light direction (finish.lightAngle) + fill + ambient. Every
 *  highlight, shadow offset and bevel derives from it.
 *
 *  Geometry is untouched: an un-pressed key occupies exactly the rectangle of the
 *  original renderer. Everything is deterministic: textures use an integer hash keyed by
 *  position / key index, never Math.random. Static layers are sprites cached per size.
 * ------------------------------------------------------------------ */
import { SOLFEGE, isBlack, noteName, type NoteEvent } from "./midi";
import { ihash } from "./keypress";
import { SANS, clamp, drawCheeks, darken, lighten, luminance, mix, newCanvas, noteColor, rgba, rrBottom, type Layout } from "./renderer";
import type { RenderSettings } from "./types";

type Ctx = CanvasRenderingContext2D;
type Cv = HTMLCanvasElement;

export interface PressView {
  d: number; // physical depress, -0.03 … 1.06
  vf: number; // velocity factor 0..1
  color: string; // note colour driving the key
}

/* ------------------------------ sprite helpers ------------------------------ */

type Px = (x: number, y: number, o: number[]) => void;

/** Build a w×h (logical px) RGBA sprite at S× resolution from a per-pixel function. Alpha is dithered. */
function mk(wL: number, hL: number, S: number, fn: Px, seed: number): Cv {
  const w = Math.max(1, Math.ceil(wL * S));
  const h = Math.max(1, Math.ceil(hL * S));
  const c = newCanvas(w, h);
  const g = c.getContext("2d")!;
  const img = g.createImageData(w, h);
  const d = img.data;
  const o = [0, 0, 0, 0];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      o[0] = 0;
      o[1] = 0;
      o[2] = 0;
      o[3] = 0;
      fn((x + 0.5) / S, (y + 0.5) / S, o);
      const i = (y * w + x) * 4;
      d[i] = o[0];
      d[i + 1] = o[1];
      d[i + 2] = o[2];
      d[i + 3] = clamp(o[3], 0, 1) * 255 + (ihash(x * 131 + y * 977 + seed * 31) - 0.5);
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

const sstep = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
/** smooth 1-D value noise from the integer hash */
const vnoise = (x: number, seed: number) => {
  const i = Math.floor(x);
  const f = x - i;
  const a = ihash(i * 7919 + seed * 104729);
  const b = ihash((i + 1) * 7919 + seed * 104729);
  const t = f * f * (3 - 2 * f);
  return a + (b - a) * t;
};
/** signed distance to a box open towards the top (shadow caster shape) */
const sdBoxOpenTop = (px: number, py: number, x0: number, x1: number, yb: number) => {
  const dx = Math.max(x0 - px, px - x1);
  const dy = py - yb;
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0);
};

interface Sprites {
  key: string;
  ivTex: Cv;
  edge: Cv;
  shL: Cv;
  shR: Cv;
  rear: Cv;
  nose: Cv;
  tilt: Cv;
  wallR: Cv; // wall facing right, rim at the left edge of the sprite
  wallL: Cv; // wall facing left, rim at the right edge
  wallW: number;
  streak: Cv;
  noise: Cv;
  bShadow: (Cv | undefined)[];
  padB: number;
  padTopB: number;
  S: number;
}
let cache: Sprites | null = null;

const NLEVEL = 8;

function build(L: Layout, gapPx: number, S: number, lit: number, lx: number): Sprites {
  const { wkw, keysH: kh, bkw, bkh, u } = L;
  const w = Math.max(2, wkw - gapPx);
  const sc = Math.max(1, wkw / 37); // texture cell size (resolution independent)
  const lipH = Math.max(7, 12 * u);

  // ---- ivory micro-texture: lengthwise fibres, pores, flecks (one tile = 8 key slots)
  const tw = Math.ceil(wkw * 8);
  const ivTex = mk(
    tw,
    kh,
    1,
    (x, y, o) => {
      const X = Math.floor(x / sc);
      const Y = Math.floor(y / sc);
      const f = ihash(X * 3 + 11);
      const fib = f > 0.5 ? (f - 0.5) / 0.5 : 0;
      const slow = 0.35 + 0.65 * vnoise(Y / (kh / sc) * 3.4 + X * 0.21, 3);
      let a = 0;
      let r = 118;
      let g = 90;
      let b = 50;
      if (fib > 0) a = fib * 0.075 * slow;
      else if (f < 0.1) {
        r = 255;
        g = 252;
        b = 238;
        a = 0.06 * slow;
      }
      const pore = ihash(X * 13 + Math.floor(Y / 2) * 71 + 9);
      if (pore > 0.9972) {
        r = 92;
        g = 66;
        b = 32;
        a = 0.2;
      } else if (ihash(X * 17 + Y * 29 + 4) > 0.9988) {
        r = 255;
        g = 255;
        b = 248;
        a = 0.3;
      }
      o[0] = r;
      o[1] = g;
      o[2] = b;
      o[3] = a;
    },
    1,
  );

  // ---- warm sub-surface tint toward the thin edges of an ivory key
  const edge = mk(
    w,
    kh,
    S,
    (x, y, o) => {
      const e = Math.exp(-x / (0.1 * w)) + Math.exp(-(w - x) / (0.1 * w));
      const n = Math.exp(-(kh - y) / (lipH * 1.4)) * 0.5;
      o[0] = 206;
      o[1] = 150;
      o[2] = 74;
      o[3] = 0.13 * (e * (0.6 + 0.4 * (y / kh)) + n);
    },
    2,
  );

  // ---- pressed-key shading sprites (aligned to the key rectangle)
  const sdL = 0.17 * w;
  const contactL = (x: number, y: number) => Math.exp(-x / sdL) * (0.28 + 0.72 * Math.pow(y / kh, 1.25));
  const shL = mk(w, kh, S, (x, y, o) => ((o[0] = 22), (o[1] = 9), (o[2] = 2), (o[3] = contactL(x, y))), 3);
  const shR = mk(w, kh, S, (x, y, o) => ((o[0] = 22), (o[1] = 9), (o[2] = 2), (o[3] = contactL(w - x, y))), 4);
  const rear = mk(w, kh, S, (_x, y, o) => ((o[0] = 14), (o[1] = 6), (o[2] = 1), (o[3] = Math.exp(-y / (0.09 * kh)) * 0.85 + Math.exp(-y / (0.28 * kh)) * 0.18)), 5);
  const nose = mk(w, kh, S, (_x, y, o) => ((o[0] = 20), (o[1] = 8), (o[2] = 2), (o[3] = Math.exp(-(kh - y) / (lipH * 0.9)) * 0.9)), 6);
  const tilt = mk(w, kh, S, (_x, y, o) => ((o[0] = 40), (o[1] = 22), (o[2] = 8), (o[3] = Math.pow(y / kh, 1.7))), 7);

  // ---- exposed neighbour walls (ivory, shaded by the light model)
  const wallW = Math.ceil(0.13 * wkw) + 1;
  const wallFn = (rimLeft: boolean, litAmt: number): Px => (x, y, o) => {
    const dep = rimLeft ? x / wallW : 1 - x / wallW; // 0 at the rim, 1 where the wall meets the lower key
    const along = 0.6 + 0.4 * sstep(0, 0.55, y / kh);
    let v = (0.3 + 0.36 * litAmt) * along * (1 - 0.88 * Math.pow(dep, 1.15));
    v += 0.16 * litAmt * Math.exp(-dep / 0.07); // the rim catches light
    o[0] = 214 * v;
    o[1] = 198 * v;
    o[2] = 168 * v;
    o[3] = 1;
  };
  const wallR = mk(wallW, kh, S, wallFn(true, 1 - lit), 8);
  const wallL = mk(wallW, kh, S, wallFn(false, lit), 9);

  // ---- ebony: soft-box streak + cool environment reflection (alpha mask over a black key)
  const streakX = lx <= 0 ? 0.3 : 0.7;
  const streak = mk(
    bkw,
    bkh,
    S,
    (x, y, o) => {
      const xn = x / bkw;
      const yn = y / bkh;
      const band = Math.exp(-Math.pow((xn - streakX) / 0.085, 2)) + 0.3 * Math.exp(-Math.pow((xn - (1 - streakX)) / 0.04, 2));
      const fade = sstep(0, 0.08, yn) * (1 - sstep(0.4, 0.86, yn));
      const env = 0.5 * Math.pow(1 - yn, 3);
      const a = band * fade;
      o[0] = 255 * a + 128 * env * (1 - a);
      o[1] = 255 * a + 156 * env * (1 - a);
      o[2] = 255 * a + 196 * env * (1 - a);
      o[3] = a * 0.3 + env * 0.045;
    },
    10,
  );

  // ---- seeded blue-noise-ish dither for dark gradients (video safe, static in canvas space)
  const noise = mk(
    128,
    128,
    1,
    (x, y, o) => {
      const v = ihash(Math.floor(x) * 4099 + Math.floor(y) * 131 + 77) > 0.5 ? 255 : 0;
      o[0] = v;
      o[1] = v;
      o[2] = v;
      o[3] = 1.6 / 255;
    },
    11,
  );

  const padB = Math.ceil(0.55 * wkw);
  const padTopB = Math.ceil(0.3 * padB);
  return { key: "", ivTex, edge, shL, shR, rear, nose, tilt, wallR, wallL, wallW, streak, noise, bShadow: new Array(NLEVEL + 1), padB, padTopB, S };
}

/** multi-layer soft shadow of a black key; `ex` = how far it reaches (short & tight when the key is down) */
function blackShadow(c: Sprites, L: Layout, ex: number, lx: number): Cv {
  const { wkw, bkw, bkh } = L;
  const pad = c.padB;
  const padTop = c.padTopB;
  const W = bkw + pad * 2;
  const H = bkh + pad + padTop;
  const ox0 = -lx * 0.1 * wkw;
  const oy0 = 0.105 * wkw;
  const layers = [
    { A: 0.6, sg: 0.028 * wkw, k: 0.22 },
    { A: 0.36, sg: 0.085 * wkw * (0.55 + 0.45 * ex), k: 1 },
    { A: 0.2, sg: 0.2 * wkw * (0.55 + 0.45 * ex), k: 1.9 },
  ];
  return mk(
    W,
    H,
    c.S,
    (x, y, o) => {
      let t = 1;
      for (const l of layers) {
        const sd = sdBoxOpenTop(x - ox0 * ex * l.k, y - oy0 * ex * l.k, pad, pad + bkw, padTop + bkh);
        t *= 1 - l.A * (1 - sstep(-l.sg, l.sg, sd));
      }
      o[0] = 8;
      o[1] = 3;
      o[2] = 0;
      o[3] = 1 - t;
    },
    20,
  );
}

/* ------------------------------ main draw ------------------------------ */

export function drawKeysPhysical(
  ctx: Ctx,
  L: Layout,
  s: RenderSettings,
  pv: (PressView | null)[],
  incoming: NoteEvent[],
  t: number,
  dpr: number,
) {
  const { u, keysTop: top, keysH: kh, wkw, bkw, bkh } = L;
  const K = s.keys;
  const F = s.finish;
  const col = s.colors;
  const gl = s.glow;
  const pd = K.pressDepth;
  const gapPx = Math.max(wkw > 3 ? 1 : 0, wkw * K.gap);
  const radius = clamp(wkw * 0.16 * K.cornerRadius, 0, Math.max(6.5 * u, 6.5 * u * K.cornerRadius));

  /* ---- one light model ---- */
  const ang = (F.lightAngle * Math.PI) / 180;
  const lx = Math.sin(ang); // <0: light comes from the left
  const lit = clamp(0.5 - lx * 0.8, 0.05, 0.95); // weight of left-facing surfaces
  const fill = clamp(F.lightFill, 0, 3);
  const amb = clamp(F.lightAmbient, 0, 3);
  const hiL = clamp(lit + 0.12 * fill, 0, 1);
  const hiR = clamp(1 - lit + 0.12 * fill, 0, 1);
  const shadeL = clamp(1 - lit, 0, 1);
  const shadeR = clamp(lit, 0, 1);

  /* ---- sprites (cached per size / light) ---- */
  const S = Math.max(1, Math.min(3, dpr));
  const ck = [wkw.toFixed(2), kh, bkw.toFixed(2), bkh.toFixed(1), gapPx.toFixed(2), u.toFixed(3), S, F.lightAngle, F.lightFill].join("|");
  if (!cache || cache.key !== ck) {
    cache = build(L, gapPx, S, lit, lx);
    cache.key = ck;
  }
  const C = cache;

  /* ---- per key depress ---- */
  const D = new Float64Array(88);
  for (let k = L.lo; k <= L.hi; k++) {
    const p = pv[k];
    D[k] = p ? Math.max(0, p.d) : 0;
  }
  const prevWhite = (k: number) => {
    let j = k - 1;
    if (j >= L.lo && isBlack(j + 21)) j--;
    return j >= L.lo ? j : -1;
  };
  const nextWhite = (k: number) => {
    let j = k + 1;
    if (j <= L.hi && isBlack(j + 21)) j++;
    return j <= L.hi ? j : -1;
  };

  /* ---- shared gradients ---- */
  const wc = col.whiteKey;
  const iv = [darken(wc, 0.13), darken(wc, 0.025), wc, darken(wc, 0.05), darken(wc, 0.17)];
  const ivory = ctx.createLinearGradient(0, top, 0, top + kh);
  ivory.addColorStop(0, iv[0]);
  ivory.addColorStop(0.06, iv[1]);
  ivory.addColorStop(0.5, iv[2]);
  ivory.addColorStop(0.88, iv[3]);
  ivory.addColorStop(1, iv[4]);
  // soft-box band reflected along the ivory (follows the key's pitch when pressed)
  const bandY = top + kh * 0.6;
  const bandH = kh * 0.17;
  const band = ctx.createLinearGradient(0, bandY - bandH, 0, bandY + bandH);
  band.addColorStop(0, "rgba(255,255,255,0)");
  band.addColorStop(0.5, "rgba(255,255,255,1)");
  band.addColorStop(1, "rgba(255,255,255,0)");

  const inc = new Map<number, number>();
  const incColor = new Map<number, string>();
  if (s.showIncomingKeyPreview) {
    for (const n of incoming) {
      const ramp = 1 - (n.start - t) / s.incomingLookAheadSeconds;
      if (!inc.has(n.key) || ramp > inc.get(n.key)!) inc.set(n.key, ramp);
    }
  }
  for (const n of incoming) if (!incColor.has(n.key)) incColor.set(n.key, noteColor(n, s.colorMode, col));
  const wash = gl.keyWash;
  const pre = gl.incomingKey;

  const spanX0 = L.kx[L.lo];
  const spanX1 = L.kx[L.hi] + L.kw[L.hi];

  /* ---- keybed: the dark recess + felt fibres + grain ---- */
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

  const texAmt = F.keyGrain > 0 ? clamp(F.keyGrain * F.ivoryDetail, 0, 3) : 0;
  const cueDrop = F.cueDrop * pd;
  const cNose = F.cueNose;
  const cSide = F.cueSideWalls;
  const cChan = F.cueChannel;
  const cCont = F.cueContact;
  const cTilt = F.cueTilt;
  const cBlack = F.cueBlackKeys;
  const cOver = F.cueOverhang;
  const cBounce = F.cueBounce;
  const lipH0 = Math.max(7, 12 * u);
  const wallPx = 0.1 * wkw * pd;

  /* =============================== WHITE KEYS =============================== */
  for (let k = L.lo; k <= L.hi; k++) {
    if (isBlack(k + 21)) continue;
    const st = pv[k];
    const dp = D[k];
    const pressed = dp > 0.004;
    const xx = L.kx[k] + gapPx / 2;
    const ww = L.kw[k] - gapPx;
    const lw = prevWhite(k);
    const rw = nextWhite(k);
    const dl = lw >= 0 ? D[lw] : 0;
    const dr = rw >= 0 ? D[rw] : 0;
    // cue 3: the neighbour walls revealed — proportional to how much lower this key is than each neighbour
    const wl = Math.max(0, dp - dl) * wallPx * cSide;
    const wr = Math.max(0, dp - dr) * wallPx * cSide;
    // cue 1: surface drop with foreshortening (rear sinks under the rail, whole top face shrinks)
    const g0 = dp * 0.012 * wkw * cueDrop;
    const x0 = xx + wl + g0;
    const x1 = xx + ww - wr - g0;
    const yTop = top + dp * 0.07 * wkw * cueDrop;
    const yBot = top + kh - dp * 0.045 * wkw * cueDrop; // cue 2: nose sinks under the slip
    const fw = x1 - x0;
    const fh = yBot - yTop;
    const vfk = st ? 0.7 + 0.3 * st.vf : 1;
    const dS = dp * vfk; // shadow strength grows with velocity

    // exposed neighbour walls (drawn first, the key top sits in front)
    if (wl > 0.25) {
      const yS = lw >= 0 && k - lw === 2 ? top + L.bkh : yTop;
      ctx.drawImage(C.wallR, xx, yS, wl + g0 + 0.5, yBot - yS - 0.0);
    }
    if (wr > 0.25) {
      const yS = rw >= 0 && rw - k === 2 ? top + L.bkh : yTop;
      ctx.drawImage(C.wallL, xx + ww - wr - g0 - 0.5, yS, wr + g0 + 0.5, yBot - yS);
    }

    const face = () => rrBottom(ctx, x0, yTop, fw, fh, radius);

    // body
    ctx.fillStyle = ivory;
    face();
    ctx.fill();

    // per-key tonal variation + ivory micro texture + warm thin-edge tint
    if (F.keyVariance > 0) {
      const hv = ihash(k * 977 + 17);
      ctx.fillStyle = hv > 0.5 ? `rgba(255,252,238,${(hv - 0.5) * 0.06 * F.keyVariance})` : `rgba(112,84,40,${(0.5 - hv) * 0.08 * F.keyVariance})`;
      face();
      ctx.fill();
    }
    if (texAmt > 0 || F.ivoryDetail > 0) {
      ctx.save();
      face();
      ctx.clip();
      if (texAmt > 0) {
        ctx.globalAlpha = clamp(texAmt, 0, 1);
        ctx.drawImage(C.ivTex, xx - (k % 8) * wkw, top);
      }
      if (F.ivoryDetail > 0) {
        ctx.globalAlpha = clamp(F.ivoryDetail, 0, 1.5);
        ctx.drawImage(C.edge, xx, top, ww, kh);
      }
      ctx.restore();
    }

    // colour wash on press (kept: it is the note-colour identity) — shading is layered ON TOP of it
    if (st && dp > 0.01) {
      const p = Math.min(1, dp);
      ctx.save();
      face();
      ctx.clip();
      const wg = ctx.createLinearGradient(0, yTop, 0, yBot);
      wg.addColorStop(0, rgba(st.color, 0.92 * p * wash));
      wg.addColorStop(0.45, rgba(st.color, 0.62 * p * wash));
      wg.addColorStop(1, rgba(st.color, 0.28 * p * wash));
      ctx.fillStyle = wg;
      ctx.fillRect(x0, yTop, fw, fh);
      ctx.restore();
    } else if (inc.has(k)) {
      const r = inc.get(k)!;
      const c = incColor.get(k)!;
      ctx.save();
      face();
      ctx.clip();
      const wg = ctx.createLinearGradient(0, yTop, 0, yTop + fh * 0.5);
      wg.addColorStop(0, rgba(c, 0.34 * r * pre));
      wg.addColorStop(1, rgba(c, 0));
      ctx.fillStyle = wg;
      ctx.fillRect(x0, yTop, fw, fh);
      ctx.restore();
    }

    // soft-box band: slides rearwards and dims as the key tilts (cue 6)
    if (K.gloss > 0) {
      if (!pressed) {
        ctx.globalAlpha = clamp(0.085 * K.gloss, 0, 1);
        ctx.fillStyle = band;
        face();
        ctx.fill();
        ctx.globalAlpha = 1;
      } else {
        ctx.save();
        face();
        ctx.clip();
        const slide = -dp * 0.16 * kh * cTilt;
        ctx.translate(0, slide);
        ctx.globalAlpha = clamp(0.085 * K.gloss * (1 - 0.55 * Math.min(1, dp) * cTilt), 0, 1);
        ctx.fillStyle = band;
        ctx.fillRect(x0, yTop - slide, fw, fh);
        ctx.restore();
      }
    }

    if (pressed) {
      ctx.save();
      face();
      ctx.clip();
      // cue 6: tilt — the face turns away from the light, the nose end dims
      ctx.globalAlpha = clamp(0.2 * dS * cTilt * amb, 0, 1);
      ctx.drawImage(C.tilt, x0, yTop, fw, fh);
      // cue 5: neighbours cast soft inner shadows along both long edges, strongest near the front
      ctx.globalAlpha = clamp(0.62 * dS * cCont * amb * (0.45 + 0.55 * shadeL / 0.5 * 0.5) * (shadeL + 0.25), 0, 1);
      ctx.drawImage(C.shL, x0, yTop, ww, fh);
      ctx.globalAlpha = clamp(0.62 * dS * cCont * amb * (shadeR + 0.25) * 0.8, 0, 1);
      ctx.drawImage(C.shR, x1 - ww, yTop, ww, fh);
      // the overhang at the rear end deepens
      ctx.globalAlpha = clamp(0.62 * dS * cCont * amb, 0, 1);
      ctx.drawImage(C.rear, x0, yTop, fw, kh);
      // cue 2: the front rail occludes the nose
      ctx.globalAlpha = clamp(0.55 * dS * cNose * amb, 0, 1);
      ctx.drawImage(C.nose, x0, yBot - kh, fw, kh);
      ctx.restore();
    }

    // side bevels (the lit edge dims when the neighbours' shadow falls on it)
    if (K.bevel > 0) {
      const bw = Math.max(1, wkw * 0.045);
      const bw2 = Math.max(1, wkw * 0.06);
      const dim = 1 - 0.75 * Math.min(1, dp) * cCont;
      ctx.fillStyle = `rgba(255,255,255,${clamp(0.6 * K.bevel * hiL * dim, 0, 1)})`;
      ctx.fillRect(x0 + 0.5, yTop + 2 * u, bw, fh - 10 * u);
      ctx.fillStyle = `rgba(255,255,255,${clamp(0.3 * K.bevel * hiR * hiR * dim, 0, 1)})`;
      ctx.fillRect(x1 - bw - 0.5, yTop + 2 * u, Math.max(1, bw * 0.7), fh - 10 * u);
      ctx.fillStyle = `rgba(90,66,30,${clamp(0.22 * K.bevel * shadeR * 1.2, 0, 1)})`;
      ctx.fillRect(x1 - bw2, yTop + 2 * u, bw2, fh - 10 * u);
      ctx.fillStyle = `rgba(90,66,30,${clamp(0.1 * K.bevel * shadeL, 0, 1)})`;
      ctx.fillRect(x0, yTop + 2 * u, bw * 0.8, fh - 10 * u);
    }

    // cue 2: the front face of the key — shrinks as the nose sinks, crest dims and shifts
    const lipH = lipH0 * (1 - 0.6 * Math.min(1, dp) * cNose);
    const lg = ctx.createLinearGradient(0, yBot - lipH, 0, yBot);
    const crest = clamp(0.7 * K.gloss * (1 - 0.7 * Math.min(1, dp) * cNose), 0, 1);
    lg.addColorStop(0, `rgba(255,255,255,${crest})`);
    lg.addColorStop(0.07, "rgba(255,255,255,0)");
    lg.addColorStop(0.16, "rgba(140,108,60,0.06)");
    lg.addColorStop(0.62, "rgba(120,92,48,0.15)");
    lg.addColorStop(1, "rgba(66,44,18,0.5)");
    ctx.save();
    face();
    ctx.clip();
    ctx.fillStyle = lg;
    ctx.fillRect(x0, yBot - lipH, fw, lipH);
    const gl2 = ctx.createLinearGradient(x0, 0, x0 + fw, 0);
    gl2.addColorStop(0, "rgba(255,255,255,0)");
    gl2.addColorStop(lx <= 0 ? 0.3 : 0.7, `rgba(255,255,255,${clamp(0.16 * K.gloss * (1 - 0.6 * Math.min(1, dp)), 0, 1)})`);
    gl2.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gl2;
    ctx.fillRect(x0, yBot - lipH - 1, fw, Math.max(1.5, 2.2 * u));
    // thin specular line along the rounded nose edge
    ctx.fillStyle = `rgba(255,255,255,${clamp(0.22 * K.gloss * (1 - 0.6 * Math.min(1, dp)), 0, 1)})`;
    ctx.fillRect(x0 + radius * 0.5, yBot - Math.max(1.2, 1.6 * u), fw - radius, Math.max(0.8, 0.8 * u));
    // cue 9: note colour bounces onto the crest as a rim light
    if (st && dp > 0.02 && cBounce > 0) {
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = rgba(lighten(st.color, 0.35), clamp(0.5 * Math.min(1, dp) * cBounce * wash, 0, 1));
      ctx.fillRect(x0, yBot - lipH, fw, Math.max(1, 1.5 * u));
    }
    ctx.restore();

    // cue 9: colour spill on the exposed neighbour walls
    if (st && cBounce > 0 && (wl > 0.25 || wr > 0.25)) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = rgba(st.color, clamp(0.3 * cBounce * wash, 0, 1));
      if (wl > 0.25) ctx.fillRect(xx, yTop + 2, wl + g0, yBot - yTop - 2);
      if (wr > 0.25) ctx.fillRect(xx + ww - wr - g0, yTop + 2, wr + g0, yBot - yTop - 2);
      ctx.restore();
    }

    // outline
    ctx.strokeStyle = "rgba(60,40,16,0.34)";
    ctx.lineWidth = 1;
    rrBottom(ctx, x0 + 0.5, yTop, fw - 1, fh - 0.5, radius);
    ctx.stroke();

    // engraved landmarks: brass notch on every C, a proper dot on middle C
    if (F.middleCMarker && (k + 21) % 12 === 0 && wkw >= 9) {
      const mid = k === 39;
      const rd = clamp(wkw * (mid ? 0.11 : 0.07), 1.1, mid ? 3.6 * u : 2.4 * u);
      const cx = xx + ww / 2;
      const cy = yBot - 29 * u;
      const bd = F.brassDetail;
      // engraved recess: shadow on the upper-left inside rim, light catching the lower-right lip
      ctx.fillStyle = `rgba(40,24,8,${0.35 * bd})`;
      ctx.beginPath();
      ctx.arc(cx, cy, rd + Math.max(0.5, rd * 0.22), 0, Math.PI * 2);
      ctx.fill();
      const dg = ctx.createRadialGradient(cx - rd * 0.35, cy - rd * 0.35, 0, cx, cy, rd * 1.15);
      dg.addColorStop(0, rgba(lighten(col.keyLabelC, 0.55), mid ? 0.98 : 0.6));
      dg.addColorStop(0.55, rgba(col.keyLabelC, mid ? 0.95 : 0.45));
      dg.addColorStop(1, rgba(darken(col.keyLabelC, 0.35), mid ? 0.95 : 0.45));
      ctx.fillStyle = dg;
      ctx.beginPath();
      ctx.arc(cx, cy, rd, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${0.55 * Math.max(bd, 0.4)})`;
      ctx.fillRect(cx - rd, cy + rd + Math.max(0.5, rd * 0.22), rd * 2, 0.8);
    }
  }

  /* cue 4: the hairline gap deepens into a dark channel with ambient occlusion on the neighbour edges */
  if (cChan > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(spanX0, top, spanX1 - spanX0, kh);
    ctx.clip();
    for (let k = L.lo; k <= L.hi; k++) {
      if (isBlack(k + 21)) continue;
      const dp = D[k];
      if (dp < 0.02) continue;
      const xx = L.kx[k] + gapPx / 2;
      const ww = L.kw[k] - gapPx;
      const yTop = top + dp * 0.07 * wkw * cueDrop;
      const yBot = top + kh - dp * 0.045 * wkw * cueDrop;
      const pvk = pv[k];
      const vfk = pvk ? 0.7 + 0.3 * pvk.vf : 1;
      const aw = Math.max(1.5, 0.07 * wkw);
      for (const side of [-1, 1] as const) {
        const nb = side < 0 ? prevWhite(k) : nextWhite(k);
        const dn = nb >= 0 ? D[nb] : 0;
        const rel = clamp((dp - dn) * 0.85 + dp * 0.15, 0, 1) * vfk * cChan * amb;
        if (rel < 0.01) continue;
        const gx = side < 0 ? xx : xx + ww; // gap boundary
        // channel floor: deep felt black
        ctx.fillStyle = `rgba(3,1,0,${clamp(0.8 * rel, 0, 1)})`;
        ctx.fillRect(side < 0 ? gx - gapPx : gx, yTop, gapPx, yBot - yTop);
        // soft occlusion bleeding onto the neighbour's top edge
        const x2 = side < 0 ? gx - gapPx - aw : gx + gapPx + aw;
        const og = ctx.createLinearGradient(side < 0 ? gx - gapPx : gx + gapPx, 0, x2, 0);
        og.addColorStop(0, `rgba(12,5,0,${clamp(0.38 * rel, 0, 1)})`);
        og.addColorStop(1, "rgba(12,5,0,0)");
        ctx.fillStyle = og;
        ctx.fillRect(Math.min(side < 0 ? gx - gapPx : gx + gapPx, x2), yTop + dp * 0.02 * wkw, aw, yBot - yTop);
        // colour bounce on the channel floor
        if (pvk && cBounce > 0) {
          ctx.globalCompositeOperation = "lighter";
          ctx.fillStyle = rgba(pvk.color, clamp(0.35 * rel * cBounce * wash, 0, 1));
          ctx.fillRect(side < 0 ? gx - gapPx : gx, yTop + 2, gapPx, yBot - yTop - 4);
          ctx.globalCompositeOperation = "source-over";
        }
      }
    }
    ctx.restore();
  }

  /* lamp falloff: the ends of the keyboard sit a touch further from the lamp */
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
    const rf = ctx.createLinearGradient(0, top, 0, top + kh * 0.5);
    rf.addColorStop(0, `rgba(84,56,24,${la * 1.2})`);
    rf.addColorStop(1, "rgba(84,56,24,0)");
    ctx.fillStyle = rf;
    ctx.fillRect(spanX0, top, spanX1 - spanX0, kh * 0.5);
    ctx.restore();
  }
  /* shadow cast by the damper rail */
  {
    const sg = ctx.createLinearGradient(0, top, 0, top + 16 * u);
    sg.addColorStop(0, "rgba(20,8,6,0.55)");
    sg.addColorStop(1, "rgba(20,8,6,0)");
    ctx.fillStyle = sg;
    ctx.fillRect(0, top, L.W, 16 * u);
  }

  /* =============================== BLACK KEYS =============================== */
  const bc = col.blackKey;
  const bcr = Math.max(2, bkw * 0.13);

  // pass 1 — cast shadows (multi-layer penumbra), shorter and tighter for a pressed black key,
  // deeper where a pressed white key lies lower beneath the overhang (cue 7 & 8)
  ctx.save();
  ctx.beginPath();
  ctx.rect(spanX0, top, spanX1 - spanX0, kh);
  ctx.clip();
  for (let k = L.lo; k <= L.hi; k++) {
    if (!isBlack(k + 21)) continue;
    const dB = D[k];
    const dW = Math.max(k - 1 >= L.lo ? D[k - 1] : 0, k + 1 <= L.hi ? D[k + 1] : 0);
    const ex = clamp(1 - 0.55 * dB * cBlack + 0.4 * dW * cOver, 0.3, 1.3);
    const f = clamp((ex - 0.3) * NLEVEL, 0, NLEVEL);
    const lo = Math.min(NLEVEL, Math.floor(f));
    const hi = Math.min(NLEVEL, lo + 1);
    const fr = f - lo;
    const lvl = (i: number) => (C.bShadow[i] ??= blackShadow(C, L, 0.3 + i / NLEVEL, lx));
    const sw = bkw + C.padB * 2;
    const sh = bkh + C.padB + C.padTopB;
    const px = L.kx[k] - C.padB;
    const py = top - C.padTopB;
    const a = clamp(amb, 0, 1.6);
    ctx.globalAlpha = clamp((1 - fr) * a, 0, 1);
    ctx.drawImage(lvl(lo), px, py, sw, sh);
    if (fr > 0.01) {
      ctx.globalAlpha = clamp(fr * a, 0, 1);
      ctx.drawImage(lvl(hi), px, py, sw, sh);
    }
  }
  ctx.restore();

  // shared local-space gradients (translate to the key, so one object serves all 36 keys)
  const litLeft = lx <= 0;
  const bodyG = ctx.createLinearGradient(0, 0, bkw, 0);
  if (litLeft) {
    bodyG.addColorStop(0, lighten(bc, 0.2));
    bodyG.addColorStop(0.14, bc);
    bodyG.addColorStop(0.86, darken(bc, 0.55));
    bodyG.addColorStop(1, darken(bc, 0.78));
  } else {
    bodyG.addColorStop(0, darken(bc, 0.78));
    bodyG.addColorStop(0.14, darken(bc, 0.55));
    bodyG.addColorStop(0.86, bc);
    bodyG.addColorStop(1, lighten(bc, 0.2));
  }
  const facetG = ctx.createLinearGradient(0, 0, bkw, 0);
  if (litLeft) {
    facetG.addColorStop(0.1, lighten(bc, 0.16));
    facetG.addColorStop(0.32, lighten(bc, 0.07));
    facetG.addColorStop(0.75, bc);
    facetG.addColorStop(0.92, darken(bc, 0.35));
  } else {
    facetG.addColorStop(0.08, darken(bc, 0.35));
    facetG.addColorStop(0.25, bc);
    facetG.addColorStop(0.68, lighten(bc, 0.07));
    facetG.addColorStop(0.9, lighten(bc, 0.16));
  }
  const sideRefl = ctx.createLinearGradient(0, top, 0, top + bkh);
  sideRefl.addColorStop(0, "rgba(255,255,255,0.3)");
  sideRefl.addColorStop(0.5, "rgba(255,255,255,0.07)");
  sideRefl.addColorStop(1, "rgba(255,255,255,0)");

  for (let k = L.lo; k <= L.hi; k++) {
    if (!isBlack(k + 21)) continue;
    const st = pv[k];
    const dB = Math.min(1.06, D[k]);
    const dBc = Math.min(1, dB);
    const x = L.kx[k];
    const w = L.kw[k];
    const dWl = k - 1 >= L.lo ? D[k - 1] : 0;
    const dWr = k + 1 <= L.hi ? D[k + 1] : 0;
    const yT = top + dB * 0.05 * wkw * cueDrop;
    const yB = top + bkh - dB * 0.035 * wkw * cueDrop;
    const h = yB - yT;
    const rad = Math.max(2, w * 0.13);
    const vfk = st ? 0.7 + 0.3 * st.vf : 1;
    const dS = dB * vfk;

    // halo around a struck black key
    if (st && dB > 0.01 && gl.blackKeyHalo > 0) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const cx = x + w / 2;
      const R = w * 1.7 + 8 * u;
      const hg = ctx.createRadialGradient(cx, yT + h * 0.55, 0, cx, yT + h * 0.55, R);
      hg.addColorStop(0, rgba(st.color, gl.blackKeyHalo * dBc * 0.8));
      hg.addColorStop(1, rgba(st.color, 0));
      ctx.fillStyle = hg;
      ctx.fillRect(cx - R, yT - R * 0.2, R * 2, h + R * 0.6);
      ctx.restore();
    }

    // cue 3 (white–black): a lowered white neighbour exposes more of this key's tall lacquered side wall
    const wLeft = Math.max(0, dWl - dBc * 0.5) * wallPx * 0.8 * cSide;
    const wRight = Math.max(0, dWr - dBc * 0.5) * wallPx * 0.8 * cSide;
    if (wLeft > 0.25) {
      const sy = Math.max(0, yT - top);
      ctx.drawImage(C.wallL, 0, 0, C.wallL.width, Math.min(C.wallL.height, Math.round((bkh - 2) * C.S)), x - wLeft, top + sy * 0, wLeft + 0.5, bkh - 2);
      if (st && cBounce > 0) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = rgba(st.color, clamp(0.22 * cBounce * wash, 0, 1));
        ctx.fillRect(x - wLeft, top, wLeft, bkh - 2);
        ctx.restore();
      }
    }
    if (wRight > 0.25) {
      ctx.drawImage(C.wallR, 0, 0, C.wallR.width, Math.min(C.wallR.height, Math.round((bkh - 2) * C.S)), x + w - 0.5, top, wRight + 0.5, bkh - 2);
      if (st && cBounce > 0) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = rgba(st.color, clamp(0.22 * cBounce * wash, 0, 1));
        ctx.fillRect(x + w - 0.5, top, wRight, bkh - 2);
        ctx.restore();
      }
    }

    // trapezoid side faces: visible height shrinks as the key sinks (cue 7)
    const inset = w * 0.14 * (1 - 0.5 * dBc * cBlack);
    const fx = inset;
    const fwk = w - inset * 2;
    const chH = bkh * 0.14 * (1 - 0.55 * dBc * cNose);
    const fh = h - chH;
    ctx.save();
    ctx.translate(x, 0);
    ctx.fillStyle = bodyG;
    rrBottom(ctx, 0, yT, w, h, rad);
    ctx.fill();
    // reflection falloff down the lit side face
    ctx.save();
    ctx.globalAlpha = clamp(F.ebonyDetail * (1 - 0.5 * dBc), 0, 1.5);
    ctx.fillStyle = sideRefl;
    if (litLeft) ctx.fillRect(0.5, yT, Math.max(1, inset - 0.5), fh);
    else ctx.fillRect(w - inset, yT, Math.max(1, inset - 0.5), fh);
    ctx.restore();

    // top facet
    ctx.fillStyle = facetG;
    const fr = Math.max(1.5, fwk * 0.14);
    rrBottom(ctx, fx, yT, fwk, fh, fr);
    ctx.fill();
    ctx.save();
    rrBottom(ctx, fx, yT, fwk, fh, fr);
    ctx.clip();
    // colour wash (identity) first; reflections & shading above it
    if (st && dB > 0.01) {
      const wg = ctx.createLinearGradient(0, yT, 0, yT + fh);
      wg.addColorStop(0, rgba(st.color, 0.95 * dBc * wash));
      wg.addColorStop(0.6, rgba(st.color, 0.6 * dBc * wash));
      wg.addColorStop(1, rgba(st.color, 0.35 * dBc * wash));
      ctx.fillStyle = wg;
      ctx.fillRect(fx, yT, fwk, fh);
    } else if (inc.has(k)) {
      const r = inc.get(k)!;
      const wg = ctx.createLinearGradient(0, yT, 0, yT + fh * 0.5);
      wg.addColorStop(0, rgba(incColor.get(k)!, 0.42 * r * pre));
      wg.addColorStop(1, rgba(incColor.get(k)!, 0));
      ctx.fillStyle = wg;
      ctx.fillRect(fx, yT, fwk, fh);
    }
    // glossy sheen + soft-box streak: dims and slides up the face with the key's tilt (cue 6/7)
    {
      const slide = dBc * 0.14 * bkh * cTilt;
      ctx.globalAlpha = clamp(K.gloss * F.ebonyDetail * (1 - 0.5 * dBc * cTilt), 0, 1.5);
      ctx.drawImage(C.streak, 0, yT - slide, w, bkh);
      ctx.globalAlpha = 1;
      const sg = ctx.createLinearGradient(0, yT, 0, yT + fh);
      sg.addColorStop(0, `rgba(255,255,255,${clamp(0.2 * K.gloss * (1 - 0.45 * dBc), 0, 1)})`);
      sg.addColorStop(0.35, `rgba(255,255,255,${clamp(0.05 * K.gloss * (1 - 0.45 * dBc), 0, 1)})`);
      sg.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = sg;
      ctx.fillRect(fx, yT, fwk, fh);
    }
    // tilt shading + base occlusion
    if (dB > 0.01) {
      const tg = ctx.createLinearGradient(0, yT, 0, yT + fh);
      tg.addColorStop(0, `rgba(0,0,0,${clamp(0.05 * dS * cTilt, 0, 1)})`);
      tg.addColorStop(1, `rgba(0,0,0,${clamp(0.4 * dS * cTilt * amb, 0, 1)})`);
      ctx.fillStyle = tg;
      ctx.fillRect(fx, yT, fwk, fh);
    }
    ctx.restore();
    // polished edge of the facet catches the light
    ctx.fillStyle = `rgba(255,255,255,${clamp(0.22 * K.gloss * F.ebonyDetail * (1 - 0.5 * dBc), 0, 1)})`;
    ctx.fillRect(litLeft ? fx : fx + fwk - 1, yT + fr, 1, fh - fr);
    ctx.restore();

    // sloped front face: its own gradient, foreshortens and darkens when pressed
    const cg = ctx.createLinearGradient(0, yT + fh, 0, yB);
    cg.addColorStop(0, lighten(bc, 0.17 * (1 - 0.5 * dBc)));
    cg.addColorStop(0.18, lighten(bc, 0.07));
    cg.addColorStop(1, darken(bc, 0.4 + 0.25 * dBc));
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.moveTo(x + fx, yT + fh);
    ctx.lineTo(x + fx + fwk, yT + fh);
    ctx.lineTo(x + w - w * 0.04, yB - bcr);
    ctx.lineTo(x + w * 0.04, yB - bcr);
    ctx.closePath();
    ctx.fill();
    // crisp specular line where facet meets the slope
    ctx.fillStyle = `rgba(255,255,255,${clamp(0.28 * K.gloss * F.ebonyDetail * (1 - 0.6 * dBc), 0, 1)})`;
    ctx.fillRect(x + fx, yT + fh - 0.5, fwk, 1);
    if (st && dB > 0.02 && cBounce > 0) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = rgba(st.color, clamp(0.45 * dBc * cBounce * wash, 0, 1));
      ctx.fillRect(x + fx, yT + fh, fwk, 1.2);
      ctx.restore();
    }
    // outline with extra contact occlusion when down
    ctx.strokeStyle = `rgba(0,0,0,${clamp(0.7 + 0.25 * dBc, 0, 1)})`;
    ctx.lineWidth = 1;
    rrBottom(ctx, x + 0.5, yT, w - 1, h - 0.5, rad);
    ctx.stroke();
  }

  /* dither: seeded, static, keeps long dark gradients from banding after H.264 */
  if (F.keyDither > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(spanX0, top, spanX1 - spanX0, kh);
    ctx.clip();
    ctx.globalAlpha = clamp(F.keyDither, 0, 3);
    for (let y = top; y < top + kh; y += 128) for (let x = Math.floor(spanX0); x < spanX1; x += 128) ctx.drawImage(C.noise, x, y, 128, 128);
    ctx.restore();
  }

  drawCheeks(ctx, L, s, spanX0, spanX1);

  /* labels */
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
        ctx.fillText(txt, L.kx[k] + L.kw[k] / 2, top + L.bkh - 9 * u - D[k] * 0.035 * wkw * cueDrop);
      } else {
        const st = pv[k];
        const isC = pc === 0;
        ctx.font = `${isC ? 700 : 600} ${fs}px ${SANS}`;
        const down = st && st.d > 0.5;
        ctx.fillStyle = down ? (luminance(st!.color) > 0.55 ? "rgba(30,16,4,0.9)" : "#fff") : isC ? col.keyLabelC : col.keyLabel;
        ctx.fillText(txt, L.kx[k] + L.kw[k] / 2, top + kh - 9 * u - D[k] * 0.045 * wkw * cueDrop);
      }
    }
  }
  void mix;
}
