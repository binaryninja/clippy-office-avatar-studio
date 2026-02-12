# Avatar Runtime Data Flow

How user interactions flow through the system to update 3D geometry, and how the render loop drives per-frame animation.

## Control Change Flow

```mermaid
sequenceDiagram
    actor User
    participant UI as Control Panel DOM
    participant Studio as studio.js
    participant State as runtime.state
    participant Ctrl as Avatar Controller
    participant Mesh as 3D Geometry/Materials

    User->>UI: Adjust slider / pick color / select option
    UI->>Studio: input/change event fires
    Studio->>Studio: coerceFieldValue(field, rawValue, catalog)
    Studio->>State: runtime.state[field.key] = coerced value
    Studio->>Studio: applyStateToController()
    Studio->>State: sanitizeState(definition, state, catalog, defaults)
    Studio->>Ctrl: controller.setState(state, { force })
    Ctrl->>Mesh: Update geometry, materials, scale, positions
    Studio->>UI: syncControlsFromState() — reflect sanitized values
    Studio->>UI: publishPresetText() — update JSON textarea
```

## Render Loop

```mermaid
sequenceDiagram
    participant RAF as requestAnimationFrame
    participant Clock as THREE.Clock
    participant Studio as studio.js
    participant Ctrl as Avatar Controller
    participant Stage as stageRig
    participant Orbit as OrbitControls
    participant Renderer as WebGLRenderer

    loop Every frame
        RAF->>Studio: animate()
        Clock->>Studio: dt = getDelta()

        loop Each avatar in registry
            Studio->>Ctrl: setVoiceActivity(speechLevel)
            Studio->>Ctrl: setVoiceViseme(visemePayload)
            Studio->>Ctrl: update(dt, pointer)
            Note over Ctrl: Eye tracking, animation<br/>mode playback, expression<br/>blending, prop updates
        end

        Studio->>Stage: stageRig.update(dt)
        Note over Stage: Spring-damper carousel rotation,<br/>slot scaling, ring animation
        Studio->>Orbit: orbit.update()
        Studio->>Renderer: renderer.render(scene, camera)
    end
```

## State Lifecycle

```mermaid
flowchart LR
    A["Avatar Definition<br/>defaultState"] -->|"init"| B["runtime.state<br/>(mutable copy)"]
    B -->|"user input"| C["coerceFieldValue()"]
    C --> D["sanitizeState()"]
    D --> B
    B -->|"apply"| E["controller.setState()"]
    E -->|"reads"| F["3D Mesh Updates"]
    B -->|"serialize"| G["JSON Preset Textarea"]
    G -->|"parse + apply"| D

    H["Randomize Button"] -->|"randomizeState()"| D
    I["Reset Button"] -->|"copy defaultState"| D
```

## Key Functions

| Function | Location | Purpose |
|----------|----------|---------|
| `applyStateToController()` | studio.js:753 | Central dispatch: sanitize → setState → sync UI → publish JSON |
| `sanitizeState()` | studio.js:673 | Clamp numbers, validate selects, normalize colors against schema |
| `coerceFieldValue()` | studio.js:654 | Convert raw input value to proper type for a single field |
| `syncControlsFromState()` | studio.js:730 | Push current state values back into DOM inputs |
| `publishPresetText()` | studio.js:748 | Serialize state to JSON textarea |
| `controller.setState()` | Each controller | Apply state object to 3D geometry and materials |
| `controller.update(dt, pointer)` | Each controller | Per-frame animation: eye tracking, mode playback, voice mouth |
