import { clamp } from "./utils.js";

export function expressionProfile(expression) {
  if (expression === "smile") {
    return {
      mouthCurve: 0.25,
      mouthWidth: 1.08,
      mouthY: 0.01,
      browTilt: -0.06,
      browLift: 0.03,
      eyeScale: 1.02,
      pupilY: 0.008,
    };
  }

  if (expression === "determined") {
    return {
      mouthCurve: -0.24,
      mouthWidth: 0.94,
      mouthY: -0.02,
      browTilt: 0.24,
      browLift: -0.07,
      eyeScale: 0.96,
      pupilY: -0.01,
    };
  }

  if (expression === "startled") {
    return {
      mouthCurve: -0.08,
      mouthWidth: 0.8,
      mouthY: 0.03,
      browTilt: 0.05,
      browLift: 0.1,
      eyeScale: 1.16,
      pupilY: -0.02,
    };
  }

  return {
    mouthCurve: 0,
    mouthWidth: 1,
    mouthY: 0,
    browTilt: 0,
    browLift: 0,
    eyeScale: 1,
    pupilY: 0,
  };
}

function createMouthGeometry(THREE, width, curveValue) {
  const half = 0.17 * width;
  const rise = 0.15 * curveValue;
  const start = new THREE.Vector3(-half, 0, 0);
  const control = new THREE.Vector3(0, rise, 0);
  const end = new THREE.Vector3(half, 0, 0);
  const curve = new THREE.QuadraticBezierCurve3(start, control, end);
  return new THREE.TubeGeometry(curve, 28, 0.01, 14, false);
}

function computeTackyMetrics(config) {
  const headRadius = clamp(config.crownWidth * 0.5, 0.34, 1.8);
  const domeHeight = 0.06 + config.depthCurve * 0.2;
  const skirtDrop = 0.035 + config.depthCurve * 0.1;

  const pinRadius = clamp(config.wireThickness, 0.01, 0.09);
  const pinLength = clamp(config.legHeight, 0.35, 2.2);
  const tipLength = clamp(pinRadius * 9, 0.15, 0.48);
  const collarHeight = clamp(pinRadius * 2.6, 0.05, 0.14);
  const collarRadiusTop = pinRadius * 1.8;
  const collarRadiusBottom = pinRadius * 1.35;

  const capBottomY = -skirtDrop;
  const collarCenterY = capBottomY - collarHeight * 0.52;
  const pinJointY = collarCenterY - collarHeight * 0.52;
  const shaftCenterY = pinJointY - pinLength * 0.5;
  const tipCenterY = pinJointY - pinLength - tipLength * 0.5;
  const groundOffset = -tipCenterY - tipLength * 0.5;

  return {
    headRadius,
    domeHeight,
    skirtDrop,
    pinRadius,
    pinLength,
    tipLength,
    collarHeight,
    collarRadiusTop,
    collarRadiusBottom,
    collarCenterY,
    pinJointY,
    shaftCenterY,
    tipCenterY,
    groundOffset,
    faceCenterY: domeHeight * 0.02,
    faceCenterZ: headRadius * 0.66,
  };
}

