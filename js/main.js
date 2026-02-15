import * as THREE from 'three';
import { loadScan } from './scan-loader.js';
import { Player } from './player.js';
import { loadCharacter } from './character-loader.js';
import { connectToServer, sendPlayerState, onRemotePlayerUpdate, onRemotePlayerLeave, onPlayerCount, sendShootEvent, onPlayerShot, onDamageReceived } from './network.js';
import { RemotePlayerManager } from './remote-players.js';
import { Weapon } from './weapon.js';
import { CombatSystem } from './combat.js';

// ── DOM refs ──
const uploadScreen = document.getElementById('upload-screen');
const gameScreen = document.getElementById('game-screen');
const loadingScreen = document.getElementById('loading-screen');
const enterBtn = document.getElementById('enter-btn');
const hintText = document.getElementById('hint-text');

// Mode toggle
const modeBtns = document.querySelectorAll('.mode-btn');
const scanUpload = document.getElementById('scan-upload');

// Scan upload
const scanDropzone = document.getElementById('scan-dropzone');
const scanInput = document.getElementById('scan-input');
const scanInfo = document.getElementById('scan-info');
const scanFilename = document.getElementById('scan-filename');
const scanClear = document.getElementById('scan-clear');

// Community maps
const communityUpload = document.getElementById('community-upload');
const communityMapsList = document.getElementById('community-maps-list');
const shareBtn = document.getElementById('share-btn');

const API_BASE = window.location.hostname === 'localhost'
    ? 'http://localhost:3001'
    : window.location.origin;

// ── State ──
let currentMode = 'scan';
let scanFileUrl = null;
let scanFileName = null;
let scanFile = null; // keep reference for community upload
let communityMapUrl = null;
let communityMapFilename = null;

// ── Mode Toggle ──

modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        currentMode = mode;

        modeBtns.forEach(b => b.classList.toggle('active', b === btn));
        scanUpload.classList.toggle('active', mode === 'scan');
        communityUpload.classList.toggle('active', mode === 'community');

        if (mode === 'scan') {
            hintText.textContent = 'Upload a 3D model (.glb, .fbx, .obj) to start';
        } else {
            hintText.textContent = 'Select a community map to play';
            loadCommunityMaps();
        }

        updateEnterButton();
    });
});

// ── Scan Upload ──

scanInput.addEventListener('change', (e) => {
    handleScanFile(e.target.files[0]);
});

// Drag & drop
scanDropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    scanDropzone.classList.add('dragover');
});

scanDropzone.addEventListener('dragleave', () => {
    scanDropzone.classList.remove('dragover');
});

scanDropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    scanDropzone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) handleScanFile(file);
});

function handleScanFile(file) {
    if (!file) return;
    if (scanFileUrl) URL.revokeObjectURL(scanFileUrl);
    scanFile = file;
    scanFileUrl = URL.createObjectURL(file);
    scanFileName = file.name;
    scanFilename.textContent = file.name;
    scanDropzone.style.display = 'none';
    scanInfo.style.display = 'flex';
    shareBtn.style.display = 'inline-block';
    updateEnterButton();
}

scanClear.addEventListener('click', () => {
    if (scanFileUrl) URL.revokeObjectURL(scanFileUrl);
    scanFileUrl = null;
    scanFileName = null;
    scanFile = null;
    scanInput.value = '';
    scanDropzone.style.display = 'flex';
    scanInfo.style.display = 'none';
    shareBtn.style.display = 'none';
    updateEnterButton();
});

// ── Shared ──

function updateEnterButton() {
    if (currentMode === 'scan') {
        enterBtn.disabled = !scanFileUrl;
    } else {
        enterBtn.disabled = !communityMapUrl;
    }
}

// ── Community Maps ──

