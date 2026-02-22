import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import getSun from "../../solar-system/src/getSun.js";
import getPlanet from "../../solar-system/src/getPlanet.js";
import getStarfield from "../../solar-system/src/getStarfield.js";
import getNebula from "../../solar-system/src/getNebula.js";
import getAsteroidBelt from "../../solar-system/src/getAsteroidBelt.js";
import getElipticLines from "../../solar-system/src/getElipticLines.js";

const ROCK_OBJECT_FILES = ["Rock1.obj", "Rock2.obj", "Rock3.obj"];

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
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.6, 0.15, 8, 64),
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
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.5, 0.05, 8, 64),
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
  const solarSystem = new THREE.Group();
  const updateTargets = [];
  let disposed = false;
  let time = 0;

  solarSystem.userData.update = (t) => {
    for (const target of updateTargets) {
      target.userData.update?.(t);
    }
  };
  setpiece.add(solarSystem);

  const sun = getSun();
  solarSystem.add(sun);
  updateTargets.push(sun);
  trackTextureMaps(sun, textureSink, textureSeen);
  anchorObjects.set("sun", sun);

  const mercury = getPlanet({ size: 0.1, distance: 1.25, img: "mercury.png" });
  solarSystem.add(mercury);
  updateTargets.push(mercury);
  trackTextureMaps(mercury, textureSink, textureSeen);

  const venus = getPlanet({ size: 0.2, distance: 1.65, img: "venus.png" });
  solarSystem.add(venus);
  updateTargets.push(venus);
  trackTextureMaps(venus, textureSink, textureSeen);

  const moon = getPlanet({ size: 0.075, distance: 0.4, img: "moon.png" });
  const earth = getPlanet({ children: [moon], size: 0.225, distance: 2.0, img: "earth.png" });
  solarSystem.add(earth);
  updateTargets.push(earth);
  trackTextureMaps(earth, textureSink, textureSeen);
  anchorObjects.set("earth", getPlanetBody(earth) || earth);

  const mars = getPlanet({ size: 0.15, distance: 2.25, img: "mars.png" });
  solarSystem.add(mars);
  updateTargets.push(mars);
  trackTextureMaps(mars, textureSink, textureSeen);

  const jupiter = getPlanet({ size: 0.4, distance: 2.75, img: "jupiter.png" });
  solarSystem.add(jupiter);
  updateTargets.push(jupiter);
  trackTextureMaps(jupiter, textureSink, textureSeen);
  anchorObjects.set("jupiter", getPlanetBody(jupiter) || jupiter);

  const saturn = getPlanet({
    children: [createSaturnRing()],
    size: 0.35,
    distance: 3.25,
    img: "saturn.png",
  });
  solarSystem.add(saturn);
  updateTargets.push(saturn);
  trackTextureMaps(saturn, textureSink, textureSeen);

  const uranus = getPlanet({
    children: [createUranusRing()],
    size: 0.3,
    distance: 3.75,
    img: "uranus.png",
  });
  solarSystem.add(uranus);
  updateTargets.push(uranus);
  trackTextureMaps(uranus, textureSink, textureSeen);

  const neptune = getPlanet({ size: 0.3, distance: 4.25, img: "neptune.png" });
  solarSystem.add(neptune);
  updateTargets.push(neptune);
  trackTextureMaps(neptune, textureSink, textureSeen);

  const orbitLines = getElipticLines({
    resolution: new THREE.Vector2(
      window.innerWidth || 1280,
      window.innerHeight || 720,
    ),
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
    const asteroidBelt = getAsteroidBelt(meshes);
    asteroidBelt.userData.update = (t) => {
      for (const child of asteroidBelt.children) {
        child.userData.update?.(t);
      }
    };
    solarSystem.add(asteroidBelt);
    updateTargets.push(asteroidBelt);
  });

  function update(dt = 0.016) {
    time += dt * 0.22;
    solarSystem.userData.update?.(time);
    setpiece.rotation.y += dt * 0.03;
    setpiece.rotation.z = Math.sin(time * 0.6) * 0.015;
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

  return {
    group: setpiece,
    update,
    dispose,
    getWorldAnchor,
  };
}
