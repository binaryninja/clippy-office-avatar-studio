import { officePackPlugin } from "../lib/clippy-3d-plugin-examples.js";
import { createClippy3D } from "../lib/clippy-3d.js";
import { clamp, constrainPupilToEyeSurface } from "../lib/utils.js";
import { registerEngine } from "../engines.js";
import { createPropManager, listSharedProps, getSharedProp, loadPropPlacement, savePropPlacement, applyPlacementToObject } from "../lib/prop-system.js";
import { createUniversalMouth, VISEME_POSES } from "../lib/mouth-rig.js";
import "../lib/shared-props.js";
import { NO_PROP_VALUE } from "../config/avatars.js";

const FALLBACK_MODES = ["idle", "wave", "celebrate", "spin", "point"];
const EXPRESSION_CHOICES = ["neutral", "happy", "focused", "surprised"];
const SIL_VISEME = "sil";
const LIP_COLOR = 0xb53b4e;

const CLIPPY_EYE_RADIUS = 0.22;
const CLIPPY_PUPIL_RADIUS = 0.11;
const CLIPPY_PUPIL_SURFACE_SETTINGS = Object.freeze({
  edgeClamp: 0.64,
  centerProtrusion: 0.1,
  edgeInset: 0.16,
  edgeInsetPower: 2.2,
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

export function createClippyController({ THREE, scene, initialState, avatarId }) {
  const state = { ...initialState };
  const plugins = [officePackPlugin].filter(Boolean);

  const clippy = createClippy3D(THREE, {
    scale: state.scale,
    wireThickness: state.wireThickness,
    browThickness: state.browThickness,
    plugins,
  });
  scene.add(clippy.group);

  // Create universal mouth rig and attach to head
  const cavityColorBase = new THREE.Color(state.darkColor).multiplyScalar(0.4).getHex();
  const shadowColorBase = new THREE.Color(state.darkColor).multiplyScalar(0.26).getHex();

  const mouthRig = createUniversalMouth({
    THREE,
    anchor: clippy.head,
    options: {
      lipColor: LIP_COLOR,
      cavityColor: cavityColorBase,
      tongueColor: 0x7d3445,
      shadowColor: shadowColorBase,
      shadowOpacity: 0.6,
    },
  });

  if (mouthRig?.group) {
    // Hide the original mouth mesh from clippy-3d — the rig replaces it
    if (clippy.mouth) clippy.mouth.visible = false;
    // Add the rig group into the head so it moves with the avatar
    clippy.head.add(mouthRig.group);
  }

  const availableModes = typeof clippy.listAnimations === "function" ? clippy.listAnimations() : FALLBACK_MODES;
  const internalProps = typeof clippy.listProps === "function" ? clippy.listProps() : [];
  const sharedPropNames = listSharedProps();
  const allPropNames = [...new Set([...internalProps, ...sharedPropNames])];

  const propManager = createPropManager();

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
    browSpacing: Math.abs(clippy.leftBrow.position.x),
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
    isShared: false,
  };

  const voiceRuntime = {
    target: 0,
    visemeKey: SIL_VISEME,
    visemeStrengthTarget: 0,
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

    if (mouthRig?.materials) {
      setMaterialColor(mouthRig.materials.lipMaterial, LIP_COLOR);
      const cavityColor = new THREE.Color(state.darkColor).multiplyScalar(0.4);
      setMaterialColor(mouthRig.materials.cavityMaterial, cavityColor);
      setMaterialColor(mouthRig.materials.shadowMaterial, new THREE.Color(state.darkColor).multiplyScalar(0.26));
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

    constrainPupilToEyeSurface(clippy.leftEye, clippy.leftPupil, {
      eyeRadius: CLIPPY_EYE_RADIUS,
      pupilRadius: CLIPPY_PUPIL_RADIUS,
      ...CLIPPY_PUPIL_SURFACE_SETTINGS,
    });
    constrainPupilToEyeSurface(clippy.rightEye, clippy.rightPupil, {
      eyeRadius: CLIPPY_EYE_RADIUS,
      pupilRadius: CLIPPY_PUPIL_RADIUS,
      ...CLIPPY_PUPIL_SURFACE_SETTINGS,
    });

    const browSpacing = clamp(
      Number.isFinite(state.browSpacing) ? Math.abs(state.browSpacing) : base.browSpacing,
      0.18,
      0.78,
    );
    clippy.leftBrow.position.x = -browSpacing;
    clippy.rightBrow.position.x = browSpacing;
    clippy.leftBrow.position.y = 0.29 + expr.browDrop + state.browLift;
    clippy.rightBrow.position.y = 0.29 + expr.browDrop + state.browLift;
    clippy.leftBrow.rotation.z = -expr.browTilt - state.browTilt;
    clippy.rightBrow.rotation.z = expr.browTilt + state.browTilt;
    clippy.leftBrow.scale.setScalar(state.browScale);
    clippy.rightBrow.scale.setScalar(state.browScale);

    clippy.leftArm.pivot.position.x = -state.armSpread;
    clippy.rightArm.pivot.position.x = state.armSpread;
    clippy.leftArm.pivot.position.y = state.armY;
    clippy.rightArm.pivot.position.y = state.armY;

    // Apply mouth rig placement
    applyMouthPlacement();
  }

  function loadMouthPlacement() {
    const storageKey = `mouth-placement:${avatarId}`;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        state.mouthRigX = parsed.x ?? state.mouthRigX;
        state.mouthRigY = parsed.y ?? state.mouthRigY;
        state.mouthRigZ = parsed.z ?? state.mouthRigZ;
        state.mouthRigScale = parsed.scale ?? state.mouthRigScale;
        state.mouthRigRotX = parsed.rotX ?? state.mouthRigRotX;
        state.mouthRigRotY = parsed.rotY ?? state.mouthRigRotY;
        state.mouthRigRotZ = parsed.rotZ ?? state.mouthRigRotZ;
      }
    } catch { /* ignore */ }
  }

  function saveMouthPlacement() {
    const storageKey = `mouth-placement:${avatarId}`;
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        x: state.mouthRigX,
        y: state.mouthRigY,
        z: state.mouthRigZ,
        scale: state.mouthRigScale,
        rotX: state.mouthRigRotX,
        rotY: state.mouthRigRotY,
        rotZ: state.mouthRigRotZ,
      }));
    } catch { /* ignore */ }
  }

  function applyMouthPlacement() {
    if (!mouthRig?.group) return;
    mouthRig.group.position.set(state.mouthRigX, state.mouthRigY, state.mouthRigZ);
    mouthRig.group.scale.setScalar(state.mouthRigScale);
    mouthRig.group.rotation.set(state.mouthRigRotX, state.mouthRigRotY, state.mouthRigRotZ);
  }

  function applyVoiceFrame(dt) {
    if (!mouthRig) return;

    // Delegate voice animation to the universal mouth rig
    mouthRig.applyVoiceFrame(dt, {
      viseme: voiceRuntime.visemeKey,
      visemeStrength: voiceRuntime.visemeStrengthTarget,
      voiceActivity: voiceRuntime.target,
    });
  }

  function applyPropPlacement() {
    if (!propRuntime.isShared || propRuntime.id === null) return;
    const obj = propManager.getObject(propRuntime.id);
    if (!obj) return;
    applyPlacementToObject(obj, {
      x: state.propX, y: state.propY, z: state.propZ,
      scale: state.propScale,
      rotX: state.propRotX, rotY: state.propRotY, rotZ: state.propRotZ,
    });
  }

  function applyPropState(force = false) {
    const desired = state.propName || NO_PROP_VALUE;
    if (!force && desired === propRuntime.name) return;

    // Detach previous prop (internal or shared)
    if (propRuntime.id !== null) {
      if (propRuntime.isShared) {
        propManager.detach(propRuntime.id);
      } else if (typeof clippy.detachProp === "function") {
        clippy.detachProp(propRuntime.id);
      }
    }

    propRuntime.id = null;
    propRuntime.name = NO_PROP_VALUE;
    propRuntime.isShared = false;

    if (desired === NO_PROP_VALUE) return;

    // Try shared prop first, then internal
    const sharedDef = getSharedProp(desired);
    if (sharedDef) {
      const anchors = { head: clippy.head, body: clippy.group };
      const anchor = anchors[sharedDef.defaultAnchor];
      const id = propManager.attach({ name: desired, anchorName: sharedDef.defaultAnchor, anchor, propDefinition: sharedDef, THREE });
      if (id !== null) {
        propRuntime.id = id;
        propRuntime.name = desired;
        propRuntime.isShared = true;

        const placement = loadPropPlacement(desired, avatarId, sharedDef);
        state.propX = placement.x;
        state.propY = placement.y;
        state.propZ = placement.z;
        state.propScale = placement.scale;
        state.propRotX = placement.rotX;
        state.propRotY = placement.rotY;
        state.propRotZ = placement.rotZ;

        applyPropPlacement();
      }
      return;
    }

    // Fall back to internal Clippy prop system
    if (!internalProps.includes(desired) || typeof clippy.attachProp !== "function") return;
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
    applyPropPlacement();
    if (propRuntime.isShared && propRuntime.name !== NO_PROP_VALUE) {
      savePropPlacement(propRuntime.name, avatarId, {
        x: state.propX, y: state.propY, z: state.propZ,
        scale: state.propScale,
        rotX: state.propRotX, rotY: state.propRotY, rotZ: state.propRotZ,
      });
    }
    saveMouthPlacement();
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
    propManager.detachAll();
    if (propRuntime.id !== null && !propRuntime.isShared && typeof clippy.detachProp === "function") {
      clippy.detachProp(propRuntime.id);
    }
    scene.remove(clippy.group);
    if (typeof clippy.dispose === "function") {
      clippy.dispose();
    }
  }

  // Load saved mouth placement from localStorage
  loadMouthPlacement();

  setState(state, { force: true });

  return {
    group: clippy.group,
    setState,
    update,
    setVoiceActivity,
    setVoiceViseme,
    dispose,
    getAnchors() {
      return {
        head: clippy.head,
        body: clippy.group,
        leftArm: clippy.leftArm?.pivot || clippy.leftArm?.upper,
        rightArm: clippy.rightArm?.pivot || clippy.rightArm?.upper,
      };
    },
    getCatalog() {
      return {
        modes: availableModes,
        expressions: [...EXPRESSION_CHOICES],
        props: [NO_PROP_VALUE, ...allPropNames],
      };
    },
  };
}

registerEngine("clippy", createClippyController);