async function loadCommunityMaps() {
    communityMapsList.innerHTML = '<p id="community-loading">Loading maps...</p>';

    try {
        const res = await fetch(`${API_BASE}/api/maps`);
        const maps = await res.json();

        if (maps.length === 0) {
            communityMapsList.innerHTML = '<p class="no-maps">No maps uploaded yet. Upload a 3D scan and share it!</p>';
            return;
        }

        communityMapsList.innerHTML = '';
        for (const map of maps) {
            const card = document.createElement('div');
            card.className = 'map-card';
            if (communityMapUrl && communityMapFilename === map.filename) {
                card.classList.add('selected');
            }

            const sizeStr = (map.size / (1024 * 1024)).toFixed(1) + ' MB';
            const dateStr = new Date(map.uploadedAt).toLocaleDateString();

            card.innerHTML = `
                <div class="map-card-info">
                    <span class="map-card-name">${map.name}</span>
                    <span class="map-card-meta">${map.originalName} &bull; ${sizeStr} &bull; ${dateStr}</span>
                </div>
                <div class="map-card-actions">
                    <button class="map-play-btn">Select</button>
                    <button class="map-delete-btn" title="Delete">&#128465;</button>
                </div>
            `;

            card.querySelector('.map-play-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                communityMapUrl = `${API_BASE}/maps/${map.filename}`;
                communityMapFilename = map.filename;
                // Update selection styling
                communityMapsList.querySelectorAll('.map-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                updateEnterButton();
            });

            card.querySelector('.map-delete-btn').addEventListener('click', async (e) => {
                e.stopPropagation();
                if (!confirm(`Delete "${map.name}"?`)) return;
                await fetch(`${API_BASE}/api/maps/${map.id}`, { method: 'DELETE' });
                if (communityMapFilename === map.filename) {
                    communityMapUrl = null;
                    communityMapFilename = null;
                    updateEnterButton();
                }
                loadCommunityMaps();
            });

            card.addEventListener('click', () => {
                card.querySelector('.map-play-btn').click();
            });

            communityMapsList.appendChild(card);
        }
    } catch (err) {
        communityMapsList.innerHTML = '<p class="no-maps">Could not connect to map server. Is it running on port 3001?</p>';
    }
}

// Share to community
shareBtn.addEventListener('click', async () => {
    if (!scanFile) return;

    shareBtn.disabled = true;
    shareBtn.textContent = 'Uploading...';

    try {
        const formData = new FormData();
        formData.append('map', scanFile);
        formData.append('name', scanFileName.replace(/\.[^.]+$/, ''));

        const res = await fetch(`${API_BASE}/api/maps`, {
            method: 'POST',
            body: formData,
        });

        if (!res.ok) throw new Error('Upload failed');

        shareBtn.textContent = 'Shared!';
        setTimeout(() => {
            shareBtn.textContent = 'Share to Community';
            shareBtn.disabled = false;
        }, 2000);
    } catch (err) {
        shareBtn.textContent = 'Failed — is server running?';
        setTimeout(() => {
            shareBtn.textContent = 'Share to Community';
            shareBtn.disabled = false;
        }, 3000);
    }
});

// ── Game ──

let scene, camera, renderer, player, clock, dustParticles, remoteManager, weapon, combat;

