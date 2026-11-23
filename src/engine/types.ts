/* ------------------------------------------------------------------ *
 *  Fahh MIDI · shared types
 *  Defaults live in settings.ts (single schema = single source of truth).
 * ------------------------------------------------------------------ */

export type ColorMode = "hand" | "finger" | "pitch" | "colorblind" | "monochrome";
export type NoteLabelMode = "fingering" | "noteName" | "solfege" | "scaleDegree" | "none";
export type KeyLabelMode = "onlyC" | "allWhite" | "all88" | "solfege" | "none";
export type HandFilter = "both" | "right" | "left";

/** Every colour is a "#rrggbb" string. */
export interface ColorsStyle {
  rightHand: string;
  leftHand: string;
  finger: string[]; // fingers 1..5
  pitch: string[]; // 12 pitch classes, C..B
  colorblindRight: string;
  colorblindLeft: string;
  monoRight: string;
  monoLeft: string;
  bgTop: string;
  bgMid: string;
  bgBottom: string;
  lamp: string;
  laneGuide: string;
  beatLine: string;
  measureLine: string;
  measureNumber: string;
  accent: string;
  accentLight: string;
  pedalWash: string;
  rail: string;
  railTrim: string;
  frontBoard: string;
  whiteKey: string;
  blackKey: string;
  keyLabel: string;
  keyLabelC: string;
  keyLabelBlack: string;
  hudPanel: string;
  hudText: string;
  hudSub: string;
  chordText: string;
  chordRoman: string;
  dust: string;
}

export interface AnalysisStyle {
  chordSensitivity: "strict" | "balanced" | "detailed";
  detectArpeggios: boolean;
  showInversions: boolean;
  romanNumerals: boolean;
  localKey: boolean;
  minChordHold: number;
  showChordTones: boolean;
  showKeyChip: boolean;
}

export interface FinishStyle {
  keyGrain: number; // fine ivory grain on white keys
  keyVariance: number; // tiny per-key tonal variation
  keybedDepth: number; // darkness / depth of the gaps between keys
  cheekBlocks: number; // wooden cheek blocks / end shading
  middleCMarker: boolean;
  brandPlate: boolean;
  brandText: string;
  lampSheen: number; // soft lamp reflection along the keys
  noteFadeIn: number; // seconds-fraction of the lane where notes emerge from the dark
  noteCore: number; // bright inner core line of notes
  noteReflection: number; // note light reflected on the damper rail
  laneDepth: number; // subtle perspective darkening of the lanes
  // physical key press (see keypress.ts / keyboard.ts)
  keyPhysics: boolean;
  pressHold: number;
  pressAttackSlow: number;
  pressAttackFast: number;
  pressBottomOut: number;
  pressReleaseSlow: number;
  pressReleaseFast: number;
  pressOvershoot: number;
  pressAnticipation: number; // ms
  pressVariation: number;
  cueDrop: number;
  cueNose: number;
  cueSideWalls: number;
  cueChannel: number;
  cueContact: number;
  cueTilt: number;
  cueBlackKeys: number;
  cueOverhang: number;
  cueBounce: number;
  lightAngle: number; // degrees, negative = from the left
  lightFill: number;
  lightAmbient: number;
  ivoryDetail: number;
  ebonyDetail: number;
  woodDetail: number;
  brassDetail: number;
  keyDither: number;
}

export interface KeysStyle {
  heightRatio: number; // keyboard height as a fraction of the stage height (key length)
  widthScale: number; // 1 = 88 keys fit the width
  panX: number; // -1..1 when the keyboard is wider than the stage
  blackWidthRatio: number;
  blackHeightRatio: number;
  gap: number;
  cornerRadius: number;
  pressDepth: number;
  gloss: number;
  bevel: number;
  labelScale: number;
}

export interface NotesStyle {
  widthWhite: number;
  widthBlack: number;
  cornerRadius: number;
  minHeight: number;
  gap: number;
  opacity: number;
  velocityDim: number;
  blackDarken: number;
  topLight: number;
  shine: number;
  outline: number;
  edgeShadow: number;
  strikeFlare: number;
  labelScale: number;
}

