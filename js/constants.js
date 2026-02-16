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
        startMagazines: 0, // reserve mags on spawn (loaded mag is free)
        maxMagazines: 5,   // max reserve mags
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
        startMagazines: 0,
        maxMagazines: 3,
        fireRateMs: 100,
        reloadTimeMs: 2500,
        baseDamage: 18,
        recoilAmount: 0.025,
        recoilRecovery: 6.0,
        auto: true,
    },
    sniper: {
        name: 'Sniper',
        slot: 3,
        magazineSize: 5,
        startMagazines: 0,
        maxMagazines: 3,
        fireRateMs: 1200,
        reloadTimeMs: 3000,
        baseDamage: 70,
        recoilAmount: 0.06,
        recoilRecovery: 3.0,
        auto: false,
        zoomFov: 20,
    },
    bazooka: {
        name: 'Bazooka',
        slot: 4,
        magazineSize: 1,
        startMagazines: 1,
        maxMagazines: 4,
        fireRateMs: 1500,
        reloadTimeMs: 2500,
        baseDamage: 200,
        recoilAmount: 0.08,
        recoilRecovery: 2.0,
        auto: false,
        projectile: true,
        projectileSpeed: 3.0,     // m/s
        explosionRadius: 0.15,    // blast radius
        explosionDuration: 400,   // ms
        selfDamageMultiplier: 0.5,  
    },
};

// ── Zoom ──
export const DEFAULT_FOV = 75;
export const ZOOM_TRANSITION_SPEED = 12; // fov lerp speed

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

// ── Ammo boxes ──
export const AMMO_SPAWN_INTERVAL = 30000; // ms between spawns
export const AMMO_DROP_HEIGHT = 1.0;      // spawn height above map
export const AMMO_FALL_SPEED = 0.15;      // m/s fall speed (with parachute)
export const AMMO_PICKUP_RADIUS = 0.05;   // auto-pickup distance
export const AMMO_BOX_SIZE = 0.01;       // visual size of box
export const AMMO_LIFETIME = 60000;       // despawn after 60s
