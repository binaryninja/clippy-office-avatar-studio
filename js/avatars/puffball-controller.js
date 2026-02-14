import { createPuffballAvatar } from "../lib/puffball-factory.js";
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

const MODE_CHOICES = ["idle", "bounce", "dance", "wiggle", "spin"];
const EXPRESSION_CHOICES = ["neutral", "happy", "mischievous", "surprised"];

function expressionProfile(expression) {
  if (expression === "happy") {
    return {
      eyeScale: 1.1,
      eyeY: 0.01,
      browTilt: -0.06,
      browLift: 0.06,
      mouthWidth: 1.15,
      mouthOpen: 0.18,
      mouthY: 0.02,
      earWiggle: 0.08,
    };
  }

  if (expression === "mischievous") {
    return {
      eyeScale: 0.92,
      eyeY: -0.01,
      browTilt: 0.28,
      browLift: 0.04,
      mouthWidth: 1.05,
      mouthOpen: 0.08,
      mouthY: 0.01,
      earWiggle: -0.06,
    };
  }

  if (expression === "surprised") {
    return {
      eyeScale: 1.32,
      eyeY: 0.03,
      browTilt: 0.02,
      browLift: 0.14,
      mouthWidth: 0.82,
      mouthOpen: 0.62,
      mouthY: -0.02,
      earWiggle: 0.18,
    };
  }

  return {
    eyeScale: 1,
    eyeY: 0,
    browTilt: 0,
    browLift: 0,
    mouthWidth: 1,
    mouthOpen: 0,
    mouthY: 0,
    earWiggle: 0,
  };
}

// Squash-and-stretch helper: preserves volume
function squashStretch(factor) {
  const vert = factor;
  const horiz = 1 / Math.sqrt(Math.max(0.1, vert));
  return { scaleX: horiz, scaleY: vert, scaleZ: horiz };
}

function sampleModePose(mode, t) {
  if (mode === "bounce") {
    const bounce = Math.abs(Math.sin(t * 5.5));
    const phase = Math.sin(t * 5.5);
    const ss = phase > 0
      ? 1 + bounce * 0.22
      : 1 - (1 - bounce) * 0.16;
    return {
      hop: bounce * 0.32,
      sway: Math.sin(t * 2.8) * 0.04,
      ...squashStretch(ss),
      spinY: Math.sin(t * 1.2) * 0.03,
      leftArmZ: 0.6 + Math.sin(t * 5.5) * 0.25,
      rightArmZ: -0.6 - Math.sin(t * 5.5) * 0.25,
      earWiggle: Math.sin(t * 11) * 0.08,
      bodyTiltX: Math.sin(t * 5.5) * 0.06,
      bodyTiltZ: 0,
    };
  }

  if (mode === "dance") {
    const beat = t * 6.2;
    const bounce = Math.abs(Math.sin(beat));
    const ss = 1 + Math.sin(beat) * 0.12;
    return {
      hop: bounce * 0.2,
      sway: Math.sin(beat * 0.5) * 0.18,
      ...squashStretch(ss),
      spinY: Math.sin(beat * 0.25) * 0.35,
      leftArmZ: 0.4 + Math.sin(beat + 0.4) * 0.55,
      rightArmZ: -0.4 - Math.sin(beat - 0.4) * 0.55,
      earWiggle: Math.sin(beat * 2) * 0.12,
      bodyTiltX: Math.sin(beat) * 0.08,
      bodyTiltZ: Math.sin(beat * 0.5) * 0.14,
    };
  }

  if (mode === "wiggle") {
    return {
      hop: Math.abs(Math.sin(t * 3.8)) * 0.06,
      sway: Math.sin(t * 4.2) * 0.22,
      ...squashStretch(1 + Math.sin(t * 8.4) * 0.06),
      spinY: Math.sin(t * 4.2) * 0.18,
      leftArmZ: 0.5 + Math.sin(t * 4.2 + 1) * 0.2,
      rightArmZ: -0.5 - Math.sin(t * 4.2 - 1) * 0.2,
      earWiggle: Math.sin(t * 8.4) * 0.15,
      bodyTiltX: Math.sin(t * 4.6) * 0.06,
      bodyTiltZ: Math.sin(t * 4.2) * 0.12,
    };
  }

  if (mode === "spin") {
    return {
      hop: Math.abs(Math.sin(t * 3)) * 0.1,
      sway: Math.sin(t * 2.4) * 0.03,
      ...squashStretch(1 + Math.sin(t * 6) * 0.05),
      spinY: t * 3.0,
      leftArmZ: 0.3,
      rightArmZ: -0.3,
      earWiggle: Math.sin(t * 12) * 0.06,
      bodyTiltX: Math.sin(t * 5.1) * 0.04,
      bodyTiltZ: Math.sin(t * 5.6) * 0.06,
    };
  }

  // idle: gentle breathing
  const breath = Math.sin(t * 2.2);
  return {
    hop: Math.abs(Math.sin(t * 1.8)) * 0.025,
    sway: Math.sin(t * 1.1) * 0.02,
    ...squashStretch(1 + breath * 0.035),
    spinY: Math.sin(t * 0.7) * 0.02,
    leftArmZ: 0.6 + Math.sin(t * 1.8) * 0.06,
    rightArmZ: -0.6 - Math.sin(t * 1.8) * 0.06,
    earWiggle: Math.sin(t * 2.6) * 0.02,
    bodyTiltX: Math.sin(t * 1.5) * 0.015,
    bodyTiltZ: Math.sin(t * 1.7) * 0.02,
  };
}

