import * as THREE from 'three';
import { playGunshot, playRifleShot, playSniperShot, playRocketLaunch, playExplosion, playHeadshot, playHitConfirm } from './audio.js';
import {
    ARM_X_THRESHOLD, PLAYER_HEIGHT,
    MUZZLE_FLASH_MS, TRACER_MS, DECAL_LIFETIME_MS,
    WEAPONS, DEFAULT_FOV, ZOOM_TRANSITION_SPEED,
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

        // Per-weapon ammo storage (current mag) + reserve magazines
        this._ammoStore = {};
        this._magStore = {};
        for (const [key, cfg] of Object.entries(WEAPONS)) {
            this._ammoStore[key] = cfg.magazineSize;  // current mag is full
            this._magStore[key] = cfg.startMagazines;  // reserve mags
        }
        this.ammo = this._ammoStore[this._currentKey];
        this.magazines = this._magStore[this._currentKey];
        this.reloading = false;
        this._lastFireTime = 0;
        this._recoilOffset = 0;
        this._holdingFire = false;

        // Cleanup lists
        this._tracers = [];
        this._decals = [];
        this._flashes = [];
        this._rockets = [];
        this._explosions = [];

        // Player ref for self-damage
        this._playerPosition = null;
        this._combatRef = null;

        // Raycaster
        this._raycaster = new THREE.Raycaster();
        this._raycaster.far = 50;

        // Zoom / ADS state
        this._zoomed = false;
        this._currentFov = DEFAULT_FOV;
        this._scopeOverlayEl = null;

        // HUD refs
        this._ammoEl = null;
        this._reloadEl = null;
        this._weaponNameEl = null;

        // Build weapon models
        this._gunModels = {
            pistol: this._buildPistolModel(),
            ak47: this._buildAK47Model(),
            sniper: this._buildSniperModel(),
            bazooka: this._buildBazookaModel(),
        };

        // Attach current weapon
        this._gunGroup = this._gunModels[this._currentKey];
        this.camera.add(this._gunGroup);

        // Callbacks
        this.onFire = null;
        this.onWeaponSwitch = null;
    }

    setHUD(ammoEl, reloadEl, weaponNameEl, scopeOverlayEl) {
        this._ammoEl = ammoEl;
        this._reloadEl = reloadEl;
        this._weaponNameEl = weaponNameEl;
        this._scopeOverlayEl = scopeOverlayEl;
        this._updateAmmoHUD();
        this._updateWeaponHUD();
    }

    setPlayerRefs(playerPosition, combat) {
        this._playerPosition = playerPosition;
        this._combatRef = combat;
    }

    get currentWeaponKey() {
        return this._currentKey;
    }

    addMagazine(weaponKey) {
        if (!this._configs[weaponKey]) return false;
        const max = this._configs[weaponKey].maxMagazines;
        if (this._magStore[weaponKey] >= max) return false; // already full
        this._magStore[weaponKey]++;
        if (weaponKey === this._currentKey) {
            this.magazines = this._magStore[weaponKey];
            this._updateAmmoHUD();
        }
        return true;
    }

    toggleZoom() {
        if (!this._cfg.zoomFov) return; // only weapons with zoom
        this._zoomed = !this._zoomed;
    }

    unzoom() {
        this._zoomed = false;
    }

    get isZoomed() {
        return this._zoomed;
    }

    switchWeapon(key) {
        if (key === this._currentKey) return;
        if (!this._configs[key]) return;
        if (this.reloading) return;

        // Unzoom when switching
        this.unzoom();

        // Save current ammo + mags
        this._ammoStore[this._currentKey] = this.ammo;
        this._magStore[this._currentKey] = this.magazines;

        // Remove current model
        this.camera.remove(this._gunGroup);

        this._currentKey = key;
        this._cfg = this._configs[key];
        this._gunGroup = this._gunModels[key];
        this.camera.add(this._gunGroup);

        // Restore ammo + mags for switched weapon
        this.ammo = this._ammoStore[key];
        this.magazines = this._magStore[key];
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

    _buildBazookaModel() {
        const group = new THREE.Group();

        const tubeMat = new THREE.MeshStandardMaterial({ color: 0x3a5a3a });
        const darkMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a });
        const gripMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });

        // Main tube
        const tube = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.005, 0.04), tubeMat);
        tube.position.set(0, 0, -0.01);
        group.add(tube);

        // Front flare
        const flare = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.007, 0.003), darkMat);
        flare.position.set(0, 0, -0.031);
        group.add(flare);

        // Rear opening
        const rear = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.006, 0.003), darkMat);
        rear.position.set(0, 0, 0.01);
        group.add(rear);

        // Sight
        const sight = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.004, 0.003), darkMat);
        sight.position.set(0, 0.005, -0.015);
        group.add(sight);

        // Grip
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.009, 0.004), gripMat);
        grip.position.set(0, -0.006, -0.003);
        grip.rotation.x = 0.15;
        group.add(grip);

        // Front grip
        const fGrip = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.006, 0.003), gripMat);
        fGrip.position.set(0, -0.004, -0.018);
        group.add(fGrip);

        // Muzzle point
        const muzzle = new THREE.Object3D();
        muzzle.position.set(0, 0, -0.033);
        group.add(muzzle);
        group._muzzlePoint = muzzle;

        group.position.set(0.005, -0.02, -0.03);
        return group;
    }

    _buildSniperModel() {
        const group = new THREE.Group();

        const metalMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a });
        const darkMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
        const woodMat = new THREE.MeshStandardMaterial({ color: 0x4a2a10 });
        const scopeMat = new THREE.MeshStandardMaterial({ color: 0x111111 });

        // Long barrel
        const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.002, 0.04), metalMat);
        barrel.position.set(0, 0, -0.02);
        group.add(barrel);

        // Upper receiver / action
        const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.004, 0.018), metalMat);
        receiver.position.set(0, 0.001, -0.002);
        group.add(receiver);

        // Scope body (cylinder-ish using box)
        const scopeBody = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.003, 0.016), scopeMat);
        scopeBody.position.set(0, 0.005, -0.005);
        group.add(scopeBody);

        // Scope front lens
        const lensFront = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.004, 0.001), scopeMat);
        lensFront.position.set(0, 0.005, -0.013);
        group.add(lensFront);

        // Scope rear lens
        const lensRear = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.004, 0.001), scopeMat);
        lensRear.position.set(0, 0.005, 0.003);
        group.add(lensRear);

        // Magazine
        const mag = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.008, 0.004), darkMat);
        mag.position.set(0, -0.005, -0.002);
        group.add(mag);

        // Stock (wooden)
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.005, 0.016), woodMat);
        stock.position.set(0, -0.001, 0.014);
        group.add(stock);

        // Grip
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.007, 0.004), woodMat);
        grip.position.set(0, -0.005, 0.004);
        grip.rotation.x = 0.2;
        group.add(grip);

        // Bipod legs (two thin boxes)
        const bipodMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
        const legL = new THREE.Mesh(new THREE.BoxGeometry(0.001, 0.006, 0.001), bipodMat);
        legL.position.set(-0.003, -0.004, -0.018);
        legL.rotation.x = 0.3;
        group.add(legL);

        const legR = new THREE.Mesh(new THREE.BoxGeometry(0.001, 0.006, 0.001), bipodMat);
        legR.position.set(0.003, -0.004, -0.018);
        legR.rotation.x = 0.3;
        group.add(legR);

        // Muzzle point
        const muzzle = new THREE.Object3D();
        muzzle.position.set(0, 0.001, -0.041);
        group.add(muzzle);
        group._muzzlePoint = muzzle;

        // Position in view
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
        this._ammoStore[this._currentKey] = this.ammo;
        this._updateAmmoHUD();

        // Camera recoil
        this._recoilOffset += this._cfg.recoilAmount;

        const muzzleWorld = new THREE.Vector3();
        this._gunGroup._muzzlePoint.getWorldPosition(muzzleWorld);

        // Projectile weapons (bazooka) — spawn a rocket instead of hitscan
        if (this._cfg.projectile) {
            this._fireProjectile(muzzleWorld);
            // Auto-reload if empty
            if (this.ammo <= 0) {
                setTimeout(() => this.reload(), 300);
            }
            return { hit: false };
        }

        // ── Hitscan weapons ──
        this._raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);

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
        if (this._currentKey === 'sniper') {
            playSniperShot();
        } else if (this._currentKey === 'ak47') {
            playRifleShot();
        } else {
            playGunshot();
        }

        // Tracer line
        const tracerEnd = hitPoint || muzzleWorld.clone().add(
            this._raycaster.ray.direction.clone().multiplyScalar(50)
        );
        this._createTracer(muzzleWorld, tracerEnd);

        // Auto-reload if empty
        if (this.ammo <= 0) {
            setTimeout(() => this.reload(), 300);
        }

        if (this.onFire) this.onFire(hitInfo);
        return hitInfo;
    }

    _fireProjectile(muzzleWorld) {
        const direction = new THREE.Vector3();
        this.camera.getWorldDirection(direction);

        // Rocket mesh — small cylinder with cone tip
        const rocketGroup = new THREE.Group();

        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x555555 });
        const tipMat = new THREE.MeshStandardMaterial({ color: 0xcc3333 });
        const flameMat = new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.8 });

        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.01, 6), bodyMat);
        body.rotation.x = Math.PI / 2;
        rocketGroup.add(body);

        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.002, 0.004, 6), tipMat);
        tip.rotation.x = -Math.PI / 2;
        tip.position.z = -0.007;
        rocketGroup.add(tip);

        // Flame trail
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.003, 0.008, 6), flameMat);
        flame.rotation.x = Math.PI / 2;
        flame.position.z = 0.008;
        rocketGroup.add(flame);

        // Trail light
        const light = new THREE.PointLight(0xff4400, 1, 0.2);
        light.position.z = 0.005;
        rocketGroup.add(light);

        rocketGroup.position.copy(muzzleWorld);
        rocketGroup.lookAt(muzzleWorld.clone().add(direction));

        this.scene.add(rocketGroup);

        playRocketLaunch();

        this._rockets.push({
            mesh: rocketGroup,
            direction: direction.clone(),
            speed: this._cfg.projectileSpeed,
            createdAt: performance.now(),
            flame,
        });
    }

    _explode(position) {
        playExplosion();

        const radius = this._cfg.explosionRadius || 0.15;

        // Visual explosion — expanding fireball
        const explosionGroup = new THREE.Group();

        // Core fireball
        const coreMat = new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.9 });
        const core = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.3, 8, 8), coreMat);
        explosionGroup.add(core);

        // Outer blast
        const outerMat = new THREE.MeshBasicMaterial({ color: 0xff3300, transparent: true, opacity: 0.5 });
        const outer = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.6, 8, 8), outerMat);
        explosionGroup.add(outer);

        // Smoke ring
        const smokeMat = new THREE.MeshBasicMaterial({ color: 0x333333, transparent: true, opacity: 0.4 });
        const smoke = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.8, 8, 8), smokeMat);
        explosionGroup.add(smoke);

        // Flash light
        const light = new THREE.PointLight(0xff6600, 3, radius * 3);
        explosionGroup.add(light);

        explosionGroup.position.copy(position);
        this.scene.add(explosionGroup);

        this._explosions.push({
            group: explosionGroup,
            core, outer, smoke, light,
            createdAt: performance.now(),
            duration: this._cfg.explosionDuration || 400,
            radius,
        });

        // Splash damage to remote players
        if (this.remoteManager) {
            const playerMeshes = this.remoteManager.getHittableObjects();
            for (const p of playerMeshes) {
                const dist = position.distanceTo(p.mesh.position);
                if (dist < radius) {
                    const falloff = 1 - (dist / radius);
                    const damage = Math.round(this._cfg.baseDamage * falloff);
                    const hitInfo = {
                        hit: true,
                        type: 'player',
                        targetId: p.id,
                        damage,
                        zone: 'body',
                        point: { x: position.x, y: position.y, z: position.z },
                    };
                    this.remoteManager.flashPlayer(p.id);
                    this._showHitMarker('body');
                    playHitConfirm();
                    if (this.onFire) this.onFire(hitInfo);
                }
            }
        }

        // Self-damage
        if (this._playerPosition && this._combatRef && this._combatRef.alive) {
            const selfDist = position.distanceTo(this._playerPosition);
            if (selfDist < radius) {
                const falloff = 1 - (selfDist / radius);
                const selfDmg = Math.round(this._cfg.baseDamage * (this._cfg.selfDamageMultiplier || 0.5) * falloff);
                if (selfDmg > 0) this._combatRef.takeDamage(selfDmg);
            }
        }
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
        if (this.magazines <= 0) return; // no reserve mags

        this.unzoom();
        this.reloading = true;
        if (this._reloadEl) this._reloadEl.style.display = 'block';

        setTimeout(() => {
            this.magazines--;
            this._magStore[this._currentKey] = this.magazines;
            this.ammo = this._cfg.magazineSize;
            this._ammoStore[this._currentKey] = this.ammo;
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

        // Zoom FOV transition
        const targetFov = (this._zoomed && this._cfg.zoomFov) ? this._cfg.zoomFov : DEFAULT_FOV;
        if (Math.abs(this._currentFov - targetFov) > 0.1) {
            this._currentFov += (targetFov - this._currentFov) * Math.min(1, ZOOM_TRANSITION_SPEED * delta);
            this.camera.fov = this._currentFov;
            this.camera.updateProjectionMatrix();
        }

        // Show/hide scope overlay and gun model when zoomed
        const fullyZoomed = this._zoomed && this._currentFov < targetFov + 5;
        if (this._scopeOverlayEl) {
            this._scopeOverlayEl.style.display = fullyZoomed ? 'block' : 'none';
        }
        // Hide gun model when zoomed into scope
        if (this._cfg.zoomFov) {
            this._gunGroup.visible = !this._zoomed;
        }

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

        // Update rockets
        for (let i = this._rockets.length - 1; i >= 0; i--) {
            const r = this._rockets[i];
            const move = r.direction.clone().multiplyScalar(r.speed * delta);
            r.mesh.position.add(move);

            // Flame flicker
            if (r.flame) {
                r.flame.scale.setScalar(0.8 + Math.random() * 0.4);
            }

            // Collision check — raycast forward from rocket position
            this._raycaster.set(r.mesh.position, r.direction);
            this._raycaster.far = r.speed * delta + 0.005;

            const targets = [...this.collisionMeshes];
            if (this.remoteManager) {
                const pm = this.remoteManager.getHittableObjects();
                targets.push(...pm.map(p => p.mesh));
            }

            const hits = this._raycaster.intersectObjects(targets, true);
            const tooOld = now - r.createdAt > 5000; // 5s max lifetime

            if (hits.length > 0 || tooOld) {
                const explodePos = hits.length > 0 ? hits[0].point.clone() : r.mesh.position.clone();
                this._explode(explodePos);
                this.scene.remove(r.mesh);
                r.mesh.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
                this._rockets.splice(i, 1);
            }
        }

        // Update explosions
        for (let i = this._explosions.length - 1; i >= 0; i--) {
            const e = this._explosions[i];
            const age = now - e.createdAt;
            const t = age / e.duration;

            if (t >= 1) {
                this.scene.remove(e.group);
                e.group.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
                this._explosions.splice(i, 1);
            } else {
                // Expand and fade
                const scale = 1 + t * 2;
                e.core.scale.setScalar(scale);
                e.outer.scale.setScalar(scale * 1.2);
                e.smoke.scale.setScalar(scale * 1.5);

                e.core.material.opacity = 0.9 * (1 - t);
                e.outer.material.opacity = 0.5 * (1 - t);
                e.smoke.material.opacity = 0.4 * (1 - t * 0.5);
                e.light.intensity = 3 * (1 - t);
            }
        }
    }

    _updateAmmoHUD() {
        if (this._ammoEl) {
            this._ammoEl.textContent = `${this.ammo} / ${this._cfg.magazineSize}  [${this.magazines}]`;
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
        for (const r of this._rockets) {
            this.scene.remove(r.mesh);
            r.mesh.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
        }
        for (const e of this._explosions) {
            this.scene.remove(e.group);
            e.group.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
        }
    }
}
