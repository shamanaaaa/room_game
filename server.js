const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' },
});

const PORT = process.env.PORT || 3001;
const DIST_DIR = path.join(__dirname, 'dist');

const MAPS_DIR = path.join(__dirname, 'maps');
const MAPS_JSON = path.join(MAPS_DIR, 'maps.json');

// Ensure maps directory exists
if (!fs.existsSync(MAPS_DIR)) {
    fs.mkdirSync(MAPS_DIR);
}

// Ensure maps.json exists
if (!fs.existsSync(MAPS_JSON)) {
    fs.writeFileSync(MAPS_JSON, '[]');
}

// CORS for Vite dev server
app.use(cors());

// Serve built frontend (production)
if (fs.existsSync(DIST_DIR)) {
    app.use(express.static(DIST_DIR));
}

// Serve map files statically
app.use('/maps', express.static(MAPS_DIR));

// Multer storage — keep original extension, add timestamp prefix
const storage = multer.diskStorage({
    destination: MAPS_DIR,
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
        cb(null, `${timestamp}_${safeName}`);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const allowed = ['.glb', '.gltf', '.fbx', '.obj'];
        if (allowed.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error(`Unsupported format: ${ext}`));
        }
    },
});

// Upload a map
app.post('/api/maps', upload.single('map'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const maps = JSON.parse(fs.readFileSync(MAPS_JSON, 'utf-8'));

    const entry = {
        id: Date.now().toString(),
        name: req.body.name || req.file.originalname.replace(/\.[^.]+$/, ''),
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        uploadedAt: new Date().toISOString(),
    };

    maps.push(entry);
    fs.writeFileSync(MAPS_JSON, JSON.stringify(maps, null, 2));

    res.json(entry);
});

// List all maps
app.get('/api/maps', (req, res) => {
    const maps = JSON.parse(fs.readFileSync(MAPS_JSON, 'utf-8'));
    res.json(maps);
});

// Delete a map
app.delete('/api/maps/:id', (req, res) => {
    const maps = JSON.parse(fs.readFileSync(MAPS_JSON, 'utf-8'));
    const index = maps.findIndex(m => m.id === req.params.id);

    if (index === -1) {
        return res.status(404).json({ error: 'Map not found' });
    }

    const [removed] = maps.splice(index, 1);

    // Delete the file
    const filePath = path.join(MAPS_DIR, removed.filename);
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }

    fs.writeFileSync(MAPS_JSON, JSON.stringify(maps, null, 2));
    res.json({ success: true });
});

// SPA fallback — serve index.html for any non-API route
if (fs.existsSync(DIST_DIR)) {
    app.get('/{*splat}', (req, res) => {
        res.sendFile(path.join(DIST_DIR, 'index.html'));
    });
}

// ── Socket.IO Multiplayer ──

// Track players per room: { roomName: { playerId: lastState } }
const rooms = {};
// Map player IDs to sockets for targeted messages
const playerSockets = {};

io.on('connection', (socket) => {
    const playerId = crypto.randomUUID();
    let currentRoom = null;

    socket.emit('your-id', playerId);
    playerSockets[playerId] = socket;
    console.log(`[MP] Player connected: ${playerId}`);

    socket.on('join-room', (roomName) => {
        // Leave previous room if any
        if (currentRoom) {
            socket.leave(currentRoom);
            if (rooms[currentRoom]) {
                delete rooms[currentRoom][playerId];
                io.to(currentRoom).emit('player-left', playerId);
                io.to(currentRoom).emit('player-count', Object.keys(rooms[currentRoom]).length);
                if (Object.keys(rooms[currentRoom]).length === 0) {
                    delete rooms[currentRoom];
                }
            }
        }

        currentRoom = roomName;
        socket.join(roomName);

        if (!rooms[roomName]) rooms[roomName] = {};
        rooms[roomName][playerId] = null;

        // Send existing players to the new player
        for (const [id, state] of Object.entries(rooms[roomName])) {
            if (id !== playerId && state) {
                socket.emit('player-update', { id, ...state });
            }
        }

        const count = Object.keys(rooms[roomName]).length;
        io.to(roomName).emit('player-count', count);
        console.log(`[MP] ${playerId} joined room "${roomName}" (${count} players)`);
    });

    socket.on('player-update', (state) => {
        if (!currentRoom) return;
        if (rooms[currentRoom]) {
            rooms[currentRoom][playerId] = state;
        }
        // Broadcast to others in the same room
        socket.to(currentRoom).emit('player-update', { id: playerId, ...state });
    });

    socket.on('player-shoot', (hitInfo) => {
        if (!currentRoom) return;
        // Broadcast shot visuals to everyone else in the room
        socket.to(currentRoom).emit('player-shot', { shooterId: playerId, ...hitInfo });

        // If a player was hit, send damage directly to the target
        if (hitInfo.targetId && playerSockets[hitInfo.targetId]) {
            playerSockets[hitInfo.targetId].emit('player-damage', {
                damage: hitInfo.damage || 25,
                attackerId: playerId,
            });
        }
    });

    socket.on('disconnect', () => {
        console.log(`[MP] Player disconnected: ${playerId}`);
        delete playerSockets[playerId];
        if (currentRoom && rooms[currentRoom]) {
            delete rooms[currentRoom][playerId];
            io.to(currentRoom).emit('player-left', playerId);
            io.to(currentRoom).emit('player-count', Object.keys(rooms[currentRoom]).length);
            if (Object.keys(rooms[currentRoom]).length === 0) {
                delete rooms[currentRoom];
            }
        }
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`RoomGame server running on port ${PORT}`);
});
