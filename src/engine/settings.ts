/* ------------------------------------------------------------------ *
 *  Fahh MIDI · settings schema
 *
 *  ONE schema describes every tweakable value in the app. It drives:
 *    · the defaults                    · validation / clamping of imports
 *    · the Advanced settings UI        · JSON import / export
 *    · the window.FahhMIDI automation API (set / get / listSettings)
 * ------------------------------------------------------------------ */
import type { AllSettings, AudioSettings, PlaybackSettings, RenderSettings, SyncConfig, UiSettings } from "./types";

export type FieldType = "number" | "boolean" | "color" | "enum" | "text" | "intList";

export interface FieldOption {
  value: string | number;
  label: string;
}

export interface FieldDef {
  path: string;
  type: FieldType;
  label: string;
  group: string;
  hint?: string;
  def: unknown;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: FieldOption[];
}

export const APP_NAME = "Fahh MIDI";
export const SETTINGS_FORMAT = "fahh-midi-settings";
export const SETTINGS_VERSION = 1;

/* ------------------------------ groups ------------------------------ */

export const G = {
  theme: "Theme · Interface colours",
  keyGeo: "Keyboard · Length, width & geometry",
  keyLook: "Keyboard · Colours & finish",
  noteShape: "Falling notes · Shape & surface",
  noteCol: "Falling notes · Colours",
  glow: "Glow & light intensity",
  bg: "Background, lanes & atmosphere",
  lines: "Lines, guides & numerals",
  hud: "HUD, chord banner & labels",
  analysis: "Harmony · Chord & key analysis",
  finish: "Keyboard & lane · Fine detail",
  layout: "Layout & proportions",
  post: "Post-processing · Contrast & grading",
  features: "Layers & features",
  playback: "Playback, timing & practice",
  audio: "Audio & soundfont",
  video: "Video export & sync",
} as const;

export const GROUP_ORDER: string[] = Object.values(G);

/* ------------------------------ builders ------------------------------ */

const F: FieldDef[] = [];
const num = (path: string, label: string, def: number, min: number, max: number, step: number, group: string, hint?: string, unit?: string) =>
  F.push({ path, type: "number", label, def, min, max, step, group, hint, unit });
const bool = (path: string, label: string, def: boolean, group: string, hint?: string) => F.push({ path, type: "boolean", label, def, group, hint });
const col = (path: string, label: string, def: string, group: string, hint?: string) => F.push({ path, type: "color", label, def, group, hint });
const opt = (path: string, label: string, def: string | number, options: FieldOption[], group: string, hint?: string) =>
  F.push({ path, type: "enum", label, def, options, group, hint });
const txt = (path: string, label: string, def: string, group: string, hint?: string) => F.push({ path, type: "text", label, def, group, hint });

const R = "render.";
const C = "render.colors.";

/* -- theme (whole interface) -- */
col("ui.accent", "Accent colour (metal / highlights)", "#e2b256", G.theme, "Buttons, sliders, active states, glows across the whole interface");
col("ui.accent2", "Secondary accent", "#59c4a8", G.theme, "Left-hand pigment in the UI, success states, video readouts");
col("ui.surface", "Surface / panel base", "#1b1511", G.theme, "The dark base every panel, bar and card is derived from");
col("ui.text", "Text colour", "#f3e8d0", G.theme, "Primary text; all secondary text tones derive from it");
num("ui.glassBlur", "Panel glass blur", 22, 0, 60, 1, G.theme, "Backdrop blur behind floating panels", "px");

/* -- keyboard geometry -- */
num(R + "keys.heightRatio", "Key length (keyboard height)", 0.205, 0.08, 0.6, 0.005, G.keyGeo, "Fraction of the stage height taken by the keys", "×H");
num(R + "keys.widthScale", "Key width", 1, 0.4, 3, 0.01, G.keyGeo, "1 = all keys fit the screen. Above 1 the keyboard overflows (use Pan)", "×");
num(R + "keys.panX", "Keyboard pan", 0, -1, 1, 0.01, G.keyGeo, "Slides an over-wide keyboard left / right");
num(R + "keys.blackWidthRatio", "Black key width", 0.6, 0.3, 0.9, 0.01, G.keyGeo, "Relative to a white key", "×");
num(R + "keys.blackHeightRatio", "Black key length", 0.6643, 0.3, 0.95, 0.005, G.keyGeo, "Relative to a white key", "×");
num(R + "keys.gap", "Gap between white keys", 0.045, 0, 0.3, 0.005, G.keyGeo, "Fraction of key width", "×");
num(R + "keys.cornerRadius", "Key corner rounding", 1, 0, 4, 0.05, G.keyGeo, undefined, "×");
num(R + "keys.pressDepth", "Key press depth", 1, 0, 4, 0.05, G.keyGeo, "How far a key sinks when struck", "×");
num(R + "keys.gloss", "Key gloss / sheen", 1, 0, 3, 0.05, G.keyGeo, "Black key lacquer shine and white key lip highlight", "×");
num(R + "keys.bevel", "White key side bevels", 1, 0, 3, 0.05, G.keyGeo, undefined, "×");
num(R + "keys.labelScale", "Key label size", 1, 0.4, 3, 0.05, G.keyGeo, undefined, "×");
bool(R + "acousticBlackKeyOffsets", "Concert-grand black key offsets", true, G.keyGeo, "Authentic asymmetric black-key placement");
bool(R + "autoZoomRange", "Fit keyboard to the piece's range", false, G.keyGeo, "Zooms to the notes actually used instead of all 88 keys");

/* -- keyboard colours -- */
col(C + "whiteKey", "White key ivory", "#f8f2e4", G.keyLook);
col(C + "blackKey", "Black key lacquer", "#16120f", G.keyLook);
col(C + "keyLabel", "Key label", "#8b7b5c", G.keyLook);
col(C + "keyLabelC", "Key label · C notes", "#8b5a1e", G.keyLook);
col(C + "keyLabelBlack", "Key label · black keys", "#ebe0c8", G.keyLook);
col(C + "rail", "Damper rail (baize)", "#6e2535", G.keyLook, "The felt strip above the keys");
col(C + "railTrim", "Rail brass trim", "#d4a24c", G.keyLook);
col(C + "frontBoard", "Front board wood", "#3d2614", G.keyLook, "The key slip under the keys");

