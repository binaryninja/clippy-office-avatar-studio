# Bart Simpson 3D Model — Working Notes

## Quick Start

```bash
# Terminal 1: keep running
npm run dev -- --host 127.0.0.1 --port 4173

# Terminal 2: after each edit to bart.html
node screenshot-bart.mjs            # outputs 4 PNGs to feedback-img/
```

Open `http://127.0.0.1:4173/bart.html` in a browser for interactive inspection.

## Workflow (for AI agent)

1. Edit `buildBart()` in `bart.html` (lines 113–361)
2. Run `node screenshot-bart.mjs` (or `node screenshot-bart.mjs <port>`)
3. Read `feedback-img/bart-front.png`, `bart-34.png`, `bart-left.png`, `bart-closeup.png`
4. Compare against reference (`feedback-img/reference-bart-model-sheet.png` if saved) and evaluate
5. Repeat

## File Layout

| File | Purpose |
|------|---------|
| `bart.html` | Standalone inspection page, contains `buildBart()` + 8 camera views |
| `screenshot-bart.mjs` | Playwright script, captures 4 key views (front, 3/4, left profile, face close-up) |
| `feedback-img/` | Output screenshots and reference images |

## Reference

The canonical reference is the **Film Roman model sheet** ("BART. TURN STANDARD #1", episode 7200). Key observations from that sheet:

- **Head from front**: Rounded cylinder wider than tall, NOT boxy. Smooth curved sides that taper inward at the jaw/chin. Flat top where spikes start.
- **Head from side**: Nearly circular cross-section. Very prominent muzzle/snout protruding forward from the lower face.
- **Head from top**: Elliptical — wider (left-right) than deep (front-back).
- **Spikes**: Exactly 9 zigzag peaks from the front. Very tall — roughly 50–60% of head height. Continuous sawtooth silhouette, not individual cones.
- **Eyes**: Large overlapping circles (figure-8/goggle shape). Slightly wider than tall. Flush against the face, not protruding.
- **Muzzle**: Distinctly protruding snout area wrapping around mouth. VERY visible from side/3/4 views.
- **Ears**: Small round bumps at eye level on the sides.
- **Body**: Short relative to head. Head is ~60% of total height with spikes.

## Current Model Architecture (v3)

### Head
- `LatheGeometry` with 12-point profile, revolved 32 segments
- Non-uniform `mesh.scale.set(1.15, 1, 0.82)` → elliptical cross-section from top
- Profile tapers at chin (radius 0 → 0.40 over bottom 30% of height)
- Flat top via quick radius-to-zero transition at top
- Key constants: `HR = 0.40`, `HH = 0.46`, `HEAD_Y = 2.15`
- Effective half-width: `HEAD_HALF_W = HR * 1.15 = 0.46`
- Effective face Z: `FACE_Z = HR * 0.82 = 0.328`

### Spikes
- `ExtrudeGeometry` of a zigzag `Shape`, 9 peaks
- Height: `SH = 0.48`, valley: `SV = 0.02`
- Depth: `FACE_Z * 2 * 0.85 ≈ 0.558`
- Positioned at `HEAD_Y + HH - 0.03`

### Face Features
- **Eyes**: `SphereGeometry(0.21)` scaled `(1.02, 0.95, 0.30)` — nearly circular, flat
- **Muzzle**: `SphereGeometry(0.25)` scaled `(0.92, 0.72, 0.80)` at `FACE_Z + 0.06`
- **Nose**: `SphereGeometry(0.055)` at `FACE_Z + 0.14`
- **Overbite**: Half-sphere `(0.17)` scaled, rotated, at `FACE_Z + 0.06`
- **Mouth**: `TubeGeometry` on a quadratic Bezier, width ~0.31
- **Chin**: Half-sphere `(0.11)` scaled
- **Ears**: Half-sphere `(0.12)` at `HEAD_HALF_W + 0.02` on each side

### Body
- Neck: cylinder at `y = 1.70`
- Torso: cylinder `(0.30, 0.27, 0.55)` at `y = 1.38`
- Arms: trig-placed at angle `π/5` from vertical, sleeve radius `0.075–0.08`, arm radius `0.055–0.05`
- Hands: 4 fingers + thumb on palm sphere
- Shorts: cylinder at `y = 0.98`
- Legs: cylinder radius `0.075` at `y = 0.63`
- Shoes: box `(0.17, 0.10, 0.34)` at `y = 0.38`

## Iteration History

### v1 (original commit 7b093a8)
- Head: `LatheGeometry` cylinder (too round, no width asymmetry)
- Spikes: 9 small cones on narrow crown
- Eyes: protruding spheres (frog-like)
- No visible ears, thin mouth, tiny nose

### v2
- Head: `ExtrudeGeometry` rounded rectangle — **too boxy/square**
- Spikes: changed to 4 (too few per reference)
- Eyes: improved to flat ovals
- Added muzzle, bigger ears
- Problem: flat faces read as a cube with rounded edges

### v3 (current)
- Head: `LatheGeometry` with non-uniform scale — organic rounded shape with chin taper
- Spikes: back to 9, much taller (0.48)
- Muzzle: very prominent, visible from side
- Eyes: nearly circular, figure-8 overlap
- **Key lesson**: `LatheGeometry` + non-uniform scale gives organic roundness; `ExtrudeGeometry` inherently creates flat-faced boxy shapes

## Remaining Issues / Possible Next Steps

- Spike silhouette from side is a flat rectangular block (ExtrudeGeometry limitation). Could taper spike depth from front to back, or accept as stylistic choice.
- Mouth could be more open/expressive (current is a thin smirk line)
- Body/clothing could have more detail (collar line, belt)
- Eyes could track (pupil offset) for character
- Fine-tune chin taper curve vs reference
- Muzzle shape could be more rectangular (currently spherical)
