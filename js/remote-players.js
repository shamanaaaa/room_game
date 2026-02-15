import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { PLAYER_HEIGHT, LERP_FACTOR } from './constants.js';

const TARGET_HEIGHT = PLAYER_HEIGHT;
const LABEL_HEIGHT_OFFSET = PLAYER_HEIGHT + 0.01;
const ANIM_NAMES = ['idle', 'walk', 'run', 'jump', 'fly'];

function createNameSprite(name) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.font = 'bold 32px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(name || 'Player', 128, 32);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const mat = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(0.04, 0.01, 1);
    return sprite;
}

async function loadGLB(url) {
    const loader = new GLTFLoader();
    return new Promise((resolve, reject) =>
        loader.load(url, resolve, undefined, reject)
    );
}

function stripRootMotion(clip) {
    clip.tracks = clip.tracks.filter((track) => {
        if (track.name.endsWith('.position')) {
            const parts = track.name.split('.');
            if (parts.length === 2) return false;
        }
        return true;
    });
    return clip;
}

export class RemotePlayerManager {
    constructor(scene) {
        this.scene = scene;
        this.players = new Map(); // id → { model, mixer, animations, currentAnim, targetPos, targetYaw }
        this.templateModel = null;
        this.animClips = []; // shared animation clips
    }

    async loadTemplate() {
        const gltf = await loadGLB('/characters/idle.glb');
        this.templateModel = gltf.scene;

        // Scale to player height
        const box = new THREE.Box3().setFromObject(this.templateModel);
        const rawHeight = box.getSize(new THREE.Vector3()).y;
        if (rawHeight > 0) {
            const scale = TARGET_HEIGHT / rawHeight;
            this.templateModel.scale.setScalar(scale);
        }

        // Fix materials
        this.templateModel.traverse((child) => {
            if (child.isMesh) {
                const mats = Array.isArray(child.material) ? child.material : [child.material];
                for (const mat of mats) {
                    if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
                    mat.side = THREE.DoubleSide;
                }
            }
        });

        // Collect animation clips: embedded from idle.glb + separate files
        const embeddedClips = gltf.animations || [];
        if (embeddedClips.length > 0) {
            this.animClips.push({ name: 'idle', clip: stripRootMotion(embeddedClips[0]) });
            for (let i = 1; i < embeddedClips.length; i++) {
                this.animClips.push({ name: embeddedClips[i].name.toLowerCase(), clip: stripRootMotion(embeddedClips[i]) });
            }
        }

        for (const animName of ANIM_NAMES) {
            if (this.animClips.some(a => a.name === animName)) continue;
            try {
                const animGltf = await loadGLB(`/characters/${animName}.glb`);
                if (animGltf.animations && animGltf.animations.length > 0) {
                    this.animClips.push({ name: animName, clip: stripRootMotion(animGltf.animations[0]) });
                }
            } catch {
                // Animation file not found
            }
        }
    }

    _createRemotePlayer(id, state) {
        // Clone the template model (SkeletonUtils handles skinned meshes)
        const model = skeletonClone(this.templateModel);
        model.visible = true;

        const mixer = new THREE.AnimationMixer(model);
        const animations = {};

        for (const { name, clip } of this.animClips) {
            animations[name] = mixer.clipAction(clip);
        }

        // Play idle by default
        const idleAction = animations['idle'] || animations[Object.keys(animations)[0]];
        if (idleAction) idleAction.play();

        this.scene.add(model);

        // Name label sprite
        const nameSprite = createNameSprite(state.name);
        nameSprite.position.set(0, LABEL_HEIGHT_OFFSET, 0);
        model.add(nameSprite);

        const entry = {
            model,
            mixer,
            animations,
            currentAnim: 'idle',
            targetPos: new THREE.Vector3(state.x, state.y - 0.025, state.z), // feet level
            targetYaw: state.yaw || 0,
            nameSprite,
            currentName: state.name || 'Player',
        };

        // Set initial position
        model.position.copy(entry.targetPos);
        model.rotation.y = entry.targetYaw;

        this.players.set(id, entry);
        return entry;
    }

    updatePlayer(id, state) {
        if (!this.templateModel) return;

        let entry = this.players.get(id);
        if (!entry) {
            entry = this._createRemotePlayer(id, state);
        }

        // Update target position (feet level: y - EYE_HEIGHT)
        entry.targetPos.set(state.x, state.y - 0.025, state.z);
        entry.targetYaw = state.yaw || 0;

        // Update name label if changed
        const newName = state.name || 'Player';
        if (newName !== entry.currentName) {
            entry.model.remove(entry.nameSprite);
            entry.nameSprite.material.map.dispose();
            entry.nameSprite.material.dispose();
            entry.nameSprite = createNameSprite(newName);
            entry.nameSprite.position.set(0, LABEL_HEIGHT_OFFSET, 0);
            entry.model.add(entry.nameSprite);
            entry.currentName = newName;
        }

        // Switch animation if changed
        const newAnim = state.anim;
        if (newAnim && newAnim !== entry.currentAnim && entry.animations[newAnim]) {
            const newAction = entry.animations[newAnim];
            const oldAction = entry.currentAnim ? entry.animations[entry.currentAnim] : null;

            newAction.reset().fadeIn(0.2).play();
            if (oldAction) oldAction.fadeOut(0.2);

            entry.currentAnim = newAnim;
        }
    }

    removePlayer(id) {
        const entry = this.players.get(id);
        if (!entry) return;

        this.scene.remove(entry.model);
        entry.mixer.stopAllAction();
        this.players.delete(id);
        console.log(`[MP] Remote player removed: ${id}`);
    }

    update(delta) {
        for (const [, entry] of this.players) {
            // Interpolate position
            entry.model.position.lerp(entry.targetPos, LERP_FACTOR);

            // Interpolate rotation (yaw)
            const currentYaw = entry.model.rotation.y;
            let diff = entry.targetYaw - currentYaw;
            // Wrap around for shortest rotation path
            if (diff > Math.PI) diff -= Math.PI * 2;
            if (diff < -Math.PI) diff += Math.PI * 2;
            entry.model.rotation.y += diff * LERP_FACTOR;

            // Update animation mixer
            entry.mixer.update(delta);
        }
    }

    getHittableObjects() {
        const result = [];
        for (const [id, entry] of this.players) {
            result.push({ id, mesh: entry.model });
        }
        return result;
    }

    flashPlayer(id) {
        const entry = this.players.get(id);
        if (!entry) return;

        // Tint all meshes red briefly
        const originalColors = [];
        entry.model.traverse((child) => {
            if (child.isMesh) {
                const mats = Array.isArray(child.material) ? child.material : [child.material];
                for (const mat of mats) {
                    originalColors.push({ mat, color: mat.color.clone() });
                    mat.color.set(0xff3333);
                }
            }
        });

        setTimeout(() => {
            for (const { mat, color } of originalColors) {
                mat.color.copy(color);
            }
        }, 150);
    }

    get playerCount() {
        return this.players.size;
    }
}
