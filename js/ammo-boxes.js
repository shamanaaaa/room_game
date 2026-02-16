import * as THREE from 'three';
import { playAmmoPickup } from './audio.js';
import {
    AMMO_SPAWN_INTERVAL, AMMO_DROP_HEIGHT, AMMO_FALL_SPEED,
    AMMO_PICKUP_RADIUS, AMMO_BOX_SIZE, AMMO_LIFETIME,
    WEAPONS,
} from './constants.js';

const WEAPON_KEYS = Object.keys(WEAPONS);
const BOX_COLORS = { pistol: 0x4ecdc4, ak47: 0xe8b84e, sniper: 0xe55555, bazooka: 0x7b68ee };

export class AmmoBoxManager {
    constructor(scene, roomBounds, collisionMeshes) {
        this.scene = scene;
        this.roomBounds = roomBounds;
        this.collisionMeshes = collisionMeshes || [];
        this.boxes = []; // { group, weaponKey, landed, groundY, createdAt }

        this._groundRay = new THREE.Raycaster();
        this._groundRay.far = AMMO_DROP_HEIGHT + 2;

        this._spawnTimer = 0;
        this._pickupTextEl = document.getElementById('pickup-text');
        this._pickupTimer = null;
    }

    update(dt, playerPos) {
        const now = performance.now();

        // Spawn timer
        this._spawnTimer += dt * 1000;
        if (this._spawnTimer >= AMMO_SPAWN_INTERVAL) {
            this._spawnTimer = 0;
            this._spawnBox();
        }

        // Update each box
        for (let i = this.boxes.length - 1; i >= 0; i--) {
            const box = this.boxes[i];

            // Despawn after lifetime
            if (now - box.createdAt > AMMO_LIFETIME) {
                this._removeBox(i);
                continue;
            }

            // Falling
            if (!box.landed) {
                box.group.position.y -= AMMO_FALL_SPEED * dt;

                // Animate parachute sway
                box.group.rotation.y += dt * 1.5;
                const sway = Math.sin(now * 0.003 + box.swayOffset) * 0.1;
                box.group.children[1].rotation.z = sway; // parachute tilt

                // Check if landed
                if (box.group.position.y <= box.groundY) {
                    box.group.position.y = box.groundY;
                    box.landed = true;
                    // Remove parachute
                    box.group.remove(box.group.children[1]);
                }
            } else {
                // Gentle bob and glow pulse when on ground
                const bob = Math.sin(now * 0.004) * 0.002;
                box.group.position.y = box.groundY + bob;
            }

            // Pickup check (XZ only — player pos is at eye level, box is on ground)
            if (playerPos) {
                const dx = playerPos.x - box.group.position.x;
                const dz = playerPos.z - box.group.position.z;
                const dist = Math.sqrt(dx * dx + dz * dz);
                if (dist < AMMO_PICKUP_RADIUS) {
                    return this._pickup(i);
                }
            }
        }
        return null;
    }

    _spawnBox() {
        const weaponKey = WEAPON_KEYS[Math.floor(Math.random() * WEAPON_KEYS.length)];
        const color = BOX_COLORS[weaponKey] || 0xffffff;

        // Random XZ within 80% of bounds
        const hw = this.roomBounds.width / 2 * 0.8;
        const hd = this.roomBounds.depth / 2 * 0.8;
        const x = (Math.random() - 0.5) * 2 * hw;
        const z = (Math.random() - 0.5) * 2 * hd;

        // Raycast down to find ground
        const origin = new THREE.Vector3(x, AMMO_DROP_HEIGHT + 1, z);
        this._groundRay.set(origin, new THREE.Vector3(0, -1, 0));
        const hits = this._groundRay.intersectObjects(this.collisionMeshes, false);
        const groundY = hits.length > 0 ? hits[0].point.y + AMMO_BOX_SIZE / 2 : 0;

        const spawnY = Math.max(groundY + AMMO_DROP_HEIGHT, AMMO_DROP_HEIGHT);

        // Build visual
        const group = new THREE.Group();

        // Ammo crate
        const boxGeo = new THREE.BoxGeometry(AMMO_BOX_SIZE, AMMO_BOX_SIZE * 0.7, AMMO_BOX_SIZE * 0.6);
        const boxMat = new THREE.MeshStandardMaterial({
            color,
            emissive: color,
            emissiveIntensity: 0.4,
        });
        const crate = new THREE.Mesh(boxGeo, boxMat);
        group.add(crate);

        // Parachute (cone above box)
        const paraGeo = new THREE.ConeGeometry(AMMO_BOX_SIZE * 2, AMMO_BOX_SIZE * 1.5, 8, 1, true);
        const paraMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide,
        });
        const parachute = new THREE.Mesh(paraGeo, paraMat);
        parachute.position.y = AMMO_BOX_SIZE * 1.5;
        parachute.rotation.x = Math.PI; // flip cone upside down
        group.add(parachute);

        // Strings (lines from parachute to crate)
        const stringMat = new THREE.LineBasicMaterial({ color: 0x999999, transparent: true, opacity: 0.5 });
        const s = AMMO_BOX_SIZE;
        const paraTop = AMMO_BOX_SIZE * 1.5;
        for (const corner of [[-s, 0, -s * 0.5], [s, 0, -s * 0.5], [-s, 0, s * 0.5], [s, 0, s * 0.5]]) {
            const geo = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(corner[0] * 0.4, 0, corner[2] * 0.4),
                new THREE.Vector3(0, paraTop, 0),
            ]);
            const line = new THREE.Line(geo, stringMat);
            parachute.add(line);
        }

        // Point light for glow
        const light = new THREE.PointLight(color, 0.5, 0.15);
        light.position.y = AMMO_BOX_SIZE;
        group.add(light);

        group.position.set(x, spawnY, z);
        this.scene.add(group);

        this.boxes.push({
            group,
            weaponKey,
            landed: false,
            groundY,
            createdAt: performance.now(),
            swayOffset: Math.random() * Math.PI * 2,
        });
    }

    _pickup(index) {
        const box = this.boxes[index];
        const weaponKey = box.weaponKey;

        // Show pickup text
        this._showPickupText(WEAPONS[weaponKey].name);
        playAmmoPickup();

        this._removeBox(index);
        return { weaponKey };
    }

    _removeBox(index) {
        const box = this.boxes[index];
        this.scene.remove(box.group);
        // Dispose geometry/materials
        box.group.traverse((child) => {
            if (child.isMesh) {
                child.geometry.dispose();
                if (Array.isArray(child.material)) {
                    child.material.forEach(m => m.dispose());
                } else {
                    child.material.dispose();
                }
            } else if (child.isLine) {
                child.geometry.dispose();
                child.material.dispose();
            }
        });
        this.boxes.splice(index, 1);
    }

    _showPickupText(weaponName) {
        if (!this._pickupTextEl) return;
        this._pickupTextEl.textContent = `+ ${weaponName} AMMO`;
        this._pickupTextEl.style.opacity = '1';
        this._pickupTextEl.style.display = 'block';

        if (this._pickupTimer) clearTimeout(this._pickupTimer);
        this._pickupTimer = setTimeout(() => {
            this._pickupTextEl.style.opacity = '0';
        }, 1500);
    }
}
