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

function createSparkTexture(THREE) {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;

  const ctx = canvas.getContext("2d");
  if (ctx) {
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.1, "rgba(255,240,200,0.9)");
    gradient.addColorStop(0.35, "rgba(255,180,80,0.6)");
    gradient.addColorStop(0.65, "rgba(255,100,20,0.2)");
    gradient.addColorStop(1, "rgba(255,50,0,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function createWireSparkRuntime({
  THREE,
  parent,
  texture,
  sparkColor = 0xffaa44,
  sparkCount = 96,
}) {
  const positions = new Float32Array(sparkCount * 3);
  const colors = new Float32Array(sparkCount * 3);
  const lifetimes = new Float32Array(sparkCount);
  const maxLifetimes = new Float32Array(sparkCount);
  const velocities = Array.from({ length: sparkCount }, () => new THREE.Vector3());

  for (let i = 0; i < sparkCount; i += 1) {
    const pi = i * 3;
    positions[pi] = 0;
    positions[pi + 1] = -999;
    positions[pi + 2] = 0;
    colors[pi] = 1;
    colors[pi + 1] = 0.75;
    colors[pi + 2] = 0.25;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 0.06,
    map: texture,
    transparent: true,
    opacity: 1,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    sizeAttenuation: true,
    depthWrite: false,
  });

  const points = new THREE.Points(geometry, material);
  points.renderOrder = 8;
  parent.add(points);

  const flash = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    color: sparkColor,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }));
  flash.scale.set(0.2, 0.2, 1);
  flash.renderOrder = 9;
  parent.add(flash);

  const hotFlash = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }));
  hotFlash.scale.set(0.1, 0.1, 1);
  hotFlash.renderOrder = 10;
  parent.add(hotFlash);

  const sparkLight = new THREE.PointLight(sparkColor, 0, 3.8, 2);
  sparkLight.castShadow = false;
  parent.add(sparkLight);

  return {
    sparkCount,
    positions,
    colors,
    lifetimes,
    maxLifetimes,
    velocities,
    geometry,
    material,
    points,
    flash,
    hotFlash,
    sparkLight,
    nextSpark: 0,
    burstCooldown: 0,
  };
}

