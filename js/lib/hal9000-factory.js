import { clamp, safeDisposeObject3D } from "./utils.js";

function configureShadow(mesh, { cast = true, receive = true } = {}) {
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
}

function createVentBar(THREE, material) {
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.04, 0.06), material);
  configureShadow(bar, { cast: false, receive: true });
  return bar;
}

function createScrew(THREE, material) {
  const screw = new THREE.Mesh(
    new THREE.CylinderGeometry(0.036, 0.036, 0.03, 14),
    material,
  );
  screw.rotation.x = Math.PI / 2;
  configureShadow(screw, { cast: false, receive: true });
  return screw;
}

export function createHal9000Avatar(THREE, currentState = {}) {
  const group = new THREE.Group();
  group.name = "hal9000-avatar";

  const bodyShell = new THREE.Group();
  bodyShell.name = "hal9000-body-shell";
  group.add(bodyShell);

  const panelRoot = new THREE.Group();
  panelRoot.name = "hal9000-panel-root";
  bodyShell.add(panelRoot);

  const faceRoot = new THREE.Group();
  faceRoot.name = "hal9000-face-root";
  panelRoot.add(faceRoot);

  const materials = {
    panel: new THREE.MeshPhysicalMaterial({
      color: currentState.panelColor || "#171b25",
      metalness: clamp(currentState.metalness ?? 0.58, 0, 1),
      roughness: clamp(currentState.roughness ?? 0.32, 0, 1),
      clearcoat: clamp(currentState.clearcoat ?? 0.45, 0, 1),
      clearcoatRoughness: clamp(currentState.clearcoatRoughness ?? 0.21, 0, 1),
    }),
    accent: new THREE.MeshStandardMaterial({
      color: currentState.accentColor || "#0d1017",
      metalness: 0.62,
      roughness: 0.42,
    }),
    bezel: new THREE.MeshPhysicalMaterial({
      color: currentState.bezelColor || "#2d323d",
      metalness: 0.84,
      roughness: 0.22,
      clearcoat: 0.5,
      clearcoatRoughness: 0.18,
    }),
    lensGlass: new THREE.MeshPhysicalMaterial({
      color: currentState.lensColor || "#9e120c",
      emissive: currentState.glowColor || "#ff4526",
      emissiveIntensity: clamp((currentState.glowIntensity ?? 0.68) * 0.2, 0, 1),
      metalness: 0.08,
      roughness: 0.18,
      transmission: 0.22,
      transparent: true,
      opacity: 0.95,
      ior: 1.2,
      thickness: 0.26,
    }),
    iris: new THREE.MeshBasicMaterial({
      color: currentState.irisColor || "#ff4a2c",
    }),
    pupil: new THREE.MeshBasicMaterial({
      color: currentState.pupilColor || "#1a0201",
    }),
    glowRing: new THREE.MeshBasicMaterial({
      color: currentState.glowColor || "#ff4526",
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    glowCore: new THREE.MeshBasicMaterial({
      color: currentState.glowColor || "#ff4526",
      transparent: true,
      opacity: 0.46,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    screw: new THREE.MeshStandardMaterial({
      color: "#3b4454",
      metalness: 0.78,
      roughness: 0.36,
    }),
  };

  const panelBase = new THREE.Mesh(
    new THREE.BoxGeometry(2.56, 3.3, 0.4),
    materials.panel,
  );
  configureShadow(panelBase);
  panelRoot.add(panelBase);

  const panelInset = new THREE.Mesh(
    new THREE.BoxGeometry(2.04, 2.72, 0.1),
    materials.accent,
  );
  panelInset.position.z = 0.151;
  configureShadow(panelInset, { cast: false, receive: true });
  panelRoot.add(panelInset);

  const sideRailGeometry = new THREE.BoxGeometry(0.16, 3.0, 0.18);
  const leftRail = new THREE.Mesh(sideRailGeometry, materials.accent);
  leftRail.position.set(-1.08, 0, 0.146);
  configureShadow(leftRail);
  panelRoot.add(leftRail);

  const rightRail = new THREE.Mesh(sideRailGeometry.clone(), materials.accent);
  rightRail.position.set(1.08, 0, 0.146);
  configureShadow(rightRail);
  panelRoot.add(rightRail);

  const ventRoot = new THREE.Group();
  ventRoot.position.set(0, -1.14, 0.2);
  panelRoot.add(ventRoot);
  for (let i = -3; i <= 3; i += 1) {
    const bar = createVentBar(THREE, materials.accent);
    bar.position.x = i * 0.17;
    ventRoot.add(bar);
  }

  const eyeRoot = new THREE.Group();
  eyeRoot.name = "hal9000-eye-root";
  eyeRoot.position.set(0, 0.28, 0.225);
  panelRoot.add(eyeRoot);

  faceRoot.position.set(0, 0.28, 0.25);

  const bezelOuter = new THREE.Mesh(
    new THREE.TorusGeometry(0.5, 0.08, 18, 72),
    materials.bezel,
  );
  bezelOuter.rotation.x = Math.PI / 2;
  configureShadow(bezelOuter);

  const bezelInner = new THREE.Mesh(
    new THREE.TorusGeometry(0.325, 0.05, 18, 72),
    materials.bezel,
  );
  bezelInner.rotation.x = Math.PI / 2;
  bezelInner.position.z = 0.01;
  configureShadow(bezelInner, { cast: false, receive: true });

  const lensGlass = new THREE.Mesh(
    new THREE.SphereGeometry(0.34, 36, 28),
    materials.lensGlass,
  );
  lensGlass.position.z = 0.024;
  lensGlass.scale.z = 0.46;
  configureShadow(lensGlass, { cast: false, receive: true });

  const iris = new THREE.Mesh(new THREE.CircleGeometry(0.2, 42), materials.iris);
  iris.position.z = 0.162;
  configureShadow(iris, { cast: false, receive: false });

  const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.086, 36), materials.pupil);
  pupil.position.z = 0.164;
  configureShadow(pupil, { cast: false, receive: false });

  const glowRing = new THREE.Mesh(
    new THREE.RingGeometry(0.2, 0.34, 56),
    materials.glowRing,
  );
  glowRing.position.z = 0.163;
  glowRing.renderOrder = 4;

  const glowCore = new THREE.Mesh(
    new THREE.CircleGeometry(0.154, 44),
    materials.glowCore,
  );
  glowCore.position.z = 0.1635;
  glowCore.renderOrder = 5;

  const lensHighlight = new THREE.Mesh(
    new THREE.RingGeometry(0.32, 0.35, 36, 1, Math.PI * 0.17, Math.PI * 0.36),
    new THREE.MeshBasicMaterial({
      color: "#ffd8d0",
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  lensHighlight.position.set(-0.09, 0.11, 0.166);
  lensHighlight.renderOrder = 6;

  eyeRoot.add(
    bezelOuter,
    bezelInner,
    lensGlass,
    iris,
    pupil,
    glowRing,
    glowCore,
    lensHighlight,
  );

  const eyeLight = new THREE.PointLight(
    new THREE.Color(currentState.glowColor || "#ff4526"),
    1.75,
    6,
    2,
  );
  eyeLight.position.set(0, 0, 0.35);
  eyeRoot.add(eyeLight);

  const standStem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.1, 0.56, 18),
    materials.bezel,
  );
  standStem.position.set(0, -1.92, -0.02);
  configureShadow(standStem);
  panelRoot.add(standStem);

  const standBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.44, 0.52, 0.12, 36),
    materials.accent,
  );
  standBase.position.set(0, -2.26, -0.02);
  configureShadow(standBase);
  panelRoot.add(standBase);

  const screwPositions = [
    [-1.06, 1.45, 0.205],
    [1.06, 1.45, 0.205],
    [-1.06, -1.45, 0.205],
    [1.06, -1.45, 0.205],
  ];

  const screws = [];
  for (const [x, y, z] of screwPositions) {
    const screw = createScrew(THREE, materials.screw);
    screw.position.set(x, y, z);
    panelRoot.add(screw);
    screws.push(screw);
  }

  return {
    group,
    bodyShell,
    panelRoot,
    faceRoot,
    eyeRoot,
    panelBase,
    panelInset,
    leftRail,
    rightRail,
    ventRoot,
    bezelOuter,
    bezelInner,
    lensGlass,
    iris,
    pupil,
    glowRing,
    glowCore,
    lensHighlight,
    standStem,
    standBase,
    screws,
    eyeLight,
    materials,
    metrics: {
      groundOffset: 2.32,
    },
    dispose() {
      safeDisposeObject3D(group);
    },
  };
}
