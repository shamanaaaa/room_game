import * as THREE from 'three';
import { playGunshot, playRifleShot, playHeadshot, playHitConfirm } from './audio.js';
import {
    ARM_X_THRESHOLD, PLAYER_HEIGHT,
    MUZZLE_FLASH_MS, TRACER_MS, DECAL_LIFETIME_MS,
    WEAPONS,
} from './constants.js';

export class Weapon {
    constructor(camera, scene, collisionMeshes, remoteManager) {
        this.camera = camera;
        this.scene = scene;
        this.collisionMeshes = collisionMeshes || [];
        this.remoteManager = remoteManager;

        // Weapon configs
        this._configs = WEAPONS;
        this._currentKey = 'pistol';
        this._cfg = this._configs[this._currentKey];

        this.ammo = this._cfg.magazineSize;
        this.reloading = false;
        this._lastFireTime = 0;
        this._recoilOffset = 0;
        this._holdingFire = false;

        // Cleanup lists
        this._tracers = [];
        this._decals = [];
        this._flashes = [];

        // Raycaster
        this._raycaster = new THREE.Raycaster();
        this._raycaster.far = 50;

        // HUD refs
        this._ammoEl = null;
        this._reloadEl = null;
        this._weaponNameEl = null;

        // Build weapon models
        this._gunModels = {
            pistol: this._buildPistolModel(),
            ak47: this._buildAK47Model(),
        };

        // Attach current weapon
        this._gunGroup = this._gunModels[this._currentKey];
        this.camera.add(this._gunGroup);

        // Callbacks
        this.onFire = null;
        this.onWeaponSwitch = null;
    }

    setHUD(ammoEl, reloadEl, weaponNameEl) {
        this._ammoEl = ammoEl;
        this._reloadEl = reloadEl;
        this._weaponNameEl = weaponNameEl;
        this._updateAmmoHUD();
        this._updateWeaponHUD();
    }

    get currentWeaponKey() {
        return this._currentKey;
    }

    switchWeapon(key) {
        if (key === this._currentKey) return;
        if (!this._configs[key]) return;
        if (this.reloading) return;

        // Remove current model
        this.camera.remove(this._gunGroup);

        this._currentKey = key;
        this._cfg = this._configs[key];
        this._gunGroup = this._gunModels[key];
        this.camera.add(this._gunGroup);

        // Reset ammo for new weapon
        this.ammo = this._cfg.magazineSize;
        this.reloading = false;
        this._lastFireTime = 0;
        this._recoilOffset = 0;

        this._updateAmmoHUD();
        this._updateWeaponHUD();
        if (this._reloadEl) this._reloadEl.style.display = 'none';

        if (this.onWeaponSwitch) this.onWeaponSwitch(key);
    }

