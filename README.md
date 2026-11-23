# Fahh MIDI

An 88-key MIDI piano visualizer with fingering, chord analysis, built-in piano sound, **absolute control over every colour / glow / size**, and a **frame-exact MP4 renderer** — fully scriptable from Python.

* Drop in any `.mid` / `.midi` file (or pick one of the six bundled pieces).
* Falling-note lanes, concert-grand keyboard, minimap, chord banner, sustain-pedal tails, practice loop & step mode.
* Sound: a studio-quality **Salamander Grand Piano** (plus FluidR3 instruments and custom soundfonts) streams from a public CDN. **Offline → silent, nothing else breaks.**
* **Settings → Advanced**: 203 settings (key length & width, contrast, every glow intensity, every colour, whole-interface theme…) with search, per-field reset, **Export / Import as one JSON file**.
* **Harmony engine**: names a chord *only when it is really played* — struck together, or completed by an arpeggio whose notes are still sounding — never from a stray passing note. 48 chord qualities (triads → 13ths, sus, add, altered, 6/9…), correct enharmonic spelling (C♯° = C♯ E G), inversions as slash chords, Krumhansl–Schmuckler **key detection** with a stable local-key follower, **Roman numerals** with figured bass (I⁶₄, V⁶₅), applied dominants (V⁷/V), Neapolitan sixth and harmonic function. Three sensitivities (strict / balanced / detailed), a **Harmony panel** (click-to-seek progression, key, statistics) and chord-chart export (.txt / .json).
* **Concert-grand finish**: recessed keybed, ivory grain and per-key tonal variation, lit key crests, side-wall shading on pressed keys, wooden cheek blocks, engraved C-dots with a brass middle C, a stamped brand plate and brass screws on the damper rail, notes that emerge from the dark and carry a glassy inner core — every detail adjustable (or removable) under *Settings → Advanced → Keyboard & lane · Fine detail*.
* **Physical key press**: every key has a continuous, analytic depress value (a pure function of time and the note events — frame-exact, no integration state): velocity-dependent hold depth and attack (pp ≈ 110 ms … ff ≈ 18 ms), felt compression with a ~70 ms rebound on hard strikes, a 70–140 ms release with a tiny overshoot, restarts from the current height on fast repeats. The pressed key drops and foreshortens, its nose sinks under the key slip, neighbour side walls are revealed, the hairline gap becomes an occluded channel, neighbours cast contact shadows, the face and its reflection tilt, black keys sit lower with a tighter cast shadow (and deepen the shadow on the white key beneath their overhang), and the note colour bounces onto walls, channel and crest. One key-light direction (`finish.lightAngle`) drives every highlight, bevel and shadow. Each cue, the motion timings and the material details (ivory pores, ebony reflections, wood/felt, brass) are settings under _Keyboard & lane · Fine detail_ (`render.finish.keyPhysics`, `pressHold`, `cue*`, `light*`, `*Detail`, `keyDither`); set `render.finish.keyPhysics=false` for the original shallow press.
* `window.FahhMIDI` + `automation/fahh_midi.py`: load MIDI, apply settings, render frames / MP4 with no manual interaction.

## Run

```bash
npm install
npm run dev        # development
npm run build      # → dist/index.html  (a single self-contained file, deploy anywhere static)
npm run preview
```

`dist/index.html` is one file (JS, CSS, fonts and the bundled MIDI repertoire are inlined) — drop it on GitHub Pages, Netlify, Vercel, S3, or open it locally.

## Deploy

`npm run build` produces **one** self-contained `dist/index.html` (JS, CSS, fonts and the bundled MIDI repertoire inlined). Upload it anywhere static. The included workflow `.github/workflows/deploy.yml` publishes it to **GitHub Pages** on every push to `main` (enable *Settings → Pages → Source: GitHub Actions*).

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `Space` | play / pause |
| `←` `→` | step one video frame |
| `Shift + ←/→` | previous / next note (also sounds the note) |
| `Home` | back to start |
| `M` | mute / unmute |
| `H` | hide / show the studio bar |

## Settings file

*Settings → Settings file → Export settings* writes `fahh-midi-settings.json` containing **every** tweakable value:

```jsonc
{
  "format": "fahh-midi-settings", "version": 1, "app": "Fahh MIDI",
  "settings": {
    "render": { "keys": { "heightRatio": 0.205, "widthScale": 1 }, "colors": { "rightHand": "#f2b84b" }, "glow": {…}, "post": { "contrast": 1 }, … },
    "video":  { "width": 1920, "height": 1080, "fps": 60, … },
    "playback": {…}, "audio": {…}, "ui": { "accent": "#e2b256", … }
  }
}
```

