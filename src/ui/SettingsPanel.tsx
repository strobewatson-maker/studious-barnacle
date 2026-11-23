import { ClipboardCopy, Download, FileJson, Gauge, Layers, Music, Palette, RotateCcw, Search, SlidersHorizontal, Sparkles, Upload, Volume2, VolumeX, Waves, Wrench } from "lucide-react";
import { useMemo, useState } from "react";
import type { AudioStatus } from "../engine/audio";
import {
  FIELD_BY_PATH,
  GROUP_ORDER,
  INSTRUMENTS,
  SCHEMA,
  THEME_PRESETS,
  changedPaths,
  exportJson,
  getByPath,
  isDefault,
  type FieldDef,
  type PatchResult,
} from "../engine/settings";
import type { AllSettings, ColorMode, HandFilter, KeyLabelMode, NoteLabelMode } from "../engine/types";
import { cn } from "../utils/cn";
import { Drawer } from "./panels";
import { Collapsible, ColorField, NumberInput, PanelHeader, ResetButton, Section, Segmented, Select, Slider, TextField, ToggleRow } from "./primitives";

export interface SettingsPanelProps {
  doc: AllSettings;
  patch: (p: Record<string, unknown>) => PatchResult;
  reset: (paths?: string[]) => void;
  preset: (id: string) => void;
  onImportText: (text: string) => { applied: number; rejected: { path: string; reason: string }[] };
  onPickImportFile: () => void;
  onExport: () => void;
  audio: AudioStatus;
  onClose: () => void;
}

/* ------------------------------ one schema field ------------------------------ */

function FieldRow({ f, doc, patch }: { f: FieldDef; doc: AllSettings; patch: (p: Record<string, unknown>) => PatchResult }) {
  const value = getByPath(doc, f.path);
  const changed = !isDefault(doc, f.path);
  const set = (v: unknown) => patch({ [f.path]: v });
  const reset = <span className="flex h-6 w-6 flex-none items-center justify-center">{changed && <ResetButton label={f.label} onClick={() => set(f.def)} />}</span>;
  const caption = (
    <button
      type="button"
      title="Click to copy this setting’s path (for scripts)"
      onClick={() => void navigator.clipboard?.writeText(f.path)}
      className="mt-0.5 block max-w-full truncate text-left font-mono text-[9.5px] text-bone-600 transition-colors hover:text-brass-300"
    >
      {f.path}
    </button>
  );
  const label = (
    <div className="min-w-0 flex-1" title={f.hint}>
      <div className={cn("truncate text-[12px] leading-tight", changed ? "font-semibold text-brass-200" : "text-bone-200")}>{f.label}</div>
    </div>
  );

  if (f.type === "boolean")
    return (
      <div className="border-b border-white/[0.04] py-1.5 last:border-0">
        <div className="flex items-center gap-2">
          {label}
          <button type="button" role="switch" aria-checked={!!value} aria-label={f.label} className="switch" onClick={() => set(!value)} />
          {reset}
        </div>
        {f.hint && <div className="mt-0.5 text-[10.5px] leading-snug text-bone-500">{f.hint}</div>}
        {caption}
      </div>
    );

  if (f.type === "number")
    return (
      <div className="border-b border-white/[0.04] py-1.5 last:border-0">
        <div className="flex items-center gap-2">
          {label}
          <NumberInput label={f.label} value={value as number} onChange={set} />
          <span className="w-5 flex-none text-[10px] text-bone-500">{f.unit ?? ""}</span>
          {reset}
        </div>
        <Slider small label={f.label} min={f.min ?? 0} max={f.max ?? 1} step={f.step ?? 0.01} value={value as number} onChange={set} />
        {f.hint && <div className="text-[10.5px] leading-snug text-bone-500">{f.hint}</div>}
        {caption}
      </div>
    );

  if (f.type === "color")
    return (
      <div className="border-b border-white/[0.04] py-1.5 last:border-0">
        <div className="flex items-center gap-2">
          {label}
          <ColorField label={f.label} value={value as string} onChange={set} />
          {reset}
        </div>
        {f.hint && <div className="mt-0.5 text-[10.5px] leading-snug text-bone-500">{f.hint}</div>}
        {caption}
      </div>
    );

  if (f.type === "enum")
    return (
      <div className="border-b border-white/[0.04] py-1.5 last:border-0">
        <div className="mb-1.5 flex items-center gap-2">
          {label}
          {reset}
        </div>
        <Select<string> className="w-full" label={f.label} value={String(value)} options={(f.options ?? []).map((o) => ({ value: String(o.value), label: o.label }))} onChange={set} />
        {f.hint && <div className="mt-1 text-[10.5px] leading-snug text-bone-500">{f.hint}</div>}
        {caption}
      </div>
    );

  if (f.type === "intList")
    return (
      <div className="border-b border-white/[0.04] py-1.5 last:border-0">
        <div className="mb-1.5 flex items-center gap-2">
          {label}
          {reset}
        </div>
        <TextField label={f.label} value={(value as number[]).join(", ")} placeholder="e.g. 1, 2" onChange={(v) => set(v.split(/[ ,;]+/).filter(Boolean).map(Number))} />
        {f.hint && <div className="mt-1 text-[10.5px] leading-snug text-bone-500">{f.hint}</div>}
        {caption}
      </div>
    );

  return (
    <div className="border-b border-white/[0.04] py-1.5 last:border-0">
      <div className="mb-1.5 flex items-center gap-2">
        {label}
        {reset}
      </div>
      <TextField label={f.label} value={String(value)} placeholder={f.path.endsWith("customUrl") ? "https://…" : ""} onChange={set} />
      {f.hint && <div className="mt-1 text-[10.5px] leading-snug text-bone-500">{f.hint}</div>}
      {caption}
    </div>
  );
}

