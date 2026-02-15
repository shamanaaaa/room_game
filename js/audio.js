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
