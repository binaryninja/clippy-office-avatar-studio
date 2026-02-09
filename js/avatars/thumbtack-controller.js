import { createThumbTackAvatar, expressionProfile } from "../lib/thumbtack-factory.js";
import { clamp } from "../lib/utils.js";

const MODE_CHOICES = ["idle", "bob", "wave", "spin", "celebrate"];
const EXPRESSION_CHOICES = ["neutral", "smile", "determined", "startled"];

export function createThumbtackController({ THREE, scene, initialState, profile, stageTopY }) {
  const state = { ...initialState };
  const avatar = createThumbTackAvatar(THREE, state, profile);
  scene.add(avatar.group);

  const geometryCache = {
    shapeKey: "",
    mouthKey: "",
  };

  const runtime = {
    elapsed: 0,
    lookX: 0,
    lookY: 0,
    lookTargetX: 0,
    lookTargetY: 0,
    baseX: 0,
    baseY: 0,
    expression: expressionProfile(state.expression),
  };

  function updateMaterials() {
    avatar.materials.cap.color.set(state.faceColor);
    avatar.materials.cap.emissive.set(state.glowColor);
    avatar.materials.cap.emissiveIntensity = state.glowIntensity * 0.18;
    avatar.materials.cap.needsUpdate = true;

    avatar.materials.metal.color.set(state.metalColor);
    avatar.materials.metal.metalness = state.metalness;
    avatar.materials.metal.roughness = state.roughness;
    avatar.materials.metal.clearcoat = state.clearcoat;
    avatar.materials.metal.clearcoatRoughness = state.clearcoatRoughness;
    avatar.materials.metal.emissive.set(state.glowColor);
    avatar.materials.metal.emissiveIntensity = state.glowIntensity * 0.25;
    avatar.materials.metal.needsUpdate = true;

    avatar.materials.dark.color.set(state.darkColor);
    avatar.materials.dark.needsUpdate = true;

    avatar.materials.eye.color.set(state.eyeColor);
    avatar.materials.eye.needsUpdate = true;

    avatar.materials.glow.color.set(state.glowColor);
    avatar.materials.glow.opacity = clamp(0.08 + state.glowIntensity * 0.8, 0, 1);
    avatar.materials.glow.needsUpdate = true;
  }

  function applyShapeState(force = false) {
    runtime.expression = expressionProfile(state.expression);
    const expr = runtime.expression;

    const shapeKey = [
      state.crownWidth,
      state.legHeight,
      state.legSplay,
      state.depthCurve,
      state.wireThickness,
    ]
      .map((value) => Number(value).toFixed(4))
      .join("|");

    if (force || geometryCache.shapeKey !== shapeKey) {
      avatar.rebuildGeometry(state);
      geometryCache.shapeKey = shapeKey;
    }

    const mouthWidth = clamp(state.mouthWidth * expr.mouthWidth, 0.45, 2.25);
    const mouthCurve = clamp(state.mouthCurve + expr.mouthCurve, -0.92, 0.92);
    const mouthKey = `${mouthWidth.toFixed(4)}|${mouthCurve.toFixed(4)}`;

    if (force || geometryCache.mouthKey !== mouthKey) {
      avatar.rebuildMouthGeometry(mouthWidth, mouthCurve);
      geometryCache.mouthKey = mouthKey;
    }

    const metrics = avatar.metrics;
    avatar.group.scale.setScalar(state.scale);

    runtime.baseX = -Math.sin(state.legSplay) * (metrics.pinLength * 0.52);
    runtime.baseY = stageTopY + metrics.groundOffset + 0.006;

    avatar.pinRig.rotation.z = state.legSplay;
    avatar.faceRoot.position.set(0, metrics.faceCenterY + state.faceY, metrics.faceCenterZ + state.faceZ);

    const eyeScale = state.eyeScale * expr.eyeScale;
    avatar.leftEye.scale.set(eyeScale, eyeScale, eyeScale * 0.62);
    avatar.rightEye.scale.set(eyeScale, eyeScale, eyeScale * 0.62);
    avatar.leftEye.position.set(-state.eyeSpacing, 0.04, 0.04);
    avatar.rightEye.position.set(state.eyeSpacing, 0.04, 0.04);

    const pupilScale = state.pupilScale;
    avatar.leftPupil.scale.set(pupilScale, pupilScale, pupilScale * 0.52);
    avatar.rightPupil.scale.set(pupilScale, pupilScale, pupilScale * 0.52);
    avatar.leftPupil.position.z = 0.078;
    avatar.rightPupil.position.z = 0.078;

    const browTilt = state.browTilt + expr.browTilt;
    const browY = 0.2 + state.browLift + expr.browLift;
    avatar.leftBrow.position.set(-state.eyeSpacing, browY, 0.058);
    avatar.rightBrow.position.set(state.eyeSpacing, browY, 0.058);
    avatar.leftBrow.rotation.z = Math.PI / 2 - browTilt;
    avatar.rightBrow.rotation.z = Math.PI / 2 + browTilt;

    avatar.mouth.position.set(0, -0.11 + expr.mouthY, 0.062);
  }

  function applyAnimationFrame(dt) {
    runtime.elapsed += dt;
    const t = runtime.elapsed;

    let hop = Math.abs(Math.sin(t * 2.2)) * 0.09;
    let swayX = Math.sin(t * 1.5) * 0.03;
    let wobbleY = Math.sin(t * 1.3) * 0.03;
    let bodyTiltX = Math.sin(t * 1.9) * 0.03;
    let bodyTiltZ = Math.sin(t * 1.8) * 0.04;
    let spinY = wobbleY;
    let pinSpring = Math.sin(t * 4.2) * 0.012;

    if (state.mode === "bob") {
      hop = Math.abs(Math.sin(t * 4.1)) * 0.2;
      swayX = Math.sin(t * 3.3) * 0.08;
      bodyTiltX = Math.sin(t * 4.2) * 0.09;
      bodyTiltZ = Math.sin(t * 4.6) * 0.1;
      pinSpring = Math.sin(t * 8.4) * 0.03;
    } else if (state.mode === "wave") {
      hop = Math.abs(Math.sin(t * 3.2 + 0.4)) * 0.12;
      swayX = Math.sin(t * 2.2) * 0.06;
      bodyTiltX = Math.sin(t * 5.2) * 0.05;
      bodyTiltZ = Math.sin(t * 7.8) * 0.22;
      pinSpring = Math.sin(t * 9.4) * 0.02;
    } else if (state.mode === "spin") {
      hop = Math.abs(Math.sin(t * 3.1)) * 0.08;
      swayX = Math.sin(t * 2.8) * 0.02;
      bodyTiltX = Math.sin(t * 4.8) * 0.06;
      bodyTiltZ = Math.sin(t * 5.6) * 0.1;
      spinY = t * 2.2;
      pinSpring = Math.sin(t * 10.8) * 0.02;
    } else if (state.mode === "celebrate") {
      hop = Math.abs(Math.sin(t * 6.1)) * 0.28;
      swayX = Math.sin(t * 8) * 0.12;
      bodyTiltX = Math.sin(t * 7.2) * 0.13;
      bodyTiltZ = Math.sin(t * 12.1) * 0.18;
      spinY = Math.sin(t * 9.3) * 0.22;
      pinSpring = Math.sin(t * 14.2) * 0.04;
    }

    avatar.group.position.x = runtime.baseX + swayX;
    avatar.group.position.y = runtime.baseY + hop;
    avatar.group.rotation.y = spinY;
    avatar.body.rotation.x = bodyTiltX;
    avatar.body.rotation.z = bodyTiltZ + state.legSplay * 0.35;
    avatar.pinRig.rotation.z = state.legSplay + pinSpring;

    const lookSmoothing = Math.min(1, dt * 10);
    runtime.lookX += (runtime.lookTargetX - runtime.lookX) * lookSmoothing;
    runtime.lookY += (runtime.lookTargetY - runtime.lookY) * lookSmoothing;
    const lookX = clamp(runtime.lookX, -0.07, 0.07);
    const lookY = clamp(runtime.lookY, -0.06, 0.06) + runtime.expression.pupilY;

    avatar.leftPupil.position.x = -state.eyeSpacing + lookX;
    avatar.rightPupil.position.x = state.eyeSpacing + lookX;
    avatar.leftPupil.position.y = lookY;
    avatar.rightPupil.position.y = lookY;
  }

  function setState(nextState = {}, { force = false } = {}) {
    Object.assign(state, nextState);

    state.mode = MODE_CHOICES.includes(state.mode) ? state.mode : MODE_CHOICES[0];
    state.expression = EXPRESSION_CHOICES.includes(state.expression) ? state.expression : EXPRESSION_CHOICES[0];

    applyShapeState(force);
    updateMaterials();
  }

  function update(dt, pointer) {
    const frameDt = Math.min(dt, 0.08) * state.speed;

    if (pointer) {
      runtime.lookTargetX = pointer.x * 0.06;
      runtime.lookTargetY = pointer.y * 0.055;
    }

    applyAnimationFrame(frameDt);
  }

  function dispose() {
    scene.remove(avatar.group);
    avatar.dispose();
  }

  setState(state, { force: true });

  return {
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
