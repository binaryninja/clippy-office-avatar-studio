import { clamp } from "./utils.js";

const BODY_DEPTH = 0.34;
const FOLD_DEPTH = 0.08;
const BODY_TOP_Y = 2.42;
const BODY_BOTTOM_Y = -2.42;
const LEG_TOP_Y = -2.58;
const SHOE_RADIUS = 0.19;

function createBodyGeometry(THREE) {
  const shape = new THREE.Shape();
  shape.moveTo(-1.25, 2.28);
  shape.quadraticCurveTo(0, 2.62, 1.25, 2.28);
  shape.lineTo(1.04, -2.16);
  shape.quadraticCurveTo(0, -2.55, -1.04, -2.16);
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: BODY_DEPTH,
    bevelEnabled: true,
    bevelSegments: 4,
    bevelSize: 0.045,
    bevelThickness: 0.05,
    curveSegments: 40,
    steps: 1,
  });

  geometry.translate(0, 0, -BODY_DEPTH * 0.5);
  geometry.computeVertexNormals();
  return geometry;
}

function createFoldGeometry(THREE) {
  const shape = new THREE.Shape();
  shape.moveTo(-1.25, 2.27);
  shape.quadraticCurveTo(0, 2.56, 1.25, 2.27);
  shape.lineTo(1.18, 1.86);
  shape.quadraticCurveTo(0, 2.1, -1.18, 1.86);
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: FOLD_DEPTH,
    bevelEnabled: false,
    curveSegments: 32,
    steps: 1,
  });

  geometry.translate(0, 0, BODY_DEPTH * 0.33);
  geometry.computeVertexNormals();
  return geometry;
}

function configureShadow(mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
}

function createStripe(THREE, material, y, width = 2.2, height = 0.07) {
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.03), material);
  stripe.position.set(0, y, BODY_DEPTH * 0.74);
  configureShadow(stripe);
  return stripe;
}

function createArm(THREE, material) {
  const shoulder = new THREE.Group();

  const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.62, 8, 14), material);
  upper.position.y = -0.36;
  configureShadow(upper);
  shoulder.add(upper);

  const elbow = new THREE.Group();
  elbow.position.y = -0.73;
  shoulder.add(elbow);

  const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.086, 0.54, 8, 14), material);
  forearm.position.y = -0.31;
  configureShadow(forearm);
  elbow.add(forearm);

  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.17, 18, 14), material);
  hand.position.set(0, -0.67, 0);
  hand.scale.set(1, 1.05, 0.86);
  configureShadow(hand);
  elbow.add(hand);

  return {
    shoulder,
    elbow,
  };
}

function disposeObject3D(root) {
  const materialSet = new Set();

  root.traverse((node) => {
    if (!node.isMesh) return;

    if (node.geometry) {
      node.geometry.dispose();
    }

    if (Array.isArray(node.material)) {
      for (const material of node.material) {
        if (material) materialSet.add(material);
      }
      return;
    }

    if (node.material) {
      materialSet.add(node.material);
    }
  });

  for (const material of materialSet) {
    material.dispose();
  }
}

