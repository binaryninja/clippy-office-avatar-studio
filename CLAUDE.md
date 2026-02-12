# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Interactive Three.js avatar studio featuring four 3D avatars (Clippy, Pushy, Tacky, Towely) with real-time voice integration (OpenAI Realtime WebRTC, ElevenLabs), viseme-driven mouth animation, and a cyberpunk-themed control panel. Vanilla JavaScript ES modules, no framework.

## Commands

```bash
npm run dev                              # Vite dev server with HMR
npm run dev -- --host 127.0.0.1 --port 4173  # Dev with specific host/port
npm run build                            # Production build → dist/
npm run preview                          # Preview production build
npm run lint                             # ESLint (flat config, ES2024)
npm run check:syntax                     # Node --check on all JS files
npm run check                            # Full CI check: syntax + lint + build
```

CI runs `npm run check` on every PR/push to master (Node 24.x).

## Architecture

### Entry Points
- `index.html` → `js/studio.js` — Main avatar studio with carousel and control panel
- `clippy-presentation.html` → `js/presentation.js` — Clippy presenter with Excalidraw slides
- `fabric.html` — Standalone terry cloth shader demo

### Schema-Driven Avatar System

Avatar definitions live in `js/config/avatars.js`. Each avatar declares an `engine` type, a `controls` schema (sections → fields with types `select`/`range`/`color`), and `defaultState`. The studio dynamically generates UI controls from this schema.

**Engine → Factory → Controller pipeline:**
```
avatars.js (schema)  →  lib/*-factory.js (mesh creation)  →  avatars/*-controller.js (runtime)
```

Three engine types:
- `"clippy"` → `lib/clippy-3d.js` → `avatars/clippy-controller.js`
- `"thumbtack"` → `lib/thumbtack-factory.js` → `avatars/thumbtack-controller.js` (Pushy & Tacky share this with different profiles)
- `"towely"` → `lib/towely-factory.js` → `avatars/towely-controller.js`

### Data Flow

User control changes → `applyStateToController()` in studio.js → controller `setState()` → updates 3D geometry/materials. The render loop (`requestAnimationFrame`) updates avatar runtimes each frame with delta time, pointer position (for eye tracking), and current viseme state.

### Voice Pipeline

Two voice providers in `js/lib/`: `realtime-voice.js` (OpenAI WebRTC) and `elevenlabs-voice.js` (ElevenLabs). Both emit viseme and speech-level events. `js/lib/visemes.js` converts transcript text to viseme frame sequences using rule-based phoneme mapping. The active avatar controller receives `setVoiceViseme()` calls to animate the mouth rig.

### Key Modules
- `js/studio.js` — App runtime: scene setup, avatar carousel, control panel generation, voice dispatch
- `js/config/avatars.js` — All avatar definitions, control schemas, and default states
- `js/lib/utils.js` — Shared helpers: `clamp`, `constrainPupilToEyeSurface`, `randomColor`, safe disposal functions

## Architecture Diagrams

The `docs/` directory contains 10 Mermaid-based architecture diagrams. Consult these before making structural changes:

- [System Overview](docs/01-high-level-architecture.md) — All subsystems, entry points, external dependencies
- [Module Dependency Graph](docs/02-module-dependency-graph.md) — Every JS file and its import edges
- [Engine-Factory-Controller Pipeline](docs/03-engine-factory-controller.md) — Avatar creation and self-registration
- [Avatar Runtime Data Flow](docs/04-avatar-data-flow.md) — Control panel → state → controller → mesh
- [Voice Pipeline](docs/05-voice-pipeline.md) — Microphone → provider → viseme → mouth animation
- [Viseme & Mouth Animation](docs/06-viseme-mouth-animation.md) — 12 viseme shapes, parsing rules, pose blending
- [Scene & Carousel](docs/07-scene-and-carousel.md) — Scene graph, lighting, carousel spring physics
- [Prop System](docs/08-prop-system.md) — Shared prop registry, manager lifecycle, placement persistence
- [Schema-Driven UI](docs/09-schema-driven-ui.md) — Control panel generation from avatar schemas
- [Character Profiles & Presentation](docs/10-character-profiles-and-presentation.md) — Voice instruction building, Excalidraw slides

## Conventions

- ES modules throughout (`"type": "module"` in package.json)
- Three.js loaded via CDN import map in HTML (v0.182.0 from jsDelivr), not bundled
- ESLint: no debugger, warn on unused vars (prefix unused with `_`)
- CSS uses custom properties for the cyberpunk theme; fonts: Rajdhani (UI) + Share Tech Mono (code)
- No test framework; validation is syntax checking + linting + successful build
- Vite multi-entry build outputs both studio and presentation pages to `dist/`
