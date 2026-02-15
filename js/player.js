import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { playFootstep } from './audio.js';

// Player scale — 3 cm tall creature
const PLAYER_HEIGHT = 0.03;
const EYE_HEIGHT = 0.025;

// Movement
const WALK_SPEED = 0.25;   // m/s
const SPRINT_SPEED = 0.5; // m/s
const FLY_SPEED = 1.0;    // m/s
const FLY_SPRINT_SPEED = 3.0;
const FLY_VERTICAL_SPEED = 0.8; // m/s for up/down in fly mode

// Physics
const GRAVITY = 5.0;
const JUMP_VELOCITY = 2;

// Double-tap detection
const DOUBLE_TAP_MS = 300;

// Third-person camera
const TP_DISTANCE = 0.08;  // distance behind player
const TP_HEIGHT = 0.04;    // height above player

export class Player {
    /**
     * @param {THREE.Camera} camera
     * @param {HTMLElement} domElement
     * @param {object} roomBounds - { width, height, depth }
     * @param {object} [options]
     * @param {THREE.Mesh[]} [options.collisionMeshes] - meshes for raycast ground collision
     * @param {THREE.Vector3} [options.spawnPoint] - where to spawn
     */
    constructor(camera, domElement, roomBounds, options = {}) {
        this.camera = camera;
        this.roomBounds = roomBounds;
        this.collisionMeshes = options.collisionMeshes || null;

        // Pointer lock controls (handles mouse look)
        this.controls = new PointerLockControls(camera, domElement);

        // Player position (separate from camera in 3P mode)
        this.position = new THREE.Vector3();
        const spawn = options.spawnPoint || new THREE.Vector3(0, EYE_HEIGHT, 0);
        this.position.copy(spawn);
        this.camera.position.copy(spawn);

        // Yaw/pitch for mouse look (extracted from PointerLockControls)
        this._yaw = 0;
        this._pitch = 0;

        // Physics state
        this.velocityY = 0;
        this.onGround = false;

        // Flying mode (Minecraft-style)
        this.flying = false;
        this._lastSpaceTap = 0;

        // View mode
        this.thirdPerson = false;
        this.characterModel = null;
        this.mixer = null;
        this.animations = {};
        this._currentAnim = null;

        // Raycaster for ground detection (points down)
        this.groundRay = new THREE.Raycaster();
        this.groundRay.far = PLAYER_HEIGHT + 0.5;

        // Input state
        this.keys = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            jump: false,
            sprint: false,
            crouch: false,
        };

        // Weapon & combat
        this.weapon = null;
        this.combat = null;

        // Footstep audio
        this._footstepTimer = 0;

        // Callbacks (for HUD)
        this.onFlyToggle = null;
        this.onViewToggle = null;

