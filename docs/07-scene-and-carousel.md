# Scene & Carousel

Three.js scene graph structure, lighting rig, camera setup, and carousel spring-damper physics.

## Scene Graph Hierarchy

```mermaid
graph TD
    SCENE["THREE.Scene<br/>+ Fog(0x0a1325)"]

    subgraph Lighting
        HEMI["HemisphereLight<br/>sky: #6de8ff<br/>ground: #0c0718<br/>intensity: 1.1"]
        AMBIENT["AmbientLight<br/>#2b4d66, 0.52"]
        KEY["DirectionalLight (key)<br/>#a7f6ff, 1.38<br/>pos: (3.2, 5.8, 4.6)<br/>castShadow: true"]
        FILL["DirectionalLight (fill)<br/>#ff6689, 0.78<br/>pos: (-4.4, 2.4, 4.8)"]
        RIM["PointLight (rim)<br/>#00e7ff, 1.16<br/>pos: (-5.1, 1.4, -3.2)"]
    end

    subgraph "Turntable (stageRig)"
        TURNTABLE["THREE.Group<br/>(turntable root)"]
        BASE["CylinderGeometry<br/>r: 7.6/8.4, h: 0.68<br/>y: -3.3"]
        TOPDECK["CylinderGeometry<br/>r: 6.5/7.1, h: 0.16<br/>y: -2.88"]
        OUTER_RING["TorusGeometry<br/>r: 7.22, tube: 0.1<br/>y: -2.79<br/>emissive: #00e7ff"]
        CENTER["CylinderGeometry<br/>r: 1.45/1.86, h: 0.08<br/>y: -2.74"]
        ORBIT["THREE.Group<br/>(avatarOrbit)"]
    end

    subgraph "Avatar Slots"
        SLOT0["Slot anchor 0<br/>Clippy<br/>angle: 0°"]
        SLOT1["Slot anchor 1<br/>Pushy<br/>angle: 90°"]
        SLOT2["Slot anchor 2<br/>Tacky<br/>angle: 180°"]
        SLOT3["Slot anchor 3<br/>Towely<br/>angle: 270°"]
    end

    subgraph "Avatar Groups (mounted into slots)"
        AV0["clippy controller.group"]
        AV1["pushy controller.group"]
        AV2["tacky controller.group"]
        AV3["towely controller.group"]
    end

    SCENE --> HEMI
    SCENE --> AMBIENT
    SCENE --> KEY
    SCENE --> FILL
    SCENE --> RIM
    SCENE --> TURNTABLE

    TURNTABLE --> BASE
    TURNTABLE --> TOPDECK
    TURNTABLE --> OUTER_RING
    TURNTABLE --> CENTER
    TURNTABLE --> ORBIT

    ORBIT --> SLOT0
    ORBIT --> SLOT1
    ORBIT --> SLOT2
    ORBIT --> SLOT3

    SLOT0 --> AV0
    SLOT1 --> AV1
    SLOT2 --> AV2
    SLOT3 --> AV3
```

## Camera & Controls

| Property | Value |
|----------|-------|
| Camera type | PerspectiveCamera |
| FOV | 45° |
| Position | (0.28, 0.44, 14.2) |
| OrbitControls target | (0, -0.7, 0) |
| Min distance | 7.2 |
| Max distance | 20 |
| Damping | enabled |

## Carousel Physics

The carousel uses a **spring-damper** system to smoothly rotate to the selected avatar:

```mermaid
flowchart LR
    A["focusAvatar(id)"] --> B["targetRotation = -slot.baseAngle"]
    B --> C["Each frame: update(dt)"]
    C --> D["delta = shortestAngleDelta(<br/>current, target)"]
    D --> E["accel = delta × 24"]
    E --> F["velocity += accel × dt"]
    F --> G["velocity × e^(-dt × 7.4)<br/>(damping)"]
    G --> H{"Settled?<br/>|delta| < 0.0006<br/>|velocity| < 0.0006"}
    H -->|"No"| I["currentRotation += velocity × dt"]
    H -->|"Yes"| J["Snap to target"]
    I --> K["turntable.rotation.y = currentRotation"]
    J --> K
```

### Slot Presentation

Each frame, slots are updated based on their angular position relative to the camera:

- **Scale**: Slots closer to the camera (front) are larger (0.58–0.82), with a +0.1 boost for the selected avatar
- **Y position**: Front slots float slightly higher
- **Counter-rotation**: Each slot's Y rotation counteracts the turntable spin so avatars always face the camera

### Decorative Animations

- **Outer ring**: Continuously rotates Z at 0.34 rad/s
- **Center plate**: Continuously rotates Y at -0.42 rad/s

## Renderer Configuration

| Property | Value |
|----------|-------|
| Antialiasing | enabled |
| Alpha | true (transparent background) |
| Pixel ratio | min(devicePixelRatio, 2) |
| Color space | SRGBColorSpace |
| Shadow map | PCFSoftShadowMap, 1024x1024 |