/* -- note shape -- */
num(R + "notes.widthWhite", "Note width · white keys", 0.88, 0.2, 1, 0.01, G.noteShape, "Relative to the key lane", "×");
num(R + "notes.widthBlack", "Note width · black keys", 0.84, 0.2, 1, 0.01, G.noteShape, undefined, "×");
num(R + "notes.cornerRadius", "Note corner rounding", 0.22, 0, 0.5, 0.01, G.noteShape);
num(R + "notes.minHeight", "Minimum note height", 4, 1, 40, 0.5, G.noteShape, "Keeps staccato notes visible", "px");
num(R + "notes.gap", "Gap above strike line", 1.6, 0, 12, 0.1, G.noteShape, undefined, "px");
num(R + "notes.opacity", "Note opacity", 1, 0.05, 1, 0.01, G.noteShape);
num(R + "notes.velocityDim", "Velocity dimming", 0.16, 0, 1, 0.01, G.noteShape, "How much soft notes darken");
num(R + "notes.blackDarken", "Black-key note darkening", 0.16, 0, 0.8, 0.01, G.noteShape);
num(R + "notes.topLight", "Top-to-bottom light gradient", 1, 0, 3, 0.05, G.noteShape, undefined, "×");
num(R + "notes.shine", "Side sheen", 1, 0, 3, 0.05, G.noteShape, undefined, "×");
num(R + "notes.outline", "Bright rim light", 1, 0, 3, 0.05, G.noteShape, undefined, "×");
num(R + "notes.edgeShadow", "Dark outer edge", 1, 0, 3, 0.05, G.noteShape, undefined, "×");
num(R + "notes.strikeFlare", "Strike-edge flare", 1, 0, 3, 0.05, G.noteShape, undefined, "×");
num(R + "notes.labelScale", "Label size on notes", 1, 0.4, 3, 0.05, G.noteShape, undefined, "×");

/* -- note colours -- */
opt(R + "colorMode", "Colour mode", "hand", [
  { value: "hand", label: "By hand / voice" },
  { value: "finger", label: "By finger 1–5" },
  { value: "pitch", label: "By pitch class" },
  { value: "colorblind", label: "Colour-blind safe" },
  { value: "monochrome", label: "Monochrome" },
], G.noteCol, "Which palette below is applied to the falling notes");
col(C + "rightHand", "Right hand", "#f2b84b", G.noteCol);
col(C + "leftHand", "Left hand", "#4fc4a8", G.noteCol);
["#ea695c", "#f0a24a", "#ebd46a", "#5bba8b", "#5b94d9"].forEach((c, i) => col(`${C}finger.${i}`, `Finger ${i + 1}`, c, G.noteCol));
["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"].forEach((n, i) =>
  col(`${C}pitch.${i}`, `Pitch class ${n}`, ["#e6604f", "#ee8046", "#f1a340", "#efc94b", "#d6dd58", "#90d05e", "#4fc18a", "#40bdb8", "#4a9cdc", "#6c80e1", "#9b6fe1", "#cd67c6"][i], G.noteCol),
);
col(C + "colorblindRight", "Colour-blind · right hand", "#e69f00", G.noteCol);
col(C + "colorblindLeft", "Colour-blind · left hand", "#56b4e9", G.noteCol);
col(C + "monoRight", "Monochrome · right hand", "#f1e8d4", G.noteCol);
col(C + "monoLeft", "Monochrome · left hand", "#a99e88", G.noteCol);

/* -- glow -- */
num(R + "glow.noteActiveBlur", "Sounding-note glow radius", 20, 0, 90, 1, G.glow, undefined, "px");
num(R + "glow.noteActiveAlpha", "Sounding-note glow intensity", 0.75, 0, 1, 0.01, G.glow);
num(R + "glow.noteIdleAlpha", "Resting-note halo intensity", 0.1, 0, 0.8, 0.01, G.glow);
num(R + "glow.noteIdleSpread", "Resting-note halo size", 2, 0, 14, 0.5, G.glow, undefined, "px");
num(R + "glow.beamAlpha", "Light-beam intensity", 0.34, 0, 1, 0.01, G.glow, "Vertical beam rising from struck keys");
num(R + "glow.beamHeight", "Light-beam height", 0.3, 0, 1, 0.01, G.glow, "Fraction of the lane height");
num(R + "glow.bloomAlpha", "Strike bloom intensity", 0.62, 0, 1.5, 0.01, G.glow);
num(R + "glow.bloomSize", "Strike bloom size", 1, 0, 4, 0.05, G.glow, undefined, "×");
num(R + "glow.bloomDecay", "Strike bloom decay speed", 2.2, 0, 10, 0.1, G.glow, "Higher = fades faster after the strike");
num(R + "glow.sparkCount", "Sparks per strike", 7, 0, 30, 1, G.glow);
num(R + "glow.sparkSpeed", "Spark speed", 1, 0.1, 4, 0.05, G.glow, undefined, "×");
num(R + "glow.sparkSize", "Spark size", 1, 0.2, 5, 0.05, G.glow, undefined, "×");
num(R + "glow.sparkAlpha", "Spark brightness", 0.8, 0, 1, 0.01, G.glow);
num(R + "glow.keyWash", "Pressed-key colour wash", 1, 0, 1.5, 0.01, G.glow, "How strongly struck keys take the note colour", "×");
num(R + "glow.blackKeyHalo", "Black-key halo", 0.35, 0, 1.5, 0.01, G.glow, "Soft light around pressed black keys");
num(R + "glow.railGlow", "Damper-rail glow", 0.7, 0, 1.5, 0.01, G.glow);
num(R + "glow.frontBoardGlow", "Front-board underglow", 0.35, 0, 1.5, 0.01, G.glow, "Light spilling under pressed keys");
num(R + "glow.impactFlash", "Impact flash", 0.45, 0, 1.5, 0.01, G.glow, "Quick white flash at the instant of the strike");
num(R + "glow.contactBar", "Strike contact line", 1, 0, 2, 0.01, G.glow, undefined, "×");
num(R + "glow.contactSegment", "Lit contact segments", 0.9, 0, 1.5, 0.01, G.glow);
num(R + "glow.incomingKey", "Incoming-key pre-glow (keys)", 1, 0, 3, 0.05, G.glow, undefined, "×");
num(R + "glow.incomingRail", "Incoming-key pre-glow (rail)", 1, 0, 3, 0.05, G.glow, undefined, "×");
num(R + "glow.sustainTail", "Sustain-pedal tail intensity", 0.26, 0, 1, 0.01, G.glow);
num(R + "glow.lamp", "Lamp glow behind lanes", 0.13, 0, 0.6, 0.005, G.glow);
num(R + "glow.pedalWash", "Pedal-down wash", 0.1, 0, 0.6, 0.005, G.glow);

