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

function createStripeGeometry(THREE, width, height) {
  const halfW = width * 0.5;
  const halfH = height * 0.5;
  const radius = Math.min(height * 0.45, width * 0.12);
  const stripeDepth = 0.012;

  const shape = new THREE.Shape();
  shape.moveTo(-halfW + radius, -halfH);
  shape.lineTo(halfW - radius, -halfH);
  shape.absarc(halfW - radius, -halfH + radius, radius, -Math.PI * 0.5, 0, false);
  shape.lineTo(halfW, halfH - radius);
  shape.absarc(halfW - radius, halfH - radius, radius, 0, Math.PI * 0.5, false);
  shape.lineTo(-halfW + radius, halfH);
  shape.absarc(-halfW + radius, halfH - radius, radius, Math.PI * 0.5, Math.PI, false);
  shape.lineTo(-halfW, -halfH + radius);
  shape.absarc(-halfW + radius, -halfH + radius, radius, Math.PI, Math.PI * 1.5, false);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: stripeDepth,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.005,
    bevelThickness: 0.005,
    curveSegments: 14,
    steps: 1,
  });

  const positions = geometry.attributes.position;
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const edgeFactor = Math.min(1, Math.abs(x / halfW));
    positions.setZ(index, positions.getZ(index) - edgeFactor * edgeFactor * 0.007);
  }

  geometry.translate(0, 0, -stripeDepth * 0.5);
  geometry.computeVertexNormals();
  return geometry;
}

function configureShadow(mesh, { cast = true, receive = true } = {}) {
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
}

function createStripe(THREE, material, y, width = 2.2, height = 0.07) {
  const stripe = new THREE.Mesh(createStripeGeometry(THREE, width, height), material);
  stripe.position.set(0, y, BODY_DEPTH * 0.56);
  configureShadow(stripe, { cast: false, receive: false });
  return stripe;
}

function createArm(THREE, material) {
  const shoulder = new THREE.Group();

  const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.62, 8, 14), material);
  upper.position.y = -0.36;
  configureShadow(upper, { cast: true, receive: false });
  shoulder.add(upper);

  const elbow = new THREE.Group();
  elbow.position.y = -0.73;
  shoulder.add(elbow);

  const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.086, 0.54, 8, 14), material);
  forearm.position.y = -0.31;
  configureShadow(forearm, { cast: true, receive: false });
  elbow.add(forearm);

  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.17, 18, 14), material);
  hand.position.set(0, -0.67, 0);
  hand.scale.set(1, 1.05, 0.86);
  configureShadow(hand, { cast: true, receive: false });
  elbow.add(hand);

  return {
    shoulder,
    elbow,
  };
}

