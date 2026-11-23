import { Copy, Download, Music4 } from "lucide-react";
import { memo, useEffect, useMemo, useRef } from "react";
import { summariseHarmony, type Chord } from "../engine/chords";
import { formatTime, measureAt, type Song } from "../engine/midi";
import { downloadBlob } from "../engine/sync";
import type { AnalysisStyle } from "../engine/types";
import { cn } from "../utils/cn";
import { Drawer } from "./panels";
import { PanelHeader, Section, Segmented, Stat, ToggleRow } from "./primitives";

const baseName = (song: Song) => song.fileName.replace(/\.(mid|midi)$/i, "") || "chords";

/** A readable chord chart: one line per phrase of four measures. */
export function chordChartText(song: Song): string {
  const lines: string[] = [`${song.name}`, `Key: ${song.key.name}  ·  ${song.chords.length} chords`, ""];
  let row: string[] = [];
  let rowStart = -1;
  let lastMeasure = -1;
  const flush = () => {
    if (row.length) lines.push(`m.${String(rowStart).padStart(3, " ")}  ${row.join("  ")}`);
    row = [];
  };
  for (const c of song.chords) {
    const m = measureAt(song, c.start);
    if (rowStart < 0 || m >= rowStart + 4) {
      flush();
      rowStart = m;
      lastMeasure = -1;
    }
    if (m !== lastMeasure && row.length) row.push("|");
    lastMeasure = m;
    row.push(c.symbol);
  }
  flush();
  return lines.join("\n");
}

export function chordsJson(song: Song) {
  return {
    song: song.name,
    key: { name: song.key.name, tonicPitchClass: song.key.tonic, minor: song.key.minor, confidence: +song.key.confidence.toFixed(3) },
    chords: song.chords.map((c) => ({
      time: +c.start.toFixed(4),
      end: +c.end.toFixed(4),
      measure: measureAt(song, c.start),
      symbol: c.symbol,
      root: c.root,
      quality: c.quality,
      bass: c.bass,
      tones: c.tones,
      roman: c.roman,
      function: c.fn,
      confidence: c.confidence,
      kind: c.kind,
      key: c.key,
    })),
  };
}

const Row = memo(function Row({ c, active, onSeek, song }: { c: Chord; active: boolean; onSeek: (t: number) => void; song: Song }) {
  return (
    <button
      data-active={active ? "true" : "false"}
      onClick={() => onSeek(Math.max(0, c.spanStart - 0.05))}
      title={`${c.spelled} · ${c.kind === "arpeggio" ? "arpeggiated" : "struck together"} · confidence ${(c.confidence * 100).toFixed(0)}%`}
      className={cn(
        "group flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors [content-visibility:auto] [contain-intrinsic-size:auto_46px]",
        active ? "border-brass-400/60 bg-brass-500/[0.14] shadow-[0_0_24px_-10px_rgb(var(--accent-rgb)/.7)]" : "border-transparent hover:border-white/10 hover:bg-white/[0.04]",
      )}
    >
      <span className="tabular w-[68px] flex-none text-[10.5px] text-bone-500">
        m.{measureAt(song, c.start)} · {formatTime(c.start, false)}
      </span>
      <span className="serif min-w-0 flex-1 truncate text-[19px] font-bold italic leading-none text-bone-50">
        {c.root}
        <sup className="text-[12px] font-semibold not-italic text-bone-200">{c.quality}</sup>
        {c.bass && <span className="text-[15px] text-bone-300">/{c.bass}</span>}
      </span>
      <span className="w-[74px] flex-none truncate text-right text-[11.5px] font-semibold text-brass-300">{c.roman}</span>
      <span className="flex w-9 flex-none items-center" aria-hidden>
        <span className="h-1 w-full overflow-hidden rounded-full bg-white/10">
          <span className="block h-full rounded-full bg-gradient-to-r from-brass-500 to-brass-300" style={{ width: `${Math.round(c.confidence * 100)}%` }} />
        </span>
      </span>
    </button>
  );
});

