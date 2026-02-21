import { createHal9000Avatar } from "../lib/hal9000-factory.js";
import { clamp } from "../lib/utils.js";
import { registerEngine } from "../engines.js";
import {
  createPropManager,
  listSharedProps,
  getSharedProp,
  loadPropPlacement,
  savePropPlacement,
  applyPlacementToObject,
} from "../lib/prop-system.js";
import "../lib/shared-props.js";
import { NO_PROP_VALUE } from "../config/avatars.js";

const MODE_CHOICES = [
  "idle",
  "bob",
  "wave",
  "spin",
  "celebrate",
  "thinking",
  "typing",
  "reading",
  "searching",
  "error",
  "success",
  "listening",
];

const EXPRESSION_CHOICES = ["neutral", "calm", "menacing", "critical"];
const SIL_VISEME = "sil";

function expressionProfile(expression) {
  if (expression === "calm") {
    return {
      irisScale: 0.96,
      pupilScale: 1.04,
      eyeYOffset: 0.04,
      glowBoost: 0.06,
      scanWeight: 0.35,
    };
  }

  if (expression === "menacing") {
    return {
      irisScale: 0.86,
      pupilScale: 0.82,
      eyeYOffset: -0.03,
      glowBoost: 0.18,
      scanWeight: 0.6,
    };
  }

  if (expression === "critical") {
    return {
      irisScale: 1.12,
      pupilScale: 0.72,
      eyeYOffset: 0.02,
      glowBoost: 0.3,
      scanWeight: 0.75,
    };
  }

  return {
    irisScale: 1,
    pupilScale: 1,
    eyeYOffset: 0,
    glowBoost: 0,
    scanWeight: 0.45,
  };
}

