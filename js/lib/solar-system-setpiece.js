import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import getSun from "../../solar-system/src/getSun.js";
import getPlanet from "../../solar-system/src/getPlanet.js";
import getStarfield from "../../solar-system/src/getStarfield.js";
import getNebula from "../../solar-system/src/getNebula.js";
import getAsteroidBelt from "../../solar-system/src/getAsteroidBelt.js";
import getElipticLines from "../../solar-system/src/getElipticLines.js";

const ROCK_OBJECT_FILES = ["Rock1.obj", "Rock2.obj", "Rock3.obj"];
const KM_PER_AU = 149_597_870.7;
const DAYS_PER_EARTH_YEAR = 365.256363004;
const SIMULATION_YEARS_PER_SECOND = 0.002;
const MIN_BODY_DIAMETER_PX = 16;
const MIN_SUN_DIAMETER_PX = 24;
const MIN_BODY_CAMERA_DISTANCE = 1e-5;
const MAX_BODY_CAMERA_DISTANCE = 2e5;
const FALLBACK_VERTICAL_FOV_RADIANS = THREE.MathUtils.degToRad(45);

export const SOLAR_SCALE_MODES = Object.freeze({
  READABLE: "readable",
  TRUE_SCALE: "true-scale",
});

const PLANET_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: "mercury",
    img: "mercury.png",
    radiusKm: 2_439.7,
    semiMajorAu: 0.387_098,
    periodYears: 0.240_846_7,
  }),
  Object.freeze({
    id: "venus",
    img: "venus.png",
    radiusKm: 6_051.8,
    semiMajorAu: 0.723_332,
    periodYears: 0.615_197_26,
  }),
  Object.freeze({
    id: "earth",
    img: "earth.png",
    radiusKm: 6_371,
    semiMajorAu: 1,
    periodYears: 1,
  }),
  Object.freeze({
    id: "mars",
    img: "mars.png",
    radiusKm: 3_389.5,
    semiMajorAu: 1.523_679,
    periodYears: 1.880_815_8,
  }),
  Object.freeze({
    id: "jupiter",
    img: "jupiter.png",
    radiusKm: 69_911,
    semiMajorAu: 5.2044,
    periodYears: 11.862_615,
  }),
  Object.freeze({
    id: "saturn",
    img: "saturn.png",
    radiusKm: 58_232,
    semiMajorAu: 9.5826,
    periodYears: 29.447_498,
  }),
  Object.freeze({
    id: "uranus",
    img: "uranus.png",
    radiusKm: 25_362,
    semiMajorAu: 19.2184,
    periodYears: 84.016_846,
  }),
  Object.freeze({
    id: "neptune",
    img: "neptune.png",
    radiusKm: 24_622,
    semiMajorAu: 30.11,
    periodYears: 164.791_32,
  }),
]);

const MOON_DEFINITION = Object.freeze({
  img: "moon.png",
  radiusKm: 1_737.4,
  distanceKm: 384_400,
  periodDays: 27.321_661,
});

