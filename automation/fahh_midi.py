#!/usr/bin/env python3
"""
Fahh MIDI · headless automation helper
======================================

Drive the Fahh MIDI web app from Python with zero manual interaction:
upload a MIDI file, tweak ANY setting, export / import settings files,
render frames or a frame-exact MP4 – all headless.

    pip install playwright && python -m playwright install chromium

Quick start
-----------
    from fahh_midi import FahhMidi

    with FahhMidi() as fm:                       # headless Chromium
        fm.load_midi("song.mid")
        fm.load_settings("my_look.json")         # a file exported from the Settings tab
        fm.set("keys.widthScale", 1.2)           # …or tweak individual values
        fm.set("render.colors.rightHand", "#ff4d8d")
        fm.apply_preset("midnight-neon")
        fm.render_mp4("song.mp4", fps=60, width=1920, height=1080)
        fm.save_settings("used_settings.json")   # exactly what was used
        fm.save_chords("chords.json")            # key + every chord that is really played

Command line
------------
    python fahh_midi.py song.mid -o song.mp4 --settings look.json \
        --set keys.heightRatio=0.3 --set glow.sparkCount=14 --fps 60

    python fahh_midi.py --list-settings          # every setting, its range & default

Where does it open the app?
    --url / FahhMidi(url=...)  ·  env FAHH_MIDI_URL  ·  ../dist/index.html next to this
    folder (after `npm run build`)  ·  https://… your deployed site.

MP4 export needs a browser with WebCodecs H.264 encoding (desktop Chrome / Edge, or
Playwright's chromium). If your Chromium build lacks H.264, pass channel="chrome",
or use export_frames() and encode the PNG sequence with ffmpeg.
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import sys
from pathlib import Path
from typing import Any, Callable, Iterable, Optional

try:
    from playwright.sync_api import Browser, Page, sync_playwright
except ImportError:  # pragma: no cover
    sys.exit("Playwright is required:  pip install playwright && python -m playwright install chromium")

HERE = Path(__file__).resolve().parent
_FORWARD_PROGRESS_JS = """
window.addEventListener('fahhmidi-export-progress', e => { try { window.__fahhProgress(e.detail) } catch (_) {} });
"""


def _default_url() -> str:
    env = os.environ.get("FAHH_MIDI_URL")
    if env:
        return env
    built = HERE.parent / "dist" / "index.html"
    if built.exists():
        return built.as_uri()
    raise RuntimeError("No app URL. Pass url=..., set FAHH_MIDI_URL, or run `npm run build` first.")


class FahhMidiError(RuntimeError):
    pass


class FahhMidi:
    """A running, scriptable Fahh MIDI page."""

    def __init__(
        self,
        url: Optional[str] = None,
        *,
        headless: bool = True,
        channel: Optional[str] = None,
        viewport: tuple[int, int] = (1600, 900),
        startup_settings: Optional[dict | str | Path] = None,
        on_progress: Optional[Callable[[float, int, int], None]] = None,
        timeout_s: float = 60,
    ):
        self.url = url or _default_url()
        self.headless = headless
        self.channel = channel
        self.viewport = viewport
        self.startup_settings = startup_settings
        self.on_progress = on_progress
        self.timeout_ms = int(timeout_s * 1000)
        self._pw = None
        self._browser: Optional[Browser] = None
        self.page: Optional[Page] = None

    # ------------------------------------------------------------------ lifecycle
    def __enter__(self) -> "FahhMidi":
        return self.start()

    def __exit__(self, *exc) -> None:
        self.close()

    def start(self) -> "FahhMidi":
        self._pw = sync_playwright().start()
        self._browser = self._pw.chromium.launch(
            headless=self.headless,
            channel=self.channel,
            args=["--autoplay-policy=no-user-gesture-required", "--disable-dev-shm-usage"],
        )
        ctx = self._browser.new_context(viewport={"width": self.viewport[0], "height": self.viewport[1]}, accept_downloads=True)
        self.page = ctx.new_page()
        self.page.set_default_timeout(self.timeout_ms)
        self.page.add_init_script("window.FAHH_MIDI_AUTOMATION = true;")
        if self.startup_settings is not None:
            cfg = self._read_settings(self.startup_settings)
            self.page.add_init_script(f"window.FAHH_MIDI_CONFIG = {json.dumps(cfg)};")

        def _progress(d: dict) -> None:
            if self.on_progress:
                self.on_progress(float(d.get("pct", 0)), int(d.get("frame", 0)), int(d.get("total", 0)))

        self.page.expose_function("__fahhProgress", _progress)
        self.page.add_init_script(_FORWARD_PROGRESS_JS)
        self.page.goto(self.url)
        self.page.wait_for_function("window.FahhMIDI && window.FahhMIDI.isReady()", timeout=self.timeout_ms)
        return self

    def close(self) -> None:
        for obj in (self._browser, self._pw):
            try:
                if obj:
                    obj.close() if hasattr(obj, "close") else obj.stop()
            except Exception:
                pass
        self._browser = self._pw = self.page = None

    # ------------------------------------------------------------------ plumbing
    def js(self, expression: str, arg: Any = None) -> Any:
        """Evaluate JS in the page. `expression` may be a function: js('x => FahhMIDI.get(x)', 'fps')."""
        assert self.page, "call start() or use `with FahhMidi() as fm:`"
        try:
            return self.page.evaluate(expression, arg) if arg is not None else self.page.evaluate(expression)
        except Exception as e:  # surface the page's own error message
            msg = str(e).split("\n")[0].replace("Page.evaluate: Error: ", "")
            raise FahhMidiError(msg) from None

    def api(self, method: str, *args: Any) -> Any:
        return self.js("([m, a]) => window.FahhMIDI[m](...a)", [method, list(args)])

    @staticmethod
    def _read_settings(src: dict | str | Path) -> Any:
        if isinstance(src, dict):
            return src
        p = Path(str(src))
        if p.exists():
            return json.loads(p.read_text(encoding="utf-8"))
        return json.loads(str(src))  # a JSON string

    # ------------------------------------------------------------------ MIDI input
    def load_midi(self, path: str | Path) -> dict:
        """Upload a .mid / .midi file exactly like a user would (hidden file input)."""
        path = Path(path)
        if not path.exists():
            raise FileNotFoundError(path)
        data = base64.b64encode(path.read_bytes()).decode()
        return self.api("loadMidiBase64", data, path.name)["song"]

    def load_midi_url(self, url: str) -> dict:
        return self.api("loadMidiUrl", url)["song"]

    def load_builtin(self, song_id: str) -> dict:
        return self.api("loadBuiltInSong", song_id)

    def builtin_songs(self) -> list[dict]:
        return self.api("listBuiltInSongs")

    def song_info(self) -> dict:
        return self.api("getSongInfo")

    def set_track_hand(self, track: int, hand: str) -> None:
        """hand: 'auto' | 'L' | 'R'"""
        self.api("setTrackHand", track, hand)

    # ------------------------------------------------------------------ harmony
    def get_chords(self) -> list[dict]:
        """Every chord that is really played (time, symbol, tones, roman numeral, confidence, kind…)."""
        return self.api("getChords")

    def get_analysis(self) -> dict:
        """Key estimate, chord statistics, most-used chords and the opening progression."""
        return self.api("getAnalysis")

    def identify_chord(self, notes: list[int], sensitivity: Optional[str] = None) -> Optional[dict]:
        """Name a chord from MIDI note numbers: identify_chord([60, 64, 67]) -> C major. None if it is not a chord."""
        return self.api("identifyChord", notes, {"sensitivity": sensitivity} if sensitivity else {})

    def save_chords(self, path: str | Path) -> Path:
        """Write key + chords as JSON."""
        p = Path(path)
        p.write_text(json.dumps({"analysis": self.get_analysis(), "chords": self.get_chords()}, indent=2, ensure_ascii=False), encoding="utf-8")
        return p

    # ------------------------------------------------------------------ settings
    def list_settings(self) -> list[dict]:
        """Every setting: path, type, label, group, default, min/max/step, options."""
        return self.api("listSettings")

    def get_settings(self) -> dict:
        return self.api("getSettings")

    def get(self, path: str) -> Any:
        return self.api("get", path)

    def set(self, path: str, value: Any) -> Any:
        """Set one value ('keys.widthScale', 'render.glow.sparkCount', 'audio.volume', …). Returns the stored (clamped) value."""
        return self.api("set", path, value)

    def update(self, settings: dict) -> dict:
        """Deep-merge a partial settings dict. Returns {'applied': [...], 'rejected': [...]}."""
        return self.api("setSettings", settings)

    def load_settings(self, source: dict | str | Path) -> dict:
        """Import a settings file (path), JSON string or dict – same as the Import button."""
        res = self.api("importSettings", self._read_settings(source))
        if res["rejected"]:
            print(f"[fahh-midi] ignored {len(res['rejected'])} unknown/invalid settings: {res['rejected'][:3]}", file=sys.stderr)
        return res

    def save_settings(self, path: str | Path, only_changed: bool = False) -> Path:
        """Export every setting to a JSON file – same format as the Export button."""
        text = self.api("exportSettings", {"onlyChanged": only_changed})
        p = Path(path)
        p.write_text(text, encoding="utf-8")
        return p

    def reset(self, path: Optional[str] = None) -> None:
        self.api("resetSettings", *([path] if path else []))

    def presets(self) -> list[dict]:
        return self.api("listPresets")

    def apply_preset(self, preset_id: str) -> None:
        self.api("applyPreset", preset_id)

    # ------------------------------------------------------------------ pictures
    def render_frame(self, out: str | Path, *, frame: Optional[int] = None, time: Optional[float] = None, width: Optional[int] = None, height: Optional[int] = None, fmt: str = "png") -> Path:
        """Render one frame OFF-SCREEN at the export resolution (independent of the browser window)."""
        opts: dict[str, Any] = {"type": f"image/{fmt}"}
        if frame is not None:
            opts["frame"] = frame
        if time is not None:
            opts["time"] = time
        if width:
            opts["width"] = width
        if height:
            opts["height"] = height
        b64 = self.api("renderFrameBase64", opts)
        p = Path(out)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(base64.b64decode(b64))
        return p

    def export_frames(self, directory: str | Path, *, start: int = 0, end: Optional[int] = None, step: int = 1, **kw: Any) -> int:
        """Write numbered PNGs (frame_000000.png …) – encode with ffmpeg if H.264 export isn't available."""
        total = self.api("getSyncManifest")["video"]["totalFrames"]
        end = total if end is None else min(end, total)
        d = Path(directory)
        d.mkdir(parents=True, exist_ok=True)
        n = 0
        for f in range(start, end, step):
            self.render_frame(d / f"frame_{f:06d}.png", frame=f, **kw)
            n += 1
        return n

    # ------------------------------------------------------------------ video
    def render_mp4(self, out: str | Path, *, fps: Optional[int] = None, width: Optional[int] = None, height: Optional[int] = None, lead_in: Optional[float] = None, tail_out: Optional[float] = None, manifest_path: Optional[str | Path] = None) -> dict:
        """Frame-exact silent MP4. Returns the sync manifest (also written next to the file as .sync.json)."""
        if not self.api("webCodecsSupported"):
            raise FahhMidiError("This browser has no WebCodecs; use channel='chrome' or export_frames().")
        opts: dict[str, Any] = {"download": False}
        for k, v in (("fps", fps), ("width", width), ("height", height), ("leadInSeconds", lead_in), ("tailOutSeconds", tail_out)):
            if v is not None:
                opts[k] = v
        res = self.api("exportMp4", opts)
        info = self.api("getLastExportInfo")
        out = Path(out)
        out.parent.mkdir(parents=True, exist_ok=True)
        with open(out, "wb") as fh:
            for i in range(info["chunks"]):
                fh.write(base64.b64decode(self.api("readLastExportChunk", i)))
        self.api("clearLastExport")
        mp = Path(manifest_path) if manifest_path else out.with_suffix(".mp4.sync.json")
        mp.write_text(json.dumps(res["manifest"], indent=2), encoding="utf-8")
        return res["manifest"]

    # ------------------------------------------------------------------ audio
    def preload_audio(self, timeout_s: float = 60) -> dict:
        """Download the soundfont now (only needed if you want sound in a headed session)."""
        return self.js("t => FahhMIDI.audio.preload(t)", int(timeout_s * 1000))


