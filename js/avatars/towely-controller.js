import { createTowelyAvatar } from "../lib/towely-factory.js";
import { clamp } from "../lib/utils.js";

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
    leftShoulderBase: -0.62,
    rightShoulderBase: 0.62,
    leftElbowBase: 0.45,
    rightElbowBase: -0.45,
    baseX: 0,
    baseY: stageTopY,
  };

  function updateMaterials() {
    avatar.materials.cloth.color.set(state.bodyColor);
    avatar.materials.cloth.metalness = clamp(state.metalness, 0, 1);
    avatar.materials.cloth.roughness = clamp(state.roughness, 0, 1);
    avatar.materials.cloth.clearcoat = clamp(state.clearcoat, 0, 1);
    avatar.materials.cloth.clearcoatRoughness = clamp(state.clearcoatRoughness, 0, 1);
    avatar.materials.cloth.emissive.set(state.glowColor);
    avatar.materials.cloth.emissiveIntensity = clamp(state.glowIntensity * 0.22, 0, 1);
    avatar.materials.cloth.needsUpdate = true;

    avatar.materials.fold.color.set(state.foldColor);
    avatar.materials.fold.metalness = clamp(state.metalness * 0.42, 0, 1);
    avatar.materials.fold.roughness = clamp(state.roughness * 0.84, 0, 1);
    avatar.materials.fold.clearcoat = clamp(state.clearcoat, 0, 1);
    avatar.materials.fold.clearcoatRoughness = clamp(state.clearcoatRoughness * 0.88, 0, 1);
    avatar.materials.fold.emissive.set(state.glowColor);
    avatar.materials.fold.emissiveIntensity = clamp(state.glowIntensity * 0.12, 0, 1);
    avatar.materials.fold.needsUpdate = true;

    avatar.materials.stripe.color.set(state.stripeColor);
    avatar.materials.stripe.emissive.set(state.glowColor);
    avatar.materials.stripe.emissiveIntensity = clamp(state.glowIntensity * 0.32, 0, 1);
    avatar.materials.stripe.needsUpdate = true;

    avatar.materials.skin.color.set(state.skinColor);
    avatar.materials.skin.needsUpdate = true;

    avatar.materials.hair.color.set(state.hairColor);
    avatar.materials.hair.needsUpdate = true;

    avatar.materials.dark.color.set(state.darkColor);
    avatar.materials.dark.needsUpdate = true;

    avatar.materials.shoe.color.set(state.shoeColor);
    avatar.materials.shoe.emissive.set(state.glowColor);
    avatar.materials.shoe.emissiveIntensity = clamp(state.glowIntensity * 0.18, 0, 1);
    avatar.materials.shoe.needsUpdate = true;
  }

  function applyShapeState() {
    const expr = expressionProfile(state.expression);

    avatar.group.scale.setScalar(state.scale);
    avatar.bodyRoot.scale.set(state.bodyWidth, state.bodyHeight, state.bodyDepth);
    avatar.faceRoot.position.set(0, 0.32 + state.faceY, 0.26 + state.faceZ);
    avatar.foldMesh.position.y = state.foldHeight;

    avatar.stripes[0].position.y = 1.6 + state.stripeOffset;
    avatar.stripes[1].position.y = 1.39 + state.stripeOffset;
    avatar.stripes[2].position.y = -1.92 - state.stripeOffset * 0.45;
    avatar.stripes[3].position.y = -2.15 - state.stripeOffset * 0.45;

    const eyeScale = clamp(state.eyeScale * expr.eyeScale, 0.5, 2.2);
    runtime.eyeBaseY = 0.02 + expr.eyeY;

    avatar.leftEye.scale.setScalar(eyeScale);
    avatar.rightEye.scale.setScalar(eyeScale);
    avatar.leftEye.position.set(-state.eyeSpacing, runtime.eyeBaseY, 0.22);
    avatar.rightEye.position.set(state.eyeSpacing, runtime.eyeBaseY, 0.22);

    const browY = 0.48 + state.browLift + expr.browLift;
    const browTilt = state.browTilt + expr.browTilt;

    avatar.leftBrow.position.set(-state.eyeSpacing - 0.14, browY, 0.2);
    avatar.rightBrow.position.set(state.eyeSpacing + 0.14, browY, 0.2);
    avatar.leftBrow.rotation.z = -0.2 - browTilt;
    avatar.rightBrow.rotation.z = 0.2 + browTilt;

    const mouthWidth = clamp(state.mouthWidth * expr.mouthWidth, 0.6, 1.8);
    const mouthOpen = clamp(state.mouthOpen + expr.mouthOpen, 0, 1.3);

    avatar.mouthRoot.position.set(0, -0.36 + expr.mouthY, 0.2);
    avatar.mouthRoot.rotation.z = expr.mouthTilt;

    avatar.mouthShell.scale.set(mouthWidth, 0.92 + mouthOpen * 0.24, 1);

    const biteShift = 0.01 + mouthOpen * 0.07;
    avatar.leftTooth.position.set(-0.11 * mouthWidth, 0.03 + biteShift, 0.15);
    avatar.rightTooth.position.set(0.03 * mouthWidth, 0.03 + biteShift, 0.15);
    avatar.tongue.position.set(0.08 * mouthWidth, -0.08 + mouthOpen * 0.05, 0.14);
    avatar.tongue.scale.set(1, 1 + mouthOpen * 0.45, 1);

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

  function applyAnimationFrame(dt) {
    runtime.elapsed += dt;
    const t = runtime.elapsed;

    let hop = Math.abs(Math.sin(t * 2.1)) * 0.04;
    let sway = Math.sin(t * 1.3) * 0.03;
    let bodyTiltX = Math.sin(t * 1.7) * 0.02;
    let bodyTiltZ = Math.sin(t * 1.9) * 0.03;
    let spinY = Math.sin(t * 0.9) * 0.02;

    let leftShoulderAnim = 0;
    let rightShoulderAnim = 0;
    let leftElbowAnim = 0;
    let rightElbowAnim = 0;

    if (state.mode === "bob") {
      hop = Math.abs(Math.sin(t * 4)) * 0.16;
      sway = Math.sin(t * 3.2) * 0.08;
      bodyTiltX = Math.sin(t * 4.3) * 0.08;
      bodyTiltZ = Math.sin(t * 4.9) * 0.09;
      leftShoulderAnim = -0.18;
      rightShoulderAnim = 0.18;
      leftElbowAnim = -0.12;
      rightElbowAnim = 0.12;
    } else if (state.mode === "wave") {
      hop = Math.abs(Math.sin(t * 3.1)) * 0.1;
      sway = Math.sin(t * 2.1) * 0.05;
      bodyTiltX = Math.sin(t * 3.8) * 0.04;
      bodyTiltZ = Math.sin(t * 2.8) * 0.06;
      leftShoulderAnim = -0.12;
      leftElbowAnim = -0.1;
      rightShoulderAnim = -1.02 + Math.sin(t * 8.3) * 0.22;
      rightElbowAnim = -0.84 + Math.sin(t * 8.3 + 0.8) * 0.36;
    } else if (state.mode === "spin") {
      hop = Math.abs(Math.sin(t * 3.1)) * 0.08;
      sway = Math.sin(t * 2.4) * 0.02;
      bodyTiltX = Math.sin(t * 5.1) * 0.04;
      bodyTiltZ = Math.sin(t * 5.6) * 0.07;
      spinY = t * 2.25;
      leftShoulderAnim = -0.24;
      rightShoulderAnim = 0.24;
    } else if (state.mode === "celebrate") {
      hop = Math.abs(Math.sin(t * 6)) * 0.24;
      sway = Math.sin(t * 7.2) * 0.13;
      bodyTiltX = Math.sin(t * 7.4) * 0.1;
      bodyTiltZ = Math.sin(t * 12.4) * 0.14;
      spinY = Math.sin(t * 9.2) * 0.24;
      leftShoulderAnim = -0.94 + Math.sin(t * 12) * 0.3;
      rightShoulderAnim = 0.94 - Math.sin(t * 12) * 0.3;
      leftElbowAnim = -0.5 + Math.sin(t * 13.4) * 0.28;
      rightElbowAnim = 0.5 - Math.sin(t * 13.4) * 0.28;
    }

    avatar.group.position.x = runtime.baseX + sway;
    avatar.group.position.y = runtime.baseY + hop;
    avatar.group.rotation.y = spinY;

    avatar.bodyShell.rotation.x = bodyTiltX;
    avatar.bodyShell.rotation.z = bodyTiltZ;
    avatar.faceRoot.rotation.x = bodyTiltX * 0.24;
    avatar.faceRoot.rotation.z = bodyTiltZ * 0.34;

    avatar.leftArm.shoulder.rotation.z = runtime.leftShoulderBase + leftShoulderAnim;
    avatar.rightArm.shoulder.rotation.z = runtime.rightShoulderBase + rightShoulderAnim;
    avatar.leftArm.elbow.rotation.z = runtime.leftElbowBase + leftElbowAnim;
    avatar.rightArm.elbow.rotation.z = runtime.rightElbowBase + rightElbowAnim;

    const lookSmoothing = Math.min(1, dt * 10);
    runtime.lookX += (runtime.lookTargetX - runtime.lookX) * lookSmoothing;
    runtime.lookY += (runtime.lookTargetY - runtime.lookY) * lookSmoothing;

    const lookX = clamp(runtime.lookX, -0.08, 0.08);
    const lookY = clamp(runtime.lookY, -0.055, 0.055);

    avatar.leftEye.position.x = -state.eyeSpacing + lookX;
    avatar.rightEye.position.x = state.eyeSpacing + lookX;
    avatar.leftEye.position.y = runtime.eyeBaseY + lookY;
    avatar.rightEye.position.y = runtime.eyeBaseY + lookY;
  }

  function setState(nextState = {}, { force = false } = {}) {
    Object.assign(state, nextState);

    state.mode = MODE_CHOICES.includes(state.mode) ? state.mode : MODE_CHOICES[0];
    state.expression = EXPRESSION_CHOICES.includes(state.expression) ? state.expression : EXPRESSION_CHOICES[0];

    if (force) {
      runtime.elapsed = 0;
    }

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
