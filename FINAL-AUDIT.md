# FINAL AUDIT — Fahh MIDI (`thedsfv`)

### The consolidated conclusion of four independent audits, cross-checked against the real source code

| | |
|---|---|
| **Repository** | https://github.com/ggsharma124421-afk/thedsfv |
| **Snapshot audited** | commit `f7a1aaa` (“Add files via upload”) — the copy bundled inside the first zip. I could not re-fetch the live repo (GitHub rate-limited me), so every finding applies to *that* snapshot. Run `git log -1` on your copy to confirm it matches. |
| **Stack** | React 19.2.6 · TypeScript 5.9.3 · Vite 7.3.7 · Tailwind 4.1.17 · `vite-plugin-singlefile` → one `dist/index.html` (864.77 kB, 365.75 kB gzip) |
| **Report date** | 2026-11-15 |
| **Inputs** | 4 uploaded zips, each a small website + an audit report (`.md`/`.txt`/`.json`) produced by a different AI run from the same prompt: ~500 raw findings in total |
| **This document** | One deduplicated, severity-normalised, evidence-checked report: **131 findings**, a **105-item improvement catalogue**, a rebuilt chord-identifier specification, a keyboard/visualizer strategy, and a roadmap |

> **How to use this file:** read §1 (10 minutes), then §4 (chord identifier) and §5 (keyboard/visualizer) because those were your two priorities, then use §3 as the bug-tracker and §6 as the backlog. §2 explains why you can trust the numbers — and where I corrected the audits.

---

## Contents