function computePushyMetrics(config) {
  const headRadius = clamp(config.crownWidth * 0.5, 0.34, 1.8);
  const profileBias = clamp(config.depthCurve, 0, 1);
  const lowerFlangeRadius = headRadius * (0.95 + profileBias * 0.12);
  const topFlangeRadius = lowerFlangeRadius * (0.91 - profileBias * 0.03);
  const topFlangeThickness = clamp(headRadius * (0.14 + profileBias * 0.12), 0.06, 0.32);
  const lowerFlangeThickness = clamp(headRadius * (0.18 + profileBias * 0.2), 0.08, 0.42);
  const lowerDomeHeight = clamp(lowerFlangeThickness * (0.22 + profileBias * 0.22), 0.02, lowerFlangeThickness * 0.62);

  const pinRadius = clamp(config.wireThickness, 0.01, 0.09);
  const pinLength = clamp(config.legHeight, 0.35, 2.2);
  const tipLength = clamp(pinRadius * 9, 0.15, 0.48);
  const stemBaseRadius = clamp(
    headRadius * (0.28 + (1 - profileBias) * 0.07),
    Math.max(pinRadius * 3.1, 0.065),
    headRadius * 0.62,
  );
  const stemTopRadius = clamp(
    stemBaseRadius * (0.78 + (1 - profileBias) * 0.08),
    Math.max(pinRadius * 2.6, 0.06),
    stemBaseRadius * 0.95,
  );
  const stemHeight = clamp(headRadius * (0.72 + profileBias * 0.98), 0.24, 1.9);

  const lowerFlangeTopY = 0;
  const lowerFlangeBottomY = -lowerFlangeThickness;
  const stemBaseY = lowerFlangeTopY + lowerDomeHeight;
  const upperFlangeBottomY = stemBaseY + stemHeight;
  const upperFlangeTopY = upperFlangeBottomY + topFlangeThickness;

  const collarHeight = clamp(pinRadius * 2.2, 0.045, 0.13);
  const collarRadiusTop = Math.max(pinRadius * 2.1, stemBaseRadius * 0.28);
  const collarRadiusBottom = Math.max(pinRadius * 1.45, collarRadiusTop * 0.72);

  const collarCenterY = lowerFlangeBottomY - collarHeight * 0.52;
  const pinJointY = collarCenterY - collarHeight * 0.52;
  const shaftCenterY = pinJointY - pinLength * 0.5;
  const tipCenterY = pinJointY - pinLength - tipLength * 0.5;
  const groundOffset = -tipCenterY - tipLength * 0.5;

  return {
    headRadius,
    domeHeight: topFlangeThickness,
    skirtDrop: lowerFlangeThickness,
    profileBias,
    topFlangeRadius,
    lowerFlangeRadius,
    topFlangeThickness,
    lowerFlangeThickness,
    lowerDomeHeight,
    stemBaseRadius,
    stemTopRadius,
    stemRadius: stemBaseRadius,
    stemHeight,
    stemBaseY,
    upperFlangeTopY,
    upperFlangeBottomY,
    lowerFlangeTopY,
    lowerFlangeBottomY,
    pinRadius,
    pinLength,
    tipLength,
    collarHeight,
    collarRadiusTop,
    collarRadiusBottom,
    collarCenterY,
    pinJointY,
    shaftCenterY,
    tipCenterY,
    groundOffset,
    faceCenterY: lowerFlangeBottomY + lowerFlangeThickness * 0.56,
    faceCenterZ: lowerFlangeRadius * 0.78,
  };
}

function createTackyCapGeometry(THREE, metrics) {
  const r = metrics.headRadius;
  const dome = metrics.domeHeight;
  const skirt = metrics.skirtDrop;
  const coreRadius = Math.max(metrics.pinRadius * 1.24, 0.03);

  const profile = [
    new THREE.Vector2(coreRadius, dome * 0.82),
    new THREE.Vector2(r * 0.24, dome),
    new THREE.Vector2(r * 0.76, dome * 0.74),
    new THREE.Vector2(r * 0.97, dome * 0.28),
    new THREE.Vector2(r, -skirt * 0.14),
    new THREE.Vector2(r * 0.94, -skirt * 0.56),
    new THREE.Vector2(r * 0.72, -skirt),
    new THREE.Vector2(coreRadius * 1.08, -skirt * 1.02),
  ];

  return new THREE.LatheGeometry(profile, 80);
}

function createPushyCapGeometry(THREE, metrics) {
  const topRadius = metrics.topFlangeRadius;
  const lowerRadius = metrics.lowerFlangeRadius;
  const stemBottomRadius = metrics.stemBaseRadius;
  const stemTopRadius = metrics.stemTopRadius;
  const topThickness = metrics.topFlangeThickness;
  const lowerThickness = metrics.lowerFlangeThickness;
  const lowerDomeHeight = metrics.lowerDomeHeight;
  const stemBaseY = metrics.stemBaseY;
  const topY = metrics.upperFlangeTopY;
  const upperBottomY = metrics.upperFlangeBottomY;
  const lowerTopY = metrics.lowerFlangeTopY;
  const lowerBottomY = metrics.lowerFlangeBottomY;
  const axisRadius = Math.max(metrics.pinRadius * 1.45, stemTopRadius * 0.16, 0.02);

  const profile = [
    new THREE.Vector2(0, topY),
    new THREE.Vector2(topRadius * 0.34, topY),
    new THREE.Vector2(topRadius * 0.93, topY - topThickness * 0.12),
    new THREE.Vector2(topRadius, upperBottomY + topThickness * 0.54),
    new THREE.Vector2(topRadius * 0.85, upperBottomY + topThickness * 0.04),
    new THREE.Vector2(stemTopRadius * 1.05, upperBottomY),
    new THREE.Vector2(stemTopRadius, stemBaseY + (upperBottomY - stemBaseY) * 0.44),
    new THREE.Vector2(stemBottomRadius, stemBaseY + lowerDomeHeight * 0.1),
    new THREE.Vector2(stemBottomRadius * 1.08, stemBaseY),
    new THREE.Vector2(lowerRadius * 0.46, lowerTopY + lowerDomeHeight * 0.84),
    new THREE.Vector2(lowerRadius * 0.9, lowerTopY + lowerDomeHeight * 0.16),
    new THREE.Vector2(lowerRadius, lowerTopY - lowerThickness * 0.38),
    new THREE.Vector2(lowerRadius * 0.82, lowerBottomY + lowerThickness * 0.04),
    new THREE.Vector2(stemBottomRadius * 0.88, lowerBottomY),
    new THREE.Vector2(Math.max(metrics.pinRadius * 1.62, axisRadius * 1.08), lowerBottomY - lowerThickness * 0.05),
  ];

  return new THREE.LatheGeometry(profile, 96);
}

