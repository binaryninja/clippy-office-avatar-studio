import * as THREE from 'three';
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";

function getLine({ width, resolution }) {
    const points = [];
    const colors = [];
    const minRadius = 1.1 + Math.random() * 0.1;
    const angle = Math.random() * Math.PI * 2;
    for (let i = 0, len = 10; i < len; i += 1) {
        const hue = 0.25 - i / 10 * 0.27;
        let lightness = 0.5;
        let { r, g, b } = new THREE.Color().setHSL(hue, 1.0, lightness);
        colors.push(r, g, b);
        let radius = i / 8;
        points.push(Math.cos(angle) * (minRadius + radius), 0, Math.sin(angle) * (minRadius + radius));
    }
    const material = new LineMaterial({
        linewidth: width,
        vertexColors: true,
    });
    material.resolution.copy(resolution);
    const lineGeo = new LineGeometry();
    lineGeo.setColors(colors);
    lineGeo.setPositions(points);
    const mesh = new Line2(lineGeo, material);
    mesh.computeLineDistances();
    return mesh;
}

function getRing({ distance, hue = 0, lightness = 1.0, width = 2, resolution }) {
    function getRingVerts(radius = distance) {
        const positions = [];
        const numVerts = 128;
        for (let i = 0; i <= numVerts; i += 1) {
            const angle = i / numVerts * Math.PI * 2;
            positions.push(radius * Math.cos(angle), radius * Math.sin(angle), 0);
        }
        return positions;
    }
    const color = new THREE.Color().setHSL(hue, 1, lightness);
    const ringMat = new LineMaterial({
        color,
        linewidth: width,
    });
    ringMat.resolution.copy(resolution);
    const lineGeo = new LineGeometry();
    lineGeo.setPositions(getRingVerts());
    const orbitRing = new Line2(lineGeo, ringMat);
    orbitRing.rotation.x = Math.PI * 0.5;
    orbitRing.computeLineDistances();
    return orbitRing;
}

function getElipticLines({
    resolution = new THREE.Vector2(
        window.innerWidth || 1280,
        window.innerHeight || 720,
    ),
    distances = [],
} = {}) {
    const ringGroup = new THREE.Group();
    const orbitDistances = Array.isArray(distances) && distances.length
        ? [...distances]
            .map((distance) => Number(distance))
            .filter((distance) => Number.isFinite(distance) && distance > 0)
            .sort((a, b) => a - b)
        : Array.from({ length: 20 }, (_, i) => 1.1 + i * 0.08);

    for (let i = 0; i < orbitDistances.length; i += 1) {
        const normalized = orbitDistances.length <= 1 ? 0 : i / (orbitDistances.length - 1);
        const hue = 0.25 - normalized * 0.27;
        const lightness = 0.5 - normalized * 0.5;
        const width = 0.6;
        const ring = getRing({
            distance: orbitDistances[i],
            hue,
            lightness,
            width,
            resolution,
        });
        ringGroup.add(ring);
    }
    for (let i = 0; i < 40; i += 1) {
        const width = 0.5 + Math.random() * 1;
        const line = getLine({ index: i, width, resolution });
        ringGroup.add(line);
    }
    return ringGroup;
}
export default getElipticLines;
