# Engine-Factory-Controller Pipeline

How avatars go from schema definition to running 3D controllers.

```mermaid
flowchart TD
    subgraph "1. Avatar Definition (config/avatars.js)"
        DEF["AVATAR_DEFINITIONS.clippy<br/>engine: 'clippy'<br/>controls: [...schema...]<br/>defaultState: {...}"]
    end

    subgraph "2. Engine Registry (engines.js)"
        REG["engineRegistry Map"]
        REGISTER["registerEngine(name, factory)"]
        GET["getEngine(name) → factory fn"]
    end

    subgraph "3. Self-Registration (side-effect imports)"
        CC_REG["clippy-controller.js<br/>registerEngine('clippy',<br/>  createClippyController)"]
        TC_REG["thumbtack-controller.js<br/>registerEngine('thumbtack',<br/>  createThumbtackController)"]
        WC_REG["towely-controller.js<br/>registerEngine('towely',<br/>  createTowelyController)"]
    end

    subgraph "4. Mesh Factories"
        C3D["createClippy3D(THREE, state)<br/>→ head, body, arms, eyes,<br/>mouth rig, materials"]
        TF["createThumbTackAvatar(THREE, state, profile)<br/>→ cap, pin, face, materials"]
        WF["createTowelyAvatar(THREE, state)<br/>→ body shader, face,<br/>limbs, materials"]
    end

    subgraph "5. Controller (runtime object)"
        CTRL["Controller Interface:<br/>• group (Object3D)<br/>• setState(state, opts)<br/>• update(dt, pointer)<br/>• setVoiceActivity(level)<br/>• setVoiceViseme(payload)<br/>• getCatalog() → { modes, props }<br/>• dispose()"]
    end

    subgraph "6. Interface Validation"
        ASSERT["assertControllerInterface()<br/>Checks all 7 required keys<br/>at creation time"]
    end

    DEF -->|"engine: 'clippy'"| GET
    GET -->|"returns factory fn"| CC_REG

    CC_REG --> REGISTER
    TC_REG --> REGISTER
    WC_REG --> REGISTER
    REGISTER --> REG

    CC_REG -->|"internally calls"| C3D
    TC_REG -->|"internally calls"| TF
    WC_REG -->|"internally calls"| WF

    C3D --> CTRL
    TF --> CTRL
    WF --> CTRL

    CTRL --> ASSERT
```

## Pipeline Walkthrough

### Step 1: Schema Definitions
`js/config/avatars.js` exports `AVATAR_DEFINITIONS` — a map of avatar IDs to definitions. Each definition declares:
- `engine` — string key matching a registered engine (e.g. `"clippy"`, `"thumbtack"`, `"towely"`)
- `profile` — optional sub-variant (Pushy and Tacky both use `"thumbtack"` engine with different profiles)
- `controls` — array of sections with typed field descriptors for UI generation
- `defaultState` — initial values for all controllable parameters

### Step 2: Self-Registering Engines
Each controller file calls `registerEngine(name, factoryFn)` at module scope. When `studio.js` imports these files as side effects, the engines become available in the global registry.

```js
// In studio.js — side-effect imports trigger registration
import "./avatars/clippy-controller.js";
import "./avatars/thumbtack-controller.js";
import "./avatars/towely-controller.js";
```

### Step 3: Factory Invocation
`studio.js` calls `getEngine(definition.engine)` to retrieve the factory, then invokes it:

```js
const factory = getEngine(definition.engine);
const controller = factory({ THREE, scene, initialState, profile, stageTopY, avatarId });
```

### Step 4: Controller Interface
Every factory must return an object implementing the full controller interface. `assertControllerInterface()` validates this at creation time — missing members throw immediately.

### Engine → Avatar Mapping

| Avatar | Engine Key | Profile | Factory | Controller |
|--------|-----------|---------|---------|------------|
| Clippy | `"clippy"` | — | `createClippy3D` | `createClippyController` |
| Pushy | `"thumbtack"` | `"pushy"` | `createThumbTackAvatar` | `createThumbtackController` |
| Tacky | `"thumbtack"` | `"tacky"` | `createThumbTackAvatar` | `createThumbtackController` |
| Towely | `"towely"` | — | `createTowelyAvatar` | `createTowelyController` |