function seededNoise(x, y) {
  let value = Math.imul(x + 1, 374761393) + Math.imul(y + 1, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  value ^= value >>> 16;
  return (value >>> 0) / 4294967295;
}

function createFabricMaps(THREE) {
  const size = 128;
  const roughnessData = new Uint8Array(size * size * 4);
  const normalData = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const warpBand = x % 8 < 2 ? 14 : 0;
      const weftBand = y % 8 < 2 ? 10 : 0;
      const roughNoise = (seededNoise(x, y) - 0.5) * 26;
      const roughValue = clamp(176 + warpBand + weftBand + roughNoise, 0, 255);

      roughnessData[index] = roughValue;
      roughnessData[index + 1] = roughValue;
      roughnessData[index + 2] = roughValue;
      roughnessData[index + 3] = 255;

      const nxDirection = x % 8 < 4 ? 1 : -1;
      const nyDirection = y % 8 < 4 ? -1 : 1;
      const normalNoise = (seededNoise(y, x) - 0.5) * 3;
      const nx = clamp(128 + nxDirection * (8 + normalNoise), 0, 255);
      const ny = clamp(128 + nyDirection * (6 + normalNoise), 0, 255);

      normalData[index] = nx;
      normalData[index + 1] = ny;
      normalData[index + 2] = 255;
      normalData[index + 3] = 255;
    }
  }

  const roughnessMap = new THREE.DataTexture(roughnessData, size, size, THREE.RGBAFormat);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(4.6, 11.8);
  roughnessMap.needsUpdate = true;

  const normalMap = new THREE.DataTexture(normalData, size, size, THREE.RGBAFormat);
  normalMap.wrapS = THREE.RepeatWrapping;
  normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.repeat.copy(roughnessMap.repeat);
  normalMap.needsUpdate = true;

  if (THREE.NoColorSpace) {
    roughnessMap.colorSpace = THREE.NoColorSpace;
    normalMap.colorSpace = THREE.NoColorSpace;
  }

  return {
    roughnessMap,
    normalMap,
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

  const fabricMaps = createFabricMaps(THREE);
  const generatedTextures = [fabricMaps.roughnessMap, fabricMaps.normalMap];

  const materials = {
    cloth: new THREE.MeshPhysicalMaterial({
      color: currentState.bodyColor || "#8b8fbe",
      metalness: clamp(currentState.metalness ?? 0.03, 0, 1),
      roughness: clamp(currentState.roughness ?? 0.84, 0, 1),
      roughnessMap: fabricMaps.roughnessMap,
      clearcoat: clamp(currentState.clearcoat ?? 0.07, 0, 1),
      clearcoatRoughness: clamp(currentState.clearcoatRoughness ?? 0.8, 0, 1),
      normalMap: fabricMaps.normalMap,
      normalScale: new THREE.Vector2(0.2, 0.26),
      emissive: new THREE.Color(currentState.glowColor || "#2f3048"),
      emissiveIntensity: clamp((currentState.glowIntensity ?? 0.08) * 0.2, 0, 1),
    }),
    fold: new THREE.MeshPhysicalMaterial({
      color: currentState.foldColor || "#7e83b3",
      metalness: clamp((currentState.metalness ?? 0.03) * 0.2, 0, 1),
      roughness: clamp((currentState.roughness ?? 0.84) * 0.94, 0, 1),
      roughnessMap: fabricMaps.roughnessMap,
      clearcoat: clamp((currentState.clearcoat ?? 0.07) * 0.7, 0, 1),
      clearcoatRoughness: clamp((currentState.clearcoatRoughness ?? 0.8) * 0.96, 0, 1),
      normalMap: fabricMaps.normalMap,
      normalScale: new THREE.Vector2(0.16, 0.2),
      emissive: new THREE.Color(currentState.glowColor || "#2f3048"),
      emissiveIntensity: clamp((currentState.glowIntensity ?? 0.08) * 0.1, 0, 1),
    }),
    stripe: new THREE.MeshStandardMaterial({
      color: currentState.stripeColor || "#d9dcf2",
      metalness: 0.01,
      roughness: 0.8,
      roughnessMap: fabricMaps.roughnessMap,
      normalMap: fabricMaps.normalMap,
      normalScale: new THREE.Vector2(0.13, 0.15),
      emissive: new THREE.Color(currentState.glowColor || "#2f3048"),
      emissiveIntensity: clamp((currentState.glowIntensity ?? 0.08) * 0.24, 0, 1),
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
    skin: new THREE.MeshStandardMaterial({
      color: currentState.skinColor || "#e8d2b0",
      metalness: 0.02,
      roughness: 0.74,
    }),
    hair: new THREE.MeshStandardMaterial({
      color: currentState.hairColor || "#8e90be",
      metalness: 0.02,
      roughness: 0.62,
    }),
    eyeWhite: new THREE.MeshStandardMaterial({
      color: currentState.eyeColor || "#f5f7ff",
      metalness: 0,
      roughness: 0.46,
    }),
    dark: new THREE.MeshStandardMaterial({
      color: currentState.darkColor || "#111318",
      metalness: 0.1,
      roughness: 0.5,
    }),
    tooth: new THREE.MeshStandardMaterial({
      color: "#f4f7ff",
      metalness: 0.02,
      roughness: 0.34,
    }),
    tongue: new THREE.MeshStandardMaterial({
      color: "#cc474f",
      metalness: 0,
      roughness: 0.62,
    }),
    shoe: new THREE.MeshStandardMaterial({
      color: currentState.shoeColor || "#111318",
      metalness: 0.22,
      roughness: 0.34,
      emissive: new THREE.Color(currentState.glowColor || "#2f3048"),
      emissiveIntensity: clamp((currentState.glowIntensity ?? 0.08) * 0.16, 0, 1),
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

  faceRoot.position.set(0, 0.2, BODY_DEPTH * 0.8);

  const leftEyeRoot = new THREE.Group();
  leftEyeRoot.position.set(-0.2, 0.06, 0.21);
  const leftEye = new THREE.Mesh(new THREE.CircleGeometry(0.13, 30), materials.eyeWhite);
  leftEye.scale.set(0.86, 1.24, 1);
  const leftPupil = new THREE.Mesh(new THREE.CircleGeometry(0.022, 18), materials.dark);
  leftPupil.position.set(0, 0, 0.002);
  configureShadow(leftEye, { cast: false, receive: false });
  configureShadow(leftPupil, { cast: false, receive: false });
  leftEyeRoot.add(leftEye, leftPupil);

  const rightEyeRoot = new THREE.Group();
  rightEyeRoot.position.set(0.2, 0.06, 0.21);
  const rightEye = new THREE.Mesh(new THREE.CircleGeometry(0.13, 30), materials.eyeWhite);
  rightEye.scale.set(0.86, 1.24, 1);
  const rightPupil = new THREE.Mesh(new THREE.CircleGeometry(0.022, 18), materials.dark);
  rightPupil.position.set(0, 0, 0.002);
  configureShadow(rightEye, { cast: false, receive: false });
  configureShadow(rightPupil, { cast: false, receive: false });
  rightEyeRoot.add(rightEye, rightPupil);

  const leftBrow = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.028, 0.012), materials.dark);
  leftBrow.position.set(-0.3, 0.31, 0.2);
  configureShadow(leftBrow, { cast: false, receive: false });

  const rightBrow = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.028, 0.012), materials.dark);
  rightBrow.position.set(0.3, 0.31, 0.2);
  configureShadow(rightBrow, { cast: false, receive: false });

  const mouthRoot = new THREE.Group();
  mouthRoot.position.set(0, -0.18, 0.2);
  const smile = new THREE.Mesh(
    new THREE.RingGeometry(0.046, 0.058, 24, 1, Math.PI * 0.06, Math.PI * 0.88),
    materials.dark,
  );
  smile.rotation.z = Math.PI;
  configureShadow(smile, { cast: false, receive: false });
  mouthRoot.add(smile);

  faceRoot.add(leftEyeRoot, rightEyeRoot, leftBrow, rightBrow, mouthRoot);

  const leftArm = createArm(THREE, materials.skin);
  const rightArm = createArm(THREE, materials.skin);
  limbRoot.add(leftArm.shoulder, rightArm.shoulder);

  const leftLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.085, 1, 14), materials.skin);
  configureShadow(leftLeg, { cast: true, receive: false });

  const rightLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.085, 1, 14), materials.skin);
  configureShadow(rightLeg, { cast: true, receive: false });

  const leftShoe = new THREE.Mesh(new THREE.SphereGeometry(SHOE_RADIUS, 18, 16), materials.shoe);
  leftShoe.scale.set(1.24, 0.9, 1.22);
  configureShadow(leftShoe, { cast: true, receive: true });

  const rightShoe = new THREE.Mesh(new THREE.SphereGeometry(SHOE_RADIUS, 18, 16), materials.shoe);
  rightShoe.scale.set(1.24, 0.9, 1.22);
  configureShadow(rightShoe, { cast: true, receive: true });

  legRoot.add(leftLeg, rightLeg, leftShoe, rightShoe);

  return {
    group,
    materials,
    bodyRoot,
    bodyShell,
    faceRoot,
    foldMesh,
    stripes,
    leftEyeRoot,
    rightEyeRoot,
    leftEye,
    rightEye,
    leftSclera: leftEye,
    rightSclera: rightEye,
    leftPupil,
    rightPupil,
    leftBrow,
    rightBrow,
    mouthRoot,
    smile,
    mouthCavity: smile,
    mouthShell: smile,
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
      for (const texture of generatedTextures) {
        texture.dispose();
      }
    },
  };
}