function sampleModePose(mode, t) {
  if (mode === "bob") {
    return {
      bob: Math.abs(Math.sin(t * 2.8)) * 0.06,
      sway: Math.sin(t * 2.2) * 0.045,
      panelTiltX: Math.sin(t * 2.8) * 0.03,
      panelTiltY: Math.sin(t * 2.1) * 0.04,
      panelTiltZ: Math.sin(t * 2.2) * 0.02,
      spinY: Math.sin(t * 0.6) * 0.03,
      eyeX: Math.sin(t * 2.2) * 0.022,
      eyeY: Math.sin(t * 1.7) * 0.012,
      pulse: 0.26,
    };
  }

  if (mode === "wave") {
    return {
      bob: Math.abs(Math.sin(t * 3.4)) * 0.04,
      sway: Math.sin(t * 3.4) * 0.08,
      panelTiltX: Math.sin(t * 3.5) * 0.04,
      panelTiltY: Math.sin(t * 3.4) * 0.1,
      panelTiltZ: Math.sin(t * 4.8) * 0.05,
      spinY: Math.sin(t * 1.7) * 0.08,
      eyeX: Math.sin(t * 5.2) * 0.04,
      eyeY: Math.sin(t * 4.7) * 0.02,
      pulse: 0.38,
    };
  }

  if (mode === "spin") {
    return {
      bob: Math.abs(Math.sin(t * 2.9)) * 0.03,
      sway: Math.sin(t * 2.2) * 0.015,
      panelTiltX: Math.sin(t * 4.2) * 0.02,
      panelTiltY: Math.sin(t * 3.6) * 0.03,
      panelTiltZ: Math.sin(t * 3.8) * 0.03,
      spinY: t * 2.1,
      eyeX: Math.sin(t * 3.5) * 0.01,
      eyeY: 0,
      pulse: 0.32,
    };
  }

  if (mode === "celebrate") {
    return {
      bob: Math.abs(Math.sin(t * 5.8)) * 0.1,
      sway: Math.sin(t * 6.4) * 0.11,
      panelTiltX: Math.sin(t * 8.2) * 0.06,
      panelTiltY: Math.sin(t * 6.6) * 0.15,
      panelTiltZ: Math.sin(t * 10.2) * 0.08,
      spinY: Math.sin(t * 8.2) * 0.26,
      eyeX: Math.sin(t * 9.2) * 0.055,
      eyeY: Math.sin(t * 7.4) * 0.025,
      pulse: 0.82,
    };
  }

  if (mode === "thinking") {
    return {
      bob: Math.abs(Math.sin(t * 1.2)) * 0.015,
      sway: Math.sin(t * 1.1) * 0.025,
      panelTiltX: 0.02 + Math.sin(t * 1.2) * 0.02,
      panelTiltY: Math.sin(t * 0.9) * 0.04,
      panelTiltZ: Math.sin(t * 1.1) * 0.018,
      spinY: Math.sin(t * 0.5) * 0.02,
      eyeX: Math.sin(t * 1.8) * 0.06,
      eyeY: Math.sin(t * 1.1) * 0.01,
      pulse: 0.22,
    };
  }

  if (mode === "typing") {
    return {
      bob: Math.abs(Math.sin(t * 6.4)) * 0.018,
      sway: Math.sin(t * 2.6) * 0.015,
      panelTiltX: 0.04 + Math.sin(t * 3.4) * 0.02,
      panelTiltY: Math.sin(t * 2.6) * 0.02,
      panelTiltZ: Math.sin(t * 8.4) * 0.03,
      spinY: Math.sin(t * 1.2) * 0.015,
      eyeX: Math.sin(t * 10.4) * 0.018,
      eyeY: Math.sin(t * 8.8) * 0.012,
      pulse: 0.46,
    };
  }

  if (mode === "reading") {
    return {
      bob: Math.abs(Math.sin(t * 1.6)) * 0.01,
      sway: Math.sin(t * 0.8) * 0.01,
      panelTiltX: 0.04 + Math.sin(t * 1.1) * 0.012,
      panelTiltY: Math.sin(t * 0.8) * 0.01,
      panelTiltZ: Math.sin(t * 1.2) * 0.01,
      spinY: Math.sin(t * 0.5) * 0.01,
      eyeX: Math.sin(t * 1.0) * 0.012,
      eyeY: -0.022 + Math.sin(t * 1.1) * 0.005,
      pulse: 0.16,
    };
  }

  if (mode === "searching") {
    return {
      bob: Math.abs(Math.sin(t * 2.6)) * 0.028,
      sway: Math.sin(t * 1.8) * 0.065,
      panelTiltX: Math.sin(t * 2.2) * 0.04,
      panelTiltY: Math.sin(t * 1.6) * 0.1,
      panelTiltZ: Math.sin(t * 2.4) * 0.04,
      spinY: Math.sin(t * 1.6) * 0.14,
      eyeX: Math.sin(t * 3.1) * 0.075,
      eyeY: Math.sin(t * 2.0) * 0.014,
      pulse: 0.35,
    };
  }

  if (mode === "error") {
    const decay = Math.exp(-t * 2.8);
    const shake = Math.sin(t * 32) * decay;
    return {
      bob: Math.max(0, Math.sin(t * 14) * 0.1 * decay),
      sway: shake * 0.14,
      panelTiltX: Math.sin(t * 24) * 0.09 * decay,
      panelTiltY: shake * 0.14,
      panelTiltZ: Math.sin(t * 26) * 0.1 * decay,
      spinY: shake * 0.14,
      eyeX: Math.sin(t * 22) * 0.1 * decay,
      eyeY: Math.sin(t * 28) * 0.06 * decay,
      pulse: 0.94,
    };
  }

  if (mode === "success") {
    const decay = Math.exp(-t * 3.1);
    return {
      bob: Math.max(0, Math.sin(t * 8.4) * 0.07 * decay) + Math.abs(Math.sin(t * 2.2)) * 0.02,
      sway: Math.sin(t * 1.7) * 0.018,
      panelTiltX: -0.04 * decay + Math.sin(t * 1.6) * 0.018,
      panelTiltY: Math.sin(t * 1.3) * 0.022,
      panelTiltZ: Math.sin(t * 1.4) * 0.02,
      spinY: Math.sin(t * 1.0) * 0.02,
      eyeX: Math.sin(t * 2.1) * 0.02,
      eyeY: 0.01 + Math.sin(t * 1.6) * 0.01,
      pulse: 0.58 + Math.sin(t * 8.4) * 0.22 * decay,
    };
  }

  if (mode === "listening") {
    return {
      bob: Math.abs(Math.sin(t * 1.5)) * 0.01,
      sway: Math.sin(t * 0.7) * 0.008,
      panelTiltX: 0.02 + Math.sin(t * 1.0) * 0.01,
      panelTiltY: Math.sin(t * 0.8) * 0.02,
      panelTiltZ: Math.sin(t * 0.9) * 0.016,
      spinY: Math.sin(t * 0.5) * 0.01,
      eyeX: Math.sin(t * 1.7) * 0.01,
      eyeY: Math.sin(t * 1.3) * 0.008,
      pulse: 0.2,
    };
  }

  return {
    bob: Math.abs(Math.sin(t * 2.1)) * 0.02,
    sway: Math.sin(t * 1.1) * 0.01,
    panelTiltX: Math.sin(t * 1.5) * 0.012,
    panelTiltY: Math.sin(t * 1.3) * 0.015,
    panelTiltZ: Math.sin(t * 1.6) * 0.014,
    spinY: Math.sin(t * 0.8) * 0.01,
    eyeX: Math.sin(t * 1.6) * 0.01,
    eyeY: Math.sin(t * 1.3) * 0.006,
    pulse: 0.14,
  };
}

