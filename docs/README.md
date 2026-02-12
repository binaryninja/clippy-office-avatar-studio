# Architecture Diagrams

Visual documentation for the Office Avatar Studio codebase.

| # | Diagram | Description |
|---|---------|-------------|
| 1 | [High-Level Architecture](01-high-level-architecture.md) | System overview: subsystems, entry points, and external dependencies |
| 2 | [Module Dependency Graph](02-module-dependency-graph.md) | Every JS module and its import edges, grouped by directory |
| 3 | [Engine-Factory-Controller Pipeline](03-engine-factory-controller.md) | Avatar creation from schema definition through self-registering engines to controllers |
| 4 | [Avatar Runtime Data Flow](04-avatar-data-flow.md) | Control panel interactions, state updates, and the render loop |
| 5 | [Voice Pipeline](05-voice-pipeline.md) | End-to-end voice integration for OpenAI Realtime and ElevenLabs providers |
| 6 | [Viseme & Mouth Animation](06-viseme-mouth-animation.md) | Text-to-viseme parsing, pose blending, and Clippy's mouth rig |
| 7 | [Scene & Carousel](07-scene-and-carousel.md) | Three.js scene graph, lighting rig, camera, and carousel spring physics |
| 8 | [Prop System](08-prop-system.md) | Shared prop registry, prop manager lifecycle, and placement persistence |
| 9 | [Schema-Driven UI](09-schema-driven-ui.md) | Control panel generation from avatar definition schemas |
| 10 | [Character Profiles & Presentation](10-character-profiles-and-presentation.md) | Character profile storage, voice instructions, and Excalidraw presentation mode |