/* -- background -- */
col(C + "bgTop", "Background · top", "#080605", G.bg);
col(C + "bgMid", "Background · middle", "#100b08", G.bg);
col(C + "bgBottom", "Background · bottom", "#1b130d", G.bg);
col(C + "lamp", "Lamp glow colour", "#d69648", G.bg);
col(C + "pedalWash", "Pedal wash colour", "#d68c46", G.bg);
col(C + "dust", "Dust-mote colour", "#ffd696", G.bg);
num(R + "lines.blackLaneShade", "Black-key lane darkness", 0.34, 0, 0.9, 0.01, G.bg);
num(R + "lines.whiteLaneAlt", "White-lane alternation", 0.012, 0, 0.2, 0.002, G.bg, "Subtle striping that helps track columns");
num(R + "lines.vignetteTop", "Top vignette", 0.62, 0, 1, 0.01, G.bg);
num(R + "lines.vignetteSide", "Side vignette", 0.42, 0, 1, 0.01, G.bg);
bool(R + "ambientDust", "Floating dust motes", false, G.bg);
num(R + "dust.count", "Dust mote count", 54, 0, 400, 1, G.bg);
num(R + "dust.speed", "Dust mote speed", 1, 0, 6, 0.05, G.bg, undefined, "×");
num(R + "dust.size", "Dust mote size", 1, 0.2, 6, 0.05, G.bg, undefined, "×");
num(R + "dust.alpha", "Dust mote brightness", 1, 0, 3, 0.05, G.bg, undefined, "×");

/* -- lines -- */
col(C + "laneGuide", "Octave guide colour", "#ecc88a", G.lines);
col(C + "beatLine", "Beat line colour", "#ecd0a0", G.lines);
col(C + "measureLine", "Measure line colour", "#eece92", G.lines);
col(C + "measureNumber", "Measure number colour", "#f0d49e", G.lines);
col(C + "accent", "Strike line / HUD accent", "#e2b260", G.lines);
col(C + "accentLight", "Strike line highlight", "#ffe2a0", G.lines);
num(R + "lines.guideAlphaC", "Octave (C) guide intensity", 0.3, 0, 1, 0.01, G.lines);
num(R + "lines.guideAlphaF", "Semi-guide (F) intensity", 0.11, 0, 1, 0.01, G.lines);
num(R + "lines.guideWidth", "Guide thickness", 1, 0.2, 5, 0.05, G.lines, undefined, "×");
num(R + "lines.beatAlpha", "Beat line intensity", 0.075, 0, 1, 0.005, G.lines);
num(R + "lines.measureAlpha", "Measure line intensity", 0.34, 0, 1, 0.01, G.lines);
num(R + "lines.measureWidth", "Measure line thickness", 1, 0.2, 5, 0.05, G.lines, undefined, "×");
num(R + "lines.measureNumberSize", "Measure number size", 1, 0.4, 4, 0.05, G.lines, undefined, "×");

/* -- HUD -- */
col(C + "hudPanel", "HUD panel colour", "#221a13", G.hud);
col(C + "hudText", "HUD title colour", "#f7ecd3", G.hud);
col(C + "hudSub", "HUD subtitle colour", "#c4ac80", G.hud);
col(C + "chordText", "Chord symbol colour", "#fbefd4", G.hud);
col(C + "chordRoman", "Roman numeral colour", "#e0b45c", G.hud);
num(R + "hud.scale", "HUD size", 1, 0.4, 3, 0.05, G.hud, undefined, "×");
num(R + "hud.opacity", "HUD opacity", 1, 0, 1, 0.01, G.hud);
num(R + "hud.panelAlpha", "HUD panel solidity", 0.82, 0, 1, 0.01, G.hud);
num(R + "hud.chordScale", "Chord banner size", 1, 0.4, 3, 0.05, G.hud, undefined, "×");
num(R + "hud.chordOffsetY", "Chord banner vertical offset", 0, -40, 400, 1, G.hud, undefined, "px");

/* -- harmony analysis -- */
opt(R + "analysis.chordSensitivity", "Chord detection sensitivity", "balanced", [
  { value: "strict", label: "Strict — only unmistakable chords" },
  { value: "balanced", label: "Balanced (recommended)" },
  { value: "detailed", label: "Detailed — extensions & colour chords" },
], G.analysis, "Chords appear only when they are really played; this sets how much evidence is required");
bool(R + "analysis.detectArpeggios", "Recognise arpeggiated chords", true, G.analysis, "A chord built up note-by-note (Bach prelude, Alberti bass…) is named when it completes");
bool(R + "analysis.showInversions", "Show inversions as slash chords", true, G.analysis, "C/E, G7/B …");
bool(R + "analysis.romanNumerals", "Roman-numeral analysis", true, G.analysis, "Figured numerals (I⁶₄, V⁶₅), applied dominants (V⁷/V), Neapolitan sixth");
bool(R + "analysis.localKey", "Follow modulations (local key)", true, G.analysis, "Roman numerals use the key that is actually sounding, not just the global one");
num(R + "analysis.minChordHold", "Minimum chord display time", 0.6, 0.1, 4, 0.05, G.analysis, "Short chords stay readable for at least this long", "s");
bool(R + "analysis.showChordTones", "Show chord tones in the banner", true, G.analysis);
bool(R + "analysis.showKeyChip", "Show detected key in the HUD", true, G.analysis);