async function initGame() {
    uploadScreen.style.display = 'none';
    loadingScreen.style.display = 'flex';

    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050505);

    // Camera
    camera = new THREE.PerspectiveCamera(
        90,
        window.innerWidth / window.innerHeight,
        0.001,
        100
    );

    // Renderer
    const canvas = document.getElementById('game-canvas');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Load 3D model (local file or community map)
    const url = currentMode === 'scan' ? scanFileUrl : communityMapUrl;
    const name = currentMode === 'scan' ? scanFileName : communityMapFilename;
    const result = await loadScan(scene, url, name);
    const roomBounds = result.bounds;
    const collisionMeshes = result.collisionMeshes;
    const spawnPoint = result.spawnPoint;

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 1.5));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
    dirLight.position.set(1, 2, 1);
    scene.add(dirLight);

    // Hide loading, show game
    loadingScreen.style.display = 'none';
    gameScreen.style.display = 'block';

    // Player
    player = new Player(camera, document.body, roomBounds, {
        collisionMeshes,
        spawnPoint,
    });

    // Pointer lock events
    player.on('lock', () => gameScreen.classList.add('playing'));
    player.on('unlock', () => gameScreen.classList.remove('playing'));

    // Load player character model
    try {
        const { model, mixer, animations } = await loadCharacter();
        scene.add(model);
        player.setCharacterModel(model, mixer, animations);
    } catch (err) {
        console.warn('Could not load character model:', err);
    }

    // Fly mode HUD
    const flyIndicator = document.getElementById('fly-indicator');
    player.onFlyToggle = (flying) => {
        flyIndicator.style.display = flying ? 'block' : 'none';
    };

    // View mode HUD
    const viewIndicator = document.getElementById('view-indicator');
    player.onViewToggle = (thirdPerson) => {
        viewIndicator.style.display = thirdPerson ? 'block' : 'none';
    };

    gameScreen.addEventListener('click', () => {
        if (!player.isLocked) player.lock();
    });

    // Dust particles
    dustParticles = createDust(scene, roomBounds);

    // ── Multiplayer ──
    remoteManager = new RemotePlayerManager(scene);
    try {
        await remoteManager.loadTemplate();
    } catch (err) {
        console.warn('Could not load remote player template:', err);
    }

    // Weapon system (after remoteManager so raycasting can hit remote players)
    weapon = new Weapon(camera, scene, collisionMeshes, remoteManager);
    weapon.setHUD(
        document.getElementById('ammo-counter'),
        document.getElementById('reload-indicator')
    );
    weapon.onFire = (hitInfo) => sendShootEvent(hitInfo);
    player.setWeapon(weapon);

    // Combat system
    combat = new CombatSystem(player, spawnPoint);
    combat.setHUD(
        document.getElementById('hp-fill'),
        document.getElementById('hit-overlay'),
        document.getElementById('death-screen')
    );
    player.setCombat(combat);

    // Use map name as room ID for auto-join lobby
    const roomId = name || 'default';
    const socket = connectToServer(roomId);

    onRemotePlayerUpdate((data) => {
        remoteManager.updatePlayer(data.id, data);
    });

    onRemotePlayerLeave((id) => {
        remoteManager.removePlayer(id);
    });

    // Remote player shot visuals
    onPlayerShot((data) => {
        if (data.point) {
            const shooterState = remoteManager.players.get(data.shooterId);
            if (shooterState) {
                const from = shooterState.model.position.clone();
                from.y += 0.02; // approximate eye level
                weapon.createRemoteTracer(from, data.point);
            }
        }
    });

    // Receive damage from other players
    onDamageReceived((data) => {
        combat.takeDamage(data.damage);
    });

    // Player count HUD
    const playerCountEl = document.getElementById('player-count');
    onPlayerCount((count) => {
        if (count > 1) {
            playerCountEl.textContent = `${count} PLAYERS`;
            playerCountEl.style.display = 'block';
        } else {
            playerCountEl.style.display = 'none';
        }
    });

    // Resize
    window.addEventListener('resize', onResize);

    // Go
    clock = new THREE.Clock();
    animate();
}

// ── Dust Particles ──

function createDust(scene, bounds) {
    const count = 600;
    const positions = new Float32Array(count * 3);
    const driftSeeds = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        positions[i3]     = (Math.random() - 0.5) * bounds.width;
        positions[i3 + 1] = Math.random() * bounds.height;
        positions[i3 + 2] = (Math.random() - 0.5) * bounds.depth;
        driftSeeds[i3]     = Math.random() * Math.PI * 2;
        driftSeeds[i3 + 1] = Math.random() * Math.PI * 2;
        driftSeeds[i3 + 2] = Math.random() * Math.PI * 2;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.004,
        transparent: true,
        opacity: 0.3,
        sizeAttenuation: true,
        depthWrite: false,
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    return { points, driftSeeds, bounds };
}

function updateDust(dust, time) {
    const pos = dust.points.geometry.attributes.position.array;
    const seeds = dust.driftSeeds;

    for (let i = 0; i < pos.length; i += 3) {
        pos[i]     += Math.sin(time * 0.3 + seeds[i])     * 0.00008;
        pos[i + 1] += Math.sin(time * 0.15 + seeds[i + 1]) * 0.00004;
        pos[i + 2] += Math.cos(time * 0.3 + seeds[i + 2]) * 0.00008;

        const hw = dust.bounds.width / 2;
        const hd = dust.bounds.depth / 2;
        if (pos[i] > hw) pos[i] = -hw;
        if (pos[i] < -hw) pos[i] = hw;
        if (pos[i + 1] > dust.bounds.height) pos[i + 1] = 0;
        if (pos[i + 1] < 0) pos[i + 1] = dust.bounds.height;
        if (pos[i + 2] > hd) pos[i + 2] = -hd;
        if (pos[i + 2] < -hd) pos[i + 2] = hd;
    }

    dust.points.geometry.attributes.position.needsUpdate = true;
}

// ── Game Loop ──

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    const elapsed = clock.getElapsedTime();

    player.update(delta);

    // Send local player state to server
    sendPlayerState(player.getNetworkState());

    // Update remote players
    if (remoteManager) {
        remoteManager.update(delta);
    }

    updateDust(dustParticles, elapsed);

    renderer.render(scene, camera);
}

function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ── Init ──

enterBtn.addEventListener('click', () => initGame());
