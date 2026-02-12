# Module Dependency Graph

Every JS file and its import relationships, grouped by directory.

```mermaid
graph LR
    subgraph "Entry Points"
        STUDIO["js/studio.js"]
        PRES["js/presentation.js"]
    end

    subgraph "Config"
        AVATARS["js/config/avatars.js"]
    end

    subgraph "Engine Registry"
        ENGINES["js/engines.js"]
    end

    subgraph "Avatar Controllers"
        CC["js/avatars/<br/>clippy-controller.js"]
        TC["js/avatars/<br/>thumbtack-controller.js"]
        WC["js/avatars/<br/>towely-controller.js"]
    end

    subgraph "Mesh Factories"
        C3D["js/lib/clippy-3d.js"]
        TF["js/lib/<br/>thumbtack-factory.js"]
        WF["js/lib/<br/>towely-factory.js"]
    end

    subgraph "Voice"
        RV["js/lib/<br/>realtime-voice.js"]
        EV["js/lib/<br/>elevenlabs-voice.js"]
        VIS["js/lib/visemes.js"]
    end

    subgraph "Props"
        PS["js/lib/prop-system.js"]
        SP["js/lib/shared-props.js"]
        PE["js/lib/clippy-3d-<br/>plugin-examples.js"]
    end

    subgraph "Utilities"
        UTILS["js/lib/utils.js"]
        CU["js/lib/<br/>controller-utils.js"]
    end

    %% studio.js imports
    STUDIO --> AVATARS
    STUDIO --> ENGINES
    STUDIO --> UTILS
    STUDIO --> RV
    STUDIO --> EV
    STUDIO --> CU
    STUDIO -.->|side-effect| CC
    STUDIO -.->|side-effect| TC
    STUDIO -.->|side-effect| WC

    %% presentation.js imports
    PRES --> CC
    PRES --> AVATARS

    %% clippy-controller.js imports
    CC --> C3D
    CC --> UTILS
    CC --> ENGINES
    CC --> PS
    CC --> AVATARS
    CC -.->|side-effect| SP
    CC --> PE

    %% thumbtack-controller.js imports
    TC --> TF
    TC --> UTILS
    TC --> ENGINES
    TC --> PS
    TC --> AVATARS
    TC -.->|side-effect| SP

    %% towely-controller.js imports
    WC --> WF
    WC --> UTILS
    WC --> ENGINES
    WC --> PS
    WC --> AVATARS
    WC -.->|side-effect| SP

    %% Factory imports
    C3D --> UTILS
    PE --> C3D

    %% Voice imports
    RV --> VIS
    EV --> VIS

    %% Prop imports
    SP --> PS
```

## Legend

- **Solid arrows** (`-->`) — named imports (`import { x } from ...`)
- **Dashed arrows** (`-.->`) — side-effect imports (`import "./module.js"`) that trigger self-registration

## Import Summary

| Module | Imports From | Imported By |
|--------|-------------|-------------|
| `studio.js` | avatars.js, engines.js, utils.js, realtime-voice.js, elevenlabs-voice.js, controller-utils.js + 3 side-effect | Entry point |
| `presentation.js` | clippy-controller.js, avatars.js | Entry point |
| `engines.js` | _(none)_ | studio.js, all 3 controllers |
| `config/avatars.js` | _(none)_ | studio.js, presentation.js, all 3 controllers |
| `lib/visemes.js` | _(none)_ | realtime-voice.js, elevenlabs-voice.js |
| `lib/utils.js` | _(none)_ | studio.js, clippy-controller.js, thumbtack-controller.js, towely-controller.js, clippy-3d.js |
| `lib/prop-system.js` | _(none)_ | shared-props.js, all 3 controllers |
| `lib/shared-props.js` | prop-system.js | Side-effect import by all 3 controllers |
| `lib/controller-utils.js` | _(none)_ | studio.js |