/* ------------------------------ advanced ------------------------------ */

function Advanced({ doc, patch, reset }: Pick<SettingsPanelProps, "doc" | "patch" | "reset">) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const query = q.trim().toLowerCase();
  const groups = useMemo(() => {
    const m = new Map<string, FieldDef[]>();
    for (const g of GROUP_ORDER) m.set(g, []);
    for (const f of SCHEMA) {
      if (query && !(f.label + " " + f.path + " " + (f.hint ?? "") + " " + f.group).toLowerCase().includes(query)) continue;
      m.get(f.group)!.push(f);
    }
    return Array.from(m.entries()).filter(([, fs]) => fs.length > 0);
  }, [query]);
  const toggle = (g: string) =>
    setOpen((o) => {
      const n = new Set(o);
      if (n.has(g)) n.delete(g);
      else n.add(g);
      return n;
    });

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-bone-500" />
        <input className="field w-full !pl-9" type="text" aria-label="Search settings" placeholder={`Search ${SCHEMA.length} settings — “glow”, “key width”, “contrast”…`} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {groups.length === 0 && <p className="px-2 py-6 text-center text-[12px] text-bone-500">No setting matches “{q}”.</p>}
      {groups.map(([g, fields]) => {
        const changed = fields.filter((f) => !isDefault(doc, f.path));
        const isOpen = !!query || open.has(g);
        return (
          <Collapsible
            key={g}
            title={g}
            open={isOpen}
            onToggle={() => toggle(g)}
            badge={
              <span className="flex flex-none items-center gap-1.5">
                {changed.length > 0 && <span className="rounded-full bg-brass-500/20 px-1.5 py-[1px] text-[10px] font-bold text-brass-200">{changed.length} edited</span>}
                <span className="tabular text-[10.5px] text-bone-500">{fields.length}</span>
              </span>
            }
            right={
              changed.length > 0 ? (
                <button type="button" className="btn btn-sm !h-6 !px-2 text-[10.5px]" onClick={() => reset(fields.map((f) => f.path))} title="Reset this whole group to defaults">
                  <RotateCcw size={11} /> Reset
                </button>
              ) : undefined
            }
          >
            {isOpen && fields.map((f) => <FieldRow key={f.path} f={f} doc={doc} patch={patch} />)}
          </Collapsible>
        );
      })}
    </div>
  );
}