# ---------------------------------------------------------------------- CLI
def _parse_kv(items: Iterable[str]) -> dict:
    out: dict[str, Any] = {}
    for it in items:
        if "=" not in it:
            raise SystemExit(f"--set expects path=value, got {it!r}")
        k, v = it.split("=", 1)
        try:
            out[k.strip()] = json.loads(v)
        except json.JSONDecodeError:
            out[k.strip()] = v
    return out


def main(argv: Optional[list[str]] = None) -> int:
    ap = argparse.ArgumentParser(description="Render a MIDI file with Fahh MIDI, headless.")
    ap.add_argument("midi", nargs="?", help=".mid / .midi file to load")
    ap.add_argument("-o", "--out", help="output .mp4 (omit to only apply settings)")
    ap.add_argument("--url", help="app URL (default: env FAHH_MIDI_URL or ../dist/index.html)")
    ap.add_argument("--settings", help="settings .json (exported from the app)")
    ap.add_argument("--preset", help="theme preset id")
    ap.add_argument("--set", action="append", default=[], metavar="PATH=VALUE", help="override one setting (repeatable)")
    ap.add_argument("--fps", type=int)
    ap.add_argument("--width", type=int)
    ap.add_argument("--height", type=int)
    ap.add_argument("--frame", type=int, help="render a single PNG of this video frame instead of an MP4")
    ap.add_argument("--chords", metavar="FILE.json", help="write the detected key + every chord that is played to this JSON file")
    ap.add_argument("--save-settings", help="write the final settings used to this file")
    ap.add_argument("--channel", help="browser channel, e.g. chrome / msedge")
    ap.add_argument("--headed", action="store_true", help="show the browser window")
    ap.add_argument("--list-settings", action="store_true", help="print every setting and exit")
    ap.add_argument("--list-presets", action="store_true")
    a = ap.parse_args(argv)

    def progress(pct: float, frame: int, total: int) -> None:
        sys.stderr.write(f"\r[fahh-midi] rendering {pct:5.1f}%  ({frame}/{total})")
        sys.stderr.flush()

    with FahhMidi(a.url, headless=not a.headed, channel=a.channel, on_progress=progress) as fm:
        if a.list_settings:
            for s in fm.list_settings():
                rng = f"[{s['min']}..{s['max']}]" if s["min"] is not None else (str(s["options"]) if s["options"] else "")
                print(f"{s['path']:42} {s['type']:8} default={json.dumps(s['default'])} {rng}")
            return 0
        if a.list_presets:
            for p in fm.presets():
                print(p["id"], "-", p["label"])
            return 0
        if a.midi:
            info = fm.load_midi(a.midi)
            print(f"[fahh-midi] loaded {info['fileName']}: {info['noteCount']} notes, {info['durationSeconds']:.1f}s")
        if a.settings:
            fm.load_settings(a.settings)
        if a.preset:
            fm.apply_preset(a.preset)
        if a.set:
            res = fm.update(_parse_kv(a.set))
            if res["rejected"]:
                print("[fahh-midi] rejected:", res["rejected"], file=sys.stderr)
        if a.chords:
            an = fm.get_analysis()
            print(f"[fahh-midi] key {an['key']['name']} · {an['chordCount']} chords → {fm.save_chords(a.chords)}")
        if a.save_settings:
            print("[fahh-midi] settings →", fm.save_settings(a.save_settings))
        if a.out and a.frame is not None:
            print("[fahh-midi] frame →", fm.render_frame(a.out, frame=a.frame, width=a.width, height=a.height))
        elif a.out:
            m = fm.render_mp4(a.out, fps=a.fps, width=a.width, height=a.height)
            sys.stderr.write("\n")
            v = m["video"]
            print(f"[fahh-midi] {a.out}: {v['width']}x{v['height']} @ {v['fps']}fps, {v['totalFrames']} frames")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
