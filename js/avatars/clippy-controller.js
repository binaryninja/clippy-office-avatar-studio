import { officePackPlugin } from "../lib/clippy-3d-plugin-examples.js";
import { createClippy3D } from "../lib/clippy-3d.js";
import { clamp } from "../lib/utils.js";
import { NO_PROP_VALUE } from "../config/avatars.js";

const FALLBACK_MODES = ["idle", "wave", "celebrate", "spin", "point"];
const EXPRESSION_CHOICES = ["neutral", "happy", "focused", "surprised"];

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
    setState,
    update,
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