/* -- fine detail -- */
num(R + "finish.keyGrain", "Ivory grain", 1, 0, 3, 0.05, G.finish, "Barely-there texture on the white keys", "×");
num(R + "finish.keyVariance", "Per-key tonal variation", 1, 0, 3, 0.05, G.finish, "No two ivories are exactly alike", "×");
num(R + "finish.keybedDepth", "Keybed depth (gaps between keys)", 1, 0, 3, 0.05, G.finish, undefined, "×");
num(R + "finish.cheekBlocks", "Cheek blocks & end shading", 1, 0, 3, 0.05, G.finish, "Wooden cheeks beside a zoomed keyboard and inner shadow at the keyboard ends", "×");
bool(R + "finish.middleCMarker", "Middle-C marker", true, G.finish, "A tiny engraved dot on C4 and a notch on every C");
bool(R + "finish.brandPlate", "Brand plate on the damper rail", true, G.finish);
txt(R + "finish.brandText", "Brand plate text", "FAHH · CONCERT GRAND", G.finish, "Engraved on the rail, like a fallboard nameplate");
num(R + "finish.lampSheen", "Lamp sheen along the keys", 1, 0, 3, 0.05, G.finish, undefined, "×");
num(R + "finish.noteFadeIn", "Notes emerge from the dark", 0.16, 0, 0.6, 0.01, G.finish, "Fraction of the lane over which new notes fade in");
num(R + "finish.noteCore", "Note inner core light", 1, 0, 3, 0.05, G.finish, "A fine bright line down the centre of every note", "×");
num(R + "finish.noteReflection", "Note reflection on the rail", 1, 0, 3, 0.05, G.finish, "Approaching notes are faintly mirrored in the brass", "×");
num(R + "finish.laneDepth", "Lane depth shading", 1, 0, 3, 0.05, G.finish, undefined, "×");
bool(R + "finish.keyPhysics", "Physical key press model", true, G.finish, "Keys are pushed down with real travel, rebound and depth cues. Off = the original shallow press");
num(R + "finish.pressHold", "Press · hold depth at pp", 0.72, 0.3, 1, 0.01, G.finish, "How far a soft (pp) key travels; ff always reaches the keybed", "of travel");
num(R + "finish.pressAttackSlow", "Press · attack time at pp", 0.11, 0.01, 0.4, 0.005, G.finish, "Seconds for a soft key to go down", "s");
num(R + "finish.pressAttackFast", "Press · attack time at ff", 0.018, 0.004, 0.2, 0.002, G.finish, "Seconds for a hard strike to reach the keybed", "s");
num(R + "finish.pressBottomOut", "Press · felt compression & rebound", 0.045, 0, 0.15, 0.005, G.finish, "Hard strikes squash the keybed felt and rebound within ~70 ms", "of travel");
num(R + "finish.pressReleaseSlow", "Press · release time (slow)", 0.14, 0.02, 0.5, 0.005, G.finish, "Seconds for a gently released key to return", "s");
num(R + "finish.pressReleaseFast", "Press · release time (fast)", 0.07, 0.02, 0.4, 0.005, G.finish, "Seconds for a key released after a hard strike", "s");
num(R + "finish.pressOvershoot", "Press · release overshoot", 0.03, 0, 0.1, 0.005, G.finish, "How far above rest height a returning key springs", "of travel");
num(R + "finish.pressAnticipation", "Press · anticipation", 20, 0, 40, 1, G.finish, "The key starts to move this long before the note and lifts before its end (0 = exact old timing)", "ms");
num(R + "finish.pressVariation", "Press · per-key variation", 1, 0, 3, 0.05, G.finish, "Tiny deterministic differences in depth and speed between keys", "×");
num(R + "finish.cueDrop", "Cue · surface drop & foreshortening", 1, 0, 3, 0.05, G.finish, "The top face of a pressed key sinks and compresses", "×");
num(R + "finish.cueNose", "Cue · nose sinks under the key slip", 1, 0, 3, 0.05, G.finish, "Visible front face shrinks, the slip shades it", "×");
num(R + "finish.cueSideWalls", "Cue · exposed neighbour walls", 1, 0, 3, 0.05, G.finish, "Side walls revealed beside a pressed key", "×");
num(R + "finish.cueChannel", "Cue · dark channel between keys", 1, 0, 3, 0.05, G.finish, "The hairline gap deepens into an occluded channel", "×");
num(R + "finish.cueContact", "Cue · contact shadows", 1, 0, 3, 0.05, G.finish, "Neighbours shade a pressed key along both edges and at the rear", "×");
num(R + "finish.cueTilt", "Cue · tilt shading & sliding reflection", 1, 0, 3, 0.05, G.finish, "The face and its reflection follow the key's pitch", "×");
num(R + "finish.cueBlackKeys", "Cue · black-key depth", 1, 0, 3, 0.05, G.finish, "Pressed black keys sit lower with a tighter cast shadow", "×");
num(R + "finish.cueOverhang", "Cue · black-key overhang shadow", 1, 0, 3, 0.05, G.finish, "The shadow on a pressed white key's neck deepens", "×");
num(R + "finish.cueBounce", "Cue · coloured bounce light", 1, 0, 3, 0.05, G.finish, "Note colour spills onto exposed walls, the channel floor and the key crest", "×");
num(R + "finish.lightAngle", "Light · key-light direction", -38, -80, 80, 1, G.finish, "Single light model: negative = softbox from the upper left. Highlights, bevels and shadows follow it", "°");
num(R + "finish.lightFill", "Light · soft fill", 1, 0, 3, 0.05, G.finish, "Fill light that lifts the shaded edges", "×");
num(R + "finish.lightAmbient", "Light · shadow depth (ambient)", 1, 0, 3, 0.05, G.finish, "Strength of every cast and contact shadow on the keyboard", "×");
num(R + "finish.ivoryDetail", "Ivory detail (pores, edge warmth)", 1, 0, 2, 0.05, G.finish, "Micro-pores, fibres and the warm translucent edge of the ivory", "×");
num(R + "finish.ebonyDetail", "Ebony detail (reflections)", 1, 0, 2, 0.05, G.finish, "Soft-box streak and cool environment reflection on black keys", "×");
num(R + "finish.woodDetail", "Wood & felt detail", 1, 0, 2, 0.05, G.finish, "Grain, end-grain and felt fibres of the keybed, cheeks, slip and damper rail", "×");
num(R + "finish.brassDetail", "Brass detail (screws, dots, plate)", 1, 0, 2, 0.05, G.finish, "Bevel, slot, highlight and cast shadow on brass parts", "×");
num(R + "finish.keyDither", "Anti-banding dither", 1, 0, 3, 0.05, G.finish, "Seeded static noise that stops dark gradients banding in H.264", "×");