export function HarmonyPanel({
  song,
  rev,
  t,
  analysis,
  patch,
  onSeek,
  onNotify,
  onClose,
}: {
  song: Song;
  rev: number;
  t: number;
  analysis: AnalysisStyle;
  patch: (p: Record<string, unknown>) => void;
  onSeek: (t: number) => void;
  onNotify: (text: string) => void;
  onClose: () => void;
}) {
  void rev;
  const summary = useMemo(() => summariseHarmony(song.chords, song.key), [song, song.chords, rev]); // eslint-disable-line react-hooks/exhaustive-deps
  const activeIdx = useMemo(() => {
    let a = -1;
    for (let i = 0; i < song.chords.length; i++) {
      if (song.chords[i].start <= t && song.chords[i].shownEnd > t) a = i;
      if (song.chords[i].start > t) break;
    }
    return a;
  }, [song.chords, t]);

  const listRef = useRef<HTMLDivElement>(null);
  const lastScrolled = useRef(-2);
  useEffect(() => {
    if (activeIdx < 0 || activeIdx === lastScrolled.current) return;
    lastScrolled.current = activeIdx;
    // scroll only the progression list (never the whole drawer)
    const box = listRef.current;
    const el = box?.querySelector<HTMLElement>(`[data-i="${activeIdx}"]`);
    if (box && el) box.scrollTo({ top: Math.max(0, el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2), behavior: "smooth" });
  }, [activeIdx]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(chordChartText(song));
      onNotify("Chord chart copied to the clipboard.");
    } catch {
      onNotify("Couldn’t access the clipboard — use the download buttons instead.");
    }
  };
  const key = song.key;
  const pct = Math.round(key.confidence * 100);
  const SHOWN = 600;

  return (
    <Drawer label="Harmony analysis" width={460}>
      <PanelHeader title="Harmony" subtitle="Chords appear only when they are really played" icon={<Music4 size={19} />} onClose={onClose} />
      <div className="scroll flex-1 space-y-3.5 overflow-y-auto p-4">
        <Section title="Key" hint="Krumhansl–Schmuckler profile correlation over the whole piece">
          <div className="flex items-end justify-between gap-4 px-1">
            <div>
              <div className="serif text-[30px] font-bold italic leading-none text-bone-50">{key.name}</div>
              <div className="mt-1.5 text-[11px] text-bone-500">
                {key.source === "key-signature" ? "from the key signature" : "estimated from the notes"} · {Math.abs(key.sharps)} {key.sharps < 0 ? "flat" : "sharp"}
                {Math.abs(key.sharps) === 1 ? "" : "s"}
              </div>
            </div>
            <div className="w-28 text-right">
              <div className="tabular text-[12px] font-semibold text-brass-300">{pct}% sure</div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-brass-600 to-brass-300" style={{ width: `${pct}%` }} />
              </div>
            </div>
          </div>
          {summary.modulations.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5 px-1">
              {summary.modulations.slice(0, 8).map((m, i) => (
                <button key={i} className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10.5px] text-bone-300 hover:border-brass-400/50" onClick={() => onSeek(Math.max(0, m.time - 0.5))}>
                  {formatTime(m.time, false)} → {m.key}
                </button>
              ))}
            </div>
          )}
        </Section>

        <Section title="Detection" hint="Strict never guesses · Detailed names colour chords and extensions">
          <div className="space-y-3 px-1">
            <Segmented
              className="w-full"
              value={analysis.chordSensitivity}
              onChange={(v) => patch({ "render.analysis.chordSensitivity": v })}
              options={[
                { value: "strict", label: "Strict" },
                { value: "balanced", label: "Balanced" },
                { value: "detailed", label: "Detailed" },
              ]}
            />
            <ToggleRow label="Arpeggiated chords" hint="Name a chord when an arpeggio completes it" checked={analysis.detectArpeggios} onChange={(v) => patch({ "render.analysis.detectArpeggios": v })} />
            <ToggleRow label="Roman numerals" hint="I⁶₄ · V⁶₅ · V⁷/V · N⁶" checked={analysis.romanNumerals} onChange={(v) => patch({ "render.analysis.romanNumerals": v })} />
            <ToggleRow label="Follow modulations" hint="Numerals follow the key that is sounding" checked={analysis.localKey} onChange={(v) => patch({ "render.analysis.localKey": v })} />
            <ToggleRow label="Inversions as slash chords" hint="C/E, G7/B" checked={analysis.showInversions} onChange={(v) => patch({ "render.analysis.showInversions": v })} />
          </div>
        </Section>

        <Section title="Overview" right={<span className="tabular text-[11px] text-bone-500">{summary.chordCount} chords</span>}>
          {summary.distinct.length ? (
            <div className="flex flex-wrap gap-1.5 px-1">
              {summary.distinct.map((d) => (
                <span key={d.symbol} className="inline-flex items-baseline gap-1.5 rounded-lg border border-white/[0.08] bg-black/25 px-2.5 py-1">
                  <span className="serif text-[15px] font-bold italic text-bone-50">{d.symbol}</span>
                  <span className="tabular text-[10px] text-bone-500">×{d.count}</span>
                </span>
              ))}
            </div>
          ) : (
            <p className="px-1 text-[12px] leading-relaxed text-bone-500">No chords were played in this piece — it is a single line of melody, so nothing is named. (Try “Detailed” sensitivity for thinner textures.)</p>
          )}
          <div className="mt-2 px-1">
            <Stat label="Played together" value={song.chords.filter((c) => c.kind === "block").length} />
            <Stat label="Built by arpeggio" value={song.chords.filter((c) => c.kind === "arpeggio").length} />
          </div>
        </Section>

        <Section
          title="Progression"
          hint="Click a chord to jump to it"
          right={
            <div className="flex gap-1.5">
              <button className="btn btn-icon btn-sm" onClick={copy} title="Copy chord chart" aria-label="Copy chord chart">
                <Copy size={13} />
              </button>
              <button className="btn btn-icon btn-sm" onClick={() => downloadBlob(new Blob([chordChartText(song)], { type: "text/plain" }), `${baseName(song)}.chords.txt`)} title="Download chord chart (.txt)" aria-label="Download chord chart">
                <Download size={13} />
              </button>
              <button className="btn btn-sm" onClick={() => downloadBlob(new Blob([JSON.stringify(chordsJson(song), null, 2)], { type: "application/json" }), `${baseName(song)}.chords.json`)} title="Download full analysis (.json)">
                JSON
              </button>
            </div>
          }
        >
          <div ref={listRef} className="scroll relative max-h-[360px] space-y-0.5 overflow-y-auto pr-1">
            {song.chords.slice(0, SHOWN).map((c, i) => (
              <div key={i} data-i={i}>
                <Row c={c} active={i === activeIdx} onSeek={onSeek} song={song} />
              </div>
            ))}
            {song.chords.length > SHOWN && <p className="px-2 pt-2 text-center text-[11px] text-bone-500">Showing the first {SHOWN} of {song.chords.length} chords — export for the full list.</p>}
          </div>
        </Section>
      </div>
    </Drawer>
  );
}
