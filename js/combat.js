import * as THREE from 'three';
import { playDamageReceived } from './audio.js';
import { MAX_HP, RESPAWN_DELAY_MS, HIT_FLASH_MS, EYE_HEIGHT } from './constants.js';

export class CombatSystem {
    constructor(player, spawnPoint, roomBounds) {
        this.player = player;
        this.spawnPoint = spawnPoint.clone();
        this.roomBounds = roomBounds;
        this.hp = MAX_HP;
        this.maxHp = MAX_HP;
        this.alive = true;
        this._lastAttackerId = null;

        // Called when this player dies — main.js sets this to send kill event
        this.onDeath = null;

        // HUD refs (set later)
        this._hpFillEl = null;
        this._hitOverlayEl = null;
        this._deathScreenEl = null;

        this._hitFlashTimer = null;
    }

    setHUD(hpFillEl, hitOverlayEl, deathScreenEl) {
        this._hpFillEl = hpFillEl;
        this._hitOverlayEl = hitOverlayEl;
        this._deathScreenEl = deathScreenEl;
        this._updateHPBar();
    }

    takeDamage(amount, attackerId) {
        if (!this.alive) return;

        if (attackerId) this._lastAttackerId = attackerId;
        this.hp = Math.max(0, this.hp - amount);
        this._updateHPBar();
        this._flashHit();
        playDamageReceived();

        if (this.hp <= 0) {
            this.die();
        }
    }

    die() {
        this.alive = false;

        if (this.onDeath) {
            this.onDeath(this._lastAttackerId);
        }
        this._lastAttackerId = null;

        if (this._deathScreenEl) {
            this._deathScreenEl.style.display = 'flex';
        }

        setTimeout(() => this.respawn(), RESPAWN_DELAY_MS);
    }

    respawn() {
        this.hp = MAX_HP;
        this.alive = true;
        this._updateHPBar();

        if (this._deathScreenEl) {
            this._deathScreenEl.style.display = 'none';
        }

        // Teleport player to a random position on the map
        const pos = this._getRandomSpawn();
        this.player.position.copy(pos);
        this.player.camera.position.copy(pos);
        this.player.velocityY = 0;
    }

    _getRandomSpawn() {
        const hw = this.roomBounds.width / 2 * 0.8;
        const hd = this.roomBounds.depth / 2 * 0.8;
        return new THREE.Vector3(
            (Math.random() - 0.5) * 2 * hw,
            this.spawnPoint.y,
            (Math.random() - 0.5) * 2 * hd,
        );
    }

    getHPFraction() {
        return this.hp / this.maxHp;
    }

    _updateHPBar() {
        if (!this._hpFillEl) return;

        const frac = this.getHPFraction();
        this._hpFillEl.style.width = `${frac * 100}%`;

        // Color: green → yellow → red
        if (frac > 0.5) {
            this._hpFillEl.style.background = `linear-gradient(90deg, #4ecdc4, #44bd55)`;
        } else if (frac > 0.25) {
            this._hpFillEl.style.background = `linear-gradient(90deg, #e8b84e, #e88a4e)`;
        } else {
            this._hpFillEl.style.background = `linear-gradient(90deg, #e55, #c33)`;
        }
    }

    _flashHit() {
        if (!this._hitOverlayEl) return;

        this._hitOverlayEl.style.opacity = '0.35';

        if (this._hitFlashTimer) clearTimeout(this._hitFlashTimer);
        this._hitFlashTimer = setTimeout(() => {
            this._hitOverlayEl.style.opacity = '0';
        }, HIT_FLASH_MS);
    }
}