/* -- layout -- */
num(R + "layout.scale", "Global drawing scale", 1, 0.4, 3, 0.02, G.layout, "Scales every pixel-sized element (lines, glows, rails…)", "×");
num(R + "layout.railHeight", "Damper rail height", 1, 0, 4, 0.05, G.layout, undefined, "×");
num(R + "layout.frontBoardHeight", "Front board height", 1, 0, 6, 0.05, G.layout, undefined, "×");
num(R + "layout.minimapHeight", "Minimap height", 1, 0.4, 3, 0.05, G.layout, undefined, "×");

/* -- post -- */
num(R + "post.brightness", "Brightness", 1, 0.2, 2.5, 0.01, G.post, undefined, "×");
num(R + "post.contrast", "Contrast", 1, 0.2, 3, 0.01, G.post, undefined, "×");
num(R + "post.saturation", "Saturation", 1, 0, 3, 0.01, G.post, undefined, "×");
num(R + "post.hue", "Hue rotation", 0, -180, 180, 1, G.post, undefined, "°");
num(R + "post.grayscale", "Grayscale", 0, 0, 1, 0.01, G.post);
num(R + "post.sepia", "Sepia", 0, 0, 1, 0.01, G.post);
num(R + "post.vignette", "Screen vignette", 0, 0, 1, 0.01, G.post);
num(R + "post.bloom", "Global bloom", 0, 0, 1.5, 0.01, G.post, "Soft glow over the whole image (needs canvas filter support)");
num(R + "post.bloomRadius", "Global bloom radius", 10, 1, 60, 1, G.post, undefined, "px");

/* -- features -- */
opt(R + "activeHandFilter", "Hands shown", "both", [
  { value: "both", label: "Both hands" },
  { value: "right", label: "Right hand only" },
  { value: "left", label: "Left hand only" },
], G.features);
opt(R + "noteLabelMode", "Note labels", "fingering", [
  { value: "fingering", label: "Fingering" },
  { value: "noteName", label: "Pitch names" },
  { value: "solfege", label: "Solfège" },
  { value: "scaleDegree", label: "Scale degree" },
  { value: "none", label: "None (clean bars)" },
], G.features);
opt(R + "keyLabelMode", "Key labels", "onlyC", [
  { value: "onlyC", label: "Octave C only" },
  { value: "allWhite", label: "All naturals" },
  { value: "all88", label: "All 88 keys" },
  { value: "solfege", label: "Solfège" },
  { value: "none", label: "Unlabelled" },
], G.features);
bool(R + "useFlats", "Spell accidentals as flats (♭)", false, G.features);
bool(R + "showMeasureLines", "Measure lines", true, G.features);
bool(R + "showMeasureNumbers", "Measure numbers", true, G.features);
bool(R + "showBeatLines", "Beat lines", true, G.features);
bool(R + "showKeyLaneGuides", "Octave & semitone lane guides", true, G.features);
bool(R + "showSustainPedal", "Pedal indicator & wash", true, G.features);
bool(R + "showSustainTails", "Sustain-pedal tails", true, G.features);
bool(R + "showChordBanner", "Chord banner", true, G.features);
bool(R + "showChordBrackets", "Chord brackets in lanes", true, G.features);
bool(R + "showIncomingKeyPreview", "Incoming-key pre-glow", true, G.features);
bool(R + "showStrikeContactBar", "Strike contact line", true, G.features);
bool(R + "showHudMetadata", "Title / tempo HUD", true, G.features);
bool(R + "showKeyMinimap", "88-key minimap strip", true, G.features);
bool(R + "showAcousticBloom", "Strike bloom, beams & sparks", true, G.features);
F.push({ path: R + "mutedTracks", type: "intList", label: "Hidden voices (track indexes)", def: [], group: G.features, hint: "Zero-based voice indexes to hide, e.g. [1]" });

/* -- playback -- */
num(R + "noteFallSeconds", "Falling lookahead", 2.4, 0.5, 10, 0.1, G.playback, "Seconds of music visible above the keys", "s");
num(R + "incomingLookAheadSeconds", "Pre-glow lookahead", 0.45, 0.05, 3, 0.01, G.playback, undefined, "s");
num("playback.speed", "Playback speed", 1, 0.1, 4, 0.05, G.playback, undefined, "×");
bool("playback.practice", "Practice mode (pause at every note)", false, G.playback);
bool("playback.loopOn", "A–B measure loop", false, G.playback);
num("playback.loopStart", "Loop start measure", 1, 1, 9999, 1, G.playback);
num("playback.loopEnd", "Loop end measure", 4, 1, 9999, 1, G.playback);