function blendModePose(fromPose, toPose, blend) {
  const lerp = (fromValue, toValue) => fromValue + (toValue - fromValue) * blend;

  return {
    bob: lerp(fromPose.bob, toPose.bob),
    sway: lerp(fromPose.sway, toPose.sway),
    panelTiltX: lerp(fromPose.panelTiltX, toPose.panelTiltX),
    panelTiltY: lerp(fromPose.panelTiltY, toPose.panelTiltY),
    panelTiltZ: lerp(fromPose.panelTiltZ, toPose.panelTiltZ),
    spinY: lerp(fromPose.spinY, toPose.spinY),
    eyeX: lerp(fromPose.eyeX, toPose.eyeX),
    eyeY: lerp(fromPose.eyeY, toPose.eyeY),
    pulse: lerp(fromPose.pulse, toPose.pulse),
  };
}

function visemePulseBoost(visemeKey) {
  if (["aa", "ae", "ah", "er"].includes(visemeKey)) return 0.18;
  if (["oh", "ao", "ow", "ou", "uw"].includes(visemeKey)) return -0.08;
  if (["ee", "ih", "iy"].includes(visemeKey)) return -0.04;
  if (["sil", "sp", "pau"].includes(visemeKey)) return -0.1;
  return 0;
}

export function createHal9000Controller({
  THREE,
  scene,
  initialState,
  stageTopY,
  avatarId,
}) {
  const state = { ...initialState };
  const avatar = createHal9000Avatar(THREE, state);
  scene.add(avatar.group);

  const propManager = createPropManager();
  const sharedPropNames = listSharedProps();
  let currentPropName = NO_PROP_VALUE;
  let currentPropId = null;

  const runtime = {
    elapsed: 0,
    lookX: 0,
    lookY: 0,
    lookTargetX: 0,
    lookTargetY: 0,
    baseX: 0,
    baseY: stageTopY ?? -2.67,
    expression: expressionProfile(state.expression),
    currentMode: MODE_CHOICES.includes(state.mode) ? state.mode : MODE_CHOICES[0],
    previousMode: MODE_CHOICES.includes(state.mode) ? state.mode : MODE_CHOICES[0],
    modeBlend: 1,
    modePulse: 0,
    voiceTarget: 0,
    voiceCurrent: 0,
    voicePhase: Math.random() * Math.PI * 2,
    visemeKey: SIL_VISEME,
    visemeStrength: 0,
    baseIrisScale: 1,
    basePupilScale: 1,
    lensScale: 1,
  };

  function updateMaterials() {
    avatar.materials.panel.color.set(state.panelColor);
    avatar.materials.panel.metalness = clamp(state.metalness, 0, 1);
    avatar.materials.panel.roughness = clamp(state.roughness, 0, 1);
    avatar.materials.panel.clearcoat = clamp(state.clearcoat, 0, 1);
    avatar.materials.panel.clearcoatRoughness = clamp(state.clearcoatRoughness, 0, 1);
    avatar.materials.panel.needsUpdate = true;

    avatar.materials.accent.color.set(state.accentColor);
    avatar.materials.accent.needsUpdate = true;

    avatar.materials.bezel.color.set(state.bezelColor);
    avatar.materials.bezel.needsUpdate = true;

    avatar.materials.lensGlass.color.set(state.lensColor);
    avatar.materials.lensGlass.emissive.set(state.glowColor);
    avatar.materials.lensGlass.emissiveIntensity = clamp(state.glowIntensity * 0.2, 0, 1);
    avatar.materials.lensGlass.needsUpdate = true;

    avatar.materials.iris.color.set(state.irisColor);
    avatar.materials.iris.needsUpdate = true;

    avatar.materials.pupil.color.set(state.pupilColor);
    avatar.materials.pupil.needsUpdate = true;

    avatar.materials.glowRing.color.set(state.glowColor);
    avatar.materials.glowCore.color.set(state.glowColor);
    avatar.materials.glowRing.needsUpdate = true;
    avatar.materials.glowCore.needsUpdate = true;

    avatar.eyeLight.color.set(state.glowColor);
  }

  function applyEyeScale({
    irisScale = runtime.baseIrisScale,
    pupilScale = runtime.basePupilScale,
  } = {}) {
    avatar.iris.scale.setScalar(clamp(irisScale, 0.4, 2.2));
    avatar.pupil.scale.setScalar(clamp(pupilScale, 0.32, 2.2));
  }

  function applyEyeOffset({ x = 0, y = 0 } = {}) {
    avatar.iris.position.x = x;
    avatar.iris.position.y = y;
    avatar.pupil.position.x = x;
    avatar.pupil.position.y = y;
    avatar.glowRing.position.x = x;
    avatar.glowRing.position.y = y;
    avatar.glowCore.position.x = x;
    avatar.glowCore.position.y = y;
  }

  function applyShapeState() {
    runtime.expression = expressionProfile(state.expression);
    const expr = runtime.expression;

    avatar.group.scale.setScalar(state.scale);
    avatar.panelRoot.scale.set(state.panelWidth, state.panelHeight, state.panelDepth);

    const lensScale = clamp(state.lensScale, 0.6, 1.8);
    runtime.lensScale = lensScale;
    avatar.bezelOuter.scale.set(lensScale, lensScale, 1);
    avatar.bezelInner.scale.set(lensScale, lensScale, 1);
    avatar.lensGlass.scale.set(lensScale, lensScale, 0.46 * lensScale);
    avatar.lensHighlight.scale.set(lensScale, lensScale, 1);

    runtime.baseIrisScale = clamp(state.irisScale * expr.irisScale, 0.45, 2);
    runtime.basePupilScale = clamp(state.pupilScale * expr.pupilScale, 0.35, 2);
    applyEyeScale();

    const eyeY = state.eyeY + expr.eyeYOffset;
    avatar.eyeRoot.position.set(0, eyeY, 0.225 + state.eyeZ);
    avatar.faceRoot.position.set(0, eyeY, 0.25 + state.eyeZ);

    runtime.baseY = (stageTopY ?? -2.67) + avatar.metrics.groundOffset * state.scale * state.panelHeight + 0.01;
  }

  function syncModeTransition({ force = false } = {}) {
    if (force) {
      runtime.previousMode = state.mode;
      runtime.currentMode = state.mode;
      runtime.modeBlend = 1;
      return;
    }

    if (state.mode !== runtime.currentMode) {
      runtime.previousMode = runtime.currentMode;
      runtime.currentMode = state.mode;
      runtime.modeBlend = 0;
    }
  }

  function applyAnimationFrame(dt) {
    runtime.elapsed += dt;

    const t = runtime.elapsed;
    runtime.modeBlend = Math.min(1, runtime.modeBlend + dt / 0.28);

    const easedBlend = runtime.modeBlend * runtime.modeBlend * (3 - 2 * runtime.modeBlend);
    const fromPose = sampleModePose(runtime.previousMode, t);
    const toPose = sampleModePose(runtime.currentMode, t);
    const pose = blendModePose(fromPose, toPose, easedBlend);

    if (runtime.modeBlend >= 1) {
      runtime.previousMode = runtime.currentMode;
    }

    runtime.modePulse = pose.pulse;

    const lookSmoothing = Math.min(1, dt * 10);
    runtime.lookX += (runtime.lookTargetX - runtime.lookX) * lookSmoothing;
    runtime.lookY += (runtime.lookTargetY - runtime.lookY) * lookSmoothing;

    const expr = runtime.expression;
    const eyeX = pose.eyeX + runtime.lookX * (0.2 + expr.scanWeight * 0.25);
    const eyeY = pose.eyeY + runtime.lookY * 0.18;
    applyEyeOffset({
      x: clamp(eyeX, -0.11, 0.11),
      y: clamp(eyeY, -0.09, 0.09),
    });

    avatar.group.position.x = runtime.baseX + pose.sway;
    avatar.group.position.y = runtime.baseY + pose.bob;
    avatar.group.rotation.y = pose.spinY;

    avatar.panelRoot.rotation.x = pose.panelTiltX;
    avatar.panelRoot.rotation.y = pose.panelTiltY;
    avatar.panelRoot.rotation.z = pose.panelTiltZ;
  }

  function applyVoiceFrame(dt) {
    const smoothing = runtime.voiceTarget > runtime.voiceCurrent ? 0.34 : 0.2;
    runtime.voiceCurrent += (runtime.voiceTarget - runtime.voiceCurrent) * smoothing;
    if (runtime.voiceCurrent < 0.004) runtime.voiceCurrent = 0;

    runtime.voicePhase += dt * (18 + runtime.voiceCurrent * 32);

    const expr = runtime.expression;
    const visemeBoost = visemePulseBoost(runtime.visemeKey) * runtime.visemeStrength;
    const jitter = Math.sin(runtime.voicePhase) * 0.06 * runtime.voiceCurrent;
    const pulse = clamp(
      runtime.modePulse
      + runtime.voiceCurrent * 0.72
      + runtime.visemeStrength * 0.26
      + visemeBoost
      + jitter,
      0,
      1.45,
    );

    const irisScale = runtime.baseIrisScale * (1 + pulse * 0.22);
    const pupilScale = runtime.basePupilScale * (1 - pulse * 0.3 + visemeBoost * 0.28);
    applyEyeScale({ irisScale, pupilScale });

    const glowOpacity = clamp(
      0.18 + state.glowIntensity * 0.45 + pulse * 0.35 + expr.glowBoost * 0.22,
      0.08,
      1,
    );
    avatar.materials.glowRing.opacity = glowOpacity;
    avatar.materials.glowCore.opacity = clamp(glowOpacity * 0.82, 0.06, 1);
    avatar.eyeLight.intensity = 1 + state.glowIntensity * 2.2 + pulse * 1.35 + expr.glowBoost;
  }

  function applyPropPlacement() {
    if (currentPropId === null) return;
    const obj = propManager.getObject(currentPropId);
    if (!obj) return;

    applyPlacementToObject(obj, {
      x: state.propX,
      y: state.propY,
      z: state.propZ,
      scale: state.propScale,
      rotX: state.propRotX,
      rotY: state.propRotY,
      rotZ: state.propRotZ,
    });
  }

  function syncProp(force = false) {
    const desired = state.propName || NO_PROP_VALUE;
    if (!force && desired === currentPropName) return;

    if (currentPropId !== null) {
      propManager.detach(currentPropId);
      currentPropId = null;
    }
    currentPropName = NO_PROP_VALUE;

    if (desired === NO_PROP_VALUE) return;
    const def = getSharedProp(desired);
    if (!def) return;

    const anchors = {
      head: avatar.faceRoot,
      body: avatar.panelRoot,
    };
    const anchor = anchors[def.defaultAnchor];
    currentPropId = propManager.attach({
      name: desired,
      anchorName: def.defaultAnchor,
      anchor,
      propDefinition: def,
      THREE,
    });
    if (currentPropId === null) return;
    currentPropName = desired;

    const placement = loadPropPlacement(desired, avatarId, def);
    state.propX = placement.x;
    state.propY = placement.y;
    state.propZ = placement.z;
    state.propScale = placement.scale;
    state.propRotX = placement.rotX;
    state.propRotY = placement.rotY;
    state.propRotZ = placement.rotZ;

    applyPropPlacement();
  }

  function setState(nextState = {}, { force = false } = {}) {
    Object.assign(state, nextState);

    state.mode = MODE_CHOICES.includes(state.mode) ? state.mode : MODE_CHOICES[0];
    state.expression = EXPRESSION_CHOICES.includes(state.expression)
      ? state.expression
      : EXPRESSION_CHOICES[0];

    if (force) {
      runtime.elapsed = 0;
      runtime.modePulse = 0;
    }

    syncModeTransition({ force });
    applyShapeState();
    updateMaterials();
    syncProp(force);
    applyPropPlacement();

    if (currentPropName !== NO_PROP_VALUE) {
      savePropPlacement(currentPropName, avatarId, {
        x: state.propX,
        y: state.propY,
        z: state.propZ,
        scale: state.propScale,
        rotX: state.propRotX,
        rotY: state.propRotY,
        rotZ: state.propRotZ,
      });
    }
  }

  function update(dt, pointer) {
    const frameDt = Math.min(dt, 0.08) * state.speed;

    if (pointer) {
      runtime.lookTargetX = pointer.x * 0.06;
      runtime.lookTargetY = pointer.y * 0.05;
    }

    applyAnimationFrame(frameDt);
    applyVoiceFrame(frameDt);
  }

  function setVoiceActivity(level = 0) {
    const next = Number(level);
    runtime.voiceTarget = clamp(Number.isFinite(next) ? next : 0, 0, 1);
  }

  function setVoiceViseme(payload = null) {
    const key = String(payload?.viseme || SIL_VISEME).toLowerCase();
    runtime.visemeKey = key;
    const nextStrength = Number(payload?.strength);
    runtime.visemeStrength = clamp(Number.isFinite(nextStrength) ? nextStrength : 0, 0, 1);
  }

  function dispose() {
    propManager.detachAll();
    scene.remove(avatar.group);
    avatar.dispose();
  }

  setState(state, { force: true });

  return {
    group: avatar.group,
    setState,
    update,
    setVoiceActivity,
    setVoiceViseme,
    dispose,
    getAnchors() {
      return {
        head: avatar.faceRoot,
        body: avatar.panelRoot,
      };
    },
    getCatalog() {
      return {
        modes: [...MODE_CHOICES],
        expressions: [...EXPRESSION_CHOICES],
        props: [NO_PROP_VALUE, ...sharedPropNames],
      };
    },
  };
}

registerEngine("hal9000", createHal9000Controller);