function kmToAu(km) {
  return Number(km) / KM_PER_AU;
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeScaleMode(value) {
  return value === SOLAR_SCALE_MODES.TRUE_SCALE
    ? SOLAR_SCALE_MODES.TRUE_SCALE
    : SOLAR_SCALE_MODES.READABLE;
}

function resolvePerspectiveCamera(viewCamera) {
  if (!viewCamera) return null;
  if (viewCamera.isPerspectiveCamera) return viewCamera;
  if (viewCamera.isArrayCamera && Array.isArray(viewCamera.cameras)) {
    return viewCamera.cameras.find((camera) => camera?.isPerspectiveCamera) || null;
  }
  return null;
}

function resolveVerticalFovRadians(viewCamera) {
  const perspectiveCamera = resolvePerspectiveCamera(viewCamera);
  const fovDegrees = Number(perspectiveCamera?.fov);
  if (Number.isFinite(fovDegrees) && fovDegrees > 0.01) {
    return THREE.MathUtils.degToRad(fovDegrees);
  }
  return FALLBACK_VERTICAL_FOV_RADIANS;
}

function toRockUrl(fileName) {
  return new URL(`../../solar-system/rocks/${fileName}`, import.meta.url).href;
}

function trackTextureMaps(root, sink, seen) {
  if (!root || !Array.isArray(sink) || !seen) return;
  root.traverse((node) => {
    const material = node?.material;
    const materials = Array.isArray(material) ? material : [material];
    for (const entry of materials) {
      const map = entry?.map;
      if (!map || seen.has(map)) continue;
      seen.add(map);
      sink.push(map);
    }
  });
}

function createLoadedRockMeshes(loadedObject) {
  const meshes = [];
  loadedObject?.traverse?.((child) => {
    if (!child?.isMesh || !child.geometry) return;
    child.geometry.computeVertexNormals();
    child.material = new THREE.MeshStandardMaterial({
      color: 0x7f786d,
      roughness: 0.78,
      metalness: 0.08,
    });
    meshes.push(child);
  });
  return meshes;
}

function loadRockLibrary() {
  const loader = new OBJLoader();
  const requests = ROCK_OBJECT_FILES.map((fileName) => (
    new Promise((resolve) => {
      loader.load(
        toRockUrl(fileName),
        (obj) => resolve(createLoadedRockMeshes(obj)),
        undefined,
        () => resolve([]),
      );
    })
  ));
  return Promise.all(requests).then((groups) => groups.flat());
}

function createSaturnRing() {
  const saturnDefinition = PLANET_DEFINITIONS.find((entry) => entry.id === "saturn");
  const saturnRadiusAu = kmToAu(saturnDefinition?.radiusKm || 58_232);
  const majorRadius = saturnRadiusAu * 1.95;
  const tubeRadius = saturnRadiusAu * 0.42;
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(majorRadius, tubeRadius, 8, 64),
    new THREE.MeshStandardMaterial({
      color: 0xc9c2b5,
      metalness: 0.4,
      roughness: 0.42,
      emissive: 0x181513,
      emissiveIntensity: 0.08,
    }),
  );
  ring.scale.z = 0.1;
  ring.rotation.x = Math.PI * 0.5;
  return ring;
}

function createUranusRing() {
  const uranusDefinition = PLANET_DEFINITIONS.find((entry) => entry.id === "uranus");
  const uranusRadiusAu = kmToAu(uranusDefinition?.radiusKm || 25_362);
  const majorRadius = uranusRadiusAu * 1.8;
  const tubeRadius = uranusRadiusAu * 0.08;
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(majorRadius, tubeRadius, 8, 64),
    new THREE.MeshStandardMaterial({
      color: 0xd6d1c6,
      metalness: 0.28,
      roughness: 0.52,
      emissive: 0x121110,
      emissiveIntensity: 0.06,
    }),
  );
  ring.scale.z = 0.1;
  return ring;
}

function getPlanetBody(orbitGroup) {
  if (!orbitGroup?.children?.length) return null;
  return orbitGroup.children.find((child) => child?.isMesh) || null;
}

