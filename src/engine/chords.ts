/* ------------------------------------------------------------------ *
 *  Fahh MIDI · harmony engine
 *
 *  · Key estimation (Krumhansl–Schmuckler) with a local-key follower
 *  · A 48-quality chord library (triads → 13ths, altered, sus, add, 6/9 …)
 *  · "Sounding-set" chord recognition: a chord is reported ONLY when it is
 *    really played – either struck together (block / rolled chord) or built
 *    up by an arpeggio whose notes are still ringing – and only when the
 *    evidence is strong enough for the chosen sensitivity.
 *  · Correct enharmonic spelling (C♯° → C♯ E G, not D♭ F A♭♭)
 *  · Inversions / slash chords, Roman numerals with figured bass,
 *    secondary dominants, Neapolitan, harmonic function.
 *
 *  Pure functions only – deterministic, no DOM, safe in a worker / Node.
 * ------------------------------------------------------------------ */

export type ChordHand = "L" | "R" | "both";
export type ChordSensitivity = "strict" | "balanced" | "detailed";

export interface ChordNote {
  midi: number;
  key: number;
  start: number;
  end: number;
  visEnd: number;
  vel: number;
  hand: "L" | "R";
}

export interface AnalysisOptions {
  chordSensitivity: ChordSensitivity;
  detectArpeggios: boolean;
  showInversions: boolean;
  romanNumerals: boolean;
  localKey: boolean;
  minChordHold: number;
}

export const DEFAULT_ANALYSIS: AnalysisOptions = {
  chordSensitivity: "balanced",
  detectArpeggios: true,
  showInversions: true,
  romanNumerals: true,
  localKey: true,
  minChordHold: 0.6,
};

export interface Chord {
  /** moment the chord is complete / sounds (banner appears here) */
  start: number;
  /** moment the chord stops being supported by sounding notes */
  end: number;
  /** end used by the banner (>= start + minChordHold, never overlaps the next chord) */
  shownEnd: number;
  /** earliest note that belongs to the chord */
  spanStart: number;
  symbol: string; // "Cmaj7/E"
  root: string; // "C"
  quality: string; // "maj7"
  bass: string | null; // "E" when slash chord
  roman: string | null; // "I⁶"
  fn: string | null; // "Tonic" | "Subdominant" | "Dominant" | "Applied dominant" …
  spelled: string; // "C major 7th (over E)"
  tones: string[]; // spelled chord tones from the root ["C","E","G","B"]
  played: string[]; // spelled names of the pitch classes actually sounding, low → high
  rootPc: number;
  bassPc: number;
  qualityId: string;
  inversion: number | null;
  keyLo: number;
  keyHi: number;
  hand: ChordHand;
  confidence: number; // 0..1
  kind: "block" | "arpeggio";
  chained: boolean; // another chord follows immediately (no fade-out)
  follows: boolean; // directly follows another chord (no fade-in)
  key: string; // local key e.g. "A minor"
}

export interface KeyEstimate {
  tonic: number; // pitch class
  minor: boolean;
  sharps: number; // circle-of-fifths position used for spelling
  name: string; // "A minor"
  confidence: number; // 0..1 (correlation margin)
  source: "analysis" | "key-signature";
}

/* ------------------------------ names & spelling ------------------------------ */

const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
const NAT_PC_LETTER = [0, -1, 1, -1, 2, 3, -1, 4, -1, 5, -1, 6]; // pc → letter index for naturals
const SHARP_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const FLAT_NAMES = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"];
const KEY0_NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
const MAJOR_SHARPS = [0, -5, 2, -3, 4, -1, 6, 1, -4, 3, -2, 5]; // tonic pc → key-signature accidentals

const accStr = (a: number) => (a === 0 ? "" : a > 0 ? "♯".repeat(a) : "♭".repeat(-a));
const mod12 = (n: number) => ((n % 12) + 12) % 12;

export function pcName(pc: number, sharps: number): string {
  pc = mod12(pc);
  return (sharps > 0 ? SHARP_NAMES : sharps < 0 ? FLAT_NAMES : KEY0_NAMES)[pc];
}

/** degree → [semitones, letter steps above the root] */
const DEG: Record<string, [number, number]> = {
  "1": [0, 0],
  b2: [1, 1],
  "2": [2, 1],
  "#2": [3, 1],
  b3: [3, 2],
  "3": [4, 2],
  "4": [5, 3],
  "#4": [6, 3],
  b5: [6, 4],
  "5": [7, 4],
  "#5": [8, 4],
  b6: [8, 5],
  "6": [9, 5],
  bb7: [9, 6],
  b7: [10, 6],
  "7": [11, 6],
  b9: [1, 1],
  "9": [2, 1],
  "#9": [3, 1],
  "11": [5, 3],
  "#11": [6, 3],
  b13: [8, 5],
  "13": [9, 5],
};

/* ------------------------------ chord library ------------------------------ */

interface Template {
  id: string;
  sym: string; // symbol suffix
  words: string; // spoken name
  tones: string[]; // degrees including "1"
  omit: string[]; // degrees that may be left out
  prior: number; // 0..1 – how common / how readily we believe it
  fig?: "triad" | "seventh"; // figured-bass family
}

const T: Template[] = [];
const def = (id: string, sym: string, words: string, tones: string, omit = "", prior = 0.7, fig?: "triad" | "seventh") =>
  T.push({ id, sym, words, tones: tones.split(" "), omit: omit ? omit.split(" ") : [], prior, fig });

