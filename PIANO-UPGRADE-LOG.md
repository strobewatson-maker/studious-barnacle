# Piano realism upgrade — log

## Phase 0 audit (original behaviour)
- `drawFrame` (renderer.ts) is shared by live preview (player.ts), export (exporter.ts) and `renderFrame` (automation.ts) → one code path.
- Press state was `KeyState.press`: a 45 ms ease-out ramp (min 0.18) on note-on, linear 110 ms release; no velocity, no hold/rest model, no rebound.
- `drawKeys` turned that into: 2.6u translate, 1.2u shorter bottom, 0.34-alpha 1.7u edge shadow, a strong flat colour wash (keyWash 0.92) → a *tinted key that moved 3 px*. No occlusion, no side walls, no nose change, no black-key shadow response. That is why it read weak.
- Projection is pure top-down (rectangles); depth must come from shading, occlusion and small perspective drop.

## Decisions
- New `keypress.ts`: analytic depress d(t) per key from its notes (attack ease-out, hold depth by velocity, felt compression + damped rebound, release ease-in-out + overshoot, restart from current height, anticipation, deterministic per-key variation via integer hash).
- New `keyboard.ts`: `drawKeysPhysical`, all cues driven by d; sprites cached per size/light; shared local-space gradients; seeded textures (integer hash, no Math.random/Math.sin).
- Old `drawKeys` is kept and used when `render.finish.keyPhysics=false` (exact legacy look & timing; also the A/B baseline).
- Press colour wash is kept (identity) but all shading is layered on top of it.
- Light model: `finish.lightAngle` (deg), `lightFill`, `lightAmbient`.

## Spec (new settings, all `render.finish.*`, see settings.ts for ranges/hints)
keyPhysics true · pressHold 0.72 · pressAttackSlow 0.11 s · pressAttackFast 0.018 s · pressBottomOut 0.045 · pressReleaseSlow 0.14 s · pressReleaseFast 0.07 s · pressOvershoot 0.03 · pressAnticipation 20 ms · pressVariation 1 · cueDrop/Nose/SideWalls/Channel/Contact/Tilt/BlackKeys/Overhang/Bounce 1 · lightAngle −38° · lightFill 1 · lightAmbient 1 · ivoryDetail/ebonyDetail/woodDetail/brassDetail 1 · keyDither 1.

## QA tooling (qa/ is git-ignored)
Chromium can't launch here (missing libnspr4, no root) → `drawFrame` is bundled with esbuild and rendered in Node with @napi-rs/canvas (Skia). `qa/shoot.mjs <out> <scenes> <WxH,..> '<json patch>'`.

## Verification results (Node/Skia harness, 1920x1080 unless noted)
- Motion @60fps: pp attack 0→0.72 over ~5 frames; ff 0→1.04 (felt compression)→0.99→1.00; release overshoot −0.030; fast repeats restart from current height (min d between 110 ms repeats 0.60).
- Determinism: same frame after rendering 40 others → identical MD5; seek-to-N vs stepping-to-N → identical.
- Perf (software Skia, mean of 13 dense frames): legacy 24.9 ms → new 33.0 ms (1.33x) at 1080p.
- Geometry: white key gaps identical at 1280x720 / 1920x1080 (±2 px argmin ambiguity at 4K); black key silhouettes use the same x/w/rect code.
- Settings: export→import round-trip OK, legacy JSON imports (new fields default), out-of-range values clamp.

## Bugs found by critique
- harness patch was not applied (applyPatch returns a new doc) → fixed; first "after" images were defaults.
- drawKeysPhysical forgot drawCheeks → cheek blocks vanished; fixed.
- ebony looked milky/grainy → narrower streak, weaker env term, dither 3.2→1.6/255.

## Not done / limitations
- Real Chromium could not launch (missing libnspr4); browser GPU timing, real H.264/MP4 export and the Python --list-settings/UI were NOT run here. They use the same schema code paths.
- Black-key cast-shadow reach is one quantised sprite per black key (9 levels, crossfaded), driven by the black key's own depth and the deeper neighbour white.
