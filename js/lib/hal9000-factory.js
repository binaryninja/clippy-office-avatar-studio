import { clamp, safeDisposeObject3D } from "./utils.js";

function configureShadow(mesh, { cast = true, receive = true } = {}) {
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
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

function createLabelTexture(THREE) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 80;

  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = "bold 48px 'Courier New', monospace";
    ctx.textAlign = "left";
    ctx.fillStyle = "#8899aa";
    ctx.fillText("HAL", 80, 52);

    ctx.font = "bold 50px 'Courier New', monospace";
    ctx.fillStyle = "#ccddee";
    ctx.fillText("9000", 250, 52);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function createGlowTexture(THREE) {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d");
  if (ctx) {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, "rgba(255,60,20,1)");
    gradient.addColorStop(0.2, "rgba(255,30,10,0.6)");
    gradient.addColorStop(0.5, "rgba(200,0,0,0.2)");
    gradient.addColorStop(1, "rgba(100,0,0,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }

  return new THREE.CanvasTexture(canvas);
}

function createPanelEnvTexture(THREE) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;

  const ctx = canvas.getContext("2d");
  if (ctx) {
    const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    gradient.addColorStop(0, "#331100");
    gradient.addColorStop(0.5, "#110000");
    gradient.addColorStop(1, "#000000");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  return texture;
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

  const panelW = 2.0;
  const panelH = 5.0;
  const panelD = 0.5;
  const frameThickness = 0.15;

  const labelTexture = createLabelTexture(THREE);
  const glowTexture = createGlowTexture(THREE);
  const panelEnvTexture = createPanelEnvTexture(THREE);

  const materials = {
    panel: new THREE.MeshPhysicalMaterial({
      color: currentState.panelColor || "#bbbbbb",
      metalness: clamp(currentState.metalness ?? 0.95, 0, 1),
      roughness: clamp(currentState.roughness ?? 0.12, 0, 1),
      clearcoat: clamp(currentState.clearcoat ?? 0.8, 0, 1),
      clearcoatRoughness: clamp(currentState.clearcoatRoughness ?? 0.05, 0, 1),
      envMap: panelEnvTexture,
      envMapIntensity: 0.95,
    }),
    accent: new THREE.MeshStandardMaterial({
      color: currentState.accentColor || "#0a0a0a",
      metalness: 0.3,
      roughness: 0.7,
    }),
    bezel: new THREE.MeshPhysicalMaterial({
      color: currentState.bezelColor || "#777777",
      metalness: 0.95,
      roughness: 0.1,
      clearcoat: 0.85,
      clearcoatRoughness: 0.08,
      envMap: panelEnvTexture,
      envMapIntensity: 0.85,
    }),
    lensGlass: new THREE.MeshPhysicalMaterial({
      color: currentState.lensColor || "#110000",
      emissive: currentState.glowColor || "#ff2200",
      emissiveIntensity: clamp(0.03 + (currentState.glowIntensity ?? 0.68) * 0.08, 0, 2),
      metalness: 0,
      roughness: 0,
      transmission: 0.8,
      thickness: 1,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
      ior: 1.6,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      envMap: panelEnvTexture,
      envMapIntensity: 1.1,
    }),
    iris: new THREE.MeshPhysicalMaterial({
      color: currentState.irisColor || "#cc1100",
      emissive: currentState.glowColor || "#ff2200",
      emissiveIntensity: clamp(0.22 + (currentState.glowIntensity ?? 0.68) * 0.45, 0.1, 2.5),
      metalness: 0.1,
      roughness: 0.15,
      clearcoat: 0.8,
      clearcoatRoughness: 0.05,
      envMap: panelEnvTexture,
      envMapIntensity: 0.75,
    }),
    pupil: new THREE.MeshStandardMaterial({
      color: currentState.pupilColor || "#ff4422",
      emissive: currentState.glowColor || "#ff2200",
      emissiveIntensity: clamp(0.18 + (currentState.glowIntensity ?? 0.68) * 0.35, 0.1, 3),
      metalness: 0.08,
      roughness: 0.22,
    }),
    glowRing: new THREE.SpriteMaterial({
      map: glowTexture,
      color: currentState.glowColor || "#ff4526",
      transparent: true,
      opacity: 0.12,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    }),
    glowCore: new THREE.SpriteMaterial({
      map: glowTexture,
      color: currentState.glowColor || "#ff4526",
      transparent: true,
      opacity: 0.04,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    }),
    screw: new THREE.MeshStandardMaterial({
      color: "#222222",
      metalness: 0.1,
      roughness: 0.9,
    }),
    cavity: new THREE.MeshStandardMaterial({
      color: "#0a0000",
      metalness: 0.2,
      roughness: 0.9,
      side: THREE.BackSide,
    }),
    cavityBack: new THREE.MeshStandardMaterial({
      color: "#050000",
      roughness: 0.95,
      metalness: 0,
    }),
    nameplate: new THREE.MeshStandardMaterial({
      color: "#1a2a44",
      metalness: 0.4,
      roughness: 0.5,
    }),
    nameplateBorder: new THREE.MeshStandardMaterial({
      color: "#4477aa",
      metalness: 0.5,
      roughness: 0.3,
    }),
    label: new THREE.MeshBasicMaterial({
      map: labelTexture,
      transparent: true,
      toneMapped: false,
    }),
    hotPoint: new THREE.MeshBasicMaterial({
      color: "#ffddaa",
    }),
  };

  const panelBase = new THREE.Mesh(
    new THREE.BoxGeometry(panelW + frameThickness * 2, panelH + frameThickness * 2, panelD),
    materials.panel,
  );
  configureShadow(panelBase);
  panelRoot.add(panelBase);

  const panelInset = new THREE.Mesh(
    new THREE.BoxGeometry(panelW - 0.05, panelH - 0.05, 0.02),
    materials.accent,
  );
  panelInset.position.z = panelD / 2 + 0.005;
  configureShadow(panelInset, { cast: false, receive: true });
  panelRoot.add(panelInset);

  const topBevel = new THREE.Mesh(
    new THREE.BoxGeometry(panelW + 0.1, 0.06, 0.08),
    materials.bezel,
  );
  topBevel.position.set(0, panelH / 2 + 0.02, panelD / 2 - 0.01);
  configureShadow(topBevel);
  panelRoot.add(topBevel);

  const bottomBevel = new THREE.Mesh(
    new THREE.BoxGeometry(panelW + 0.1, 0.06, 0.08),
    materials.bezel,
  );
  bottomBevel.position.set(0, -panelH / 2 - 0.02, panelD / 2 - 0.01);
  configureShadow(bottomBevel);
  panelRoot.add(bottomBevel);

  const leftRail = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, panelH + 0.1, 0.08),
    materials.bezel,
  );
  leftRail.position.set(-panelW / 2 - 0.02, 0, panelD / 2 - 0.01);
  configureShadow(leftRail);
  panelRoot.add(leftRail);

  const rightRail = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, panelH + 0.1, 0.08),
    materials.bezel,
  );
  rightRail.position.set(panelW / 2 + 0.02, 0, panelD / 2 - 0.01);
  configureShadow(rightRail);
  panelRoot.add(rightRail);

  const nameplateBorder = new THREE.Mesh(
    new THREE.BoxGeometry(1.56, 0.38, 0.02),
    materials.nameplateBorder,
  );
  nameplateBorder.position.set(0, panelH / 2 - 0.55, panelD / 2 + 0.01);
  configureShadow(nameplateBorder, { cast: false, receive: true });
  panelRoot.add(nameplateBorder);

  const nameplate = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.32, 0.03),
    materials.nameplate,
  );
  nameplate.position.set(0, panelH / 2 - 0.55, panelD / 2 + 0.02);
  configureShadow(nameplate, { cast: false, receive: true });
  panelRoot.add(nameplate);

  const nameplateLabel = new THREE.Mesh(
    new THREE.PlaneGeometry(1.4, 0.22),
    materials.label,
  );
  nameplateLabel.position.set(0, panelH / 2 - 0.55, panelD / 2 + 0.04);
  panelRoot.add(nameplateLabel);

  const eyeY = Number.isFinite(currentState.eyeY) ? currentState.eyeY : -0.6;
  const eyeZ = Number.isFinite(currentState.eyeZ) ? currentState.eyeZ : 0;

  const eyeRoot = new THREE.Group();
  eyeRoot.name = "hal9000-eye-root";
  eyeRoot.position.set(0, eyeY, panelD / 2 + eyeZ);
  panelRoot.add(eyeRoot);

  faceRoot.position.set(0, eyeY, panelD / 2 + eyeZ);

  const bezelOuter = new THREE.Mesh(
    new THREE.TorusGeometry(0.62, 0.09, 24, 64),
    materials.bezel,
  );
  bezelOuter.position.z = 0.05;
  configureShadow(bezelOuter);

  const bezelInner = new THREE.Mesh(
    new THREE.TorusGeometry(0.52, 0.04, 20, 64),
    materials.bezel,
  );
  bezelInner.position.z = 0.02;
  configureShadow(bezelInner, { cast: false, receive: true });

  const cavity = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.55, 0.35, 64, 1, true),
    materials.cavity,
  );
  cavity.rotation.x = Math.PI / 2;
  cavity.position.z = -0.1;
  configureShadow(cavity, { cast: false, receive: true });

  const cavityBack = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 64),
    materials.cavityBack,
  );
  cavityBack.position.z = -0.28;
  configureShadow(cavityBack, { cast: false, receive: true });

  const iris = new THREE.Mesh(
    new THREE.SphereGeometry(0.42, 48, 48),
    materials.iris,
  );
  iris.position.z = -0.08;
  configureShadow(iris, { cast: false, receive: true });

  const pupil = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 32, 32),
    materials.pupil,
  );
  pupil.position.z = 0.02;
  configureShadow(pupil, { cast: false, receive: true });

  const hotPoint = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 16, 16),
    materials.hotPoint,
  );
  hotPoint.position.z = 0.12;

  const lensGlass = new THREE.Mesh(
    new THREE.SphereGeometry(0.53, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2.2),
    materials.lensGlass,
  );
  lensGlass.rotation.x = -Math.PI / 2;
  lensGlass.position.z = 0.06;
  configureShadow(lensGlass, { cast: false, receive: true });

  const glowRing = new THREE.Sprite(materials.glowRing);
  glowRing.scale.set(2.5, 2.5, 1);
  glowRing.position.z = 0.4;

  const glowCore = new THREE.Sprite(materials.glowCore);
  glowCore.scale.set(4, 4, 1);
  glowCore.position.z = 0.3;

  const lensHighlight = new THREE.Mesh(
    new THREE.RingGeometry(0.45, 0.52, 40, 1, Math.PI * 0.12, Math.PI * 0.3),
    new THREE.MeshBasicMaterial({
      color: "#ffd8d0",
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
  );
  lensHighlight.position.set(-0.11, 0.12, 0.18);
  lensHighlight.renderOrder = 6;

  eyeRoot.add(
    bezelOuter,
    bezelInner,
    cavity,
    cavityBack,
    iris,
    pupil,
    hotPoint,
    lensGlass,
    glowRing,
    glowCore,
    lensHighlight,
  );

  const eyeLight = new THREE.PointLight(
    new THREE.Color(currentState.glowColor || "#ff2200"),
    4,
    5,
    2,
  );
  eyeLight.position.set(0, 0, 0.8);
  eyeLight.castShadow = true;
  eyeRoot.add(eyeLight);

  const ventRoot = new THREE.Group();
  ventRoot.position.set(0, -panelH / 2 + 0.7, panelD / 2 + 0.01);
  panelRoot.add(ventRoot);
  const grilleBack = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 1.0, 0.02),
    materials.bezel,
  );
  configureShadow(grilleBack, { cast: false, receive: true });
  ventRoot.add(grilleBack);

  const holeRadius = 0.018;
  const spacingX = 0.07;
  const spacingY = 0.07;
  const grilleW = 1.5;
  const grilleH = 0.9;
  const cols = Math.floor(grilleW / spacingX);
  const rows = Math.floor(grilleH / spacingY);
  const holeCount = cols * rows;

  const holeGeo = new THREE.CylinderGeometry(holeRadius, holeRadius, 0.04, 8);
  const holeMesh = new THREE.InstancedMesh(holeGeo, materials.screw, holeCount);
  configureShadow(holeMesh, { cast: false, receive: true });

  const dummy = new THREE.Object3D();
  let idx = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = -grilleW / 2 + spacingX / 2 + col * spacingX;
      const y = -grilleH / 2 + spacingY / 2 + row * spacingY;
      dummy.position.set(x, y, 0.01);
      dummy.rotation.x = Math.PI / 2;
      dummy.updateMatrix();
      holeMesh.setMatrixAt(idx, dummy.matrix);
      idx += 1;
    }
  }
  holeMesh.instanceMatrix.needsUpdate = true;
  ventRoot.add(holeMesh);

  const standStem = new THREE.Group();
  standStem.name = "hal9000-stand-stem";
  panelRoot.add(standStem);

  const standBase = new THREE.Group();
  standBase.name = "hal9000-stand-base";
  panelRoot.add(standBase);

  const screwPositions = [
    [-panelW / 2 - 0.06, panelH / 2 + 0.07, panelD / 2 + 0.03],
    [panelW / 2 + 0.06, panelH / 2 + 0.07, panelD / 2 + 0.03],
    [-panelW / 2 - 0.06, -panelH / 2 - 0.07, panelD / 2 + 0.03],
    [panelW / 2 + 0.06, -panelH / 2 - 0.07, panelD / 2 + 0.03],
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
    hotPoint,
    glowRing,
    glowCore,
    lensHighlight,
    standStem,
    standBase,
    screws,
    eyeLight,
    materials,
    metrics: {
      groundOffset: 2.65,
      lensZScale: 1,
      panelWidth: panelW,
      panelHeight: panelH,
      panelDepth: panelD,
      frameThickness,
    },
    dispose() {
      safeDisposeObject3D(group);
      labelTexture.dispose();
      glowTexture.dispose();
      panelEnvTexture.dispose();
    },
  };
}