        this._bindInput();
    }

    setWeapon(weapon) {
        this.weapon = weapon;
    }

    setCombat(combat) {
        this.combat = combat;
    }

    setCharacterModel(model, mixer, animations) {
        this.characterModel = model;
        this.mixer = mixer;
        this.animations = animations;
        // Hidden by default (first-person)
        if (model) model.visible = false;
    }

    getNetworkState() {
        const forward = new THREE.Vector3();
        this.camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();

        return {
            x: this.position.x,
            y: this.position.y,
            z: this.position.z,
            yaw: Math.atan2(forward.x, forward.z),
            anim: this._currentAnim,
            flying: this.flying,
            hp: this.combat ? this.combat.hp : 100,
            alive: this.combat ? this.combat.alive : true,
        };
    }

    _bindInput() {
        document.addEventListener('keydown', (e) => {
            if (!this.controls.isLocked) return;

            switch (e.code) {
                case 'KeyW': this.keys.forward = true; break;
                case 'KeyS': this.keys.backward = true; break;
                case 'KeyA': this.keys.left = true; break;
                case 'KeyD': this.keys.right = true; break;
                case 'ShiftLeft':
                case 'ShiftRight':
                    this.keys.sprint = true;
                    break;
                case 'KeyC':
                    this.keys.crouch = true;
                    break;
                case 'Space':
                    e.preventDefault();
                    this.keys.jump = true;
                    this._handleSpaceTap();
                    break;
                case 'KeyV':
                    this._toggleView();
                    break;
                case 'KeyR':
                    if (this.weapon) this.weapon.reload();
                    break;
            }
        });

        // Shooting (left mouse button)
        document.addEventListener('mousedown', (e) => {
            if (!this.controls.isLocked) return;
            if (e.button !== 0) return; // left click only
            if (this.combat && !this.combat.alive) return;
            if (this.weapon) this.weapon.fire();
        });

        document.addEventListener('keyup', (e) => {
            switch (e.code) {
                case 'KeyW': this.keys.forward = false; break;
                case 'KeyS': this.keys.backward = false; break;
                case 'KeyA': this.keys.left = false; break;
                case 'KeyD': this.keys.right = false; break;
                case 'ShiftLeft':
                case 'ShiftRight':
                    this.keys.sprint = false;
                    break;
                case 'KeyC':
                    this.keys.crouch = false;
                    break;
                case 'Space':
                    this.keys.jump = false;
                    break;
            }
        });
    }

    _handleSpaceTap() {
        const now = performance.now();
        if (now - this._lastSpaceTap < DOUBLE_TAP_MS) {
            this.flying = !this.flying;
            this.velocityY = 0;
            if (this.onFlyToggle) this.onFlyToggle(this.flying);
        }
        this._lastSpaceTap = now;
    }

    _toggleView() {
        this.thirdPerson = !this.thirdPerson;

        if (this.characterModel) {
            this.characterModel.visible = this.thirdPerson;
        }

        if (this.weapon) {
            this.weapon.setThirdPerson(this.thirdPerson);
        }

        if (!this.thirdPerson) {
            // Switching back to first-person: snap camera to player position
            this.camera.position.copy(this.position);
        }

        if (this.onViewToggle) this.onViewToggle(this.thirdPerson);
    }

    lock() {
        this.controls.lock();
    }

    get isLocked() {
        return this.controls.isLocked;
    }

    on(event, cb) {
        this.controls.addEventListener(event, cb);
    }

    update(delta) {
        if (!this.controls.isLocked) return;

        const dt = Math.min(delta, 0.1);

        // Update weapon effects
        if (this.weapon) this.weapon.update(dt);

        // Skip movement when dead
        if (this.combat && !this.combat.alive) return;

        // Update animation mixer
        if (this.mixer) {
            this.mixer.update(dt);
        }

        // In first-person, player position tracks camera (PointerLockControls moves camera directly)
        // In third-person, we move player position, then place camera behind

        if (this.thirdPerson) {
            this._updateThirdPerson(dt);
        } else {
            this._updateFirstPerson(dt);
        }

        // ── Wall collision (clamp inside room bounds) ──
        const margin = 0.005;
        const halfW = this.roomBounds.width / 2 - margin;
        const halfD = this.roomBounds.depth / 2 - margin;

        if (this.thirdPerson) {
            this.position.x = Math.max(-halfW, Math.min(halfW, this.position.x));
            this.position.z = Math.max(-halfD, Math.min(halfD, this.position.z));
            this._positionThirdPersonCamera();
        } else {
            this.camera.position.x = Math.max(-halfW, Math.min(halfW, this.camera.position.x));
            this.camera.position.z = Math.max(-halfD, Math.min(halfD, this.camera.position.z));
            this.position.copy(this.camera.position);
        }

        // Sync character model to player position
        this._syncCharacterModel();

        // Footstep sounds
        this._updateFootsteps(dt);
    }

    _updateFirstPerson(dt) {
        if (this.flying) {
            this._updateFlying(dt);
        } else {
            this._updateWalking(dt);
        }
    }

    _updateThirdPerson(dt) {
        // Get camera direction for movement (PointerLockControls still handles mouse)
        const forward = new THREE.Vector3();
        this.camera.getWorldDirection(forward);

        if (this.flying) {
            this._updateFlyingTP(dt, forward);
        } else {
            this._updateWalkingTP(dt, forward);
        }
    }

    _updateFlyingTP(dt, cameraForward) {
        const speed = this.keys.sprint ? FLY_SPRINT_SPEED : FLY_SPEED;

        const inputDir = new THREE.Vector2(0, 0);
        if (this.keys.forward)  inputDir.y += 1;
        if (this.keys.backward) inputDir.y -= 1;
        if (this.keys.left)     inputDir.x -= 1;
        if (this.keys.right)    inputDir.x += 1;

        if (inputDir.lengthSq() > 0) {
            inputDir.normalize();

            const forward = cameraForward.clone().normalize();
            const right = new THREE.Vector3();
            right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

            this.position.addScaledVector(forward, inputDir.y * speed * dt);
            this.position.addScaledVector(right, inputDir.x * speed * dt);
        }

        const vertSpeed = this.keys.sprint ? FLY_SPRINT_SPEED : FLY_VERTICAL_SPEED;
        if (this.keys.jump) this.position.y += vertSpeed * dt;
        if (this.keys.crouch) this.position.y -= vertSpeed * dt;

        this.position.y = Math.max(EYE_HEIGHT, Math.min(this.roomBounds.height - 0.005, this.position.y));
    }

    _updateWalkingTP(dt, cameraForward) {
        const speed = this.keys.sprint ? SPRINT_SPEED : WALK_SPEED;

        const inputDir = new THREE.Vector2(0, 0);
        if (this.keys.forward)  inputDir.y += 1;
        if (this.keys.backward) inputDir.y -= 1;
        if (this.keys.left)     inputDir.x -= 1;
        if (this.keys.right)    inputDir.x += 1;

        if (inputDir.lengthSq() > 0) {
            inputDir.normalize();

            const forward = cameraForward.clone();
            forward.y = 0;
            forward.normalize();

            const right = new THREE.Vector3();
            right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

            this.position.addScaledVector(forward, inputDir.y * speed * dt);
            this.position.addScaledVector(right, inputDir.x * speed * dt);
        }

        // Vertical physics
        if (this.keys.jump && this.onGround) {
            this.velocityY = JUMP_VELOCITY;
            this.onGround = false;
        }

        this.velocityY -= GRAVITY * dt;
        this.position.y += this.velocityY * dt;

        // Ground collision
        if (this.collisionMeshes && this.collisionMeshes.length > 0) {
            this._raycastGroundTP();
        } else {
            if (this.position.y <= EYE_HEIGHT) {
                this.position.y = EYE_HEIGHT;
                this.velocityY = 0;
                this.onGround = true;
            }
        }

        // Ceiling collision
        if (this.position.y >= this.roomBounds.height - 0.005) {
            this.position.y = this.roomBounds.height - 0.005;
            this.velocityY = Math.min(this.velocityY, 0);
        }
    }

    _positionThirdPersonCamera() {
        // Get camera look direction (yaw only, on XZ plane)
        const forward = new THREE.Vector3();
        this.camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();

        // Place camera behind and above the player (don't change rotation — PointerLockControls handles that)
        this.camera.position.set(
            this.position.x - forward.x * TP_DISTANCE,
            this.position.y + TP_HEIGHT,
            this.position.z - forward.z * TP_DISTANCE
        );
    }

    _syncCharacterModel() {
        if (!this.characterModel) return;

        // Position character at feet level
        this.characterModel.position.set(
            this.position.x,
            this.position.y - EYE_HEIGHT,
            this.position.z
        );

        // Rotate character to face camera forward direction (yaw only)
        if (this.thirdPerson) {
            const forward = new THREE.Vector3();
            this.camera.getWorldDirection(forward);
            forward.y = 0;
            forward.normalize();

            if (forward.lengthSq() > 0) {
                this.characterModel.rotation.y = Math.atan2(forward.x, forward.z);
            }
        }

        // Update animation based on movement state
        this._updateAnimation();
    }

    _updateFootsteps(dt) {
        const isMoving = this.keys.forward || this.keys.backward || this.keys.left || this.keys.right;
        if (!isMoving || this.flying || !this.onGround) {
            this._footstepTimer = 0;
            return;
        }
        const interval = this.keys.sprint ? 0.28 : 0.4;
        this._footstepTimer += dt;
        if (this._footstepTimer >= interval) {
            this._footstepTimer -= interval;
            playFootstep();
        }
    }

    _updateAnimation() {
        if (Object.keys(this.animations).length === 0) return;

        const isMoving = this.keys.forward || this.keys.backward || this.keys.left || this.keys.right;

        let targetAnim;
        if (this.flying) {
            targetAnim = 'fly';
        } else if (!this.onGround && this.velocityY > 0) {
            targetAnim = 'jump';
        } else if (isMoving && this.keys.sprint) {
            targetAnim = 'run';
        } else if (isMoving) {
            targetAnim = 'walk';
        } else {
            targetAnim = 'idle';
        }

        // Fall back to available animations
        if (!this.animations[targetAnim]) {
            if (targetAnim === 'run' && this.animations['walk']) targetAnim = 'walk';
            else if (targetAnim === 'walk' && this.animations['run']) targetAnim = 'run';
            else if (targetAnim === 'fly' && this.animations['idle']) targetAnim = 'idle';
            else if (targetAnim === 'jump' && this.animations['idle']) targetAnim = 'idle';
            else if (this.animations['idle']) targetAnim = 'idle';
            else if (!isMoving) {
                // No idle animation — stop all animations instead of playing wrong one
                if (this._currentAnim && this.animations[this._currentAnim]) {
                    this.animations[this._currentAnim].fadeOut(0.2);
                }
                this._currentAnim = null;
                return;
            }
            else targetAnim = Object.keys(this.animations)[0];
        }

        if (!this.animations[targetAnim] || targetAnim === this._currentAnim) return;

        // Crossfade to the new animation
        const newAction = this.animations[targetAnim];
        const oldAction = this._currentAnim ? this.animations[this._currentAnim] : null;

        newAction.reset().fadeIn(0.2).play();
        if (oldAction) {
            oldAction.fadeOut(0.2);
        }

        this._currentAnim = targetAnim;
    }

    _raycastGroundTP() {
        const origin = this.position.clone();
        origin.y += 0.01;

        this.groundRay.set(origin, new THREE.Vector3(0, -1, 0));
        const hits = this.groundRay.intersectObjects(this.collisionMeshes, false);

        if (hits.length > 0) {
            const groundY = hits[0].point.y + EYE_HEIGHT;
            if (this.position.y <= groundY) {
                this.position.y = groundY;
                this.velocityY = 0;
                this.onGround = true;
            }
        } else {
            if (this.position.y <= EYE_HEIGHT) {
                this.position.y = EYE_HEIGHT;
                this.velocityY = 0;
                this.onGround = true;
            }
        }
    }

    _updateFlying(dt) {
        const speed = this.keys.sprint ? FLY_SPRINT_SPEED : FLY_SPEED;

        const inputDir = new THREE.Vector2(0, 0);
        if (this.keys.forward)  inputDir.y += 1;
        if (this.keys.backward) inputDir.y -= 1;
        if (this.keys.left)     inputDir.x -= 1;
        if (this.keys.right)    inputDir.x += 1;

        if (inputDir.lengthSq() > 0) {
            inputDir.normalize();

            const forward = new THREE.Vector3();
            this.camera.getWorldDirection(forward);
            forward.normalize();

            const right = new THREE.Vector3();
            const up = new THREE.Vector3(0, 1, 0);
            right.crossVectors(forward, up).normalize();

            this.camera.position.addScaledVector(forward, inputDir.y * speed * dt);
            this.camera.position.addScaledVector(right, inputDir.x * speed * dt);
        }

        const vertSpeed = this.keys.sprint ? FLY_SPRINT_SPEED : FLY_VERTICAL_SPEED;
        if (this.keys.jump) {
            this.camera.position.y += vertSpeed * dt;
        }
        if (this.keys.crouch) {
            this.camera.position.y -= vertSpeed * dt;
        }

        this.camera.position.y = Math.max(EYE_HEIGHT, Math.min(this.roomBounds.height - 0.005, this.camera.position.y));
    }

    _updateWalking(dt) {
        const speed = this.keys.sprint ? SPRINT_SPEED : WALK_SPEED;

        const inputDir = new THREE.Vector2(0, 0);
        if (this.keys.forward)  inputDir.y += 1;
        if (this.keys.backward) inputDir.y -= 1;
        if (this.keys.left)     inputDir.x -= 1;
        if (this.keys.right)    inputDir.x += 1;

        if (inputDir.lengthSq() > 0) {
            inputDir.normalize();

            const forward = new THREE.Vector3();
            this.camera.getWorldDirection(forward);
            forward.y = 0;
            forward.normalize();

            const right = new THREE.Vector3();
            right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

            this.camera.position.addScaledVector(forward, inputDir.y * speed * dt);
            this.camera.position.addScaledVector(right, inputDir.x * speed * dt);
        }

        // Vertical physics
        if (this.keys.jump && this.onGround) {
            this.velocityY = JUMP_VELOCITY;
            this.onGround = false;
        }

        this.velocityY -= GRAVITY * dt;
        this.camera.position.y += this.velocityY * dt;

        // Ground collision
        if (this.collisionMeshes && this.collisionMeshes.length > 0) {
            this._raycastGround();
        } else {
            if (this.camera.position.y <= EYE_HEIGHT) {
                this.camera.position.y = EYE_HEIGHT;
                this.velocityY = 0;
                this.onGround = true;
            }
        }

        // Ceiling collision
        if (this.camera.position.y >= this.roomBounds.height - 0.005) {
            this.camera.position.y = this.roomBounds.height - 0.005;
            this.velocityY = Math.min(this.velocityY, 0);
        }
    }

    _raycastGround() {
        const origin = this.camera.position.clone();
        origin.y += 0.01;

        this.groundRay.set(origin, new THREE.Vector3(0, -1, 0));

        const hits = this.groundRay.intersectObjects(this.collisionMeshes, false);

        if (hits.length > 0) {
            const groundY = hits[0].point.y + EYE_HEIGHT;

            if (this.camera.position.y <= groundY) {
                this.camera.position.y = groundY;
                this.velocityY = 0;
                this.onGround = true;
            }
        } else {
            if (this.camera.position.y <= EYE_HEIGHT) {
                this.camera.position.y = EYE_HEIGHT;
                this.velocityY = 0;
                this.onGround = true;
            }
        }
    }
}
