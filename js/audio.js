// Procedural sound effects using Web Audio API

let ctx = null;

function getCtx() {
    if (!ctx) ctx = new AudioContext();
    return ctx;
}

// Resume audio context on user interaction (browser autoplay policy)
function ensureResumed() {
    const c = getCtx();
    if (c.state === 'suspended') c.resume();
    return c;
}

export function playGunshot() {
    const c = ensureResumed();
    const now = c.currentTime;

    // Noise burst for the "crack"
    const bufferSize = c.sampleRate * 0.08;
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 10);
    }
    const noise = c.createBufferSource();
    noise.buffer = buffer;

    // Bandpass for punch
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 800;
    bp.Q.value = 1.5;

    // Low thump
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(50, now + 0.06);

    const oscGain = c.createGain();
    oscGain.gain.setValueAtTime(0.5, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    const noiseGain = c.createGain();
    noiseGain.gain.setValueAtTime(0.4, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    const master = c.createGain();
    master.gain.value = 0.3;

    noise.connect(bp).connect(noiseGain).connect(master);
    osc.connect(oscGain).connect(master);
    master.connect(c.destination);

    noise.start(now);
    noise.stop(now + 0.08);
    osc.start(now);
    osc.stop(now + 0.08);
}

export function playRifleShot() {
    const c = ensureResumed();
    const now = c.currentTime;

    // Louder, deeper crack with longer tail
    const bufferSize = c.sampleRate * 0.12;
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 8);
    }
    const noise = c.createBufferSource();
    noise.buffer = buffer;

    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 600;
    bp.Q.value = 1.0;

    // Deep thump
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.1);

    const oscGain = c.createGain();
    oscGain.gain.setValueAtTime(0.6, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    const noiseGain = c.createGain();
    noiseGain.gain.setValueAtTime(0.5, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    const master = c.createGain();
    master.gain.value = 0.35;

    noise.connect(bp).connect(noiseGain).connect(master);
    osc.connect(oscGain).connect(master);
    master.connect(c.destination);

    noise.start(now);
    noise.stop(now + 0.12);
    osc.start(now);
    osc.stop(now + 0.1);
}

export function playSniperShot() {
    const c = ensureResumed();
    const now = c.currentTime;

    // Heavy boom with sharp crack and long echo tail
    const bufferSize = c.sampleRate * 0.18;
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 5);
    }
    const noise = c.createBufferSource();
    noise.buffer = buffer;

    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 400;
    bp.Q.value = 0.6;

    // Deep heavy thump
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(80, now);
    osc.frequency.exponentialRampToValueAtTime(25, now + 0.2);

    const oscGain = c.createGain();
    oscGain.gain.setValueAtTime(0.7, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    const noiseGain = c.createGain();
    noiseGain.gain.setValueAtTime(0.6, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    // High crack
    const crack = c.createOscillator();
    crack.type = 'sawtooth';
    crack.frequency.setValueAtTime(1800, now);
    crack.frequency.exponentialRampToValueAtTime(400, now + 0.05);

    const crackGain = c.createGain();
    crackGain.gain.setValueAtTime(0.3, now);
    crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    const master = c.createGain();
    master.gain.value = 0.4;

    noise.connect(bp).connect(noiseGain).connect(master);
    osc.connect(oscGain).connect(master);
    crack.connect(crackGain).connect(master);
    master.connect(c.destination);

    noise.start(now);
    noise.stop(now + 0.18);
    osc.start(now);
    osc.stop(now + 0.2);
    crack.start(now);
    crack.stop(now + 0.05);
}

export function playHeadshot() {
    const c = ensureResumed();
    const now = c.currentTime;

    // Sharp metallic ping
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(2200, now);
    osc.frequency.exponentialRampToValueAtTime(1800, now + 0.15);

    const osc2 = c.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(3300, now);
    osc2.frequency.exponentialRampToValueAtTime(2800, now + 0.1);

    const gain = c.createGain();
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    const gain2 = c.createGain();
    gain2.gain.setValueAtTime(0.12, now);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain).connect(c.destination);
    osc2.connect(gain2).connect(c.destination);

    osc.start(now);
    osc.stop(now + 0.2);
    osc2.start(now);
    osc2.stop(now + 0.12);
}