function metricsForProfile(profile, config) {
  return profile === "pushy" ? computePushyMetrics(config) : computeTackyMetrics(config);
}

function capGeometryForProfile(profile, THREE, metrics) {
  return profile === "pushy" ? createPushyCapGeometry(THREE, metrics) : createTackyCapGeometry(THREE, metrics);
}

export function createThumbTackAvatar(THREE, currentState, profile = "tacky") {
  const isPushy = profile === "pushy";

  const group = new THREE.Group();
  group.name = `${profile}-avatar`;
  const body = new THREE.Group();
  const pinRig = new THREE.Group();
  const faceRoot = new THREE.Group();
  group.add(body);
  body.add(pinRig, faceRoot);

  const materials = {
    cap: new THREE.MeshPhysicalMaterial({
      color: currentState.faceColor,
      metalness: 0.12,
      roughness: 0.42,
      clearcoat: 0.82,
      clearcoatRoughness: 0.24,
      side: isPushy ? THREE.DoubleSide : THREE.FrontSide,
      emissive: new THREE.Color(currentState.glowColor),
      emissiveIntensity: currentState.glowIntensity * 0.18,
    }),
    metal: new THREE.MeshPhysicalMaterial({
      color: currentState.metalColor,
      metalness: currentState.metalness,
      roughness: currentState.roughness,
      clearcoat: currentState.clearcoat,
      clearcoatRoughness: currentState.clearcoatRoughness,
      emissive: new THREE.Color(currentState.glowColor),
      emissiveIntensity: currentState.glowIntensity * 0.25,
    }),
    dark: new THREE.MeshStandardMaterial({
      color: currentState.darkColor,
      metalness: 0.26,
      roughness: 0.52,
    }),
    eye: new THREE.MeshStandardMaterial({
      color: currentState.eyeColor,
      metalness: 0.06,
      roughness: 0.2,
    }),
    glow: new THREE.MeshBasicMaterial({
      color: currentState.glowColor,
      transparent: true,
      opacity: clamp(0.08 + currentState.glowIntensity * 0.8, 0, 1),
    }),
  };

  const capMesh = new THREE.Mesh(new THREE.SphereGeometry(0.4, 32, 24), materials.cap);
  capMesh.castShadow = true;
  capMesh.receiveShadow = true;
  body.add(capMesh);

  let crownPlug = null;
  if (isPushy) {
    crownPlug = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.046, 0.02, 36), materials.cap);
    crownPlug.castShadow = true;
    crownPlug.receiveShadow = true;
    body.add(crownPlug);
  }

  const collarMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.1, 32), materials.cap);
  collarMesh.castShadow = true;
  body.add(collarMesh);

  const pinShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.8, 24), materials.metal);
  pinShaft.castShadow = true;
  pinRig.add(pinShaft);

  const pinTip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.22, 24), materials.metal);
  pinTip.castShadow = true;
  pinTip.rotation.x = Math.PI;
  pinRig.add(pinTip);

  const faceDisk = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.012, 40), materials.cap);
  faceDisk.rotation.x = Math.PI / 2;
  faceDisk.castShadow = true;
  faceRoot.add(faceDisk);

  const glowRing = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.014, 12, 64), materials.glow);
  faceRoot.add(glowRing);

  const eyeGeometry = new THREE.SphereGeometry(0.07, 24, 18);
  const pupilGeometry = new THREE.SphereGeometry(0.033, 16, 12);
  const browGeometry = new THREE.CapsuleGeometry(0.011, 0.16, 5, 12);

  const leftEye = new THREE.Mesh(eyeGeometry, materials.eye);
  const rightEye = new THREE.Mesh(eyeGeometry, materials.eye);
  const leftPupil = new THREE.Mesh(pupilGeometry, materials.dark);
  const rightPupil = new THREE.Mesh(pupilGeometry, materials.dark);
  const leftBrow = new THREE.Mesh(browGeometry, materials.dark);
  const rightBrow = new THREE.Mesh(browGeometry, materials.dark);
  const mouth = new THREE.Mesh(createMouthGeometry(THREE, currentState.mouthWidth, currentState.mouthCurve), materials.dark);

  leftEye.castShadow = true;
  rightEye.castShadow = true;
  leftPupil.castShadow = true;
  rightPupil.castShadow = true;
  leftBrow.castShadow = true;
  rightBrow.castShadow = true;
  mouth.castShadow = true;

  faceRoot.add(leftEye, rightEye, leftPupil, rightPupil, leftBrow, rightBrow, mouth);
  faceDisk.visible = false;
  glowRing.visible = false;

  const avatar = {
    THREE,
    profile,
    group,
    body,
    pinRig,
    faceRoot,
    capMesh,
    crownPlug,
    collarMesh,
    pinShaft,
    pinTip,
    faceDisk,
    glowRing,
    leftEye,
    rightEye,
    leftPupil,
    rightPupil,
    leftBrow,
    rightBrow,
    mouth,
    materials,
    metrics: metricsForProfile(profile, currentState),
    rebuildGeometry(config) {
      this.metrics = metricsForProfile(profile, config);
      const m = this.metrics;

      const capGeometry = capGeometryForProfile(profile, THREE, m);
      this.capMesh.geometry.dispose();
      this.capMesh.geometry = capGeometry;

      if (this.crownPlug) {
        const plugRadius = Math.max(m.topFlangeRadius * 0.34, m.pinRadius * 1.9, m.stemTopRadius * 0.19, 0.028);
        const plugHeight = Math.max(0.012, m.topFlangeThickness * 0.18);
        const crownGeometry = new THREE.CylinderGeometry(plugRadius, plugRadius * 0.94, plugHeight, 36);
        this.crownPlug.geometry.dispose();
        this.crownPlug.geometry = crownGeometry;
        this.crownPlug.position.y = m.upperFlangeTopY - plugHeight * 0.5 + 0.001;
      }

      const collarGeometry = new THREE.CylinderGeometry(
        m.collarRadiusTop,
        m.collarRadiusBottom,
        m.collarHeight,
        32,
      );
      this.collarMesh.geometry.dispose();
      this.collarMesh.geometry = collarGeometry;
      this.collarMesh.position.y = m.collarCenterY;

      const shaftGeometry = new THREE.CylinderGeometry(m.pinRadius, m.pinRadius, m.pinLength, 24);
      this.pinShaft.geometry.dispose();
      this.pinShaft.geometry = shaftGeometry;
      this.pinShaft.position.y = m.shaftCenterY;

      const tipGeometry = new THREE.ConeGeometry(m.pinRadius * 1.25, m.tipLength, 24);
      this.pinTip.geometry.dispose();
      this.pinTip.geometry = tipGeometry;
      this.pinTip.position.y = m.tipCenterY;

      const faceRadius = m.headRadius * 0.44;
      const faceGeometry = new THREE.CylinderGeometry(faceRadius, faceRadius, 0.012, 40);
      this.faceDisk.geometry.dispose();
      this.faceDisk.geometry = faceGeometry;
      this.faceDisk.position.z = 0.008;

      const ringGeometry = new THREE.TorusGeometry(faceRadius * 1.05, Math.max(0.01, m.pinRadius * 0.45), 12, 64);
      this.glowRing.geometry.dispose();
      this.glowRing.geometry = ringGeometry;
      this.glowRing.position.z = 0.013;
    },
    rebuildMouthGeometry(width, curveValue) {
      const geometry = createMouthGeometry(THREE, width, curveValue);
      this.mouth.geometry.dispose();
      this.mouth.geometry = geometry;
    },
    dispose() {
      const seenGeometry = new Set();
      this.group.traverse((node) => {
        if (node.geometry && !seenGeometry.has(node.geometry)) {
          seenGeometry.add(node.geometry);
          node.geometry.dispose();
        }
      });

      const seenMaterials = new Set();
      for (const material of Object.values(this.materials)) {
        if (!material || seenMaterials.has(material)) continue;
        seenMaterials.add(material);
        material.dispose();
      }
    },
  };

  avatar.rebuildGeometry(currentState);
  return avatar;
}
