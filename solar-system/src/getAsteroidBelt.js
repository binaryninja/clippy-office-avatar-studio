import * as THREE from 'three';

function randomBetween(min, max) {
    return min + Math.random() * (max - min);
}

function getInstanced({
    distanceMin,
    distanceMax,
    mesh,
    sizeMin,
    sizeMax,
    orbitPeriodYears,
}) {
    const numObjs = 25 + Math.floor(Math.random() * 25);
    const instaMesh = new THREE.InstancedMesh(mesh.geometry, mesh.material, numObjs);
    const matrix = new THREE.Matrix4();
    const rotationOffset = Math.random() * Math.PI * 2;
    const direction = Math.random() > 0.08 ? 1 : -1;
    const angularVelocity = ((Math.PI * 2) / Math.max(0.0001, orbitPeriodYears)) * direction;
    for (let i = 0; i < numObjs; i += 1) {
        const radius = randomBetween(distanceMin, distanceMax);
        const angle = Math.random() * Math.PI * 2;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        const position = new THREE.Vector3(x, 0, z);
        const quaternion = new THREE.Quaternion();
        quaternion.random();
        const currentSize = randomBetween(sizeMin, sizeMax);
        const scale = new THREE.Vector3().setScalar(currentSize);
        matrix.compose(position, quaternion, scale);
        instaMesh.setMatrixAt(i, matrix);
    }
    instaMesh.userData = {
        update(t) {
            instaMesh.rotation.y = rotationOffset + t * angularVelocity;
        },
    };
    return instaMesh;
}
function getAsteroidBelt(
    objs,
    {
        distanceMin = 2.2,
        distanceMax = 3.2,
        sizeMin = 0.0015,
        sizeMax = 0.004,
        orbitPeriodYears = 5.2,
    } = {},
) {
    const group = new THREE.Group();
    objs.forEach((obj) => {
        const asteroids = getInstanced({
            distanceMin,
            distanceMax,
            mesh: obj,
            sizeMin,
            sizeMax,
            orbitPeriodYears,
        });
        group.add(asteroids);
    });
    return group;
}

export default getAsteroidBelt;
