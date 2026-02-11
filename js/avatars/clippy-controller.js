import { officePackPlugin } from "../lib/clippy-3d-plugin-examples.js";
import { createClippy3D } from "../lib/clippy-3d.js";
import { clamp } from "../lib/utils.js";
import { NO_PROP_VALUE } from "../config/avatars.js";

const FALLBACK_MODES = ["idle", "wave", "celebrate", "spin", "point"];
const EXPRESSION_CHOICES = ["neutral", "happy", "focused", "surprised"];
const SIL_VISEME = "sil";

const VISEME_POSES = Object.freeze({
  sil: { open: 0.02, width: 1, round: 0.06, press: 0.42, jaw: 0 },
  aa: { open: 0.94, width: 1.14, round: 0.1, press: 0.04, jaw: 0.58 },
  ee: { open: 0.38, width: 1.44, round: -0.2, press: 0.06, jaw: 0.16 },
  oh: { open: 0.8, width: 0.88, round: 0.88, press: 0.08, jaw: 0.38 },
  ou: { open: 0.56, width: 0.76, round: 1, press: 0.12, jaw: 0.22 },
  fv: { open: 0.2, width: 1.04, round: 0.04, press: 0.34, jaw: 0.06 },
  mbp: { open: 0.01, width: 1.01, round: 0.04, press: 1, jaw: 0 },
  th: { open: 0.43, width: 1.1, round: 0.12, press: 0.18, jaw: 0.2 },
  ch: { open: 0.5, width: 1.02, round: 0.22, press: 0.16, jaw: 0.24 },
  tn: { open: 0.3, width: 1.12, round: 0.06, press: 0.22, jaw: 0.14 },
  ss: { open: 0.18, width: 1.31, round: -0.08, press: 0.18, jaw: 0.08 },
  kk: { open: 0.34, width: 1.03, round: 0.08, press: 0.24, jaw: 0.16 },
});

function expressionProfile(expression) {
  let mouthScaleY = 1;
  let mouthShiftY = -0.34;
  let browTilt = 0.26;
  let browDrop = 0;

  if (expression === "happy") {
    mouthScaleY = 1.28;
    mouthShiftY = -0.3;
    browTilt = 0.18;
    browDrop = 0.03;
  } else if (expression === "focused") {
    mouthScaleY = 0.78;
    mouthShiftY = -0.39;
    browTilt = 0.4;
    browDrop = -0.07;
  } else if (expression === "surprised") {
    mouthScaleY = 0.55;
    mouthShiftY = -0.29;
    browTilt = 0.08;
    browDrop = 0.07;
  }

  return { mouthScaleY, mouthShiftY, browTilt, browDrop };
}

function setMaterialColor(material, value) {
  if (!material || !material.color) return;
  material.color.set(value);
  material.needsUpdate = true;
}

function setMaterialEmissive(material, value, intensity) {
  if (!material || !material.emissive) return;
  material.emissive.set(value);
  material.emissiveIntensity = intensity;
  material.needsUpdate = true;
}

function blendPose(base, target, amount) {
  const mix = clamp(amount, 0, 1);
  return {
    open: base.open + (target.open - base.open) * mix,
    width: base.width + (target.width - base.width) * mix,
    round: base.round + (target.round - base.round) * mix,
    press: base.press + (target.press - base.press) * mix,
    jaw: base.jaw + (target.jaw - base.jaw) * mix,
  };
}

