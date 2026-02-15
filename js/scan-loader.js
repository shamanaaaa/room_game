import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';

/**
 * Detect format from filename and load the model.
 * Supports: .glb, .gltf, .fbx, .obj
 */
async function loadModel(fileUrl, filename) {
    const ext = filename.split('.').pop().toLowerCase();

    if (ext === 'glb' || ext === 'gltf') {
        const loader = new GLTFLoader();
        const gltf = await new Promise((resolve, reject) =>
            loader.load(fileUrl, resolve, undefined, reject)
        );
        return gltf.scene;
    }

    if (ext === 'fbx') {
        const loader = new FBXLoader();
        return await new Promise((resolve, reject) =>
            loader.load(fileUrl, resolve, undefined, reject)
        );
    }

    if (ext === 'obj') {
        const loader = new OBJLoader();
        return await new Promise((resolve, reject) =>
            loader.load(fileUrl, resolve, undefined, reject)
        );
    }

    throw new Error(`Unsupported format: .${ext}`);
}

/**
 * Load a 3D model file and prepare it for the game.
 * Returns { bounds, collisionMeshes, spawnPoint }.
 */
export async function loadScan(scene, fileUrl, filename = 'model.glb') {
    const model = await loadModel(fileUrl, filename);

    // Fix materials
    model.traverse((child) => {
        if (child.isMesh) {
            // Handle material arrays (common in FBX)
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            for (const mat of mats) {
                if (mat.map) {
                    mat.map.colorSpace = THREE.SRGBColorSpace;
                }
                mat.side = THREE.DoubleSide;
            }
        }
    });

    // FBX models often come in centimeter scale — detect and fix
    const rawBox = new THREE.Box3().setFromObject(model);
    const rawSize = rawBox.getSize(new THREE.Vector3());
    const maxDim = Math.max(rawSize.x, rawSize.y, rawSize.z);

    // If the model is enormous (>100 units tall), it's likely in cm → scale to meters
    if (maxDim > 100) {
        const scaleFactor = 0.01;
        model.scale.multiplyScalar(scaleFactor);
    }

    // Recompute after potential rescale
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    // Re-center: floor at Y=0, centered on XZ
    model.position.sub(new THREE.Vector3(center.x, box.min.y, center.z));

    scene.add(model);

    // Recalculate bounds after repositioning
    const adjustedBox = new THREE.Box3().setFromObject(model);
    const adjustedSize = adjustedBox.getSize(new THREE.Vector3());

    // Collect meshes for collision
    const collisionMeshes = [];
    model.traverse((child) => {
        if (child.isMesh) {
            collisionMeshes.push(child);
        }
    });

    // Spawn at center of floor
    const spawnPoint = new THREE.Vector3(0, 0.025, 0);

    const bounds = {
        width: adjustedSize.x,
        height: adjustedSize.y,
        depth: adjustedSize.z,
        box: adjustedBox,
    };

    return { bounds, collisionMeshes, spawnPoint };
}
