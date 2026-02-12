# Character Profiles & Presentation Mode

## Character Profiles

Each avatar has an editable character profile that shapes voice session behavior.

### Profile Data Flow

```mermaid
flowchart TD
    subgraph "Storage"
        LS["localStorage<br/>key: office-avatar-studio:<br/>character-profiles:v1"]
        DEFAULT["Default profile from<br/>AVATAR_DEFINITIONS[id].label"]
    end

    subgraph "Profile Fields"
        NAME["name (max 80 chars)"]
        BG["background (max 420 chars)"]
        PERS["personality (max 420 chars)"]
    end

    subgraph "UI (studio.js)"
        NAME_INPUT["#characterName input"]
        BG_INPUT["#characterBackground textarea"]
        PERS_INPUT["#characterPersonality textarea"]
        SAVE_BTN["Save Character button"]
    end

    subgraph "Voice Integration"
        BUILD["buildVoiceSessionInstructions()"]
        GREETING["buildVoiceGreetingInstructions()"]
        INSTRUCTIONS["'You are {name}, {description}.<br/>Keep responses short and clear.<br/>Background: {background}.<br/>Personality: {personality}.'"]
    end

    subgraph "Voice Providers"
        OA["OpenAI Realtime<br/>session instructions"]
        EL["ElevenLabs<br/>session instructions"]
    end

    LS --> NAME
    LS --> BG
    LS --> PERS
    DEFAULT --> NAME

    NAME --> NAME_INPUT
    BG --> BG_INPUT
    PERS --> PERS_INPUT

    NAME_INPUT -->|"input event"| BUILD
    BG_INPUT -->|"input event"| BUILD
    PERS_INPUT -->|"input event"| BUILD
    SAVE_BTN -->|"click"| LS

    BUILD --> INSTRUCTIONS
    GREETING --> INSTRUCTIONS

    INSTRUCTIONS --> OA
    INSTRUCTIONS --> EL
```

### Profile Lifecycle

1. **Load**: On init, profiles are loaded from localStorage (or defaults from avatar labels)
2. **Edit**: Input changes trigger a 500ms debounced autosave
3. **Save**: Explicit save button also triggers `syncSessionContext()` on both voice providers
4. **Switch avatar**: `loadAvatar()` calls `syncCharacterProfileInputs()` to update the form
5. **Voice session**: `buildVoiceSessionInstructions()` assembles profile into LLM system prompt

### Instruction Building

```js
buildVoiceSessionInstructions() → string:
  "You are {displayName}, {description}."
  "You are speaking with the user by realtime voice."
  "Keep responses short, clear, and conversational unless the user asks for details."
  "Ask one focused follow-up question when useful."
  + "Character background: {background}."  // if provided
  + "Personality and behavior: {personality}."  // if provided
```

---

## Presentation Mode

`clippy-presentation.html` provides a standalone Clippy presenter that cycles through Excalidraw slides.

### Presentation Flow

```mermaid
flowchart TD
    subgraph "Input Sources"
        DEMO["Built-in demo deck<br/>(DEMO_RISK_STEPS)"]
        FILE["User-uploaded<br/>.excalidraw file"]
    end

    subgraph "Deck Building"
        DEMO_DECK["createDemoDeck()<br/>→ generate Excalidraw elements<br/>per step via convertToExcalidrawElements()"]
        PARSE["parseSceneFromFile(file)<br/>→ loadFromBlob() or JSON.parse()"]
        BUILD["buildDeckFromScene(sceneData)<br/>→ find frame elements<br/>→ sort by position<br/>→ extract text per frame"]
    end

    subgraph "Slide Structure"
        STEP["Step {<br/>  title,<br/>  line (narrator text),<br/>  points[] (key bullets),<br/>  sceneElements[],<br/>  state (Clippy mode/expression/prop)<br/>}"]
    end

    subgraph "Rendering"
        EXCALI["exportToCanvas({<br/>  elements, appState, files<br/>})"]
        FIT["Scale + center canvas<br/>into board viewport"]
        CLIPPY["Clippy controller<br/>setState(step.state)"]
        UI_UPDATE["Update title, line,<br/>key points, step list"]
    end

    subgraph "Navigation"
        PREV["Prev button"]
        NEXT["Next button"]
        AUTO["Autoplay (6.5s interval)"]
        CLICK["Step list click"]
    end

    DEMO --> DEMO_DECK
    FILE --> PARSE
    PARSE --> BUILD

    DEMO_DECK --> STEP
    BUILD --> STEP

    STEP --> EXCALI
    EXCALI --> FIT
    STEP --> CLIPPY
    STEP --> UI_UPDATE

    PREV --> |"applyStep(index - 1)"| STEP
    NEXT --> |"applyStep(index + 1)"| STEP
    AUTO --> |"setInterval"| STEP
    CLICK --> |"applyStep(index)"| STEP
```

### Excalidraw Scene Parsing

When a user uploads an `.excalidraw` file:

1. **Load**: `loadFromBlob()` (Excalidraw API) or fallback `JSON.parse()`
2. **Find frames**: Filter elements with `type === "frame"`, sort by Y then X position
3. **Per frame**: Find child elements inside frame bounds, extract text blocks
4. **Build steps**: First text block → title, remaining → key points
5. **Assign Clippy state**: Cycle through animation modes and expressions per slide

### Clippy State Cycling

Each slide gets a Clippy mode and expression based on its index:

```
Modes:      wave → think → point → idle → celebrate → wave → ...
Expressions: happy → focused → neutral → surprised → happy → ...
```

Special overrides:
- Slides with "risk/critical/attack" in the title → `expression: "focused"`
- Slides with "decision/go-live" in the title → `expression: "happy"`
- First and last slides get the `topHat` prop

### Scene Structure

The presentation uses its own Three.js scene (separate from the studio):
- Clippy positioned at center stage on a rotating platform
- Fog, hemisphere light, fill light, rim light, ambient light
- OrbitControls with restricted zoom/pan
- Decorative ring element with continuous rotation