function createMouthRig(THREE, sourceMouth) {
  if (!sourceMouth || !sourceMouth.parent) return null;

  const group = new THREE.Group();
  group.position.copy(sourceMouth.position);
  group.rotation.copy(sourceMouth.rotation);
  group.scale.copy(sourceMouth.scale);

  const lipMaterial = sourceMouth.material?.clone?.()
    || new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.2, roughness: 0.65 });
  const cavityMaterial = new THREE.MeshBasicMaterial({ color: 0x070b16 });
  const tongueMaterial = new THREE.MeshStandardMaterial({
    color: 0x7d3445,
    metalness: 0.02,
    roughness: 0.88,
  });

  const upperLip = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.018, 10, 34, Math.PI), lipMaterial);
  upperLip.rotation.z = Math.PI;
  upperLip.position.y = 0.026;

  const lowerLip = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.02, 10, 34, Math.PI), lipMaterial);
  lowerLip.position.y = -0.03;

  const cavity = new THREE.Mesh(new THREE.CircleGeometry(0.13, 32), cavityMaterial);
  cavity.position.z = -0.016;
  cavity.scale.set(0.9, 0.16, 1);

  const tongue = new THREE.Mesh(new THREE.CircleGeometry(0.078, 24), tongueMaterial);
  tongue.position.set(0, -0.068, -0.014);
  tongue.scale.set(0.78, 0.32, 1);
  tongue.visible = false;

  group.add(cavity, tongue, upperLip, lowerLip);
  sourceMouth.parent.add(group);
  sourceMouth.visible = false;

  return {
    group,
    upperLip,
    lowerLip,
    cavity,
    tongue,
    lipMaterial,
    cavityMaterial,
  };
}

