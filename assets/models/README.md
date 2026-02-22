Place your cockpit model here.

Supported filenames:
- `sceld.glb`
- `sceld.gltf`

At runtime, `js/lib/desktop-world.js` will attempt to load:
1. `window.SCELD_MODEL_URL` (if defined)
2. `assets/models/sceld.glb`
3. `assets/models/sceld.gltf`

If none are available, the procedural fallback cockpit remains active.
