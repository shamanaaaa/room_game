import * as THREE from 'three';
import { playGunshot, playHeadshot, playHitConfirm } from './audio.js';

const MAGAZINE_SIZE = 12;
const FIRE_RATE_MS = 200;
const RELOAD_TIME_MS = 1500;
const BASE_DAMAGE = 25;
const MUZZLE_FLASH_MS = 50;

// Body zone damage multipliers (character height = 0.03)
const BODY_ZONES = [
    { name: 'head',  minPct: 0.80, maxPct: 1.00, multiplier: 2.0 },  // top 20% → 50 dmg
    { name: 'body',  minPct: 0.45, maxPct: 0.80, multiplier: 1.0 },  // mid 35% → 25 dmg
    { name: 'arms',  minPct: 0.45, maxPct: 0.80, multiplier: 0.75 }, // same zone, checked via X offset
    { name: 'legs',  minPct: 0.00, maxPct: 0.45, multiplier: 0.5 },  // bottom 45% → 12 dmg
];
const ARM_X_THRESHOLD = 0.006; // world-space X offset from model center to count as arm hit
const PLAYER_HEIGHT = 0.03;
const TRACER_MS = 200;
const DECAL_LIFETIME_MS = 3000;
const RECOIL_AMOUNT = 0.015; // radians
const RECOIL_RECOVERY = 8.0; // per second

export class Weapon {
    constructor(camera, scene, collisionMeshes, remoteManager) {
        this.camera = camera;
        this.scene = scene;
        this.collisionMeshes = collisionMeshes || [];
        this.remoteManager = remoteManager;

        this.ammo = MAGAZINE_SIZE;
        this.reloading = false;
        this._lastFireTime = 0;
        this._recoilOffset = 0;

        // Cleanup lists
        this._tracers = []; // { line, createdAt }
        this._decals = []; // { mesh, createdAt }
        this._flashes = []; // { light, sprite, createdAt }

        // Raycaster
        this._raycaster = new THREE.Raycaster();
        this._raycaster.far = 50;

        // HUD refs (set later)
        this._ammoEl = null;
        this._reloadEl = null;

        // Build the procedural pistol model
        this._gunGroup = this._buildPistolModel();
        this.camera.add(this._gunGroup);

        // Callbacks
        this.onFire = null; // called with hit info for network sync
    }

    setHUD(ammoEl, reloadEl) {
        this._ammoEl = ammoEl;
        this._reloadEl = reloadEl;
        this._updateAmmoHUD();
    }

    _buildPistolModel() {
        const group = new THREE.Group();

        // Materials
        const barrelMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
        const gripMat = new THREE.MeshStandardMaterial({ color: 0x5c3a1e });
        const guardMat = new THREE.MeshStandardMaterial({ color: 0x222222 });

        // Barrel (elongated box)
        const barrel = new THREE.Mesh(
            new THREE.BoxGeometry(0.003, 0.003, 0.012),
            barrelMat
        );
        barrel.position.set(0, 0, -0.006);
        group.add(barrel);

        // Slide (top part, slightly wider)
        const slide = new THREE.Mesh(
            new THREE.BoxGeometry(0.0035, 0.002, 0.013),
            barrelMat
        );
        slide.position.set(0, 0.0025, -0.006);
        group.add(slide);

        // Grip (angled box)
        const grip = new THREE.Mesh(
            new THREE.BoxGeometry(0.003, 0.008, 0.005),
            gripMat
        );
        grip.position.set(0, -0.005, 0.001);
        grip.rotation.x = 0.15;
        group.add(grip);

        // Trigger guard
        const guard = new THREE.Mesh(
            new THREE.BoxGeometry(0.001, 0.003, 0.004),
            guardMat
        );
        guard.position.set(0, -0.003, -0.002);
        group.add(guard);

        // Muzzle point (invisible, used for flash position)
        const muzzlePoint = new THREE.Object3D();
        muzzlePoint.position.set(0, 0.001, -0.013);
        group.add(muzzlePoint);
        this._muzzlePoint = muzzlePoint;

        // Position: bottom-right of screen in first-person
        group.position.set(0.001, -0.02, -0.03);
        group.rotation.set(0, 0, 0);

        return group;
    }

    fire() {
        if (this.reloading) return null;
        if (this.ammo <= 0) {
            this.reload();
            return null;
        }

        const now = performance.now();
        if (now - this._lastFireTime < FIRE_RATE_MS) return null;
        this._lastFireTime = now;

        this.ammo--;
        this._updateAmmoHUD();

        // Raycast from camera center
        this._raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);