export function createClippyController({ THREE, scene, initialState }) {
  const state = { ...initialState };
  const plugins = [officePackPlugin].filter(Boolean);

  const clippy = createClippy3D(THREE, {
    scale: state.scale,
    wireThickness: state.wireThickness,
    browThickness: state.browThickness,
    plugins,
  });
  scene.add(clippy.group);

  const mouthRig = createMouthRig(THREE, clippy.mouth);
  if (mouthRig?.group) {
    clippy.mouth = mouthRig.group;
  }

  const availableModes = typeof clippy.listAnimations === "function" ? clippy.listAnimations() : FALLBACK_MODES;
  const availableProps = typeof clippy.listProps === "function" ? clippy.listProps() : [];

  const clipMesh = clippy.group.children.find((node) => node.isMesh && node.geometry?.type === "TubeGeometry");
  const metalMaterial = clipMesh?.material || null;
  const leftArmMaterial = clippy.leftArm?.upper?.children?.[0]?.material || null;
  const rightArmMaterial = clippy.rightArm?.upper?.children?.[0]?.material || null;

  if (clippy.rightEye?.material === clippy.leftEye?.material && clippy.rightEye?.material) {
    clippy.rightEye.material = clippy.rightEye.material.clone();
  }
  if (clippy.rightPupil?.material === clippy.leftPupil?.material && clippy.rightPupil?.material) {
    clippy.rightPupil.material = clippy.rightPupil.material.clone();
  }

  const eyeMaterial = clippy.leftEye?.material || null;
  const rightEyeMaterial = clippy.rightEye?.material || null;
  const darkMaterial = clippy.leftPupil?.material || null;
  const rightPupilMaterial = clippy.rightPupil?.material || null;

  const base = {
    head: clippy.head.position.clone(),
    leftPupilX: clippy.leftPupil.position.x,
    rightPupilX: clippy.rightPupil.position.x,
    leftPupilY: clippy.leftPupil.position.y,
    rightPupilY: clippy.rightPupil.position.y,
  };

  const geometryCache = {
    wireThickness: null,
    browThickness: null,
  };

  const behaviorCache = {
    mode: null,
    expression: null,
  };

  const propRuntime = {
    id: null,
    name: NO_PROP_VALUE,
  };

  const voiceRuntime = {
    target: 0,
    current: 0,
    expression: expressionProfile(state.expression),
    visemeKey: SIL_VISEME,
    visemeStrengthTarget: 0,
    visemeStrengthCurrent: 0,
    poseCurrent: { ...VISEME_POSES[SIL_VISEME] },
    phase: Math.random() * Math.PI * 2,
  };

  function applyMaterialState() {
    if (metalMaterial) {
      setMaterialColor(metalMaterial, state.metalColor);
      setMaterialEmissive(metalMaterial, state.glowColor, state.glowIntensity);
      metalMaterial.metalness = state.metalness;
      metalMaterial.roughness = state.roughness;
      metalMaterial.clearcoat = state.clearcoat;
      metalMaterial.clearcoatRoughness = state.clearcoatRoughness;
      metalMaterial.needsUpdate = true;
    }

    for (const armMat of [leftArmMaterial, rightArmMaterial]) {
      if (!armMat) continue;
      setMaterialColor(armMat, state.metalColor);
      setMaterialEmissive(armMat, state.glowColor, clamp(state.glowIntensity * 0.7, 0, 0.75));
      armMat.metalness = clamp(state.metalness * 0.88, 0, 1);
      armMat.roughness = clamp(state.roughness * 1.25, 0, 1);
      armMat.needsUpdate = true;
    }

    setMaterialColor(darkMaterial, state.darkColor);
    setMaterialColor(eyeMaterial, state.eyeColor);
    setMaterialColor(rightPupilMaterial, state.darkColor);
    setMaterialColor(rightEyeMaterial, state.eyeColor);

    if (mouthRig) {
      setMaterialColor(mouthRig.lipMaterial, state.darkColor);
      const cavityColor = new THREE.Color(state.darkColor).multiplyScalar(0.4);
      setMaterialColor(mouthRig.cavityMaterial, cavityColor);
    }
  }

  function applyMorphState() {
    if (typeof clippy.setWireThickness === "function" && geometryCache.wireThickness !== state.wireThickness) {
      clippy.setWireThickness(state.wireThickness);
      geometryCache.wireThickness = state.wireThickness;
    }

    if (typeof clippy.setBrowThickness === "function" && geometryCache.browThickness !== state.browThickness) {
      clippy.setBrowThickness(state.browThickness);
      geometryCache.browThickness = state.browThickness;
    }

    clippy.group.scale.setScalar(state.scale);
    clippy.head.scale.setScalar(state.headScale);

    const expr = expressionProfile(state.expression);
    voiceRuntime.expression = expr;
    const headWaveOffset = clippy.head.position.y - base.head.y;
    clippy.head.position.x = base.head.x + state.headX;
    clippy.head.position.y = base.head.y + headWaveOffset + state.headY;
    clippy.head.position.z = base.head.z + state.headZ;

    const lookX = clippy.leftPupil.position.x - base.leftPupilX;
    const lookY = clippy.leftPupil.position.y - base.leftPupilY;

    clippy.leftEye.position.x = -state.eyeSpacing;
    clippy.rightEye.position.x = state.eyeSpacing;

    clippy.leftPupil.position.x = -state.eyeSpacing + lookX;
    clippy.rightPupil.position.x = state.eyeSpacing + lookX;
    clippy.leftPupil.position.y = base.leftPupilY + lookY;
    clippy.rightPupil.position.y = base.rightPupilY + lookY;

    const dynamicPupilDepth = 0.21 * state.eyeScale;
    clippy.leftPupil.position.z = dynamicPupilDepth;
    clippy.rightPupil.position.z = dynamicPupilDepth;

    clippy.leftEye.scale.x = state.eyeScale;
    clippy.rightEye.scale.x = state.eyeScale;
    clippy.leftEye.scale.z = state.eyeScale;
    clippy.rightEye.scale.z = state.eyeScale;

    const baseEyeScale = Number.isFinite(clippy.eyeScale) ? clippy.eyeScale : 1;
    const eyeYFactor = state.eyeScale / baseEyeScale;
    clippy.leftEye.scale.y *= eyeYFactor;
    clippy.rightEye.scale.y *= eyeYFactor;

    const pupilXZScale = state.pupilScale * baseEyeScale;
    clippy.leftPupil.scale.x = pupilXZScale;
    clippy.rightPupil.scale.x = pupilXZScale;
    clippy.leftPupil.scale.z = pupilXZScale;
    clippy.rightPupil.scale.z = pupilXZScale;

    const pupilYFactor = state.pupilScale;
    clippy.leftPupil.scale.y *= pupilYFactor;
    clippy.rightPupil.scale.y *= pupilYFactor;

    clippy.leftBrow.position.y = 0.29 + expr.browDrop + state.browLift;
    clippy.rightBrow.position.y = 0.29 + expr.browDrop + state.browLift;
    clippy.leftBrow.rotation.z = -expr.browTilt - state.browTilt;
    clippy.rightBrow.rotation.z = expr.browTilt + state.browTilt;
    clippy.leftBrow.scale.setScalar(state.browScale);
    clippy.rightBrow.scale.setScalar(state.browScale);

    clippy.mouth.scale.x = state.mouthWidth;
    clippy.mouth.scale.y = expr.mouthScaleY * state.mouthHeight;
    clippy.mouth.position.y = expr.mouthShiftY;

    clippy.leftArm.pivot.position.x = -state.armSpread;
    clippy.rightArm.pivot.position.x = state.armSpread;
    clippy.leftArm.pivot.position.y = state.armY;
    clippy.rightArm.pivot.position.y = state.armY;
  }

  function applyVoiceFrame(dt) {
    if (!clippy.mouth) return;

    const levelSmoothing = voiceRuntime.target > voiceRuntime.current ? 0.36 : 0.22;
    voiceRuntime.current += (voiceRuntime.target - voiceRuntime.current) * levelSmoothing;
    if (voiceRuntime.current < 0.004) voiceRuntime.current = 0;

    const visemeSmoothing = voiceRuntime.visemeStrengthTarget > voiceRuntime.visemeStrengthCurrent ? 0.4 : 0.24;
    voiceRuntime.visemeStrengthCurrent += (voiceRuntime.visemeStrengthTarget - voiceRuntime.visemeStrengthCurrent) * visemeSmoothing;
    if (voiceRuntime.visemeStrengthCurrent < 0.004) voiceRuntime.visemeStrengthCurrent = 0;

    const targetPose = VISEME_POSES[voiceRuntime.visemeKey] || VISEME_POSES[SIL_VISEME];
    const mixedPose = blendPose(VISEME_POSES[SIL_VISEME], targetPose, voiceRuntime.visemeStrengthCurrent);

    for (const key of ["open", "width", "round", "press", "jaw"]) {
      const from = voiceRuntime.poseCurrent[key];
      const to = mixedPose[key];
      voiceRuntime.poseCurrent[key] = from + (to - from) * 0.34;
    }

    const expr = voiceRuntime.expression;
    const activity = clamp(voiceRuntime.current * 0.95 + voiceRuntime.visemeStrengthCurrent * 0.62, 0, 1.4);

    voiceRuntime.phase += dt * (18 + activity * 28);
    const flutter = Math.sin(voiceRuntime.phase) * 0.065 * activity;

    const openAmount = clamp(voiceRuntime.poseCurrent.open * (0.45 + activity * 0.92) + flutter, 0, 1.5);
    const widthAmount = clamp(voiceRuntime.poseCurrent.width + activity * 0.08, 0.56, 1.72);
    const roundAmount = clamp(voiceRuntime.poseCurrent.round, -0.3, 1.1);
    const pressAmount = clamp(voiceRuntime.poseCurrent.press, 0, 1);
    const jawAmount = clamp(voiceRuntime.poseCurrent.jaw, 0, 1.1);

    const mouthScaleY = expr.mouthScaleY * state.mouthHeight * (0.86 + openAmount * 0.44 + (1 - pressAmount) * 0.12);
    clippy.mouth.scale.x = state.mouthWidth * widthAmount;
    clippy.mouth.scale.y = mouthScaleY;
    clippy.mouth.position.y = expr.mouthShiftY - activity * 0.028 - jawAmount * 0.032;

    if (!mouthRig) return;

    const lipSpread = clamp(1 + (widthAmount - 1) * 0.45 - roundAmount * 0.14, 0.72, 1.7);
    const upperLift = 0.028 + openAmount * 0.026 - pressAmount * 0.018;
    const lowerDrop = -0.03 - openAmount * 0.118 - jawAmount * 0.052;

    mouthRig.upperLip.position.y = upperLift;
    mouthRig.lowerLip.position.y = lowerDrop;

    mouthRig.upperLip.scale.x = lipSpread;
    mouthRig.lowerLip.scale.x = clamp(lipSpread * (1 + roundAmount * 0.08), 0.68, 1.85);

    mouthRig.upperLip.scale.y = clamp(1 - pressAmount * 0.3 + roundAmount * 0.1, 0.62, 1.34);
    mouthRig.lowerLip.scale.y = clamp(1 - pressAmount * 0.35 + roundAmount * 0.12, 0.58, 1.36);

    const cavityOpen = clamp(openAmount * (1.16 - pressAmount * 0.46), 0, 1.55);
    mouthRig.cavity.visible = cavityOpen > 0.032;
    mouthRig.cavity.scale.x = clamp(0.34 + lipSpread * 0.52 - roundAmount * 0.12, 0.2, 1.52);
    mouthRig.cavity.scale.y = clamp(0.06 + cavityOpen * 1.24 + roundAmount * 0.16, 0.06, 1.86);
    mouthRig.cavity.position.y = -0.016 - cavityOpen * 0.092;

    mouthRig.tongue.visible = cavityOpen > 0.22;
    mouthRig.tongue.scale.x = clamp(0.58 + lipSpread * 0.22, 0.44, 1.08);
    mouthRig.tongue.scale.y = clamp(0.2 + cavityOpen * 0.5, 0.16, 0.92);
    mouthRig.tongue.position.y = -0.066 - cavityOpen * 0.058;
  }

  function applyPropState(force = false) {
    const desired = state.propName || NO_PROP_VALUE;
    if (!force && desired === propRuntime.name) return;

    if (propRuntime.id !== null && typeof clippy.detachProp === "function") {
      clippy.detachProp(propRuntime.id);
    }

    propRuntime.id = null;
    propRuntime.name = NO_PROP_VALUE;

    if (desired === NO_PROP_VALUE) return;
    if (!availableProps.includes(desired) || typeof clippy.attachProp !== "function") return;

    try {
      propRuntime.id = clippy.attachProp(desired);
      propRuntime.name = desired;
    } catch (err) {
      console.warn("Failed to load prop", desired, err);
    }
  }

  function applyBehaviorState(force = false) {
    const requestedMode = availableModes.includes(state.mode) ? state.mode : availableModes[0] || "idle";
    const requestedExpression = EXPRESSION_CHOICES.includes(state.expression) ? state.expression : "neutral";
    state.mode = requestedMode;
    state.expression = requestedExpression;

    if (force || behaviorCache.mode !== requestedMode) {
      clippy.play(requestedMode);
      behaviorCache.mode = requestedMode;
    }

    if (force || behaviorCache.expression !== requestedExpression) {
      clippy.setExpression(requestedExpression);
      behaviorCache.expression = requestedExpression;
    }

    applyPropState(force);
  }

  function setState(nextState = {}, { force = false } = {}) {
    Object.assign(state, nextState);
    applyBehaviorState(force);
    applyMaterialState();
    applyMorphState();
  }

  function update(dt, pointer) {
    const frameDt = Math.min(dt, 0.08) * state.speed;

    if (pointer) {
      clippy.setLookTarget({
        x: pointer.x * 2.3,
        y: pointer.y * 1.4 + 0.7,
        z: 5.2,
      });
    }

    clippy.update(frameDt);
    applyMorphState();
    applyVoiceFrame(frameDt);
  }

  function setVoiceActivity(level = 0) {
    const next = Number(level);
    voiceRuntime.target = clamp(Number.isFinite(next) ? next : 0, 0, 1);
  }

  function setVoiceViseme(payload = null) {
    const key = String(payload?.viseme || SIL_VISEME).toLowerCase();
    voiceRuntime.visemeKey = Object.prototype.hasOwnProperty.call(VISEME_POSES, key) ? key : SIL_VISEME;

    const nextStrength = Number(payload?.strength);
    voiceRuntime.visemeStrengthTarget = clamp(Number.isFinite(nextStrength) ? nextStrength : 0, 0, 1);
  }

  function dispose() {
    if (propRuntime.id !== null && typeof clippy.detachProp === "function") {
      clippy.detachProp(propRuntime.id);
    }
    scene.remove(clippy.group);
    if (typeof clippy.dispose === "function") {
      clippy.dispose();
    }
  }

  setState(state, { force: true });

  return {
    group: clippy.group,
    setState,
    update,
    setVoiceActivity,
    setVoiceViseme,
    dispose,
    getCatalog() {
      return {
        modes: availableModes,
        expressions: [...EXPRESSION_CHOICES],
        props: [NO_PROP_VALUE, ...availableProps],
      };
    },
  };
}