export function playFootstep() {
    const c = ensureResumed();
    const now = c.currentTime;

    // Short noise tap with slight pitch variation
    const bufferSize = c.sampleRate * 0.04;
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 6);
    }
    const noise = c.createBufferSource();
    noise.buffer = buffer;

    // Low-pass for soft thud
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 600 + Math.random() * 200;
    lp.Q.value = 0.8;

    const gain = c.createGain();
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    noise.connect(lp).connect(gain).connect(c.destination);
    noise.start(now);
    noise.stop(now + 0.04);
}

export function playHitConfirm() {
    const c = ensureResumed();
    const now = c.currentTime;

    // Short click/tick for body hit confirmation
    const osc = c.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 800;

    const gain = c.createGain();
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.connect(gain).connect(c.destination);
    osc.start(now);
    osc.stop(now + 0.05);
}

export function playDamageReceived() {
    const c = ensureResumed();
    const now = c.currentTime;

    // Dull thud when taking damage
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(100, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.15);

    const gain = c.createGain();
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain).connect(c.destination);
    osc.start(now);
    osc.stop(now + 0.15);
}

export function playRocketLaunch() {
    const c = ensureResumed();
    const now = c.currentTime;

    // Whoosh — rising noise burst
    const bufferSize = c.sampleRate * 0.3;
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 3);
    }
    const noise = c.createBufferSource();
    noise.buffer = buffer;

    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(300, now);
    bp.frequency.linearRampToValueAtTime(800, now + 0.15);
    bp.Q.value = 1.0;

    const noiseGain = c.createGain();
    noiseGain.gain.setValueAtTime(0.5, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    // Low thump
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(60, now);
    osc.frequency.exponentialRampToValueAtTime(20, now + 0.15);
    const oscGain = c.createGain();
    oscGain.gain.setValueAtTime(0.4, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    const master = c.createGain();
    master.gain.value = 0.5;

    noise.connect(bp).connect(noiseGain).connect(master);
    osc.connect(oscGain).connect(master);
    master.connect(c.destination);

    noise.start(now);
    noise.stop(now + 0.3);
    osc.start(now);
    osc.stop(now + 0.15);
}

export function playExplosion() {
    const c = ensureResumed();
    const now = c.currentTime;

    // Heavy explosion — long rumbling noise + deep sine boom
    const bufferSize = c.sampleRate * 0.6;
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
    }
    const noise = c.createBufferSource();
    noise.buffer = buffer;

    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(600, now);
    lp.frequency.exponentialRampToValueAtTime(80, now + 0.5);

    const noiseGain = c.createGain();
    noiseGain.gain.setValueAtTime(0.7, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

    // Deep boom
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(50, now);
    osc.frequency.exponentialRampToValueAtTime(15, now + 0.4);
    const oscGain = c.createGain();
    oscGain.gain.setValueAtTime(0.8, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    // Mid crackle
    const osc2 = c.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(200, now);
    osc2.frequency.exponentialRampToValueAtTime(40, now + 0.2);
    const osc2Gain = c.createGain();
    osc2Gain.gain.setValueAtTime(0.3, now);
    osc2Gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    const master = c.createGain();
    master.gain.value = 0.5;

    noise.connect(lp).connect(noiseGain).connect(master);
    osc.connect(oscGain).connect(master);
    osc2.connect(osc2Gain).connect(master);
    master.connect(c.destination);

    noise.start(now);
    noise.stop(now + 0.6);
    osc.start(now);
    osc.stop(now + 0.4);
    osc2.start(now);
    osc2.stop(now + 0.2);
}

export function playAmmoPickup() {
    const c = ensureResumed();
    const now = c.currentTime;

    // Rising chime — two quick ascending tones
    const osc1 = c.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(600, now);

    const osc2 = c.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(900, now + 0.06);

    const gain1 = c.createGain();
    gain1.gain.setValueAtTime(0.2, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    const gain2 = c.createGain();
    gain2.gain.setValueAtTime(0.001, now);
    gain2.gain.setValueAtTime(0.2, now + 0.06);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc1.connect(gain1).connect(c.destination);
    osc2.connect(gain2).connect(c.destination);

    osc1.start(now);
    osc1.stop(now + 0.08);
    osc2.start(now + 0.06);
    osc2.stop(now + 0.15);
}
