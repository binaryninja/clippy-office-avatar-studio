# AGENTS.md

Instructions for AI coding agents working in this repository.

## Project

Interactive Three.js avatar studio featuring four 3D avatars (Clippy, Pushy, Tacky, Towely) with real-time voice integration (OpenAI Realtime WebRTC, ElevenLabs), viseme-driven mouth animation, and a cyberpunk-themed control panel. Vanilla JavaScript ES modules, no framework.

## Validation

Run `npm run check` before opening a pull request or declaring work complete. This is the CI gate.

```bash
npm run check          # Full CI: syntax check + lint + build (required to pass)
npm run lint           # ESLint only (flat config, ES2024)
npm run check:syntax   # Node --check on all JS files
npm run build          # Production build → dist/
```

CI runs `npm run check` on every PR/push to master (Node 24.x).

## Development

```bash
npm run dev                                    # Vite dev server with HMR
npm run dev -- --host 127.0.0.1 --port 4173    # Dev with specific host/port
npm run preview                                # Preview production build
```

## Architecture

Consult the diagrams in `docs/` before making structural changes. Key references:

| Diagram | Path | When to read |
|---------|------|--------------|
| System Overview | `docs/01-high-level-architecture.md` | Starting any work; understanding subsystem boundaries |
| Module Dependencies | `docs/02-module-dependency-graph.md` | Adding/removing imports or files |
| Engine-Factory-Controller | `docs/03-engine-factory-controller.md` | Adding a new avatar or engine type |
| Runtime Data Flow | `docs/04-avatar-data-flow.md` | Changing how controls affect 3D state |
| Voice Pipeline | `docs/05-voice-pipeline.md` | Modifying voice providers or mouth animation |
| Viseme System | `docs/06-viseme-mouth-animation.md` | Changing mouth shapes or text-to-viseme parsing |
| Scene & Carousel | `docs/07-scene-and-carousel.md` | Modifying the 3D scene, lighting, or carousel |
| Prop System | `docs/08-prop-system.md` | Adding props or changing placement logic |
| Schema-Driven UI | `docs/09-schema-driven-ui.md` | Changing control panel generation or state sync |
| Profiles & Presentation | `docs/10-character-profiles-and-presentation.md` | Changing voice profiles or presentation mode |

### Entry Points

- `index.html` → `js/studio.js` — Main avatar studio with carousel and control panel
- `clippy-presentation.html` → `js/presentation.js` — Clippy presenter with Excalidraw slides
- `fabric.html` — Standalone terry cloth shader demo

### Engine → Factory → Controller Pipeline

```
js/config/avatars.js (schema)  →  js/lib/*-factory.js (mesh)  →  js/avatars/*-controller.js (runtime)
```

Engines self-register via side-effect imports. Adding a new avatar means:
1. Define it in `js/config/avatars.js` with engine key, controls schema, and defaultState
2. Create a factory in `js/lib/` that builds the 3D mesh
3. Create a controller in `js/avatars/` that calls `registerEngine()` at module scope
4. Add a side-effect import in `js/studio.js`

Three engine types exist:
- `"clippy"` → `lib/clippy-3d.js` → `avatars/clippy-controller.js`
- `"thumbtack"` → `lib/thumbtack-factory.js` → `avatars/thumbtack-controller.js` (Pushy & Tacky share this with different `profile` values)
- `"towely"` → `lib/towely-factory.js` → `avatars/towely-controller.js`

### Controller Interface Contract

Every controller must implement these members (validated by `assertControllerInterface()` at creation time):

- `group` — THREE.Group root object
- `setState(state, { force })` — Apply state to geometry/materials
- `update(dt, pointer)` — Per-frame animation (eye tracking, mode playback, voice)
- `setVoiceActivity(level)` — Speech volume level (0–1)
- `setVoiceViseme(payload)` — Mouth shape `{ viseme, strength }`
- `getCatalog()` — Dynamic options `{ modes, props }`
- `dispose()` — Cleanup

### Key Modules

| Module | Purpose |
|--------|---------|
| `js/studio.js` | App runtime: scene, carousel, control panel, voice dispatch, render loop |
| `js/config/avatars.js` | Avatar definitions, control schemas, default states |
| `js/engines.js` | Self-registering engine registry (`registerEngine` / `getEngine`) |
| `js/lib/prop-system.js` | Shared prop registry + prop manager + placement persistence |
| `js/lib/visemes.js` | Rule-based text → viseme frame conversion |
| `js/lib/realtime-voice.js` | OpenAI Realtime WebRTC voice provider |
| `js/lib/elevenlabs-voice.js` | ElevenLabs Conversational AI voice provider |
| `js/lib/utils.js` | Shared helpers: `clamp`, `constrainPupilToEyeSurface`, safe disposal |
| `js/lib/controller-utils.js` | Controller interface validation |

## Conventions

- **ES modules** throughout (`"type": "module"` in package.json)
- **Three.js via CDN** import map in HTML (v0.182.0 from jsDelivr), not bundled through npm
- **ESLint rules**: no debugger; warn on unused vars (prefix unused with `_`)
- **CSS**: custom properties for cyberpunk theme; fonts: Rajdhani (UI) + Share Tech Mono (code)
- **No test framework**: validation is syntax checking + linting + successful build
- **Vite** multi-entry build outputs both studio and presentation pages to `dist/`
- **Side-effect imports**: controller modules self-register engines on import — never add hardcoded engine lookups
- **State flow**: UI → `applyStateToController()` → `sanitizeState()` → `controller.setState()` → mesh updates. Do not bypass `sanitizeState()`.
- **Voice mutual exclusion**: only one voice provider can be active at a time; connecting one disconnects the other

## Do Not

- Do not import Three.js through npm — it is loaded via CDN import map in the HTML files
- Do not add hardcoded if/else chains for engine types — use the self-registering engine registry
- Do not bypass `sanitizeState()` when applying state to controllers
- Do not modify the controller interface without updating `REQUIRED_CONTROLLER_KEYS` in `controller-utils.js` and all existing controllers
- Do not commit `.env` files or API keys — voice provider keys are configured via `VITE_*` env vars or `window.*` globals
