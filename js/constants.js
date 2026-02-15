// ── Player scale ──
export const PLAYER_HEIGHT = 0.1;
export const EYE_HEIGHT = 0.08;

// ── Movement ──
export const WALK_SPEED = 0.25;        // m/s
export const SPRINT_SPEED = 0.5;       // m/s
export const FLY_SPEED = 1.0;          // m/s
export const FLY_SPRINT_SPEED = 3.0;
export const FLY_VERTICAL_SPEED = 0.8; // m/s

// ── Physics ──
export const GRAVITY = 5.0;
export const JUMP_VELOCITY = 2;
export const VOID_Y = -2.0; // kill player below this Y

// ── Fly mode ──
export const FLY_ENABLED = false;

// ── Double-tap detection ──
export const DOUBLE_TAP_MS = 300;

// ── Third-person camera ──
export const TP_DISTANCE = 0.08;
export const TP_HEIGHT = 0.04;

// ── Weapon shared ──
export const MUZZLE_FLASH_MS = 50;
export const TRACER_MS = 200;
export const DECAL_LIFETIME_MS = 3000;

// ── Weapon configs ──
export const WEAPONS = {
    pistol: {
        name: 'Pistol',
        slot: 1,
        magazineSize: 12,
        fireRateMs: 200,
        reloadTimeMs: 1500,
        baseDamage: 25,
        recoilAmount: 0.015,
        recoilRecovery: 8.0,
        auto: false,
    },
    ak47: {
        name: 'AK-47',
        slot: 2,
        magazineSize: 30,
        fireRateMs: 100,
        reloadTimeMs: 2500,
        baseDamage: 18,
        recoilAmount: 0.025,
        recoilRecovery: 6.0,
        auto: true,
    },
};

// ── Body zone damage ──
export const BODY_ZONES = [
    { name: 'head',  minPct: 0.80, maxPct: 1.00, multiplier: 2.0 },
    { name: 'body',  minPct: 0.45, maxPct: 0.80, multiplier: 1.0 },
    { name: 'arms',  minPct: 0.45, maxPct: 0.80, multiplier: 0.75 },
    { name: 'legs',  minPct: 0.00, maxPct: 0.45, multiplier: 0.5 },
];
export const ARM_X_THRESHOLD = 0.006;

// ── Combat ──
export const MAX_HP = 100;
export const RESPAWN_DELAY_MS = 2000;
export const HIT_FLASH_MS = 200;

// ── Remote players ──
export const LERP_FACTOR = 0.15;
