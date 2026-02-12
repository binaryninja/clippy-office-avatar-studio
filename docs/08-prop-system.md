# Prop System

The prop system lets any Object3D be attached to named anchor points on avatars. It has two layers: the shared prop registry (cross-avatar) and Clippy's legacy plugin system.

## Architecture

```mermaid
flowchart TD
    subgraph "Shared Prop Registry (prop-system.js)"
        REG_SHARED["registerSharedProp(name, definition)<br/>→ sharedPropRegistry Map"]
        GET_SHARED["getSharedProp(name) → definition"]
        LIST_SHARED["listSharedProps() → string[]"]
    end

    subgraph "Prop Definitions (shared-props.js)"
        SUNGLASSES["sunglasses<br/>anchor: head<br/>per-avatar placements"]
        TOP_HAT["topHat<br/>anchor: head<br/>per-avatar placements"]
    end

    subgraph "Prop Manager (per controller)"
        PM["createPropManager()"]
        ATTACH["attach({ name, anchor,<br/>propDefinition, THREE })"]
        DETACH["detach(id)"]
        DETACH_ALL["detachAll()"]
        PM_UPDATE["update(ctx)"]
    end

    subgraph "Placement System"
        LOAD["loadPropPlacement(<br/>propName, avatarId, definition)"]
        SAVE["savePropPlacement(<br/>propName, avatarId, placement)"]
        APPLY["applyPlacementToObject(<br/>object3d, placement)"]
        LOCAL["localStorage<br/>key: prop-placement:{name}:{avatar}"]
    end

    subgraph "Controller Integration"
        CTRL["Avatar Controller<br/>setState() handles propName changes"]
        ANCHORS["controller.getAnchors()<br/>→ { head: Object3D, ... }"]
        CATALOG["controller.getCatalog()<br/>→ { props: [...names] }"]
    end

    subgraph "Clippy Plugin System (clippy-3d.js)"
        PLUGIN["createClippyPlugin({<br/>animations, props })"]
        GLOBAL_ANIM["GLOBAL_ANIMATIONS registry"]
        GLOBAL_PROPS["GLOBAL_PROPS registry"]
        PLUGIN_EX["clippy-3d-plugin-examples.js<br/>officePackPlugin:<br/>• think animation<br/>• topHat prop (legacy)"]
    end

    SUNGLASSES --> REG_SHARED
    TOP_HAT --> REG_SHARED

    REG_SHARED --> GET_SHARED
    REG_SHARED --> LIST_SHARED

    LIST_SHARED --> CATALOG
    GET_SHARED --> ATTACH

    PM --> ATTACH
    PM --> DETACH
    PM --> DETACH_ALL
    PM --> PM_UPDATE

    ATTACH --> ANCHORS
    LOAD --> LOCAL
    SAVE --> LOCAL
    LOAD --> APPLY

    CTRL --> PM
    CTRL --> LOAD
    CTRL --> SAVE

    PLUGIN --> GLOBAL_ANIM
    PLUGIN --> GLOBAL_PROPS
    PLUGIN_EX --> PLUGIN
```

## Prop Lifecycle

```mermaid
sequenceDiagram
    actor User
    participant UI as Control Panel
    participant Ctrl as Controller
    participant PM as PropManager
    participant Reg as SharedPropRegistry
    participant LS as localStorage

    User->>UI: Select "sunglasses" from prop dropdown
    UI->>Ctrl: setState({ propName: "sunglasses" })
    Ctrl->>PM: detachAll() (remove old prop)
    Ctrl->>Reg: getSharedProp("sunglasses")
    Reg-->>Ctrl: { defaultAnchor, placements, create }
    Ctrl->>LS: loadPropPlacement("sunglasses", avatarId, def)
    LS-->>Ctrl: { x, y, z, scale, rotX, rotY, rotZ }
    Ctrl->>PM: attach({ name, anchor, propDefinition, THREE })
    PM->>Reg: definition.create({ THREE, anchor })
    Reg-->>PM: { object3d, update?, dispose? }
    PM->>PM: anchor.add(object3d)
    Ctrl->>Ctrl: applyPlacementToObject(object3d, placement)

    Note over User,LS: User adjusts prop placement sliders...

    User->>UI: Move prop X/Y/Z/Scale/Rotation sliders
    UI->>Ctrl: setState({ propX, propY, propZ, ... })
    Ctrl->>Ctrl: applyPlacementToObject(object3d, newPlacement)
    Ctrl->>LS: savePropPlacement("sunglasses", avatarId, placement)
```

## Placement Resolution Order

When loading a prop's placement for a specific avatar:

1. **localStorage** — User's saved custom placement (highest priority)
2. **Prop definition placements** — Per-avatar defaults from the prop definition (e.g., different sunglasses positions for Clippy vs Towely)
3. **Global defaults** — `{ x: 0, y: 0.3, z: 0, scale: 1, rotX: 0, rotY: 0, rotZ: 0 }`

## Registered Shared Props

| Prop | Anchor | Description |
|------|--------|-------------|
| `sunglasses` | head | Dark reflective lens pair with wire frame and temple arms |
| `topHat` | head | Classic cylinder top hat with brim |

Both define per-avatar placements for all four avatars (clippy, pushy, tacky, towely) to account for different head sizes and positions.
