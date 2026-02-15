import { playDamageReceived } from './audio.js';

const MAX_HP = 100;
const RESPAWN_DELAY_MS = 2000;
const HIT_FLASH_MS = 200;

export class CombatSystem {
    constructor(player, spawnPoint) {
        this.player = player;
        this.spawnPoint = spawnPoint.clone();
        this.hp = MAX_HP;
        this.maxHp = MAX_HP;
        this.alive = true;

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

    takeDamage(amount) {
        if (!this.alive) return;

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

        // Teleport player to spawn point
        this.player.position.copy(this.spawnPoint);
        this.player.camera.position.copy(this.spawnPoint);
        this.player.velocityY = 0;
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