export interface GlowStyle {
  noteActiveBlur: number;
  noteActiveAlpha: number;
  noteIdleAlpha: number;
  noteIdleSpread: number;
  beamAlpha: number;
  beamHeight: number;
  bloomAlpha: number;
  bloomSize: number;
  bloomDecay: number;
  sparkCount: number;
  sparkSpeed: number;
  sparkSize: number;
  sparkAlpha: number;
  keyWash: number;
  blackKeyHalo: number;
  railGlow: number;
  frontBoardGlow: number;
  impactFlash: number;
  contactBar: number;
  contactSegment: number;
  incomingKey: number;
  incomingRail: number;
  sustainTail: number;
  lamp: number;
  pedalWash: number;
}

export interface LinesStyle {
  beatAlpha: number;
  measureAlpha: number;
  guideAlphaC: number;
  guideAlphaF: number;
  guideWidth: number;
  measureWidth: number;
  measureNumberSize: number;
  blackLaneShade: number;
  whiteLaneAlt: number;
  vignetteTop: number;
  vignetteSide: number;
}

export interface HudStyle {
  scale: number;
  opacity: number;
  panelAlpha: number;
  chordScale: number;
  chordOffsetY: number;
}

export interface LayoutStyle {
  scale: number;
  railHeight: number;
  frontBoardHeight: number;
  minimapHeight: number;
}

export interface DustStyle {
  count: number;
  speed: number;
  size: number;
  alpha: number;
}

export interface PostStyle {
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  grayscale: number;
  sepia: number;
  vignette: number;
  bloom: number;
  bloomRadius: number;
}

export interface RenderSettings {
  noteFallSeconds: number;
  colorMode: ColorMode;
  noteLabelMode: NoteLabelMode;
  keyLabelMode: KeyLabelMode;
  useFlats: boolean;
  showMeasureLines: boolean;
  showBeatLines: boolean;
  showMeasureNumbers: boolean;
  showSustainPedal: boolean;
  showSustainTails: boolean;
  showChordBanner: boolean;
  showChordBrackets: boolean;
  showKeyLaneGuides: boolean;
  showIncomingKeyPreview: boolean;
  incomingLookAheadSeconds: number;
  showStrikeContactBar: boolean;
  showHudMetadata: boolean;
  acousticBlackKeyOffsets: boolean;
  autoZoomRange: boolean;
  showKeyMinimap: boolean;
  showAcousticBloom: boolean;
  ambientDust: boolean;
  activeHandFilter: HandFilter;
  mutedTracks: number[];
  keys: KeysStyle;
  notes: NotesStyle;
  glow: GlowStyle;
  colors: ColorsStyle;
  lines: LinesStyle;
  hud: HudStyle;
  analysis: AnalysisStyle;
  finish: FinishStyle;
  layout: LayoutStyle;
  dust: DustStyle;
  post: PostStyle;
}

export type QualityProfile = "rgb-lossless" | "yuv444-lossless" | "compatible-lossless";

export interface SyncConfig {
  width: number;
  height: number;
  fps: number;
  leadInSeconds: number;
  tailOutSeconds: number;
  qualityProfile: QualityProfile;
}

export interface PlaybackSettings {
  speed: number;
  practice: boolean;
  loopOn: boolean;
  loopStart: number;
  loopEnd: number;
}

export interface AudioSettings {
  enabled: boolean;
  volume: number;
  instrument: string;
  customUrl: string;
  followFilters: boolean;
  honorPedal: boolean;
  release: number;
  velocityCurve: number;
  reverb: number;
  reverbSize: number;
  transpose: number;
  latency: number;
}

export interface UiSettings {
  accent: string;
  accent2: string;
  surface: string;
  text: string;
  glassBlur: number;
}

export interface AllSettings {
  render: RenderSettings;
  video: SyncConfig;
  playback: PlaybackSettings;
  audio: AudioSettings;
  ui: UiSettings;
}