// triads
def("maj", "", "major", "1 3 5", "", 1, "triad");
def("min", "m", "minor", "1 b3 5", "", 1, "triad");
def("dim", "°", "diminished", "1 b3 b5", "", 0.85, "triad");
def("aug", "+", "augmented", "1 3 #5", "", 0.8, "triad");
def("sus2", "sus2", "suspended 2nd", "1 2 5", "", 0.78);
def("sus4", "sus4", "suspended 4th", "1 4 5", "", 0.8);
def("majb5", "(♭5)", "major ♭5", "1 3 b5", "", 0.42);
// sixths
def("6", "6", "major 6th", "1 3 5 6", "", 0.8);
def("m6", "m6", "minor 6th", "1 b3 5 6", "", 0.74);
def("69", "6/9", "6/9", "1 3 5 6 9", "5", 0.7);
def("m69", "m6/9", "minor 6/9", "1 b3 5 6 9", "5", 0.58);
// sevenths
def("maj7", "maj7", "major 7th", "1 3 5 7", "5", 0.92, "seventh");
def("7", "7", "dominant 7th", "1 3 5 b7", "5", 0.96, "seventh");
def("m7", "m7", "minor 7th", "1 b3 5 b7", "5", 0.92, "seventh");
def("mmaj7", "m(maj7)", "minor-major 7th", "1 b3 5 7", "5", 0.62, "seventh");
def("m7b5", "ø7", "half-diminished 7th", "1 b3 b5 b7", "", 0.88, "seventh");
def("dim7", "°7", "diminished 7th", "1 b3 b5 bb7", "", 0.9, "seventh");
def("7s5", "7♯5", "augmented 7th", "1 3 #5 b7", "", 0.66);
def("maj7s5", "maj7♯5", "major 7th ♯5", "1 3 #5 7", "", 0.52);
def("7b5", "7♭5", "dominant 7th ♭5", "1 3 b5 b7", "", 0.62);
def("7sus4", "7sus4", "dominant 7th suspended 4th", "1 4 5 b7", "5", 0.72);
// ninths
def("add9", "add9", "major add9", "1 3 5 9", "5", 0.78);
def("madd9", "m(add9)", "minor add9", "1 b3 5 9", "5", 0.7);
def("9", "9", "dominant 9th", "1 3 5 b7 9", "5", 0.8);
def("maj9", "maj9", "major 9th", "1 3 5 7 9", "5", 0.8);
def("m9", "m9", "minor 9th", "1 b3 5 b7 9", "5", 0.78);
def("mmaj9", "m(maj9)", "minor-major 9th", "1 b3 5 7 9", "5", 0.5);
def("7b9", "7♭9", "dominant 7th ♭9", "1 3 5 b7 b9", "5", 0.72);
def("7s9", "7♯9", "dominant 7th ♯9", "1 3 5 b7 #9", "5", 0.68);
def("9sus4", "9sus4", "dominant 9th suspended 4th", "1 4 5 b7 9", "5", 0.62);
def("9s5", "9♯5", "dominant 9th ♯5", "1 3 #5 b7 9", "", 0.45);
def("7s5b9", "7♯5♭9", "dominant 7th ♯5 ♭9", "1 3 #5 b7 b9", "", 0.45);
def("7b5b9", "7♭5♭9", "dominant 7th ♭5 ♭9", "1 3 b5 b7 b9", "", 0.42);
def("7s5s9", "7♯5♯9", "dominant 7th ♯5 ♯9", "1 3 #5 b7 #9", "", 0.4);
// elevenths / lydian colours
def("m11", "m11", "minor 11th", "1 b3 5 b7 9 11", "5 9", 0.66);
def("m7add11", "m7(add11)", "minor 7th add11", "1 b3 5 b7 11", "5", 0.6);
def("madd11", "m(add11)", "minor add11", "1 b3 5 11", "5", 0.5);
def("maj7s11", "maj7♯11", "major 7th ♯11", "1 3 5 7 #11", "5", 0.62);
def("maj9s11", "maj9♯11", "major 9th ♯11", "1 3 5 7 9 #11", "5 9", 0.5);
def("7s11", "7♯11", "dominant 7th ♯11", "1 3 5 b7 #11", "5", 0.6);
def("9s11", "9♯11", "dominant 9th ♯11", "1 3 5 b7 9 #11", "5", 0.5);
def("add4", "add4", "major add4", "1 3 4 5", "", 0.45);
// thirteenths
def("13", "13", "dominant 13th", "1 3 5 b7 9 13", "5 9", 0.66);
def("maj13", "maj13", "major 13th", "1 3 5 7 9 13", "5 9", 0.6);
def("m13", "m13", "minor 13th", "1 b3 5 b7 9 13", "5 9", 0.55);
def("13b9", "13♭9", "dominant 13th ♭9", "1 3 5 b7 b9 13", "5", 0.5);
def("7add13", "7(13)", "dominant 7th add13", "1 3 5 b7 13", "5", 0.6);
def("maj7add13", "maj7(13)", "major 7th add13", "1 3 5 7 13", "5", 0.5);

const SEMI_SET = (tpl: Template) => {
  const s = new Set<number>();
  for (const d of tpl.tones) s.add(DEG[d][0]);
  return s;
};
interface Prepared {
  tier: 1 | 2 | 3;
  tpl: Template;
  semis: Set<number>;
  required: number[]; // semitone offsets (excluding root) that must sound
}
const PREPARED: Prepared[] = T.map((tpl) => ({
  tier: (tpl.prior >= 0.7 ? 1 : tpl.prior >= 0.55 ? 2 : 3) as 1 | 2 | 3,
  tpl,
  semis: SEMI_SET(tpl),
  required: tpl.tones.filter((d) => d !== "1" && !tpl.omit.includes(d)).map((d) => DEG[d][0]),
}));
export const CHORD_LIBRARY_SIZE = T.length;
export const CHORD_QUALITIES = T.map((t) => ({ id: t.id, symbol: t.sym, name: t.words, tones: t.tones.join(" ") }));

const BY_ID = new Map(T.map((t) => [t.id, t]));

