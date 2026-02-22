import * as THREE from 'three';
import { getFresnelMat } from './getFresnelMat.js';

const texLoader = new THREE.TextureLoader();
const geo = new THREE.IcosahedronGeometry(1, 6);

function getTextureUrl(img) {
    return new URL(`../textures/${img}`, import.meta.url).href;
}

function getPlanet({
    children = [],
    distance = 0,
    img = '',
    size = 1,
    orbitPeriodYears = 1,
    direction = 1,
    startAngle = Math.random() * Math.PI * 2,
}) {
    const orbitGroup = new THREE.Group();
    orbitGroup.rotation.x = 0;
    orbitGroup.rotation.y = startAngle;

    const map = texLoader.load(getTextureUrl(img));
    const planetMat = new THREE.MeshStandardMaterial({
      map,
    });
    const planet = new THREE.Mesh(geo, planetMat);
    planet.scale.setScalar(size);

    planet.position.x = distance;
    planet.position.z = 0;
    
    const planetRimMat = getFresnelMat({ rimHex: 0xffffff, facingHex: 0x000000 });
    const planetRimMesh = new THREE.Mesh(geo, planetRimMat);
    planetRimMesh.scale.setScalar(1.01);
    planet.add(planetRimMesh);

    children.forEach((child) => {
      child.position.x = distance;
      child.position.z = 0;
      orbitGroup.add(child);
    });

    const orbitalPeriod = Math.max(0.0001, Number(orbitPeriodYears) || 1);
    const angularVelocity = ((Math.PI * 2) / orbitalPeriod) * (Number(direction) < 0 ? -1 : 1);
    orbitGroup.userData.update = (t) => {
      orbitGroup.rotation.y = startAngle + t * angularVelocity;
      children.forEach((child) => {
        child.userData.update?.(t);
      });
    };
    orbitGroup.add(planet);
    return orbitGroup;
  }

  export default getPlanet;