Import accepts that file, a bare `{ "render": … }` object, a partial patch, or a flat `{ "render.keys.widthScale": 1.2 }` map. Values are validated and clamped; unknown keys are reported and ignored. The same file can be dropped on the window, loaded with `?settingsUrl=…`, or injected via `window.FAHH_MIDI_CONFIG`.

## Automation (Python)

```bash
pip install playwright && python -m playwright install chromium
```

```python
from automation.fahh_midi import FahhMidi

with FahhMidi() as fm:                     # headless, deterministic (no saved prefs, no audio download)
    fm.load_midi("song.mid")
    fm.load_settings("look.json")          # exported from the app
    fm.set("keys.widthScale", 1.2)
    fm.set("render.colors.rightHand", "#ff4d8d")
    fm.apply_preset("midnight-neon")
    fm.render_frame("preview.png", frame=300, width=1920, height=1080)
    fm.render_mp4("song.mp4", fps=60, width=1920, height=1080)
    fm.save_settings("used.json")
    print(fm.get_analysis()["key"]["name"], len(fm.get_chords()), "chords")
    print(fm.identify_chord([55, 59, 62, 65]))   # G7
    fm.save_chords("chords.json")          # key + every chord that is really played
```

CLI:

```bash
python automation/fahh_midi.py song.mid -o song.mp4 --settings look.json --set glow.sparkCount=14 --fps 60
python automation/fahh_midi.py song.mid --chords chords.json     # key + chords as JSON
python automation/fahh_midi.py --list-settings     # every path, type, range, default
```

Automation mode is auto-detected (`navigator.webdriver`, `?automation=1`, or `window.FAHH_MIDI_AUTOMATION = true`). In it the app ignores the visitor's saved settings and does not download the soundfont, so runs are reproducible.

### `window.FahhMIDI` reference

| Area | Methods |
| --- | --- |
| state | `isReady()`, `getState()`, `getSongInfo()` |
| settings | `listSettings()`, `getSettings()`, `get(path)`, `set(path, value)`, `setSettings(patch)`, `resetSettings([path])`, `exportSettings({pretty, onlyChanged})`, `importSettings(jsonOrObject)`, `downloadSettings()`, `listPresets()`, `applyPreset(id)` |
| harmony | `getChords()`, `getAnalysis()`, `identifyChord([60,64,67])`, `listChordQualities()` |
| MIDI | `loadMidiBase64(b64, name)`, `loadMidiBytes(bytes, name)`, `loadMidiUrl(url)`, `loadBuiltInSong(id)`, `listBuiltInSongs()`, `setTrackHand(track, 'L'/'R'/'auto')` |
| transport | `play()`, `pause()`, `seekToVideoFrame(n)`, `seekToMidiTime(s)`, `setZen(bool)` |
| pixels | `renderFrame({frame, time, width, height, type})` (off-screen, window-independent), `renderFrameBase64(…)`, `getFrameDataUrl()`, `getFramePixelsRGBA()` |
| video | `exportMp4({fps, width, height, leadInSeconds, tailOutSeconds, download})`, `getLastExportInfo()`, `readLastExportChunk(i)`, `getSyncManifest()` |
| audio | `audio.status()`, `audio.preload()` |

Setting paths accept short forms: `keys.widthScale` ≡ `render.keys.widthScale`. Events: `fahhmidi-ready`, `fahhmidi-song-loaded`, `fahhmidi-settings-changed`, `fahhmidi-export-progress`, `fahhmidi-export-complete`. The DOM also exposes `#fahh-midi-file-input` / `#fahh-midi-settings-input` (for `set_input_files`) and `<html data-fahh-ready="true">`.

Startup configuration via URL: `?song=twinkle`, `?midiUrl=…`, `?settingsUrl=…`, `?settings=<json or base64-json>`, `?s.render.keys.widthScale=1.2`, `?zen=1`, `?autoexport=1`, `?fps=30&width=1280&height=720`.

The pre-rename names `window.Clavier` / `window.MidianoAncientAPI` and `clavier-export-*` events still work as aliases.

## Credits & licences

* Piano samples: **Salamander Grand Piano V3** by Alexander Holm (CC-BY 3.0), loaded from the [Tone.js audio repo](https://github.com/Tonejs/audio). Other instruments: FluidR3_GM via [gleitz/midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts). Nothing audio is bundled; samples are fetched at runtime.
* Bundled classical MIDI sequences by Bernd Krueger, [piano-midi.de](http://www.piano-midi.de) (CC BY-SA 3.0 DE).
* Fonts: Inter, Cormorant Garamond (SIL OFL).
