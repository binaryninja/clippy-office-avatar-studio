# Schema-Driven UI

The control panel is entirely generated from avatar definition schemas — no hardcoded UI per avatar.

## Generation Flow

```mermaid
flowchart LR
    subgraph "Avatar Definition (avatars.js)"
        DEF["definition.controls = [<br/>  { title, fields: [<br/>    { key, label, type,<br/>      min, max, step,<br/>      options, catalogKey }<br/>  ]}<br/>]"]
    end

    subgraph "Dynamic Options"
        CAT["controller.getCatalog()<br/>→ { modes: [...],<br/>     props: [...] }"]
        RESOLVE["resolveOptions(field, catalog)<br/>→ merge catalogKey options<br/>   with static options"]
    end

    subgraph "DOM Generation (buildControls)"
        SECTION["&lt;section class='control-group'&gt;<br/>&lt;h3&gt;section.title&lt;/h3&gt;"]
        CTRL_DIV["&lt;div class='control'&gt;"]
        HEADER["&lt;div class='control-head'&gt;<br/>&lt;label&gt; + &lt;span class='control-value'&gt;"]
        INPUT{"field.type?"}
        SELECT["&lt;select&gt; with &lt;option&gt;s"]
        RANGE["&lt;input type='range'&gt;<br/>min/max/step"]
        COLOR["&lt;input type='color'&gt;"]
    end

    subgraph "Control Registry"
        REG["controlRegistry Map<br/>key → { field, input, valueEl }"]
    end

    DEF --> SECTION
    SECTION --> CTRL_DIV
    CTRL_DIV --> HEADER
    CTRL_DIV --> INPUT

    CAT --> RESOLVE
    RESOLVE --> INPUT

    INPUT -->|"select"| SELECT
    INPUT -->|"range"| RANGE
    INPUT -->|"color"| COLOR

    SELECT --> REG
    RANGE --> REG
    COLOR --> REG
```

## State Sync Cycle

```mermaid
flowchart TD
    A["User changes input"] --> B["input/change event"]
    B --> C["coerceFieldValue(field, raw, catalog)"]
    C --> D["runtime.state[key] = value"]
    D --> E["applyStateToController()"]
    E --> F["sanitizeState()"]
    F --> G["controller.setState(state)"]
    G --> H["syncControlsFromState()"]
    H --> I["For each control in registry:<br/>input.value = state[key]<br/>valueEl.textContent = formatted"]
    I --> J["publishPresetText()"]
    J --> K["presetJsonEl.value =<br/>JSON.stringify(state, null, 2)"]

    L["Paste JSON + Apply"] --> M["JSON.parse(text)"]
    M --> F
```

## Control Schema Types

### `select`
```js
{ key: "mode", label: "Animation", type: "select",
  options: ["idle", "wave", "celebrate"],  // static fallback
  catalogKey: "modes" }                     // dynamic override from getCatalog()
```
- Generates `<select>` element
- `catalogKey` allows controllers to provide runtime-dynamic options
- Special handling for `propName` field: always includes `NO_PROP_VALUE` ("__none__")

### `range`
```js
{ key: "scale", label: "Body Scale", type: "range",
  min: 0.35, max: 2.2, step: 0.01 }
```
- Generates `<input type="range">`
- Values clamped to [min, max] by `coerceFieldValue()`
- Display precision auto-detected from step decimals
- Optional `format: "speed"` for `1.00x` display

### `color`
```js
{ key: "metalColor", label: "Metal", type: "color" }
```
- Generates `<input type="color">`
- Values stored as hex strings (e.g., `"#e7edf6"`)

## Control Sections per Avatar

| Avatar | Sections |
|--------|----------|
| Clippy | Behavior (mode, expression, prop, speed), Prop Placement (7 fields), Shape (19 fields), Materials (9 fields) |
| Pushy/Tacky | Behavior (mode, expression, prop, speed), Prop Placement (7 fields), Shape (15 fields), Materials (10 fields) |
| Towely | Behavior (mode, expression, prop, speed), Prop Placement (7 fields), Shape (19 fields), Materials (12 fields) |

## Preset System

The JSON textarea provides import/export of the full state:

- **Copy**: `JSON.stringify(runtime.state, null, 2)` → clipboard
- **Apply**: `JSON.parse(text)` → merge with current state → sanitize → apply
- **Reset**: Copy `definition.defaultState` → sanitize → apply
- **Randomize**: Generate random values within field bounds → sanitize → apply