    _buildPistolModel() {
        const group = new THREE.Group();

        const barrelMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
        const gripMat = new THREE.MeshStandardMaterial({ color: 0x5c3a1e });
        const guardMat = new THREE.MeshStandardMaterial({ color: 0x222222 });

        const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.003, 0.012), barrelMat);
        barrel.position.set(0, 0, -0.006);
        group.add(barrel);

        const slide = new THREE.Mesh(new THREE.BoxGeometry(0.0035, 0.002, 0.013), barrelMat);
        slide.position.set(0, 0.0025, -0.006);
        group.add(slide);

        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.008, 0.005), gripMat);
        grip.position.set(0, -0.005, 0.001);
        grip.rotation.x = 0.15;
        group.add(grip);

        const guard = new THREE.Mesh(new THREE.BoxGeometry(0.001, 0.003, 0.004), guardMat);
        guard.position.set(0, -0.003, -0.002);
        group.add(guard);

        const muzzle = new THREE.Object3D();
        muzzle.position.set(0, 0.001, -0.013);
        group.add(muzzle);
        group._muzzlePoint = muzzle;

        group.position.set(0.001, -0.02, -0.03);
        return group;
    }

    _buildAK47Model() {
        const group = new THREE.Group();

        const metalMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a });
        const woodMat = new THREE.MeshStandardMaterial({ color: 0x6b3a1f });
        const darkMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });

        // Long barrel
        const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.003, 0.028), metalMat);
        barrel.position.set(0, 0, -0.014);
        group.add(barrel);

        // Upper receiver
        const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.004, 0.016), metalMat);
        receiver.position.set(0, 0.001, -0.003);
        group.add(receiver);

        // Magazine (banana mag)
        const mag = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.012, 0.004), darkMat);
        mag.position.set(0, -0.006, -0.003);
        mag.rotation.x = 0.2;
        group.add(mag);

        // Wooden handguard
        const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.0045, 0.004, 0.012), woodMat);
        handguard.position.set(0, -0.001, -0.014);
        group.add(handguard);

        // Grip
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.008, 0.004), woodMat);
        grip.position.set(0, -0.006, 0.003);
        grip.rotation.x = 0.2;
        group.add(grip);

        // Stock
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.004, 0.012), woodMat);
        stock.position.set(0, 0.0, 0.012);
        group.add(stock);

        // Muzzle point
        const muzzle = new THREE.Object3D();
        muzzle.position.set(0, 0.001, -0.029);
        group.add(muzzle);
        group._muzzlePoint = muzzle;

        // Position: slightly lower and more centered than pistol
        group.position.set(0.004, -0.022, -0.03);
        return group;
    }

    fire() {
        if (this.reloading) return null;
        if (this.ammo <= 0) {
            this.reload();
            return null;
        }

        const now = performance.now();
        if (now - this._lastFireTime < this._cfg.fireRateMs) return null;
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
                this._createDecal(hitPoint, closest.face.normal);
            }
        }

        // Muzzle flash + sound
        this._createMuzzleFlash();
        if (this._currentKey === 'ak47') {
            playRifleShot();
        } else {
            playGunshot();
        }

        // Tracer line
        const muzzleWorld = new THREE.Vector3();
        this._gunGroup._muzzlePoint.getWorldPosition(muzzleWorld);
        const tracerEnd = hitPoint || muzzleWorld.clone().add(
            this._raycaster.ray.direction.clone().multiplyScalar(50)
        );
        this._createTracer(muzzleWorld, tracerEnd);

        // Camera recoil
        this._recoilOffset += this._cfg.recoilAmount;

        // Auto-reload if empty
        if (this.ammo <= 0) {
            setTimeout(() => this.reload(), 300);
        }

        if (this.onFire) this.onFire(hitInfo);
        return hitInfo;
    }

    // For auto weapons — call from mousedown/mouseup
    startFiring() {
        this._holdingFire = true;
    }

    stopFiring() {
        this._holdingFire = false;
    }

    reload() {
        if (this.reloading || this.ammo === this._cfg.magazineSize) return;

        this.reloading = true;
        if (this._reloadEl) this._reloadEl.style.display = 'block';

        setTimeout(() => {
            this.ammo = this._cfg.magazineSize;
            this.reloading = false;
            this._updateAmmoHUD();
            if (this._reloadEl) this._reloadEl.style.display = 'none';
        }, this._cfg.reloadTimeMs);
    }

    setThirdPerson(enabled) {
        this._gunGroup.visible = !enabled;
    }

    update(delta) {
        const now = performance.now();

        // Auto-fire for automatic weapons
        if (this._holdingFire && this._cfg.auto) {
            this.fire();
        }

        // Recoil recovery
        if (this._recoilOffset > 0) {
            this._recoilOffset -= this._cfg.recoilRecovery * delta;
            if (this._recoilOffset < 0) this._recoilOffset = 0;
        }
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
            this._ammoEl.textContent = `${this.ammo} / ${this._cfg.magazineSize}`;
        }
    }

    _updateWeaponHUD() {
        if (this._weaponNameEl) {
            this._weaponNameEl.textContent = `${this._cfg.slot} ${this._cfg.name}`;
        }
    }

    _createMuzzleFlash() {
        const muzzleWorld = new THREE.Vector3();
        this._gunGroup._muzzlePoint.getWorldPosition(muzzleWorld);

        const light = new THREE.PointLight(0xffaa00, 2, 0.3);
        light.position.copy(muzzleWorld);
        this.scene.add(light);

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
        mesh.position.addScaledVector(normal, 0.0005);
        mesh.lookAt(point.clone().add(normal));
        this.scene.add(mesh);
        this._decals.push({ mesh, createdAt: performance.now() });
    }

    _getHitZone(hitPoint, modelGroup) {
        const modelPos = modelGroup.position;
        const heightAboveFeet = hitPoint.y - modelPos.y;
        const heightPct = Math.max(0, Math.min(1, heightAboveFeet / PLAYER_HEIGHT));

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

        return { zone, damage: Math.round(this._cfg.baseDamage * multiplier) };
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

    createRemoteTracer(fromPos, toPos) {
        const from = new THREE.Vector3(fromPos.x, fromPos.y, fromPos.z);
        const to = new THREE.Vector3(toPos.x, toPos.y, toPos.z);
        this._createTracer(from, to);
    }

    dispose() {
        this.camera.remove(this._gunGroup);
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
