import { constrainPupilToEyeSurface } from "./utils.js";

const DEFAULTS = {
  scale: 1,
  metalColor: 0xe7edf6,
  darkColor: 0x0f172a,
  wireThickness: 1,
  browThickness: 1,
  eyeScale: 2,
  eyeSpacing: 0.5,
};

const MODE_DEFAULT_EXPRESSIONS = {
  idle: "neutral",
  wave: "happy",
  celebrate: "happy",
  spin: "surprised",
  point: "focused",
};

const GLOBAL_ANIMATIONS = Object.create(null);
const GLOBAL_PROPS = Object.create(null);
const CLIPPY_EYE_RADIUS = 0.22;
const CLIPPY_PUPIL_RADIUS = 0.11;
const CLIPPY_PUPIL_SURFACE_SETTINGS = Object.freeze({
  edgeClamp: 0.64,
  centerProtrusion: 0.1,
  edgeInset: 0.16,
  edgeInsetPower: 2.2,
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function isObject(value) {
  return value && typeof value === "object";
}

function normalizeKey(name, kind) {
  const key = String(name || "").trim();
  if (!key) {
    throw new Error(`Clippy ${kind} name must be a non-empty string.`);
  }
  return key;
}

function normalizeAnimationDefinition(name, definition) {
  const key = normalizeKey(name, "animation");
  const source = typeof definition === "function" ? { apply: definition } : definition;

  if (!isObject(source) || typeof source.apply !== "function") {
    throw new Error(`Animation "${key}" must be a function or { apply() } object.`);
  }

  return {
    name: key,
    apply: source.apply,
    onStart: typeof source.onStart === "function" ? source.onStart : null,
    onStop: typeof source.onStop === "function" ? source.onStop : null,
    defaultExpression: typeof source.defaultExpression === "string" ? source.defaultExpression : null,
  };
}

function normalizePropDefinition(name, definition) {
  const key = normalizeKey(name, "prop");
  const source = typeof definition === "function" ? { create: definition } : definition;

  if (!isObject(source) || typeof source.create !== "function") {
    throw new Error(`Prop "${key}" must be a function or { create() } object.`);
  }

  return {
    name: key,
    create: source.create,
    defaultAnchor: typeof source.defaultAnchor === "string" ? source.defaultAnchor : null,
  };
}

function buildClipCurve(THREE) {
  // This is the classic Clippy 2D body path mapped into world space.
  const scale = 0.075;
  const p = (x, y) => new THREE.Vector3((x - 35) * scale, (68 - y) * scale, 0);

  const path = new THREE.CurvePath();
  path.add(new THREE.CubicBezierCurve3(p(35, 6), p(14, 6), p(10, 20), p(10, 32)));
  path.add(new THREE.LineCurve3(p(10, 32), p(10, 110)));
  path.add(new THREE.CubicBezierCurve3(p(10, 110), p(10, 126), p(22, 130), p(35, 130)));
  path.add(new THREE.CubicBezierCurve3(p(35, 130), p(48, 130), p(60, 126), p(60, 110)));
  path.add(new THREE.LineCurve3(p(60, 110), p(60, 38)));
  path.add(new THREE.CubicBezierCurve3(p(60, 38), p(60, 26), p(52, 22), p(42, 22)));
  path.add(new THREE.CubicBezierCurve3(p(42, 22), p(32, 22), p(26, 28), p(26, 38)));
  path.add(new THREE.LineCurve3(p(26, 38), p(26, 102)));
  path.add(new THREE.CubicBezierCurve3(p(26, 102), p(26, 112), p(32, 116), p(40, 116)));
  path.add(new THREE.CubicBezierCurve3(p(40, 116), p(48, 116), p(52, 110), p(52, 102)));
  path.add(new THREE.LineCurve3(p(52, 102), p(52, 46)));
  return path;
}

function buildBrowCurve(THREE, baseRadius = 0.14, direction = 1) {
  const dir = direction >= 0 ? 1 : -1;
  const innerX = -baseRadius * 1.24 * dir;
  const outerX = baseRadius * 1.34 * dir;

  return new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(innerX, -baseRadius * 0.16, 0),
      new THREE.Vector3(-baseRadius * 0.32 * dir, baseRadius * 0.48, baseRadius * 0.03),
      new THREE.Vector3(baseRadius * 0.62 * dir, baseRadius * 0.42, baseRadius * 0.04),
      new THREE.Vector3(outerX, baseRadius * 0.08, 0),
    ],
    false,
    "centripetal",
    0.48,
  );
}