/** chords that are the same harmony wearing different extensions (Dm / Dm7 / Dm9 …) */
const FAMILY: Record<string, string> = {};
for (const id of ["min", "m6", "m69", "m7", "mmaj7", "madd9", "m9", "mmaj9", "m11", "m7add11", "madd11", "m13"]) FAMILY[id] = "min";
for (const id of ["maj", "6", "69", "maj7", "add9", "maj9", "maj7s11", "maj9s11", "add4", "maj13", "maj7add13"]) FAMILY[id] = "maj";
for (const id of ["7", "9", "13", "7b9", "7s9", "7s11", "9s11", "13b9", "7add13"]) FAMILY[id] = "dom";
const familyOf = (id: string) => FAMILY[id] ?? id;

/* ------------------------------ key estimation ------------------------------ */

const KS_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KS_MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function pearson(x: ArrayLike<number>, y: ArrayLike<number>) {
  let mx = 0;
  let my = 0;
  for (let i = 0; i < 12; i++) {
    mx += x[i];
    my += y[i];
  }
  mx /= 12;
  my /= 12;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < 12; i++) {
    const a = x[i] - mx;
    const b = y[i] - my;
    sxy += a * b;
    sxx += a * a;
    syy += b * b;
  }
  return sxx > 1e-9 && syy > 1e-9 ? sxy / Math.sqrt(sxx * syy) : 0;
}

function keyScores(hist: ArrayLike<number>): { tonic: number; minor: boolean; r: number }[] {
  const out: { tonic: number; minor: boolean; r: number }[] = [];
  const rot = new Array<number>(12);
  for (let tonic = 0; tonic < 12; tonic++) {
    for (const minor of [false, true]) {
      const prof = minor ? KS_MINOR : KS_MAJOR;
      for (let i = 0; i < 12; i++) rot[i] = prof[mod12(i - tonic)];
      out.push({ tonic, minor, r: pearson(hist, rot) });
    }
  }
  return out;
}

const keySharps = (tonic: number, minor: boolean) => MAJOR_SHARPS[minor ? mod12(tonic + 3) : tonic];
function keyName(tonic: number, minor: boolean) {
  return `${pcName(tonic, keySharps(tonic, minor))} ${minor ? "minor" : "major"}`;
}

interface KeyModel {
  global: KeyEstimate;
  bins: Float32Array[]; // per-second pitch-class weight
  prefix: Float32Array[]; // prefix sums for window queries
  localCache: Map<number, { tonic: number; minor: boolean }>;
  allowLocal: boolean;
}

function buildKeyModel(notes: ChordNote[], fileKey: { sharps: number; minor: boolean } | null, allowLocal: boolean): KeyModel {
  let dur = 1;
  for (const n of notes) dur = Math.max(dur, n.end);
  const secs = Math.ceil(dur) + 2;
  const bins: Float32Array[] = Array.from({ length: secs }, () => new Float32Array(12));
  for (const n of notes) {
    const w0 = 0.6 + 0.4 * (n.vel / 127);
    const d = Math.max(0.05, Math.min(n.end - n.start, 3));
    const bassBoost = n.midi < 52 ? 1.25 : 1;
    let t = n.start;
    const tEnd = n.start + d;
    while (t < tEnd - 1e-9) {
      const s = Math.min(secs - 1, Math.floor(t));
      const seg = Math.min(tEnd, s + 1) - t;
      bins[s][n.midi % 12] += seg * w0 * bassBoost;
      t += seg > 0 ? seg : 1;
    }
  }
  const total = new Float32Array(12);
  for (const b of bins) for (let i = 0; i < 12; i++) total[i] += b[i];
  const scores = keyScores(total);
  // the file's key signature is a weak prior (it names a major + its relative minor)
  if (fileKey) {
    const majTonic = mod12(7 * fileKey.sharps);
    for (const s of scores) {
      if ((!s.minor && s.tonic === majTonic) || (s.minor && s.tonic === mod12(majTonic + 9))) s.r += 0.035;
      if (fileKey.minor && s.minor && s.tonic === mod12(majTonic + 9)) s.r += 0.02;
    }
  }
  scores.sort((a, b) => b.r - a.r);
  const best = scores[0];
  const second = scores.find((s) => !(s.tonic === best.tonic && s.minor === best.minor) && !isRelative(best, s)) ?? scores[1];
  const conf = Math.max(0, Math.min(1, (best.r - 0.2) * 1.1 + Math.min(0.2, (best.r - second.r) * 1.5)));
  const global: KeyEstimate = {
    tonic: best.tonic,
    minor: best.minor,
    sharps: keySharps(best.tonic, best.minor),
    name: keyName(best.tonic, best.minor),
    confidence: conf,
    source: "analysis",
  };
  const prefix: Float32Array[] = [];
  for (let i = 0; i < 12; i++) {
    const p = new Float32Array(secs + 1);
    for (let s = 0; s < secs; s++) p[s + 1] = p[s] + bins[s][i];
    prefix.push(p);
  }
  return { global, bins, prefix, localCache: new Map(), allowLocal };
}

const isRelative = (a: { tonic: number; minor: boolean }, b: { tonic: number; minor: boolean }) =>
  a.minor !== b.minor && (a.minor ? mod12(a.tonic + 3) === b.tonic : mod12(b.tonic + 3) === a.tonic);

function rawLocalKey(m: KeyModel, bin: number): { tonic: number; minor: boolean } {
  const g = m.global;
  const hit = m.localCache.get(bin);
  if (hit) return hit;
  const a = Math.max(0, bin * 3 - 9);
  const b = Math.min(m.bins.length, bin * 3 + 12);
  const hist = new Float32Array(12);
  let tot = 0;
  for (let i = 0; i < 12; i++) {
    hist[i] = m.prefix[i][b] - m.prefix[i][a];
    tot += hist[i];
  }
  let res: { tonic: number; minor: boolean } = g;
  if (tot > 4) {
    const sc = keyScores(hist);
    let best = sc[0];
    let gScore = -1;
    for (const s of sc) {
      if (s.r > best.r) best = s;
      if (s.tonic === g.tonic && s.minor === g.minor) gScore = s.r;
    }
    // stay in the global key unless the local evidence is clearly stronger
    if (!(best.tonic === g.tonic && best.minor === g.minor) && !isRelative(best, g) && best.r > gScore + 0.12 && best.r > 0.7) res = { tonic: best.tonic, minor: best.minor };
  }
  m.localCache.set(bin, res);
  return res;
}