/* -- audio -- */
export const INSTRUMENTS: FieldOption[] = [
  { value: "salamander", label: "Salamander Grand Piano — studio quality (recommended)" },
  { value: "fluid-grand", label: "FluidR3 Acoustic Grand Piano" },
  { value: "fluid-bright", label: "FluidR3 Bright Acoustic Piano" },
  { value: "fluid-epiano", label: "FluidR3 Electric Piano" },
  { value: "fluid-honky", label: "FluidR3 Honky-tonk Piano" },
  { value: "fluid-harpsichord", label: "FluidR3 Harpsichord" },
  { value: "fluid-celesta", label: "FluidR3 Celesta" },
  { value: "fluid-musicbox", label: "FluidR3 Music Box" },
  { value: "fluid-vibraphone", label: "FluidR3 Vibraphone" },
  { value: "fluid-marimba", label: "FluidR3 Marimba" },
  { value: "fluid-harp", label: "FluidR3 Orchestral Harp" },
  { value: "fluid-guitar", label: "FluidR3 Nylon Guitar" },
  { value: "fluid-strings", label: "FluidR3 String Ensemble" },
  { value: "fluid-organ", label: "FluidR3 Church Organ" },
  { value: "custom", label: "Custom soundfont URL…" },
];
bool("audio.enabled", "Audio on", true, G.audio, "Samples stream from a CDN. Offline → silent, nothing breaks.");
num("audio.volume", "Master volume", 0.8, 0, 1, 0.01, G.audio);
opt("audio.instrument", "Instrument / soundfont", "salamander", INSTRUMENTS, G.audio);
txt("audio.customUrl", "Custom soundfont URL", "", G.audio, "A midi-js-soundfonts style .js file, or a folder URL ending in “/” holding A0.mp3, Ds1.mp3 … (Salamander naming)");
bool("audio.followFilters", "Audio follows hand / voice filters", true, G.audio, "Hide the left hand → it is muted too");
bool("audio.honorPedal", "Honour sustain pedal", true, G.audio);
num("audio.release", "Note release time", 0.35, 0.02, 3, 0.01, G.audio, undefined, "s");
num("audio.velocityCurve", "Velocity curve", 1.6, 0.4, 4, 0.05, G.audio, "Higher = bigger difference between soft and loud");
num("audio.reverb", "Reverb amount", 0.12, 0, 1, 0.01, G.audio);
num("audio.reverbSize", "Reverb length", 2.2, 0.3, 6, 0.1, G.audio, undefined, "s");
num("audio.transpose", "Transpose", 0, -24, 24, 1, G.audio, undefined, "st");
num("audio.latency", "Audio offset", 0, -0.5, 0.5, 0.005, G.audio, "Shift sound earlier (−) or later (+) relative to the picture", "s");

/* -- video -- */
num("video.width", "Video width", 1920, 320, 7680, 2, G.video, undefined, "px");
num("video.height", "Video height", 1080, 240, 4320, 2, G.video, undefined, "px");
num("video.fps", "Frame rate", 60, 1, 240, 1, G.video, undefined, "fps");
num("video.leadInSeconds", "Lead-in offset", 2, 0, 30, 0.5, G.video, "Silent run-up before the first note", "s");
num("video.tailOutSeconds", "Tail-out", 1, 0, 30, 0.5, G.video, undefined, "s");
opt("video.qualityProfile", "Quality profile", "rgb-lossless", [
  { value: "rgb-lossless", label: "Archival master (max bitrate)" },
  { value: "yuv444-lossless", label: "High-quality editing grade" },
  { value: "compatible-lossless", label: "Compatible (smaller files)" },
], G.video);

export const SCHEMA: readonly FieldDef[] = F;
export const FIELD_BY_PATH: ReadonlyMap<string, FieldDef> = new Map(F.map((f) => [f.path, f]));

/* ------------------------------ path helpers ------------------------------ */

type Dict = Record<string, unknown>;

export function getByPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const k of path.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Dict)[k];
  }
  return cur;
}

export function setByPath(obj: Dict, path: string, value: unknown) {
  const parts = path.split(".");
  let cur: Dict = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (cur[k] == null || typeof cur[k] !== "object") cur[k] = /^\d+$/.test(parts[i + 1]) ? [] : {};
    cur = cur[k] as Dict;
  }
  cur[parts[parts.length - 1]] = value;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Resolves "keys.widthScale", "render.keys.widthScale", "fps"… to a real schema path (or null). */
export function resolvePath(p: string): string | null {
  const key = p.trim();
  if (FIELD_BY_PATH.has(key)) return key;
  for (const pre of ["render.", "video.", "playback.", "audio.", "ui.", "render.colors.", "render.glow.", "render.keys.", "render.notes."]) {
    if (FIELD_BY_PATH.has(pre + key)) return pre + key;
  }
  return null;
}

/* ------------------------------ defaults ------------------------------ */

export function buildDefaults(): AllSettings {
  const doc: Dict = {};
  for (const f of F) setByPath(doc, f.path, clone(f.def));
  return doc as unknown as AllSettings;
}

export const DEFAULTS: AllSettings = buildDefaults();
export const DEFAULT_SETTINGS: RenderSettings = DEFAULTS.render;
export const DEFAULT_SYNC: SyncConfig = DEFAULTS.video;
export const DEFAULT_PLAYBACK: PlaybackSettings = DEFAULTS.playback;
export const DEFAULT_AUDIO: AudioSettings = DEFAULTS.audio;
export const DEFAULT_UI: UiSettings = DEFAULTS.ui;

export const freshDefaults = (): AllSettings => clone(DEFAULTS);

/* ------------------------------ coercion ------------------------------ */