/* ------------------------------ panel ------------------------------ */

export function SettingsPanel({ doc, patch, reset, preset, onImportText, onPickImportFile, onExport, audio, onClose }: SettingsPanelProps) {
  const r = doc.render;
  const a = doc.audio;
  const [advOpen, setAdvOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [paste, setPaste] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const edited = useMemo(() => changedPaths(doc).length, [doc]);
  const set = (path: string, v: unknown) => patch({ [path]: v });
  const flash = (ok: boolean, text: string) => {
    setMsg({ ok, text });
    window.setTimeout(() => setMsg(null), 5000);
  };

  const colorOptions: { id: ColorMode; title: string; sub: string; swatch: string[] }[] = [
    { id: "hand", title: "By hand / voice", sub: "Right & left hand pigments", swatch: [r.colors.rightHand, r.colors.leftHand] },
    { id: "finger", title: "By finger 1–5", sub: "Five finger pigments", swatch: r.colors.finger },
    { id: "pitch", title: "By pitch class", sub: "Twelve-tone chromatic", swatch: [0, 2, 4, 5, 7, 9, 11].map((i) => r.colors.pitch[i]) },
    { id: "colorblind", title: "Colour-blind safe", sub: "Okabe–Ito high contrast", swatch: [r.colors.colorblindRight, r.colors.colorblindLeft] },
    { id: "monochrome", title: "Monochrome", sub: "Two-tone ivory", swatch: [r.colors.monoRight, r.colors.monoLeft] },
  ];

  const layers: { label: string; hint: string; path: string }[] = [
    { label: "Octave & semitone lane guides", hint: "Vertical C and F boundaries across the lanes", path: "render.showKeyLaneGuides" },
    { label: "Measure lines", hint: "Horizontal barlines", path: "render.showMeasureLines" },
    { label: "Measure numbers", hint: "Classical numbering at each barline", path: "render.showMeasureNumbers" },
    { label: "Beat subdivisions", hint: "Subtle hairlines between barlines", path: "render.showBeatLines" },
    { label: "Pedal wash & indicator", hint: "CC 64 sustain wash and the “Ped.” chip", path: "render.showSustainPedal" },
    { label: "Sustain-pedal tails", hint: "Resonance plumes after released notes", path: "render.showSustainTails" },
    { label: "Chord banner", hint: "The large chord name at the top", path: "render.showChordBanner" },
    { label: "Chord brackets", hint: "Brackets and Roman numerals in the lanes", path: "render.showChordBrackets" },
    { label: "Anticipatory key pre-glow", hint: "Fallboard dots before each strike", path: "render.showIncomingKeyPreview" },
    { label: "Strike contact line", hint: "A bright sync aid at the moment of impact", path: "render.showStrikeContactBar" },
    { label: "Strike bloom, beams & sparks", hint: "Luminous bloom and sparks on impact", path: "render.showAcousticBloom" },
    { label: "Title / tempo HUD", hint: "The glass card at the top-left", path: "render.showHudMetadata" },
    { label: "88-key minimap strip", hint: "Docked beneath the keyboard", path: "render.showKeyMinimap" },
    { label: "Concert-grand black key offsets", hint: "Authentic asymmetric black-key placement", path: "render.acousticBlackKeyOffsets" },
    { label: "Floating dust motes", hint: "Ambient drifting particles in the lamplight", path: "render.ambientDust" },
    { label: "Spell accidentals as flats (♭)", hint: "Instead of sharps (♯) in all labels", path: "render.useFlats" },
  ];

  const stateText =
    audio.state === "loading"
      ? `Loading ${audio.label}… ${Math.round(audio.progress * 100)}%`
      : audio.state === "ready"
        ? `${audio.label} ready`
        : audio.state === "off"
          ? "Audio is off"
          : audio.state === "error"
            ? audio.message || "Audio unavailable"
            : `${audio.label} loads on first play`;

  return (
    <Drawer width={540} label="Settings">
      <PanelHeader title="Settings" subtitle={`Everything below is saved, exportable and scriptable${edited ? ` · ${edited} edited` : ""}`} icon={<SlidersHorizontal size={19} />} onClose={onClose} />
      <div className="scroll flex-1 space-y-3.5 overflow-y-auto p-4">
        {/* settings file */}
        <Section title="Settings file" hint="One JSON file holds every setting — perfect for automation" right={<FileJson size={16} className="text-brass-500" />}>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn" onClick={onExport} title="Download every setting as fahh-midi-settings.json">
              <Download size={14} className="text-brass-400" /> Export settings
            </button>
            <button className="btn" onClick={onPickImportFile} title="Load a settings .json file (or drop it on the window)">
              <Upload size={14} className="text-brass-400" /> Import settings
            </button>
            <button
              className="btn"
              onClick={() => {
                void navigator.clipboard?.writeText(exportJson(doc)).then(() => flash(true, "Settings JSON copied to the clipboard."), () => flash(false, "Clipboard unavailable in this browser context."));
              }}
            >
              <ClipboardCopy size={14} className="text-brass-400" /> Copy as JSON
            </button>
            <button
              className="btn btn-danger"
              onClick={() => {
                if (window.confirm("Reset every setting to its default?")) {
                  reset();
                  flash(true, "All settings reset to defaults.");
                }
              }}
            >
              <RotateCcw size={14} /> Reset all
            </button>
          </div>
          <button className="mt-2 w-full text-left text-[11px] font-semibold text-bone-400 hover:text-brass-300" onClick={() => setPasteOpen((o) => !o)}>
            {pasteOpen ? "▾" : "▸"} Paste JSON instead
          </button>
          {pasteOpen && (
            <div className="mt-2 space-y-2">
              <textarea className="field scroll w-full" rows={6} spellCheck={false} aria-label="Settings JSON" placeholder='{"render":{"keys":{"widthScale":1.2}}}' value={paste} onChange={(e) => setPaste(e.target.value)} />
              <button
                className="btn btn-brass btn-sm"
                disabled={!paste.trim()}
                onClick={() => {
                  try {
                    const res = onImportText(paste);
                    flash(res.rejected.length === 0, `Applied ${res.applied} setting${res.applied === 1 ? "" : "s"}${res.rejected.length ? ` · ${res.rejected.length} ignored (${res.rejected[0].path}: ${res.rejected[0].reason})` : ""}.`);
                  } catch (e) {
                    flash(false, (e as Error).message);
                  }
                }}
              >
                Apply JSON
              </button>
            </div>
          )}
          {msg && <p className={cn("mt-2 rounded-lg border px-3 py-2 text-[11.5px]", msg.ok ? "border-verdi-400/30 bg-verdi-400/10 text-verdi-300" : "border-red-400/30 bg-red-500/10 text-red-200")}>{msg.text}</p>}
        </Section>

        {/* presets */}
        <Section title="Theme presets" hint="Re-skins the interface and the piano together" right={<Sparkles size={16} className="text-brass-500" />}>
          <div className="grid grid-cols-2 gap-1.5">
            {THEME_PRESETS.map((p) => {
              const on = doc.ui.accent === (p.patch["ui.accent"] as string) && doc.render.colors.bgBottom === (p.patch["render.colors.bgBottom"] as string);
              return (
                <button key={p.id} className="chip !h-9 !justify-start !rounded-xl !px-2.5" aria-pressed={on} onClick={() => preset(p.id)}>
                  <span className="flex -space-x-1">
                    {p.swatch.map((c, i) => (
                      <i key={i} className="h-4 w-4 rounded-full border-2 border-ink-850" style={{ background: c }} />
                    ))}
                  </span>
                  <span className="truncate">{p.label}</span>
                </button>
              );
            })}
          </div>
        </Section>

        {/* sound */}
        <Section title="Sound" hint="Streams a sampled piano from a CDN — silent (never broken) when offline" right={a.enabled ? <Volume2 size={16} className="text-brass-500" /> : <VolumeX size={16} className="text-bone-500" />}>
          <div className="-mx-1">
            <ToggleRow label="Audio on" checked={a.enabled} onChange={(v) => set("audio.enabled", v)} />
          </div>
          <div className="mt-2 space-y-2.5 px-1">
            <Select<string> label="Instrument" className="w-full" value={a.instrument} options={INSTRUMENTS.map((o) => ({ value: String(o.value), label: o.label }))} onChange={(v) => set("audio.instrument", v)} />
            {a.instrument === "custom" && <TextField label="Custom soundfont URL" value={a.customUrl} placeholder="https://…/acoustic_grand_piano-mp3.js  or  https://…/samples/" onChange={(v) => set("audio.customUrl", v)} />}
            <div>
              <div className="mb-0.5 flex items-center justify-between text-[11.5px] text-bone-400">
                <span>Volume</span>
                <span className="tabular font-semibold text-brass-300">{Math.round(a.volume * 100)}%</span>
              </div>
              <Slider label="Volume" min={0} max={1} step={0.01} value={a.volume} onChange={(v) => set("audio.volume", v)} />
            </div>
            <div className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-[11.5px]", audio.state === "error" ? "border-red-400/25 bg-red-500/[0.07] text-red-200" : "border-white/[0.07] bg-black/20 text-bone-400")}>
              <Music size={13} className="flex-none text-brass-400" />
              <span className="min-w-0 flex-1">{stateText}</span>
            </div>
          </div>
        </Section>

        {/* pigments */}
        <Section title="Pigment system" right={<Palette size={16} className="text-brass-500" />}>
          <div className="grid grid-cols-1 gap-1.5">
            {colorOptions.map((o) => {
              const on = r.colorMode === o.id;
              return (
                <button
                  key={o.id}
                  onClick={() => set("render.colorMode", o.id)}
                  className={cn("flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all", on ? "border-brass-500/70 bg-brass-500/[0.12] shadow-[0_0_24px_-10px_rgb(var(--accent-rgb)/.7)]" : "border-white/[0.06] bg-black/20 hover:border-white/20")}
                  aria-pressed={on}
                >
                  <span className="flex w-[92px] flex-none -space-x-1">
                    {o.swatch.slice(0, 5).map((c, i) => (
                      <i key={i} className="h-5 w-5 rounded-full border-2 border-ink-850" style={{ background: c, boxShadow: `0 0 10px ${c}55` }} />
                    ))}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-[12.5px] font-semibold", on ? "text-brass-200" : "text-bone-100")}>{o.title}</span>
                    <span className="block text-[11px] text-bone-500">{o.sub}</span>
                  </span>
                  <span className={cn("h-4 w-4 flex-none rounded-full border-2 transition-all", on ? "border-brass-300 bg-brass-400 shadow-[0_0_10px_var(--color-brass-400)]" : "border-white/20")} />
                </button>
              );
            })}
          </div>
        </Section>

        {/* falling speed */}
        <Section title="Falling speed" hint="Lookahead window of the note lanes" right={<span className="tabular rounded-md border border-brass-500/40 bg-brass-500/10 px-2 py-0.5 text-[12px] font-bold text-brass-300">{r.noteFallSeconds.toFixed(1)}s</span>}>
          <div className="px-1">
            <Slider label="Falling speed lookahead" min={0.5} max={6} step={0.1} value={Math.min(6, r.noteFallSeconds)} onChange={(v) => set("render.noteFallSeconds", +v.toFixed(1))} />
            <div className="mt-1 flex justify-between text-[10.5px] font-semibold text-bone-500">
              <button onClick={() => set("render.noteFallSeconds", 1)} className="hover:text-brass-300">Fast · 1.0s</button>
              <button onClick={() => set("render.noteFallSeconds", 2.4)} className="hover:text-brass-300">Balanced · 2.4s</button>
              <button onClick={() => set("render.noteFallSeconds", 5)} className="hover:text-brass-300">Dense · 5.0s</button>
            </div>
          </div>
        </Section>

        {/* view */}
        <Section title="View" hint="Hands, labels and span" right={<Gauge size={16} className="text-brass-500" />}>
          <div className="space-y-2.5 px-1">
            <Segmented<HandFilter>
              className="w-full [&>button]:flex-1 [&>button]:justify-center"
              value={r.activeHandFilter}
              onChange={(v) => set("render.activeHandFilter", v)}
              options={[
                { value: "both", label: "Both hands" },
                { value: "right", label: "Right" },
                { value: "left", label: "Left" },
              ]}
            />
            <Select<NoteLabelMode>
              label="Note labels"
              className="w-full"
              value={r.noteLabelMode}
              onChange={(v) => set("render.noteLabelMode", v)}
              options={[
                { value: "fingering", label: "Notes · Fingering" },
                { value: "noteName", label: "Notes · Pitch (C, D, E)" },
                { value: "solfege", label: "Notes · Solfège (Do, Re)" },
                { value: "scaleDegree", label: "Notes · Scale degree" },
                { value: "none", label: "Notes · Clean bars" },
              ]}
            />
            <Select<KeyLabelMode>
              label="Key labels"
              className="w-full"
              value={r.keyLabelMode}
              onChange={(v) => set("render.keyLabelMode", v)}
              options={[
                { value: "onlyC", label: "Keys · Octave C" },
                { value: "allWhite", label: "Keys · All naturals" },
                { value: "all88", label: "Keys · All 88 keys" },
                { value: "solfege", label: "Keys · Solfège" },
                { value: "none", label: "Keys · Unlabelled" },
              ]}
            />
            <Segmented<string>
              className="w-full [&>button]:flex-1 [&>button]:justify-center"
              value={r.autoZoomRange ? "fit" : "full"}
              onChange={(v) => set("render.autoZoomRange", v === "fit")}
              options={[
                { value: "full", label: "Full 88 keys" },
                { value: "fit", label: "Fit piece range" },
              ]}
            />
          </div>
        </Section>

        {/* layers */}
        <Section title="Manuscript & pedagogical layers" right={<Layers size={16} className="text-brass-500" />}>
          <div className="-mx-1 space-y-0.5">
            {layers.map((l) => (
              <ToggleRow key={l.path} label={l.label} hint={l.hint} checked={!!getByPath(doc, l.path)} onChange={(v) => set(l.path, v)} />
            ))}
          </div>
        </Section>

        <Section title="Practice mode" right={<Waves size={16} className="text-brass-500" />}>
          <div className="-mx-1">
            <ToggleRow label="Practice step: auto-pause at each note" hint="Playback halts on every strike; press Space to continue" checked={doc.playback.practice} onChange={(v) => set("playback.practice", v)} />
          </div>
        </Section>

        {/* advanced */}
        <section className="card overflow-hidden rounded-2xl">
          <button type="button" onClick={() => setAdvOpen((o) => !o)} aria-expanded={advOpen} className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.03]">
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl border border-brass-500/40 bg-gradient-to-b from-brass-500/25 to-brass-700/10 text-brass-300">
              <Wrench size={16} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="serif block text-[18px] font-bold leading-tight text-bone-50">Advanced</span>
              <span className="block text-[11px] text-bone-500">Absolute control · {SCHEMA.length} settings · every colour, glow, size &amp; intensity</span>
            </span>
            {edited > 0 && <span className="rounded-full bg-brass-500/20 px-2 py-0.5 text-[10.5px] font-bold text-brass-200">{edited} edited</span>}
            <svg width="16" height="16" viewBox="0 0 24 24" className={cn("flex-none text-brass-400 transition-transform", advOpen && "rotate-180")} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          {advOpen && (
            <div className="border-t border-white/[0.07] p-3">
              <Advanced doc={doc} patch={patch} reset={reset} />
            </div>
          )}
        </section>
        <p className="px-2 pb-2 text-center text-[10.5px] leading-relaxed text-bone-600">
          Tip: scripts can read the full list with <span className="font-mono text-bone-400">FahhMIDI.listSettings()</span> — {FIELD_BY_PATH.size} paths.
        </p>
      </div>
    </Drawer>
  );
}
