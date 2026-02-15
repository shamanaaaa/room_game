import { io } from 'socket.io-client';

const SERVER_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:3001'
    : window.location.origin;
const SEND_RATE_MS = 66; // ~15 Hz

let socket = null;
let myId = null;
let lastSendTime = 0;

export function connectToServer(roomName) {
    socket = io(SERVER_URL);

    socket.on('your-id', (id) => {
        myId = id;
        console.log(`[MP] My ID: ${id}`);
    });

    socket.on('connect', () => {
        console.log(`[MP] Connected to server`);
        socket.emit('join-room', roomName);
    });

    return socket;
}

export function sendPlayerState(state) {
    if (!socket || !socket.connected) return;

    const now = performance.now();
    if (now - lastSendTime < SEND_RATE_MS) return;
    lastSendTime = now;

    socket.emit('player-update', state);
}

export function onRemotePlayerUpdate(callback) {
    if (!socket) return;
    socket.on('player-update', (data) => {
        if (data.id === myId) return; // ignore own echo
        callback(data);
    });
}

export function onRemotePlayerLeave(callback) {
    if (!socket) return;
    socket.on('player-left', callback);
}

export function onPlayerCount(callback) {
    if (!socket) return;
    socket.on('player-count', callback);
}

export function sendShootEvent(hitInfo) {
    if (!socket || !socket.connected) return;
    socket.emit('player-shoot', hitInfo);
}

export function onPlayerShot(callback) {
    if (!socket) return;
    socket.on('player-shot', (data) => {
        if (data.shooterId === myId) return; // ignore own shots
        callback(data);
    });
}

export function onDamageReceived(callback) {
    if (!socket) return;
    socket.on('player-damage', callback);
}

export function getMyId() {
    return myId;
}

export function getSocket() {
    return socket;
}