export function createTowelyAvatar(THREE, currentState = {}) {
  const group = new THREE.Group();
  group.name = "towely-avatar";

  const bodyRoot = new THREE.Group();
  bodyRoot.name = "towely-body-root";

  const bodyShell = new THREE.Group();
  bodyShell.name = "towely-body-shell";

  const faceRoot = new THREE.Group();
  faceRoot.name = "towely-face-root";

  const limbRoot = new THREE.Group();
  limbRoot.name = "towely-limbs";

  const legRoot = new THREE.Group();
  legRoot.name = "towely-legs";

  group.add(bodyRoot, limbRoot, legRoot);
  bodyRoot.add(bodyShell, faceRoot);

  const materials = {
    cloth: new THREE.MeshPhysicalMaterial({
      color: currentState.bodyColor || "#8b8fbe",
      metalness: clamp(currentState.metalness ?? 0.12, 0, 1),
      roughness: clamp(currentState.roughness ?? 0.62, 0, 1),
      clearcoat: clamp(currentState.clearcoat ?? 0.2, 0, 1),
      clearcoatRoughness: clamp(currentState.clearcoatRoughness ?? 0.58, 0, 1),
      emissive: new THREE.Color(currentState.glowColor || "#2f3048"),
      emissiveIntensity: clamp((currentState.glowIntensity ?? 0.08) * 0.22, 0, 1),
    }),
    fold: new THREE.MeshPhysicalMaterial({
      color: currentState.foldColor || "#7e83b3",
      metalness: clamp((currentState.metalness ?? 0.12) * 0.42, 0, 1),
      roughness: clamp((currentState.roughness ?? 0.62) * 0.84, 0, 1),
      clearcoat: clamp(currentState.clearcoat ?? 0.2, 0, 1),
      clearcoatRoughness: clamp((currentState.clearcoatRoughness ?? 0.58) * 0.88, 0, 1),
      emissive: new THREE.Color(currentState.glowColor || "#2f3048"),
      emissiveIntensity: clamp((currentState.glowIntensity ?? 0.08) * 0.12, 0, 1),
    }),
    stripe: new THREE.MeshStandardMaterial({
      color: currentState.stripeColor || "#d9dcf2",
      metalness: 0.08,
      roughness: 0.44,
      emissive: new THREE.Color(currentState.glowColor || "#2f3048"),
      emissiveIntensity: clamp((currentState.glowIntensity ?? 0.08) * 0.32, 0, 1),
    }),
    skin: new THREE.MeshStandardMaterial({
      color: currentState.skinColor || "#e8d2b0",
      metalness: 0.02,
      roughness: 0.74,
    }),
    hair: new THREE.MeshStandardMaterial({
      color: currentState.hairColor || "#8e90be",
      metalness: 0.04,
      roughness: 0.58,
    }),
    dark: new THREE.MeshStandardMaterial({
      color: currentState.darkColor || "#111318",
      metalness: 0.2,
      roughness: 0.4,
    }),
    tooth: new THREE.MeshStandardMaterial({
      color: "#f4f7ff",
      metalness: 0.04,
      roughness: 0.36,
    }),
    tongue: new THREE.MeshStandardMaterial({
      color: "#cc474f",
      metalness: 0,
      roughness: 0.62,
    }),
    shoe: new THREE.MeshStandardMaterial({
      color: currentState.shoeColor || "#111318",
      metalness: 0.34,
      roughness: 0.22,
      emissive: new THREE.Color(currentState.glowColor || "#2f3048"),
      emissiveIntensity: clamp((currentState.glowIntensity ?? 0.08) * 0.18, 0, 1),
    }),
  };

  const bodyMesh = new THREE.Mesh(createBodyGeometry(THREE), materials.cloth);
  configureShadow(bodyMesh);
  bodyShell.add(bodyMesh);

  const foldMesh = new THREE.Mesh(createFoldGeometry(THREE), materials.fold);
  configureShadow(foldMesh);
  bodyShell.add(foldMesh);

  const stripes = [
    createStripe(THREE, materials.stripe, 1.6, 2.24, 0.08),
    createStripe(THREE, materials.stripe, 1.39, 2.2, 0.06),
    createStripe(THREE, materials.stripe, -1.92, 2.26, 0.08),
    createStripe(THREE, materials.stripe, -2.15, 2.2, 0.06),
  ];
  bodyShell.add(...stripes);

  faceRoot.position.set(0, 0.32, BODY_DEPTH * 0.76);

  const leftCheek = new THREE.Mesh(new THREE.SphereGeometry(0.38, 24, 18), materials.skin);
  leftCheek.position.set(-0.28, 0.07, 0.05);
  leftCheek.scale.set(1, 1, 0.58);
  configureShadow(leftCheek);

  const rightCheek = new THREE.Mesh(new THREE.SphereGeometry(0.38, 24, 18), materials.skin);
  rightCheek.position.set(0.28, 0.03, 0.05);
  rightCheek.scale.set(1, 1, 0.58);
  configureShadow(rightCheek);

  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.52, 32, 22), materials.hair);
  hairCap.position.set(0, 0.37, 0.1);
  hairCap.scale.set(1.03, 0.58, 0.35);
  configureShadow(hairCap);

  const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 18, 14), materials.dark);
  leftEye.position.set(-0.2, 0.02, 0.22);
  configureShadow(leftEye);

  const rightEye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 18, 14), materials.dark);
  rightEye.position.set(0.2, -0.01, 0.22);
  configureShadow(rightEye);

  const leftBrow = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.075, 0.05), materials.dark);
  leftBrow.position.set(-0.34, 0.48, 0.2);
  configureShadow(leftBrow);

  const rightBrow = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.075, 0.05), materials.dark);
  rightBrow.position.set(0.34, 0.48, 0.2);
  configureShadow(rightBrow);

  const mouthRoot = new THREE.Group();
  mouthRoot.position.set(0, -0.36, 0.2);

  const mouthShell = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.5, 8, 14), materials.dark);
  mouthShell.rotation.z = Math.PI / 2;
  configureShadow(mouthShell);

  const leftTooth = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.13, 0.04), materials.tooth);
  leftTooth.position.set(-0.12, 0.03, 0.15);

  const rightTooth = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.13, 0.04), materials.tooth);
  rightTooth.position.set(0.02, 0.03, 0.15);

  const tongue = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.05), materials.tongue);
  tongue.position.set(0.08, -0.06, 0.14);

  mouthRoot.add(mouthShell, leftTooth, rightTooth, tongue);

  faceRoot.add(
    leftCheek,
    rightCheek,
    hairCap,
    leftEye,
    rightEye,
    leftBrow,
    rightBrow,
    mouthRoot,
  );

  const leftArm = createArm(THREE, materials.skin);
  const rightArm = createArm(THREE, materials.skin);
  limbRoot.add(leftArm.shoulder, rightArm.shoulder);

  const leftLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.085, 1, 14), materials.skin);
  configureShadow(leftLeg);

  const rightLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.085, 1, 14), materials.skin);
  configureShadow(rightLeg);

  const leftShoe = new THREE.Mesh(new THREE.SphereGeometry(SHOE_RADIUS, 18, 16), materials.shoe);
  leftShoe.scale.set(1.24, 0.9, 1.22);
  configureShadow(leftShoe);

  const rightShoe = new THREE.Mesh(new THREE.SphereGeometry(SHOE_RADIUS, 18, 16), materials.shoe);
  rightShoe.scale.set(1.24, 0.9, 1.22);
  configureShadow(rightShoe);

  legRoot.add(leftLeg, rightLeg, leftShoe, rightShoe);

  return {
    group,
    materials,
    bodyRoot,
    bodyShell,
    faceRoot,
    foldMesh,
    stripes,
    leftEye,
    rightEye,
    leftBrow,
    rightBrow,
    mouthRoot,
    mouthShell,
    leftTooth,
    rightTooth,
    tongue,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    leftShoe,
    rightShoe,
    metrics: {
      bodyTopY: BODY_TOP_Y,
      bodyBottomY: BODY_BOTTOM_Y,
      legTopY: LEG_TOP_Y,
      shoeRadius: SHOE_RADIUS,
    },
    dispose() {
      disposeObject3D(group);
    },
  };
}