/** Local key, only when it is stable for three consecutive 3-second windows (no flicker between keys). */
function localKeyAt(m: KeyModel, t: number): { tonic: number; minor: boolean } {
  const g = m.global;
  if (!m.allowLocal) return g;
  const bin = Math.max(0, Math.floor(t / 3));
  const c = rawLocalKey(m, bin);
  if (c.tonic === g.tonic && c.minor === g.minor) return g;
  const p = rawLocalKey(m, Math.max(0, bin - 1));
  const n = rawLocalKey(m, bin + 1);
  const same = (x: { tonic: number; minor: boolean }) => x.tonic === c.tonic && x.minor === c.minor;
  return same(p) && same(n) ? c : g;
}

/* ------------------------------ chord recognition ------------------------------ */

const SENS = {
  strict: { accept: 0.8, extra: 0.16, arpBonus: 0.06, maxTier: 1, tierPenalty: [0, 0, 0] },
  balanced: { accept: 0.7, extra: 0.28, arpBonus: 0.08, maxTier: 2, tierPenalty: [0, 0, 0.06] },
  detailed: { accept: 0.6, extra: 0.4, arpBonus: 0.08, maxTier: 3, tierPenalty: [0, 0.02, 0.07] },
} as const;

interface Candidate {
  root: number;
  prep: Prepared;
  score: number;
  extraShare: number;
  present: number;
}

const MAJ_SCALE = new Set([0, 2, 4, 5, 7, 9, 11]);
const MIN_SCALE = new Set([0, 2, 3, 5, 7, 8, 9, 10, 11]); // natural ∪ harmonic ∪ melodic

function keyFit(root: number, semis: Set<number>, key: { tonic: number; minor: boolean }) {
  const scale = key.minor ? MIN_SCALE : MAJ_SCALE;
  let inKey = 0;
  semis.forEach((s) => {
    if (scale.has(mod12(root + s - key.tonic))) inKey++;
  });
  const diatonicRoot = scale.has(mod12(root - key.tonic)) ? 1 : 0;
  return 0.65 * (inKey / semis.size) + 0.35 * diatonicRoot;
}

interface Match {
  best: Candidate;
  second: Candidate | null;
  weights: Float64Array;
}

interface MatchOpts {
  extraLimit: number;
  maxTier: number;
  tierPenalty: readonly number[];
  exemptPc: number; // a pitch class (the melody on top) that may be a non-chord tone without penalty, or -1
  maxTones: number; // largest chord (in distinct tones) this gesture may be read as
}