function blendModePose(fromPose, toPose, blend) {
  const lerp = (a, b) => a + (b - a) * blend;
  return {
    hop: lerp(fromPose.hop, toPose.hop),
    sway: lerp(fromPose.sway, toPose.sway),
    scaleX: lerp(fromPose.scaleX, toPose.scaleX),
    scaleY: lerp(fromPose.scaleY, toPose.scaleY),
    scaleZ: lerp(fromPose.scaleZ, toPose.scaleZ),
    spinY: lerp(fromPose.spinY, toPose.spinY),
    leftArmZ: lerp(fromPose.leftArmZ, toPose.leftArmZ),
    rightArmZ: lerp(fromPose.rightArmZ, toPose.rightArmZ),
    earWiggle: lerp(fromPose.earWiggle, toPose.earWiggle),
    bodyTiltX: lerp(fromPose.bodyTiltX, toPose.bodyTiltX),
    bodyTiltZ: lerp(fromPose.bodyTiltZ, toPose.bodyTiltZ),
  };
}

export function createPuffballController({
  THREE,
  scene,
  initialState,
  stageTopY,
  avatarId,
}) {
  const state = { ...initialState };
  const avatar = createPuffballAvatar(THREE, state);
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
    eyeBaseY: 0.06,
    eyeScale: 1,
    eyeOvalY: 1.15,
    pupilBaseScale: 1,
    baseX: 0,
    baseY: stageTopY ?? -2.67,
    currentMode: MODE_CHOICES.includes(state.mode) ? state.mode : MODE_CHOICES[0],
    previousMode: MODE_CHOICES.includes(state.mode) ? state.mode : MODE_CHOICES[0],
    modeBlend: 1,
    blinkTimer: 0,
    blinkOffset: 0.42,
    voiceTarget: 0,
    voiceCurrent: 0,
    voicePhase: Math.random() * Math.PI * 2,
  };

  function updateMaterials() {
    const bodyMat = avatar.materials.body;
    bodyMat.color.set(state.bodyColor);
    const sheenTint = bodyMat.color.clone().lerp(new THREE.Color("#ffffff"), 0.35);
    bodyMat.sheenColor.copy(sheenTint);
    bodyMat.roughness = clamp(state.roughness, 0, 1);
    bodyMat.metalness = clamp(state.metalness, 0, 1);
    bodyMat.sheen = clamp(state.sheen ?? 1.0, 0, 1);
    bodyMat.sheenRoughness = clamp(state.sheenRoughness ?? 0.4, 0, 1);
    bodyMat.clearcoat = clamp(state.clearcoat, 0, 1);
    bodyMat.clearcoatRoughness = clamp(state.clearcoatRoughness, 0, 1);
    bodyMat.emissive.set(state.glowColor);
    bodyMat.emissiveIntensity = clamp(state.glowIntensity * 0.18, 0, 1);
    bodyMat.needsUpdate = true;

    const bellyMat = avatar.materials.belly;
    bellyMat.color.set(state.bellyColor);
    const bellySheenTint = bellyMat.color.clone().lerp(new THREE.Color("#ffffff"), 0.25);
    bellyMat.sheenColor.copy(bellySheenTint);
    bellyMat.needsUpdate = true;

    const earInnerMat = avatar.materials.earInner;
    earInnerMat.color.set(state.bellyColor);
    earInnerMat.needsUpdate = true;

    avatar.materials.eyeWhite.color.set(state.eyeColor || "#f8fafc");
    avatar.materials.eyeWhite.needsUpdate = true;

    avatar.materials.dark.color.set(state.darkColor);
    avatar.materials.dark.needsUpdate = true;
  }

  function applyShapeState() {
    const expr = expressionProfile(state.expression);

    avatar.group.scale.setScalar(state.scale);

    // Face position
    avatar.faceRoot.position.set(0, 0.15 + state.faceY, 0.82 + state.faceZ);

    // Eyes
    const eyeScale = clamp(state.eyeScale * expr.eyeScale, 0.5, 2.4);
    runtime.eyeScale = eyeScale;
    runtime.eyeBaseY = 0.06 + expr.eyeY;
    runtime.eyeOvalY = clamp(1.0 + eyeScale * 0.2, 0.9, 1.6);
    runtime.pupilBaseScale = clamp(state.pupilScale * (0.82 + eyeScale * 0.12), 0.5, 1.4);

    avatar.leftEyeRoot.position.set(-state.eyeSpacing, runtime.eyeBaseY, 0.16);
    avatar.rightEyeRoot.position.set(state.eyeSpacing, runtime.eyeBaseY, 0.16);

    avatar.leftEye.scale.set(eyeScale, runtime.eyeOvalY, 1);
    avatar.rightEye.scale.set(eyeScale, runtime.eyeOvalY, 1);
    avatar.leftPupil.scale.set(runtime.pupilBaseScale, runtime.pupilBaseScale, 1);
    avatar.rightPupil.scale.set(runtime.pupilBaseScale, runtime.pupilBaseScale, 1);
    avatar.leftPupil.position.set(0, 0, 0.003);
    avatar.rightPupil.position.set(0, 0, 0.003);

    // Brows
    const browY = 0.28 + state.browLift + expr.browLift;
    const browTilt = state.browTilt + expr.browTilt;

    avatar.leftBrow.position.set(-state.eyeSpacing - 0.02, browY, 0.15);
    avatar.rightBrow.position.set(state.eyeSpacing + 0.02, browY, 0.15);
    avatar.leftBrow.rotation.z = -0.1 - browTilt * 0.7;
    avatar.rightBrow.rotation.z = 0.1 + browTilt * 0.7;

    // Mouth
    const mouthWidth = clamp(state.mouthWidth * expr.mouthWidth, 0.5, 1.8);
    const mouthOpen = clamp((state.mouthOpen ?? 0) + expr.mouthOpen, 0, 1.2);

    avatar.mouthRoot.position.set(0, -0.16 + (expr.mouthY ?? 0) * 0.4, 0.17);
    avatar.smile.scale.set(0.9 * mouthWidth, 0.9 + mouthOpen * 0.2, 1);
    avatar.mouthCavity.visible = mouthOpen > 0.15;
    avatar.mouthCavity.scale.set(1.1 * mouthWidth, 0.3 + mouthOpen * 0.5, 1);

    // Ears
    const earSize = state.earSize ?? 1.0;
    const earTilt = state.earTilt ?? 0.45;
    avatar.leftEar.scale.setScalar(earSize);
    avatar.rightEar.scale.setScalar(earSize);
    avatar.leftEar.rotation.z = earTilt;
    avatar.rightEar.rotation.z = -earTilt;

    // Arms
    avatar.leftArm.position.set(
      -(0.88 + state.armSpread * 0.16),
      state.armY,
      0.12,
    );
    avatar.rightArm.position.set(
      0.88 + state.armSpread * 0.16,
      state.armY,
      0.12,
    );

    // Feet
    avatar.leftFoot.position.set(-state.feetSpread, avatar.metrics.footBottomOffset, 0.14);
    avatar.rightFoot.position.set(state.feetSpread, avatar.metrics.footBottomOffset, 0.14);

    // Calculate base Y from feet bottom
    const footBottomY =
      avatar.metrics.footBottomOffset -
      avatar.metrics.footRadius * 0.8;
    runtime.baseY = (stageTopY ?? -2.67) - footBottomY * state.scale + 0.01;
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
    runtime.blinkTimer += dt;

    const t = runtime.elapsed;
    runtime.modeBlend = Math.min(1, runtime.modeBlend + dt / 0.28);

    const easedBlend =
      runtime.modeBlend * runtime.modeBlend * (3 - 2 * runtime.modeBlend);
    const fromPose = sampleModePose(runtime.previousMode, t);
    const toPose = sampleModePose(runtime.currentMode, t);
    const pose = blendModePose(fromPose, toPose, easedBlend);

    if (runtime.modeBlend >= 1) {
      runtime.previousMode = runtime.currentMode;
    }

    // Position
    avatar.group.position.x = runtime.baseX + pose.sway;
    avatar.group.position.y = runtime.baseY + pose.hop;
    avatar.group.rotation.y = pose.spinY;

    // Squash and stretch on body shell
    avatar.bodyShell.scale.set(pose.scaleX, pose.scaleY, pose.scaleZ);

    // Body tilt
    avatar.bodyShell.rotation.x = pose.bodyTiltX;
    avatar.bodyShell.rotation.z = pose.bodyTiltZ;

    // Arms follow body motion
    avatar.leftArm.rotation.z = pose.leftArmZ + pose.bodyTiltZ * 0.3;
    avatar.rightArm.rotation.z = pose.rightArmZ + pose.bodyTiltZ * 0.3;

    // Ear wiggle
    const expr = expressionProfile(state.expression);
    const earWiggle = pose.earWiggle + expr.earWiggle;
    const baseEarTilt = state.earTilt ?? 0.45;
    avatar.leftEar.rotation.z = baseEarTilt + earWiggle;
    avatar.rightEar.rotation.z = -baseEarTilt - earWiggle;

    // Eye tracking
    const lookSmoothing = Math.min(1, dt * 10);
    runtime.lookX += (runtime.lookTargetX - runtime.lookX) * lookSmoothing;
    runtime.lookY += (runtime.lookTargetY - runtime.lookY) * lookSmoothing;

    const lookX = clamp(runtime.lookX, -0.09, 0.09);
    const lookY = clamp(runtime.lookY, -0.06, 0.06);

    const pupilX = lookX * 0.55;
    const pupilY = lookY * 0.55;

    // Blinking
    const blinkInterval = 3.2;
    const blinkDuration = 0.14;
    const blinkPhase =
      (runtime.blinkTimer + runtime.blinkOffset) % blinkInterval;
    let blink = 0;

    if (blinkPhase > blinkInterval - blinkDuration) {
      const phase =
        (blinkPhase - (blinkInterval - blinkDuration)) / blinkDuration;
      blink = Math.sin(phase * Math.PI);
    }

    const eyelidScale = clamp(1 - blink * 0.9, 0.1, 1);
    const pupilYScale = clamp(1 - blink * 0.75, 0.2, 1);

    avatar.leftEye.scale.set(
      runtime.eyeScale,
      runtime.eyeOvalY * eyelidScale,
      1,
    );
    avatar.rightEye.scale.set(
      runtime.eyeScale,
      runtime.eyeOvalY * eyelidScale,
      1,
    );

    avatar.leftPupil.position.set(pupilX, pupilY - blink * 0.005, 0.003);
    avatar.rightPupil.position.set(pupilX, pupilY - blink * 0.005, 0.003);
    avatar.leftPupil.scale.set(
      runtime.pupilBaseScale,
      runtime.pupilBaseScale * pupilYScale,
      1,
    );
    avatar.rightPupil.scale.set(
      runtime.pupilBaseScale,
      runtime.pupilBaseScale * pupilYScale,
      1,
    );
  }

  function applyVoiceFrame(dt) {
    const smoothing = runtime.voiceTarget > runtime.voiceCurrent ? 0.38 : 0.2;
    runtime.voiceCurrent +=
      (runtime.voiceTarget - runtime.voiceCurrent) * smoothing;
    if (runtime.voiceCurrent < 0.004) runtime.voiceCurrent = 0;

    runtime.voicePhase += dt * (22 + runtime.voiceCurrent * 36);

    const flutter =
      Math.sin(runtime.voicePhase) * 0.07 * runtime.voiceCurrent;
    const open = clamp(runtime.voiceCurrent * 0.78 + flutter, 0, 1.2);

    const expr = expressionProfile(state.expression);
    const mouthWidth = clamp(state.mouthWidth * expr.mouthWidth, 0.5, 1.8);
    const mouthOpen = clamp(
      (state.mouthOpen ?? 0) + expr.mouthOpen + open,
      0,
      1.3,
    );

    avatar.smile.scale.set(0.9 * mouthWidth, 0.9 + mouthOpen * 0.2, 1);
    avatar.mouthCavity.visible = mouthOpen > 0.15;
    avatar.mouthCavity.scale.set(1.1 * mouthWidth, 0.3 + mouthOpen * 0.5, 1);

    // Subtle body reaction to voice
    if (runtime.voiceCurrent > 0.1) {
      const voiceBounce = Math.sin(runtime.voicePhase * 0.5) * runtime.voiceCurrent * 0.02;
      avatar.group.position.y += voiceBounce;
    }
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
      body: avatar.bodyShell,
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

    state.mode = MODE_CHOICES.includes(state.mode)
      ? state.mode
      : MODE_CHOICES[0];
    state.expression = EXPRESSION_CHOICES.includes(state.expression)
      ? state.expression
      : EXPRESSION_CHOICES[0];

    if (force) {
      runtime.elapsed = 0;
      runtime.blinkTimer = 0;
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

  function update(dt, lookPointer) {
    const frameDt = Math.min(dt, 0.08) * state.speed;

    if (lookPointer) {
      runtime.lookTargetX = lookPointer.x * 0.07;
      runtime.lookTargetY = lookPointer.y * 0.05;
    }

    applyAnimationFrame(frameDt);
    applyVoiceFrame(frameDt);
  }

  function setVoiceActivity(level = 0) {
    const next = Number(level);
    runtime.voiceTarget = clamp(Number.isFinite(next) ? next : 0, 0, 1);
  }

  function setVoiceViseme(_payload) {
    // Puffball uses voice-activity-driven mouth animation;
    // viseme-specific shaping is not yet implemented for this engine.
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
        body: avatar.bodyShell,
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

registerEngine("puffball", createPuffballController);
