/* ------------------------------------------------------------------ *
 *  Fahh MIDI · interface theme engine
 *  Derives the whole UI palette (panels, buttons, text, accents, glows)
 *  from four colours and writes it to CSS custom properties.
 *  The default theme is the hand-tuned palette in index.css – when the
 *  four colours are default we simply remove every override.
 * ------------------------------------------------------------------ */
import { DEFAULT_UI } from "./settings";
import type { UiSettings } from "./types";

type RGB = [number, number, number];

function rgb(hex: string): RGB {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16) || 0, parseInt(h.slice(2, 4), 16) || 0, parseInt(h.slice(4, 6), 16) || 0];
}
const c8 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
const hex = ([r, g, b]: RGB) => `#${[r, g, b].map((v) => c8(v).toString(16).padStart(2, "0")).join("")}`;
const mixHex = (a: string, b: string, t: number) => {
  const A = rgb(a);
  const B = rgb(b);
  return hex([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
};
const scaleHex = (a: string, f: number) => {
  const A = rgb(a);
  return hex([A[0] * f, A[1] * f, A[2] * f]);
};

const VARS = [
  "--color-ink-950", "--color-ink-900", "--color-ink-850", "--color-ink-800", "--color-ink-750", "--color-ink-700", "--color-ink-600", "--color-ink-500",
  "--color-bone-50", "--color-bone-100", "--color-bone-200", "--color-bone-300", "--color-bone-400", "--color-bone-500", "--color-bone-600",
  "--color-brass-200", "--color-brass-300", "--color-brass-400", "--color-brass-500", "--color-brass-600", "--color-brass-700",
  "--color-verdi-300", "--color-verdi-400", "--color-verdi-500",
  "--wine-rgb", "--accent-rgb", "--accent2-rgb", "--text-rgb", "--surface-rgb", "--glass-blur",
];

export function applyUiTheme(ui: UiSettings, root: HTMLElement = document.documentElement) {
  const isDefault = ui.accent === DEFAULT_UI.accent && ui.accent2 === DEFAULT_UI.accent2 && ui.surface === DEFAULT_UI.surface && ui.text === DEFAULT_UI.text;
  const st = root.style;
  if (isDefault) {
    for (const v of VARS) st.removeProperty(v);
  } else {
    const set = (k: string, v: string) => st.setProperty(k, v);
    const s = ui.surface;
    const ink: Record<string, number> = { "950": 0.37, "900": 0.6, "850": 0.78, "800": 1, "750": 1.22, "700": 1.55, "600": 2.15, "500": 3 };
    for (const k of Object.keys(ink)) set(`--color-ink-${k}`, scaleHex(s, ink[k]));
    const t = ui.text;
    set("--color-bone-50", mixHex(t, "#ffffff", 0.35));
    set("--color-bone-100", t);
    set("--color-bone-200", mixHex(t, s, 0.1));
    set("--color-bone-300", mixHex(t, s, 0.25));
    set("--color-bone-400", mixHex(t, s, 0.42));
    set("--color-bone-500", mixHex(t, s, 0.58));
    set("--color-bone-600", mixHex(t, s, 0.7));
    const a = ui.accent;
    set("--color-brass-200", mixHex(a, "#ffffff", 0.55));
    set("--color-brass-300", mixHex(a, "#ffffff", 0.3));
    set("--color-brass-400", a);
    set("--color-brass-500", scaleHex(a, 0.89));
    set("--color-brass-600", scaleHex(a, 0.72));
    set("--color-brass-700", scaleHex(a, 0.54));
    const b = ui.accent2;
    set("--color-verdi-300", mixHex(b, "#ffffff", 0.35));
    set("--color-verdi-400", b);
    set("--color-verdi-500", scaleHex(b, 0.85));
    set("--wine-rgb", rgb(scaleHex(b, 0.5)).join(" "));
    set("--accent-rgb", rgb(a).join(" "));
    set("--accent2-rgb", rgb(b).join(" "));
    set("--text-rgb", rgb(t).join(" "));
    set("--surface-rgb", rgb(s).join(" "));
  }
  if (ui.glassBlur === DEFAULT_UI.glassBlur) st.removeProperty("--glass-blur");
  else st.setProperty("--glass-blur", `${ui.glassBlur}px`);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", isDefault ? "#0a0806" : scaleHex(ui.surface, 0.37));
}
