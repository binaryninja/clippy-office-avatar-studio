import { createTowelyAvatar } from "../lib/towely-factory.js";
import { clamp } from "../lib/utils.js";
import { registerEngine } from "../engines.js";

const MODE_CHOICES = ["idle", "bob", "wave", "spin", "celebrate"];
const EXPRESSION_CHOICES = ["neutral", "smug", "angry", "startled"];

function expressionProfile(expression) {
  if (expression === "smug") {
    return {
      eyeScale: 0.96,
      eyeY: -0.005,
      browTilt: 0.08,
      browLift: 0.02,
      mouthWidth: 1.06,
      mouthOpen: 0.05,
      mouthY: 0.02,
      mouthTilt: -0.12,
    };
  }

  if (expression === "angry") {
    return {
      eyeScale: 0.9,
      eyeY: -0.01,
      browTilt: 0.38,
      browLift: -0.08,
      mouthWidth: 0.92,
      mouthOpen: 0.02,
      mouthY: -0.01,
      mouthTilt: 0,
    };
  }

  if (expression === "startled") {
    return {
      eyeScale: 1.22,
      eyeY: 0.02,
      browTilt: 0.04,
      browLift: 0.11,
      mouthWidth: 0.86,
      mouthOpen: 0.52,
      mouthY: 0.06,
      mouthTilt: 0,
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
    mouthTilt: 0,
  };
}

function sampleModePose(mode, t) {
  if (mode === "bob") {
    return {
      hop: Math.abs(Math.sin(t * 4)) * 0.16,
      sway: Math.sin(t * 3.2) * 0.08,
      bodyTiltX: Math.sin(t * 4.3) * 0.08,
      bodyTiltZ: Math.sin(t * 4.9) * 0.09,
      spinY: Math.sin(t * 0.9) * 0.02,
      leftShoulder: -0.18,
      rightShoulder: 0.18,
      leftElbow: -0.12,
      rightElbow: 0.12,
    };
  }

  if (mode === "wave") {
    return {
      hop: Math.abs(Math.sin(t * 3.1)) * 0.1,
      sway: Math.sin(t * 2.1) * 0.05,
      bodyTiltX: Math.sin(t * 3.8) * 0.04,
      bodyTiltZ: Math.sin(t * 2.8) * 0.06,
      spinY: Math.sin(t * 0.9) * 0.02,
      leftShoulder: -0.12,
      rightShoulder: -1.02 + Math.sin(t * 8.3) * 0.22,
      leftElbow: -0.1,
      rightElbow: -0.84 + Math.sin(t * 8.3 + 0.8) * 0.36,
    };
  }

  if (mode === "spin") {
    return {
      hop: Math.abs(Math.sin(t * 3.1)) * 0.08,
      sway: Math.sin(t * 2.4) * 0.02,
      bodyTiltX: Math.sin(t * 5.1) * 0.04,
      bodyTiltZ: Math.sin(t * 5.6) * 0.07,
      spinY: t * 2.25,
      leftShoulder: -0.24,
      rightShoulder: 0.24,
      leftElbow: 0,
      rightElbow: 0,
    };
  }

  if (mode === "celebrate") {
    return {
      hop: Math.abs(Math.sin(t * 6)) * 0.24,
      sway: Math.sin(t * 7.2) * 0.13,
      bodyTiltX: Math.sin(t * 7.4) * 0.1,
      bodyTiltZ: Math.sin(t * 12.4) * 0.14,
      spinY: Math.sin(t * 9.2) * 0.24,
      leftShoulder: -0.94 + Math.sin(t * 12) * 0.3,
      rightShoulder: 0.94 - Math.sin(t * 12) * 0.3,
      leftElbow: -0.5 + Math.sin(t * 13.4) * 0.28,
      rightElbow: 0.5 - Math.sin(t * 13.4) * 0.28,
    };
  }

  return {
    hop: Math.abs(Math.sin(t * 2.1)) * 0.04,
    sway: Math.sin(t * 1.3) * 0.03,
    bodyTiltX: Math.sin(t * 1.7) * 0.02,
    bodyTiltZ: Math.sin(t * 1.9) * 0.03,
    spinY: Math.sin(t * 0.9) * 0.02,
    leftShoulder: 0,
    rightShoulder: 0,
    leftElbow: 0,
    rightElbow: 0,
  };
}

function blendModePose(fromPose, toPose, blend) {
  const lerp = (fromValue, toValue) => fromValue + (toValue - fromValue) * blend;

  return {
    hop: lerp(fromPose.hop, toPose.hop),
    sway: lerp(fromPose.sway, toPose.sway),
    bodyTiltX: lerp(fromPose.bodyTiltX, toPose.bodyTiltX),
    bodyTiltZ: lerp(fromPose.bodyTiltZ, toPose.bodyTiltZ),
    spinY: lerp(fromPose.spinY, toPose.spinY),
    leftShoulder: lerp(fromPose.leftShoulder, toPose.leftShoulder),
    rightShoulder: lerp(fromPose.rightShoulder, toPose.rightShoulder),
    leftElbow: lerp(fromPose.leftElbow, toPose.leftElbow),
    rightElbow: lerp(fromPose.rightElbow, toPose.rightElbow),
  };
}

export function createTowelyController({ THREE, scene, initialState, stageTopY }) {
  const state = { ...initialState };
  const avatar = createTowelyAvatar(THREE, state);
  scene.add(avatar.group);

  const runtime = {
    elapsed: 0,
    lookX: 0,
    lookY: 0,
    lookTargetX: 0,
    lookTargetY: 0,
    eyeBaseY: 0.02,
    eyeScale: 1,
    eyeOvalY: 1.2,
    pupilBaseScale: 1,
    leftShoulderBase: -0.62,
    rightShoulderBase: 0.62,
    leftElbowBase: 0.45,
    rightElbowBase: -0.45,
    baseX: 0,
    baseY: stageTopY,
    leftArmFollow: 0,
    rightArmFollow: 0,
    currentMode: MODE_CHOICES.includes(state.mode) ? state.mode : MODE_CHOICES[0],
    previousMode: MODE_CHOICES.includes(state.mode) ? state.mode : MODE_CHOICES[0],
    modeBlend: 1,
    blinkTimer: 0,
    blinkOffset: 0.34,
  };

  function updateMaterials() {
    const clothMaterial = avatar.materials.cloth;
    const clothUniforms = clothMaterial?.uniforms;
    const bodyHeight = Math.max(0.001, avatar.metrics.bodyHeight || avatar.metrics.bodyTopY - avatar.metrics.bodyBottomY);

    if (clothMaterial?.isShaderMaterial && clothUniforms) {
      if (clothUniforms.uColor) {
        clothUniforms.uColor.value.set(state.bodyColor);
      }
      if (clothUniforms.uStripeColor) {
        clothUniforms.uStripeColor.value.set(state.stripeColor || "#dcdcf2");
      }
      if (clothUniforms.uGlowColor) {
        clothUniforms.uGlowColor.value.set(state.glowColor);
      }
      if (clothUniforms.uGlowIntensity) {
        clothUniforms.uGlowIntensity.value = clamp(state.glowIntensity * 0.2, 0, 1);
      }
      if (clothUniforms.uFuzziness) {
        clothUniforms.uFuzziness.value = clamp(state.fuzziness ?? 35 + state.roughness * 65, 0, 100);
      }
      if (clothUniforms.uLoopScale) {
        clothUniforms.uLoopScale.value = clamp(state.loopScale ?? 42 + state.bodyDepth * 8, 10, 100);
      }
      if (clothUniforms.uStripeWidth) {
        clothUniforms.uStripeWidth.value = clamp(30 + state.clearcoat * 28, 0, 100);
      }
      if (clothUniforms.uStripeOffset) {
        clothUniforms.uStripeOffset.value = clamp(state.stripeOffset / bodyHeight, -0.35, 0.35);
      }
      if (clothUniforms.uSpecularStrength) {
        clothUniforms.uSpecularStrength.value = clamp(
          0.09 + (1 - state.roughness) * 0.18 + state.clearcoat * 0.1 + state.metalness * 0.08,
          0.03,
          0.5,
        );
      }
      clothMaterial.needsUpdate = true;
    } else {
      clothMaterial.color.set(state.bodyColor);
      clothMaterial.metalness = clamp(state.metalness, 0, 1);
      clothMaterial.roughness = clamp(state.roughness, 0, 1);
      clothMaterial.clearcoat = clamp(state.clearcoat, 0, 1);
      clothMaterial.clearcoatRoughness = clamp(state.clearcoatRoughness, 0, 1);
      clothMaterial.emissive.set(state.glowColor);
      clothMaterial.emissiveIntensity = clamp(state.glowIntensity * 0.2, 0, 1);
      clothMaterial.needsUpdate = true;
    }

    avatar.materials.stripe.color.set(state.stripeColor);
    avatar.materials.stripe.emissive.set(state.glowColor);
    avatar.materials.stripe.emissiveIntensity = clamp(state.glowIntensity * 0.24, 0, 1);
    avatar.materials.stripe.needsUpdate = true;

    avatar.materials.skin.color.set(state.skinColor);
    avatar.materials.skin.needsUpdate = true;

    avatar.materials.hair.color.set(state.hairColor);
    avatar.materials.hair.needsUpdate = true;

    avatar.materials.eyeWhite.color.set(state.eyeColor || "#f5f7ff");
    avatar.materials.eyeWhite.needsUpdate = true;

    avatar.materials.dark.color.set(state.darkColor);
    avatar.materials.dark.needsUpdate = true;

    avatar.materials.shoe.color.set(state.shoeColor);
    avatar.materials.shoe.emissive.set(state.glowColor);
    avatar.materials.shoe.emissiveIntensity = clamp(state.glowIntensity * 0.16, 0, 1);
    avatar.materials.shoe.needsUpdate = true;
  }

  function applyShapeState() {
    const expr = expressionProfile(state.expression);

    avatar.group.scale.setScalar(state.scale);
    avatar.bodyRoot.scale.set(state.bodyWidth, state.bodyHeight, state.bodyDepth);
    avatar.faceRoot.position.set(0, 0.2 + state.faceY, 0.21 + state.faceZ);

    const clothUniforms = avatar.materials.cloth?.uniforms;
    const bodyHeight = Math.max(0.001, avatar.metrics.bodyHeight || avatar.metrics.bodyTopY - avatar.metrics.bodyBottomY);
    if (clothUniforms?.uStripeOffset) {
      clothUniforms.uStripeOffset.value = clamp(state.stripeOffset / bodyHeight, -0.35, 0.35);
    }

    if (avatar.stripes.length >= 4) {
      avatar.stripes[0].position.y = 1.6 + state.stripeOffset;
      avatar.stripes[1].position.y = 1.39 + state.stripeOffset;
      avatar.stripes[2].position.y = -1.92 - state.stripeOffset * 0.45;
      avatar.stripes[3].position.y = -2.15 - state.stripeOffset * 0.45;
    }

    const eyeScale = clamp(state.eyeScale * expr.eyeScale, 0.5, 2.2);
    runtime.eyeScale = eyeScale;
    runtime.eyeBaseY = 0.02 + expr.eyeY;
    runtime.eyeOvalY = clamp(1.05 + eyeScale * 0.24, 0.96, 1.72);
    runtime.pupilBaseScale = clamp(0.84 + eyeScale * 0.11, 0.74, 1.16);

    avatar.leftEyeRoot.position.set(-state.eyeSpacing, runtime.eyeBaseY, 0.22);
    avatar.rightEyeRoot.position.set(state.eyeSpacing, runtime.eyeBaseY, 0.22);

    avatar.leftEye.scale.set(eyeScale, runtime.eyeOvalY, 1);
    avatar.rightEye.scale.set(eyeScale, runtime.eyeOvalY, 1);
    avatar.leftPupil.scale.set(runtime.pupilBaseScale, runtime.pupilBaseScale, 1);
    avatar.rightPupil.scale.set(runtime.pupilBaseScale, runtime.pupilBaseScale, 1);
    avatar.leftPupil.position.set(0, 0, 0.002);
    avatar.rightPupil.position.set(0, 0, 0.002);

    const browY = 0.31 + state.browLift + expr.browLift;
    const browTilt = state.browTilt + expr.browTilt;

    avatar.leftBrow.position.set(-state.eyeSpacing - 0.1, browY, 0.2);
    avatar.rightBrow.position.set(state.eyeSpacing + 0.1, browY, 0.2);
    avatar.leftBrow.rotation.z = -0.12 - browTilt * 0.74;
    avatar.rightBrow.rotation.z = 0.12 + browTilt * 0.74;

    const mouthWidth = clamp(state.mouthWidth * expr.mouthWidth, 0.6, 1.8);
    const mouthOpen = clamp(state.mouthOpen + expr.mouthOpen, 0, 1.3);

    avatar.mouthRoot.position.set(0, -0.18 + expr.mouthY * 0.45, 0.2);
    avatar.mouthRoot.rotation.z = expr.mouthTilt;
    avatar.smile.scale.set(0.88 * mouthWidth, 0.86 + mouthOpen * 0.16, 1);

    const shoulderX = state.bodyWidth * 1.08 + state.armSpread * 0.44;
    avatar.leftArm.shoulder.position.set(-shoulderX, state.armY, 0);
    avatar.rightArm.shoulder.position.set(shoulderX, state.armY, 0);

    runtime.leftShoulderBase = -0.56 - state.armBend * 0.34;
    runtime.rightShoulderBase = 0.56 + state.armBend * 0.34;
    runtime.leftElbowBase = 0.34 + state.armBend * 0.6;
    runtime.rightElbowBase = -0.34 - state.armBend * 0.6;

    avatar.leftArm.shoulder.rotation.z = runtime.leftShoulderBase;
    avatar.rightArm.shoulder.rotation.z = runtime.rightShoulderBase;
    avatar.leftArm.elbow.rotation.z = runtime.leftElbowBase;
    avatar.rightArm.elbow.rotation.z = runtime.rightElbowBase;

    const legHeight = state.legHeight;
    const legCenterY = avatar.metrics.legTopY - legHeight * 0.5;

    avatar.leftLeg.scale.set(1, legHeight, 1);
    avatar.rightLeg.scale.set(1, legHeight, 1);
    avatar.leftLeg.position.set(-state.legSpread, legCenterY, 0.03);
    avatar.rightLeg.position.set(state.legSpread, legCenterY, 0.03);

    const shoeY = avatar.metrics.legTopY - legHeight - 0.17;
    avatar.leftShoe.position.set(-state.legSpread, shoeY, 0.08);
    avatar.rightShoe.position.set(state.legSpread, shoeY, 0.08);

    const shoeBottomY = shoeY - avatar.metrics.shoeRadius * 0.9;
    runtime.baseY = stageTopY - shoeBottomY * state.scale + 0.01;
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
    if (avatar.materials.cloth?.uniforms?.uTime) {
      avatar.materials.cloth.uniforms.uTime.value = runtime.elapsed;
    }

    const t = runtime.elapsed;
    runtime.modeBlend = Math.min(1, runtime.modeBlend + dt / 0.24);

    const easedBlend = runtime.modeBlend * runtime.modeBlend * (3 - 2 * runtime.modeBlend);
    const fromPose = sampleModePose(runtime.previousMode, t);
    const toPose = sampleModePose(runtime.currentMode, t);
    const pose = blendModePose(fromPose, toPose, easedBlend);

    if (runtime.modeBlend >= 1) {
      runtime.previousMode = runtime.currentMode;
    }

    avatar.group.position.x = runtime.baseX + pose.sway;
    avatar.group.position.y = runtime.baseY + pose.hop;
    avatar.group.rotation.y = pose.spinY;

    avatar.bodyShell.rotation.x = pose.bodyTiltX;
    avatar.bodyShell.rotation.z = pose.bodyTiltZ;
    avatar.faceRoot.rotation.x = pose.bodyTiltX * 0.24;
    avatar.faceRoot.rotation.z = pose.bodyTiltZ * 0.34;

    const followSmoothing = Math.min(1, dt * 7.4);
    runtime.leftArmFollow +=
      (pose.leftShoulder * 0.25 + pose.bodyTiltZ * 0.16 - runtime.leftArmFollow) * followSmoothing;
    runtime.rightArmFollow +=
      (pose.rightShoulder * 0.25 + pose.bodyTiltZ * 0.16 - runtime.rightArmFollow) * followSmoothing;

    avatar.leftArm.shoulder.rotation.z = runtime.leftShoulderBase + pose.leftShoulder;
    avatar.rightArm.shoulder.rotation.z = runtime.rightShoulderBase + pose.rightShoulder;
    avatar.leftArm.elbow.rotation.z = runtime.leftElbowBase + pose.leftElbow + runtime.leftArmFollow * 0.18;
    avatar.rightArm.elbow.rotation.z = runtime.rightElbowBase + pose.rightElbow + runtime.rightArmFollow * 0.18;

    const lookSmoothing = Math.min(1, dt * 10);
    runtime.lookX += (runtime.lookTargetX - runtime.lookX) * lookSmoothing;
    runtime.lookY += (runtime.lookTargetY - runtime.lookY) * lookSmoothing;

    const lookX = clamp(runtime.lookX, -0.08, 0.08);
    const lookY = clamp(runtime.lookY, -0.055, 0.055);

    const pupilX = lookX * 0.6;
    const pupilY = lookY * 0.62;

    const blinkInterval = 2.8;
    const blinkDuration = 0.16;
    const blinkPhase = (runtime.blinkTimer + runtime.blinkOffset) % blinkInterval;
    let blink = 0;

    if (blinkPhase > blinkInterval - blinkDuration) {
      const phase = (blinkPhase - (blinkInterval - blinkDuration)) / blinkDuration;
      blink = Math.sin(phase * Math.PI);
    }

    const eyelidScale = clamp(1 - blink * 0.88, 0.12, 1);
    const pupilYScale = clamp(1 - blink * 0.7, 0.25, 1);

    avatar.leftEye.scale.set(runtime.eyeScale, runtime.eyeOvalY * eyelidScale, 1);
    avatar.rightEye.scale.set(runtime.eyeScale, runtime.eyeOvalY * eyelidScale, 1);

    avatar.leftPupil.position.set(pupilX, pupilY - blink * 0.004, 0.002);
    avatar.rightPupil.position.set(pupilX, pupilY - blink * 0.004, 0.002);
    avatar.leftPupil.scale.set(runtime.pupilBaseScale, runtime.pupilBaseScale * pupilYScale, 1);
    avatar.rightPupil.scale.set(runtime.pupilBaseScale, runtime.pupilBaseScale * pupilYScale, 1);
  }

  function setState(nextState = {}, { force = false } = {}) {
    Object.assign(state, nextState);

    state.mode = MODE_CHOICES.includes(state.mode) ? state.mode : MODE_CHOICES[0];
    state.expression = EXPRESSION_CHOICES.includes(state.expression) ? state.expression : EXPRESSION_CHOICES[0];

    if (force) {
      runtime.elapsed = 0;
      runtime.blinkTimer = 0;
    }

    syncModeTransition({ force });
    applyShapeState();
    updateMaterials();
  }

  function update(dt, pointer) {
    const frameDt = Math.min(dt, 0.08) * state.speed;

    if (pointer) {
      runtime.lookTargetX = pointer.x * 0.06;
      runtime.lookTargetY = pointer.y * 0.05;
    }

    applyAnimationFrame(frameDt);
  }

  function dispose() {
    scene.remove(avatar.group);
    avatar.dispose();
  }

  setState(state, { force: true });

  return {
    group: avatar.group,
    setState,
    update,
    dispose,
    getCatalog() {
      return {
        modes: [...MODE_CHOICES],
        expressions: [...EXPRESSION_CHOICES],
        props: [],
      };
    },
  };
}

registerEngine("towely", createTowelyController);