function createHal9000WireRig({ THREE, avatar }) {
  if (!avatar?.panelRoot) {
    return {
      update() {},
      dispose() {},
    };
  }

  const panelW = avatar.metrics?.panelWidth ?? 2;
  const panelH = avatar.metrics?.panelHeight ?? 5;
  const panelD = avatar.metrics?.panelDepth ?? 0.5;
  const frameThickness = avatar.metrics?.frameThickness ?? 0.15;
  const bodyHalfW = (panelW + frameThickness * 2) / 2 + 0.05;
  const bodyHalfH = (panelH + frameThickness * 2) / 2 + 0.05;
  const bodyFrontZ = panelD / 2 + 0.1;
  const bodyBackZ = -panelD / 2 - 0.08;
  const collisionMargin = 0.08;

  const segmentCount = 24;
  const wireLength = 2.8;
  const segmentLength = wireLength / segmentCount;
  const gravity = -0.0022;
  const damping = 0.985;
  const constraintIterations = 8;
  const buoyancy = 0.0016;
  const driftStrength = 0.0032;
  const jitterStrength = 0.0017;

  const wireRoot = new THREE.Group();
  wireRoot.name = "hal9000-wire-root";
  avatar.panelRoot.add(wireRoot);

  const sparkTexture = createSparkTexture(THREE);
  const connectorMaterial = new THREE.MeshStandardMaterial({
    color: 0x333333,
    metalness: 0.8,
    roughness: 0.3,
  });
  const connectorGeometry = new THREE.CylinderGeometry(0.04, 0.04, 0.12, 8);
  const upAxis = new THREE.Vector3(0, 1, 0);
  const tempDirection = new THREE.Vector3();
  const tempVelocity = new THREE.Vector3();

  function collideWithBody(point) {
    if (
      point.x > -bodyHalfW
      && point.x < bodyHalfW
      && point.y > -bodyHalfH
      && point.y < bodyHalfH
      && point.z > bodyBackZ
      && point.z < bodyFrontZ
    ) {
      point.z = bodyBackZ - collisionMargin;
      return true;
    }
    return false;
  }

  function createWire({
    color,
    anchorOffset,
    sparkColor = 0xffaa44,
  }) {
    const points = [];
    const prevPoints = [];

    for (let i = 0; i <= segmentCount; i += 1) {
      const point = new THREE.Vector3(
        anchorOffset.x + (Math.random() - 0.5) * 0.04,
        anchorOffset.y - i * segmentLength * 0.52,
        anchorOffset.z - i * segmentLength * 0.58,
      );
      points.push(point);
      prevPoints.push(point.clone());
    }

    const linePositions = new Float32Array((segmentCount + 1) * 3);
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute("position", new THREE.BufferAttribute(linePositions, 3));
    const lineMaterial = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.95,
    });
    const line = new THREE.Line(lineGeometry, lineMaterial);
    line.frustumCulled = false;
    wireRoot.add(line);

    const connector = new THREE.Mesh(connectorGeometry, connectorMaterial);
    connector.position.set(anchorOffset.x, anchorOffset.y, anchorOffset.z);
    connector.castShadow = true;
    connector.receiveShadow = true;
    wireRoot.add(connector);

    const sparks = createWireSparkRuntime({
      THREE,
      parent: wireRoot,
      texture: sparkTexture,
      sparkColor,
    });

    return {
      anchorOffset: new THREE.Vector3(anchorOffset.x, anchorOffset.y, anchorOffset.z),
      points,
      prevPoints,
      linePositions,
      lineGeometry,
      line,
      connector,
      sparks,
      driftPhaseX: Math.random() * Math.PI * 2,
      driftPhaseY: Math.random() * Math.PI * 2,
      driftPhaseZ: Math.random() * Math.PI * 2,
    };
  }

  const wires = [
    createWire({
      color: 0xcc2222,
      sparkColor: 0xffb04c,
      anchorOffset: { x: -0.3, y: 0.4, z: -panelD / 2 - 0.08 },
    }),
    createWire({
      color: 0x22aa44,
      sparkColor: 0xffa84a,
      anchorOffset: { x: 0.25, y: 0.1, z: -panelD / 2 - 0.08 },
    }),
  ];

  function emitSpark(sparks, origin, baseVelocity, intensity = 1) {
    const idx = sparks.nextSpark % sparks.sparkCount;
    sparks.nextSpark += 1;
    const pi = idx * 3;

    sparks.positions[pi] = origin.x + (Math.random() - 0.5) * 0.01;
    sparks.positions[pi + 1] = origin.y + (Math.random() - 0.5) * 0.01;
    sparks.positions[pi + 2] = origin.z + (Math.random() - 0.5) * 0.01;

    const speed = (0.02 + Math.random() * 0.06) * intensity;
    const angle = Math.random() * Math.PI * 2;
    const rise = 0.015 + Math.random() * 0.03;
    sparks.velocities[idx].set(
      Math.cos(angle) * speed + baseVelocity.x * 1.2,
      Math.sin(angle) * speed * 0.55 + rise + baseVelocity.y * 0.4,
      Math.sin(angle * 0.7) * speed + baseVelocity.z * 1.2,
    );

    sparks.maxLifetimes[idx] = 0.14 + Math.random() * 0.42 * intensity;
    sparks.lifetimes[idx] = sparks.maxLifetimes[idx];

    sparks.colors[pi] = 1;
    sparks.colors[pi + 1] = 0.95;
    sparks.colors[pi + 2] = 0.8;
  }

  function updateSparks(sparks, dt, tipPoint, baseVelocity) {
    const step = Math.max(0.4, Math.min(3, dt * 60));
    let burstFlash = false;

    sparks.burstCooldown -= dt;
    if (sparks.burstCooldown <= 0 && Math.random() < 0.04 * step) {
      sparks.burstCooldown = 0.3 + Math.random() * 0.45;
      burstFlash = true;
      const burstCount = 14 + Math.floor(Math.random() * 18);
      for (let i = 0; i < burstCount; i += 1) {
        emitSpark(sparks, tipPoint, baseVelocity, 2);
      }
    }

    const baseEmission = Math.sin(performance.now() * 0.01) > 0 ? 2 : 1;
    for (let i = 0; i < baseEmission; i += 1) {
      if (Math.random() < 0.7) emitSpark(sparks, tipPoint, baseVelocity, 0.9);
    }

    const drag = Math.pow(0.965, step);
    for (let i = 0; i < sparks.sparkCount; i += 1) {
      if (sparks.lifetimes[i] <= 0) continue;

      sparks.lifetimes[i] -= dt;
      if (sparks.lifetimes[i] <= 0) {
        const pi = i * 3;
        sparks.positions[pi + 1] = -999;
        continue;
      }

      const lifeRatio = sparks.lifetimes[i] / Math.max(0.0001, sparks.maxLifetimes[i]);
      const velocity = sparks.velocities[i];
      velocity.y -= 0.0032 * step;
      velocity.multiplyScalar(drag);

      const pi = i * 3;
      sparks.positions[pi] += velocity.x * step;
      sparks.positions[pi + 1] += velocity.y * step;
      sparks.positions[pi + 2] += velocity.z * step;

      if (lifeRatio > 0.7) {
        sparks.colors[pi] = 1;
        sparks.colors[pi + 1] = 0.82 + lifeRatio * 0.18;
        sparks.colors[pi + 2] = 0.5 + lifeRatio * 0.5;
      } else if (lifeRatio > 0.4) {
        sparks.colors[pi] = 1;
        sparks.colors[pi + 1] = 0.35 + lifeRatio * 0.8;
        sparks.colors[pi + 2] = lifeRatio * 0.32;
      } else {
        sparks.colors[pi] = 0.82 + lifeRatio * 0.5;
        sparks.colors[pi + 1] = lifeRatio * 0.62;
        sparks.colors[pi + 2] = 0;
      }
    }

    sparks.geometry.attributes.position.needsUpdate = true;
    sparks.geometry.attributes.color.needsUpdate = true;

    const flashIntensity = burstFlash
      ? 1
      : (Math.random() < 0.28 ? Math.random() * 0.55 : 0.04);
    sparks.flash.position.copy(tipPoint);
    sparks.flash.material.opacity = flashIntensity;
    const flashScale = 0.2 + flashIntensity * 1.1;
    sparks.flash.scale.set(flashScale, flashScale, 1);

    sparks.hotFlash.position.copy(tipPoint);
    sparks.hotFlash.material.opacity = flashIntensity * 0.78;
    const hotScale = 0.1 + flashIntensity * 0.4;
    sparks.hotFlash.scale.set(hotScale, hotScale, 1);

    sparks.sparkLight.position.copy(tipPoint);
    sparks.sparkLight.intensity = flashIntensity * 4.8;
  }

  function updateWire(wire, dt, t) {
    const step = Math.max(0.4, Math.min(3, dt * 60));
    const dampingStep = Math.pow(damping, step);
    const anchor = wire.anchorOffset;
    wire.points[0].copy(anchor);

    for (let i = 1; i <= segmentCount; i += 1) {
      const curr = wire.points[i];
      const prev = wire.prevPoints[i];

      tempVelocity.copy(curr).sub(prev).multiplyScalar(dampingStep);
      prev.copy(curr);
      curr.add(tempVelocity);
      curr.y += gravity * step;

      const tipFactor = i / segmentCount;
      const twitch = jitterStrength * tipFactor * tipFactor * step;
      curr.x += (Math.random() - 0.5) * twitch;
      curr.y += (Math.random() - 0.5) * twitch * 0.8;
      curr.z += (Math.random() - 0.5) * twitch;

      // Low-gravity drift: gentle buoyancy and slow orbital motion.
      curr.y += buoyancy * tipFactor * step;
      curr.x += Math.sin(t * 1.05 + i * 0.42 + wire.driftPhaseX) * driftStrength * tipFactor * step;
      curr.y += Math.sin(t * 0.82 + i * 0.36 + wire.driftPhaseY) * driftStrength * 0.5 * tipFactor * step;
      curr.z += Math.cos(t * 0.94 + i * 0.38 + wire.driftPhaseZ) * driftStrength * 0.85 * tipFactor * step;
    }

    for (let iter = 0; iter < constraintIterations; iter += 1) {
      wire.points[0].copy(anchor);
      for (let i = 0; i < segmentCount; i += 1) {
        const a = wire.points[i];
        const b = wire.points[i + 1];
        tempDirection.copy(b).sub(a);
        const dist = tempDirection.length();
        if (dist <= 0.000001) continue;
        tempDirection.multiplyScalar((dist - segmentLength) / dist * 0.5);

        if (i === 0) {
          b.sub(tempDirection.multiplyScalar(2));
          tempDirection.multiplyScalar(0.5);
        } else {
          a.add(tempDirection);
          b.sub(tempDirection);
        }
      }

      for (let i = 1; i <= segmentCount; i += 1) {
        collideWithBody(wire.points[i]);
      }
    }

    for (let i = 0; i <= segmentCount; i += 1) {
      const point = wire.points[i];
      const pi = i * 3;
      wire.linePositions[pi] = point.x;
      wire.linePositions[pi + 1] = point.y;
      wire.linePositions[pi + 2] = point.z;
    }
    wire.lineGeometry.attributes.position.needsUpdate = true;
    wire.lineGeometry.computeBoundingSphere();

    tempDirection.copy(wire.points[1]).sub(anchor);
    if (tempDirection.lengthSq() > 0.000001) {
      tempDirection.normalize();
      wire.connector.quaternion.setFromUnitVectors(upAxis, tempDirection);
    }
    wire.connector.position.copy(anchor);

    tempVelocity.copy(wire.points[segmentCount]).sub(wire.points[segmentCount - 1]);
    updateSparks(
      wire.sparks,
      dt,
      wire.points[segmentCount],
      tempVelocity,
    );
  }

  function update(dt, time) {
    const wireDt = Math.min(Math.max(dt, 0.001), 0.05);
    for (const wire of wires) {
      updateWire(wire, wireDt, time);
    }
  }

  return {
    update,
    dispose() {
      sparkTexture.dispose();
      connectorGeometry.dispose();
      connectorMaterial.dispose();
    },
  };
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
  const wireRig = createHal9000WireRig({ THREE, avatar });

  const propManager = createPropManager();
  const sharedPropNames = listSharedProps();
  let currentPropName = NO_PROP_VALUE;
  let currentPropId = null;

  const runtime = {
    elapsed: 0,
    wireElapsed: 0,
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
    const panelMetalness = clamp(state.metalness * 0.65, 0, 1);
    const panelRoughness = clamp(Math.max(state.roughness, 0.3), 0, 1);
    avatar.materials.panel.metalness = panelMetalness;
    avatar.materials.panel.roughness = panelRoughness;
    avatar.materials.panel.clearcoat = clamp(state.clearcoat * 0.6, 0, 1);
    avatar.materials.panel.clearcoatRoughness = clamp(Math.max(state.clearcoatRoughness, 0.24), 0, 1);
    avatar.materials.panel.envMapIntensity = 0.42 + (1 - panelRoughness) * 0.08;
    avatar.materials.panel.needsUpdate = true;

    avatar.materials.accent.color.set(state.accentColor);
    avatar.materials.accent.needsUpdate = true;

    avatar.materials.bezel.color.set(state.bezelColor);
    avatar.materials.bezel.metalness = clamp(0.28 + state.metalness * 0.36, 0, 1);
    avatar.materials.bezel.roughness = clamp(0.36 + state.roughness * 0.42, 0, 1);
    avatar.materials.bezel.clearcoat = clamp(state.clearcoat * 0.55, 0, 1);
    avatar.materials.bezel.clearcoatRoughness = clamp(0.22 + state.clearcoatRoughness * 0.58, 0, 1);
    avatar.materials.bezel.envMapIntensity = 0.32;
    avatar.materials.bezel.needsUpdate = true;

    avatar.materials.lensGlass.color.set(state.lensColor);
    avatar.materials.lensGlass.emissive.set(state.glowColor);
    avatar.materials.lensGlass.roughness = clamp(0.22 + state.roughness * 0.25, 0, 1);
    avatar.materials.lensGlass.clearcoatRoughness = clamp(0.1 + state.clearcoatRoughness * 0.35, 0, 1);
    avatar.materials.lensGlass.envMapIntensity = 0.36;
    avatar.materials.lensGlass.emissiveIntensity = clamp(0.02 + state.glowIntensity * 0.05, 0, 1.2);
    avatar.materials.lensGlass.needsUpdate = true;

    avatar.materials.iris.color.set(state.irisColor);
    if (avatar.materials.iris.emissive) {
      avatar.materials.iris.emissive.set(state.glowColor);
      avatar.materials.iris.emissiveIntensity = 0.22 + state.glowIntensity * 0.45;
    }
    avatar.materials.iris.needsUpdate = true;

    avatar.materials.pupil.color.set(state.pupilColor);
    if (avatar.materials.pupil.emissive) {
      avatar.materials.pupil.emissive.set(state.glowColor);
      avatar.materials.pupil.emissiveIntensity = 0.18 + state.glowIntensity * 0.35;
    }
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
    if (avatar.hotPoint) {
      avatar.hotPoint.scale.setScalar(clamp(0.95 + irisScale * 0.16, 0.75, 1.45));
    }
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
    if (avatar.hotPoint) {
      avatar.hotPoint.position.x = x;
      avatar.hotPoint.position.y = y;
    }
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
    const lensZScale = avatar.metrics?.lensZScale ?? 0.46;
    avatar.lensGlass.scale.set(lensScale, lensScale, lensZScale * lensScale);
    avatar.lensHighlight.scale.set(lensScale, lensScale, 1);

    runtime.baseIrisScale = clamp(state.irisScale * expr.irisScale, 0.45, 2);
    runtime.basePupilScale = clamp(state.pupilScale * expr.pupilScale, 0.35, 2);
    applyEyeScale();

    const eyeY = state.eyeY + expr.eyeYOffset;
    avatar.eyeRoot.position.set(0, eyeY, 0.25 + state.eyeZ);
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
      x: clamp(eyeX, -0.16, 0.16),
      y: clamp(eyeY, -0.14, 0.14),
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

    const voiceGlow = clamp(
      runtime.voiceCurrent * 1.45 + runtime.visemeStrength * 0.85,
      0,
      1.8,
    );
    const idlePulse = clamp(runtime.modePulse * 0.18 + Math.max(0, visemeBoost) * 0.08, 0, 0.24);
    const glowOpacity = clamp(
      0.05 + state.glowIntensity * 0.16 + idlePulse * 0.2 + voiceGlow * 0.52 + expr.glowBoost * 0.1,
      0.03,
      1,
    );
    avatar.materials.glowRing.opacity = glowOpacity;
    avatar.materials.glowCore.opacity = clamp(glowOpacity * 0.82, 0.06, 1);
    if (avatar.materials.iris.emissiveIntensity !== undefined) {
      avatar.materials.iris.emissiveIntensity = (
        0.22
        + state.glowIntensity * 0.45
        + idlePulse * 0.25
        + voiceGlow * 1.9
      );
    }
    if (avatar.materials.pupil.emissiveIntensity !== undefined) {
      avatar.materials.pupil.emissiveIntensity = (
        0.18
        + state.glowIntensity * 0.35
        + idlePulse * 0.2
        + voiceGlow * 2.2
      );
    }
    if (avatar.materials.lensGlass.emissiveIntensity !== undefined) {
      avatar.materials.lensGlass.emissiveIntensity = clamp(
        0.03 + state.glowIntensity * 0.08 + idlePulse * 0.05 + voiceGlow * 0.75,
        0,
        2,
      );
    }
    if (avatar.hotPoint) {
      avatar.hotPoint.scale.setScalar(clamp(0.95 + pulse * 0.2, 0.8, 1.5));
    }
    avatar.eyeLight.intensity = clamp(
      0.1
      + state.glowIntensity * 0.28
      + idlePulse * 0.12
      + voiceGlow * 1.15
      + expr.glowBoost * 0.14,
      0,
      1.5,
    );
    avatar.eyeLight.distance = 2.8 + state.glowIntensity * 0.8;
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
    const wireDt = Math.min(Math.max(dt, 0.001), 0.05);

    if (pointer) {
      runtime.lookTargetX = pointer.x * 0.06;
      runtime.lookTargetY = pointer.y * 0.05;
    }

    applyAnimationFrame(frameDt);
    applyVoiceFrame(frameDt);
    runtime.wireElapsed += wireDt;
    wireRig.update(wireDt, runtime.wireElapsed);
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
    wireRig.dispose();
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