0. [How to read this report](#0-how-to-read-this-report)
1. [Executive summary](#1-executive-summary)
2. [Reconciliation of the four audits](#2-reconciliation-of-the-four-audits)
3. [Master bug and error register (131 findings)](#3-master-bug-and-error-register)
4. [Chord identifier — deep dive and rebuild plan](#4-chord-identifier--deep-dive-and-rebuild-plan)
5. [Keyboard and visualizer — deep dive and “best in class” plan](#5-keyboard-and-visualizer--deep-dive-and-best-in-class-plan)
6. [Master improvement catalogue (105 items)](#6-master-improvement-catalogue)
7. [Prioritised roadmap](#7-prioritised-roadmap)
8. [Appendices](#8-appendices)

---

## 0. How to read this report

**Naming the four audits.** The zips don’t have meaningful names, so I label them by upload order:

| Label | Zip | Report size | Browser used? |
|---|---|---|---|
| **A1** | `midi-piano-visualizer-audit.zip` | 36 KB, 32 bugs | Yes — headless Chromium 159 (Playwright 1.65) |
| **A2** | `midi-piano-visualizer-audit__1_.zip` | 180 KB, 168 findings | Yes — Chromium 140, DPR 1/2/3, axe-core |
| **A3** | `midi-piano-visualizer-audit__2_.zip` | 112 KB, 150 findings | **No** — sandbox couldn’t launch a browser; used a counting stub canvas |
| **A4** | `midi-piano-visualizer-audit__3_.zip` | 182 KB, 151 findings | Yes — Chromium 159, screenshots, a11y probes |

**Evidence tags** (every finding carries one):

| Tag | Meaning |
|---|---|
| ✅ **CONFIRMED** | *I* re-ran the real code from the repo snapshot, or read the exact lines that cause it, while writing this report. |
| 🔬 **AUDIT-VERIFIED** | At least one audit executed it and showed evidence (a script run, a browser measurement, a screenshot), but I did **not** re-run it. Browser-based results fall here because I did not re-run Chromium. |
| 🔍 **SUSPECTED** | Source reading only; plausible mechanism, not executed by anyone. |
| ❌ **REFUTED / OVERSTATED** | A claim from one audit that did not hold up. These are listed in §2.4, not in the register. |

**Severity scale** (normalised — the four audits used different scales):

| Level | Definition |
|---|---|
| 🔴 **Critical** | A wrong answer shown to a learner *as fact* on common input, destroying trust in the core feature. |
| 🟠 **High** | Serious bug, freeze, unreachable control, or a gap that defines the product (e.g. no input). |
| 🟡 **Medium** | Real defect with a workaround, or a correctness/UX problem on less common input. |
| ⚪ **Low** | Polish, robustness, hygiene. |
| ℹ️ **Info** | Positive finding worth protecting. |

**IDs.** Register entries are `AREA-NN` (e.g. `CH-03`); improvement items are `GROUP-NN` (e.g. `V-01`). Each register entry lists the original audit IDs it merges (“seen in A1 B-03 · A2 CH-01 …”) so you can trace back into the zips. §8.2 has the full traceability index.

**What I added on top of the four audits** (so you know what is new here):

1. Re-ran the real `chords.ts` from the repo snapshot on every disputed claim (≈60 probes).
2. Re-ran audit A3’s renderer op-counter harness against the real `renderer.ts`.
3. Re-ran audit A4’s learner-chord prototype side-by-side with the current engine.
4. Wrote and tested **three one-line chord fixes** and measured them on all six bundled pieces.
5. Read the exact source lines for ~15 findings that only one audit made.
6. Deduplicated, re-graded and cross-referenced everything, and recorded which claims were wrong.

**What I did not do:** I did not run a browser, so mobile layout, axe results, real frame times, screenshots and anything audio/MP4/Firefox/Safari are exactly as reliable as the audit that produced them (tagged 🔬 or 🔍).

---

## 1. Executive summary

### 1.1 Verdict

**Fahh MIDI is an unusually ambitious and visually accomplished piano visualizer that is not yet a trustworthy learning tool, and not yet an instrument.**

What is genuinely strong (each point verified by at least one audit, most by two or more): a beautiful, deterministic 88-key renderer whose geometry is exact; a single-source-of-truth settings schema with 203 validated, scriptable options; frame-exact MP4 export; a parser that survived 20,000 mutated files; zero dependency vulnerabilities; and a harmony engine that is *excellent* on clean block chords (triads and dominant sevenths 100 % in every position; Pachelbel, I–V–vi–IV, Andalusian and authentic-cadence progressions labelled exactly, including `I⁶₄` and `V⁶₅`) with correct global key detection on 5 of 5 known pieces.

What holds it back, in one sentence each:

* **Trust:** the chord identifier confidently teaches wrong chords and wrong Roman numerals on common input (§1.3, §4).
* **Product category:** it *looks* like a practice tool but cannot receive a single note — there is no MIDI input, no wait-for-note, no scoring (TP-06).
* **Robustness:** dense scenes drop to single-digit fps, phones can’t reach the Export button, the canvas is invisible to screen readers, and the repo has no tests or CI.

### 1.2 Scoreboard

| | Findings in register | Of which Critical/High | Confirmed by me | Seen by all 4 audits | Seen by ≥3 audits |
|---|---:|---:|---:|---:|---:|
| Master register | 131 | 23 | 28 | 25 | 84 |

| Severity | Count |
|---|---:|
| 🔴 Critical | 2 |
| 🟠 High | 21 |
| 🟡 Medium | 57 |
| ⚪ Low | 50 |
| ℹ️ Info | 1 |

Evidence: 28 ✅ confirmed by me · 92 🔬 audit-verified · 11 🔍 suspected.

### 1.3 The 15 most important problems

Ranked by (learner impact × how many audits independently found it × how reproducible it is).

| # | ID | Sev | Problem | Why it matters | Evidence |
|--:|---|---|---|---|---|
| 1 | CH-01 | 🔴 | Scales, clusters and random notes are named as chords. `C D E` → `Cadd9` (0.94 conf), `C D♭ D E♭` → `Cm(add9)`; 49 %/78 %/74 %/55 % of random 3/4/5/6-note sets get a name. | A learner who plays wrong notes is told, confidently, they played a real chord. This is exactly what you suspected. | ✅ |
| 2 | CH-02 | 🔴 | A +60 ms legato tolerance lets the *previous* chord leak into the next: clean `C F G C Dm G C` is shown as `C F/C G/F C Dm/C G/D C` (4 of 7 wrong). Found only by A3. | Notation-exported MIDI (end == next start) triggers it on every chord change. Fixed by **one line**. | ✅ |
| 3 | CH-03 | 🟠 | Applied dominants are detected in the wrong direction (`+7` instead of `+5`): D7→G shows `II⁷`; A7→Dm `VI⁷`; plain C7→G7 is falsely `V⁷/V`. | Teaches wrong theory. Fixed by **one character**. | ✅ |
| 4 | CH-05 | 🟠 | `Cmaj7/E` is shown as `Em`; `Am7/C` as `Am/C`; `C9/E` as `Eø7` — the seventh/root is silently dropped. | Inversion practice is exactly what beginners do. | ✅ |
| 5 | CH-04 | 🟠 | 13th and m11 chords can never be named at default sensitivity: `C13` → `C9`, `Cm11` → `Cm9` (all four audits agree). | A played extension is erased. Fixed by **one line**. | ✅ |
| 6 | CH-09 | 🟠 | Arpeggio/Alberti/detached textures get no label: first chord at **58.59 s** in Für Elise, **19.26 s** in Moonlight, **8.27 s** in K.545. | The most famous openings are blank — for a learner tool. | ✅ |
| 7 | KR-01 | 🟠 | Local-key follower flips to the dominant on short passages: `C → G7` becomes `IV → I⁷`. | Wrong function shown with full confidence. | ✅ |
| 8 | CH-08 | 🟠 | The sustain pedal never reaches the harmony engine (`sustainEnd` is computed and ignored). | Moonlight and all pedalled music: labels end at key release while the sound rings on. | ✅ |
| 9 | CH-16/17 | 🟠 | Confidence is an uncalibrated score shown as a %, and the second-best reading is computed then thrown away: no alternatives, no “why”, no correction. | Makes every other error unfixable *for the learner*. | 🔬 |
| 10 | TP-06 | 🟠 | “Practice mode” is auto-pause. There are zero `requestMIDIAccess` calls: no live input, no wait-for-note, no scoring. | The app looks like Synthesia but can’t be played along with. | ✅ |
| 11 | RV-01/02 | 🟠 | Frame cost explodes with note count: 367 gradients/frame on Bach, 19,597 at 5,000 notes; **77 % of the churn is the static keyboard** redrawn every frame. Live playback of a 5,000-note scene ≈ 5 fps (A2). | “Better than all visualizers” fails under load; 120 Hz is hopeless as built. | ✅ ops / 🔬 ms |
| 12 | UI-01 / RV-14 | 🟠 | At 320–390 px the Export button is clipped and unreachable, the stage is 217 px tall, and keys are ~6 px wide. | Phones are where beginners meet the app. | 🔬 (2 audits, screenshots) |
| 13 | AU-01 | 🟠 | Play can start before the piano samples have loaded → the first notes are silent with no explanation. | “It has no sound” is the #1 first-run failure. | ✅ |
| 14 | AX-01 | 🟠 | The canvas has no accessible name; chord/key/measure are never announced. | Whole product is invisible to screen readers. | 🔬 |
| 15 | CQ-01 | 🟠 | No tests, no linter, no CI; `npm run build` doesn’t type-check; README promises a workflow that doesn’t exist. | The 979-line chord engine has zero regression tests — every item above would have been caught. | ✅ |

> **Also found by only one audit but worth a day each:** `Shift+←/→` “previous/next note” gets stuck on real MIDI files (TP-01, found by A4, mechanism confirmed in source); holding Space flickers play/pause (TP-02); typing `2560` into the export Width field produces `7680` (EX-04); a dangling note-on is held to the end of the song (MP-01, `Math.max` should be `Math.min`).

### 1.4 Answers to your two specific questions

**Q1 — “Is the chord identifier suspicious? Does it detect random notes as chords?”**
**Yes, and now you have the exact mechanism.** Four independent fuzz runs measured 47–50 % of random note sets being given a chord name (I measured 49 % / 78 % / 74 % / 55 % for 3/4/5/6 notes). The more precise problem is that 49–82 % of the *named* 4–6-note sets ignore at least one note that is actually sounding (A4). It is not one bug but four mechanisms: (1) a ghost-note tolerance that lets adjacent semitones ride along; (2) a legato tolerance that leaks the previous chord forward; (3) no concept of passing tones, pedal or melody; (4) no confidence/alternative/“show nothing” design. The good news: three one-line fixes remove most of the *wrong* labels without touching the good ones (§4.5), and a learner-first redesign has been prototyped and measured (§4.6–4.9).

**Q2 — “Make the keyboard and animations better than every piano MIDI visualizer.”**
The foundation is better than most: exact 88-key geometry, concert-grand finish, deterministic frames, 203 appearance controls. To pass Synthesia/Midiano/Neothesia you need to fix five things in this order: **(1) cache the static keyboard** (77 % of per-frame allocation), **(2) sprite-batch the notes and add a frame-budget governor**, **(3) make velocity, pedal and repeated notes actually visible** (today velocity changes the picture by at most 8 %), **(4) become an instrument** (MIDI input, wait mode, scoring, metronome, A–B loop), **(5) make phones usable** (auto-zoom to 2–4 octaves, responsive transport). §5 has the specifics.

### 1.5 The 15 highest-impact improvements

| # | Improvement | Effort | Closes | Catalogue |
|--:|---|---|---|---|
| 1 | **Ship the three chord one-liners + `MP-01` today** (legato tolerance, applied-dominant direction, tone cap, `Math.min` for dangling notes) | XS | CH-02, CH-03, CH-04, MP-01 | §4.5 |
| 2 | **Chord Engine v2**: explain-every-sounding-note rule, cluster gate (fixed for dense extended chords), power chords, confidence bands, alternatives, “why”, Beginner/Advanced, hysteresis | L | CH-01, 05, 06, 07, 10–19 | H-01…H-05 |
| 3 | **Golden chord corpus + Vitest + CI** (this report’s harnesses are ready to commit) | M | CQ-01, CQ-02 | Q-01, Q-03 |
| 4 | **Static-layer cache + note sprites + frame-budget governor** | M | RV-01…RV-07 | V-01, V-02, V-03 |
| 5 | **Web MIDI input + wait-for-note + scoring** | M | TP-06 | L-01, L-02, L-03 |
| 6 | **Mobile-first layout** (two-row header, bottom-sheet, 44 px targets, auto-zoom keyboard) | M | UI-01…UI-04, RV-14 | P-03, V-17 |
| 7 | **Audio gate + audio-clock transport + latency calibration** | M | AU-01, TP-03, TP-04, TP-05 | A-02, A-01, A-03 |
| 8 | **Audio in the exported MP4 + streaming export** | L | EX-01, EX-05 | A-09, E-01 |
| 9 | **Accessibility pass** (canvas label, live region, slider semantics, focus traps) | M | AX-01…AX-03, UI-06 | P-05 |
| 10 | **Practice toolkit**: metronome, drag-to-loop A–B, tempo ramp, per-hand audio mute | S–M | — | L-05…L-08 |
| 11 | **Chord timeline + chord-tone highlighting on the keyboard** | M | CH-17, CH-18 | H-06, H-07 |
| 12 | **Move parse + harmony into a Web Worker** | M | MP-11 | P-01 |
| 13 | **Make velocity, trails and pedal visible** | S | RV-08, RV-09 | V-08, V-09, V-12 |
| 14 | **Sheet-music follow view** | L | — | L-16 |
| 15 | **PWA + offline fallback piano + CDN pinning** | M | PF-01, AU-02 | P-02, A-04, A-05 |

### 1.6 If you only have one week: the 12 quick wins

| # | Change | Where | Effort | Status |
|--:|---|---|---|---|
| 1 | `active.filter(n => n.end > T0 + 0.001 …)` | `chords.ts:710` | 1 line | ✅ tested |
| 2 | `mod12(r.cand.root + 5)` | `chords.ts:871` | 1 char | ✅ tested |
| 3 | `cl.length >= 6 ? 7 : cl.length >= 3 ? 5 : 4` | `chords.ts:773` | 1 line | ✅ tested |
| 4 | `Math.min` instead of `Math.max` for dangling note-ons | `midi.ts:339` | 1 word | ✅ read |
| 5 | `if (e.repeat) return;` before `player.toggle()` | `App.tsx:342` | 1 line | ✅ read |
| 6 | Step by note index, not by rounded frame time | `player.ts:226` | ~10 lines | ✅ mechanism read |
| 7 | Keep a draft string in the export size fields; clamp on blur | `ExportModal.tsx:176-194` | ~15 lines | ✅ read |
| 8 | DPR cap `2` → `3` behind a pixel budget | `App.tsx:134` | 3 lines | ✅ read |
| 9 | Gate Play on sample readiness + show “Piano loading…” | `player.ts` / `audio.ts` | ~20 lines | ✅ read |
| 10 | `aria-label` on every icon button; `role="img"` + label on the canvas | `chrome.tsx`, `App.tsx` | ~20 lines | 🔬 |
| 11 | `AbortSignal.timeout(8000)` on URL fetches; mark ready on failure | `App.tsx:415-430` | ~10 lines | ✅ read |
| 12 | Fix README (workflow, “frame-exact”, “lossless”) or add the workflow | `README.md`, `.github/` | 30 min | ✅ read |

### 1.7 What is genuinely good — protect it

Each verified by at least one audit (most by two or more); the source of each is named where it is a single audit:

* **88-key geometry is exact**: 52 white keys span the width; black keys use acoustic offsets (C♯ −0.075, D♯ +0.075, F♯ −0.10, G♯ 0, A♯ +0.10 of a white key); falling-note x-centres use the same layout arrays so alignment is exact (A1, A2, A4 with real frames at several sizes and DPR 2).
* **`drawFrame()` is a pure function** of (song, time, settings, size) — the best architectural decision here; it is what makes frame-exact export and scripted rendering possible.
* **Settings schema is a single source of truth**: 203 fields drive defaults, validation, UI, import/export and theming; unknown keys and prototype-pollution attempts are rejected.
* **Block-chord harmony is excellent**: triads and dominant sevenths 100 % in all positions; Pachelbel, I–V–vi–IV, authentic cadence with inversions and Andalusian progressions exact; 5/5 correct global keys.
* **Parser robustness**: 20,000 mutated/truncated MIDI files produced no unexpected exception (A3); clear human-readable errors in the browser (A2).
* **Clean engineering baseline**: build passes, strict `tsc` passes, `npm audit` = 0 vulnerabilities in 170 dependencies, zero console/page errors in normal flows (A1, A2, A4).
* **Offline degrades gracefully**: no network → silent, nothing else breaks.
* **Scriptability**: `window.FahhMIDI` + the Python wrapper made all four audits possible; it is a real differentiator.

---

## 2. Reconciliation of the four audits

Four AI runs of the same prompt is a gift and a hazard. The gift: independent findings give a corroboration signal. The hazard: each run made some mistakes, and I found several in each. This section shows how I merged them and what I overruled.

### 2.1 The four audits at a glance

| | A1 | A2 | A3 | A4 |
|---|---|---|---|---|
| Raw findings | 32 bugs + 6 improvements | 168 + 30 improvements + 60 upgrades | 150 + 54 upgrades | 151 + 56 upgrades |
| Severity mix | 1 High · 9 Med · 22 Low | 3 Crit · 37 High · 57 Med · 71 Low | 4 Crit · 12 High · 62 Med · 72 Low | 8 High · 47 Med · 94 Low · 2 Info |
| Evidence mix | 31 verified · 1 suspected | 69 verified · 99 suspected | 123 verified · 27 suspected | 126 verified · 25 suspected |
| Source read fully (claimed) | 100 % | **75.2 %** (honest ledger) | 100 % | 85.9 % |
| Real browser | ✔ | ✔ (+ axe) | ✘ | ✔ |
| Chord test size | 307 assertions, 30 k fuzz | 499 cases + 25 k fuzz | 900 matrix + 50 k fuzz + 30 k structured | 1,206 atomic + 288×3 sweeps + 20 k×5 fuzz + all 4,095 pitch-class sets |
| Shipped a chord prototype | pseudocode | pseudocode | pseudocode | **working prototype + measurements** |
| Strongest at | verified chord/MIDI bugs, measured perf, honest “not done” list | breadth, mobile/a11y with axe + screenshots, honest ledger | mechanism-level engine analysis; the legato-leak bug; op-count benchmark | most VERIFIED findings; found the transport bugs and secondary-dominant direction bug; honesty log |
| Weak at | no mobile/a11y; blamed the wrong cause for the missing V⁷/V | 99 findings only suspected; didn’t run export | no browser; several claims refuted (§2.4) | partial reads of settings/types/css; competitor table not re-verified |

**Unique contributions** (found by only one audit, and worth the whole exercise):

* **A1:** dangling note-on held to song end; local-key flip on short excerpts; the integer-hash determinism point.
* **A2:** the *phone layout* findings with screenshots; playback starting before samples are ready; export ≠ screen; PWA/offline over-claim; axe-core results.
* **A3:** the **legato-leak phantom slash chords** (my most valuable single chord find); gradient-count op-benchmark; negative-latency and preset-clobbering findings.
* **A4:** the **secondary-dominant direction bug**; `stepNote` stuck; Space key-repeat; export number inputs; ffmpeg quoting; the learner-chord prototype with measured results.

### 2.2 Agreement — findings reported by all four audits

**25 register entries were found independently by all four audits** — the strongest corroboration there is. (A merged entry counts an audit if it contributed *any* of the findings merged into it, so for broad entries such as AU-08 or EX-10 “4/4” means four audits touched the same area, not necessarily the same sub-issue.)

| ID | Severity | Finding |
|---|---|---|
| CH-01 | 🔴 Critical | Non-chords are named as chords: scales, clusters and random notes |
| CH-03 | 🟠 High | Applied (secondary) dominants are detected in the wrong direction; C7→G7 is falsely “V⁷/V” |
| CH-04 | 🟠 High | 13th and minor-11th chords can never be named at the default “Balanced” sensitivity |
| CH-05 | 🟠 High | First-inversion major-7th loses its seventh and becomes a minor triad (`Cmaj7/E` → `Em`) |
| CH-08 | 🟠 High | Sustain pedal is invisible to the harmony engine |
| CH-09 | 🟠 High | Arpeggio, Alberti and detached textures get no label — the most famous openings are blank |
| CH-10 | 🟡 Medium | Passing/melody tones create a second, false label (flicker: `C` → `Cadd9` → `C`, `C6`, `Am/C` repeated) |
| CH-22 | ⚪ Low | Magic numbers, tier priors and dead/redundant code in the chord library are undocumented |
| KR-01 | 🟠 High | Local-key follower flips to the dominant in short or dominant-heavy passages (G7 shown as I⁷; the preceding C as IV) |
| MP-03 | 🟡 Medium | Measure grid silently truncated at 5,000 measures; degenerate time-signature denominators create bogus grids |
| TP-03 | 🟡 Medium | Visual clock is an accumulated rAF delta (capped 0.1 s), not anchored to the audio clock; stalls drop time and desync sound |
| TP-07 | 🟡 Medium | Player is constructed in the render body and never disposed (two players + two audio engines in dev/StrictMode; HMR leak) |
| TP-10 | ⚪ Low | React UI is re-rendered at ~15 Hz during playback (clock/banner visibly step); the rAF loop runs forever even when paused or hidden |
| AU-08 | ⚪ Low | Custom soundfont loading: http:// and any origin accepted, no size cap, permissive regex parser, bulk base64 decode on main thread, `banks` Map grows unbounded, format-coupled parser |
| EX-02 | 🟡 Medium | Quality profiles are named “lossless / archival” but are lossy H.264 4:2:0 (bitrate capped at 240 Mbps); size estimate is a guess |
| EX-06 | 🟡 Medium | Export runs on the main thread, paced by a 2 ms `setTimeout` poll; background tabs throttle to a crawl; UI starves |
| EX-10 | ⚪ Low | Encoder errors surface late and the encoder may be closed twice; no export preflight summary; frame-count math (`Math.ceil`) can be off by one; manifest offset is unrounded while frames use the rounded offset; frame duration drifts for non-integer fps |
| RV-01 | 🟠 High | Frame cost scales steeply with visible notes (per-note gradients, clip, save/restore, spark arcs) |
| RV-03 | 🟡 Medium | Per-frame allocation churn (≈86–160 KB/frame idle, 150–360 KB with notes): `computeLayout` rebuilds `Float64Array(88)`×2 each frame, `incoming` list and Maps, per-measure gradients, `measureText`/`fitText` for banner and rail, one rounded-rect path per sustain tail, `Math.sin` hash called hundreds of times |
| RV-04 | 🟡 Medium | Post-processing copies the whole canvas every frame; scratch cache evicts wholesale at 2 entries (≈66 MB for two 4K surfaces); blur/shadow done full-resolution; Safari fallback `pixelGrade` does an O(W×H) JS readback and silently ignores hue and sepia |
| RV-05 | 🟡 Medium | Device-pixel ratio is capped at 2 (phones and many 4K displays are 3×) and DPR changes are only noticed on a resize event |
| RV-17 | ⚪ Low | Caches are small and crude: background cache of 3 entries thrashes during resize; FIFO not LRU eviction; colour cache clears wholesale at 600; texture patterns are module globals shared across canvases/DPRs; no byte accounting |
| UI-07 | ⚪ Low | State surprises: loading a new song silently resets mute/loop; dropping several files loads only the first; song/track state is mutated in place (`rev` counter workaround); drag overlay flickers on nested dragleave; loading stale analysis briefly |
| SC-01 | 🟡 Medium | URL-driven configuration and fetches have no timeout and arbitrary-URL reach (`?settingsUrl`, `?midiUrl`, custom soundfont URL); a stalled server blocks the ‘ready’ signal forever |
| SC-02 | ⚪ Low | No Content-Security-Policy or Subresource Integrity; the single-file inline build makes a strict CSP awkward |

### 2.3 How merging worked

1. Clustered ~500 raw findings by root cause, not by wording.
2. Normalised severity with one scale (§0).
3. Kept the *strongest* evidence tag any source had, then upgraded to ✅ when I re-ran it.
4. Listed every source ID in each entry (traceability, §8.2); 98.6 % (494 of 501) of source findings map to a register entry; the remainder are listed in §8.2 as intentionally not merged.

### 2.4 Disputes settled by re-running the real code

| # | Claim | Who said what | Ruling | How I checked |
|--:|---|---|---|---|
| 1 | Does the harmony engine use the sustain pedal? | **A3**: yes (“pedal-hold keeps the label alive ✅”). **A1, A2, A4**: no. | **A3 REFUTED.** `analyseHarmony` reads only `n.end`/`n.visEnd` (`visEnd ≤ end`); `sustainEnd` never reaches `ChordNote`. | Read `chords.ts:710,801` and `midi.ts:490-507`; grepped `sustainEnd`. |
| 2 | How many chord templates? | **A3**: 53. **A1/A2**: 48. | **48.** | Ran `CHORD_LIBRARY_SIZE`. |
| 3 | `G7/B` is mislabelled `B°` (A3 F-016, “High”) | A3 only | **REFUTED — harness error.** A3 used MIDI `47,50,53,58` (= B D F **B♭**); G is 55. With the real notes (47,50,53,55) the engine returns `G7/B`. | Ran both inputs. |
| 4 | `Cmaj7/E` → `Em` | A2, A3, A4 yes; A1 tested only *triad* inversions and said 36/36 | **CONFIRMED.** A1’s claim covered triads only. | Ran `identifyChord([52,55,59,60])` → `Em`. |
| 5 | Why does D7→G not become `V⁷/V`? | **A1**: key follower. **A4**: wrong direction (`+7` vs `+5`). | **A4 right** (primary cause, one-character fix proven). A1’s key-follower flip is real but a *separate* bug (KR-01). | Patched `+5`; D7→G → `V⁷/V`, A7→Dm → `V⁷/ii`. |
| 6 | “A rising scale is named a chord”: `Cadd9` (earlier chat run), `Cmaj9` (A2), but A4 says scale runs are correctly *silent* | A2 vs A4 | **All three are right** about different inputs. Notes *struck together or pooled* → named (`C D E` → `Cadd9`, 8-note pool → `Cmaj9`). Timed 8th-note scales → silent. | Ran all three forms. |
| 7 | Twinkle returns 0 chords — bug? | A2/A3: yes. A1/A4: no (melody-only file). | **Detector is correct; the *empty state* is the defect** (nothing explains “no chords expected”). Optionally add clearly-labelled implied harmony. | Parsed the bundled file: 42 single notes, no harmony. |
| 8 | “Notes whose start is off-screen are skipped; long notes vanish” (A3 F-065) | A3 only | **REFUTED.** `firstVisibleIndex` uses a running max of note ends (`prefixMaxEnd`); the culling test is on screen geometry. (The *performance* inverse — one long note defeats the index — is MP-10 in the register, Low.) | Read `renderer.ts:618-646, 700-716`. |
| 9 | Banner lists tones that are not sounding (A3 F-006) | A3 only | **PARTLY.** The chord *chips* are filtered to played tones. But the *symbol* can imply an unplayed note (`D9sus4` for D-E-G-C implies A), and the chips can hide a played one (the 13th in `C13`→`C9`). Recorded as CH-06. | Printed `tones` vs `played`. |
| 10 | Negative audio latency “can’t shift sound earlier” (A3 F-034, High) | A3 | **OVERSTATED.** It works up to the 0.18 s look-ahead; beyond that the delay clamps to 0. Medium. | Read `player.ts:155-160`. |
| 11 | Player never disposed (A3: High) | A1 Low-Med, A3 High, A4 Medium | **Medium.** Dev/StrictMode only; the production build masks it. | Read `App.tsx:179-184`, `main.tsx`. |
| 12 | Dangling note-on severity | A1 High, A4 Medium, A2 Low | **Medium** — real (`Math.max` is wrong), rare input. | Read `midi.ts:339`. |
| 13 | “49 % false-positive rate” | A2 Critical-ish; A2 itself cautions it’s not a pure FP rate | **Use A4’s stricter metric**: 49 % (4 notes) → 82 % (6 notes) of *named* sets ignore ≥1 sounding pitch class. My fuzz agrees with the headline rate. | Fuzz 10–20 k trials/size. |
| 14 | Frame times differ by 100× across audits | A1: 67–456 ms; A2: 9–46 ms; A3: 1.6–38 ms; A4: 12–822 ms | **Different methods, same shape** — see §5.2. A1 includes PNG encode; A2 stubs `toDataURL`; A3 counts JS only with a stub context; A4 forces a software-raster flush. No audit had a GPU or a real 120 Hz display. | I reproduced A3’s op-counts exactly (367 / 19,597 gradients). |
| 15 | “100 % of source read” | A1, A3 claim 100 %; A2 says 75.2 %; A4 85.9 % | **Unverifiable** — I list each audit’s *claim*. The audits whose ledgers admit partial reads (A2, A4) are the more trustworthy about coverage, not necessarily about findings. | — |

### 2.5 What nobody verified (including me)

* **Firefox, Safari, iOS Safari, Android** — all four audits ran only headless Chromium (A3 ran none).
* **Real GPU and real 120 Hz** — all raster timings are software (SwiftShader); treat ms as pessimistic and ratios as reliable.
* **Audio**: no audio device in any sandbox; A/V sync, latency, voice stealing and the first-note silence are from code reading plus A2’s load test.
* **A full MP4 end-to-end** with A/V validation (A2 confirmed WebCodecs exists; A1 exported a 320×240 Twinkle clip).
* **Web MIDI hardware** (the app has none), **screen readers** (axe only), **contrast numerics**.
* **Competitor features** — all four competitor tables are desk research from memory, not hands-on testing. Treat the competitor columns in §5.6 as directional.
* **The live GitHub repo** — I couldn’t fetch it; findings are for snapshot `f7a1aaa`.

---

## 3. Master bug and error register

**131 findings**, deduplicated from ~500 raw audit findings. Each entry shows severity, evidence tag, how many of the four audits found it, where it lives, what is wrong, and a concrete fix. **“Seen in”** lists the original IDs (A1 `B-xx`; A2/A4 use area codes such as `CH-05`; A3 uses `F-xxx`) so you can look up the full original text in the zips.

### 3.0 Distribution

| Area | Critical | High | Medium | Low | Info | Total |
|---|--:|--:|--:|--:|--:|--:|
| Chord identifier (`CH`) | 2 | 9 | 10 | 3 |  | 24 |
| Key detection and Roman numerals (`KR`) |  | 2 | 3 | 3 |  | 8 |
| MIDI parsing and analysis (`MP`) |  | 1 | 7 | 4 |  | 12 |
| Transport and player (`TP`) |  | 2 | 5 | 5 |  | 12 |
| Audio (`AU`) |  | 1 | 4 | 5 |  | 10 |
| Export (`EX`) |  |  | 7 | 4 |  | 11 |
| Renderer and visualizer (`RV`) |  | 2 | 11 | 8 |  | 21 |
| UI, layout and responsiveness (`UI`) |  | 1 | 3 | 7 |  | 11 |
| Accessibility (`AX`) |  | 2 | 2 |  |  | 4 |
| Security and privacy (`SC`) |  |  | 1 | 2 | 1 | 4 |
| Platform, PWA, SEO and branding (`PF`) |  |  | 2 | 3 |  | 5 |
| Code quality and process (`CQ`) |  | 1 | 2 | 3 |  | 6 |
| Settings (`ST`) |  |  |  | 3 |  | 3 |
| **Total** | **2** | **21** | **57** | **50** | **1** | **131** |

### 3.1 Index of all findings

| ID | Severity | Evidence | Audits | Finding |
|---|---|---|:-:|---|
| CH-01 | 🔴 Critical | ✅ Confirmed | 4/4 | Non-chords are named as chords: scales, clusters and random notes |
| CH-02 | 🔴 Critical | ✅ Confirmed | 1/4 | Previous chord leaks into the next through a +60 ms legato tolerance → phantom slash chords |
| CH-03 | 🟠 High | ✅ Confirmed | 4/4 | Applied (secondary) dominants are detected in the wrong direction; C7→G7 is falsely “V⁷/V” |
| CH-04 | 🟠 High | ✅ Confirmed | 4/4 | 13th and minor-11th chords can never be named at the default “Balanced” sensitivity |
| CH-05 | 🟠 High | ✅ Confirmed | 4/4 | First-inversion major-7th loses its seventh and becomes a minor triad (`Cmaj7/E` → `Em`) |
| CH-06 | 🟠 High | ✅ Confirmed | 3/4 | Suspended-chord inversions and add-chords are mis-read as 7sus4/9sus4, advertising a note that is not sounding |
| CH-07 | 🟠 High | 🔬 Audit-verified | 3/4 | Symmetric/enharmonic re-spelling replaces the chord a learner played (`Cm7/E♭` → `E♭6`, `C°7/E♭` → `E♯°7`, `C+/E` → `E+`) |
| CH-08 | 🟠 High | ✅ Confirmed | 4/4 | Sustain pedal is invisible to the harmony engine |
| CH-09 | 🟠 High | ✅ Confirmed | 4/4 | Arpeggio, Alberti and detached textures get no label — the most famous openings are blank |
| CH-10 | 🟡 Medium | 🔬 Audit-verified | 4/4 | Passing/melody tones create a second, false label (flicker: `C` → `Cadd9` → `C`, `C6`, `Am/C` repeated) |
| CH-11 | 🟡 Medium | 🔬 Audit-verified | 3/4 | Rolled chords are labelled late (at completion), human rolls >55 ms spacing become “arpeggios”; thresholds are fixed seconds, not tempo-relative |
| CH-12 | 🟡 Medium | 🔬 Audit-verified | 3/4 | Rate limiter drops genuine fast harmonic changes (< 0.3 s) |
| CH-13 | 🟡 Medium | 🔬 Audit-verified | 2/4 | Short (staccato, <100 ms) chords are never named |
| CH-14 | 🟡 Medium | ✅ Confirmed | 3/4 | Power chords and dyads are never named |
| CH-15 | 🟡 Medium | 🔬 Audit-verified | 2/4 | Rootless jazz voicings cannot be recognised |
| CH-16 | 🟠 High | 🔬 Audit-verified | 2/4 | Confidence is an uncalibrated score shown as a percentage; “show nothing” is a score threshold, not a musical rule |
| CH-17 | 🟠 High | 🔬 Audit-verified | 2/4 | Second-best interpretation is computed, then discarded; no explanation, no alternatives, no manual correction |
| CH-18 | 🟡 Medium | 🔬 Audit-verified | 3/4 | Label timing is inconsistent: banner can show the *previous* chord at the key press and blank for ~0.5 s between two real chords |
| CH-19 | 🟡 Medium | 🔬 Audit-verified | 1/4 | Repeated identical chords are merged across bars (12-bar blues returns 7 labels for 12 bars) |
| CH-20 | ⚪ Low | ✅ Confirmed | 2/4 | `identifyChord(notes, {key})` ignores the `key` option; it also fabricates hands and timing |
| CH-21 | 🟡 Medium | 🔬 Audit-verified | 3/4 | Enharmonic spelling is driven by a key estimated from the same few notes (`F♯sus2` → `G♭sus2`); C♯ major shown as D♭ major, E♭ minor as D♯ minor |
| CH-22 | ⚪ Low | 🔬 Audit-verified | 4/4 | Magic numbers, tier priors and dead/redundant code in the chord library are undocumented |
| CH-23 | ⚪ Low | 🔬 Audit-verified | 2/4 | Harmony summary/chart/list silently truncate (12 distinct, 32 progression, 600 rows, `chordAtTime` looks back 4 chords) |
| CH-24 | 🟡 Medium | 🔬 Audit-verified | 2/4 | Chromatic passing sonorities in the Bach prelude are named as functional chords (`F°7`, `G°7`, `F♯°7`, `Gm6`, `Dm7/C`) |
| KR-01 | 🟠 High | ✅ Confirmed | 4/4 | Local-key follower flips to the dominant in short or dominant-heavy passages (G7 shown as I⁷; the preceding C as IV) |
| KR-02 | 🟠 High | 🔬 Audit-verified | 3/4 | A major tonic in a minor key is shown as a plain `I` (A7 in A minor → `I⁷`) |
| KR-03 | 🟡 Medium | 🔬 Audit-verified | 3/4 | Secondary dominants are limited to maj/7/9/13 within 3.5 s; `vii°7/X` is never labelled |
| KR-04 | 🟡 Medium | 🔬 Audit-verified | 2/4 | No borrowed-chord/modal-mixture labelling; chromatic chords get numerals that clash with the spelled root |
| KR-05 | 🟡 Medium | 🔬 Audit-verified | 1/4 | Modulation list contains unconfirmed tonicisations (a secondary dominant reported as a key change) |
| KR-06 | ⚪ Low | 🔬 Audit-verified | 2/4 | File key signature is only a +0.035 correlation nudge; later key-signature events ignored; ‘from key signature’ source is dead code; file key overwritten |
| KR-07 | ⚪ Low | 🔍 Suspected | 1/4 | Key confidence is a heuristic displayed as “% sure” |
| KR-08 | ⚪ Low | 🔬 Audit-verified | 3/4 | Figured bass only for triads/sevenths; sixth/extended-chord numerals inconsistent; scale-degree labels use the global key |
| MP-01 | 🟡 Medium | ✅ Confirmed | 3/4 | Unterminated note-on is held to the end of the song instead of ~one beat |
| MP-02 | 🟡 Medium | 🔬 Audit-verified | 2/4 | Tempo of 0 µs/beat is accepted (divide-by-zero → Infinity times) |
| MP-03 | 🟡 Medium | 🔬 Audit-verified | 4/4 | Measure grid silently truncated at 5,000 measures; degenerate time-signature denominators create bogus grids |
| MP-04 | ⚪ Low | 🔬 Audit-verified | 3/4 | SMPTE-division files assume ppq=480 and ignore tempo; format-2 files treated as simultaneous format-1 |
| MP-05 | 🟡 Medium | 🔬 Audit-verified | 3/4 | Pedal handling is partial: only CC64, binary at ≥64, only the first pedal period per note, events from any channel affect all notes, `sustainEnd` capped at +6 s |
| MP-06 | 🟡 Medium | 🔬 Audit-verified | 2/4 | Silent data loss on import: drums (ch10), notes outside A0–C8, program changes; malformed tracks silently lose notes |
| MP-07 | 🟡 Medium | 🔍 Suspected | 2/4 | Hand assignment guesses from track names and average pitch |
| MP-08 | ⚪ Low | 🔬 Audit-verified | 3/4 | Fingering is heuristic and unvalidated: no hand size/reach model, 40 ms grouping, 6+ note chords duplicate fingers, non-idiomatic 4/5 and black-key penalties |
| MP-09 | ⚪ Low | 🔬 Audit-verified | 3/4 | Other parser edge cases: only first tempo at tick 0 used, running status not cancelled by meta/sysex, 5-byte VLQ accepted, Latin-1 text, FIFO pairing of repeated notes, loop-counter `t--` trick |
| MP-10 | 🟡 Medium | 🔬 Audit-verified | 1/4 | Song duration ignores sustain/release tail; one very long note defeats the visible-window index; double analysis on load |
| MP-11 | 🟠 High | 🔬 Audit-verified | 3/4 | MIDI parsing and full harmony analysis run synchronously on the UI thread, re-running on every analysis-setting change; no size limit or progress |
| MP-12 | ⚪ Low | 🔬 Audit-verified | 2/4 | `formatTime` clamps 1000 ms to 999; `measureAt`/`buildManifest` index `[0]` without empty guards |
| TP-01 | 🟠 High | ✅ Confirmed | 1/4 | `Shift+←/→` (previous/next note) gets stuck on any note not on the video-frame grid |
| TP-02 | 🟡 Medium | ✅ Confirmed | 2/4 | Holding Space toggles play/pause on every key-repeat (flicker); Space also blurs the focused button |
| TP-03 | 🟡 Medium | 🔬 Audit-verified | 4/4 | Visual clock is an accumulated rAF delta (capped 0.1 s), not anchored to the audio clock; stalls drop time and desync sound |
| TP-04 | 🟡 Medium | 🔬 Audit-verified | 3/4 | No automatic output-latency compensation; manual audio offset only (negative offsets usable only inside the 0.18 s look-ahead) |
| TP-05 | 🟡 Medium | 🔬 Audit-verified | 3/4 | Changing speed does not reschedule audio already committed to the WebAudio clock |
| TP-06 | 🟠 High | 🔬 Audit-verified | 3/4 | “Practice mode” is auto-pause, not interactive practice: no wait-for-note, no scoring, no input |
| TP-07 | 🟡 Medium | ✅ Confirmed | 4/4 | Player is constructed in the render body and never disposed (two players + two audio engines in dev/StrictMode; HMR leak) |
| TP-08 | ⚪ Low | 🔬 Audit-verified | 3/4 | Loop wrap uses soft `stopAll` (pedal tails bleed), cuts held notes, doesn’t reset the practice skip pointer; loop bounds aren’t validated against the song (end < start allowed from imports) |
| TP-09 | ⚪ Low | 🔬 Audit-verified | 2/4 | Seeking inside a held note silences it; scrubbing hard-stops all voices on every pointermove; frame stepping causes release/attack clicks |
| TP-10 | ⚪ Low | 🔬 Audit-verified | 4/4 | React UI is re-rendered at ~15 Hz during playback (clock/banner visibly step); the rAF loop runs forever even when paused or hidden |
| TP-11 | ⚪ Low | 🔬 Audit-verified | 3/4 | Minor transport inconsistencies: negative schedule delays clamp to 0 (flams after stalls); three different speed clamps; audition hold divided by speed inconsistently; step helpers disagree on what a ‘note’ is; shared DEFAULT objects aliased by Player |
| TP-12 | ⚪ Low | 🔬 Audit-verified | 2/4 | Canvas size clamp (min 320×200) distorts small containers; `dispose()` doesn’t detach the canvas or mark disposed |
| AU-01 | 🟠 High | ✅ Confirmed | 3/4 | Playback starts before the piano soundfont is ready: the first notes are silent with no ‘waiting for piano’ state |
| AU-02 | 🟡 Medium | 🔬 Audit-verified | 3/4 | Samples come from unpinned third-party CDNs with no SRI/health indicator; first play makes third-party requests (privacy); one failed sample leaves the bank incomplete and is re-downloaded forever |
| AU-03 | 🟡 Medium | 🔍 Suspected | 1/4 | Audio transpose is invisible to the visualizer and the harmony engine |
| AU-04 | 🟡 Medium | 🔍 Suspected | 2/4 | Transposition far outside the sampled range gives extreme playback rates; single-velocity-layer samples are pitched up to ±1.5 semitones |
| AU-05 | 🟡 Medium | 🔬 Audit-verified | 3/4 | Voice cap steals the earliest-scheduled (not longest-sounding) voice audibly; O(n) eviction and linear sample search per note |
| AU-06 | ⚪ Low | 🔬 Audit-verified | 2/4 | No damper/pedal model, no half-pedal; long notes aren’t looped beyond the sample length |
| AU-07 | ⚪ Low | 🔬 Audit-verified | 2/4 | Reverb impulse response is regenerated and swapped on the main thread whenever the slider moves |
| AU-08 | ⚪ Low | 🔬 Audit-verified | 4/4 | Custom soundfont loading: http:// and any origin accepted, no size cap, permissive regex parser, bulk base64 decode on main thread, `banks` Map grows unbounded, format-coupled parser |
| AU-09 | ⚪ Low | 🔍 Suspected | 2/4 | iOS Safari: mute-switch/interruption handling absent; autoplay unlock depends on the first UI action and fails silently |
| AU-10 | ⚪ Low | 🔬 Audit-verified | 3/4 | Housekeeping: `whenReady` busy-polls every 80 ms; `dispose()` leaves the `online` listener; `onended` disconnects gain but not `src`; no disposed guard for racing `playNote`; 0.62 headroom constant undocumented |
| EX-01 | 🟡 Medium | 🔬 Audit-verified | 2/4 | Exported MP4 has no audio track |
| EX-02 | 🟡 Medium | ✅ Confirmed | 4/4 | Quality profiles are named “lossless / archival” but are lossy H.264 4:2:0 (bitrate capped at 240 Mbps); size estimate is a guess |
| EX-03 | 🟡 Medium | 🔬 Audit-verified | 2/4 | “Identical pixels to the screen” claim is false: export layout differs from live for non-matching aspect ratios, and hit tolerance differs (4 ms live vs half a video frame at export) |
| EX-04 | 🟡 Medium | ✅ Confirmed | 3/4 | Export number fields clamp on every keystroke: typing `2560` into Width yields `7680`; odd widths are silently masked; Stepper snaps to its minimum while typing |
| EX-05 | 🟡 Medium | 🔬 Audit-verified | 3/4 | Whole MP4 accumulates in memory unless File System Access is available; long or 4K renders can exhaust RAM |
| EX-06 | 🟡 Medium | 🔬 Audit-verified | 4/4 | Export runs on the main thread, paced by a 2 ms `setTimeout` poll; background tabs throttle to a crawl; UI starves |
| EX-07 | ⚪ Low | 🔬 Audit-verified | 1/4 | Suggested ffmpeg command is unquoted and breaks on file names with spaces |
| EX-08 | 🟡 Medium | 🔬 Audit-verified | 3/4 | Export dialog is not truly modal: no focus trap/initial focus/restoration; app stays interactive; hand reassignment or settings can change mid-render; the dialog edits persistent global settings |
| EX-09 | ⚪ Low | 🔬 Audit-verified | 3/4 | WebCodecs/H.264 support is narrower than the README implies; up to 14 `isConfigSupported` probes before every export; `mp4-muxer` is deprecated upstream (superseded by Mediabunny); no fallback renderer |
| EX-10 | ⚪ Low | 🔬 Audit-verified | 4/4 | Encoder errors surface late and the encoder may be closed twice; no export preflight summary; frame-count math (`Math.ceil`) can be off by one; manifest offset is unrounded while frames use the rounded offset; frame duration drifts for non-integer fps |
| EX-11 | ⚪ Low | 🔬 Audit-verified | 3/4 | Export UX nits: two programmatic downloads in a row, clipboard ‘copied’ shown even if `writeText` fails, ‘saved’ shown when bytes is 0 for streamed files; `renderFrame` blocks the main thread and returns huge data URLs; `renderFrame` (1×) and `getFramePixelsRGBA` (live DPR) disagree |
| RV-01 | 🟠 High | ✅ Confirmed | 4/4 | Frame cost scales steeply with visible notes (per-note gradients, clip, save/restore, spark arcs) |
| RV-02 | 🟠 High | ✅ Confirmed | 3/4 | The static keyboard is redrawn from scratch every frame — about 282 gradient allocations per frame with only 10 notes visible |
| RV-03 | 🟡 Medium | 🔬 Audit-verified | 4/4 | Per-frame allocation churn (≈86–160 KB/frame idle, 150–360 KB with notes): `computeLayout` rebuilds `Float64Array(88)`×2 each frame, `incoming` list and Maps, per-measure gradients, `measureText`/`fitText` for banner and rail, one rounded-rect path per sustain tail, `Math.sin` hash called hundreds of times |
| RV-04 | 🟡 Medium | 🔬 Audit-verified | 4/4 | Post-processing copies the whole canvas every frame; scratch cache evicts wholesale at 2 entries (≈66 MB for two 4K surfaces); blur/shadow done full-resolution; Safari fallback `pixelGrade` does an O(W×H) JS readback and silently ignores hue and sepia |
| RV-05 | 🟡 Medium | ✅ Confirmed | 4/4 | Device-pixel ratio is capped at 2 (phones and many 4K displays are 3×) and DPR changes are only noticed on a resize event |
| RV-06 | 🟡 Medium | 🔬 Audit-verified | 3/4 | No frame-budget governor, quality presets or FPS/dropped-frame HUD; users can’t diagnose slowdowns |
| RV-07 | 🟡 Medium | 🔬 Audit-verified | 3/4 | Sparks, dust and bloom are per-note/per-mote work: 7 spark arcs + `Math.sin` per active note, 42–54 radial gradients per frame for ambient dust (2–4 ms), `shadowBlur` on active notes |
| RV-08 | 🟡 Medium | ✅ Confirmed | 3/4 | Velocity barely changes the picture: maximum darkening is 8 % (velocityDim 0.16 × 0.5 at velocity 0) and none in monochrome; very short notes are inflated by `minHeight` |
| RV-09 | 🟡 Medium | 🔬 Audit-verified | 3/4 | No note trails/ghosting and no per-track colours (hand, finger, pitch-class, colour-blind, mono palettes only) |
| RV-10 | ⚪ Low | 🔬 Audit-verified | 1/4 | Fall speed is a fixed number of seconds, not tempo- or beat-relative |
| RV-11 | 🟡 Medium | 🔬 Audit-verified | 2/4 | Overlapping same-pitch notes flicker the key colour and restart the press ramp |
| RV-12 | ⚪ Low | ✅ Confirmed | 3/4 | Black-key defaults are slightly off a real piano and some geometry controls misbehave |
| RV-13 | 🟡 Medium | 🔬 Audit-verified | 3/4 | Chord banner collides with the HUD on narrow canvases; no max width/wrapping/safe-area; chord-bracket labels drawn under falling notes; HUD overlaps notes |
| RV-14 | 🟡 Medium | 🔬 Audit-verified | 2/4 | Phone-width rendering is unusable: 88 keys are ~6 px wide at 320 px, labels collapse, the stage is only 217 px tall at 320×568, and chrome takes 36 % of a 390×844 screen |
| RV-15 | ⚪ Low | 🔍 Suspected | 2/4 | Note labels collide and are drawn for every full-height note; label font clamped 8–14 px is illegible at 88 keys on a laptop |
| RV-16 | ⚪ Low | 🔬 Audit-verified | 3/4 | Minimap is display-only and redraws all 88 keys every frame |
| RV-17 | ⚪ Low | 🔬 Audit-verified | 4/4 | Caches are small and crude: background cache of 3 entries thrashes during resize; FIFO not LRU eviction; colour cache clears wholesale at 600; texture patterns are module globals shared across canvases/DPRs; no byte accounting |
| RV-18 | ⚪ Low | ✅ Confirmed | 3/4 | “Frame-exact across browsers” rests on `Math.sin`-based hashing; engine output could diverge by 1 ULP between engines |
| RV-19 | ⚪ Low | 🔍 Suspected | 2/4 | Firefox/older-Safari fallbacks missing: canvas `letterSpacing`, `color-mix()` backgrounds, `ctx.filter` |
| RV-20 | 🟡 Medium | ✅ Confirmed | 3/4 | Canvas ignores `prefers-reduced-motion` and has no photosensitivity guard: flashes, sparks and bloom always run |
| RV-21 | ⚪ Low | 🔬 Audit-verified | 3/4 | Sustain tails depend on the ‘pedal indicator’ toggle; pedal events are not drawn as events; `chordAt` is computed every frame even when the banner is off; `toRgb` turns invalid hex into black; `autoZoomRange` loops are order-dependent |
| UI-01 | 🟠 High | 🔬 Audit-verified | 2/4 | Header actions are clipped at 320 px — Export is unreachable — and the transport row loses the speed selector and forward-note button; content is hidden, not scrollable |
| UI-02 | 🟡 Medium | 🔬 Audit-verified | 3/4 | Hand filter and label selectors vanish below 1280 px; button text appears only ≥1750 px; icon-only buttons rely on `title` tooltips (useless on touch) |
| UI-03 | 🟡 Medium | 🔬 Audit-verified | 1/4 | Touch targets are 34 px (below the 44 px recommendation) |
| UI-04 | ⚪ Low | 🔍 Suspected | 3/4 | No safe-area/orientation handling; `height:100%` + `overflow:hidden` breaks under iOS address-bar resize |
| UI-05 | ⚪ Low | 🔬 Audit-verified | 2/4 | Settings → Advanced is dense (203 settings, 9.5–12 px text) with no mobile simplification; panel re-renders heavily |
| UI-06 | 🟡 Medium | 🔬 Audit-verified | 3/4 | Drawers and dialogs are not modal: no scrim, no focus trap, focus isn’t restored; Escape handling is split between App and modal |
| UI-07 | ⚪ Low | 🔬 Audit-verified | 4/4 | State surprises: loading a new song silently resets mute/loop; dropping several files loads only the first; song/track state is mutated in place (`rev` counter workaround); drag overlay flickers on nested dragleave; loading stale analysis briefly |
| UI-08 | ⚪ Low | 🔬 Audit-verified | 3/4 | Empty/loading/error states are thin: harmony panel is blank for Twinkle with no explanation; no loading/cancel while parsing; toasts auto-dismiss with no history; notice bursts replace each other; raw browser error text for failed URL loads |
| UI-09 | ⚪ Low | 🔬 Audit-verified | 2/4 | Form-control details: Stepper snaps to min while typing; `window.confirm` for Reset all; `setState` inside a ref callback (SyncPanel); ToggleRow is a clickable div wrapping a switch (nested interactives); sliders announce raw decimals without units; `intList` silently drops invalid tokens |
| UI-10 | ⚪ Low | 🔬 Audit-verified | 2/4 | Keyboard shortcuts are undocumented in the UI; no `?` overlay, no remapping; a bad `?song=` silently loads Bach; repertoire panel has no search/filter |
| UI-11 | ⚪ Low | 🔬 Audit-verified | 3/4 | Timeline drag: pointer listeners not cleaned up on unmount/pointercancel; `setPointerCapture` on `e.target`; slider has no Home/End |
| AX-01 | 🟠 High | 🔬 Audit-verified | 3/4 | The canvas has no accessible name/role/text alternative; chord, key, measure and time are never announced (no live region) |
| AX-02 | 🟠 High | 🔬 Audit-verified | 2/4 | Frame-step buttons and icon-only navigation have no accessible name |
| AX-03 | 🟡 Medium | 🔬 Audit-verified | 3/4 | Timeline slider lacks `aria-valuetext`, Home/End and a clear keyboard contract; segmented groups have no accessible name; no `<h1>`/skip link |
| AX-04 | 🟡 Medium | 🔍 Suspected | 2/4 | Colour support is partial: colour-blind palette present but not contrast-checked; custom UI colours have no contrast guard; secondary text likely below WCAG AA |
| SC-01 | 🟡 Medium | ✅ Confirmed | 4/4 | URL-driven configuration and fetches have no timeout and arbitrary-URL reach (`?settingsUrl`, `?midiUrl`, custom soundfont URL); a stalled server blocks the ‘ready’ signal forever |
| SC-02 | ⚪ Low | 🔬 Audit-verified | 4/4 | No Content-Security-Policy or Subresource Integrity; the single-file inline build makes a strict CSP awkward |
| SC-03 | ⚪ Low | 🔬 Audit-verified | 3/4 | No file-size/entry limits on imported MIDI/settings; settings accept HTML-like brand text (rendered as canvas text, no XSS found); global control API and legacy aliases always exposed; `navigator.webdriver` silently switches to automation mode |
| SC-04 | ℹ️ Info | 🔬 Audit-verified | 3/4 | Positive: `npm audit` reports 0 vulnerabilities (170 deps); settings import is schema-gated and blocks prototype pollution (`__proto__`, `constructor.prototype` tested); parser survived 20,000 mutated/truncated files |
| PF-01 | 🟡 Medium | 🔬 Audit-verified | 3/4 | Not installable and not truly offline: no manifest or service worker; the app loads but audio needs a CDN, so offline = silent |
| PF-02 | 🟡 Medium | 🔬 Audit-verified | 3/4 | One 865 KB (366 KB gzip) HTML file, of which ~570 KB is base64 MIDI; no skeleton/first-paint state |
| PF-03 | ⚪ Low | 🔬 Audit-verified | 3/4 | SEO/social metadata incomplete: no og:image/twitter:image/canonical/manifest/structured data/robots/sitemap |
| PF-04 | ⚪ Low | 🔬 Audit-verified | 2/4 | Package/branding hygiene: package name `react-vite-tailwind` and version `0.0.0` are template boilerplate; three identities (package, app, `APP_VERSION`); `@font-face` sources point into `node_modules` |
| PF-05 | ⚪ Low | 🔍 Suspected | 2/4 | No localisation (English-only strings inline); chord-name conventions are US-only |
| CQ-01 | 🟠 High | ✅ Confirmed | 3/4 | No tests, no linter, no CI, no `.gitignore`; `npm run build` does not type-check |
| CQ-02 | 🟡 Medium | ✅ Confirmed | 2/4 | README makes claims the repo doesn’t back: a `.github/workflows/deploy.yml` that doesn’t exist, ‘frame-exact across browsers’, ‘lossless’, ‘identical pixels’, ‘names a chord only when really played’ |
| CQ-03 | 🟡 Medium | 🔍 Suspected | 2/4 | No LICENSE for the application code; attribution of bundled MIDI (piano-midi.de) and CDN piano samples is not surfaced |
| CQ-04 | ⚪ Low | 🔬 Audit-verified | 3/4 | Large single-file modules with intertwined concerns, duplicated colour utilities, scattered undocumented thresholds, dead/misleading code (`void rev`, eslint-disable for a non-existent linter, legacy `clavier-*`/`MidianoAncientAPI` aliases) |
| CQ-05 | ⚪ Low | 🔬 Audit-verified | 3/4 | Shared mutable state: `Song` mutated in place, `DEFAULT_SETTINGS`/`DEFAULT_SYNC` are shared singletons, whole-document JSON clone per settings patch |
| CQ-06 | ⚪ Low | 🔬 Audit-verified | 3/4 | Deprecated `escape()/unescape()` used to decode `?settings=`; Python wrapper docs/behaviour mismatch; legacy aliases kept forever |
| ST-01 | ⚪ Low | 🔬 Audit-verified | 2/4 | Applying a theme preset resets every key any preset touches, clobbering manual edits |
| ST-02 | ⚪ Low | 🔬 Audit-verified | 3/4 | Import/coercion quirks: out-of-range values clamped silently, integer rounding only for integer steps (odd widths survive), `normalizeColor` drops alpha, array-index paths give confusing rejections, short-form paths incomplete |
| ST-03 | ⚪ Low | 🔬 Audit-verified | 3/4 | Persistence: no schema migration beyond v1; corrupted localStorage silently resets all preferences; speed and video config persist and surprise on next load |

### 3.2 Details by area

#### Chord identifier (`CH`)

##### CH-01 — 🔴 Critical · ✅ Confirmed · 4/4 audits

**Non-chords are named as chords: scales, clusters and random notes**

* **Where:** src/engine/chords.ts:424-483 (matchChord ghost/extra tolerance), 451, 766-774
* **Seen in:** A1 B-03 · A2 CH-01, CH-27 · A3 F-008 · A4 CH-06, CH-07
* **Problem:** `C D E` → `Cadd9` (conf 0.94); `C D E F G` → `Cadd9`; `C D♭ D E♭` → `Cm(add9)`; an 8-note rising scale pooled together → `Cmaj9`. Random-note fuzz (my run, 10–20 k trials per size): 3 notes named 49 %, 4 notes 78 %, 5 notes 74 %, 6 notes 55 %. The four audits measured 47–50 % overall. The ghost-note tolerance lets adjacent semitones ride along as “colour”, and a scale fragment is accepted as an add9. The Harmony panel promises chords “only when really played”; this breaks that promise on the most common beginner input.
* **Fix:** Hard rule: every sounding pitch class must be explained by the template or be an explicitly-flagged melody note. Add a cluster gate (for ≥3 pitch classes require ≥2 cyclic gaps of ≥3 semitones). Penalise any extra pc within 1 semitone of a covered pc. See §4.7 for the v2 spec (the prototype cuts 5-note naming from 74 % → 20 % with 0 % ignored-note readings).

##### CH-02 — 🔴 Critical · ✅ Confirmed · 1/4 audits

**Previous chord leaks into the next through a +60 ms legato tolerance → phantom slash chords**

* **Where:** src/engine/chords.ts:710 (`active.filter(n => n.end + 0.06 > T0 …)`)
* **Seen in:** A3 F-009 (found only by A3)
* **Problem:** Any note-off that lands less than 60 ms *before* the next chord’s note-on is still counted as sounding. Notation-exported and quantised MIDI (end == next start) triggers it on every chord change. Clean test `C F G C Dm G C` (2 s each, end == next start) is labelled **`C F/C G/F C Dm/C G/D C`**: 4 of 7 labels wrong. With a 70 ms gap it is correct. In the bundled pieces the fix removes 21 slash labels in Bach, 3 in Für Elise, 3 in Moonlight and 1 in the QA etude.
* **Fix:** One-line fix, verified: `active.filter(n => n.end > T0 + 0.001 …)`. A note that has already been released must not vote for the next chord. Pedal support belongs in a separate `sustainEnd` path (CH-08), not in this tolerance.

##### CH-03 — 🟠 High · ✅ Confirmed · 4/4 audits

**Applied (secondary) dominants are detected in the wrong direction; C7→G7 is falsely “V⁷/V”**

* **Where:** src/engine/chords.ts:871 (`next.cand.root === mod12(r.cand.root + 7)`)
* **Seen in:** A4 CH-01 · A2 KV-03 · A3 §5.5 · A1 B-05 (A1 blamed the key follower; the direction bug is the real cause)
* **Problem:** The next root must be a fifth *below* the source (`root + 5`), not above. Real engine, key C: D7→G shows `II⁷` (should be V⁷/V), A7→Dm `VI⁷` (V⁷/ii), E7→Am `III⁷` (V⁷/vi). Worse, plain C7→G7 is labelled `V⁷/V`. 0 of 3 true secondary dominants correct, 1 false positive.
* **Fix:** Change `+ 7` to `+ 5`. Verified: D7→G becomes `V⁷/V`, A7→Dm becomes `V⁷/ii`, and C7→G7 stops claiming `V⁷/V`. Then extend to `vii°7/X` (KR-03) and add unit tests.

##### CH-04 — 🟠 High · ✅ Confirmed · 4/4 audits

**13th and minor-11th chords can never be named at the default “Balanced” sensitivity**

* **Where:** src/engine/chords.ts:773 (`maxTones … cl.length >= 3 ? 5 : 4`)
* **Seen in:** A1 B-02 · A2 CH-03, CH-04 · A3 F-005 · A4 CH-05 (all four agree)
* **Problem:** 13 and m11 templates have six tones but Balanced caps a block chord at five, so a complete C13 is shown as `C9` and Cm11 as `Cm9` (12/12 roots; 0 of 36–52 cases right). The label silently discards a played extension. Works only in “Detailed”.
* **Fix:** `cl.length >= 6 ? 7 : cl.length >= 3 ? 5 : 4`. Verified: C13, G13, Cm11 now correct; naming rate on random 6-note sets rises only 54.7 % → 56.6 % (7-note 41.2 % → 45.6 %).

##### CH-05 — 🟠 High · ✅ Confirmed · 4/4 audits

**First-inversion major-7th loses its seventh and becomes a minor triad (`Cmaj7/E` → `Em`)**

* **Where:** src/engine/chords.ts:459-480 (bass-tone treated as extra), 824
* **Seen in:** A2 CH-05 · A3 F-007 · A4 CH-04 (A1 tested only triad inversions)
* **Problem:** E-G-B-C is shown as `Em`; the C is silently dropped. Same family: `Am7/C` → `Am/C` (seventh lost), `C9/E` → `Eø7` (C lost), `C6/E` → `Am7/E` (defensible but no alternative shown). Inversion results (A4, 792 cases): 42 % correct overall, 60 % excluding inherently ambiguous sets.
* **Fix:** Prefer readings that explain all sounding pitch classes; require the 7th before re-rooting; show the second-best reading as an alternative (CH-17). The v2 prototype returns `Cmaj7/E` and `C9/E` for these inputs.

##### CH-06 — 🟠 High · ✅ Confirmed · 3/4 audits

**Suspended-chord inversions and add-chords are mis-read as 7sus4/9sus4, advertising a note that is not sounding**

* **Where:** src/engine/chords.ts (sus templates outrank plain triads); banner at renderer.ts:1732-1798
* **Seen in:** A2 CH-07 · A3 F-006 · A4 (slash/polychord 6/10)
* **Problem:** `D G C` → `D7sus4` (simpler: Csus2/D); `G C F` → `G7sus4` (Csus4/G); `D E G C` → `D9sus4`, whose symbol implies an A that nobody played. (A3 claimed the chord *chips* list unplayed tones; I checked — the chips are filtered to played tones, but the *symbol* still implies the missing fifth, and the played 13th in the C13 case is hidden from the chips.)
* **Fix:** Penalise templates whose required tones are not sounding; prefer the reading with fewer implied-but-silent tones; show the alternative (`also Csus2/D`).

##### CH-07 — 🟠 High · 🔬 Audit-verified · 3/4 audits

**Symmetric/enharmonic re-spelling replaces the chord a learner played (`Cm7/E♭` → `E♭6`, `C°7/E♭` → `E♯°7`, `C+/E` → `E+`)**

* **Where:** src/engine/chords.ts (root choice among equivalent readings)
* **Seen in:** A2 CH-06 · A3 §5.3 (taxonomy a, c) · A4 CH-25
* **Problem:** ~150–200 of ~900 generated cases are an acceptable alternative reading of the same pitch set, but the UI silently picks one and destroys the inversion lesson. Not a bug in isolation; a *teaching* defect because no “also called …” is shown.
* **Fix:** Return `alternatives[]`; in Beginner mode prefer the reading whose root equals the bass when it is a chord tone; show “same notes: C+ / E+ / G♯+” for symmetric chords.

##### CH-08 — 🟠 High · ✅ Confirmed · 4/4 audits

**Sustain pedal is invisible to the harmony engine**

* **Where:** src/engine/chords.ts:710, 801; midi.ts:495-508 computes `sustainEnd` but `ChordNote` has no such field
* **Seen in:** A1 B-06 · A2 CH-13 · A4 CH-28 (A3 wrongly said pedal “keeps the label alive” — REFUTED, see §2.4)
* **Problem:** I traced the data flow: `analyseHarmony` reads only `n.end` and `n.visEnd`; `visEnd ≤ end`. `sustainEnd` is never passed in. Pedalled harmony (Moonlight, Chopin, any impressionist piece) is therefore treated as having ended at key release while the audio and the visual tail still ring.
* **Fix:** Add `sustainEnd` to `ChordNote`; give pedal-held notes weight ≈ 0.7 and let them keep a chord alive until the pedal lifts or the bass changes (v2 evidence model, §4.7).

##### CH-09 — 🟠 High · ✅ Confirmed · 4/4 audits

**Arpeggio, Alberti and detached textures get no label — the most famous openings are blank**

* **Where:** src/engine/chords.ts:673-687 (55 ms/160 ms clustering), 725-731 (1.8 s look-back), 786-792 (≥3 onsets)
* **Seen in:** A1 B-07 · A2 CH-12, CH-14, CH-15 · A3 §5.4 · A4 CH-02, CH-03
* **Problem:** Reproduced on the real parser: first chord at **58.59 s** in Für Elise (of 165.6 s), **19.26 s** in Moonlight I (of 362 s), **8.27 s** in Mozart K.545, and none in Twinkle. Measures with ≥1 chord (A4’s count): Bach 86 %, Moonlight 67 %, K.545 29 %, Für Elise 21 %. Non-overlapping notes never have three pitch classes sounding at once, and pedal is ignored.
* **Fix:** Evidence memory with exponential decay for released arpeggio notes (≈0.8·e^(−Δ/0.45 s), ≤1.2 s) plus pedal weighting; a “gesture” mode that completes a template within one beat. Show an explicit “building…” state while the arpeggio is incomplete (CH-18). Twinkle is a melody-only file: no chord is *correct* (A1, A4) — the gap is the empty state, not the detector (UI-08).

##### CH-10 — 🟡 Medium · 🔬 Audit-verified · 4/4 audits

**Passing/melody tones create a second, false label (flicker: `C` → `Cadd9` → `C`, `C6`, `Am/C` repeated)**

* **Where:** src/engine/chords.ts:822 (same-family merge anchored at chord *start*), 816-848
* **Seen in:** A1 B-04 · A2 CH-02, CH-22 · A3 §5.4 (Mozart m23 `Am/C` ×3) · A4 CH-09
* **Problem:** A held C chord under a D→E melody yields `C` then `Cadd9` 1.25 s later because the merge test measures from the chord’s start (`r.start - p.start < 1.2`) instead of its end. A4 found two labels in the same bar of the Bach prelude (`Cadd9`+`C`, `C6`+`Am/C`).
* **Fix:** Anchor the merge at `p.end` (`r.start <= p.end + 0.5`); add hysteresis (a challenger must lead for 3 evaluations ≈120 ms or beat the current label by 0.15 confidence).

##### CH-11 — 🟡 Medium · 🔬 Audit-verified · 3/4 audits

**Rolled chords are labelled late (at completion), human rolls >55 ms spacing become “arpeggios”; thresholds are fixed seconds, not tempo-relative**

* **Where:** src/engine/chords.ts:660-668, 725-731
* **Seen in:** A2 CH-10, CH-11 · A3 §5.5 · A4 CH-15
* **Problem:** A4 measured: 30 ms roll → block label at 0 s; 80 ms roll → label at 0.16 s; 150 ms roll → 0.30 s. Detection works, but the learner sees the label only after the last note. 55 ms/160 ms are wrong at 40 bpm and 240 bpm.
* **Fix:** Window = clamp(0.055·120/bpm, 25–120 ms); show a provisional “C…” as soon as two chord tones agree.

##### CH-12 — 🟡 Medium · 🔬 Audit-verified · 3/4 audits

**Rate limiter drops genuine fast harmonic changes (< 0.3 s)**

* **Where:** src/engine/chords.ts:841
* **Seen in:** A2 CH-21 · A3 F-017 · A4 CH-13
* **Problem:** C–G–C at 250 ms each returns only `C G` — the final C is dropped.
* **Fix:** Allow a chord change <0.3 s when the new reading is a complete block of ≥3 pitch classes with conf ≥ 0.9 (already partly there) and extend to arpeggio completions.

##### CH-13 — 🟡 Medium · 🔬 Audit-verified · 2/4 audits

**Short (staccato, <100 ms) chords are never named**

* **Where:** src/engine/chords.ts:810 (`end - T0 < 0.1`)
* **Seen in:** A3 F-010 · A4 CH-14
* **Problem:** A 60 ms staccato C chord returns nothing; staccato arpeggios likewise.
* **Fix:** Use `max(visEnd, start + 0.12)` for the support window; rely on onset evidence rather than duration for short block chords.

##### CH-14 — 🟡 Medium · ✅ Confirmed · 3/4 audits

**Power chords and dyads are never named**

* **Where:** src/engine/chords.ts:732, 762 (no `5` template; <3 pitch classes returns null)
* **Seen in:** A1 (gap) · A2 CH-08 · A4 CH-08
* **Problem:** `C G` and `C G C` return null (0/3). Rock/pop learners play power chords constantly. (Returning null for a bare dyad is defensible; it should be a *deliberate* “power chord” label.)
* **Fix:** Add a `5` template valid only for exactly two pitch classes a fifth apart (v2 prototype: 3/3). Make sure it is not shown transiently while a triad arpeggio is still incomplete (A4 observed `C5` flicker).

##### CH-15 — 🟡 Medium · 🔬 Audit-verified · 2/4 audits

**Rootless jazz voicings cannot be recognised**

* **Where:** src/engine/chords.ts:431
* **Seen in:** A2 CH-09 · A4 CH-26
* **Problem:** `Dm7 (F A C E)`/`G7 (F B E A)` shells come back as `Fmaj7`, `Fmaj7♯11`, `Em7`.
* **Fix:** Out of scope for beginners; offer an Advanced-mode “rootless” pass that uses the bass of the *previous* chord and ii–V–I priors.

##### CH-16 — 🟠 High · 🔬 Audit-verified · 2/4 audits

**Confidence is an uncalibrated score shown as a percentage; “show nothing” is a score threshold, not a musical rule**

* **Where:** src/engine/chords.ts:474, HarmonyPanel.tsx, renderer.ts:1732
* **Seen in:** A2 CH-17, CH-19 · A4 CH-21
* **Problem:** The 0–1 score is a weighted sum of heuristics, shown as if it were a probability. Learners trust a “94 %” `Cadd9` for a scale fragment.
* **Fix:** Display a band (clear / likely / ambiguous) calibrated on a labelled corpus (§4.8); never show a label whose explanation cannot name ≥3 sounding chord tones.

##### CH-17 — 🟠 High · 🔬 Audit-verified · 2/4 audits

**Second-best interpretation is computed, then discarded; no explanation, no alternatives, no manual correction**

* **Where:** src/engine/chords.ts:474-482 (`second`), HarmonyPanel.tsx:144, renderer.ts:1732
* **Seen in:** A2 CH-18, CH-20 · A4 CH-20, CH-30 · A2 CH-26
* **Problem:** `matchChord` already returns `second`; it is used only to subtract 0.05 confidence. The learner gets a symbol with no ‘why’, no ‘also called’, and no way to say ‘this is wrong’.
* **Fix:** Store `alternatives[]` and a plain-language `why` on each `Chord`; add a ‘Why?’ popover and a correction control (see §4.9).

##### CH-18 — 🟡 Medium · 🔬 Audit-verified · 3/4 audits

**Label timing is inconsistent: banner can show the *previous* chord at the key press and blank for ~0.5 s between two real chords**

* **Where:** src/engine/chords.ts:812, 969-979 (`shownEnd`, `chordAtTime`)
* **Seen in:** A2 §4.5 · A3 F-017, F-018 · A4 CH-15
* **Problem:** A3’s synthetic timeline: `t=4.02 → null`, `t=4.2 → null` between two real chords. Block labels start at the first onset (needs offline look-ahead — impossible for a live keyboard), arpeggio labels at completion. `minChordHold` is display-only and can hold a label through a rest.
* **Fix:** Separate ‘evidence time’ from ‘display time’; keep the old label greyed for ≤400 ms rather than blanking; never extend a label past its supporting sound.

##### CH-19 — 🟡 Medium · 🔬 Audit-verified · 1/4 audits

**Repeated identical chords are merged across bars (12-bar blues returns 7 labels for 12 bars)**

* **Where:** src/engine/chords.ts:816-848
* **Seen in:** A4 CH-24
* **Problem:** Rhythm and form are lost; a learner cannot tell where bar 5 starts.
* **Fix:** Never merge across a barline/downbeat when a new onset cluster re-articulates the chord.

##### CH-20 — ⚪ Low · ✅ Confirmed · 2/4 audits

**`identifyChord(notes, {key})` ignores the `key` option; it also fabricates hands and timing**

* **Where:** src/engine/chords.ts:925-930
* **Seen in:** A1 B-11 · A4 CH-31
* **Problem:** Passing `{key:{tonic:8}}` gives the same output as no key (verified: `G♯` vs `A♭` spelling unchanged). Notes are given `start = i·4 ms`, `hand = m<60?L:R`.
* **Fix:** Thread `opts.key` into `analyseHarmony` as the file key so callers (and the future live-input feature) control spelling.

##### CH-21 — 🟡 Medium · 🔬 Audit-verified · 3/4 audits

**Enharmonic spelling is driven by a key estimated from the same few notes (`F♯sus2` → `G♭sus2`); C♯ major shown as D♭ major, E♭ minor as D♯ minor**

* **Where:** src/engine/chords.ts:97, 274-277, 341
* **Seen in:** A2 KV-09 · A3 F-013 · A4 CH-10 · A2 CH-23, CH-24
* **Problem:** Spelling of key names cannot produce C♯ major, G♭ major or E♭ minor; isolated chords respell by whichever key the estimator guesses from three notes.
* **Fix:** Spell from the *global/local* key with a tie-breaker toward fewer accidentals; allow the user to pick sharps/flats.

##### CH-22 — ⚪ Low · 🔬 Audit-verified · 4/4 audits

**Magic numbers, tier priors and dead/redundant code in the chord library are undocumented**

* **Where:** src/engine/chords.ts:383-386, 426, 593, 631, 678, 746; automation.ts:174
* **Seen in:** A1 B-13 · A2 CH-25 · A3 F-022 · A4 CH-22, CH-23
* **Problem:** `.replace("b","").replace("#","").replace("bb","")` order only works through an adjacent special case (B-13); several constants have no provenance; the `source: "key-signature"` path is dead.
* **Fix:** Name and document constants; replace with a regex; add a golden corpus so future tuning is measurable.

##### CH-23 — ⚪ Low · 🔬 Audit-verified · 2/4 audits

**Harmony summary/chart/list silently truncate (12 distinct, 32 progression, 600 rows, `chordAtTime` looks back 4 chords)**

* **Where:** src/engine/chords.ts:944-979; ui/HarmonyPanel.tsx
* **Seen in:** A3 F-020, F-100, F-101 · A4 CH-27, TP-04
* **Problem:** Large pieces lose the tail of the chord chart; the exported ‘chart’ is a flat list.
* **Fix:** Virtualise the list; export one bar per cell; remove silent caps or label them.

##### CH-24 — 🟡 Medium · 🔬 Audit-verified · 2/4 audits

**Chromatic passing sonorities in the Bach prelude are named as functional chords (`F°7`, `G°7`, `F♯°7`, `Gm6`, `Dm7/C`)**

* **Where:** src/engine/chords.ts (block/arpeggio matcher; no ‘passing’ concept)
* **Seen in:** A2 CH-16 · A3 §5.4
* **Problem:** In a plain C-major prelude the engine reports 160 chords, 37 of them ‘questionable’ by A2’s conservative proxy (roots outside the scale or non-diatonic tones). A teacher would call most of these ornamented versions of I, ii⁷, V⁷. The Bach file is the one piece where the engine is otherwise at its best (key 1.00, correct figured bass `I⁶₄`, `V⁶₅`).
* **Fix:** Add a ‘passing/neighbour sonority’ test (duration < one beat, unstable bass, resolves by step) and fold it into the surrounding harmony; show it only in Advanced mode.

#### Key detection and Roman numerals (`KR`)

##### KR-01 — 🟠 High · ✅ Confirmed · 4/4 audits

**Local-key follower flips to the dominant in short or dominant-heavy passages (G7 shown as I⁷; the preceding C as IV)**

* **Where:** src/engine/chords.ts:340-379, 614-646, 866-878
* **Seen in:** A1 B-05 · A2 KV-02, KV-05 · A3 F-019 · A4 CH-12
* **Problem:** Short excerpt `C(0–2 s) → G7(2–4 s)` makes the *global* key G major: `C = IV`, `G7 = I⁷` (reproduced). In Mozart K.545 `Am/C` is shown `ii⁶` at 36.9 s (it is vi⁶ in C). The follower uses a 21 s window with up to 12 s look-ahead and lags real modulations by 10–20 s.
* **Fix:** Require ≥3 s of divergent evidence *and* a cadential confirmation before switching; fall back to the global key when the candidate key’s leading tone is absent; distinguish tonicisation from modulation.

##### KR-02 — 🟠 High · 🔬 Audit-verified · 3/4 audits

**A major tonic in a minor key is shown as a plain `I` (A7 in A minor → `I⁷`)**

* **Where:** src/engine/chords.ts:614-645
* **Seen in:** A2 KV-01 · A3 F-015 · A4 CH-17
* **Problem:** Für Elise 108.3 s: `A7` → `I⁷` in A minor; 114.8 s `D7♭9` → `IV7♭9`; minor-key raised-6th/7th numerals (`♯viø⁷`) are non-standard.
* **Fix:** Use the minor-key degree table with ♯6/♯7 awareness and label tonic-major as `V⁷/iv` or `I (Picardy)` as appropriate.

##### KR-03 — 🟡 Medium · 🔬 Audit-verified · 3/4 audits

**Secondary dominants are limited to maj/7/9/13 within 3.5 s; `vii°7/X` is never labelled**

* **Where:** src/engine/chords.ts:871, 886
* **Seen in:** A2 KV-03 · A3 §5.5 · A4 CH-19
* **Problem:** `V/V` in Mozart is reported as plain `II`; leading-tone diminished chords of other degrees get no applied label.
* **Fix:** After fixing the direction (CH-03), accept dim7/m7♭5 sources and a 5 s window measured in beats.

##### KR-04 — 🟡 Medium · 🔬 Audit-verified · 2/4 audits

**No borrowed-chord/modal-mixture labelling; chromatic chords get numerals that clash with the spelled root**

* **Where:** src/engine/chords.ts:614-646
* **Seen in:** A2 KV-04 · A4 CH-18
* **Problem:** `Fm` in C major shows `iv` with no ‘borrowed’ cue; a C major chord in C♯ minor shows `♯VII` next to the root `C`.
* **Fix:** Add a `borrowed from parallel minor/major` tag and make the numeral follow the spelled root.

##### KR-05 — 🟡 Medium · 🔬 Audit-verified · 1/4 audits

**Modulation list contains unconfirmed tonicisations (a secondary dominant reported as a key change)**

* **Where:** src/engine/chords.ts (modulation summary)
* **Seen in:** A2 KV-06
* **Problem:** Bach 29–31 s: `D → V in G major, then II in C major`.
* **Fix:** Report modulations only after a cadence in the new key plus ≥2 diatonic confirmations.

##### KR-06 — ⚪ Low · 🔬 Audit-verified · 2/4 audits

**File key signature is only a +0.035 correlation nudge; later key-signature events ignored; ‘from key signature’ source is dead code; file key overwritten**

* **Where:** src/engine/chords.ts:309-315; midi.ts:422, 448, 541
* **Seen in:** A2 KV-08 · A4 CH-11, MI-17
* **Problem:** Pieces that modulate by key-signature change are analysed with the first signature only.
* **Fix:** Treat explicit key-signature events as strong priors in their time ranges.

##### KR-07 — ⚪ Low · 🔍 Suspected · 1/4 audits

**Key confidence is a heuristic displayed as “% sure”**

* **Where:** src/ui/HarmonyPanel.tsx
* **Seen in:** A2 KV-07
* **Problem:** A correlation margin is presented as a probability.
* **Fix:** Show Low/Medium/High; give the runner-up key.

##### KR-08 — ⚪ Low · 🔬 Audit-verified · 3/4 audits

**Figured bass only for triads/sevenths; sixth/extended-chord numerals inconsistent; scale-degree labels use the global key**

* **Where:** src/engine/chords.ts:544-590; renderer.ts:456-468
* **Seen in:** A2 KV-10 · A3 F-014 · A4 RN-16
* **Problem:** Extended chords drop inversion figures; ‘scale degree’ labels ignore local key.
* **Fix:** Use the local key for labels; extend figures to 9ths or show slash bass only.

#### MIDI parsing and analysis (`MP`)

##### MP-01 — 🟡 Medium · ✅ Confirmed · 3/4 audits

**Unterminated note-on is held to the end of the song instead of ~one beat**

* **Where:** src/engine/midi.ts:339 (`Math.max(o.tick + ppq/4, maxTick)`)
* **Seen in:** A1 B-01 (High, executed) · A2 MD-14 · A4 MI-04
* **Problem:** `Math.max` should be `Math.min`. A dangling note-on at 0.5 s was reported as `end = song end` (A1 harness). It distorts note length, `sustainEnd`, the visible-window index, density, loop ranges and harmony.
* **Fix:** `endTick: Math.min(maxTick, o.tick + ppq)` (≈ one beat). Add an import report entry: “1 stuck note capped”.

##### MP-02 — 🟡 Medium · 🔬 Audit-verified · 2/4 audits

**Tempo of 0 µs/beat is accepted (divide-by-zero → Infinity times)**

* **Where:** src/engine/midi.ts:220, 267, 276
* **Seen in:** A4 MI-01 · A2 MD-06
* **Problem:** A tempo meta event with value 0 produces non-finite times.
* **Fix:** Clamp tempo to 20–1000 bpm and warn.

##### MP-03 — 🟡 Medium · 🔬 Audit-verified · 4/4 audits

**Measure grid silently truncated at 5,000 measures; degenerate time-signature denominators create bogus grids**

* **Where:** src/engine/midi.ts:221-224, 377-396
* **Seen in:** A1 B-23 · A2 MD-09 · A3 F-026 · A4 MI-02, MI-03
* **Problem:** `1 << den` with den up to 255; loop bound is 5,000.
* **Fix:** Clamp denominator to 0–6; compute measures lazily; warn when truncating.

##### MP-04 — ⚪ Low · 🔬 Audit-verified · 3/4 audits

**SMPTE-division files assume ppq=480 and ignore tempo; format-2 files treated as simultaneous format-1**

* **Where:** src/engine/midi.ts:165-185, 276-290
* **Seen in:** A1 B-22 · A2 MD-01, MD-05 · A4 MI-09
* **Problem:** Rare in practice, but wrong times and measure lines when they occur.
* **Fix:** Honour the division bytes or reject with a clear message.

##### MP-05 — 🟡 Medium · 🔬 Audit-verified · 3/4 audits

**Pedal handling is partial: only CC64, binary at ≥64, only the first pedal period per note, events from any channel affect all notes, `sustainEnd` capped at +6 s**

* **Where:** src/engine/midi.ts:246, 484-508
* **Seen in:** A2 MD-03, MD-04 · A3 F-033 · A4 MI-06
* **Problem:** Re-pedalling cuts sustains; half-pedal and sostenuto/soft pedals are ignored.
* **Fix:** Per-channel pedal state machine; support CC66/67; drop the arbitrary 6 s cap or make it a setting.

##### MP-06 — 🟡 Medium · 🔬 Audit-verified · 2/4 audits

**Silent data loss on import: drums (ch10), notes outside A0–C8, program changes; malformed tracks silently lose notes**

* **Where:** src/engine/midi.ts:272-274, 323-326, 247
* **Seen in:** A2 MD-02, MD-08 · A4 MI-11
* **Problem:** No “ignored 37 notes outside A0–C8” message; no import summary.
* **Fix:** Add a pre-load import report (note count, dropped notes, tempo map, key signature, track→hand map, pedal events).

##### MP-07 — 🟡 Medium · 🔍 Suspected · 2/4 audits

**Hand assignment guesses from track names and average pitch**

* **Where:** src/engine/midi.ts:474-482
* **Seen in:** A2 MD-10 · A4 MI-12
* **Problem:** Single-track and format-0 files get hand splits at a fixed pitch; wrong for crossing hands.
* **Fix:** Voice-leading–based split with a manual override that persists.

##### MP-08 — ⚪ Low · 🔬 Audit-verified · 3/4 audits

**Fingering is heuristic and unvalidated: no hand size/reach model, 40 ms grouping, 6+ note chords duplicate fingers, non-idiomatic 4/5 and black-key penalties**

* **Where:** src/engine/midi.ts:549-562 and the Viterbi block
* **Seen in:** A2 MD-11, MD-12 · A3 F-029, F-030, F-031 · A4 MI-13
* **Problem:** Fingering labels are presented as advice but are an unvalidated DP.
* **Fix:** Label them “suggested”; add an editor and published-fingering import; warn on impossible stretches.

##### MP-09 — ⚪ Low · 🔬 Audit-verified · 3/4 audits

**Other parser edge cases: only first tempo at tick 0 used, running status not cancelled by meta/sysex, 5-byte VLQ accepted, Latin-1 text, FIFO pairing of repeated notes, loop-counter `t--` trick**

* **Where:** src/engine/midi.ts:135-139, 211-215, 272-274; F-023..F-025
* **Seen in:** A2 MD-07 · A3 F-023, F-024, F-025 · A4 MI-07, MI-08, MI-10
* **Problem:** All individually minor; none crashed the parser in 20,000 mutated/truncated files (A3) and A2’s browser tests gave human-readable errors.
* **Fix:** Fix in a parser hardening pass with fuzz tests in CI.

##### MP-10 — 🟡 Medium · 🔬 Audit-verified · 1/4 audits

**Song duration ignores sustain/release tail; one very long note defeats the visible-window index; double analysis on load**

* **Where:** src/engine/midi.ts:453, 458, 509-515, 687-697; player.ts:115
* **Seen in:** A4 MI-15, MI-05, MI-16
* **Problem:** Pieces end ‘early’ relative to audible decay; one stuck note costs about +1 ms/frame at 3.3 k notes (A4 downgraded it to Low).
* **Fix:** Include `max(sustainEnd)` in duration; build an interval index; analyse once.

##### MP-11 — 🟠 High · 🔬 Audit-verified · 3/4 audits

**MIDI parsing and full harmony analysis run synchronously on the UI thread, re-running on every analysis-setting change; no size limit or progress**

* **Where:** src/App.tsx:285-291; src/engine/player.ts:115; midi.ts:113-140, 458
* **Seen in:** A2 MD-13, TR-12 · A3 F-003, F-004, F-021 · A4 CH-29, SEC-05
* **Problem:** Timings: 120 notes 18 ms, 3.3 k notes 25 ms, 5 k notes 69 ms, 16.7 k notes 55 ms, 20 k notes 208–368 ms (Node). A long piece freezes the UI for a third of a second per toggle; there is no loading/cancel state.
* **Fix:** Move parse + analysis into a Web Worker, stream large files, cap size (e.g. 20 MB), show a progress bar, debounce setting changes.

##### MP-12 — ⚪ Low · 🔬 Audit-verified · 2/4 audits

**`formatTime` clamps 1000 ms to 999; `measureAt`/`buildManifest` index `[0]` without empty guards**

* **Where:** src/engine/midi.ts:715; sync.ts:55
* **Seen in:** A3 F-027, F-028 · A4 TP-07
* **Problem:** Off-by-one display and potential crash on empty songs.
* **Fix:** Carry milliseconds into seconds; guard empty arrays.

#### Transport and player (`TP`)

##### TP-01 — 🟠 High · ✅ Confirmed · 1/4 audits

**`Shift+←/→` (previous/next note) gets stuck on any note not on the video-frame grid**

* **Where:** src/engine/player.ts:226-247
* **Seen in:** A4 PL-01 (executed with the real Player class; found only by A4)
* **Problem:** Forward: target = first note with `start > t + 0.002`, then `seekFrame(frameOfMidiTime(target))` rounds to a frame. If rounding lands >2 ms *before* the note, the next press selects the same note again (A4: notes at 1.005/1.505/2.005 → t = 1, 1 …). Real MIDI files are almost never frame-aligned, so the README’s advertised stepping cannot walk through a real piece.
* **Fix:** Keep a `noteCursor` index (or compare with the previous *target*), and set `t` to the exact note time after seeking.

##### TP-02 — 🟡 Medium · ✅ Confirmed · 2/4 audits

**Holding Space toggles play/pause on every key-repeat (flicker); Space also blurs the focused button**

* **Where:** src/App.tsx:342-351
* **Seen in:** A4 PL-02 (executed) · A3 F-089, F-109
* **Problem:** No `e.repeat` guard before `player.toggle()` (confirmed in source); A4 observed true,false,true,false…
* **Fix:** `if (e.repeat) return;` and do not steal Space from focused buttons/sliders.

##### TP-03 — 🟡 Medium · 🔬 Audit-verified · 4/4 audits

**Visual clock is an accumulated rAF delta (capped 0.1 s), not anchored to the audio clock; stalls drop time and desync sound**

* **Where:** src/engine/player.ts:288, 335, 346
* **Seen in:** A1 B-16 · A2 AU-02 · A3 F-035 · A4 PL-03 · A2 RN-15
* **Problem:** Audio is scheduled 0.18 s ahead from media time; after a stall the ‘recover’ path resets and skips late notes. Not measurable here (no audio device in any audit).
* **Fix:** Make `AudioContext.currentTime` the master clock with an anchor re-set on seek/speed/loop.

##### TP-04 — 🟡 Medium · 🔬 Audit-verified · 3/4 audits

**No automatic output-latency compensation; manual audio offset only (negative offsets usable only inside the 0.18 s look-ahead)**

* **Where:** src/engine/player.ts:155-160
* **Seen in:** A3 F-034 · A4 PL-04 · A2 §5.4
* **Problem:** No use of `outputLatency`/`baseLatency`. `Math.max(0, delay)` clamps negative delays to ‘now’. (A3 called it ‘cannot shift sound earlier’ — overstated: it works up to ≈0.18 s.)
* **Fix:** Read `AudioContext.outputLatency`; add a tap-to-calibrate wizard.

##### TP-05 — 🟡 Medium · 🔬 Audit-verified · 3/4 audits

**Changing speed does not reschedule audio already committed to the WebAudio clock**

* **Where:** src/engine/player.ts:252, 335
* **Seen in:** A1 (note) · A2 AU-03 · A4 PL-05
* **Problem:** Up to 0.18 s of notes play at the old speed after a speed change.
* **Fix:** Cancel/re-anchor scheduled voices on speed change.

##### TP-06 — 🟠 High · 🔬 Audit-verified · 3/4 audits

**“Practice mode” is auto-pause, not interactive practice: no wait-for-note, no scoring, no input**

* **Where:** src/engine/player.ts:306-322; ui/SettingsPanel.tsx:451-455
* **Seen in:** A2 TR-01, TR-02 · A3 F-036 · A4 PL-06, UI-12 · A4 CH-16
* **Problem:** The app *looks* like a practice tool but cannot receive a note. There are zero `requestMIDIAccess` calls in the repo (confirmed) and no on-screen/computer keyboard.
* **Fix:** Web MIDI + computer-key + touch input; wait-for-correct-note per hand; scoring (L-01…L-03).

##### TP-07 — 🟡 Medium · ✅ Confirmed · 4/4 audits

**Player is constructed in the render body and never disposed (two players + two audio engines in dev/StrictMode; HMR leak)**

* **Where:** src/App.tsx:179-184; main.tsx:8; player.ts:54, 352-357
* **Seen in:** A1 B-10 · A2 CQ-13 · A3 F-001 (High) · A4 PL-09, RP-08
* **Problem:** Production build is unaffected (A3’s ‘High’ is overstated), but development shows doubled rAF loops and audio, and there is no unmount cleanup.
* **Fix:** Create the Player in a ref/effect guard; call `dispose()` in cleanup.

##### TP-08 — ⚪ Low · 🔬 Audit-verified · 3/4 audits

**Loop wrap uses soft `stopAll` (pedal tails bleed), cuts held notes, doesn’t reset the practice skip pointer; loop bounds aren’t validated against the song (end < start allowed from imports)**

* **Where:** src/engine/player.ts:296-304, 335; settings.ts (loop schema)
* **Seen in:** A2 AU-04, TR-03, TR-04 · A3 F-039, F-142, F-143 · A4 PL-07
* **Problem:** Audible gap or bleed at the loop point; last-measure loop uses `song.duration`.
* **Fix:** Cross-fade at wrap; validate and clamp loop ranges on every load.

##### TP-09 — ⚪ Low · 🔬 Audit-verified · 2/4 audits

**Seeking inside a held note silences it; scrubbing hard-stops all voices on every pointermove; frame stepping causes release/attack clicks**

* **Where:** src/engine/player.ts:158-159, 208-215
* **Seen in:** A3 F-037 · A4 PL-08, TP-03
* **Problem:** Scrub feels choppy and clicky.
* **Fix:** Debounce scrub audio; keep held notes alive across small seeks.

##### TP-10 — ⚪ Low · 🔬 Audit-verified · 4/4 audits

**React UI is re-rendered at ~15 Hz during playback (clock/banner visibly step); the rAF loop runs forever even when paused or hidden**

* **Where:** src/engine/player.ts:346; App.tsx
* **Seen in:** A1 B-16 · A2 TR-08, TR-09 · A3 F-041 · A4 PL-10
* **Problem:** The 66 ms throttle is below display cadence on 60/120 Hz screens and competes with canvas work.
* **Fix:** Update the clock via a ref/canvas; pause rAF when hidden or static.

##### TP-11 — ⚪ Low · 🔬 Audit-verified · 3/4 audits

**Minor transport inconsistencies: negative schedule delays clamp to 0 (flams after stalls); three different speed clamps; audition hold divided by speed inconsistently; step helpers disagree on what a ‘note’ is; shared DEFAULT objects aliased by Player**

* **Where:** src/engine/player.ts:27-28, 40-ish, 136-146, 161, 232-247
* **Seen in:** A1 B-24 · A3 F-002, F-038, F-040 · A4 PL-12, PL-13, TP-10
* **Problem:** Cosmetic but accumulate into ‘feels off’ behaviour.
* **Fix:** Unify clamps; deep-copy defaults; drop late notes (>30 ms) instead of flamming.

##### TP-12 — ⚪ Low · 🔬 Audit-verified · 2/4 audits

**Canvas size clamp (min 320×200) distorts small containers; `dispose()` doesn’t detach the canvas or mark disposed**

* **Where:** src/engine/player.ts:91-100, 352-357
* **Seen in:** A3 F-042 · A4 PL-11
* **Problem:** Small embeds render stretched.
* **Fix:** Respect the container size or letterbox.

#### Audio (`AU`)

##### AU-01 — 🟠 High · ✅ Confirmed · 3/4 audits

**Playback starts before the piano soundfont is ready: the first notes are silent with no ‘waiting for piano’ state**

* **Where:** src/engine/audio.ts; player.ts:187-196, 232-342 (`whenReady` is used only by the automation API)
* **Seen in:** A2 AU-01 (reproduced in browser), UX-01 · A3 F-045, F-050 · A4 AU-02
* **Problem:** Pressing Play right after load starts the transport while the bank is empty; `playNote` returns early (≈0.9 s+ of silence in A2’s run). I confirmed `whenReady` is not called from the UI/player path.
* **Fix:** Gate Play on bank readiness (or show ‘Piano loading… 12/30’), retry failed samples, and show a persistent ‘Silent: offline/muted/loading’ chip (A-02, A-10).

##### AU-02 — 🟡 Medium · 🔬 Audit-verified · 3/4 audits

**Samples come from unpinned third-party CDNs with no SRI/health indicator; first play makes third-party requests (privacy); one failed sample leaves the bank incomplete and is re-downloaded forever**

* **Where:** src/engine/audio.ts:43-44, 103, 236, 299-301
* **Seen in:** A2 SEC-01, SEC-07 · A3 F-045, F-046, F-146 · A4 AU-01, AU-02, SEC-08
* **Problem:** Offline = silent by design, but a CDN path change would silently break sound for every user.
* **Fix:** Self-host/pin and hash the samples, cache via service worker, retry with backoff, show source status.

##### AU-03 — 🟡 Medium · 🔍 Suspected · 1/4 audits

**Audio transpose is invisible to the visualizer and the harmony engine**

* **Where:** src/engine/audio.ts / player.ts
* **Seen in:** A2 AU-05
* **Problem:** Sound is shifted but picture, key detection and chord names stay at the written pitch.
* **Fix:** Either transpose the Song or clearly label ‘audio-only transpose’.

##### AU-04 — 🟡 Medium · 🔍 Suspected · 2/4 audits

**Transposition far outside the sampled range gives extreme playback rates; single-velocity-layer samples are pitched up to ±1.5 semitones**

* **Where:** src/engine/audio.ts:80-87, 181-190, 383-400
* **Seen in:** A2 AU-06 · A4 AU-05
* **Problem:** Timbre degrades at the extremes; no velocity layers.
* **Fix:** Clamp pitch-shift distance; use velocity-layered samples.

##### AU-05 — 🟡 Medium · 🔬 Audit-verified · 3/4 audits

**Voice cap steals the earliest-scheduled (not longest-sounding) voice audibly; O(n) eviction and linear sample search per note**

* **Where:** src/engine/audio.ts:118, 392-396
* **Seen in:** A2 AU-07 · A3 F-043, F-044 · A4 AU-04
* **Problem:** Dense passages drop notes mid-sustain.
* **Fix:** Priority stealing with short crossfade; binary search; polyphony meter.

##### AU-06 — ⚪ Low · 🔬 Audit-verified · 2/4 audits

**No damper/pedal model, no half-pedal; long notes aren’t looped beyond the sample length**

* **Where:** src/engine/audio.ts:376-423
* **Seen in:** A2 AU-08 · A4 AU-10
* **Problem:** Pedal is a duration extension only.
* **Fix:** Pedal-aware release envelopes; half-pedal via CC64 value.

##### AU-07 — ⚪ Low · 🔬 Audit-verified · 2/4 audits

**Reverb impulse response is regenerated and swapped on the main thread whenever the slider moves**

* **Where:** src/engine/audio.ts:159, 212-229
* **Seen in:** A3 F-051 · A4 AU-03
* **Problem:** Slider drags cause hitches and glitches.
* **Fix:** Debounce; precompute IR variants; use `OfflineAudioContext` in a worker.

##### AU-08 — ⚪ Low · 🔬 Audit-verified · 4/4 audits

**Custom soundfont loading: http:// and any origin accepted, no size cap, permissive regex parser, bulk base64 decode on main thread, `banks` Map grows unbounded, format-coupled parser**

* **Where:** src/engine/audio.ts:128, 278, 305, 309
* **Seen in:** A1 B-15, B-26 · A2 AU-09, AU-10, AU-12 · A3 F-047 · A4 AU-07
* **Problem:** Hardening and robustness issue, not a vulnerability by itself.
* **Fix:** https-only, size cap, LRU of 3 banks, JSON parse with regex fallback.

##### AU-09 — ⚪ Low · 🔍 Suspected · 2/4 audits

**iOS Safari: mute-switch/interruption handling absent; autoplay unlock depends on the first UI action and fails silently**

* **Where:** src/engine/audio.ts:181-190
* **Seen in:** A2 AU-11 · A4 AU-06
* **Problem:** Common iOS ‘no sound’ reports.
* **Fix:** Resume on `visibilitychange`/`statechange`; explicit ‘Tap to enable sound’.

##### AU-10 — ⚪ Low · 🔬 Audit-verified · 3/4 audits

**Housekeeping: `whenReady` busy-polls every 80 ms; `dispose()` leaves the `online` listener; `onended` disconnects gain but not `src`; no disposed guard for racing `playNote`; 0.62 headroom constant undocumented**

* **Where:** src/engine/audio.ts:344-365, 415-422, 443-449
* **Seen in:** A1 B-25 · A3 F-048, F-049, F-050 · A4 AU-08, AU-09
* **Problem:** Small leaks and races on long sessions.
* **Fix:** Promise-based readiness; full teardown; document constants.

#### Export (`EX`)

##### EX-01 — 🟡 Medium · 🔬 Audit-verified · 2/4 audits

**Exported MP4 has no audio track**

* **Where:** src/engine/exporter.ts; sync.ts:41-43, 57, 75
* **Seen in:** A2 EX-05 · A4 EX-01
* **Problem:** The renderer produces a silent video plus a `.sync.json` manifest; users must mux audio themselves with ffmpeg. Competitors (Synthesia, Neothesia) export with sound.
* **Fix:** Render the scheduled audio with `OfflineAudioContext`, encode AAC/Opus (`AudioEncoder`), and mux in-app (A-09).

##### EX-02 — 🟡 Medium · ✅ Confirmed · 4/4 audits

**Quality profiles are named “lossless / archival” but are lossy H.264 4:2:0 (bitrate capped at 240 Mbps); size estimate is a guess**

* **Where:** src/engine/settings.ts:339-343; exporter.ts:35, 44-49; types.ts:219; sync.ts:79
* **Seen in:** A1 B-08 · A2 EX-03, EX-04 · A3 F-056, F-119 · A4 EX-03
* **Problem:** WebCodecs H.264 here is always 4:2:0 and lossy; the modal’s own fine print admits it. Misleading for archiving users.
* **Fix:** Rename to ‘Maximum quality (4:2:0)’; add a true lossless path (PNG sequence, WebM/VP9-lossless) and measured size estimates (E-06).

##### EX-03 — 🟡 Medium · 🔬 Audit-verified · 2/4 audits

**“Identical pixels to the screen” claim is false: export layout differs from live for non-matching aspect ratios, and hit tolerance differs (4 ms live vs half a video frame at export)**

* **Where:** src/ui/ExportModal.tsx:154; sync.ts:84; player/renderer hit tolerance
* **Seen in:** A2 EX-02 · A4 RN-19 · A2 RN-09
* **Problem:** A 1920×914 live canvas vs a 1920×1080 export proves it; at 24 fps notes count as ‘sounding’ ~20.8 ms early in export vs 4 ms live, so key-press and flash timing differ.
* **Fix:** Show a ‘preview at export size’ frame (E-02) and reword the claim; make tolerance identical.

##### EX-04 — 🟡 Medium · ✅ Confirmed · 3/4 audits

**Export number fields clamp on every keystroke: typing `2560` into Width yields `7680`; odd widths are silently masked; Stepper snaps to its minimum while typing**

* **Where:** src/ui/ExportModal.tsx:176, 180, 190, 194; ui/primitives.tsx:227-241; settings.ts:423
* **Seen in:** A4 EX-04 (executed) · A3 F-104, F-111, F-113 · A2
* **Problem:** I read the code: `onChange={e => setSync(... Math.max(320, Math.min(7680, +e.target.value || 1920)))}`. Typing ‘2’ becomes 320, then ‘3200’, then ‘32006’ → clamped to 7680. Controlled input applies the clamp per keystroke.
* **Fix:** Keep a string draft in local state; commit/clamp on blur or Enter.

##### EX-05 — 🟡 Medium · 🔬 Audit-verified · 3/4 audits

**Whole MP4 accumulates in memory unless File System Access is available; long or 4K renders can exhaust RAM**

* **Where:** src/engine/exporter.ts:37-46, 82-88
* **Seen in:** A2 EX-01 · A3 F-052 · A4 EX-07
* **Problem:** No streaming-to-disk path by default; `lastExport` pins the blob until cleared; `bytesToBase64` builds huge strings.
* **Fix:** Stream via OPFS/File System Access; preflight memory (E-01, E-07).

##### EX-06 — 🟡 Medium · 🔬 Audit-verified · 4/4 audits

**Export runs on the main thread, paced by a 2 ms `setTimeout` poll; background tabs throttle to a crawl; UI starves**

* **Where:** src/engine/exporter.ts:112-118; ExportModal.tsx
* **Seen in:** A1 B-21 · A2 EX-07 · A3 F-053, F-147 · A4 EX-06
* **Problem:** Backpressure loop is fine functionally but slow and fragile; 4K frames cost 32–46 ms each (A2) or far more under software raster (A1/A4).
* **Fix:** Render in a Worker with OffscreenCanvas (E-04); pace with rAF or `scheduler.yield()`.

##### EX-07 — ⚪ Low · 🔬 Audit-verified · 1/4 audits

**Suggested ffmpeg command is unquoted and breaks on file names with spaces**

* **Where:** src/ui/ExportModal.tsx:141; sync.ts:84
* **Seen in:** A4 EX-02
* **Problem:** Copy-paste fails for ‘My Song.mid’.
* **Fix:** Quote paths; offer a downloadable `.sh/.bat`.

##### EX-08 — 🟡 Medium · 🔬 Audit-verified · 3/4 audits

**Export dialog is not truly modal: no focus trap/initial focus/restoration; app stays interactive; hand reassignment or settings can change mid-render; the dialog edits persistent global settings**

* **Where:** src/ui/ExportModal.tsx:110-111, 133-146, 171-180; App.tsx:211
* **Seen in:** A2 EX-10, AC-11 · A3 F-103, F-140 · A4 EX-09, EX-10, UI-18
* **Problem:** A mis-click can reach controls behind the dialog during a render.
* **Fix:** Inert background + focus trap; snapshot settings for the render and restore after.

##### EX-09 — ⚪ Low · 🔬 Audit-verified · 3/4 audits

**WebCodecs/H.264 support is narrower than the README implies; up to 14 `isConfigSupported` probes before every export; `mp4-muxer` is deprecated upstream (superseded by Mediabunny); no fallback renderer**

* **Where:** src/engine/exporter.ts:31-33; ExportModal.tsx:260; package.json
* **Seen in:** A2 EX-06 · A3 F-055, F-124 · A4 RP-07
* **Problem:** Firefox/older Safari users get no export.
* **Fix:** Cache probe results; migrate to Mediabunny; provide a PNG-sequence fallback.

##### EX-10 — ⚪ Low · 🔬 Audit-verified · 4/4 audits

**Encoder errors surface late and the encoder may be closed twice; no export preflight summary; frame-count math (`Math.ceil`) can be off by one; manifest offset is unrounded while frames use the rounded offset; frame duration drifts for non-integer fps**

* **Where:** src/engine/exporter.ts; sync.ts:28, 41-43, 57
* **Seen in:** A1 B-31 · A2 EX-08, EX-09, EX-11 · A3 F-054 · A4 EX-05
* **Problem:** Harmless in typical use; undermines the ‘frame-exact’ claim in edge cases.
* **Fix:** Round consistently; document the frame law; surface the first encoder error immediately.

##### EX-11 — ⚪ Low · 🔬 Audit-verified · 3/4 audits

**Export UX nits: two programmatic downloads in a row, clipboard ‘copied’ shown even if `writeText` fails, ‘saved’ shown when bytes is 0 for streamed files; `renderFrame` blocks the main thread and returns huge data URLs; `renderFrame` (1×) and `getFramePixelsRGBA` (live DPR) disagree**

* **Where:** src/ui/ExportModal.tsx:105-111; automation.ts
* **Seen in:** A3 F-059, F-060, F-105, F-130, F-139, F-148 · A4 EX-08 · A2 UX-02
* **Problem:** Confusing completion messages and blocked UI in automation.
* **Fix:** Check promise results; use Blob URLs; make the two render paths share DPR semantics.

#### Renderer and visualizer (`RV`)

##### RV-01 — 🟠 High · ✅ Confirmed · 4/4 audits

**Frame cost scales steeply with visible notes (per-note gradients, clip, save/restore, spark arcs)**

* **Where:** src/engine/renderer.ts:703-812, 826-880
* **Seen in:** A1 §5.2 · A2 RN-01, RN-02 · A3 F-011, F-012 · A4 RN-01 (all four)
* **Problem:** I re-ran audit #3’s op-counter harness: **367** `createLinearGradient` calls per frame on the real Bach prelude, **19,597** at 5,000 visible notes, 11.7 k `save()` calls. Measured by audits in headless Chromium with software raster: 5,000 notes 46 ms drawFrame (A2) / 281–822 ms incl. raster (A4); live rAF at 5,000 notes ≈ 5 fps (A2). Effects off → ~3× faster (A2: 46 → 15.6 ms).
* **Fix:** Pre-rendered note sprites (9-slice) per colour×width bucket; batch inactive notes into one path; cap effects; frame-budget governor (V-02, V-03, V-06).

##### RV-02 — 🟠 High · ✅ Confirmed · 3/4 audits

**The static keyboard is redrawn from scratch every frame — about 282 gradient allocations per frame with only 10 notes visible**

* **Where:** src/engine/renderer.ts (drawKeys, rail, labels, minimap); 144-219
* **Seen in:** A2 RN-03 · A3 F-071, F-072, F-077, F-080, F-144 · A4 RN-02
* **Problem:** My run of A3’s harness: **282 of the 367 gradients/frame (77 %)** on a normal piece come from the keyboard chrome before any note is drawn; 208 save/clip/restore triples; per-black-key `shadowBlur`; 88 static labels re-stamped. At 60 Hz → ~17 k gradient objects/s; at 120 Hz double.
* **Fix:** Bake the unpressed keyboard, rail, labels and background to an offscreen canvas keyed by layout signature; redraw only pressed keys and glows (V-01). This is the largest *avoidable constant* cost.

##### RV-03 — 🟡 Medium · 🔬 Audit-verified · 4/4 audits

**Per-frame allocation churn (≈86–160 KB/frame idle, 150–360 KB with notes): `computeLayout` rebuilds `Float64Array(88)`×2 each frame, `incoming` list and Maps, per-measure gradients, `measureText`/`fitText` for banner and rail, one rounded-rect path per sustain tail, `Math.sin` hash called hundreds of times**

* **Where:** src/engine/renderer.ts:144-219, 255-272, 619-621, 702, 1080-1088
* **Seen in:** A1 (§5.2) · A2 RN-04, RN-18 · A3 F-067, F-068, F-073, F-075, F-076, F-078, F-079, F-085 · A4 RN-02, TP-09
* **Problem:** ≈5–22 MB/s garbage at 60 fps (A4 heap proxy) → GC hitches on phones.
* **Fix:** Cache layout by signature, pool arrays, cache text metrics, replace `Math.sin` with an integer hash (V-05).

##### RV-04 — 🟡 Medium · 🔬 Audit-verified · 4/4 audits

**Post-processing copies the whole canvas every frame; scratch cache evicts wholesale at 2 entries (≈66 MB for two 4K surfaces); blur/shadow done full-resolution; Safari fallback `pixelGrade` does an O(W×H) JS readback and silently ignores hue and sepia**

* **Where:** src/engine/renderer.ts:1303, 1608, 1815-1901
* **Seen in:** A1 B-12 · A2 RN-05, RN-11 · A3 F-062, F-063, F-064 · A4 RN-03, RN-12, RN-13
* **Problem:** Look differs on older Safari; cost at 4K is large.
* **Fix:** Downsample bloom; ref-count scratch surfaces; hide unsupported controls or implement hue/sepia matrices.

##### RV-05 — 🟡 Medium · ✅ Confirmed · 4/4 audits

**Device-pixel ratio is capped at 2 (phones and many 4K displays are 3×) and DPR changes are only noticed on a resize event**

* **Where:** src/App.tsx:134 (`Math.min(2, window.devicePixelRatio || 1)`)
* **Seen in:** A1 B-20 · A2 RN-06, RN-14 · A3 F-108 · A4 RN-04
* **Problem:** Confirmed in source. A2: a 390×544 CSS stage at DPR 3 gets a 780×1086 backing store, so it is blurred, while exports stay crisp.
* **Fix:** Cap at 3 behind a pixel budget (e.g. ≤ 8 MP) with adaptive scale (V-04); listen to `matchMedia('(resolution: …)')` changes.

##### RV-06 — 🟡 Medium · 🔬 Audit-verified · 3/4 audits

**No frame-budget governor, quality presets or FPS/dropped-frame HUD; users can’t diagnose slowdowns**

* **Where:** src/engine/renderer.ts; settings.ts
* **Seen in:** A2 RN-01, UP-13, UP-52 · A3 V6 · A4 U-22, U-52
* **Problem:** At 120 Hz the 8.3 ms budget is exceeded by the idle frame in software raster (A4: 12.6 ms at 720p). The same effects run regardless of load.
* **Fix:** Measure `dt`; auto-degrade bloom/sparks/dust below 55 fps; expose Cinematic/Balanced/Fast/Accessible presets (V-03).

##### RV-07 — 🟡 Medium · 🔬 Audit-verified · 3/4 audits

**Sparks, dust and bloom are per-note/per-mote work: 7 spark arcs + `Math.sin` per active note, 42–54 radial gradients per frame for ambient dust (2–4 ms), `shadowBlur` on active notes**

* **Where:** src/engine/renderer.ts:533-549, 826-880
* **Seen in:** A2 RN-18 · A3 F-069, F-070 · A4 RN-18
* **Problem:** Effects dominate cost under load (3×).
* **Fix:** Particle pool with pre-rendered glow sprites; cap per-frame particles (V-06).

##### RV-08 — 🟡 Medium · ✅ Confirmed · 3/4 audits

**Velocity barely changes the picture: maximum darkening is 8 % (velocityDim 0.16 × 0.5 at velocity 0) and none in monochrome; very short notes are inflated by `minHeight`**

* **Where:** src/engine/settings.ts:113-114; renderer.ts:630-636, 712, 716
* **Seen in:** A2 §5.4 · A3 F-134 · A4 RN-09, RN-10
* **Problem:** Computed from the shipped defaults. A pianist’s dynamics — the most expressive part of a performance — are almost invisible.
* **Fix:** Map velocity to width/height/edge glow/key wash with a documented curve and legend (V-08).

##### RV-09 — 🟡 Medium · 🔬 Audit-verified · 3/4 audits

**No note trails/ghosting and no per-track colours (hand, finger, pitch-class, colour-blind, mono palettes only)**

* **Where:** src/engine/renderer.ts; types.ts
* **Seen in:** A2 §5.4, UP-17 · A3 F-135, F-136 · A4 U-27
* **Problem:** Fast passages are harder to read than they need to be; multi-instrument MIDI collapses to two hand colours.
* **Fix:** Optional trail/comet tail; per-track colour picker with legend (V-09, V-11).

##### RV-10 — ⚪ Low · 🔬 Audit-verified · 1/4 audits

**Fall speed is a fixed number of seconds, not tempo- or beat-relative**

* **Where:** src/engine/settings.ts:294
* **Seen in:** A3 F-133
* **Problem:** At 240 bpm the visible window is 16 beats; at 40 bpm it is 1.6 — reading difficulty varies wildly between pieces.
* **Fix:** Offer ‘beats visible’ mode: `noteFallSeconds = clamp(beats·60/bpm, 0.6, 8)` (V-10).

##### RV-11 — 🟡 Medium · 🔬 Audit-verified · 2/4 audits

**Overlapping same-pitch notes flicker the key colour and restart the press ramp**

* **Where:** src/engine/renderer.ts:630-640
* **Seen in:** A3 F-066 · A4 MI-14 · A3 F-032
* **Problem:** Repeated/overlapping strikes make the key look unstable; `visEnd` can overlap the next note for very fast repeats.
* **Fix:** Track per-key state with a re-strike pulse instead of replacing the state.

##### RV-12 — ⚪ Low · ✅ Confirmed · 3/4 audits

**Black-key defaults are slightly off a real piano and some geometry controls misbehave**

* **Where:** src/engine/settings.ts:85-86 (0.60 / 0.6643 vs real ≈0.583 / 0.633); renderer.ts:456-468, 1815-1842
* **Seen in:** A2 RN-13 · A3 F-082, F-083, F-086, F-087, F-088 · A4 RN-08
* **Problem:** Verified defaults; verified by A1/A2/A4 that 88-key geometry is otherwise exact (52 white keys, correct black offsets, falling notes aligned). Minor: black-key offsets can overlap neighbouring lanes at high width ratios; minimap black keys disagree with the main keyboard; middle-C dot can leave the key at small heights; white/black sink formulas differ; corner-radius control saturates.
* **Fix:** Add a ‘Real piano proportions’ preset; unify the press formula; clamp offsets (V-22).

##### RV-13 — 🟡 Medium · 🔬 Audit-verified · 3/4 audits

**Chord banner collides with the HUD on narrow canvases; no max width/wrapping/safe-area; chord-bracket labels drawn under falling notes; HUD overlaps notes**

* **Where:** src/engine/renderer.ts:665-698, 1705-1749
* **Seen in:** A2 RN-08, RN-17, RN-20 · A3 F-084 · A4 RN-05, RN-06 · A2 UI-05, UX-05
* **Problem:** Seen in A4’s 390×844 screenshot and A2’s 320 px frames.
* **Fix:** Stack banner under the HUD on compact layouts; truncate long qualities; draw brackets above notes (V-15).

##### RV-14 — 🟡 Medium · 🔬 Audit-verified · 2/4 audits

**Phone-width rendering is unusable: 88 keys are ~6 px wide at 320 px, labels collapse, the stage is only 217 px tall at 320×568, and chrome takes 36 % of a 390×844 screen**

* **Where:** src/engine/renderer.ts:1381, 1626-1703; ui/chrome.tsx:130, 255
* **Seen in:** A2 RN-07, UI-06 · A4 RN-07, UI-06
* **Problem:** Two audits with real Chromium screenshots agree. The keyboard is neither readable nor playable as a touch surface.
* **Fix:** Auto-zoom to 2–4 octaves on coarse pointers (V-17); two-row transport; bottom-sheet drawers (P-03).

##### RV-15 — ⚪ Low · 🔍 Suspected · 2/4 audits

**Note labels collide and are drawn for every full-height note; label font clamped 8–14 px is illegible at 88 keys on a laptop**

* **Where:** src/engine/renderer.ts
* **Seen in:** A2 RN-16, AC-08 · A3 V14
* **Problem:** Clutter at density; tiny low-contrast canvas text for chord tones and minimap labels.
* **Fix:** Label LOD and collision test; scale by key width (V-14).

##### RV-16 — ⚪ Low · 🔬 Audit-verified · 3/4 audits

**Minimap is display-only and redraws all 88 keys every frame**

* **Where:** src/engine/renderer.ts:1536-1599
* **Seen in:** A2 RN-19 · A3 F-077 · A4 RN-17
* **Problem:** Duplicated work; no seek/zoom affordance.
* **Fix:** Cache and make it interactive (V-16).

##### RV-17 — ⚪ Low · 🔬 Audit-verified · 4/4 audits

**Caches are small and crude: background cache of 3 entries thrashes during resize; FIFO not LRU eviction; colour cache clears wholesale at 600; texture patterns are module globals shared across canvases/DPRs; no byte accounting**

* **Where:** src/engine/renderer.ts:49, 75, 521
* **Seen in:** A1 B-18 · A2 RN-10, RN-12, CQ-16 · A3 F-061, F-074, F-145 · A4 RN-14
* **Problem:** Rapid resizes or theme dragging cause GC hitches.
* **Fix:** LRU with byte budget; per-canvas patterns.

##### RV-18 — ⚪ Low · ✅ Confirmed · 3/4 audits

**“Frame-exact across browsers” rests on `Math.sin`-based hashing; engine output could diverge by 1 ULP between engines**

* **Where:** src/engine/renderer.ts:268-272
* **Seen in:** A1 B-19 · A2 SEO-09 · A4 TP-08
* **Problem:** Sparks, dust and paper grain derive from `hash()`; the README’s determinism claim is not guaranteed by the spec.
* **Fix:** Integer hash (xorshift/FNV).

##### RV-19 — ⚪ Low · 🔍 Suspected · 2/4 audits

**Firefox/older-Safari fallbacks missing: canvas `letterSpacing`, `color-mix()` backgrounds, `ctx.filter`**

* **Where:** src/engine/renderer.ts; src/index.css
* **Seen in:** A2 SEO-07 · A3 F-137, F-138
* **Problem:** Text misaligns in Firefox; backgrounds may not render in older engines.
* **Fix:** Feature-detect with fallbacks; test on Firefox/Safari (none of the four audits did).

##### RV-20 — 🟡 Medium · ✅ Confirmed · 3/4 audits

**Canvas ignores `prefers-reduced-motion` and has no photosensitivity guard: flashes, sparks and bloom always run**

* **Where:** src/index.css:308 (CSS only); no `matchMedia` anywhere in `src/`
* **Seen in:** A2 AC-05, AC-09 · A3 F-091 · A4 RN-15
* **Problem:** I grepped the source: the only reduced-motion rule is in CSS. Impact flashes and sparks can be a WCAG 2.3.1 concern.
* **Fix:** Read the media query into settings; add ‘Reduce flashes’ and ‘Still’ modes (V-18).

##### RV-21 — ⚪ Low · 🔬 Audit-verified · 3/4 audits

**Sustain tails depend on the ‘pedal indicator’ toggle; pedal events are not drawn as events; `chordAt` is computed every frame even when the banner is off; `toRgb` turns invalid hex into black; `autoZoomRange` loops are order-dependent**

* **Where:** src/engine/renderer.ts:48, 456-468, 647, 1045
* **Seen in:** A1 B-14, B-32 · A3 F-081 · A4 RN-11
* **Problem:** Minor correctness and wasted work.
* **Fix:** Decouple tails from the indicator; skip disabled work; validate colours.

#### UI, layout and responsiveness (`UI`)

##### UI-01 — 🟠 High · 🔬 Audit-verified · 2/4 audits

**Header actions are clipped at 320 px — Export is unreachable — and the transport row loses the speed selector and forward-note button; content is hidden, not scrollable**

* **Where:** src/ui/chrome.tsx:130-190, 255; App.tsx (overflow-hidden root)
* **Seen in:** A2 UI-01, UI-02, UI-04 · A4 UI-06
* **Problem:** Two audits with screenshots: at 320/390 px the document has no horizontal scroll, so cut-off controls cannot be reached at all.
* **Fix:** Two-row header, collapsible overflow menu, scrollable transport, 44 px targets (P-03).

##### UI-02 — 🟡 Medium · 🔬 Audit-verified · 3/4 audits

**Hand filter and label selectors vanish below 1280 px; button text appears only ≥1750 px; icon-only buttons rely on `title` tooltips (useless on touch)**

* **Where:** src/ui/chrome.tsx:81, 140, 164, 170-175
* **Seen in:** A2 AC-07, UI-11 · A3 F-097, F-110 · A4 UI-05, UI-07 · A2 AC-12
* **Problem:** Hand separation — a core learning feature — disappears on laptops and tablets.
* **Fix:** Keep hand filters at every width (move into the Tracks sheet); add visible labels or `aria-label`s.

##### UI-03 — 🟡 Medium · 🔬 Audit-verified · 1/4 audits

**Touch targets are 34 px (below the 44 px recommendation)**

* **Where:** src/ui/chrome.tsx; primitives.tsx
* **Seen in:** A2 UI-03
* **Problem:** Mis-taps on phones.
* **Fix:** Increase hit areas on coarse pointers.

##### UI-04 — ⚪ Low · 🔍 Suspected · 3/4 audits

**No safe-area/orientation handling; `height:100%` + `overflow:hidden` breaks under iOS address-bar resize**

* **Where:** src/index.css; App.tsx:446
* **Seen in:** A2 UI-07 · A3 F-107 · A4 RP-15
* **Problem:** Controls can sit under notches or jump on scroll.
* **Fix:** `env(safe-area-inset-*)`, `100dvh`, landscape practice layout (P-03).

##### UI-05 — ⚪ Low · 🔬 Audit-verified · 2/4 audits

**Settings → Advanced is dense (203 settings, 9.5–12 px text) with no mobile simplification; panel re-renders heavily**

* **Where:** src/ui/SettingsPanel.tsx:36-135, 200-208
* **Seen in:** A2 UI-12 · A4 UI-10
* **Problem:** Hard to find things on a phone.
* **Fix:** Basic/Advanced split, command-palette search (P-11).

##### UI-06 — 🟡 Medium · 🔬 Audit-verified · 3/4 audits

**Drawers and dialogs are not modal: no scrim, no focus trap, focus isn’t restored; Escape handling is split between App and modal**

* **Where:** src/ui/*; App.tsx:369; ExportModal.tsx:133-146
* **Seen in:** A1 B-30 · A2 UI-08 · A4 UI-18, EX-10
* **Problem:** Keyboard-only users can Tab behind the dialog.
* **Fix:** Use `<dialog>`/inert + focus management.

##### UI-07 — ⚪ Low · 🔬 Audit-verified · 4/4 audits

**State surprises: loading a new song silently resets mute/loop; dropping several files loads only the first; song/track state is mutated in place (`rev` counter workaround); drag overlay flickers on nested dragleave; loading stale analysis briefly**

* **Where:** src/App.tsx:251-259, 285-291, 325, 376-384; player.ts:101-109
* **Seen in:** A1 B-27 · A2 UI-10 · A3 F-098, F-099 · A4 TP-01, TP-02, TP-05
* **Problem:** Users lose practice settings without notice.
* **Fix:** Toast ‘kept/reset’; accept multiple files via a queue; immutable Song updates.

##### UI-08 — ⚪ Low · 🔬 Audit-verified · 3/4 audits

**Empty/loading/error states are thin: harmony panel is blank for Twinkle with no explanation; no loading/cancel while parsing; toasts auto-dismiss with no history; notice bursts replace each other; raw browser error text for failed URL loads**

* **Where:** src/ui/HarmonyPanel.tsx; App.tsx
* **Seen in:** A2 UI-09, TR-12, UX-03, SEC-06 · A3 F-141 · A2 MD-15, UX-04 · A4 UI-13
* **Problem:** Learners read a blank harmony panel as ‘the app is broken’.
* **Fix:** Explain ‘melody-only file: no chords expected’, add skeletons and a notification centre.

##### UI-09 — ⚪ Low · 🔬 Audit-verified · 2/4 audits

**Form-control details: Stepper snaps to min while typing; `window.confirm` for Reset all; `setState` inside a ref callback (SyncPanel); ToggleRow is a clickable div wrapping a switch (nested interactives); sliders announce raw decimals without units; `intList` silently drops invalid tokens**

* **Where:** src/ui/primitives.tsx:51, 227-241; panels.tsx:100, 268-270; SettingsPanel.tsx:276
* **Seen in:** A3 F-092, F-095, F-096, F-102, F-111, F-112 · A4 UI-08, UI-09, UI-11, UI-16, UI-17
* **Problem:** None severe; collectively they feel unpolished and hurt screen-reader use.
* **Fix:** Replace with accessible primitives and inline confirmation.

##### UI-10 — ⚪ Low · 🔬 Audit-verified · 2/4 audits

**Keyboard shortcuts are undocumented in the UI; no `?` overlay, no remapping; a bad `?song=` silently loads Bach; repertoire panel has no search/filter**

* **Where:** src/App.tsx; src/engine/songs.ts; ui/panels.tsx
* **Seen in:** A2 TR-06, TR-11, UX-06 · A3 F-150 · A2 TR-07
* **Problem:** Features are invisible unless users read the README.
* **Fix:** Shortcut sheet, clear error for unknown song ids, search/difficulty filters (P-11, P-13).

##### UI-11 — ⚪ Low · 🔬 Audit-verified · 3/4 audits

**Timeline drag: pointer listeners not cleaned up on unmount/pointercancel; `setPointerCapture` on `e.target`; slider has no Home/End**

* **Where:** src/ui/chrome.tsx:229-239, 315-326
* **Seen in:** A2 TR-05 · A3 F-093, F-094 · A4 UI-04, UI-03
* **Problem:** Rare stuck-drag states.
* **Fix:** Capture on the slider element; add `pointercancel`.

#### Accessibility (`AX`)

##### AX-01 — 🟠 High · 🔬 Audit-verified · 3/4 audits

**The canvas has no accessible name/role/text alternative; chord, key, measure and time are never announced (no live region)**

* **Where:** src/App.tsx:148; ui/chrome.tsx
* **Seen in:** A2 AC-02, AC-03 · A3 F-090 · A4 UI-01
* **Problem:** A screen-reader user gets nothing from the main experience. axe cannot test canvas content; this is from DOM/source inspection (A2).
* **Fix:** `role=img` + label, a polite live region for *stable* chord/key/measure changes, and a textual harmony timeline (P-05).

##### AX-02 — 🟠 High · 🔬 Audit-verified · 2/4 audits

**Frame-step buttons and icon-only navigation have no accessible name**

* **Where:** src/ui/chrome.tsx
* **Seen in:** A2 AC-01, AC-07 · A3 F-097
* **Problem:** Failed axe checks at 1920×1080 and 390×844 (A2).
* **Fix:** `aria-label` on every icon button.

##### AX-03 — 🟡 Medium · 🔬 Audit-verified · 3/4 audits

**Timeline slider lacks `aria-valuetext`, Home/End and a clear keyboard contract; segmented groups have no accessible name; no `<h1>`/skip link**

* **Where:** src/ui/chrome.tsx:315-326; primitives.tsx:51
* **Seen in:** A2 AC-04, SEO-03 · A3 F-094 · A4 UI-02, UI-03, UI-08 · A2 AC-10
* **Problem:** Screen readers announce raw numbers.
* **Fix:** `aria-valuetext='Bar 12, 0:34'`, group labels, an `<h1>`.

##### AX-04 — 🟡 Medium · 🔍 Suspected · 2/4 audits

**Colour support is partial: colour-blind palette present but not contrast-checked; custom UI colours have no contrast guard; secondary text likely below WCAG AA**

* **Where:** src/engine/theme.ts:37-76; src/index.css
* **Seen in:** A2 AC-06 · A4 TP-06, UI-14
* **Problem:** Contrast was never measured numerically by any audit.
* **Fix:** Run an automated contrast check; warn on low-contrast custom themes (V-19).

#### Security and privacy (`SC`)

##### SC-01 — 🟡 Medium · ✅ Confirmed · 4/4 audits

**URL-driven configuration and fetches have no timeout and arbitrary-URL reach (`?settingsUrl`, `?midiUrl`, custom soundfont URL); a stalled server blocks the ‘ready’ signal forever**

* **Where:** src/App.tsx:81-104, 414-430; automation.ts (loadMidiUrl); audio.ts:278, 305
* **Seen in:** A1 B-09 · A2 SEC-02, SEC-06 · A3 F-058 · A4 SEC-01
* **Problem:** A1 confirmed the `isReady` gate depends on those fetches; no `AbortSignal.timeout`. A crafted share-link can make the victim’s browser probe arbitrary URLs.
* **Fix:** `AbortSignal.timeout(8000)`, mark ready with a warning on failure, restrict schemes and document CORS.

##### SC-02 — ⚪ Low · 🔬 Audit-verified · 4/4 audits

**No Content-Security-Policy or Subresource Integrity; the single-file inline build makes a strict CSP awkward**

* **Where:** index.html; vite.config.ts:11
* **Seen in:** A1 B-29 · A2 SEC-01 · A3 F-017 · A4 SEC-02
* **Problem:** Defence-in-depth gap rather than an exploitable bug.
* **Fix:** Baseline CSP with hashed inline script; SRI for CDN assets (P-04).

##### SC-03 — ⚪ Low · 🔬 Audit-verified · 3/4 audits

**No file-size/entry limits on imported MIDI/settings; settings accept HTML-like brand text (rendered as canvas text, no XSS found); global control API and legacy aliases always exposed; `navigator.webdriver` silently switches to automation mode**

* **Where:** src/App.tsx:54, 285-291, 405-409; settings.ts; midi.ts:113-140
* **Seen in:** A2 SEC-03, SEC-04 · A3 F-017 · A4 SEC-03, SEC-05, RP-09
* **Problem:** Resource-exhaustion rather than injection.
* **Fix:** Cap at ~20 MB; clamp lengths; gate the API behind an explicit flag.

##### SC-04 — ℹ️ Info · 🔬 Audit-verified · 3/4 audits

**Positive: `npm audit` reports 0 vulnerabilities (170 deps); settings import is schema-gated and blocks prototype pollution (`__proto__`, `constructor.prototype` tested); parser survived 20,000 mutated/truncated files**

* **Where:** package.json; settings.ts:361-370, 480-494; midi.ts
* **Seen in:** A2 · A3 · A4 SEC-04, SEC-06
* **Problem:** Keep these properties and add them to CI.
* **Fix:** —

#### Platform, PWA, SEO and branding (`PF`)

##### PF-01 — 🟡 Medium · 🔬 Audit-verified · 3/4 audits

**Not installable and not truly offline: no manifest or service worker; the app loads but audio needs a CDN, so offline = silent**

* **Where:** index.html; vite.config.ts; audio.ts
* **Seen in:** A2 SEO-01 · A3 F-126 · A4 RP-06
* **Problem:** README says offline degrades gracefully; true, but there is no PWA and no cached piano.
* **Fix:** Manifest + service worker + cached samples; tiny built-in fallback piano (P-02, A-04).

##### PF-02 — 🟡 Medium · 🔬 Audit-verified · 3/4 audits

**One 865 KB (366 KB gzip) HTML file, of which ~570 KB is base64 MIDI; no skeleton/first-paint state**

* **Where:** dist/index.html; src/engine/songData.ts
* **Seen in:** A2 SEO-04, SEO-05 · A3 F-123, F-129 · A4 RP-04
* **Problem:** Single-file deploy is a real strength, but the bundled repertoire inflates first load and hides content from the bundler.
* **Fix:** Lazy-load pieces as separate assets in non-single-file builds; add a skeleton.

##### PF-03 — ⚪ Low · 🔬 Audit-verified · 3/4 audits

**SEO/social metadata incomplete: no og:image/twitter:image/canonical/manifest/structured data/robots/sitemap**

* **Where:** index.html:14-24
* **Seen in:** A2 SEO-02, SEO-06 · A3 F-121 · A4 RP-05
* **Problem:** Link previews are plain.
* **Fix:** Add a hero snapshot (V-25) and the tags.

##### PF-04 — ⚪ Low · 🔬 Audit-verified · 2/4 audits

**Package/branding hygiene: package name `react-vite-tailwind` and version `0.0.0` are template boilerplate; three identities (package, app, `APP_VERSION`); `@font-face` sources point into `node_modules`**

* **Where:** package.json:2-4; src/index.css
* **Seen in:** A3 F-106, F-125 · A4 RP-03
* **Problem:** Confirmed in `package.json`. Fonts work today only because the bundler inlines them.
* **Fix:** Rename; single source of truth for version.

##### PF-05 — ⚪ Low · 🔍 Suspected · 2/4 audits

**No localisation (English-only strings inline); chord-name conventions are US-only**

* **Where:** src/ui/*; renderer.ts
* **Seen in:** A2 SEO-08 · A4 UI-15
* **Problem:** Limits reach for German (H/B), Nashville numbers, fixed-do users.
* **Fix:** Extract strings; add naming conventions (H-09, P-06).

#### Code quality and process (`CQ`)

##### CQ-01 — 🟠 High · ✅ Confirmed · 3/4 audits

**No tests, no linter, no CI, no `.gitignore`; `npm run build` does not type-check**

* **Where:** package.json (scripts: dev/build/preview only); repo root
* **Seen in:** A2 CQ-01, CQ-02, CQ-03 · A3 F-122 · A4 RP-02 · A2 CQ-15
* **Problem:** Confirmed. The 979-line chord engine has zero regression tests, and the audit harnesses found everything in this report in minutes.
* **Fix:** Vitest (chords/midi/settings/sync), Playwright smoke, CI with `tsc --noEmit`, build, `npm audit` and a size budget (Q-01…Q-03).

##### CQ-02 — 🟡 Medium · ✅ Confirmed · 2/4 audits

**README makes claims the repo doesn’t back: a `.github/workflows/deploy.yml` that doesn’t exist, ‘frame-exact across browsers’, ‘lossless’, ‘identical pixels’, ‘names a chord only when really played’**

* **Where:** README.md:26, 41, plus ExportModal copy
* **Seen in:** A2 CQ-14 · A4 RP-01
* **Problem:** Confirmed against the audited snapshot (no `.github` directory). I could not re-check the live repo (GitHub rate-limited my fetch) — verify with `git ls-files`.
* **Fix:** Add the workflow or edit the README; keep claims testable (Q-04).

##### CQ-03 — 🟡 Medium · 🔍 Suspected · 2/4 audits

**No LICENSE for the application code; attribution of bundled MIDI (piano-midi.de) and CDN piano samples is not surfaced**

* **Where:** repo root; README.md:107-112
* **Seen in:** A2 CQ-04 · A4 SEC-07
* **Problem:** Users cannot legally reuse the code; third-party licence terms need to be shown. Check the exact licence terms of each asset before publishing.
* **Fix:** Choose a licence; add an in-app Credits page.

##### CQ-04 — ⚪ Low · 🔬 Audit-verified · 3/4 audits

**Large single-file modules with intertwined concerns, duplicated colour utilities, scattered undocumented thresholds, dead/misleading code (`void rev`, eslint-disable for a non-existent linter, legacy `clavier-*`/`MidianoAncientAPI` aliases)**

* **Where:** chords.ts 979 · renderer.ts 1902 · settings.ts 685 lines; HarmonyPanel.tsx:108-109; panels.tsx:100
* **Seen in:** A2 CQ-05..CQ-08 · A3 F-057 · A4 UI-17, CH-22
* **Problem:** Maintainability risk that will grow as chord and render features are added.
* **Fix:** Split by concern (key / templates / matcher / merge / roman; layout / keys / notes / fx / post).

##### CQ-05 — ⚪ Low · 🔬 Audit-verified · 3/4 audits

**Shared mutable state: `Song` mutated in place, `DEFAULT_SETTINGS`/`DEFAULT_SYNC` are shared singletons, whole-document JSON clone per settings patch**

* **Where:** src/engine/settings.ts:371-372, 471; player.ts:27-28; App.tsx:376-384
* **Seen in:** A1 B-27 · A3 F-002, F-099 · A4 PL-12, TP-02, RP-13
* **Problem:** Works today; breaks any future memo/undo.
* **Fix:** Immutable updates; structuredClone defaults.

##### CQ-06 — ⚪ Low · 🔬 Audit-verified · 3/4 audits

**Deprecated `escape()/unescape()` used to decode `?settings=`; Python wrapper docs/behaviour mismatch; legacy aliases kept forever**

* **Where:** src/App.tsx:61; automation/fahh_midi.py:165-171
* **Seen in:** A1 B-17 · A3 F-132 · A4 RP-10, RP-11 · A3 F-127
* **Problem:** Works but deprecated.
* **Fix:** `atob` + `TextDecoder`; contract tests for the Python wrapper.

#### Settings (`ST`)

##### ST-01 — ⚪ Low · 🔬 Audit-verified · 2/4 audits

**Applying a theme preset resets every key any preset touches, clobbering manual edits**

* **Where:** src/engine/settings.ts (presets)
* **Seen in:** A2 CQ-09 · A3 F-118
* **Problem:** Users lose custom tweaks when trying a look.
* **Fix:** Apply only the preset’s own keys; add Undo (P-11).

##### ST-02 — ⚪ Low · 🔬 Audit-verified · 3/4 audits

**Import/coercion quirks: out-of-range values clamped silently, integer rounding only for integer steps (odd widths survive), `normalizeColor` drops alpha, array-index paths give confusing rejections, short-form paths incomplete**

* **Where:** src/engine/settings.ts:361-423, 480-494
* **Seen in:** A2 CQ-10, CQ-11 · A3 F-113, F-114, F-115, F-120 · A4 RP-14
* **Problem:** Import report lists unknown keys but not clamped ones.
* **Fix:** Report clamps; preserve alpha; align schema and panel ranges.

##### ST-03 — ⚪ Low · 🔬 Audit-verified · 3/4 audits

**Persistence: no schema migration beyond v1; corrupted localStorage silently resets all preferences; speed and video config persist and surprise on next load**

* **Where:** src/engine/settings.ts:640-685
* **Seen in:** A2 CQ-12 · A3 F-116, F-117 · A4 RP-12
* **Problem:** Upgrades will break saved prefs.
* **Fix:** Versioned migrations; toast on reset.

---

## 4. Chord identifier — deep dive and rebuild plan

> **Your brief:** the chord identifier “is a bit suspicious … probably detects random notes as chords … make this strictly a feature that helps learners, not an unwanted feature.”
> **Short answer:** your instinct was right, the causes are now pinned to specific lines, three of them are fixable with one-line edits (tested below), and a learner-first redesign has been prototyped and measured.

### 4.1 Verdict: strong core, four specific failure modes, one design gap

**What the engine does well** (so we don’t break it):

| Capability | Result | Source |
|---|---|---|
| Root-position triads (maj/min/dim/aug) | 100 % (108/108, 36/36 each) | A3, A4 |
| Dominant 7th, all inversions | 100 % (36/36 → 48/48) | A2, A3, A4 |
| Diminished 7th | 48/48 | A4 |
| Block-chord progressions | Pachelbel 8/8 · I–V–vi–IV 8/8 · I–IV⁶₄–V⁶₅–I 4/4 · Andalusian 4/4 · minor i–iv–V⁷–i 4/4, with correct figured bass | A4 |
| Global key detection (Krumhansl–Schmuckler) | 5/5 pieces correct; 24/24 synthetic contexts correct pitch class | A2, A3 |
| Dyads | never named as triads (0/20,000 two-note trials) | A2, A4 |
| Bach BWV 846 | key 1.00; `C → Dm7/C → G⁷/B → …` with correct numerals; tracks the G modulation | A1, A4 |

**What fails** (each mapped to a register entry and a source line in §4.3):

1. **It names things that are not chords** (scales, clusters, random notes) — CH-01.
2. **It leaks the previous chord forward**, producing phantom slash chords on clean MIDI — CH-02.
3. **It drops or invents notes** — 13th/m11 collapse to 9ths (CH-04), maj7/9th inversions lose the 7th/root (CH-05), sus inversions become 7sus4/9sus4 (CH-06).
4. **It is blind to time** — no pedal (CH-08), no memory for arpeggios (CH-09), no passing-tone notion (CH-10), fixed-seconds windows (CH-11), and wrong Roman-numeral logic (CH-03, KR-01).

**The design gap:** even if every bug were fixed, a learner would still get a bare symbol with an unexplained “94 %”, no alternatives, no *why*, no way to disagree (CH-16, CH-17). That is what turns a detector into a teacher.

### 4.2 What the four audits measured

| Suite | A1 | A2 | A3 | A4 |
|---|---|---|---|---|
| Structured chord cases | 307 assertions | 499 positive + 6 negative (after fixing a harness bug) | 900 generated + 34 hand-written | 1,206 atomic + 288-chord sweeps at 3 sensitivities |
| Fuzz | 30,000 sets of 3–8 pcs | 25,000 sets of 2–6 pcs | 50,000 random + 30,000 chord+noise | 20,000 each for 2–6 notes + all 4,095 pitch-class sets |
| Real pieces | 6 | 6 | 6 | 5 (+ synthetic progressions) |

| Headline | Value | Notes |
|---|---|---|
| Root-position accuracy (24 qualities × 12 roots) | **92 %** balanced (264/288), 96 % detailed | A4 |
| Inversion accuracy | **42 %** overall (336/792); 60 % excluding inherently ambiguous sets | A4. Prototype: 73 % / 83 % |
| Exact intended symbol on A2’s corrected suite | 63.7 % exact; 83.0 % harmonically acceptable; **17.0 % harmful** (12 thirteenths, 12 m11, 48 sus inversions, 12 maj7 inversions, 1 slash) | A2 |
| A3’s 900-case matrix | 49.3 % exact; ≈ 61 % after removing acceptable respellings | A3 (includes ~150 acceptable respellings and ~50 symmetric rotations) |
| 13th chords / m11 | **0 %** at Balanced (0/36–0/52), correct at Detailed | all four |
| Random sets that get a name | **47–50 %** overall | A1 47.3 · A2 49.2 · A3 49.9 · A4 45–75 by size |
| Named sets that **ignore ≥1 sounding pitch class** | 0 % (3 notes) · 49 % (4) · 71 % (5) · 82 % (6) | A4 — the metric a teacher cares about |

My own fuzz (10,000–20,000 trials per size, struck together, two octaves):

| Random notes | Named | (prototype v2) |
|---|---:|---:|
| 3 | 49.0 % | 39.8 % |
| 4 | 78.0 % | 33.8 % |
| 5 | 74.1 % | 20.1 % |
| 6 | 54.7 % | 10.5 % |

The apparent contradiction between audits (“49 % is a false-positive rate” vs “49 % isn’t”) resolves like this: a random pitch-class set often *does* coincide with a legitimate chord or extension, so the label rate overstates pure false positives. The honest framing is: the engine names a chord whenever it can find a template that explains *most* of the sound, and “most” tolerates ignoring a sounding note. For a **teaching** tool, ignoring a sounding note is the unacceptable part.

### 4.3 Failure taxonomy → root cause → fix

All inputs below were re-run by me against the real `chords.ts` (balanced sensitivity).

| # | Failure | Input → engine output | Root cause (line) | Register | One-line fix? |
|--:|---|---|---|---|---|
| 1 | Ghost/extra tolerance names clusters | `C D E` → `Cadd9` (0.94) · `C D E F G` → `Cadd9` · `C D♭ D E♭` → `Cm(add9)` · pooled `C…B C` scale → `Cmaj9` | `matchChord` extra-share/ghost logic, `:424-483` | CH-01 | No — needs cluster gate + explain-every-note rule (v2) |
| 2 | Legato tolerance keeps released notes alive | `C F G C Dm G C` (end == next start) → `C F/C G/F C Dm/C G/D C` | `:710` `n.end + 0.06 > T0` | CH-02 | **Yes** |
| 3 | Tone cap blocks 6-tone templates | `C13` → `C9` · `Cm11` → `Cm9` · `G13` → `G9` | `:773` `maxTones … ? 5 : 4` | CH-04 | **Yes** |
| 4 | 7th/root dropped as “extra” on inversion | `E G B C` → `Em` · `C A C E` → `Am/C` · `E G B♭ C D` → `Eø7` | `:459-480` bass handling | CH-05 | Partly (v2) |
| 5 | Sus templates outrank plain triads | `D G C` → `D7sus4` · `G C F` → `G7sus4` · `D E G C` → `D9sus4` | template priors/tiers | CH-06 | No (v2) |
| 6 | Wrong-direction applied dominant | D7→G → `II⁷` · A7→Dm → `VI⁷` · **C7→G7 → `V⁷/V`** | `:871` `+ 7` | CH-03 | **Yes** |
| 7 | Local key flips on short excerpts | `C → G7` → `IV → I⁷` | `:340-379` 21 s window, 12 s look-ahead | KR-01 | No |
| 8 | No pedal, no memory, no passing-tone notion | Alberti/arpeggios blank; Für Elise first label at 58.59 s | `:710, 801`, `:725-731` | CH-08, CH-09, CH-10 | No (v2 evidence model) |
| 9 | Merge anchored at chord *start* | `C` then `Cadd9` 1.25 s later under D→E melody | `:822` | CH-10 | Partly |
| 10 | No alternatives, explanation, correction, calibrated confidence | everywhere | `:474-482` | CH-16, CH-17 | No (UI + data model) |

### 4.4 The six bundled pieces (real parser, balanced sensitivity — my run)

| Piece | Key | Chords | First chord | What a learner sees |
|---|---|---:|---|---|
| Bach BWV 846 | C major | 160 | 0.41 s `C` | Excellent overall; 90 slash labels, of which 21 disappear with the CH-02 fix; passing sonorities named (CH-24) |
| Für Elise | A minor | 42 | **58.59 s** `C7/A` | First 35 % of the piece is blank — the famous opening has no harmony shown |
| Moonlight I | C♯ minor | 86 | **19.26 s** `C♯m/G♯` | The famous opening triplets are blank (pedalled arpeggio, CH-08/09); local key drifts to E/B minor later (KR-01) |
| Mozart K.545 I | C major | 56 | **8.27 s** `Dm7/F` | Alberti bass blank for the first 8 s; later `Am/C` shown as `ii⁶` (KR-01) |
| Twinkle | C major | **0** | — | Correct (melody-only) but unexplained (UI-08) |
| QA etude | C major | 2 | 2.00 s `Cmaj7/A` | `Cmaj7/A` — A3 reports the figure is a plain A-C-E; the slash disappears with the CH-02 fix (unverified against ground truth) |

### 4.5 Phase 0 — three one-line fixes, proven

Apply to `src/engine/chords.ts`:

```diff
@@ line 710
-    active = active.filter((n) => n.end + 0.06 > T0 && T0 - n.start < 20);
+    active = active.filter((n) => n.end > T0 + 0.001 && T0 - n.start < 20);

@@ line 773
-      maxTones: opts.chordSensitivity === "detailed" ? (arp ? 5 : 7) : arp ? 4 : cl.length >= 3 ? 5 : 4,
+      maxTones: opts.chordSensitivity === "detailed" ? (arp ? 5 : 7) : arp ? 4 : cl.length >= 6 ? 7 : cl.length >= 3 ? 5 : 4,

@@ line 871
-  … && next.cand.root === mod12(r.cand.root + 7)) {
+  … && next.cand.root === mod12(r.cand.root + 5)) {
```

**Measured effect** (original engine → patched):

| Test | Original | Patched |
|---|---|---|
| `C F G C Dm G C`, end == next start | `C F/C G/F C Dm/C G/D C` | **`C F G C Dm G C`** |
| D7→G in C | `II⁷` | **`V⁷/V`** |
| A7→Dm in C | `VI⁷` | **`V⁷/ii`** |
| C7→G7 in C | `V⁷/V` (false) | `I⁷` (no false secondary dominant) |
| `C13` / `Cm11` / `G13` | `C9` / `Cm9` / `G9` | **`C13` / `Cm11` / `G13`** |
| Slash-chord labels, Bach | 90 | 69 (−21) |
| Slash-chord labels, Für Elise / Moonlight / QA etude | 21 / 32 / 1 | 18 / 29 / 0 |
| Mozart K.545, Twinkle | unchanged | unchanged |
| Random 6-note sets named | 54.7 % | 56.6 % (+1.9 pts) |
| Random 7-note sets named | 41.2 % | 45.6 % (+4.4 pts) |

**Caveats, stated plainly:** this is a spot-check on the six bundled pieces, not a regression suite — there is no ground truth here for the first label that changed in Für Elise (`C7/A` → `C7/B♭`, at 58.59 s) or in Moonlight (`C♯m/G♯` → `C♯m`, at 19.26 s) — I have not verified either against the score. Do not ship Phase 0 without the golden corpus in §4.8; but do ship it first, because it removes four of the most embarrassing errors for three lines of diff. The 13th fix adds a few more false names on dense 6–7-note random sets; v2’s hard rule removes that cost.

Fix `MP-01` at the same time (`midi.ts:339`: `Math.max(o.tick + ppq/4, maxTick)` → `Math.min(maxTick, o.tick + ppq)`).

### 4.6 The learner-first prototype (audit A4), tested side by side

A4 built `chord_v2.mjs` (“Chordlens v2”): evidence weights, a cluster gate, a hard rule that every sounding pitch class must be explained, power-chord template, confidence tiers, alternatives, a plain-language *why* and a streaming tracker with hysteresis. I ran it against the current engine on the disputed inputs:

| Case | Current engine | Prototype v2 | Verdict |
|---|---|---|---|
| C major triad | `C` | `C` (0.968) | = |
| `G7/B` | `G7/B` | `G7/B` | = |
| `E G B C` | **`Em`** | **`Cmaj7/E`** | ✔ fixed |
| `C A C E` | `Am/C` | `Am/C` | = (7th still dropped) |
| `E G A C` | `Am7/E` | `Am7/E` + alt `C6/E` | ✔ ambiguity shown |
| `E G B♭ C D` | **`Eø7`** | **`C9/E`** | ✔ fixed |
| `C E G B♭ D A` (C13) | `C9` | **— (nothing)** | ✘ **regression**: shows nothing, where the engine at least said `C9` |
| `C E♭ G B♭ D F` (Cm11) | `Cm9` | **— (nothing)** | ✘ same regression |
| `D G C` | `D7sus4` | `D7sus4` + alts `Gsus4/D`, `Csus2/D` | ✔ alternatives shown |
| `G C F` | `G7sus4` | `G7sus4` + alts `Csus4/G`, `Fsus2/G` | ✔ |
| `D E G C` | `D9sus4` (implies unplayed A) | **`Cadd9/D`** | ✔ fixed |
| `C D E` | **`Cadd9`** | **—** | ✔ fixed (silent) |
| `C D E F G` | **`Cadd9`** | **—** | ✔ |
| pooled scale `C…C` | **`Cmaj9`** | **—** | ✔ |
| `C D♭ D E♭` | **`Cm(add9)`** | **—** | ✔ |
| `C G` / `C G C` | — | `C5` | ✔ power chord named |
| whole-tone set | — | — | = |

**What the prototype proves:** the principles work. False naming of random 5-note sets falls from 74 % to 20 %, 6-note from 55 % to 10.5 %; named-with-ignored-note falls to 0 %; clusters, scales and runs go silent; inversions improve from 42 % to 73 % overall (60 % → 83 % excluding ambiguous).

**What it does not yet do (A4 admits some, I found one more):**

* ✘ **Closed-position 13th and m11 chords return nothing.** Cause: the cluster gate (`≥2 cyclic gaps ≥ 3 semitones`) rejects `C D E G A B♭` (only one gap ≥ 3). The gate must not apply to complete high-tone-count templates (spec in §4.7, step 3).
* ✘ **Alberti-with-melody still fails** (A4: reports only `G5`).
* ✘ **Transient `C5`/`C♯5` appears while an arpeggio is incomplete** — a learner would see a power chord flash before the triad. The tracker must suppress `5` while a triad completion is plausible.
* ✘ **Slow-rolled chords flip to `C/E`** after the bass releases (A4).
* ✘ **Staccato arpeggio ends with `C5/G`** (A4).

So: **adopt v2’s principles, not its code verbatim** — port the gate/explain/alternative logic into the real `matchChord`, fix the five items above, and let the golden corpus (§4.8) arbitrate.

### 4.7 Chord Engine v2 — final specification

*(Synthesised from A1’s scoring, A2’s pipeline, A3’s contract and A4’s measured prototype; where they conflict I took the variant that tested best.)*

**Principles**

1. **A chord is a claim with evidence.** Say nothing when the evidence is weak.
2. **Explain every sounding note** — as a chord tone, or as an explicitly-flagged melody/passing note. Never name a chord that silently ignores a sounding pitch class.
3. **Never imply a note that isn’t sounding** (no `D9sus4` without the A, unless the symbol makes the omission explicit).
4. **Stable beats instant.** Labels must not flicker; hold, then switch with margin.
5. **Teach, don’t just label** — show *why*, show alternatives, let the learner correct it.

**Pipeline**

1. **Evidence, not events.** Each note contributes a weight over time:
   * sounding with the key down: **1.0**
   * held only by the pedal: **≈ 0.7** (needs `sustainEnd` → fixes CH-08)
   * released arpeggio note: **0.8·e^(−Δ/0.45 s)** for ≤ 1.2 s
   * bass pitch class × 1.4; a new bass pc outside the previous harmony resets released-note memory
   * very short notes (< 70 ms) × 0.6 (already in the engine)
2. **Gesture clustering in beats, not seconds:** onset window = `clamp(0.055·120/bpm, 0.025, 0.12)` s; classify as *block*, *rolled* (provisional label after two agreeing chord tones, final at completion) or *broken*.
3. **Gate.** Require ≥ 2 pitch classes. For 3–5 pcs require ≥ 2 cyclic gaps ≥ 3 semitones (kills clusters, whole-tone and chromatic fragments). **For ≥ 6 pcs skip the gap gate** but require a *complete* template of ≥ 5 tones in which the bass is the root or a template tone — this fixes the v2 regression on closed 13th/m11. Exactly two pcs a fifth apart → power chord `5`, *only* if no triad completion is pending.
4. **Candidates.** Templates in two tiers: *Beginner* (maj, min, dim, aug, sus2, sus4, 6, 7, maj7, m7, m7♭5, dim7, add9, power) and *Advanced* (+ m6, m(add9), m(maj7), 7sus4, 9, maj9, m9, 6/9, 7♭9, 7♯9, 11, 13, m11, maj13). Every required tone must be present; an omitted 5th is allowed only in ≥ 4-note chords.
5. **Hard rule.** Reject any reading that leaves a pitch class with weight ≥ 0.5 unexplained, unless it is the top voice ≥ 9 semitones above the bass and struck once (melody exemption — streaming path only).
6. **Score** = `0.50·explainedShare + 0.16·bassFit + 0.14·prior + 0.08·keyFit + 0.08·completeness − 0.02·max(0, tones−4) − 0.10·(bass not a chord tone)`; add A3’s penalty `0.22·impliedButSilentTones`.
7. **Confidence & decision.** `confidence = 0.8·score + min(0.2, 2·margin to runner-up)`. States: `chord` (≥ 0.70 Beginner / ≥ 0.62 Advanced) · `ambiguous` (runner-up within 0.04 with a different root → show both) · `building` (arpeggio pending) · `none(reason)` with reason ∈ {cluster, weak-evidence, tones-not-sounding, too-few-notes}. Show a **band** (clear / likely / ambiguous), never a percentage.
8. **Stability.** A challenger must lead for 3 consecutive evaluations (≈ 120 ms) **or** beat the current label by ≥ 0.15 confidence; hold a label ≥ 0.3–0.4 s; clear after ≥ 8 empty evaluations (≈ 320 ms); keep the old label greyed for ≤ 400 ms rather than blanking between chords (fixes CH-18).
9. **Explain.** `symbol`, `played[]` (filled chips), `expected-but-silent[]` (hollow chips), `inversion`, `function/numeral`, and one sentence: *“Played C E G → root C, major 3rd (E), perfect 5th (G) = C major triad. G is in the bass, so this is second inversion, written C/G.”*
10. **Roman numerals:** fix the applied-dominant direction (`+5`), accept `vii°7/X`, add `borrowed` tags, keep a local key only after ≥ 3 s of divergent evidence plus a cadence (KR-01…KR-05).

**Reference sketch** (TypeScript, DOM-free; A4’s `chord_v2.mjs` is the tested starting point):

```ts
type Ev = { midi: number; w: number };                       // w from step 1
type Cand = { root: number; tpl: Tpl; score: number; explained: number; implied: number[] };

function identify(ev: Ev[], o: { mode: "beginner" | "advanced"; key?: Key; pending?: boolean }): Decision {
  const w = pcWeights(ev), bass = lowestPc(ev), top = highestPc(ev);
  const pcs = [...Array(12).keys()].filter(p => w[p] >= 0.25);
  if (pcs.length < 2) return none("too-few-notes");
  if (pcs.length === 2) return isFifth(pcs) && !o.pending ? chord(power(pcs)) : none("too-few-notes");

  // gate: cluster test for 3–5 pcs; complete-template rule for ≥6 pcs
  const gapsOk = bigGaps(pcs) >= 2;
  if (pcs.length <= 5 && !gapsOk) return none("cluster");

  const cands: Cand[] = [];
  for (const root of pcs) for (const tpl of templatesFor(o.mode)) {
    if (!requiredTonesPresent(tpl, root, w)) continue;                 // omitted 5th only if ≥4 tones
    const unexplained = pcs.filter(p => !inTemplate(tpl, root, p) && !isMelodyNote(p, ev, bass, top));
    if (unexplained.some(p => w[p] >= 0.5)) continue;                  // HARD RULE
    if (pcs.length >= 6 && !(tpl.tones.length >= 5 && bassIsTemplateTone(tpl, root, bass))) continue;
    cands.push({ root, tpl, ...scoreOf(tpl, root, w, bass, o.key) });  // 0.50/0.16/0.14/0.08/0.08 − penalties
  }
  if (!cands.length) return none("weak-evidence");

  cands.sort((a, b) => b.score - a.score);
  const [best, second] = cands;
  const margin = second ? best.score - second.score : 0.3;
  const confidence = clamp(0.8 * best.score + Math.min(0.2, 2 * margin), 0, 1);
  if (confidence < (o.mode === "beginner" ? 0.70 : 0.62)) return none("weak-evidence");
  const alts = cands.filter(c => c !== best && c.score > best.score - 0.08).slice(0, 3);
  return { state: alts.length && alts[0].root !== best.root && margin < 0.04 ? "ambiguous" : "chord",
           chord: render(best, bass, o.key), band: band(confidence), alternatives: alts.map(a => render(a, bass, o.key)),
           why: explain(best, w, bass), played: playedChips(w), silent: expectedButSilent(best, w) };
}

class Tracker {                                         // hysteresis; call every ~40 ms
  update(t: number, ev: Ev[]) {
    const d = identify(ev, this.opts);
    if (d.state === "none") return this.noneFor(++this.noneN) >= 8 ? this.clear() : this.holdGreyed(400 /*ms*/);
    if (!this.cur || sameLabel(d, this.cur)) return this.accept(d);
    if (++this.challengerLead >= 3 || d.confidence - this.cur.confidence >= 0.15) return this.switchTo(d);
    return this.hold();
  }
}
```

### 4.8 Acceptance tests — the golden corpus (commit this first)

Turn the four audits’ harnesses into a CI-enforced corpus. A chord engine is only as good as its test data.

| Corpus | Size | Expectation |
|---|---:|---|
| Generated matrix: 12 roots × 28 qualities × all inversions × {closed, open, doubled} | ≥ 1,500 | exact symbol **or** a member of the case’s `acceptable[]` set (symmetric chords, 6 ↔ m7, sus2 ↔ sus4) |
| Negative set: clusters, chromatic, whole-tone, quartal, dyads, scales, runs, repeated notes, random sets | ≥ 500 | `none` or `ambiguous`; **never** a confident chord; **0 %** named-with-ignored-note |
| Temporal fixtures (A4’s 19 passages): scale/run, arpeggios, staccato, rolled (30/80/150 ms), pedalled, Alberti + melody, melody over held chord, fast changes, repeated chord | ≥ 40 | scale/run → none; arpeggio → one stable label; melody over held C → `C` (not `Cadd9`/`Am/C`) |
| Legato-leak fixtures: same progression with gaps of 0, 10, 30, 70 ms | ≥ 20 | identical labels at all gaps |
| Progressions with known harmony (Pachelbel, I–V–vi–IV, 12-bar blues with shells, ii–V–I with 9ths, Andalusian, authentic cadence with inversions, applied dominants `D7→G`, `A7→Dm`, `C7→F`) | ≥ 15 | exact symbols **and** numerals; `C7→G7` must **not** be `V⁷/V` |
| Real pieces with hand-labelled bars: Bach BWV 846 (the harmony is textbook), then K.545, Für Elise, Moonlight | 4 | ≥ 80 % of hand-labelled bars correct; ≤ 5 % harmful labels; first label ≤ 1 bar after the true first chord |

**Pass criteria** (adapted from A2’s success criteria):

* ≥ 90 % exact on the ≥ 1,500-case matrix; 100 % “acceptable reading or nothing”.
* ≤ 5 % harmful labels on real pieces; **zero** labels on scale/chromatic/passing-tone fixtures.
* **0 %** named sets that ignore a sounding pc (random fuzz, ≥ 10,000 trials per size).
* No flicker: ≤ 4 label changes/s; labels stable across ≥ 95 % of 250 ms windows.
* Label latency ≤ 200 ms after gesture completion.
* A **ratchet**: CI fails if any previously-passing case regresses.

*Ground-truth sources to consider (verify availability and licence before adopting):* hand-label Bach BWV 846 and the K.545 exposition yourself; check whether public annotated corpora (e.g. DCML’s Beethoven and Mozart-sonata Roman-numeral annotations, McGill Billboard for pop) cover your repertoire. No audit used an external labelled corpus (A4 says so explicitly).

### 4.9 Learner-facing design — what the banner, panel and timeline should do

| Element | Behaviour |
|---|---|
| **Banner states** | **Chord** (symbol + band) · **Ambiguous** (`C/E · or Em?`) · **Building…** (`C…` while an arpeggio completes) · **None** (blank or a quiet `· · ·`, never a stale label) |
| **Chips** | **Filled** = actually sounding. **Hollow** = in the chord but not played (e.g. a missing 5th). A silent tone is never filled. |
| **Confidence** | A three-step band (clear / likely / ambiguous), not a percentage. |
| **“Why?” popover** | The one-sentence explanation + the played notes highlighted on the keyboard + a **Play it** (audition) button. |
| **Alternatives** | `Cmaj7/E · also Em` with tap-to-compare; symmetric chords show *“same notes: C+ / E+ / G♯+”*. |
| **Beginner mode** | Triads and 7ths only; no figured bass (`I, IV, V, vi`); slash chords only when the bass is a chord tone; larger type; no confidence bar; hides extensions unless fully struck. |
| **Advanced mode** | Figured bass (`V⁶₅`), applied/borrowed tags, alternatives, omitted/added tones, key and function, raw evidence bars. |
| **Chord timeline** | A strip under the transport: labelled blocks sized by duration, colour = function (T/S/D), a thin confidence band, click to seek; the last 30 s on the HUD; also a real table for screen readers. |
| **Keyboard integration** | When a chord is named, tint exactly its played keys; hollow outline on expected-but-silent keys; beam colour follows the chord. |
| **Correction** | A *“this is wrong”* control stores the correction beside the chord, offers the alternatives, and exports a JSON record (feeds the golden corpus). |
| **Empty state** | Explains why: *“No chords — this file is a single-note melody”* / *“Notes are too sparse to call a chord yet.”* |
| **Live use** | The same function runs on the live sounding set when MIDI input arrives (no look-ahead; label at completion, provisional at two agreeing tones). |
| **Accessibility** | A polite `aria-live` region announcing only *stable* chord changes; a textual timeline; never announce flicker. |
| **Settings** | `Beginner / Advanced`, `show alternatives`, `show why`, sensitivity (strict/balanced/detailed, kept), chord-name convention (H-09). |

**Rollout order that lets you ship value weekly:** (1) Phase 0 one-liners + MP-01 → (2) golden corpus + CI → (3) gate + hard rule + alternatives data model → (4) banner states, chips, “Why?” → (5) evidence memory + pedal → (6) hysteresis tracker → (7) timeline + keyboard tint → (8) live input.

---

## 5. Keyboard and visualizer — deep dive and “best in class” plan

> **Your brief:** the keyboard, its animations, falling notes, effects “is great but … needs a bit more attention … to make it an actual piano visualizer better than all the piano MIDI visualizers on the internet.”
> **Short answer:** the *look* is already competitive; the gaps are **performance headroom, expressiveness (velocity/pedal/repeats made visible), instrument features (input, practice) and phone usability**. Fix them in that order.

### 5.1 What is verified good (don’t touch)

* **Geometry is exact.** 52 white keys span the full width (51 inter-key gaps measured); black keys centre on the boundary with acoustic offsets (C♯ −0.075, D♯ +0.075, F♯ −0.10, G♯ 0, A♯ +0.10); falling notes and keys use the same `kx/kw` arrays so alignment is exact at 1280×720, 1920×1080, 2560×1080 and 390×844; HiDPI at DPR 2 yields an exactly 2× backing store (A1, A2, A4 — real frames).
* **Determinism.** `drawFrame(song, t, settings, size)` is pure; the same frame renders identically live and in export (modulo the hash caveat RV-18 and the layout caveat EX-03).
* **Finish.** Concert-grand details, all adjustable: ivory key grain, brass rail trim, note reflection on the rail, a brass notch on every C and a dot on middle C, and a brand plate on the damper rail. Chord brackets and the banner are in sync with the notes; there is a minimap, a pedal wash and sustain tails; repeated same-pitch notes get a 35 ms visual gap, short notes a minimum height, and long notes clip to the lane.
* **Key press/release timing**: 45 ms eased press with an 18 % instant dip, 110 ms release. Good defaults.
* **Appearance control**: 203 settings, 7 theme presets, a colour-blind-safe palette (the orange `#E69F00` / sky-blue `#56B4E9` Okabe–Ito pair) and monochrome mode, JSON import/export, URL/automation injection — the best in this category as far as the audits could tell.

### 5.2 Measurements — four methods, one shape

| Audit | Method | 10 notes | 500 notes | 5,000 notes | Resolution/DPR effect |
|---|---|---|---|---|---|
| **A1** | `renderFrame` incl. PNG encode; software raster | 127 ms @1080p | 324 ms | 335 ms | 720p 67 → 1080p 136 → 4K 456 ms |
| **A2** | warm `drawFrame`, `toDataURL` stubbed, 1080p | 9.3 ms | 21.1 ms | **46.2 ms** (p95 67.9); **15.6 ms with effects off** | 5,000-note: 720p 12.1 · 1080p 18.8 · 1440p 22.2 · 4K 32.2 ms |
| **A3** | real renderer, **counting stub context** (JS only, no raster) | 1.4 ms | 4.0 ms | 38–52 ms | — (raster excluded) |
| **A4** | forced-flush software raster, 80 frames | 12.6 ms @720p / 21 ms @1080p / **63.7 ms @1080p×2** | 61.6 / 98.1 / 230 ms | 281 / 421 / **822 ms** | DPR 2 ≈ 3× cost |

**Live (rAF) results:** sparse Bach at 1440×900: median 16.7 ms, p95 33.4 ms, max 50 ms (A4); A2 measured 16.78 ms average on Bach but **200.9 ms/frame (≈ 5 fps; 110/110 frames > 25 ms)** on the 5,000-note scene; A1 measured default playback p50 34.8 ms (≈ 29 fps on its VM) and p50 71.4 ms with every effect on.

**How to read this:** every number is software rendering on a shared VM — absolute milliseconds are pessimistic; **no audit had a GPU or a 120 Hz display**. What is consistent across all four: cost is **roughly linear in visible notes**, **~3× at DPR 2**, **effects are ~3× of the cost under load**, and **even the idle keyboard exceeds an 8.3 ms (120 Hz) budget in software raster**. A normal piece like the Bach prelude is fine at 60 Hz; dense MIDI, 4K and 120 Hz are not.

### 5.3 Where the time goes (my reproduction of A3’s op-counter on the real renderer)

| Scene (1920×1080, DPR 2) | JS-only ms/frame | `createLinearGradient` / frame | notes |
|---|---:|---:|---|
| Real Bach prelude | 1.6 | **367** | |
| 10 visible notes | 1.4 | **282** | **the static keyboard/rail/labels alone** |
| 500 visible notes | 4.0 | 1,528 | ≈ 2.5 gradients per extra note |
| 5,000 visible notes | 38.1 | **19,597** (plus 63 k `arcTo`, 11.7 k `save`) | ≈ 3.9 per extra note |

Three conclusions:

1. **77 % of the gradient allocation on a normal piece is the static keyboard** (282 of 367) — redrawn from scratch every frame. At 60 Hz that’s ≈ 17,000 gradient objects/s before a single note is drawn; at 120 Hz double. **Caching the unpressed keyboard (V-01) is the single biggest, safest win.**
2. **Per-note cost is ~3–4 gradients plus a clip and two save/restore** — a sprite or 9-slice texture per colour × width bucket replaces all of it (V-02).
3. **Allocation churn** (A4): ≈ 86–160 KB/frame idle, 148–362 KB/frame with notes → 5–22 MB/s of garbage at 60 fps. The causes are listed in RV-03 (layout arrays, Maps, `measureText`, one path per tail, `Math.sin` hash).

Budget to aim for (A4’s target): **≤ 2 ms JS at 500 notes; ≤ 8 ms total at 120 Hz**; adaptive degradation below 55 fps.

### 5.4 Behaviour audit — what exists, what’s wrong, what to do

| Area | Today | Problem | Fix (IDs) |
|---|---|---|---|
| **Falling-note physics** | Linear fall; default look-ahead 2.4 s (0.5–10 s); bottom edge 1.6 px above the strike line; `y = laneH − ((time − now)/noteFallSeconds)·laneH` | Fixed *seconds*, not beats: 16 beats visible at 240 bpm vs 1.6 at 40 bpm (RV-10); no fixed simulation step; hit tolerance 4 ms live vs half a frame at export (EX-03) | V-10 beat-relative fall; unify tolerance |
| **Hit-line effect** | Contact bar, per-key lit segment, impact flash, 7 sparks, beams, bloom (default on) | Per-note radial gradients and arcs; cost multiplies with density (RV-07) | V-06 particle pool, pre-rendered glow sprites |
| **Key press/release** | 45 ms press (18 % instant dip) → 110 ms release; depth = `p·2.6u·pressDepth` (white), `p·1.4u` (black) | **Depth ignores velocity**; white and black sink by different formulas; overlapping same-pitch notes restart the ramp (RV-11) | V-26 velocity-driven depth with a re-strike pulse |
| **Velocity → visual** | Note dimming `velocityDim 0.16 × (1−vel/127) × 0.5` → **max 8 %**; bloom size scales slightly | Dynamics are almost invisible, and not at all in monochrome (RV-08) | V-08 width/height/edge-glow/key-wash mapping + legend |
| **Sustain pedal** | Wash, “Ped.” chip, tails (≤ 6 s) — tails vanish if the pedal indicator is off | No pedal events drawn; no half-pedal; repedalling invisible (MP-05, RV-21) | V-12 pedal lane + re-pedal markers |
| **Repeated same-pitch notes** | `visEnd` shortened by 35 ms gap; key picks the newest | Fast repeats chopped or overlapping (RV-11); no pulse | V-13 cap + pulse |
| **Very short / long notes** | `minHeight 4 px × u` inflates short notes; long notes clip | Staccato looks like short legato; no taper/end cap | V-13 glyph or taper |
| **Per-hand / per-track colours** | Hand colours, finger, pitch-class, colour-blind, mono | **No per-track colours** (RV-09) | V-11 |
| **Trails** | None | Fast passages hard to read (RV-09) | V-09 |
| **Labels / HUD / banner** | Note labels on full-height notes; HUD title chips; chord banner | Collisions; banner overlaps HUD on narrow canvases (RV-13) | V-14, V-15 |
| **Audio-visual sync** | Visual clock = rAF delta (cap 0.1 s); audio scheduled 0.18 s ahead; manual offset only | No audio-clock anchor, no latency compensation, speed change not re-timed (TP-03…TP-05) | A-01, A-03 |
| **Seek / pause / speed** | Seek stops voices; speed change not rescheduled | Scrub-while-playing hard-stops all voices each move (TP-09) | debounce scrub audio |
| **Loop sections** | Measure-based A–B | Wrap cuts held notes; no drag handles (TP-08) | L-06 |
| **Themes** | 203 settings + presets + JSON | No contrast guard (AX-04); presets clobber manual edits (ST-01) | V-19, V-20 |

### 5.5 Phones and tablets (A2 and A4, both with real screenshots)

| Viewport | Finding |
|---|---|
| **320×568** (DPR 2) | Header actions clipped — **Export unreachable**; transport loses speed and forward-note; stage only **217 px** tall; white key ≈ **6.15 px**, black ≈ 3.7 px (A2) |
| **390×844** (DPR 3) | Header + footer take **36 %** of the screen; hand filter hidden below 1280 px; chord banner collides with the HUD; no key labels (< 10 px keys); canvas backing store is **780×1086** for a 390×543 CSS stage at DPR 3 (the DPR cap at 2 blurs a 3× phone) (A2, A4) |
| **All touch** | 34 px targets (< 44 px); icon-only buttons depend on `title` tooltips that don’t exist on touch; no pinch-zoom/pan; no safe-area handling; no landscape layout |

**Rule of thumb for the keyboard on touch:** don’t render 88 keys at 4 px each. Auto-zoom to **2–4 octaves** centred on the active range (V-17), keep a minimap as navigator, and make the playing surface the zoomed keyboard.

### 5.6 Competitor gap (directional — **all four audits’ competitor tables are desk research from memory, not hands-on testing**)

| Capability | Fahh MIDI today | Typical position of Synthesia / Piano Marvel / Midiano / Neothesia / Pianu | Gap (effort / impact) |
|---|---|---|---|
| Falling notes + 88-key keyboard + themes | **Excellent** | Good | — (lead) |
| Chord names + Roman numerals + key detection | Ambitious; **unreliable today** (§4) | Mostly absent or basic | Fix → **a unique lead** |
| Frame-exact scriptable video export | **Standout** (but silent) | Little or none; some with audio | + audio: L / High |
| Total appearance control (203 settings, import/export) | **Standout** | Moderate | — (lead) |
| Live MIDI keyboard input | **None** | Common | M / High |
| Wait-for-notes practice, scoring | Auto-pause only | Common | M / High |
| Metronome / count-in | None | Common | S / High |
| A–B loop by dragging | By measure number only | Common | S / High |
| Per-hand audio mute / volume | Visual filter only | Common | S / High |
| Sheet-music view | None | Common in the practice-first apps | L / High |
| Mobile / touch usability | Poor | Mobile-first apps exist | M / High |
| Offline / installable | Single file, no PWA | Native apps | M / Med |
| Accessibility | Weak | Weak across the board | M / Med — a cheap differentiator |
| 120 Hz | rAF-bound; idle frame already over budget in software | Varies | V-01…V-03 |

### 5.7 The strategy: how this beats the field

All four audits independently concluded the same thing: **no competitor combines auditable harmony, scriptable frame-exact export and total appearance control.** That is the wedge. To pass the practice-first apps you must also become an instrument. So:

1. **Protect the lead** — make harmony trustworthy (§4), keep export deterministic and add **audio** (A-09), keep appearance control.
2. **Close the instrument gap** — MIDI input + wait mode + scoring + metronome + A–B loop + per-hand audio (L-01…L-08). Without these it will always be “a viewer”.
3. **Make the picture express the performance** — velocity, pedal, repeats, trails, chord-tone highlights (V-08, V-09, V-12, V-13, H-07). This is what makes people *say* it looks better than Synthesia.
4. **Make it fast everywhere** — static-layer cache, sprites, governor, native DPR (V-01…V-04). Smooth on a phone is a feature.
5. **Make it reachable** — mobile layout, accessibility, offline (P-02, P-03, P-05).

### 5.8 Keyboard and animation polish list (specific, tunable starting values)

Values in *italics* are suggested starting points to tune by eye — not measurements.

| # | Change | Detail | Catalogue |
|--:|---|---|---|
| 1 | **Bake the unpressed keyboard** | Offscreen canvas for keys, rail, labels, brand plate, background; key = layout signature + DPR; per frame redraw only pressed keys and their glows | V-01 |
| 2 | **Sprite the notes** | One pre-rendered body per (colour × width bucket), 9-slice scaled; batch all inactive notes of a colour into one path; active notes get the glow layer | V-02 |
| 3 | **Governor** | Measure `dt`; below 55 fps drop in this order: global bloom → dust → sparks → per-note `shadowBlur` → label drawing; show ms/notes/effects in an optional HUD | V-03 |
| 4 | **Native DPR with a pixel budget** | Cap 3; budget *≈ 8 MP*; scale internal resolution 0.75–1.0 adaptively | V-04 |
| 5 | **Velocity-driven key depth** | `depth = base · (0.6 + 0.4·vel/127)`; keep the 45 ms attack, 110 ms release | V-26 |
| 6 | **Velocity-driven note look** | Map vel → width (*±12 %*), height-cap brightness and edge glow; add a legend | V-08 |
| 7 | **Trails** | Cheap version: blend the previous frame at *α 0.12–0.18*; premium: per-note comet tail on active notes | V-09 |
| 8 | **Beat-relative fall speed** | Option ‘beats visible’: `noteFallSeconds = clamp(beats·60/bpm, 0.6, 8)` | V-10 |
| 9 | **Pedal lane** | Slim lane under the notes with down/up edges and re-pedal ticks; half-pedal shade from CC64 value | V-12 |
| 10 | **Repeat pulse** | When the same key re-strikes inside an overlap, pulse the key and cap the previous note instead of replacing state | V-13, V-26 |
| 11 | **Short/long notes** | Staccato glyph (tapered cap) instead of height inflation; fade long notes at the top | V-13 |
| 12 | **Chord-tone tint** | When a chord is named, tint exactly its played keys; hollow outline on expected-but-silent keys | H-07 |
| 13 | **Per-track colours + legend** | Picker per track; ramp by pitch within a track | V-11 |
| 14 | **Label LOD** | Label only when it fits; scale type by key width; stack or hide at density | V-14 |
| 15 | **Responsive HUD** | Compact mode: banner under HUD, wrapping/truncation, safe areas | V-15 |
| 16 | **Interactive minimap** | Drag to seek or select the visible key range | V-16 |
| 17 | **Auto-zoom on touch** | 2–4 octaves default, pinch/drag to pan, ‘whole keyboard’ toggle | V-17 |
| 18 | **Reduced motion / reduce flashes** | Honour `prefers-reduced-motion`; cap flash rate (WCAG 2.3.1) | V-18 |
| 19 | **Real-piano preset** | Black key 0.583 × 0.633 of the white key; clamp black offsets | V-22 |
| 20 | **Loop shading on the lanes** | Tint the A–B region and the measure ribbon on the lanes, not only on the timeline | V-24 |
| 21 | **Optional WebGL/WebGPU compositor** | For 4K/120 Hz; keep the Canvas2D path as the export-parity reference | V-07 |
| 22 | **Hit-line variants & beat pulse** | Line / ellipse / pulse; optional vignette on beat 1 | V-21 |
| 23 | **Reach arcs** | Arc from previous to next note for big leaps | V-23 |
| 24 | **Hero-snapshot mode** | One-click 1200×630 render for thumbnails and `og:image` | V-25 |
| 25 | **Performance bench in CI** | Commit the op-counter; fail the build if gradients/frame at 10 notes exceeds a budget | Q-06 |

---

## 6. Master improvement catalogue

**105 improvements**, deduplicated from ~225 upgrade ideas across the four audits (A1 55 · A2 30 + 60 · A3 54 · A4 56). **Effort:** S ≈ days, M ≈ 1–3 weeks, L ≈ a month or more. **Impact:** High / Med / Low for a learner using the app. The *Seen in* column cites the original idea IDs (e.g. `A2 UP-14`) or the register entry the idea closes. Items marked *verified by me* are backed by my own re-run measurement.

### 6.1 Learning and practice (`L-xx`, 22 items)

| ID | Improvement | Effort | Impact | How to do it | Seen in |
|---|---|:-:|:-:|---|---|
| L-01 | Web MIDI input with live feedback (expected vs played colours, ghost of the learner’s own keys) | M | High | `navigator.requestMIDIAccess()`; device picker + permission-denied state; route live notes into audio, keyboard glow and the chord engine; draw played keys in an ‘input’ colour distinct from expected notes. | A1 P2 · A2 UP-36, TR-01 · A3 L2 · A4 U-01, U-34 |
| L-02 | Wait-for-correct-note practice, per hand, with retry counter | M | High | Freeze at each expected onset; advance only when the right pitch(es) arrive; chord = all notes within a 120 ms window; separate right/left wait. | A1 L1 · A2 UP-01 · A3 L2 · A4 U-01, U-02 |
| L-03 | Accuracy scoring: timing-error histogram, per-hand and per-section stats, streaks | M | High | Store per-pass results locally; show early/late distribution; colour-code measures on the timeline. | A2 UP-06 · A3 L3 · A4 U-03 |
| L-04 | Computer-keyboard piano (two rows, octave shift) and on-screen touch piano | S | Med | Map A–K / W–U to a movable octave; velocity via modifier keys; on touch use the 88-key strip only as a navigator. | A2 UP-37, UP-38 · A4 U-45 |
| L-05 | Metronome and count-in with accented downbeat and visual beat pulse | S | High | WebAudio click scheduled from the same clock; subdivisions; separate volume; flash the HUD beat chip. | A1 L2 · A2 UP-04 · A3 L1 · A4 U-05 |
| L-06 | A–B loop by dragging on the timeline; loop count; auto-advance; loop shading on the lanes | S | High | Replace measure-number steppers with draggable handles; shade the region on the note lanes; pause between repeats optional. | A1 L4, V14 · A2 UP-05 · A3 I1 · A4 U-06 |
| L-07 | Tempo ramp: loop at 50–60 %, +5 % after each clean pass | S | High | Reuse speed control; needs scoring (L-03) or a manual ‘clean pass’ button. | A1 L6 · A3 L5 · A4 U-04 |
| L-08 | Hand-separated rehearsal: per-hand audio mute/volume, ghost the other hand, staged lessons (RH → LH → both) | S | High | Today only the *visual* filter exists; add per-hand gain nodes and a staged-lesson preset. | A1 L3, L5 · A2 UP-02, UP-35 · A3 L4 · A4 U-02, U-07 |
| L-09 | Named section bookmarks and a per-measure difficulty strip (density, hand span, leaps) | S | Med | Compute density/span/leap per measure; paint under the timeline; bookmarks stored locally. | A1 L8 · A3 L10 · A4 U-53 |
| L-10 | Sight-reading / flashcard mode: progressively hide notes or labels, reveal on hover/tap | M | Med | Show only the next beat/measure; optional simple staff. | A1 L9 · A2 UP-07 |
| L-11 | Note-name / solfège / scale-degree callouts that follow the *local* key and spell accidentals correctly; pre-reading of the next notes | S | High | Use key-aware spelling from the harmony engine; show next-3-notes chips. | A2 UP-12 · A3 L6 · A4 U-08 |
| L-12 | Key/scale overlay: tint in-key keys and lanes | S | Med | Use detected key; toggle per local key. | A1 L10 · A4 U-09 |
| L-13 | Fingering editor, published-fingering import, impossible-stretch warnings and ‘why this finger’ | M | Med | Persist overrides per piece; flag spans beyond a configurable hand size. | A1 L13, L14 · A2 UP-11 · A3 L12 · A4 U-11 |
| L-14 | Mistake heatmap and auto-generated drills from practice data | M | Med | Aggregate wrong/late notes per key and measure; propose a loop. | A2 UP-08 |
| L-15 | Practice journal, streaks, spaced repetition, recents/favourites (IndexedDB) | M | Med | Calm progress UI; no accounts; export as JSON. | A2 UP-06, UP-47 · A3 L11 · A4 U-12, U-55 |
| L-16 | Sheet-music (grand staff) follow view | L | High | VexFlow from the parsed score with quantisation; highlight current measure; biggest feature gap vs Piano Marvel/Midiano. | A1 PDF companion · A3 L9 · A4 U-10 |
| L-17 | Ear-training mode: hide notes, show only chord labels, quiz | M | Med | Reuses harmony engine; random chord quizzes. | A4 U-54 |
| L-18 | Performance diff / mistake detection against a reference (DTW) | L | High | Align played MIDI to the file with dynamic time warping; list missed/extra/late notes. | A1 L7 · A3 L8 · A2 UP-39 |
| L-19 | Guide-hands overlay (suggested hand position outline over keys) | L | Med | Animate hand outlines from the fingering solver. | A4 U-56 |
| L-20 | Guided onboarding tour and ‘first lesson’ path (sound → open MIDI → loop → chords → export), adapting to offline/silent audio | S | High | Five steps; detect no-audio and explain. | A2 UP-48 |
| L-21 | Chord trainer: ‘play C major’ with keyboard lighting on success | M | Med | Reuses the live identifier (H-08). | A3 L7 |
| L-22 | Interval / consonance colouring option | S | Low | Colour by interval to the bass or previous note. | A1 L11 |

### 6.2 Harmony and the chord identifier (`H-xx`, 14 items)

| ID | Improvement | Effort | Impact | How to do it | Seen in |
|---|---|:-:|:-:|---|---|
| H-01 | Chord engine v2 (evidence model, gates, confidence tiers) — see §4.7 | L | High | Ship Phase 0 fixes first (three proven one-liners), then evidence/stability layers; keep the old engine behind a flag for A/B comparison. | A1–A4 (all) |
| H-02 | Confidence band + honest ‘no clear chord’ state with a reason | S | High | States: chord / ambiguous / none(reason: cluster, weak-evidence, tones-not-sounding). Never print a percentage. | A1 · A2 IMP-01 · A3 · A4 |
| H-03 | Alternatives (‘also: Am7/E’) and manual correction (‘this is wrong’) with exportable corrections | M | High | Store `alternatives[]`; corrections feed the golden corpus. | A2 UP-10 · A3 · A4 U-15 |
| H-04 | ‘Why this chord?’ plain-language card with played notes highlighted on the keyboard | S | High | Template: “Played C E G → root C, major 3rd (E), perfect 5th (G) = C major. G is in the bass → second inversion, C/G.” | A1 · A2 UP-09 · A3 · A4 U-15 |
| H-05 | Beginner / Advanced harmony modes | S | High | Beginner: triads, 7ths, no figured bass, slash only when bass is a chord tone. Advanced: figured bass, applied/borrowed, alternatives. | A1 · A2 · A3 · A4 U-14 |
| H-06 | Chord timeline strip (clickable, coloured by function T/S/D, confidence band) | M | High | Blocks sized by duration under the transport; click to seek; also a screen-reader table. | A1 · A2 UP-56 · A3 · A4 U-13 |
| H-07 | Highlight chord tones on the keyboard when a chord is named; beam colour follows the chord | M | High | Tint the exact played keys; hollow chips for expected-but-silent tones. | A3 V10, V13 |
| H-08 | Live chord identifier for held keys (needs MIDI input) | M | High | Same engine on the live sounding set; no look-ahead. | A4 U-16 |
| H-09 | Chord-name conventions: US, jazz Δ/−, German H/B, Nashville numbers, fixed/movable-do | S | Med | Formatter layer over `Chord`. | A4 U-18 |
| H-10 | Export chord chart: lead-sheet PDF / MusicXML / MIDI markers (one bar per cell) | M | Med | Include corrections and key changes. | A2 UP-45 · A3 F-101 · A4 U-19 |
| H-11 | ‘Building…’ partial-chord feedback during arpeggios | S | Med | Show provisional `C…` once two chord tones agree. | A2 §4.5 |
| H-12 | Borrowed/mixture tags and complete applied-dominant support (`vii°7/X`) | S | High | After KR-03/CH-03 fixes. | A4 U-17 |
| H-13 | Optional ‘implied harmony’ for melody-only pieces, clearly labelled as a suggestion | M | Med | Twinkle-style files: infer I–IV–V from melody; never present as detected. | A2 CH-14 · A4 CH-03 (disagree: A4 says 0 chords is correct) |
| H-14 | Harmony coverage % and a calibration corpus (Isophonics / McGill Billboard / hand-labelled bundled pieces) | M | High | Report coverage and precision in CI; tune thresholds from data, not feel. | A2 IMP-01 · A4 §2e |

### 6.3 Visual and rendering (`V-xx`, 27 items)

| ID | Improvement | Effort | Impact | How to do it | Seen in |
|---|---|:-:|:-:|---|---|
| V-01 | Static-layer cache: bake keyboard, rail, labels and background; redraw only pressed keys and glows | M | High | Removes ≈282 gradient allocations/frame (77 % of churn on a normal piece). Key the cache by layout signature + DPR. | A2 UP-14 · A3 V5 · verified by me |
| V-02 | Note sprites / atlas (9-slice) per colour × width bucket; batch inactive notes in one path | M | High | Target ≤ 2 ms at 500 notes; kills the per-note gradient storm. | A1 V1 · A2 UP-15 · A3 V3, V4 · A4 U-20 |
| V-03 | Adaptive quality governor + presets (Cinematic / Balanced / Fast / Accessible) + frame-time HUD | M | High | Measure `dt`; drop bloom → dust → sparks → shadows below 55 fps; show ms, notes, active effects. | A2 UP-13, UP-52 · A3 V6 · A4 U-22, U-52 |
| V-04 | Native-DPR rendering (cap 3) with a pixel budget and adaptive resolution (0.75–1.0) | S | Med | Fixes soft phones/4K; report active scale. | A1 B-20 · A2 UP-51 · A4 U-23 |
| V-05 | Layout cache, text-metric cache, integer hash, pooled arrays | S | Med | Cuts 100–360 KB/frame of garbage. | A1 V3 · A3 · A4 |
| V-06 | Particle pool with pre-rendered glow sprites; cap sparks; avoid `shadowBlur` | M | High | Effects are 3× of frame cost under load. | A1 V2 · A2 · A3 |
| V-07 | Optional WebGL/WebGPU lane compositor and OffscreenCanvas worker | L | High | For 4K/120 Hz; keep Canvas2D path for exact export parity. | A1 V4 · A4 U-21 |
| V-08 | Velocity mapping to note width/height/edge glow/key wash, with a legend | S | Med | Replace the 8 % darkening; survives monochrome. | A1 V5 · A2 UP-16 · A3 V7 · A4 U-24 |
| V-09 | Note trails / ghosting (previous-frame blend or per-note comet tail) | S | Med | One `drawImage` of the scratch canvas at α 0.15 as a cheap first version. | A1 V10 · A3 V1 |
| V-10 | Beat-relative fall speed (‘beats visible’) | S | Med | `noteFallSeconds = clamp(beats·60/bpm, 0.6, 8)`. | A3 V2 |
| V-11 | Per-track and per-voice colours with legend; pitch colour ramps | S | Med | Track→colour map persisted per piece. | A1 V6, V7 · A2 UP-17 · A4 U-27 |
| V-12 | Pedal lane with down/up events and re-pedal markers; damper animation; half-pedal intensity | S | High | Slim lane under the notes synchronised to sustain tails. | A2 UP-21 · A3 V11 · A4 U-25 |
| V-13 | Repeated-note articulation and short/long note rules (cap + pulse; taper; explicit end caps) | S | Med | Test 10 ms and 20 s notes. | A1 V10 · A2 UP-18, UP-19 · A4 U-26 |
| V-14 | Label collision + LOD; key-label size scaled to key width | M | Med | Place labels only when they fit. | A2 UP-20 · A3 V14 |
| V-15 | Responsive HUD/banner (stack, wrap, truncate, safe-areas) | S | High | Compact mode on phones. | A2 UP-26 · A4 U-31 |
| V-16 | Interactive minimap (click/drag to seek; select visible keyboard range) | S | Med | Shows density and current range. | A2 UP-24 |
| V-17 | Pinch-zoom/pan keyboard; auto-zoom to 2–4 octaves on phones; follow-the-music camera | M | High | Coarse-pointer default; ‘whole keyboard’ toggle. | A2 UP-23, UP-25 · A4 U-32 |
| V-18 | Reduced-motion and reduce-flash modes honoured by the canvas | S | High | Read `prefers-reduced-motion`; cap flash rate (WCAG 2.3.1). | A2 UP-28 · A4 U-33 |
| V-19 | Colour-blind verification + pattern/outline cues + high-contrast theme | S | Med | Simulate deutan/protan/tritan on the palette and warn. | A2 UP-27, UP-29 · A4 U-28 |
| V-20 | More lane themes (paper, sepia, OLED) independent of UI theme; gallery with live thumbnails | S | Med | Preset thumbnails generated with `renderFrame`. | A1 V12 · A4 U-30 |
| V-21 | Hit-line variants, beat-pulse vignette, hand depth separation, arpeggio-roll connectors | S | Low | Optional polish. | A1 V8, V13 · A3 V9, V12 |
| V-22 | ‘Real piano proportions’ preset (black key 0.583 × 0.633) and offset overlap fix | S | Low | See RV register entry. | A4 RN-08 · A3 F-082 |
| V-23 | Hand-motion / reach arcs for big leaps | M | Med | Arc from previous to next note. | A2 UP-22 |
| V-24 | Measure-number ribbon and loop-region shading on lanes | S | Med | Moves text out of the lane. | A1 V14 · A3 V15 |
| V-25 | Static hero-snapshot mode for thumbnails and og:image | S | Med | Use `renderFrame` at 1200×630. | A3 V18 |
| V-26 | Key-press physics refinements (velocity-driven depth, matched white/black sink formulas, re-strike pulse) | S | Med | Fixes flicker on overlapping same-pitch notes. | A3 F-066, F-087 · A4 RN-09 |
| V-27 | Pressed-key ‘ghost’ for the learner’s own keys (input colour vs expected) | S | High | Needs MIDI input. | A4 U-34 |

### 6.4 Audio (`A-xx`, 12 items)

| ID | Improvement | Effort | Impact | How to do it | Seen in |
|---|---|:-:|:-:|---|---|
| A-01 | Audio-clock-anchored transport (AudioContext as master; re-anchor on seek/speed/loop) | M | High | Removes drift and the 0.18 s re-time issue. | A2 AU-02 · A4 U-35 |
| A-02 | Wait-for-samples gate with a ‘Piano loading… n/30’ state and retries | S | High | First notes are silent today. | A2 AU-01 · A4 AU-02 |
| A-03 | Latency calibration wizard + automatic `outputLatency` compensation | M | High | Tap along to a click; store per device (audio and MIDI input). | A2 UP-31 · A3 A2 · A4 U-35 |
| A-04 | Offline fallback piano + service-worker sample cache | M | High | One-octave samples or a tiny synth so first play is never silent. | A2 UP-34 · A3 A1 |
| A-05 | Self-hosted, hashed, compressed samples with velocity layers | M | Med | Removes the CDN risk (AU register). | A4 U-36 |
| A-06 | Click-free voice management: priority stealing, crossfade, polyphony meter, half-pedal | M | Med | Replace oldest-first eviction. | A2 UP-32, UP-33 · A3 A3 · A4 U-37 |
| A-07 | Per-hand/voice volume and pan; per-key stereo spread | S | Med | Practice one hand louder. | A1 A1 · A2 UP-35 |
| A-08 | Pitch-preserving slow-down (time-stretch) or sample-accurate re-time on speed change | M | High | `playbackRate` shifts pitch; use a worklet for stretch. | A2 UP-03 |
| A-09 | Audio export (WAV/AAC/Opus) via OfflineAudioContext, muxed into the MP4 | L | High | The #1 export gap. | A1 A5 · A2 UP-40 · A3 A5 · A4 U-39 |
| A-10 | Persistent audio-state chip (‘Silent: offline / muted / loading’) with a recovery action | S | High | Makes silent playback self-explanatory. | A2 UX-01 |
| A-11 | Real reverb IRs, compressor threshold setting, master EQ presets | M | Low | Replace synthesised noise IR. | A1 A3, A4 · A3 A6 |
| A-12 | MIDI output to hardware synth / DAW | S | Low | Web MIDI out. | A4 U-38 |

### 6.5 Platform and product (`P-xx`, 15 items)

| ID | Improvement | Effort | Impact | How to do it | Seen in |
|---|---|:-:|:-:|---|---|
| P-01 | Web Worker for MIDI parse + harmony with progress, size limit and cancel | M | High | Removes the 70–370 ms freezes. | A2 · A3 P1 · A4 U-47 |
| P-02 | PWA: manifest, service worker, install prompt, cached app + samples | M | High | Pair with the fallback piano. | A1 P1 · A2 · A3 P2 · A4 U-43 |
| P-03 | Mobile-first layout: two-row header, bottom-sheet transport/drawers, 44 px targets, safe areas, landscape practice layout | M | High | Fixes UI-01…UI-04. | A2 UP-59 · A3 P4 · A4 U-44 |
| P-04 | CSP + https-only fetch policy, timeouts and size limits | S | Med | See SC entries. | A1 P3 · A3 P3 |
| P-05 | Accessibility pass: canvas label, live region for stable chords/measure/key, slider semantics, focus traps, skip link/h1, textual harmony timeline; test with axe + a screen reader | M | High | See AX entries. | A1 · A2 IMP-07 · A4 U-48 |
| P-06 | Localisation framework and note-name conventions | M | Low | Strings are already inline. | A1 P5 · A3 P7 · A4 U-49 |
| P-07 | Shareable lesson links (piece hash + range + tempo + hands + settings), never uploading MIDI | M | Med | URL or small file with size warning. | A1 I10 · A2 UP-46 · A4 U-46 |
| P-08 | Session persistence: last piece, position per piece, loop and practice settings, recents | S | Med | Local only. | A2 UP-47 · A4 U-12 |
| P-09 | Pre-load MIDI import report (notes, dropped notes, tempo map, key signature, track→hand map, pedal events) | S | High | Also catches stuck notes (MP-01). | A2 UP-60 · A4 U-51 |
| P-10 | ‘Copy diagnostics’ bundle (browser, DPR, frame timing, audio state, settings hash, parse warnings) | S | Med | No personal data. | A2 UP-49 |
| P-11 | Full-screen + wake lock, shortcut overlay (`?`) and remapping, command palette over 203 settings, undo/redo for settings | S | Med | The patch system already computes diffs. | A1 I8, I9 · A3 I4, I5, I6, I10 |
| P-12 | Opt-in crash reporting hook and source maps | S | Low | Analytics-free. | A1 P7 · A3 P8 |
| P-13 | Repertoire search/filter (composer, difficulty) and more beginner pieces (I–IV–V–I, scales, Alberti) | S | Med | Also gives the chord engine more labelled test material. | A2 UX-06 |
| P-14 | Error / empty / loading design system (skeletons, no-chord state, offline state, notification centre) | M | High | See UI register. | A3 P6 |
| P-15 | WebHID / USB pedal support | M | Low | Foot pedals for hands-free page turns. | A1 P6 |

### 6.6 Export (`E-xx`, 8 items)

| ID | Improvement | Effort | Impact | How to do it | Seen in |
|---|---|:-:|:-:|---|---|
| E-01 | Streaming / resumable export straight to disk (OPFS / File System Access) | M | High | Never buffer multi-GB renders in memory. | A2 UP-41 |
| E-02 | Export presets (YouTube 1080p60, Shorts 9:16, 4K) with safe-area guides and a preview frame at export size | S | High | Fixes the ‘identical pixels’ confusion. | A2 UP-30 · A4 U-40 |
| E-03 | Export range and overlay options (measure range, include HUD/banner, credits card) | S | Med |  | A2 UP-42 |
| E-04 | Render export frames in a Worker (OffscreenCanvas) | L | High | UI and encoder stop competing. | A2 UP-55 · A4 U-42 |
| E-05 | PNG sequence / transparent / green-screen / key-only export; poster frame | M | Med | For editors. | A2 UP-43 · A4 U-41 |
| E-06 | Honest quality names + a true lossless path (PNG sequence / WebM VP9 lossless + ffmpeg helper) | S | Med | See EX register. | A1 · A2 · A3 · A4 |
| E-07 | Export preflight (codec support, memory estimate, duration, *measured* size) | S | Med |  | A2 EX-09 |
| E-08 | Deterministic golden-frame tests across 320 / 1080 / 4K | M | High | Locks the ‘frame-exact’ claim. | A2 UP-44 |

### 6.7 Quality and process (`Q-xx`, 7 items)

| ID | Improvement | Effort | Impact | How to do it | Seen in |
|---|---|:-:|:-:|---|---|
| Q-01 | Vitest unit tests + a 500-case golden chord corpus (this report’s harnesses are ready to commit) | M | High | See §4.8 and Appendix A. | A1–A4 |
| Q-02 | Playwright smoke tests (load, play, seek, export, a11y) and render snapshots | M | High |  | A2 IMP-10 · A4 U-50 |
| Q-03 | CI: typecheck, build, `npm audit`, size budget, tests; deploy workflow as README claims | S | High |  | A1 · A2 · A3 P5 · A4 |
| Q-04 | Correct README claims; add LICENSE and an in-app credits page | S | Med |  | A2 CQ-04, CQ-14 · A4 RP-01, SEC-07 |
| Q-05 | Split large modules, name magic numbers, remove dead code | M | Low |  | A2 CQ-05..08 |
| Q-06 | Commit the render benchmark and gradient-count budget as a CI check | S | Med | `renderbench.mjs` reproduced in this audit. | A3 §6.1 · verified by me |
| Q-07 | Settings schema versioning and migrations | S | Low |  | A2 CQ-12 · A4 RP-12 |

---

## 7. Prioritised roadmap

Ordering principles: **(1)** remove wrong information before adding features; **(2)** put tests under the engine *before* rebuilding it; **(3)** make the cheap, proven fixes first; **(4)** build the instrument features only after the harmony and the frame budget are trustworthy.

### 7.1 NOW — weeks 1–2 (stop the bleeding)

| Order | Work | Register / catalogue | Effort | Exit check |
|--:|---|---|---|---|
| 1 | **Chord Phase 0**: legato tolerance, applied-dominant direction, tone cap (3 lines, §4.5) + `Math.min` for dangling notes | CH-02, CH-03, CH-04, MP-01 | ½ day | `C F G C Dm G C` identical at 0/10/30/70 ms gaps; D7→G = `V⁷/V`; C13 = `C13` |
| 2 | **Golden corpus v0 + Vitest + CI** (typecheck, build, tests, `npm audit`); commit the four audits’ harnesses | CQ-01, Q-01, Q-03 | 2–3 days | CI green; ratchet file committed |
| 3 | **Truth in README**: add the deploy workflow or delete the claim; reword “lossless”, “identical pixels”, “frame-exact across browsers” | CQ-02, EX-02, EX-03 | 1 hour | README claims are each backed by a test or removed |
| 4 | **Transport bugs**: `e.repeat` guard on Space; note-stepping by index; dispose the Player | TP-01, TP-02, TP-07 | 1 day | Stepping walks a real, non-frame-aligned MIDI file; held Space doesn’t flicker |
| 5 | **First-run audio**: gate Play on sample readiness (“Piano loading… n/30”), retry failed samples, add a ‘Silent: offline/muted’ chip | AU-01, AU-02, A-02, A-10 | 1–2 days | First notes always audible or the reason is shown |
| 6 | **Export inputs & dialog**: draft-string number fields; inert background + focus trap | EX-04, EX-08, UI-06 | 1 day | Typing `2560` yields `2560` |
| 7 | **Phone survival**: two-row header / overflow menu so Export is reachable at 320 px; 44 px targets; DPR cap 3 | UI-01, UI-03, RV-05 | 1–2 days | Every control reachable at 320×568 |
| 8 | **A11y quick pass**: `aria-label` on icon buttons, `role="img"` + label on canvas, slider `aria-valuetext`, `<h1>`, skip link | AX-01…AX-03 | 1 day | axe: 0 serious issues at 1920×1080 and 390×844 |
| 9 | **Safety net**: `AbortSignal.timeout` on URL fetches; file-size cap | SC-01, SC-03 | ½ day | A stalled URL no longer blocks ‘ready’ |

### 7.2 NEXT — weeks 3–8 (make it trustworthy, fast and usable)

| Stream | Work | Items | Depends on |
|---|---|---|---|
| **Harmony v2** | Cluster gate + hard “explain every note” rule (with the ≥ 6-pc exception), alternatives data model, banner states + chips + “Why?”, Beginner/Advanced | CH-01, 05, 06, 07, 14, 16, 17 · H-01…H-05 | golden corpus |
| | Evidence memory + pedal (`sustainEnd`) + beat-relative windows + hysteresis tracker | CH-08…CH-12, CH-18, CH-19 | v2 core |
| | Key/numeral fixes: local-key gating, minor-key degrees, `vii°7/X`, borrowed tags | KR-01…KR-05 | corpus |
| **Performance** | Static-layer cache → sprites → particle pool → governor + HUD → layout/text caches | V-01, V-02, V-06, V-03, V-05, RV-01…RV-07 | — |
| | Parse + harmony in a Web Worker with progress, size limit, import report | MP-11, P-01, P-09 | — |
| **Instrument** | Web MIDI input; computer-keyboard piano; metronome/count-in; drag-to-loop A–B; tempo ramp; per-hand audio | L-01, L-04…L-08 | worker (optional) |
| **Expressiveness** | Velocity mapping, trails, pedal lane, repeat pulse, chord-tone tint, label LOD | V-08, V-09, V-12, V-13, H-07, V-14 | static cache |
| **Mobile & a11y** | Auto-zoom keyboard (2–4 octaves), bottom-sheet drawers, safe areas, reduced-motion/flash modes, full focus management, live region | P-03, V-17, V-15, V-18, P-05 | — |
| **Quality** | Playwright smoke + render snapshots; perf-bench budget in CI; settings migrations | Q-02, Q-06, Q-07 | CI |

### 7.3 LATER — quarter+ (differentiate)

| Work | Items | Notes |
|---|---|---|
| Wait-for-note practice, scoring, mistake heatmap, practice journal | L-02, L-03, L-14, L-15 | needs live input |
| Sheet-music (grand-staff) follow view | L-16 | biggest single feature gap vs practice-first apps |
| Audio in exported MP4; streaming/resumable export; export in a Worker; PNG sequence/transparent | A-09, E-01, E-04, E-05 | |
| Audio-clock-anchored transport, latency calibration, self-hosted sampled piano with velocity layers | A-01, A-03, A-05, A-06, A-08 | |
| PWA, offline fallback piano, install prompt | P-02, A-04 | |
| WebGL/WebGPU compositor | V-07 | keep Canvas2D as the export-parity reference |
| Performance diff vs a reference recording (DTW); ear-training; guide hands | L-18, L-17, L-19 | |
| Localisation, chord-name conventions | P-06, H-09 | |
| Modular split of `chords.ts` / `renderer.ts` / `settings.ts` | CQ-04 | do after the corpus exists |

### 7.4 Milestones and exit criteria

| Milestone | Target | You can claim… |
|---|---|---|
| **M0 — “Honest labels”** | end of week 2 | Phase 0 shipped; corpus + CI live; no phantom slash chords at any gap; no false `V⁷/V` |
| **M1 — “Trustworthy harmony”** | week 6 | 0 % named-with-ignored-note on fuzz; ≥ 90 % on the matrix; scales/clusters silent; alternatives + “Why?” visible; Beginner/Advanced |
| **M2 — “Smooth everywhere”** | week 8 | ≤ 2 ms JS at 500 notes in the op-counter bench; 60 fps on a mid-range phone with Balanced preset; governor active |
| **M3 — “An instrument”** | week 12 | Live MIDI + computer keyboard; metronome; drag A–B loop; per-hand audio; wait mode in beta |
| **M4 — “Ship-quality export”** | quarter | MP4 with audio; streaming export; golden-frame tests |

### 7.5 Dependencies in one picture

```
Golden corpus ─► Chord v2 ─► Chord timeline / chord-tone tint ─► Live chord identifier
        │                              ▲
        └─► CI ─► perf bench ─► Static cache ─► Sprites ─► Governor ─► (WebGL, optional)
Web MIDI input ─► Wait-for-note ─► Scoring ─► Tempo ramp / heatmap / journal
Audio gate ─► Audio-clock transport ─► Latency calibration ─► Audio export
Mobile layout ─► Auto-zoom keyboard ─► Touch piano
```

---

## 8. Appendices

### 8.1 Appendix A — Reproduce my verification

Everything in this report tagged ✅ can be re-run with Node and the repo’s own source. I used `esbuild` to bundle the TypeScript engine files into ES modules and ran them in plain Node (no browser).

```bash
# from the root of the repo snapshot
npm i -D esbuild
for f in chords midi songs settings renderer songData; do
  npx esbuild src/engine/$f.ts --bundle --format=esm --platform=node --outfile=verify/$f.mjs
done
```

**A.1 — Legato leak (CH-02).** Expected `C F G C Dm G C`; the unpatched engine prints `C F/C G/F C Dm/C G/D C` for gaps of 0 and 30 ms, and the correct result at 70 ms.

```js
import * as C from './verify/chords.mjs';
function run(list, gap) {
  const notes = [];
  for (const [ms, t, d] of list) for (const m of ms)
    notes.push({ midi: m, key: m - 21, start: t, end: t + d - gap, visEnd: t + d - gap, vel: 90, hand: m < 60 ? 'L' : 'R' });
  return C.analyseHarmony(notes, null, {});
}
const prog = [[[48,52,55],0,2],[[53,57,60],2,2],[[55,59,62],4,2],[[48,52,55],6,2],[[50,53,57],8,2],[[55,59,62],10,2],[[48,52,55],12,2]];
for (const gap of [0, 0.03, 0.07]) console.log(gap * 1000 + ' ms', run(prog, gap).chords.map(c => c.symbol).join(' '));
```

**A.2 — Applied dominants and the key-follower flip (CH-03, KR-01).** Build block chords with 0.1 s gaps so CH-02 does not interfere.

```js
const C3 = [48,52,55], F3 = [53,57,60], Dm = [50,53,57];
const rn = list => run(list, 0.1).chords.map(c => `${c.symbol}[${c.roman}]`).join('  ');
console.log(rn([[C3,0,2],[F3,2,2],[C3,4,2],[[50,54,57,60],6,2],[[43,47,50],8,2],[C3,10,3]]));   // D7 -> G
console.log(rn([[C3,0,2],[F3,2,2],[C3,4,2],[[48,52,55,58],6,2],[[43,47,50,53],8,2],[C3,10,3]])); // C7 -> G7
console.log(run([[C3,0,2],[[43,47,50,53],2,2]], 0.1).key.name);                                  // short C -> G7: key flips to G major
```

**A.3 — Disputed single chords** (use `C.identifyChord(midiArray)`): `[52,55,59,60]` → `Em`; `[48,52,55,58,62,69]` → `C9`; `[48,51,55,58,62,65]` → `Cm9`; `[60,62,64]` → `Cadd9`; `[60,61,62,63]` → `Cm(add9)`; `[47,50,53,55]` → `G7/B` (not `B°`); `[50,55,60]` → `D7sus4`; `[52,55,58,60,62]` → `Eø7`.

**A.4 — Fuzz** (named rate by set size): draw `k` distinct random MIDI notes in a two-octave range 10,000–20,000 times and count non-null `identifyChord`. I got 49.0 / 78.0 / 74.1 / 54.7 % for k = 3 / 4 / 5 / 6 (original) and 39.8 / 33.8 / 20.1 / 10.5 % for audit A4’s prototype.

**A.5 — Real pieces:** `import * as S from './verify/songs.mjs'; S.loadBuiltIn(id)` for `S.BUILT_IN_IDS` → `{notes, chords, key, duration}`. First-chord times: Für Elise 58.59 s, Moonlight 19.26 s, K.545 8.27 s, Twinkle none.

**A.6 — Render op-counter:** audit A3’s `renderbench.mjs` (in its zip under `public/files/tests/`) runs the real `drawFrame` against a counting stub context. Bundle `renderer`, `midi`, `songData` and `settings` next to it and run `node renderbench.mjs`. Reproduced: 367 gradients on Bach, 282 at 10 notes, 19,597 at 5,000 notes.

**A.7 — Direct source reads** behind other ✅ tags: `player.ts:226-247` (stepNote), `App.tsx:342-351` (Space, no `e.repeat`), `midi.ts:339` (`Math.max`), `ExportModal.tsx:176-194` (clamp per keystroke), `App.tsx:134` (DPR cap), `src/` (no `matchMedia`, no `requestMIDIAccess`, `whenReady` only used by automation), `package.json` (no test/lint scripts, no `tsc` in `build`), repo root (no `.github`).

### 8.2 Appendix B — Traceability index

Source audit ID → master register ID. Use it to jump from any original finding into this report. 98.6 % (494 of 501) of the 501 source findings map to a register entry; the rest are listed below with the reason.

**A1 (`B-xx`)** — B-01→MP-01 · B-02→CH-04 · B-03→CH-01 · B-04→CH-10 · B-05→CH-03/KR-01 · B-06→CH-08 · B-07→CH-09 · B-08→EX-02 · B-09→SC-01 · B-10→TP-07 · B-11→CH-20 · B-12→RV-04 · B-13→CH-22 · B-14→RV-21 · B-15→AU-08 · B-16→TP-03/TP-10 · B-17→CQ-06 · B-18→RV-17 · B-19→RV-18 · B-20→RV-05 · B-21→EX-06 · B-22→MP-04 · B-23→MP-03 · B-24→TP-11 · B-25→AU-10 · B-26→AU-08 · B-27→UI-07/CQ-05 · B-29→SC-02 · B-30→UI-06 · B-31→EX-10 · B-32→RV-21

**A2** — AC-01→AX-02 · AC-02→AX-01 · AC-03→AX-01 · AC-04→AX-03 · AC-05→RV-20 · AC-06→AX-04 · AC-07→UI-02/AX-02 · AC-08→RV-15 · AC-09→RV-20 · AC-10→AX-03 · AC-11→EX-08 · AC-12→UI-02 · AU-01→AU-01 · AU-02→TP-03 · AU-03→TP-05 · AU-04→TP-08 · AU-05→AU-03 · AU-06→AU-04 · AU-07→AU-05 · AU-08→AU-06 · AU-09→AU-08 · AU-10→AU-08 · AU-11→AU-09 · AU-12→AU-08 · CH-01→CH-01 · CH-02→CH-10 · CH-03→CH-04 · CH-04→CH-04 · CH-05→CH-05 · CH-06→CH-07 · CH-07→CH-06 · CH-08→CH-14 · CH-09→CH-15 · CH-10→CH-11 · CH-11→CH-11 · CH-12→CH-09 · CH-13→CH-08 · CH-14→CH-09 · CH-15→CH-09 · CH-16→CH-24 · CH-17→CH-16 · CH-18→CH-17 · CH-19→CH-16 · CH-20→CH-17 · CH-21→CH-12 · CH-22→CH-10 · CH-23→CH-21 · CH-24→CH-21 · CH-25→CH-22 · CH-26→CH-17 · CH-27→CH-01 · CQ-01→CQ-01 · CQ-02→CQ-01 · CQ-03→CQ-01 · CQ-04→CQ-03 · CQ-05→CQ-04 · CQ-06→CQ-04 · CQ-07→CQ-04 · CQ-08→CQ-04 · CQ-09→ST-01 · CQ-10→ST-02 · CQ-11→ST-02 · CQ-12→ST-03 · CQ-13→TP-07 · CQ-14→CQ-02 · CQ-15→CQ-01 · CQ-16→RV-17 · EX-01→EX-05 · EX-02→EX-03 · EX-03→EX-02 · EX-04→EX-02 · EX-05→EX-01 · EX-06→EX-09 · EX-07→EX-06 · EX-08→EX-10 · EX-09→EX-10 · EX-10→EX-08 · EX-11→EX-10 · KV-01→KR-02 · KV-02→KR-01 · KV-03→CH-03/KR-03 · KV-04→KR-04 · KV-05→KR-01 · KV-06→KR-05 · KV-07→KR-07 · KV-08→KR-06 · KV-09→CH-21 · KV-10→KR-08 · MD-01→MP-04 · MD-02→MP-06 · MD-03→MP-05 · MD-04→MP-05 · MD-05→MP-04 · MD-06→MP-02 · MD-07→MP-09 · MD-08→MP-06 · MD-09→MP-03 · MD-10→MP-07 · MD-11→MP-08 · MD-12→MP-08 · MD-13→MP-11 · MD-14→MP-01 · MD-15→UI-08 · RN-01→RV-01/RV-06 · RN-02→RV-01 · RN-03→RV-02 · RN-04→RV-03 · RN-05→RV-04 · RN-06→RV-05 · RN-07→RV-14 · RN-08→RV-13 · RN-09→EX-03 · RN-10→RV-17 · RN-11→RV-04 · RN-12→RV-17 · RN-13→RV-12 · RN-14→RV-05 · RN-15→TP-03 · RN-16→RV-15 · RN-17→RV-13 · RN-18→RV-03/RV-07 · RN-19→RV-16 · RN-20→RV-13 · SEC-01→AU-02/SC-02 · SEC-02→SC-01 · SEC-03→SC-03 · SEC-04→SC-03 · SEC-06→UI-08/SC-01 · SEC-07→AU-02 · SEO-01→PF-01 · SEO-02→PF-03 · SEO-03→AX-03 · SEO-04→PF-02 · SEO-05→PF-02 · SEO-06→PF-03 · SEO-07→RV-19 · SEO-08→PF-05 · SEO-09→RV-18 · TR-01→TP-06 · TR-02→TP-06 · TR-03→TP-08 · TR-04→TP-08 · TR-05→UI-11 · TR-06→UI-10 · TR-07→UI-10 · TR-08→TP-10 · TR-09→TP-10 · TR-11→UI-10 · TR-12→MP-11/UI-08 · UI-01→UI-01 · UI-02→UI-01 · UI-03→UI-03 · UI-04→UI-01 · UI-05→RV-13 · UI-06→RV-14 · UI-07→UI-04 · UI-08→UI-06 · UI-09→UI-08 · UI-10→UI-07 · UI-11→UI-02 · UI-12→UI-05 · UX-01→AU-01 · UX-02→EX-11 · UX-03→UI-08 · UX-04→UI-08 · UX-05→RV-13 · UX-06→UI-10

**A3 (`F-xxx`)** — F-001→TP-07 · F-002→TP-11/CQ-05 · F-003→MP-11 · F-004→MP-11 · F-005→CH-04 · F-006→CH-06 · F-007→CH-05 · F-008→CH-01 · F-009→CH-02 · F-010→CH-13 · F-011→RV-01 · F-012→RV-01 · F-013→CH-21 · F-014→KR-08 · F-015→KR-02 · F-017→CH-12/CH-18/SC-02/SC-03 · F-018→CH-18 · F-019→KR-01 · F-020→CH-23 · F-021→MP-11 · F-022→CH-22 · F-023→MP-09 · F-024→MP-09 · F-025→MP-09 · F-026→MP-03 · F-027→MP-12 · F-028→MP-12 · F-029→MP-08 · F-030→MP-08 · F-031→MP-08 · F-032→RV-11 · F-033→MP-05 · F-034→TP-04 · F-035→TP-03 · F-036→TP-06 · F-037→TP-09 · F-038→TP-11 · F-039→TP-08 · F-040→TP-11 · F-041→TP-10 · F-042→TP-12 · F-043→AU-05 · F-044→AU-05 · F-045→AU-01/AU-02 · F-046→AU-02 · F-047→AU-08 · F-048→AU-10 · F-049→AU-10 · F-050→AU-01/AU-10 · F-051→AU-07 · F-052→EX-05 · F-053→EX-06 · F-054→EX-10 · F-055→EX-09 · F-056→EX-02 · F-057→CQ-04 · F-058→SC-01 · F-059→EX-11 · F-060→EX-11 · F-061→RV-17 · F-062→RV-04 · F-063→RV-04 · F-064→RV-04 · F-066→RV-11 · F-067→RV-03 · F-068→RV-03 · F-069→RV-07 · F-070→RV-07 · F-071→RV-02 · F-072→RV-02 · F-073→RV-03 · F-074→RV-17 · F-075→RV-03 · F-076→RV-03 · F-077→RV-02/RV-16 · F-078→RV-03 · F-079→RV-03 · F-080→RV-02 · F-081→RV-21 · F-082→RV-12 · F-083→RV-12 · F-084→RV-13 · F-085→RV-03 · F-086→RV-12 · F-087→RV-12 · F-088→RV-12 · F-089→TP-02 · F-090→AX-01 · F-091→RV-20 · F-092→UI-09 · F-093→UI-11 · F-094→UI-11/AX-03 · F-095→UI-09 · F-096→UI-09 · F-097→UI-02/AX-02 · F-098→UI-07 · F-099→UI-07/CQ-05 · F-100→CH-23 · F-101→CH-23 · F-102→UI-09 · F-103→EX-08 · F-104→EX-04 · F-105→EX-11 · F-106→PF-04 · F-107→UI-04 · F-108→RV-05 · F-109→TP-02 · F-110→UI-02 · F-111→EX-04/UI-09 · F-112→UI-09 · F-113→EX-04/ST-02 · F-114→ST-02 · F-115→ST-02 · F-116→ST-03 · F-117→ST-03 · F-118→ST-01 · F-119→EX-02 · F-120→ST-02 · F-121→PF-03 · F-122→CQ-01 · F-123→PF-02 · F-124→EX-09 · F-125→PF-04 · F-126→PF-01 · F-127→CQ-06 · F-129→PF-02 · F-130→EX-11 · F-132→CQ-06 · F-133→RV-10 · F-134→RV-08 · F-135→RV-09 · F-136→RV-09 · F-137→RV-19 · F-138→RV-19 · F-139→EX-11 · F-140→EX-08 · F-141→UI-08 · F-142→TP-08 · F-143→TP-08 · F-144→RV-02 · F-145→RV-17 · F-146→AU-02 · F-147→EX-06 · F-148→EX-11 · F-150→UI-10

**A4** — AU-01→AU-02 · AU-02→AU-01/AU-02 · AU-03→AU-07 · AU-04→AU-05 · AU-05→AU-04 · AU-06→AU-09 · AU-07→AU-08 · AU-08→AU-10 · AU-09→AU-10 · AU-10→AU-06 · CH-01→CH-03 · CH-02→CH-09 · CH-03→CH-09 · CH-04→CH-05 · CH-05→CH-04 · CH-06→CH-01 · CH-07→CH-01 · CH-08→CH-14 · CH-09→CH-10 · CH-10→CH-21 · CH-11→KR-06 · CH-12→KR-01 · CH-13→CH-12 · CH-14→CH-13 · CH-15→CH-11/CH-18 · CH-16→TP-06 · CH-17→KR-02 · CH-18→KR-04 · CH-19→KR-03 · CH-20→CH-17 · CH-21→CH-16 · CH-22→CH-22/CQ-04 · CH-23→CH-22 · CH-24→CH-19 · CH-25→CH-07 · CH-26→CH-15 · CH-27→CH-23 · CH-28→CH-08 · CH-29→MP-11 · CH-30→CH-17 · CH-31→CH-20 · EX-01→EX-01 · EX-02→EX-07 · EX-03→EX-02 · EX-04→EX-04 · EX-05→EX-10 · EX-06→EX-06 · EX-07→EX-05 · EX-08→EX-11 · EX-09→EX-08 · EX-10→EX-08/UI-06 · MI-01→MP-02 · MI-02→MP-03 · MI-03→MP-03 · MI-04→MP-01 · MI-05→MP-10 · MI-06→MP-05 · MI-07→MP-09 · MI-08→MP-09 · MI-09→MP-04 · MI-10→MP-09 · MI-11→MP-06 · MI-12→MP-07 · MI-13→MP-08 · MI-14→RV-11 · MI-15→MP-10 · MI-16→MP-10 · MI-17→KR-06 · PL-01→TP-01 · PL-02→TP-02 · PL-03→TP-03 · PL-04→TP-04 · PL-05→TP-05 · PL-06→TP-06 · PL-07→TP-08 · PL-08→TP-09 · PL-09→TP-07 · PL-10→TP-10 · PL-11→TP-12 · PL-12→TP-11/CQ-05 · PL-13→TP-11 · RN-01→RV-01 · RN-02→RV-02/RV-03 · RN-03→RV-04 · RN-04→RV-05 · RN-05→RV-13 · RN-06→RV-13 · RN-07→RV-14 · RN-08→RV-12 · RN-09→RV-08 · RN-10→RV-08 · RN-11→RV-21 · RN-12→RV-04 · RN-13→RV-04 · RN-14→RV-17 · RN-15→RV-20 · RN-16→KR-08 · RN-17→RV-16 · RN-18→RV-07 · RN-19→EX-03 · RP-01→CQ-02 · RP-02→CQ-01 · RP-03→PF-04 · RP-04→PF-02 · RP-05→PF-03 · RP-06→PF-01 · RP-07→EX-09 · RP-08→TP-07 · RP-09→SC-03 · RP-10→CQ-06 · RP-11→CQ-06 · RP-12→ST-03 · RP-13→CQ-05 · RP-14→ST-02 · RP-15→UI-04 · SEC-01→SC-01 · SEC-02→SC-02 · SEC-03→SC-03 · SEC-04→SC-04 · SEC-05→MP-11/SC-03 · SEC-06→SC-04 · SEC-07→CQ-03 · SEC-08→AU-02 · TP-01→UI-07 · TP-02→UI-07/CQ-05 · TP-03→TP-09 · TP-04→CH-23 · TP-05→UI-07 · TP-06→AX-04 · TP-07→MP-12 · TP-08→RV-18 · TP-09→RV-03 · TP-10→TP-11 · UI-01→AX-01 · UI-02→AX-03 · UI-03→UI-11/AX-03 · UI-04→UI-11 · UI-05→UI-02 · UI-06→RV-14/UI-01 · UI-07→UI-02 · UI-08→UI-09/AX-03 · UI-09→UI-09 · UI-10→UI-05 · UI-11→UI-09 · UI-12→TP-06 · UI-13→UI-08 · UI-14→AX-04 · UI-15→PF-05 · UI-16→UI-09 · UI-17→UI-09/CQ-04 · UI-18→EX-08/UI-06


#### Source findings intentionally not merged

* **A1 B-28** — autoStart effect dependency nuance — *cosmetic effect-dependency nuance in `autoStart`; no user impact*
* **A2 TR-10** — The scrubber density profile is fixed at 160 bins of note starts — *scrubber density uses a fixed 160 bins; cosmetic*
* **A3 F-016** — G7/B labelled B°; chord root treated as non-chord tone — ***refuted** — harness input error (MIDI 58 = B♭, not G); see §2.4 #3*
* **A3 F-065** — Notes whose start is off-screen are skipped entirely (long notes vanish) — ***refuted** — visible-window index uses a running max of note ends; see §2.4 #8*
* **A3 F-128** — shortTitle only splits on an em dash with spaces — *`shortTitle` splits only on an em dash with spaces; trivial*
* **A3 F-131** — base64ToBytes rejects URL-safe or whitespace-padded base64 — *`base64ToBytes` rejects URL-safe/whitespace base64; only reachable via the automation API*
* **A3 F-149** — Sync inspector renders all tempo rows; scroll state updates unthrottled — *sync inspector renders every tempo row (unthrottled scroll state); dev-tool panel only*

### 8.3 Appendix C — What is in each zip

| Label | Zip | Open this first | Also useful |
|---|---|---|---|
| **A1** | `midi-piano-visualizer-audit.zip` | `public/files/audit-report.md` | **`audit/repo/` — the full source snapshot of your project** (the other three reference it); `audit/harness/*.mjs` (chord, MIDI and Playwright harnesses); `audit/pw-results.json` |
| **A2** | `midi-piano-visualizer-audit__1_.zip` | `public/files/fahh-midi-audit.md` | `fahh-midi-findings.json` (168 findings, 30 improvements, 60 visualizer upgrades), `audit-site-results.json`. Test scripts were **not** shipped — its numbers rest on its own report |
| **A3** | `midi-piano-visualizer-audit__2_.zip` | `public/files/fahh-midi-audit.md` | `public/files/tests/` — `chordtest.mjs`, `realpieces.mjs`, `parsefuzz.mjs`, **`renderbench.mjs`**; `findings.json` |
| **A4** | `midi-piano-visualizer-audit__3_.zip` | `public/files/fahh-midi-audit-report.md` | `public/files/appendix/` — **`chord_v2.mjs`** (learner prototype), `cmp_v2.mjs`, `chord_tests.mjs`, `perf.mjs`, raw `results_*.json` |

Each zip is also a small runnable Vite site whose only purpose is to host its report’s download buttons; none of them modify or include your application.

### 8.4 Appendix D — Key numbers, one place

| Topic | Number | Source |
|---|---|---|
| Source size | chords.ts 979 · renderer.ts 1,902 · settings.ts 685 lines | A1/A4 |
| Build | 864.77 kB single HTML, 365.75 kB gzip; ~570 kB is base64 MIDI | A1, A2 |
| Dependencies | 170, `npm audit` = 0 vulnerabilities | A2, A4 |
| Chord templates | **48** | me |
| Settings | 203 | A2, A4 |
| Random sets named as chords | 49.0 / 78.0 / 74.1 / 54.7 % (3/4/5/6 notes) | me |
| Prototype v2 on the same | 39.8 / 33.8 / 20.1 / 10.5 % | me, running A4’s code |
| Named sets that ignore a sounding note | 0 / 49 / 71 / 82 % (3/4/5/6 notes) | A4 |
| Inversion accuracy | 42 % (prototype 73 %) | A4 |
| 13th / m11 accuracy at Balanced | 0 % | all four; me |
| First-chord times | Für Elise 58.59 s · Moonlight 19.26 s · K.545 8.27 s | me |
| Phantom slash labels fixed by CH-02 | Bach −21 · Für Elise −3 · Moonlight −3 · QA etude −1 | me |
| Gradients per frame | Bach 367 · 10 notes 282 · 500 notes 1,528 · 5,000 notes 19,597 | me |
| Max velocity darkening of a note | 8 % | settings defaults |
| DPR cap | 2 | `App.tsx:134` |
| Live fps at 5,000 notes (software raster) | ≈ 5 fps (200.9 ms/frame) | A2 |
| Parse + harmony time | 18 ms (120 notes) → 25 ms (3.3 k) → 69 ms (5 k) → 208–368 ms (20 k) | A2, A3, A4 |
| Phone layout | 320 px: stage 217 px, white key 6.15 px; 390×844: chrome 36 % of the screen | A2, A4 |
| Touch targets | 34 px | A2 |

---

*End of report. This file is a synthesis of four independent audits plus my own re-verification of the disputed and highest-impact claims against the repo snapshot `f7a1aaa`; it contains no changes to your code.*