export function normalizeColor(v: unknown): string | null {
  if (typeof v !== "string") return null;
  let s = v.trim().toLowerCase();
  const m = s.match(/^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})/);
  if (m) {
    const h = (n: string) => Math.max(0, Math.min(255, +n)).toString(16).padStart(2, "0");
    return `#${h(m[1])}${h(m[2])}${h(m[3])}`;
  }
  if (/^[0-9a-f]{3}$|^[0-9a-f]{6}$/.test(s)) s = "#" + s;
  if (/^#[0-9a-f]{3}$/.test(s)) return "#" + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
  if (/^#[0-9a-f]{6}$/.test(s)) return s;
  return null;
}

export function coerce(f: FieldDef, v: unknown): { ok: true; value: unknown } | { ok: false; reason: string } {
  switch (f.type) {
    case "number": {
      const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
      if (typeof n !== "number" || !isFinite(n)) return { ok: false, reason: "expected a finite number" };
      let x = Math.max(f.min ?? -Infinity, Math.min(f.max ?? Infinity, n));
      if (f.step && f.step >= 1 && Number.isInteger(f.step)) x = Math.round(x);
      return { ok: true, value: x };
    }
    case "boolean": {
      if (typeof v === "boolean") return { ok: true, value: v };
      if (v === 1 || v === "1" || v === "true") return { ok: true, value: true };
      if (v === 0 || v === "0" || v === "false") return { ok: true, value: false };
      return { ok: false, reason: "expected true or false" };
    }
    case "color": {
      const c = normalizeColor(v);
      return c ? { ok: true, value: c } : { ok: false, reason: "expected a colour like #ffcc00" };
    }
    case "enum": {
      const hit = f.options?.find((o) => String(o.value) === String(v));
      return hit ? { ok: true, value: hit.value } : { ok: false, reason: `expected one of: ${f.options?.map((o) => o.value).join(", ")}` };
    }
    case "text":
      return typeof v === "string" ? { ok: true, value: v.slice(0, 2000) } : { ok: false, reason: "expected text" };
    case "intList": {
      if (!Array.isArray(v)) return { ok: false, reason: "expected a list of integers" };
      const out = v.map(Number).filter((n) => Number.isInteger(n) && n >= 0);
      return { ok: true, value: Array.from(new Set(out)).sort((a, b) => a - b) };
    }
  }
}

/* ------------------------------ patching ------------------------------ */

export interface PatchResult {
  doc: AllSettings;
  applied: string[];
  rejected: { path: string; reason: string }[];
}

function flatten(value: unknown, prefix: string, out: [string, unknown][]) {
  if (value !== null && typeof value === "object") {
    if (Array.isArray(value) && prefix && FIELD_BY_PATH.get(resolvePath(prefix) ?? "")?.type === "intList") {
      out.push([prefix, value]);
      return;
    }
    const entries: [string, unknown][] = Array.isArray(value) ? value.map((v, i) => [String(i), v]) : Object.entries(value as Dict);
    for (const [k, v] of entries) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  } else if (prefix) out.push([prefix, value]);
}

/** Validates and applies a (partial, nested or dotted) settings patch onto `doc`. Never throws. */
export function applyPatch(doc: AllSettings, patch: unknown, prefix = ""): PatchResult {
  const next = clone(doc);
  const applied: string[] = [];
  const rejected: { path: string; reason: string }[] = [];
  if (patch === null || typeof patch !== "object") {
    rejected.push({ path: prefix || "(root)", reason: "settings must be an object" });
    return { doc: next, applied, rejected };
  }
  const flat: [string, unknown][] = [];
  flatten(patch, prefix, flat);
  for (const [raw, value] of flat) {
    const path = resolvePath(raw);
    if (!path) {
      if (!raw.startsWith("meta.") && raw !== "format" && raw !== "version" && raw !== "app" && raw !== "exportedAt") rejected.push({ path: raw, reason: "unknown setting" });
      continue;
    }
    const field = FIELD_BY_PATH.get(path)!;
    const r = coerce(field, value);
    if (!r.ok) {
      rejected.push({ path, reason: r.reason });
      continue;
    }
    setByPath(next as unknown as Dict, path, r.value);
    applied.push(path);
  }
  return { doc: next, applied, rejected };
}

/* ------------------------------ import / export ------------------------------ */

export interface SettingsFile {
  format: typeof SETTINGS_FORMAT;
  version: number;
  app: string;
  exportedAt: string;
  settings: AllSettings;
}

export function exportDocument(doc: AllSettings): SettingsFile {
  return { format: SETTINGS_FORMAT, version: SETTINGS_VERSION, app: APP_NAME, exportedAt: new Date().toISOString(), settings: clone(doc) };
}

export function exportJson(doc: AllSettings, pretty = true): string {
  return JSON.stringify(exportDocument(doc), null, pretty ? 2 : 0);
}

/** Accepts a JSON string, a wrapped settings file, a bare settings document or a flat { "path": value } map. */
export function parseSettingsInput(input: unknown): unknown {
  let data = input;
  if (typeof input === "string") {
    try {
      data = JSON.parse(input);
    } catch {
      throw new Error("That isn’t valid JSON.");
    }
  }
  if (data === null || typeof data !== "object") throw new Error("Settings must be a JSON object.");
  const d = data as Dict;
  if (d.settings && typeof d.settings === "object" && (d.format === SETTINGS_FORMAT || d.app)) return d.settings;
  return data;
}

export function isDefault(doc: AllSettings, path: string): boolean {
  return JSON.stringify(getByPath(doc, path)) === JSON.stringify(FIELD_BY_PATH.get(path)?.def);
}

export function changedPaths(doc: AllSettings): string[] {
  return F.filter((f) => !isDefault(doc, f.path)).map((f) => f.path);
}

/* ------------------------------ theme presets ------------------------------ */

export interface ThemePreset {
  id: string;
  label: string;
  swatch: string[];
  patch: Record<string, unknown>;
}

function theme(o: {
  accent: string;
  accent2: string;
  surface: string;
  text: string;
  right: string;
  left: string;
  bg: [string, string, string];
  lamp: string;
  line: string;
  rail: string;
  trim: string;
  wood: string;
  accentLight: string;
  hudPanel: string;
  extra?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    "ui.accent": o.accent,
    "ui.accent2": o.accent2,
    "ui.surface": o.surface,
    "ui.text": o.text,
    [C + "rightHand"]: o.right,
    [C + "leftHand"]: o.left,
    [C + "bgTop"]: o.bg[0],
    [C + "bgMid"]: o.bg[1],
    [C + "bgBottom"]: o.bg[2],
    [C + "lamp"]: o.lamp,
    [C + "pedalWash"]: o.lamp,
    [C + "dust"]: o.accentLight,
    [C + "laneGuide"]: o.line,
    [C + "beatLine"]: o.line,
    [C + "measureLine"]: o.line,
    [C + "measureNumber"]: o.line,
    [C + "accent"]: o.accent,
    [C + "accentLight"]: o.accentLight,
    [C + "rail"]: o.rail,
    [C + "railTrim"]: o.trim,
    [C + "frontBoard"]: o.wood,
    [C + "hudPanel"]: o.hudPanel,
    [C + "hudSub"]: o.line,
    [C + "chordRoman"]: o.accent,
    ...o.extra,
  };
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: "classic-brass",
    label: "Classic Brass",
    swatch: ["#e2b256", "#59c4a8", "#6e2535"],
    patch: theme({ accent: "#e2b256", accent2: "#59c4a8", surface: "#1b1511", text: "#f3e8d0", right: "#f2b84b", left: "#4fc4a8", bg: ["#080605", "#100b08", "#1b130d"], lamp: "#d69648", line: "#ecc88a", rail: "#6e2535", trim: "#d4a24c", wood: "#3d2614", accentLight: "#ffe2a0", hudPanel: "#221a13", extra: { [C + "measureLine"]: "#eece92", [C + "beatLine"]: "#ecd0a0", [C + "measureNumber"]: "#f0d49e", [C + "hudSub"]: "#c4ac80", [C + "chordRoman"]: "#e0b45c", [C + "accent"]: "#e2b260" } }),
  },
  {
    id: "midnight-neon",
    label: "Midnight Neon",
    swatch: ["#4cc9ff", "#ff5fa2", "#101a44"],
    patch: theme({ accent: "#4cc9ff", accent2: "#ff5fa2", surface: "#10131f", text: "#e6efff", right: "#4cc9ff", left: "#ff5fa2", bg: ["#03040c", "#070a1a", "#0d1330"], lamp: "#3a6cff", line: "#8fb4ff", rail: "#1a2a78", trim: "#4cc9ff", wood: "#141c3c", accentLight: "#b9ecff", hudPanel: "#11162b" }),
  },
  {
    id: "emerald-studio",
    label: "Emerald Studio",
    swatch: ["#4fe0a0", "#e8c35a", "#0f4a38"],
    patch: theme({ accent: "#4fe0a0", accent2: "#e8c35a", surface: "#10191a", text: "#e3f5ec", right: "#7cf0b8", left: "#e8c35a", bg: ["#040806", "#07110d", "#0c1d16"], lamp: "#35c98a", line: "#9be8c4", rail: "#0f4a38", trim: "#c9b45a", wood: "#1f2c22", accentLight: "#c8ffe4", hudPanel: "#0f1d19" }),
  },
  {
    id: "rose-gold",
    label: "Rose Gold",
    swatch: ["#f0a39a", "#b9a2f0", "#5a2338"],
    patch: theme({ accent: "#f0a39a", accent2: "#b9a2f0", surface: "#1d1416", text: "#f8e8e6", right: "#f6b3a8", left: "#b9a2f0", bg: ["#0a0507", "#150a0e", "#21111a"], lamp: "#e38a8a", line: "#f1c4bd", rail: "#5a2338", trim: "#e8b4a0", wood: "#3a2022", accentLight: "#ffd9d2", hudPanel: "#241518" }),
  },
  {
    id: "sunset",
    label: "Sunset",
    swatch: ["#ff8a3d", "#c35bff", "#4a1d5c"],
    patch: theme({ accent: "#ff8a3d", accent2: "#c35bff", surface: "#1c1220", text: "#fff0e2", right: "#ffa24d", left: "#c35bff", bg: ["#0a0510", "#1a0a1c", "#2e1124"], lamp: "#ff6a3d", line: "#ffc08a", rail: "#4a1d5c", trim: "#ffb052", wood: "#35192b", accentLight: "#ffd2a6", hudPanel: "#241328" }),
  },
  {
    id: "monochrome-noir",
    label: "Monochrome Noir",
    swatch: ["#e8e8e8", "#8a8a8a", "#2a2a2a"],
    patch: theme({ accent: "#dcdcdc", accent2: "#9a9a9a", surface: "#161616", text: "#ececec", right: "#f2f2f2", left: "#8f8f8f", bg: ["#030303", "#0a0a0a", "#141414"], lamp: "#bbbbbb", line: "#cfcfcf", rail: "#3a3a3a", trim: "#cfcfcf", wood: "#222222", accentLight: "#ffffff", hudPanel: "#1a1a1a", extra: { [C + "whiteKey"]: "#f4f4f4", [C + "blackKey"]: "#111111", [C + "keyLabel"]: "#808080", [C + "keyLabelC"]: "#404040", [C + "keyLabelBlack"]: "#e0e0e0" } }),
  },
  {
    id: "high-contrast",
    label: "High Contrast",
    swatch: ["#ffe600", "#00e5ff", "#000000"],
    patch: theme({ accent: "#ffe600", accent2: "#00e5ff", surface: "#0b0b0b", text: "#ffffff", right: "#ffe600", left: "#00e5ff", bg: ["#000000", "#000000", "#0a0a0a"], lamp: "#ffffff", line: "#ffffff", rail: "#202020", trim: "#ffe600", wood: "#1a1a1a", accentLight: "#ffffff", hudPanel: "#101010", extra: { [R + "post.contrast"]: 1.18, [R + "lines.beatAlpha"]: 0.16, [R + "lines.measureAlpha"]: 0.6, [R + "lines.guideAlphaC"]: 0.5 } }),
  },
];