        // Gather all hittable objects
        const targets = [...this.collisionMeshes];
        let playerMeshes = [];
        if (this.remoteManager) {
            playerMeshes = this.remoteManager.getHittableObjects();
            // Force world matrix update on the model (parent) so hitbox world position is correct
            for (const p of playerMeshes) {
                if (p.mesh.parent) p.mesh.parent.updateMatrixWorld(true);
            }
            targets.push(...playerMeshes.map(p => p.mesh));
        }

        const hits = this._raycaster.intersectObjects(targets, true);

        let hitInfo = { hit: false };
        let hitPoint = null;

        if (hits.length > 0) {
            const closest = hits[0];
            hitPoint = closest.point.clone();

            // Check if we hit a player
            const hitPlayerEntry = playerMeshes.find(p => {
                let obj = closest.object;
                while (obj) {
                    if (obj === p.mesh) return true;
                    obj = obj.parent;
                }
                return false;
            });

            if (hitPlayerEntry) {
                const { zone, damage } = this._getHitZone(hitPoint, hitPlayerEntry.mesh);
                hitInfo = {
                    hit: true,
                    type: 'player',
                    targetId: hitPlayerEntry.id,
                    damage,
                    zone,
                    point: { x: hitPoint.x, y: hitPoint.y, z: hitPoint.z },
                };
                this.remoteManager.flashPlayer(hitPlayerEntry.id);
                this._showHitMarker(zone);
                if (zone === 'head') {
                    playHeadshot();
                } else {
                    playHitConfirm();
                }
            } else {
                hitInfo = {
                    hit: true,
                    type: 'wall',
                    point: { x: hitPoint.x, y: hitPoint.y, z: hitPoint.z },
                };
                // Create impact decal
                this._createDecal(hitPoint, closest.face.normal);
            }
        }

        // Muzzle flash + sound
        this._createMuzzleFlash();
        playGunshot();

        // Tracer line
        const muzzleWorld = new THREE.Vector3();
        this._muzzlePoint.getWorldPosition(muzzleWorld);
        const tracerEnd = hitPoint || muzzleWorld.clone().add(
            this._raycaster.ray.direction.clone().multiplyScalar(50)
        );
        this._createTracer(muzzleWorld, tracerEnd);

        // Camera recoil
        this._recoilOffset += RECOIL_AMOUNT;

        // Auto-reload if empty
        if (this.ammo <= 0) {
            setTimeout(() => this.reload(), 300);
        }

        // Fire callback for network
        if (this.onFire) this.onFire(hitInfo);