function matchChord(weights: Float64Array, bassPc: number, key: { tonic: number; minor: boolean }, mo: MatchOpts): Match | null {
  const extraLimit = mo.extraLimit;
  const GHOST = 0.28;
  let totalW = 0;
  for (let i = 0; i < 12; i++) totalW += weights[i];
  if (totalW <= 0) return null;
  const roots: number[] = [];
  for (let i = 0; i < 12; i++) if (weights[i] >= 0.3) roots.push(i);
  let best: Candidate | null = null;
  let second: Candidate | null = null;
  for (const root of roots) {
    for (const prep of PREPARED) {
      if (prep.tier > mo.maxTier || prep.tpl.tones.length > mo.maxTones) continue;
      let ok = true;
      for (const r of prep.required) {
        if (weights[(root + r) % 12] < 0.3) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      let covered = 0;
      let extra = 0;
      for (let pc = 0; pc < 12; pc++) {
        const w = weights[pc];
        if (w <= 0) continue;
        if (prep.semis.has(mod12(pc - root))) covered += w;
        else if (w >= GHOST && !(pc === mo.exemptPc && pc !== bassPc)) extra += w;
      }
      const share = extra / (covered + extra);
      if (share > extraLimit) continue;
      const fit = covered / (covered + extra);
      let present = 0;
      for (const d of prep.tpl.tones) if (weights[(root + DEG[d][0]) % 12] >= 0.3) present++;
      const completeness = present / prep.tpl.tones.length;
      // how plausible is this bass note for this root/template?
      let bassTerm = 0.02;
      if (bassPc === root) bassTerm = 0.18;
      else {
        const rel = mod12(bassPc - root);
        const tone = prep.tpl.tones.find((d) => DEG[d][0] === rel);
        if (tone === "3" || tone === "b3") bassTerm = 0.085;
        else if (tone === "5" || tone === "b5" || tone === "#5") bassTerm = 0.07;
        else if (tone) bassTerm = 0.05;
      }
      const rootShare = Math.min(1, (weights[root] / totalW) * prep.tpl.tones.length);
      const kf = keyFit(root, prep.semis, key);
      const complexity = Math.max(0, prep.tpl.tones.length - 4) * 0.02 + mo.tierPenalty[prep.tier - 1];
      // a "6" chord over a bass that is not its root is almost always read as a minor 7th chord (C6/A → Am7)
      const sixthInv = bassPc !== root && (prep.tpl.id === "6" || prep.tpl.id === "m6") ? 0.07 : 0;
      const score = -sixthInv + 0.4 * fit + bassTerm + 0.12 * completeness + 0.14 * prep.tpl.prior + 0.1 * kf + 0.06 * rootShare - complexity;
      const cand: Candidate = { root, prep, score, extraShare: share, present };
      if (!best || score > best.score) {
        second = best;
        best = cand;
      } else if (!second || score > second.score) second = cand;
    }
  }
  return best ? { best, second, weights } : null;
}

/* ------------------------------ spelling ------------------------------ */

interface Spelled {
  rootName: string;
  tones: string[];
  names: Map<number, string>; // semitone-from-root → name
}

function spellChord(rootPc: number, tpl: Template, extraSemis: number[], keySharpsPref: number): Spelled {
  const cands: { letter: number; acc: number }[] = [];
  if (NAT_PC_LETTER[rootPc] >= 0) cands.push({ letter: NAT_PC_LETTER[rootPc], acc: 0 });
  else {
    cands.push({ letter: NAT_PC_LETTER[mod12(rootPc - 1)], acc: 1 });
    cands.push({ letter: NAT_PC_LETTER[mod12(rootPc + 1)], acc: -1 });
  }
  const prefSharp = keySharpsPref > 0 ? true : keySharpsPref < 0 ? false : null;
  let bestCost = Infinity;
  let best: Spelled | null = null;
  for (const c of cands) {
    let cost = 0;
    const names = new Map<number, string>();
    const tones: string[] = [];
    const nameOf = (semi: number, step: number) => {
      const li = (c.letter + step) % 7;
      const target = mod12(rootPc + semi);
      const acc = mod12(target - LETTER_PC[li] + 6) - 6;
      if (Math.abs(acc) > 1) {
        cost += 6; // theoretical spelling would need a double accidental – prefer another root spelling, else show the plain name
        return pcName(target, keySharpsPref);
      }
      cost += Math.abs(acc) * (prefSharp === null ? 0.5 : (acc > 0) === prefSharp ? 0.2 : 0.7);
      return LETTERS[li] + accStr(acc);
    };
    for (const d of tpl.tones) {
      const [semi, step] = DEG[d];
      const nm = d === "1" ? LETTERS[c.letter] + accStr(c.acc) : nameOf(semi, step);
      names.set(semi, nm);
      if (!tpl.omit.includes(d) || extraSemis.includes(semi)) tones.push(nm);
    }
    for (const semi of extraSemis) {
      if (names.has(semi)) continue;
      // a non-chord tone: spell by key preference
      names.set(semi, pcName(rootPc + semi, keySharpsPref));
    }
    const rootIsSharp = c.acc > 0;
    if (prefSharp !== null && c.acc !== 0 && rootIsSharp !== prefSharp) cost += 0.45;
    if (c.acc !== 0) cost += prefSharp === null ? 0 : rootIsSharp === prefSharp ? 0.2 : 0.7;
    if (prefSharp === null && c.acc !== 0 && KEY0_NAMES[rootPc] !== LETTERS[c.letter] + accStr(c.acc)) cost += 0.45;
    if (cost < bestCost) {
      bestCost = cost;
      best = { rootName: LETTERS[c.letter] + accStr(c.acc), tones, names };
    }
  }
  return best!;
}

/* ------------------------------ roman numerals ------------------------------ */

const ROMAN_MAJOR = ["I", "♭II", "II", "♭III", "III", "IV", "♯IV", "V", "♭VI", "VI", "♭VII", "VII"];
const ROMAN_MINOR = ["I", "♭II", "II", "III", "♯III", "IV", "♯IV", "V", "VI", "♯VI", "VII", "♯VII"];
const MINORISH = new Set(["min", "dim", "m6", "m69", "m7", "mmaj7", "m7b5", "dim7", "madd9", "m9", "mmaj9", "m11", "m7add11", "madd11", "m13"]);
const ROMAN_SUFFIX: Record<string, string> = {
  dim: "°",
  aug: "+",
  sus2: "sus2",
  sus4: "sus4",
  majb5: "(♭5)",
  "6": "6",
  m6: "6",
  "69": "6/9",
  m69: "6/9",
  maj7: "maj7",
  "7": "7",
  m7: "7",
  mmaj7: "(maj7)",
  m7b5: "ø7",
  dim7: "°7",
  "7s5": "+7",
  maj7s5: "maj7♯5",
  "7b5": "7♭5",
  "7sus4": "7sus4",
  add9: "add9",
  madd9: "add9",
  "9": "9",
  maj9: "maj9",
  m9: "9",
  mmaj9: "(maj9)",
  "7b9": "7♭9",
  "7s9": "7♯9",
  "9sus4": "9sus4",
  m11: "11",
  maj7s11: "maj7♯11",
  "7s11": "7♯11",
  "13": "13",
  maj13: "maj13",
  m13: "13",
};
const SUP: Record<string, string> = { "6": "⁶", "5": "⁵", "4": "⁴", "3": "³", "2": "²", "7": "⁷" };
const SUB: Record<string, string> = { "6": "₆", "5": "₅", "4": "₄", "3": "₃", "2": "₂" };

function inversionOf(tpl: Template, rootPc: number, bassPc: number): number | null {
  if (bassPc === rootPc) return 0;
  const rel = mod12(bassPc - rootPc);
  const idx = tpl.tones.findIndex((d) => DEG[d][0] === rel);
  if (idx < 0) return null;
  if (tpl.fig) {
    // chord-tone order 1,3,5,(7)
    const order = tpl.fig === "triad" ? ["1", "3", "5"] : ["1", "3", "5", "7"];
    const base = tpl.tones[idx].replace("b", "").replace("#", "").replace("bb", "");
    const k = order.findIndex((o) => o === base || (o === "7" && (base === "7" || tpl.tones[idx] === "bb7" || tpl.tones[idx] === "b7")));
    return k < 0 ? null : k;
  }
  return null;
}

function figure(tpl: Template, inv: number | null): string {
  if (inv === null || inv === 0 || !tpl.fig) return tpl.fig === "seventh" ? "⁷" : "";
  if (tpl.fig === "triad") return inv === 1 ? SUP["6"] : SUP["6"] + SUB["4"];
  return inv === 1 ? SUP["6"] + SUB["5"] : inv === 2 ? SUP["4"] + SUB["3"] : SUP["4"] + SUB["2"];
}

interface RomanInfo {
  numeral: string;
  base: string; // numeral without figures, e.g. "V"
  fn: string | null;
  diatonic: boolean;
  rel: number;
}

function romanFor(rootPc: number, bassPc: number, prep: Prepared, key: { tonic: number; minor: boolean }): RomanInfo {
  const rel = mod12(rootPc - key.tonic);
  const q = prep.tpl.id;
  const minorish = MINORISH.has(q);
  let base = (key.minor ? ROMAN_MINOR : ROMAN_MAJOR)[rel];
  if (key.minor && rel === 11 && (q === "dim" || q === "dim7" || q === "m7b5")) base = "VII";
  if (minorish) base = base.toLowerCase();
  const inv = inversionOf(prep.tpl, rootPc, bassPc);
  let suffix: string;
  if (prep.tpl.fig === "seventh") {
    const core: Record<string, string> = { maj7: "maj", "7": "", m7: "", mmaj7: "(maj)", m7b5: "ø", dim7: "°" };
    suffix = (core[q] ?? "") + figure(prep.tpl, inv);
    if (q === "maj7" && (inv === 0 || inv === null)) suffix = "maj7";
    else if (q === "mmaj7" && (inv === 0 || inv === null)) suffix = "(maj7)";
    else if (q === "maj7") suffix = "maj" + figure(prep.tpl, inv);
  } else if (prep.tpl.fig === "triad") {
    suffix = (q === "dim" ? "°" : q === "aug" ? "+" : "") + figure(prep.tpl, inv);
  } else suffix = (ROMAN_SUFFIX[q] ?? "") + (inv ? "" : "");
  let numeral = base + suffix;
  // Neapolitan
  if (rel === 1 && q === "maj") numeral = inv === 1 ? "N⁶" : "♭II";
  const scale = key.minor ? MIN_SCALE : MAJ_SCALE;
  const diatonic = [...prep.semis].every((s) => scale.has(mod12(rootPc + s - key.tonic)));
  let fn: string | null = null;
  const deg = key.minor ? { T: [0, 3], S: [2, 5, 8], D: [7, 10, 11] } : { T: [0, 4, 9], S: [2, 5], D: [7, 11] };
  if (diatonic || rel === 7) {
    if (deg.T.includes(rel)) fn = "Tonic";
    else if (deg.S.includes(rel)) fn = "Subdominant";
    else if (deg.D.includes(rel)) fn = "Dominant";
  }
  if (rel === 1 && q === "maj") fn = "Predominant";
  return { numeral, base, fn, diatonic, rel };
}

/** Roman numeral of a diatonic target degree (used for "V/V"). */
function targetNumeral(rel: number, key: { tonic: number; minor: boolean }): string | null {
  const majorSet: Record<number, string> = { 2: "ii", 4: "iii", 5: "IV", 7: "V", 9: "vi" };
  const minorSet: Record<number, string> = { 3: "III", 5: "iv", 7: "v", 8: "VI", 10: "VII" };
  return (key.minor ? minorSet : majorSet)[rel] ?? null;
}

/* ------------------------------ detection ------------------------------ */

interface Raw {
  start: number;
  spanStart: number;
  end: number;
  cand: Candidate;
  conf: number;
  kind: "block" | "arpeggio";
  bassPc: number;
  keyLo: number;
  keyHi: number;
  hands: Set<string>;
  played: number[]; // pcs low → high
  key: { tonic: number; minor: boolean };
  newCount: number;
}

function clusterNotes(notes: ChordNote[]): ChordNote[][] {
  const out: ChordNote[][] = [];
  let cur: ChordNote[] = [];
  let last = -Infinity;
  for (const n of notes) {
    if (cur.length && (n.start - last > 0.055 || n.start - cur[0].start > 0.16)) {
      out.push(cur);
      cur = [];
    }
    cur.push(n);
    last = n.start;
  }
  if (cur.length) out.push(cur);
  return out;
}

export interface HarmonyResult {
  chords: Chord[];
  key: KeyEstimate;
}

export function analyseHarmony(notes: ChordNote[], fileKey: { sharps: number; minor: boolean } | null, optsIn?: Partial<AnalysisOptions>): HarmonyResult {
  const opts = { ...DEFAULT_ANALYSIS, ...optsIn };
  const sens = SENS[opts.chordSensitivity] ?? SENS.balanced;
  const model = buildKeyModel(notes, fileKey, opts.localKey);
  const raws: Raw[] = [];
  const sorted = notes.slice().sort((a, b) => a.start - b.start || a.midi - b.midi);
  const clusters = clusterNotes(sorted);
  let active: ChordNote[] = [];
  const weights = new Float64Array(12);

  let hist: ChordNote[] = [];
  for (let ci = 0; ci < clusters.length; ci++) {
    const cl = clusters[ci];
    const T0 = cl[0].start;
    const Tc = cl[cl.length - 1].start;
    // notes still sounding (small tolerance for legato overlap)
    active = active.filter((n) => n.end + 0.06 > T0 && T0 - n.start < 20);
    hist = hist.filter((n) => T0 - n.start < 2);
    for (const n of cl) {
      active.push(n);
      hist.push(n);
    }
    const isNew = new Set(cl);
    const newPcs = new Set(cl.map((n) => n.midi % 12));
    const blockLike = cl.length >= 2 && newPcs.size >= 2;
    if (!blockLike && !opts.detectArpeggios) continue;
    const arp = !blockLike;

    // the notes that take part: everything still ringing, plus (for arpeggios) the recent past
    let pool = active;
    let W = 1;
    if (arp) {
      const back = Math.max(0, ci - 6);
      W = ci > 0 ? Math.min(1.8, Math.max(0.7, ((Tc - clusters[back][0].start) / Math.max(1, ci - back)) * 7)) : 1;
      const set = new Set(active);
      for (const n of hist) if (T0 - n.start <= W) set.add(n);
      pool = [...set];
    }
    if (pool.length < 3) continue;

    weights.fill(0);
    let low = pool[0];
    let top = pool[0];
    const peak = new Float64Array(12);
    const extraSum = new Float64Array(12);
    for (const n of pool) {
      if (n.midi < low.midi) low = n;
      if (n.midi > top.midi) top = n;
      const age = Tc - n.start;
      let w: number;
      if (arp) w = age <= 0.55 * W ? 1 : age <= W ? 0.6 : 0.4;
      else {
        w = isNew.has(n) ? 1 : age < 1.5 ? 0.78 : age < 4 ? 0.56 : 0.36;
        // a note that is only just about to be released contributes little
        if (!isNew.has(n) && n.end - T0 < 0.15) w *= 0.3;
      }
      if (n.end - n.start < 0.07) w *= 0.6;
      w *= 0.75 + 0.25 * (n.vel / 127);
      const pc = n.midi % 12;
      if (w > peak[pc]) {
        extraSum[pc] += peak[pc];
        peak[pc] = w;
      } else extraSum[pc] += w;
    }
    for (let i = 0; i < 12; i++) weights[i] = peak[i] + 0.2 * extraSum[i];
    weights[low.midi % 12] *= 1.3;
    let distinct = 0;
    for (let i = 0; i < 12; i++) if (weights[i] >= 0.3) distinct++;
    if (distinct < 3) continue;

    const bassPc = low.midi % 12;
    const key = localKeyAt(model, T0);
    const m = matchChord(weights, bassPc, key, {
      extraLimit: arp ? Math.min(sens.extra, 0.2) : sens.extra,
      maxTier: arp ? Math.min(sens.maxTier, opts.chordSensitivity === "detailed" ? 2 : 1) : sens.maxTier,
      tierPenalty: sens.tierPenalty,
      // a melody note riding on top of an arpeggiated accompaniment is allowed to be a non-chord tone
      exemptPc: arp && opts.chordSensitivity !== "strict" ? top.midi % 12 : -1,
      // big voicings need to be struck as big gestures; arpeggios stay readable
      maxTones: opts.chordSensitivity === "detailed" ? (arp ? 5 : 7) : arp ? 4 : cl.length >= 3 ? 5 : 4,
    });
    if (!m) continue;
    const { best, second } = m;
    let conf = best.score;
    if (second && best.score - second.score < 0.035 && second.root !== best.root) conf -= 0.05;
    const threshold = sens.accept + (arp ? sens.arpBonus : 0) + (best.prep.tier === 2 ? 0.04 : 0);
    if (conf < threshold) continue;

    // arpeggios: the note that completes the chord must itself be a chord tone,
    // and the notes must have been struck as a gesture (≥3 distinct onsets)
    if (arp) {
      const nPc = cl[0].midi % 12;
      if (!best.prep.semis.has(mod12(nPc - best.root))) continue;
      const onsets = new Set<number>();
      for (const n of pool) if (T0 - n.start < Math.max(2.6, W) && best.prep.semis.has(mod12((n.midi % 12) - best.root))) onsets.add(Math.round(n.start * 200));
      if (onsets.size < 3) continue;
    }

    // chord ends when fewer than 3 of its pitch classes are still sounding
    const endByPc = new Map<number, number>();
    let spanStart = T0;
    let keyLo = 87;
    let keyHi = 0;
    const hands = new Set<string>();
    for (const n of pool) {
      const pc = n.midi % 12;
      if (!best.prep.semis.has(mod12(pc - best.root))) continue;
      const e = Math.max(n.visEnd, n.start + 0.05);
      if ((endByPc.get(pc) ?? -1) < e) endByPc.set(pc, e);
      if (arp) spanStart = Math.min(spanStart, n.start);
      keyLo = Math.min(keyLo, n.key);
      keyHi = Math.max(keyHi, n.key);
      hands.add(n.hand);
    }
    const ends = [...endByPc.values()].sort((a, b) => b - a);
    const end = ends[Math.min(2, ends.length - 1)];
    if (end - T0 < 0.1) continue;
    const played = [...new Set(pool.filter((n) => weights[n.midi % 12] >= 0.3).sort((a, b) => a.midi - b.midi).map((n) => n.midi % 12))];
    raws.push({ start: arp ? Tc : T0, spanStart: arp ? spanStart : T0, end, cand: best, conf: Math.min(1, conf), kind: arp ? "arpeggio" : "block", bassPc, keyLo, keyHi, hands, played, key, newCount: cl.length });
  }

  /* ---- merge repeats, remove flicker ---- */
  const merged: Raw[] = [];
  for (const r of raws) {
    const p = merged[merged.length - 1];
    if (p) {
      const sameId = p.cand.prep.tpl.id === r.cand.prep.tpl.id;
      const sameFamily = familyOf(p.cand.prep.tpl.id) === familyOf(r.cand.prep.tpl.id);
      const same = p.cand.root === r.cand.root && (sameId || (sameFamily && r.start - p.start < 1.2));
      const loose = p.kind === "arpeggio" || r.kind === "arpeggio";
      if (same && r.start <= p.end + (loose ? 1.2 : sameId ? 0.15 : 0.5) && (loose || !sameId || p.bassPc === r.bassPc)) {
        // keep the clearest reading; on a tie the simpler one
        const rBetter = r.conf > p.conf + 0.02 || (Math.abs(r.conf - p.conf) <= 0.02 && r.cand.prep.tpl.tones.length < p.cand.prep.tpl.tones.length);
        if (rBetter) {
          p.cand = r.cand;
          p.bassPc = r.bassPc;
          p.played = r.played;
          p.key = r.key;
        }
        p.end = Math.max(p.end, r.end);
        p.conf = Math.max(p.conf, r.conf);
        p.keyLo = Math.min(p.keyLo, r.keyLo);
        p.keyHi = Math.max(p.keyHi, r.keyHi);
        r.hands.forEach((h) => p.hands.add(h));
        continue;
      }
      // rate limiter: a different chord right on the heels of another is ignored unless it is a clear, full block chord
      if (r.start - p.start < 0.3 && !(r.kind === "block" && r.newCount >= 3 && r.conf >= 0.9)) continue;
    }
    merged.push(r);
  }
  // an arpeggio reading that is replaced by another chord almost immediately was a transition, not a chord
  for (let i = merged.length - 2; i >= 0; i--) {
    const r = merged[i];
    if (r.kind === "arpeggio" && merged[i + 1].start - r.start < 0.45 && r.end - r.start < 0.45) merged.splice(i, 1);
  }

  /* ---- build final chords ---- */
  const out: Chord[] = [];
  for (let i = 0; i < merged.length; i++) {
    const r = merged[i];
    const next = merged[i + 1];
    const tpl = r.cand.prep.tpl;
    const sharpsPref = keySharps(r.key.tonic, r.key.minor);
    const extraSemis = r.played.map((pc) => mod12(pc - r.cand.root));
    const sp = spellChord(r.cand.root, tpl, extraSemis, sharpsPref);
    const slashOk = opts.showInversions && r.bassPc !== r.cand.root;
    const bassName = slashOk ? sp.names.get(mod12(r.bassPc - r.cand.root)) ?? pcName(r.bassPc, sharpsPref) : null;
    const symbol = sp.rootName + tpl.sym + (bassName ? `/${bassName}` : "");
    const inv = inversionOf(tpl, r.cand.root, r.bassPc);
    let roman: string | null = null;
    let fn: string | null = null;
    if (opts.romanNumerals) {
      const ri = romanFor(r.cand.root, r.bassPc, r.cand.prep, r.key);
      roman = ri.numeral;
      fn = ri.fn;
      // applied (secondary) dominants: X → chord a fifth below, e.g. V7/V
      if ((tpl.id === "maj" || tpl.id === "7" || tpl.id === "9" || tpl.id === "13") && !ri.diatonic && next && next.start - r.end < 3.5 && next.cand.root === mod12(r.cand.root + 7)) {
        const tgt = targetNumeral(mod12(next.cand.root - r.key.tonic), r.key);
        if (tgt) {
          roman = `V${tpl.id === "maj" ? figure(tpl, inv) : tpl.id === "7" ? figure({ ...tpl, fig: "seventh" }, inv) : ROMAN_SUFFIX[tpl.id] ?? ""}/${tgt}`;
          fn = "Applied dominant";
        }
      }
      if (ri.rel === 1 && tpl.id === "maj") fn = "Predominant";
    }
    const nextStart = next ? next.start : Infinity;
    const shownEnd = Math.min(Math.max(r.end, r.start + opts.minChordHold), nextStart);
    const end = Math.min(r.end, nextStart);
    if (shownEnd - r.start < 0.2 && r.kind === "arpeggio") continue;
    const hands: ChordHand = r.hands.size > 1 ? "both" : ([...r.hands][0] as "L" | "R");
    out.push({
      start: r.start,
      end,
      shownEnd,
      spanStart: r.spanStart,
      symbol,
      root: sp.rootName,
      quality: tpl.sym,
      bass: bassName,
      roman,
      fn,
      spelled: `${sp.rootName} ${tpl.words}${bassName ? ` (over ${bassName})` : ""}`,
      tones: sp.tones,
      played: r.played.map((pc) => sp.names.get(mod12(pc - r.cand.root)) ?? pcName(pc, sharpsPref)),
      rootPc: r.cand.root,
      bassPc: r.bassPc,
      qualityId: tpl.id,
      inversion: inv,
      keyLo: r.keyLo,
      keyHi: r.keyHi,
      hand: hands,
      confidence: +r.conf.toFixed(3),
      kind: r.kind,
      chained: false,
      follows: false,
      key: keyName(r.key.tonic, r.key.minor),
    });
  }
  for (let i = 0; i < out.length; i++) {
    const c = out[i];
    const n = out[i + 1];
    if (n && n.start - c.shownEnd < 0.12) {
      c.chained = true;
      n.follows = true;
    }
  }
  return { chords: out, key: model.global };
}

/** Identify a single chord from MIDI note numbers (struck together). Returns null when nothing convincing is found. */
export function identifyChord(midiNotes: number[], opts?: Partial<AnalysisOptions> & { key?: { tonic: number; minor: boolean } }): Chord | null {
  const sorted = midiNotes.slice().sort((a, b) => a - b);
  const notes: ChordNote[] = sorted.map((m, i) => ({ midi: m, key: m - 21, start: i * 0.004, end: 2, visEnd: 2, vel: 90, hand: m < 60 ? "L" : "R" }));
  const res = analyseHarmony(notes, null, { ...opts, localKey: false, minChordHold: 0.6, romanNumerals: false });
  return res.chords[0] ?? null;
}

export const chordTemplateInfo = (id: string) => BY_ID.get(id) ?? null;

/* ------------------------------ summary ------------------------------ */

export interface HarmonySummary {
  key: KeyEstimate;
  chordCount: number;
  distinct: { symbol: string; count: number; roman: string | null }[];
  progression: string[];
  modulations: { time: number; key: string }[];
}

export function summariseHarmony(chords: Chord[], key: KeyEstimate): HarmonySummary {
  const counts = new Map<string, { symbol: string; count: number; roman: string | null }>();
  for (const c of chords) {
    const k = `${c.root}${c.quality}`;
    const e = counts.get(k);
    if (e) e.count++;
    else counts.set(k, { symbol: `${c.root}${c.quality}`, count: 1, roman: c.roman });
  }
  const mods: { time: number; key: string }[] = [];
  let cur = "";
  for (const c of chords) {
    if (c.key !== cur) {
      if (cur) mods.push({ time: +c.start.toFixed(3), key: c.key });
      cur = c.key;
    }
  }
  return {
    key,
    chordCount: chords.length,
    distinct: [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 12),
    progression: chords.slice(0, 32).map((c) => c.symbol),
    modulations: mods,
  };
}

export function chordAtTime(chords: Chord[], t: number): Chord | null {
  let lo = 0;
  let hi = chords.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (chords[m].start <= t) lo = m + 1;
    else hi = m;
  }
  for (let i = lo - 1; i >= 0 && i >= lo - 4; i--) if (chords[i].shownEnd > t) return chords[i];
  return null;
}