/* Reset values that a preset touches before applying it, so presets never stack. */
export function applyPreset(doc: AllSettings, id: string): PatchResult {
  const p = THEME_PRESETS.find((t) => t.id === id);
  if (!p) return { doc, applied: [], rejected: [{ path: id, reason: "unknown preset" }] };
  const base = clone(doc);
  const keys = new Set<string>();
  for (const pr of THEME_PRESETS) for (const k of Object.keys(pr.patch)) keys.add(k);
  for (const k of keys) {
    const f = FIELD_BY_PATH.get(k);
    if (f) setByPath(base as unknown as Dict, k, clone(f.def));
  }
  return applyPatch(base, p.patch);
}

/* ------------------------------ persistence ------------------------------ */

const STORE_KEY = "fahh-midi:settings:v1";

export function loadPersisted(): unknown | null {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function savePersisted(doc: AllSettings) {
  try {
    const d = clone(doc);
    d.render.mutedTracks = [];
    d.playback.loopOn = false;
    d.playback.practice = false;
    window.localStorage.setItem(STORE_KEY, JSON.stringify(d));
  } catch {
    /* storage unavailable (private mode, quota) – settings simply won't persist */
  }
}

export function clearPersisted() {
  try {
    window.localStorage.removeItem(STORE_KEY);
  } catch {
    /* ignore */
  }
}
