import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const TARGET_HEIGHT = 0.03; // match PLAYER_HEIGHT

// Animation files to load (place in public/characters/)
// The first found file is used as the base character model
const ANIM_NAMES = ['idle', 'walk', 'run', 'jump', 'fly'];

async function loadGLB(url) {
    const loader = new GLTFLoader();
    return new Promise((resolve, reject) =>
        loader.load(url, resolve, undefined, reject)
    );
}

// Strip root-motion position tracks from animation clips so the character
// doesn't drift — we control position ourselves in player.js
function stripRootMotion(clip) {
    clip.tracks = clip.tracks.filter((track) => {
        // Remove position tracks on the root bone (e.g. "mixamorigHips.position")
        // Keep rotation and scale tracks
        if (track.name.endsWith('.position')) {
            const parts = track.name.split('.');
            // Only strip if it's a root-level bone (first bone in hierarchy)
            if (parts.length === 2) return false;
        }
        return true;
    });
    return clip;
}

export async function loadCharacter() {
    let model;
    let embeddedClips = [];

    // Load the base character model from the first available animation file (idle.glb)
    const gltf = await loadGLB('/characters/idle.glb');
    model = gltf.scene;
    embeddedClips = gltf.animations || [];

    // Scale to player height
    const box = new THREE.Box3().setFromObject(model);
    const rawHeight = box.getSize(new THREE.Vector3()).y;
    if (rawHeight > 0) {
        const scale = TARGET_HEIGHT / rawHeight;
        model.scale.setScalar(scale);
    }

    // Fix materials
    model.traverse((child) => {
        if (child.isMesh) {
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            for (const mat of mats) {
                if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
                mat.side = THREE.DoubleSide;
            }
        }
    });

    // Set up animation mixer
    const mixer = new THREE.AnimationMixer(model);
    const animations = {};

    // Register embedded animations from idle.glb
    if (embeddedClips.length > 0) {
        // Register the first embedded clip as "idle"
        animations['idle'] = mixer.clipAction(stripRootMotion(embeddedClips[0]));
        console.log(`[Character] Idle animation from idle.glb: "${embeddedClips[0].name}"`);
        // Register any additional embedded clips by name
        for (let i = 1; i < embeddedClips.length; i++) {
            const name = embeddedClips[i].name.toLowerCase();
            animations[name] = mixer.clipAction(stripRootMotion(embeddedClips[i]));
            console.log(`[Character] Embedded animation: "${embeddedClips[i].name}"`);
        }
    }

    // Try loading separate animation files (walk.glb, run.glb, etc.)
    for (const animName of ANIM_NAMES) {
        if (animations[animName]) continue; // already have it

        try {
            const animGltf = await loadGLB(`/characters/${animName}.glb`);
            if (animGltf.animations && animGltf.animations.length > 0) {
                animations[animName] = mixer.clipAction(stripRootMotion(animGltf.animations[0]));
                console.log(`[Character] Loaded animation: "${animName}" from ${animName}.glb`);
            }
        } catch {
            // Animation file not found — that's fine
        }
    }

    console.log(`[Character] Available animations:`, Object.keys(animations));

    // Play idle if available, otherwise first animation
    const idleAction = animations['idle'] || animations[Object.keys(animations)[0]];
    if (idleAction) {
        idleAction.play();
    }

    // Start hidden (first-person mode)
    model.visible = false;

    return { model, mixer, animations };
}