function createTaperedBrowGeometry(
  THREE,
  {
    baseRadius = 0.14,
    tubeRadius = 0.016,
    direction = 1,
    tubularSegments = 32,
    radialSegments = 12,
  } = {},
) {
  const curve = buildBrowCurve(THREE, baseRadius, direction);
  const geometry = new THREE.TubeGeometry(curve, tubularSegments, tubeRadius, radialSegments, false);
  const positions = geometry.attributes.position;
  const ringSize = radialSegments + 1;
  const center = new THREE.Vector3();
  const vertex = new THREE.Vector3();
  const offset = new THREE.Vector3();

  for (let ringIndex = 0; ringIndex <= tubularSegments; ringIndex += 1) {
    const t = ringIndex / tubularSegments;
    const taper = clamp(1.36 - Math.pow(t, 1.18) * 1.2, 0.14, 1.36);
    curve.getPointAt(t, center);

    for (let radialIndex = 0; radialIndex <= radialSegments; radialIndex += 1) {
      const index = ringIndex * ringSize + radialIndex;
      vertex.fromBufferAttribute(positions, index);
      offset.subVectors(vertex, center).multiplyScalar(taper);
      vertex.copy(center).add(offset);
      positions.setXYZ(index, vertex.x, vertex.y, vertex.z);
    }
  }

  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function createArm(THREE, color) {
  const arm = {
    pivot: new THREE.Group(),
    upper: new THREE.Group(),
    lower: new THREE.Group(),
    hand: null,
  };

  const armMat = new THREE.MeshStandardMaterial({
    color,
    metalness: 0.4,
    roughness: 0.24,
    emissive: 0x1b2432,
    emissiveIntensity: 0.14,
  });

  const upperGeom = new THREE.CylinderGeometry(0.072, 0.072, 1.04, 16);
  const lowerGeom = new THREE.CylinderGeometry(0.062, 0.062, 0.9, 16);
  const jointGeom = new THREE.SphereGeometry(0.09, 16, 12);
  const handGeom = new THREE.SphereGeometry(0.11, 16, 12);

  const upperMesh = new THREE.Mesh(upperGeom, armMat);
  upperMesh.castShadow = true;
  upperMesh.position.y = -0.52;

  const elbow = new THREE.Mesh(jointGeom, armMat);
  elbow.castShadow = true;
  elbow.position.y = -1.03;

  const lowerMesh = new THREE.Mesh(lowerGeom, armMat);
  lowerMesh.castShadow = true;
  lowerMesh.position.y = -0.46;

  const hand = new THREE.Mesh(handGeom, armMat);
  hand.castShadow = true;
  hand.position.y = -0.93;
  arm.hand = hand;

  arm.upper.add(upperMesh);
  arm.upper.add(elbow);
  arm.lower.position.y = -1.03;
  arm.lower.add(lowerMesh);
  arm.lower.add(hand);

  arm.upper.add(arm.lower);
  arm.pivot.add(arm.upper);

  return arm;
}

const BUILTIN_ANIMATIONS = Object.freeze({
  idle: {
    defaultExpression: MODE_DEFAULT_EXPRESSIONS.idle,
    apply({ clippy, modeTime }) {
      const sway = Math.sin(modeTime * 2.7) * 0.06;
      clippy.leftArm.upper.rotation.z = -0.22 + sway;
      clippy.rightArm.upper.rotation.z = 0.22 - sway;
      clippy.leftArm.lower.rotation.z = 0.05 - sway;
      clippy.rightArm.lower.rotation.z = -0.05 + sway;
    },
  },
  wave: {
    defaultExpression: MODE_DEFAULT_EXPRESSIONS.wave,
    apply({ clippy, modeTime }) {
      clippy.rightArm.pivot.rotation.z = -0.15;
      clippy.rightArm.upper.rotation.z = 0.25 + Math.sin(modeTime * 7.2) * 0.14;
      clippy.rightArm.lower.rotation.z = -0.4 + Math.sin(modeTime * 14) * 0.4;
    },
  },
  celebrate: {
    defaultExpression: MODE_DEFAULT_EXPRESSIONS.celebrate,
    apply({ clippy, modeTime }) {
      clippy.leftArm.pivot.rotation.z = 1.0;
      clippy.rightArm.pivot.rotation.z = -1.0;
      clippy.leftArm.upper.rotation.z = -0.05 + Math.sin(modeTime * 9) * 0.15;
      clippy.rightArm.upper.rotation.z = 0.05 - Math.sin(modeTime * 9) * 0.15;
      clippy.leftArm.lower.rotation.z = -0.15;
      clippy.rightArm.lower.rotation.z = 0.15;
      clippy.group.position.y += Math.abs(Math.sin(modeTime * 7.5)) * 0.18;
    },
  },
  spin: {
    defaultExpression: MODE_DEFAULT_EXPRESSIONS.spin,
    apply({ clippy, delta }) {
      clippy.group.rotation.y += delta * 3.4;
      clippy.leftArm.pivot.rotation.z = 0.86;
      clippy.rightArm.pivot.rotation.z = -0.86;
    },
  },
  point: {
    defaultExpression: MODE_DEFAULT_EXPRESSIONS.point,
    apply({ clippy }) {
      clippy.rightArm.pivot.rotation.set(-0.45, -0.65, -0.08);
      clippy.rightArm.upper.rotation.z = 0.03;
      clippy.rightArm.lower.rotation.z = -0.12;
      clippy.leftArm.pivot.rotation.z = 0.62;
      clippy.leftArm.upper.rotation.z = -0.45;
    },
  },
});

class Clippy3D {
  constructor(THREE, options = {}) {
    if (!THREE) {
      throw new Error("createClippy3D requires a THREE namespace argument.");
    }

    this.THREE = THREE;
    this.options = { ...DEFAULTS, ...options };

    this.group = new THREE.Group();
    this.group.name = "clippy3d";

    this.lookTarget = new THREE.Vector3(0, 1.2, 6.5);
    this._tmpLook = new THREE.Vector3();
    this._modeStartContext = null;
    this._modeStopContext = null;

    this.time = 0;
    this.mode = "idle";
    this.modeStartedAt = 0;
    this.expression = "neutral";
    this.blinkTimer = 0.7;
    this.blinkProgress = 0;
    this.baseWireRadius = 0.12;
    this.baseBrowTubeRadius = 0.016;
    this.baseBrowRadius = 0.14;
    this.basePupilY = -0.01;

    this.animationRegistry = Object.create(null);
    this.propRegistry = Object.create(null);
    this.activeProps = new Map();
    this._nextPropId = 1;
    this._pluginCleanups = [];
    this.propAnchors = Object.create(null);

    this._registerBuiltinAnimations();
    this._registerAnimationMap(GLOBAL_ANIMATIONS);
    this._registerAnimationMap(options.animations);
    this._registerPropMap(GLOBAL_PROPS);
    this._registerPropMap(options.props);

    const parsedWireThickness = Number(this.options.wireThickness);
    const parsedBrowThickness = Number(this.options.browThickness);
    const parsedEyeScale = Number(this.options.eyeScale);
    const parsedEyeSpacing = Number(this.options.eyeSpacing);
    this.wireThickness = clamp(Number.isFinite(parsedWireThickness) ? parsedWireThickness : 1, 0.35, 3.2);
    this.browThickness = clamp(Number.isFinite(parsedBrowThickness) ? parsedBrowThickness : 1, 0.35, 3.2);
    this.eyeScale = clamp(Number.isFinite(parsedEyeScale) ? parsedEyeScale : 2, 0.65, 4.5);
    this.eyeSpacing = clamp(Number.isFinite(parsedEyeSpacing) ? parsedEyeSpacing : 0.5, 0.24, 1.25);

    this._buildMesh();
    this.group.scale.setScalar(this.options.scale);

    this.usePlugins(options.plugins);

    if (Array.isArray(options.initialProps)) {
      for (const item of options.initialProps) {
        if (typeof item === "string") {
          this.attachProp(item);
        } else if (isObject(item) && typeof item.name === "string") {
          this.attachProp(item.name, item.options || {});
        }
      }
    }
  }

  _safeInvoke(label, fn, payload) {
    if (typeof fn !== "function") return;
    try {
      fn(payload);
    } catch (err) {
      console.error(`[clippy3d] ${label} failed:`, err);
    }
  }

  _registerBuiltinAnimations() {
    for (const [name, definition] of Object.entries(BUILTIN_ANIMATIONS)) {
      this.animationRegistry[name] = normalizeAnimationDefinition(name, definition);
    }
  }

  _registerAnimationMap(map) {
    if (!isObject(map)) return;
    for (const [name, definition] of Object.entries(map)) {
      this.registerAnimation(name, definition);
    }
  }

  _registerPropMap(map) {
    if (!isObject(map)) return;
    for (const [name, definition] of Object.entries(map)) {
      this.registerProp(name, definition);
    }
  }

  _buildMesh() {
    const THREE = this.THREE;

    const metalMat = new THREE.MeshPhysicalMaterial({
      color: this.options.metalColor,
      metalness: 0.46,
      roughness: 0.18,
      clearcoat: 0.9,
      clearcoatRoughness: 0.14,
      emissive: 0x1f2a38,
      emissiveIntensity: 0.12,
    });

    const darkMat = new THREE.MeshStandardMaterial({
      color: this.options.darkColor,
      metalness: 0.2,
      roughness: 0.65,
    });

    const scleraMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      metalness: 0.1,
      roughness: 0.26,
    });

    this.clipCurve = buildClipCurve(THREE);
    const clipGeom = new THREE.TubeGeometry(this.clipCurve, 560, this.baseWireRadius * this.wireThickness, 26, false);
    this.clipMesh = new THREE.Mesh(clipGeom, metalMat);
    this.clipMesh.castShadow = true;
    this.clipMesh.receiveShadow = true;
    this.group.add(this.clipMesh);

    this.head = new THREE.Group();
    this.head.position.set(-0.28, 1.72, 0.5);
    this.group.add(this.head);

    const eyeGeom = new THREE.SphereGeometry(CLIPPY_EYE_RADIUS, 24, 18);
    const pupilGeom = new THREE.SphereGeometry(CLIPPY_PUPIL_RADIUS, 28, 24);
    const leftBrowGeom = createTaperedBrowGeometry(THREE, {
      baseRadius: this.baseBrowRadius,
      tubeRadius: this.baseBrowTubeRadius * this.browThickness,
      direction: -1,
    });
    const rightBrowGeom = createTaperedBrowGeometry(THREE, {
      baseRadius: this.baseBrowRadius,
      tubeRadius: this.baseBrowTubeRadius * this.browThickness,
      direction: 1,
    });

    this.leftEye = new THREE.Mesh(eyeGeom, scleraMat);
    this.leftEye.position.set(-this.eyeSpacing, 0, 0);
    this.leftEye.scale.setScalar(this.eyeScale);
    this.leftEye.castShadow = true;

    this.rightEye = new THREE.Mesh(eyeGeom, scleraMat);
    this.rightEye.position.set(this.eyeSpacing, 0, 0);
    this.rightEye.scale.setScalar(this.eyeScale);
    this.rightEye.castShadow = true;

    this.leftPupil = new THREE.Mesh(pupilGeom, darkMat);
    this.leftPupil.position.set(-this.eyeSpacing, this.basePupilY, 0);
    this.leftPupil.scale.setScalar(this.eyeScale);

    this.rightPupil = new THREE.Mesh(pupilGeom, darkMat);
    this.rightPupil.position.set(this.eyeSpacing, this.basePupilY, 0);
    this.rightPupil.scale.setScalar(this.eyeScale);

    this._positionPupilOnEye(this.leftEye, this.leftPupil);
    this._positionPupilOnEye(this.rightEye, this.rightPupil);

    this.leftBrow = new THREE.Mesh(leftBrowGeom, darkMat);
    this.leftBrow.position.set(-0.38, 0.29, 0.23);
    this.leftBrow.rotation.set(0.03, 0.0, -0.25);

    this.rightBrow = new THREE.Mesh(rightBrowGeom, darkMat);
    this.rightBrow.position.set(0.38, 0.29, 0.23);
    this.rightBrow.rotation.set(0.03, 0.0, 0.25);

    const mouthGeom = new THREE.TorusGeometry(0.16, 0.028, 10, 28, Math.PI);
    this.mouth = new THREE.Mesh(mouthGeom, darkMat);
    this.mouth.position.set(0, -0.34, 0.16);
    this.mouth.rotation.z = Math.PI;

    this.head.add(this.leftEye);
    this.head.add(this.rightEye);
    this.head.add(this.leftPupil);
    this.head.add(this.rightPupil);
    this.head.add(this.leftBrow);
    this.head.add(this.rightBrow);
    this.head.add(this.mouth);

    this.leftArm = createArm(THREE, this.options.metalColor);
    this.rightArm = createArm(THREE, this.options.metalColor);

    this.leftArm.pivot.position.set(-1.95, -1.12, 0.08);
    this.rightArm.pivot.position.set(1.95, -1.12, 0.08);
    this.leftArm.pivot.rotation.z = 0.58;
    this.rightArm.pivot.rotation.z = -0.58;

    this.leftArm.upper.rotation.z = -0.22;
    this.rightArm.upper.rotation.z = 0.22;

    this.group.add(this.leftArm.pivot);
    this.group.add(this.rightArm.pivot);

    this.shadowPad = new THREE.Mesh(
      new THREE.CircleGeometry(1.7, 36),
      new THREE.MeshBasicMaterial({
        color: 0x0f172a,
        transparent: true,
        opacity: 0.18,
      }),
    );
    this.shadowPad.rotation.x = -Math.PI / 2;
    this.shadowPad.position.y = -2.84;
    this.group.add(this.shadowPad);

    this._refreshPropAnchors();
    this._applyExpression();
  }

  _refreshPropAnchors() {
    this.propAnchors = {
      root: this.group,
      group: this.group,
      head: this.head,
      body: this.group,
      leftArm: this.leftArm?.pivot || null,
      rightArm: this.rightArm?.pivot || null,
      leftHand: this.leftArm?.hand || null,
      rightHand: this.rightArm?.hand || null,
      shadow: this.shadowPad || null,
    };
  }

  _buildAnimationContext(delta) {
    return {
      clippy: this,
      THREE: this.THREE,
      delta,
      time: this.time,
      mode: this.mode,
      modeTime: Math.max(0, this.time - this.modeStartedAt),
      clamp,
    };
  }

  _buildPluginApi() {
    return {
      clippy: this,
      THREE: this.THREE,
      clamp,
      getAnchor: (name) => this.getPropAnchor(name),
      listAnchors: () => this.listPropAnchors(),
      attachProp: (name, options) => this.attachProp(name, options),
      detachProp: (idOrName) => this.detachProp(idOrName),
    };
  }

  registerAnimation(name, definition) {
    const normalized = normalizeAnimationDefinition(name, definition);
    this.animationRegistry[normalized.name] = normalized;
    return normalized;
  }

  unregisterAnimation(name) {
    const key = String(name || "").trim();
    if (!key) return false;
    const existed = Object.prototype.hasOwnProperty.call(this.animationRegistry, key);
    if (existed) delete this.animationRegistry[key];
    return existed;
  }

  listAnimations() {
    return Object.keys(this.animationRegistry).sort();
  }

  getAnimation(name) {
    return this.animationRegistry[String(name || "").trim()] || null;
  }

  play(mode = "idle") {
    const previousMode = this.mode;
    const previousAnimation = this.getAnimation(previousMode);
    this._modeStopContext = this._buildAnimationContext(0);
    this._safeInvoke(`animation "${previousMode}" onStop`, previousAnimation?.onStop, this._modeStopContext);

    this.mode = mode;
    this.modeStartedAt = this.time;

    const animation = this.getAnimation(mode) || this.getAnimation("idle");
    const expression = animation?.defaultExpression || MODE_DEFAULT_EXPRESSIONS[mode] || "neutral";
    this.setExpression(expression);

    this._modeStartContext = this._buildAnimationContext(0);
    this._safeInvoke(`animation "${mode}" onStart`, animation?.onStart, this._modeStartContext);

    for (const [, prop] of this.activeProps) {
      this._safeInvoke(`prop "${prop.name}" onModeChange`, prop.onModeChange, {
        ...this._modeStartContext,
        previousMode,
      });
    }
  }

  setLookTarget(target) {
    if (!target) return;

    if (target.isVector3) {
      this.lookTarget.copy(target);
      return;
    }

    if (typeof target.x === "number" && typeof target.y === "number") {
      this.lookTarget.set(target.x, target.y, typeof target.z === "number" ? target.z : this.lookTarget.z);
    }
  }

  setExpression(expression = "neutral") {
    this.expression = expression;
    this._applyExpression();
  }

  setWireThickness(thickness = 1) {
    const parsed = Number(thickness);
    const next = clamp(Number.isFinite(parsed) ? parsed : 1, 0.35, 3.2);
    if (Math.abs(next - this.wireThickness) < 0.000001) return;
    this.wireThickness = next;
    this.options.wireThickness = next;
    if (!this.clipMesh || !this.clipCurve) return;

    const nextGeom = new this.THREE.TubeGeometry(this.clipCurve, 560, this.baseWireRadius * this.wireThickness, 26, false);
    const prevGeom = this.clipMesh.geometry;
    this.clipMesh.geometry = nextGeom;
    if (prevGeom && typeof prevGeom.dispose === "function") prevGeom.dispose();
  }

  setBrowThickness(thickness = 1) {
    const parsed = Number(thickness);
    const next = clamp(Number.isFinite(parsed) ? parsed : 1, 0.35, 3.2);
    if (Math.abs(next - this.browThickness) < 0.000001) return;
    this.browThickness = next;
    this.options.browThickness = next;
    if (!this.leftBrow || !this.rightBrow) return;

    const nextLeftGeom = createTaperedBrowGeometry(this.THREE, {
      baseRadius: this.baseBrowRadius,
      tubeRadius: this.baseBrowTubeRadius * this.browThickness,
      direction: -1,
    });
    const nextRightGeom = createTaperedBrowGeometry(this.THREE, {
      baseRadius: this.baseBrowRadius,
      tubeRadius: this.baseBrowTubeRadius * this.browThickness,
      direction: 1,
    });

    const prevLeft = this.leftBrow.geometry;
    const prevRight = this.rightBrow.geometry;
    this.leftBrow.geometry = nextLeftGeom;
    this.rightBrow.geometry = nextRightGeom;

    if (prevLeft && typeof prevLeft.dispose === "function") prevLeft.dispose();
    if (prevRight && typeof prevRight.dispose === "function") prevRight.dispose();
  }

  _applyExpression() {
    const expr = this.expression;

    let mouthScaleY = 1;
    let mouthShiftY = -0.34;
    let browTilt = 0.26;
    let browDrop = 0;

    if (expr === "happy") {
      mouthScaleY = 1.28;
      mouthShiftY = -0.3;
      browTilt = 0.18;
      browDrop = 0.03;
    } else if (expr === "focused") {
      mouthScaleY = 0.78;
      mouthShiftY = -0.39;
      browTilt = 0.4;
      browDrop = -0.07;
    } else if (expr === "surprised") {
      mouthScaleY = 0.55;
      mouthShiftY = -0.29;
      browTilt = 0.08;
      browDrop = 0.07;
    }

    this.mouth.scale.y = mouthScaleY;
    this.mouth.position.y = mouthShiftY;
    this.leftBrow.rotation.z = -browTilt;
    this.rightBrow.rotation.z = browTilt;
    this.leftBrow.position.y = 0.29 + browDrop;
    this.rightBrow.position.y = 0.29 + browDrop;
  }

  _positionPupilOnEye(eye, pupil) {
    constrainPupilToEyeSurface(eye, pupil, {
      eyeRadius: CLIPPY_EYE_RADIUS,
      pupilRadius: CLIPPY_PUPIL_RADIUS,
      ...CLIPPY_PUPIL_SURFACE_SETTINGS,
    });
  }

  _applyLook() {
    const localTarget = this.head.worldToLocal(this._tmpLook.copy(this.lookTarget));

    const lookX = clamp(localTarget.x * 0.22, -0.12 * this.eyeScale, 0.12 * this.eyeScale);
    const lookY = clamp(localTarget.y * 0.12, -0.09 * this.eyeScale, 0.09 * this.eyeScale);

    this.leftPupil.position.x = -this.eyeSpacing + lookX;
    this.rightPupil.position.x = this.eyeSpacing + lookX;
    this.leftPupil.position.y = this.basePupilY + lookY;
    this.rightPupil.position.y = this.basePupilY + lookY;

    this._positionPupilOnEye(this.leftEye, this.leftPupil);
    this._positionPupilOnEye(this.rightEye, this.rightPupil);
  }

  _updateBlink(dt) {
    if (this.blinkProgress > 0) {
      this.blinkProgress = Math.max(0, this.blinkProgress - dt / 0.13);
    } else {
      this.blinkTimer -= dt;
      if (this.blinkTimer <= 0) {
        this.blinkProgress = 1;
        this.blinkTimer = 1.6 + Math.random() * 2.8;
      }
    }

    const blink = Math.sin(this.blinkProgress * Math.PI);
    const eyeScaleY = this.eyeScale * (1 - blink * 0.9);
    this.leftEye.scale.y = eyeScaleY;
    this.rightEye.scale.y = eyeScaleY;

    const pupilScaleY = this.eyeScale * (1 - blink * 0.85);
    this.leftPupil.scale.y = pupilScaleY;
    this.rightPupil.scale.y = pupilScaleY;

    this._positionPupilOnEye(this.leftEye, this.leftPupil);
    this._positionPupilOnEye(this.rightEye, this.rightPupil);
  }

  _resetPose() {
    this.leftArm.pivot.rotation.set(0, 0, 0.58);
    this.rightArm.pivot.rotation.set(0, 0, -0.58);
    this.leftArm.upper.rotation.z = -0.22;
    this.rightArm.upper.rotation.z = 0.22;
    this.leftArm.lower.rotation.z = 0.05;
    this.rightArm.lower.rotation.z = -0.05;
  }

  _updateProps(context) {
    for (const [, prop] of this.activeProps) {
      this._safeInvoke(`prop "${prop.name}" update`, prop.update, {
        ...context,
        id: prop.id,
        anchor: prop.anchor,
        object3d: prop.object3d,
      });
    }
  }

  update(dt) {
    const delta = Number.isFinite(dt) ? dt : 1 / 60;

    this.time += delta;
    const t = this.time;

    this.group.position.y = Math.sin(t * 2.2) * 0.085;
    this.group.rotation.z = Math.sin(t * 1.35) * 0.045;
    this.group.rotation.y = Math.sin(t * 0.7) * 0.18;

    this.head.position.y = 1.72 + Math.sin(t * 3.1) * 0.03;
    this.head.rotation.z = Math.sin(t * 1.8) * 0.09;

    this._resetPose();

    const context = this._buildAnimationContext(delta);
    const animation = this.getAnimation(this.mode) || this.getAnimation("idle");
    this._safeInvoke(`animation "${this.mode}" apply`, animation?.apply, context);

    this._applyLook();
    this._updateBlink(delta);
    this._updateProps(context);
  }

  registerProp(name, definition) {
    const normalized = normalizePropDefinition(name, definition);
    this.propRegistry[normalized.name] = normalized;
    return normalized;
  }

  unregisterProp(name) {
    const key = String(name || "").trim();
    if (!key) return false;
    const existed = Object.prototype.hasOwnProperty.call(this.propRegistry, key);
    if (existed) delete this.propRegistry[key];
    return existed;
  }

  listProps() {
    return Object.keys(this.propRegistry).sort();
  }

  getProp(name) {
    return this.propRegistry[String(name || "").trim()] || null;
  }

  listPropAnchors() {
    return Object.keys(this.propAnchors).filter((key) => !!this.propAnchors[key]);
  }

  getPropAnchor(name = "group") {
    return this.propAnchors[String(name || "group")] || null;
  }

  _normalizePropInstance(propResult) {
    if (!propResult) return null;
    if (propResult.isObject3D) {
      return {
        object3d: propResult,
        anchor: null,
        update: null,
        onModeChange: null,
        dispose: null,
      };
    }

    if (!isObject(propResult)) return null;
    const object3d = propResult.object3d || propResult.object || propResult.mesh || null;
    if (!object3d || !object3d.isObject3D) return null;

    return {
      object3d,
      anchor: typeof propResult.anchor === "string" ? propResult.anchor : null,
      update: typeof propResult.update === "function" ? propResult.update : null,
      onModeChange: typeof propResult.onModeChange === "function" ? propResult.onModeChange : null,
      dispose: typeof propResult.dispose === "function" ? propResult.dispose : null,
    };
  }

  attachProp(name, options = {}) {
    const definition = this.getProp(name);
    if (!definition) {
      throw new Error(`Unknown Clippy prop "${name}". Registered props: ${this.listProps().join(", ") || "(none)"}`);
    }

    const created = definition.create({
      ...this._buildPluginApi(),
      options,
      name,
    });
    const normalized = this._normalizePropInstance(created);
    if (!normalized) {
      throw new Error(`Prop "${name}" create() must return a THREE.Object3D or { object3d, ... }.`);
    }

    const anchorName = typeof options.anchor === "string" ? options.anchor : normalized.anchor || definition.defaultAnchor || "group";
    const anchor = this.getPropAnchor(anchorName);
    if (!anchor) {
      throw new Error(`Unknown prop anchor "${anchorName}". Available anchors: ${this.listPropAnchors().join(", ")}`);
    }

    anchor.add(normalized.object3d);

    const id = this._nextPropId++;
    const prop = {
      id,
      name,
      anchor: anchorName,
      object3d: normalized.object3d,
      update: normalized.update,
      onModeChange: normalized.onModeChange,
      dispose: normalized.dispose,
    };
    this.activeProps.set(id, prop);
    return id;
  }

  addProp(name, options = {}) {
    return this.attachProp(name, options);
  }

  _detachPropById(id) {
    const prop = this.activeProps.get(id);
    if (!prop) return false;

    if (prop.object3d?.parent) {
      prop.object3d.parent.remove(prop.object3d);
    }
    this._safeInvoke(`prop "${prop.name}" dispose`, prop.dispose, {
      clippy: this,
      THREE: this.THREE,
      id: prop.id,
      name: prop.name,
      anchor: prop.anchor,
      object3d: prop.object3d,
      clamp,
    });

    this.activeProps.delete(id);
    return true;
  }

  detachProp(idOrName) {
    if (typeof idOrName === "number") {
      return this._detachPropById(idOrName);
    }

    const str = String(idOrName || "").trim();
    if (!str) return false;

    if (/^\d+$/.test(str) && this.activeProps.has(Number(str))) {
      return this._detachPropById(Number(str));
    }

    let removed = false;
    for (const [id, prop] of this.activeProps) {
      if (prop.name !== str) continue;
      removed = this._detachPropById(id) || removed;
    }
    return removed;
  }

  removeProp(idOrName) {
    return this.detachProp(idOrName);
  }

  clearProps() {
    const ids = Array.from(this.activeProps.keys());
    for (const id of ids) {
      this._detachPropById(id);
    }
  }

  listAttachedProps() {
    return Array.from(this.activeProps.values()).map((prop) => ({
      id: prop.id,
      name: prop.name,
      anchor: prop.anchor,
      object3d: prop.object3d,
    }));
  }

  usePlugin(plugin, options = {}) {
    if (!plugin) return null;

    const api = this._buildPluginApi();
    const resolved = typeof plugin === "function" ? plugin(api, options) : plugin;
    if (!isObject(resolved)) return null;

    if (resolved.animations) this._registerAnimationMap(resolved.animations);
    if (resolved.props) this._registerPropMap(resolved.props);

    if (Array.isArray(resolved.defaultProps)) {
      for (const item of resolved.defaultProps) {
        if (typeof item === "string") {
          this.attachProp(item);
        } else if (isObject(item) && typeof item.name === "string") {
          this.attachProp(item.name, item.options || {});
        }
      }
    }

    if (typeof resolved.install === "function") {
      const cleanup = resolved.install(api, options);
      if (typeof cleanup === "function") {
        this._pluginCleanups.push(cleanup);
      }
    }

    return resolved;
  }

  usePlugins(plugins) {
    if (!plugins) return;
    const list = Array.isArray(plugins) ? plugins : [plugins];
    for (const plugin of list) {
      this.usePlugin(plugin);
    }
  }

  dispose() {
    this.clearProps();

    for (const cleanup of this._pluginCleanups.splice(0)) {
      this._safeInvoke("plugin cleanup", cleanup, this._buildPluginApi());
    }

    this.group.traverse((node) => {
      if (node.geometry && typeof node.geometry.dispose === "function") {
        node.geometry.dispose();
      }

      if (node.material) {
        if (Array.isArray(node.material)) {
          for (const mat of node.material) {
            if (mat && typeof mat.dispose === "function") mat.dispose();
          }
        } else if (typeof node.material.dispose === "function") {
          node.material.dispose();
        }
      }
    });
  }
}

export function registerClippyAnimation(name, definition) {
  const normalized = normalizeAnimationDefinition(name, definition);
  GLOBAL_ANIMATIONS[normalized.name] = normalized;
  return normalized;
}

export function unregisterClippyAnimation(name) {
  const key = String(name || "").trim();
  if (!key) return false;
  const existed = Object.prototype.hasOwnProperty.call(GLOBAL_ANIMATIONS, key);
  if (existed) delete GLOBAL_ANIMATIONS[key];
  return existed;
}

export function registerClippyProp(name, definition) {
  const normalized = normalizePropDefinition(name, definition);
  GLOBAL_PROPS[normalized.name] = normalized;
  return normalized;
}

export function unregisterClippyProp(name) {
  const key = String(name || "").trim();
  if (!key) return false;
  const existed = Object.prototype.hasOwnProperty.call(GLOBAL_PROPS, key);
  if (existed) delete GLOBAL_PROPS[key];
  return existed;
}

export function createClippyPlugin(plugin) {
  return plugin || {};
}

export function createClippy3D(THREE, options = {}) {
  return new Clippy3D(THREE, options);
}

export { Clippy3D };
