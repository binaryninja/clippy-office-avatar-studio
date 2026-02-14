import { clamp } from "./utils.js";

const BODY_RADIUS = 1.0;
const FOOT_RADIUS = 0.16;
const FOOT_BOTTOM_OFFSET = -1.08;

function configureShadow(mesh, { cast = true, receive = true } = {}) {
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
}

function createPuffballGeometry(THREE) {
  const geo = new THREE.IcosahedronGeometry(BODY_RADIUS, 4);
  const pos = geo.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const r = Math.sqrt(x * x + y * y + z * z);
    if (r < 0.001) continue;

    const nx = x / r;
    const ny = y / r;
    const nz = z / r;

    const noise =
      Math.sin(nx * 13.7 + ny * 7.3) *
      Math.cos(nz * 11.3 + nx * 5.7) *
      0.5 +
      0.5;
    const displacement = BODY_RADIUS * (1.0 + noise * 0.035);

    pos.setXYZ(i, nx * displacement, ny * displacement, nz * displacement);
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

function createEarGeometry(THREE) {
  const geo = new THREE.ConeGeometry(0.18, 0.52, 12);
  const pos = geo.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const normalizedY = (y + 0.26) / 0.52;
    const taper = 1 - normalizedY * normalizedY * 0.3;
    pos.setX(i, pos.getX(i) * taper);
    pos.setZ(i, pos.getZ(i) * taper);
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

function disposeObject3D(root) {
  const materialSet = new Set();
  root.traverse((node) => {
    if (!node.isMesh) return;
    if (node.geometry) node.geometry.dispose();
    if (Array.isArray(node.material)) {
      for (const m of node.material) {
        if (m) materialSet.add(m);
      }
    } else if (node.material) {
      materialSet.add(node.material);
    }
  });
  for (const m of materialSet) m.dispose();
}

export function createPuffballAvatar(THREE, currentState = {}) {
  const group = new THREE.Group();
  group.name = "puffball-avatar";

  const bodyRoot = new THREE.Group();
  bodyRoot.name = "puffball-body-root";

  const bodyShell = new THREE.Group();
  bodyShell.name = "puffball-body-shell";

  const faceRoot = new THREE.Group();
  faceRoot.name = "puffball-face-root";

  const earRoot = new THREE.Group();
  earRoot.name = "puffball-ears";

  const limbRoot = new THREE.Group();
  limbRoot.name = "puffball-limbs";

  group.add(bodyRoot, earRoot, limbRoot);
  bodyRoot.add(bodyShell, faceRoot);

  const sheenBase = new THREE.Color(currentState.bodyColor || "#9b72cf");
  const sheenTint = sheenBase.clone().lerp(new THREE.Color("#ffffff"), 0.35);

  const materials = {
    body: new THREE.MeshPhysicalMaterial({
      color: currentState.bodyColor || "#9b72cf",
      roughness: 0.82,
      metalness: 0.0,
      sheen: 1.0,
      sheenColor: sheenTint,
      sheenRoughness: 0.4,
      clearcoat: clamp(currentState.clearcoat ?? 0.12, 0, 1),
      clearcoatRoughness: clamp(currentState.clearcoatRoughness ?? 0.5, 0, 1),
      emissive: new THREE.Color(currentState.glowColor || "#6b3fa0"),
      emissiveIntensity: clamp((currentState.glowIntensity ?? 0.08) * 0.18, 0, 1),
    }),
    belly: new THREE.MeshPhysicalMaterial({
      color: currentState.bellyColor || "#e8b4d8",
      roughness: 0.78,
      metalness: 0.0,
      sheen: 0.8,
      sheenColor: new THREE.Color(currentState.bellyColor || "#e8b4d8")
        .clone()
        .lerp(new THREE.Color("#ffffff"), 0.25),
      sheenRoughness: 0.45,
    }),
    earInner: new THREE.MeshPhysicalMaterial({
      color: currentState.bellyColor || "#e8b4d8",
      roughness: 0.75,
      metalness: 0.0,
      sheen: 0.6,
      sheenColor: new THREE.Color("#ffccee"),
      sheenRoughness: 0.5,
    }),
    eyeWhite: new THREE.MeshStandardMaterial({
      color: currentState.eyeColor || "#f8fafc",
      metalness: 0.0,
      roughness: 0.36,
    }),
    dark: new THREE.MeshStandardMaterial({
      color: currentState.darkColor || "#1a0a2e",
      metalness: 0.1,
      roughness: 0.5,
    }),
    tooth: new THREE.MeshStandardMaterial({
      color: "#f4f7ff",
      metalness: 0.02,
      roughness: 0.3,
    }),
    mouthInner: new THREE.MeshStandardMaterial({
      color: "#4a0028",
      metalness: 0.0,
      roughness: 0.8,
    }),
  };

  // Body sphere
  const bodyGeo = createPuffballGeometry(THREE);
  const bodyMesh = new THREE.Mesh(bodyGeo, materials.body);
  bodyMesh.scale.set(1.08, 0.94, 0.98);
  configureShadow(bodyMesh);
  bodyShell.add(bodyMesh);

  // Belly patch (front-facing flattened sphere)
  const bellyMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.48, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.5),
    materials.belly,
  );
  bellyMesh.position.set(0, -0.12, 0.72);
  bellyMesh.scale.set(1.0, 1.1, 0.28);
  configureShadow(bellyMesh, { cast: false, receive: false });
  bodyShell.add(bellyMesh);

  // Face root positioned on front of sphere
  faceRoot.position.set(0, 0.15, 0.82);

  // Eyes - BIG
  const leftEyeRoot = new THREE.Group();
  leftEyeRoot.position.set(-0.22, 0.06, 0.16);
  const leftEye = new THREE.Mesh(
    new THREE.CircleGeometry(0.18, 32),
    materials.eyeWhite,
  );
  leftEye.scale.set(1.0, 1.15, 1);
  const leftPupil = new THREE.Mesh(
    new THREE.CircleGeometry(0.07, 22),
    materials.dark,
  );
  leftPupil.position.set(0, 0, 0.003);
  configureShadow(leftEye, { cast: false, receive: false });
  configureShadow(leftPupil, { cast: false, receive: false });
  leftEyeRoot.add(leftEye, leftPupil);

  const rightEyeRoot = new THREE.Group();
  rightEyeRoot.position.set(0.22, 0.06, 0.16);
  const rightEye = new THREE.Mesh(
    new THREE.CircleGeometry(0.18, 32),
    materials.eyeWhite,
  );
  rightEye.scale.set(1.0, 1.15, 1);
  const rightPupil = new THREE.Mesh(
    new THREE.CircleGeometry(0.07, 22),
    materials.dark,
  );
  rightPupil.position.set(0, 0, 0.003);
  configureShadow(rightEye, { cast: false, receive: false });
  configureShadow(rightPupil, { cast: false, receive: false });
  rightEyeRoot.add(rightEye, rightPupil);

  // Brows
  const leftBrow = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.028, 0.01),
    materials.dark,
  );
  leftBrow.position.set(-0.24, 0.28, 0.15);
  configureShadow(leftBrow, { cast: false, receive: false });

  const rightBrow = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.028, 0.01),
    materials.dark,
  );
  rightBrow.position.set(0.24, 0.28, 0.15);
  configureShadow(rightBrow, { cast: false, receive: false });

  // Mouth
  const mouthRoot = new THREE.Group();
  mouthRoot.position.set(0, -0.16, 0.17);

  const smile = new THREE.Mesh(
    new THREE.RingGeometry(0.06, 0.074, 24, 1, Math.PI * 0.08, Math.PI * 0.84),
    materials.dark,
  );
  smile.rotation.z = Math.PI;
  configureShadow(smile, { cast: false, receive: false });

  // Mouth cavity (visible when mouth opens)
  const mouthCavity = new THREE.Mesh(
    new THREE.CircleGeometry(0.065, 20),
    materials.mouthInner,
  );
  mouthCavity.position.set(0, -0.02, -0.003);
  mouthCavity.scale.set(1.2, 0.5, 1);
  mouthCavity.visible = false;
  configureShadow(mouthCavity, { cast: false, receive: false });

  // Fangs
  const fangGeo = new THREE.ConeGeometry(0.018, 0.055, 6);
  const leftFang = new THREE.Mesh(fangGeo, materials.tooth);
  leftFang.position.set(-0.04, -0.045, 0.005);
  leftFang.rotation.z = Math.PI;
  configureShadow(leftFang, { cast: false, receive: false });

  const rightFang = new THREE.Mesh(fangGeo.clone(), materials.tooth);
  rightFang.position.set(0.04, -0.045, 0.005);
  rightFang.rotation.z = Math.PI;
  configureShadow(rightFang, { cast: false, receive: false });

  mouthRoot.add(smile, mouthCavity, leftFang, rightFang);

  faceRoot.add(leftEyeRoot, rightEyeRoot, leftBrow, rightBrow, mouthRoot);

  // Ears - pointy gremlin ears
  const earGeo = createEarGeometry(THREE);
  const earInnerGeo = new THREE.ConeGeometry(0.1, 0.36, 10);

  const leftEar = new THREE.Group();
  const leftEarOuter = new THREE.Mesh(earGeo, materials.body);
  const leftEarInner = new THREE.Mesh(earInnerGeo, materials.earInner);
  leftEarInner.position.set(0, -0.02, 0.04);
  leftEar.add(leftEarOuter, leftEarInner);
  leftEar.position.set(-0.58, 0.72, 0.05);
  leftEar.rotation.z = 0.45;
  leftEar.rotation.x = -0.1;
  configureShadow(leftEarOuter);
  configureShadow(leftEarInner, { cast: false, receive: false });

  const rightEar = new THREE.Group();
  const rightEarOuter = new THREE.Mesh(earGeo.clone(), materials.body);
  const rightEarInner = new THREE.Mesh(earInnerGeo.clone(), materials.earInner);
  rightEarInner.position.set(0, -0.02, 0.04);
  rightEar.add(rightEarOuter, rightEarInner);
  rightEar.position.set(0.58, 0.72, 0.05);
  rightEar.rotation.z = -0.45;
  rightEar.rotation.x = -0.1;
  configureShadow(rightEarOuter);
  configureShadow(rightEarInner, { cast: false, receive: false });

  earRoot.add(leftEar, rightEar);

  // Arms - tiny nubs
  const armGeo = new THREE.CapsuleGeometry(0.1, 0.18, 8, 12);
  const leftArm = new THREE.Group();
  const leftArmMesh = new THREE.Mesh(armGeo, materials.body);
  leftArm.add(leftArmMesh);
  leftArm.position.set(-0.98, -0.08, 0.12);
  leftArm.rotation.z = 0.6;
  configureShadow(leftArmMesh);

  const rightArm = new THREE.Group();
  const rightArmMesh = new THREE.Mesh(armGeo.clone(), materials.body);
  rightArm.add(rightArmMesh);
  rightArm.position.set(0.98, -0.08, 0.12);
  rightArm.rotation.z = -0.6;
  configureShadow(rightArmMesh);

  limbRoot.add(leftArm, rightArm);

  // Feet - small round spheres
  const footGeo = new THREE.SphereGeometry(FOOT_RADIUS, 16, 12);

  const leftFoot = new THREE.Mesh(footGeo, materials.body);
  leftFoot.position.set(-0.3, FOOT_BOTTOM_OFFSET, 0.14);
  leftFoot.scale.set(1.2, 0.8, 1.3);
  configureShadow(leftFoot);

  const rightFoot = new THREE.Mesh(footGeo.clone(), materials.body);
  rightFoot.position.set(0.3, FOOT_BOTTOM_OFFSET, 0.14);
  rightFoot.scale.set(1.2, 0.8, 1.3);
  configureShadow(rightFoot);

  limbRoot.add(leftFoot, rightFoot);

  return {
    group,
    materials,
    bodyRoot,
    bodyShell,
    bodyMesh,
    bellyMesh,
    faceRoot,
    leftEyeRoot,
    rightEyeRoot,
    leftEye,
    rightEye,
    leftPupil,
    rightPupil,
    leftBrow,
    rightBrow,
    mouthRoot,
    smile,
    mouthCavity,
    leftFang,
    rightFang,
    leftEar,
    rightEar,
    leftArm,
    rightArm,
    leftFoot,
    rightFoot,
    earRoot,
    limbRoot,
    metrics: {
      bodyRadius: BODY_RADIUS,
      footRadius: FOOT_RADIUS,
      footBottomOffset: FOOT_BOTTOM_OFFSET,
    },
    dispose() {
      disposeObject3D(group);
    },
  };
}