        return hitInfo;
    }

    reload() {
        if (this.reloading || this.ammo === MAGAZINE_SIZE) return;

        this.reloading = true;
        if (this._reloadEl) this._reloadEl.style.display = 'block';

        setTimeout(() => {
            this.ammo = MAGAZINE_SIZE;
            this.reloading = false;
            this._updateAmmoHUD();
            if (this._reloadEl) this._reloadEl.style.display = 'none';
        }, RELOAD_TIME_MS);
    }

    setThirdPerson(enabled) {
        this._gunGroup.visible = !enabled;
    }

    update(delta) {
        const now = performance.now();

        // Recoil recovery
        if (this._recoilOffset > 0) {
            this._recoilOffset -= RECOIL_RECOVERY * delta;
            if (this._recoilOffset < 0) this._recoilOffset = 0;
        }
        // Apply recoil to gun model (visual only, not camera)
        this._gunGroup.rotation.x = -this._recoilOffset * 3;

        // Clean up tracers
        for (let i = this._tracers.length - 1; i >= 0; i--) {
            const t = this._tracers[i];
            const age = now - t.createdAt;
            if (age > TRACER_MS) {
                this.scene.remove(t.line);
                t.line.geometry.dispose();
                t.line.material.dispose();
                this._tracers.splice(i, 1);
            } else {
                t.line.material.opacity = 1 - age / TRACER_MS;
            }
        }

        // Clean up flashes
        for (let i = this._flashes.length - 1; i >= 0; i--) {
            const f = this._flashes[i];
            if (now - f.createdAt > MUZZLE_FLASH_MS) {
                this.scene.remove(f.light);
                this.scene.remove(f.sprite);
                f.sprite.material.dispose();
                this._flashes.splice(i, 1);
            }
        }

        // Clean up decals
        for (let i = this._decals.length - 1; i >= 0; i--) {
            const d = this._decals[i];
            const age = now - d.createdAt;
            if (age > DECAL_LIFETIME_MS) {
                this.scene.remove(d.mesh);
                d.mesh.geometry.dispose();
                d.mesh.material.dispose();
                this._decals.splice(i, 1);
            } else if (age > DECAL_LIFETIME_MS * 0.7) {
                d.mesh.material.opacity = 1 - (age - DECAL_LIFETIME_MS * 0.7) / (DECAL_LIFETIME_MS * 0.3);
            }
        }
    }

    _updateAmmoHUD() {
        if (this._ammoEl) {
            this._ammoEl.textContent = `${this.ammo} / ${MAGAZINE_SIZE}`;
        }
    }

    _createMuzzleFlash() {
        const muzzleWorld = new THREE.Vector3();
        this._muzzlePoint.getWorldPosition(muzzleWorld);

        // Point light
        const light = new THREE.PointLight(0xffaa00, 2, 0.3);
        light.position.copy(muzzleWorld);
        this.scene.add(light);

        // Sprite
        const spriteMat = new THREE.SpriteMaterial({
            color: 0xffcc00,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending,
        });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(0.005, 0.005, 1);
        sprite.position.copy(muzzleWorld);
        this.scene.add(sprite);

        this._flashes.push({ light, sprite, createdAt: performance.now() });
    }

    _createTracer(from, to) {
        const geometry = new THREE.BufferGeometry().setFromPoints([from, to]);
        const material = new THREE.LineBasicMaterial({
            color: 0xffcc44,
            transparent: true,
            opacity: 1,
            blending: THREE.AdditiveBlending,
        });
        const line = new THREE.Line(geometry, material);
        this.scene.add(line);
        this._tracers.push({ line, createdAt: performance.now() });
    }

    _createDecal(point, normal) {
        const geometry = new THREE.CircleGeometry(0.002, 8);
        const material = new THREE.MeshBasicMaterial({
            color: 0x222222,
            transparent: true,
            opacity: 1,
            side: THREE.DoubleSide,
            depthWrite: false,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(point);

        // Offset slightly from surface to prevent z-fighting
        mesh.position.addScaledVector(normal, 0.0005);

        // Orient to face along the surface normal
        mesh.lookAt(point.clone().add(normal));

        this.scene.add(mesh);
        this._decals.push({ mesh, createdAt: performance.now() });
    }

    _getHitZone(hitPoint, modelGroup) {
        const modelPos = modelGroup.position;
        const heightAboveFeet = hitPoint.y - modelPos.y;
        const heightPct = Math.max(0, Math.min(1, heightAboveFeet / PLAYER_HEIGHT));

        // Check lateral offset for arm detection
        const dx = hitPoint.x - modelPos.x;
        const dz = hitPoint.z - modelPos.z;
        const lateralDist = Math.sqrt(dx * dx + dz * dz);

        let zone, multiplier;

        if (heightPct >= 0.80) {
            zone = 'head';
            multiplier = 2.0;
        } else if (heightPct >= 0.45) {
            if (lateralDist > ARM_X_THRESHOLD) {
                zone = 'arms';
                multiplier = 0.75;
            } else {
                zone = 'body';
                multiplier = 1.0;
            }
        } else {
            zone = 'legs';
            multiplier = 0.5;
        }

        return { zone, damage: Math.round(BASE_DAMAGE * multiplier) };
    }

    _showHitMarker(zone) {
        if (!this._hitMarkerEl) {
            this._hitMarkerEl = document.getElementById('hit-marker');
        }
        if (!this._hitMarkerEl) return;

        const colors = { head: '#ff4444', body: '#ffffff', arms: '#cccccc', legs: '#999999' };
        const labels = { head: 'HEADSHOT', body: 'BODY', arms: 'ARM', legs: 'LEG' };

        this._hitMarkerEl.textContent = labels[zone] || zone.toUpperCase();
        this._hitMarkerEl.style.color = colors[zone] || '#ffffff';
        this._hitMarkerEl.style.opacity = '1';
        this._hitMarkerEl.style.display = 'block';

        if (this._hitMarkerTimer) clearTimeout(this._hitMarkerTimer);
        this._hitMarkerTimer = setTimeout(() => {
            this._hitMarkerEl.style.opacity = '0';
        }, 600);
    }

    // Create a tracer from a remote player's shot (visual only)
    createRemoteTracer(fromPos, toPos) {
        const from = new THREE.Vector3(fromPos.x, fromPos.y, fromPos.z);
        const to = new THREE.Vector3(toPos.x, toPos.y, toPos.z);
        this._createTracer(from, to);
    }

    dispose() {
        this.camera.remove(this._gunGroup);
        // Clean up all effects
        for (const t of this._tracers) {
            this.scene.remove(t.line);
            t.line.geometry.dispose();
            t.line.material.dispose();
        }
        for (const f of this._flashes) {
            this.scene.remove(f.light);
            this.scene.remove(f.sprite);
            f.sprite.material.dispose();
        }
        for (const d of this._decals) {
            this.scene.remove(d.mesh);
            d.mesh.geometry.dispose();
            d.mesh.material.dispose();
        }
    }
}