export function createSolarSystemSetpiece({
  textureSink = [],
} = {}) {
  const setpiece = new THREE.Group();
  setpiece.name = "solar-system-setpiece";
  setpiece.position.set(0.26, 3.38, -8.8);
  setpiece.rotation.set(-0.08, 0.24, 0);
  setpiece.scale.setScalar(0.62);

  const textureSeen = new Set();
  const anchorObjects = new Map();
  const anchorRadiusByName = new Map();
  const scalableBodies = new Map();
  const ringBindings = [];
  const solarSystem = new THREE.Group();
  const updateTargets = [];
  const cameraWorldPosition = new THREE.Vector3();
  const bodyWorldPosition = new THREE.Vector3();
  const ringScale = new THREE.Vector3();
  let disposed = false;
  let simulationYears = 0;
  let scaleMode = SOLAR_SCALE_MODES.READABLE;

  solarSystem.userData.update = (t) => {
    for (const target of updateTargets) {
      target.userData.update?.(t);
    }
  };
  setpiece.add(solarSystem);

  function registerScalableBody(
    id,
    mesh,
    physicalRadius,
    minDiameterPx = MIN_BODY_DIAMETER_PX,
  ) {
    if (!mesh?.isMesh) return;
    const radius = Number(physicalRadius);
    if (!Number.isFinite(radius) || radius <= 0) return;
    scalableBodies.set(String(id || "").toLowerCase(), {
      mesh,
      physicalRadius: radius,
      minDiameterPx: Math.max(1, Number(minDiameterPx) || MIN_BODY_DIAMETER_PX),
    });
  }

  function applyTrueScale() {
    for (const body of scalableBodies.values()) {
      body.mesh.scale.setScalar(body.physicalRadius);
    }
    for (const ringBinding of ringBindings) {
      if (!ringBinding?.mesh || !ringBinding?.baseScale) continue;
      ringBinding.mesh.scale.copy(ringBinding.baseScale);
    }
  }

  function applyReadableScale(viewCamera, viewportHeightPx) {
    if (!viewCamera || !Number.isFinite(viewportHeightPx) || viewportHeightPx <= 0) return;
    const cameraObject = resolvePerspectiveCamera(viewCamera) || viewCamera;
    if (!cameraObject) return;

    const vfov = resolveVerticalFovRadians(viewCamera);
    const fovScale = Math.tan(vfov * 0.5);
    if (!Number.isFinite(fovScale) || fovScale <= 0) return;
    cameraObject.getWorldPosition(cameraWorldPosition);

    for (const body of scalableBodies.values()) {
      body.mesh.getWorldPosition(bodyWorldPosition);
      const cameraDistance = clampNumber(
        cameraWorldPosition.distanceTo(bodyWorldPosition),
        MIN_BODY_CAMERA_DISTANCE,
        MAX_BODY_CAMERA_DISTANCE,
      );
      const radiusFloorWorld = (body.minDiameterPx * fovScale * cameraDistance) / viewportHeightPx;
      const renderRadius = Math.max(body.physicalRadius, radiusFloorWorld);
      body.mesh.scale.setScalar(renderRadius);
    }

    for (const ringBinding of ringBindings) {
      const parentBody = scalableBodies.get(ringBinding.parentId);
      if (!parentBody || !ringBinding.mesh || !ringBinding.baseScale) continue;
      const ratio = parentBody.mesh.scale.x / Math.max(parentBody.physicalRadius, MIN_BODY_CAMERA_DISTANCE);
      ringScale.copy(ringBinding.baseScale).multiplyScalar(ratio);
      ringBinding.mesh.scale.copy(ringScale);
    }
  }

  const sun = getSun();
  const sunRadiusAu = kmToAu(696_340);
  sun.scale.setScalar(sunRadiusAu);
  solarSystem.add(sun);
  updateTargets.push(sun);
  trackTextureMaps(sun, textureSink, textureSeen);
  anchorObjects.set("sun", sun);
  anchorRadiusByName.set("sun", sunRadiusAu);
  registerScalableBody("sun", sun, sunRadiusAu, MIN_SUN_DIAMETER_PX);

  const moon = getPlanet({
    size: kmToAu(MOON_DEFINITION.radiusKm),
    distance: kmToAu(MOON_DEFINITION.distanceKm),
    img: MOON_DEFINITION.img,
    orbitPeriodYears: MOON_DEFINITION.periodDays / DAYS_PER_EARTH_YEAR,
  });
  const moonMesh = moon?.children?.[moon.children.length - 1];
  registerScalableBody("moon", moonMesh, kmToAu(MOON_DEFINITION.radiusKm), MIN_BODY_DIAMETER_PX);

  for (const planetDefinition of PLANET_DEFINITIONS) {
    const radiusAu = kmToAu(planetDefinition.radiusKm);
    const orbitChildren = [];
    let ringMesh = null;
    if (planetDefinition.id === "earth") {
      orbitChildren.push(moon);
    }
    if (planetDefinition.id === "saturn") {
      ringMesh = createSaturnRing();
      orbitChildren.push(ringMesh);
    }
    if (planetDefinition.id === "uranus") {
      ringMesh = createUranusRing();
      orbitChildren.push(ringMesh);
    }

    const orbitGroup = getPlanet({
      children: orbitChildren,
      size: radiusAu,
      distance: planetDefinition.semiMajorAu,
      img: planetDefinition.img,
      orbitPeriodYears: planetDefinition.periodYears,
    });

    solarSystem.add(orbitGroup);
    updateTargets.push(orbitGroup);
    trackTextureMaps(orbitGroup, textureSink, textureSeen);

    const planetMesh = orbitGroup?.children?.[orbitGroup.children.length - 1];
    registerScalableBody(planetDefinition.id, planetMesh, radiusAu, MIN_BODY_DIAMETER_PX);
    if (ringMesh?.isMesh) {
      ringBindings.push({
        mesh: ringMesh,
        parentId: planetDefinition.id,
        baseScale: ringMesh.scale.clone(),
      });
    }

    const body = getPlanetBody(orbitGroup) || orbitGroup;
    anchorObjects.set(planetDefinition.id, body);
    anchorRadiusByName.set(planetDefinition.id, radiusAu);
  }

  const orbitLines = getElipticLines({
    resolution: new THREE.Vector2(
      window.innerWidth || 1280,
      window.innerHeight || 720,
    ),
    distances: PLANET_DEFINITIONS.map((entry) => entry.semiMajorAu),
  });
  orbitLines.traverse((node) => {
    if (node?.material && "opacity" in node.material) {
      node.material.transparent = true;
      node.material.opacity = 0.2;
      node.material.needsUpdate = true;
    }
  });
  solarSystem.add(orbitLines);

  const starfield = getStarfield({ numStars: 320, size: 0.11 });
  if (starfield.material) {
    starfield.material.transparent = true;
    starfield.material.opacity = 0.35;
    starfield.material.depthWrite = false;
  }
  setpiece.add(starfield);
  trackTextureMaps(starfield, textureSink, textureSeen);

  const nebulaA = getNebula({
    hue: 0.03,
    sat: 0.6,
    numSprites: 8,
    opacity: 0.12,
    radius: 20,
    size: 30,
    z: -18,
  });
  const nebulaB = getNebula({
    hue: 0.0,
    sat: 0.26,
    numSprites: 8,
    opacity: 0.1,
    radius: 20,
    size: 30,
    z: 18,
  });
  setpiece.add(nebulaA, nebulaB);
  trackTextureMaps(nebulaA, textureSink, textureSeen);
  trackTextureMaps(nebulaB, textureSink, textureSeen);

  const localFill = new THREE.PointLight(0xe2ddd2, 0.28, 14, 2);
  localFill.position.set(0, 1.8, 1.2);
  setpiece.add(localFill);

  loadRockLibrary().then((meshes) => {
    if (disposed || !meshes.length) return;
    const asteroidBelt = getAsteroidBelt(meshes, {
      distanceMin: 2.2,
      distanceMax: 3.2,
      sizeMin: kmToAu(80),
      sizeMax: kmToAu(420),
      orbitPeriodYears: 4.8,
    });
    asteroidBelt.userData.update = (t) => {
      for (const child of asteroidBelt.children) {
        child.userData.update?.(t);
      }
    };
    solarSystem.add(asteroidBelt);
    updateTargets.push(asteroidBelt);
  });

  function update(dt = 0.016, viewCamera = null, viewportHeightPx = 0) {
    simulationYears += dt * SIMULATION_YEARS_PER_SECOND;
    solarSystem.userData.update?.(simulationYears);

    if (scaleMode === SOLAR_SCALE_MODES.TRUE_SCALE) {
      applyTrueScale();
      return;
    }
    applyReadableScale(viewCamera, viewportHeightPx);
  }

  function dispose() {
    disposed = true;
  }

  function getWorldAnchor(name, target = new THREE.Vector3()) {
    const key = String(name || "").toLowerCase();
    const anchorObject = anchorObjects.get(key);
    if (!anchorObject) return null;
    anchorObject.getWorldPosition(target);
    return target;
  }

  function getWorldBodyRadius(name) {
    const key = String(name || "").toLowerCase();
    const radius = anchorRadiusByName.get(key);
    if (!Number.isFinite(radius)) return null;
    return radius * setpiece.scale.x;
  }

  function setScaleMode(mode) {
    const normalized = normalizeScaleMode(mode);
    if (normalized === scaleMode) return;
    scaleMode = normalized;
    if (scaleMode === SOLAR_SCALE_MODES.TRUE_SCALE) {
      applyTrueScale();
    }
  }

  function getScaleMode() {
    return scaleMode;
  }

  return {
    group: setpiece,
    update,
    dispose,
    getWorldAnchor,
    getWorldBodyRadius,
    setScaleMode,
    getScaleMode,
  };
}
