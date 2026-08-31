const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { clerkMiddleware, getAuth } = require('@clerk/express');

const Player = require('../models/Player');
const Team = require('../models/Team');
const Rule = require('../models/Rule');
const AuctionState = require('../models/AuctionState');
const Room = require('../models/Room');

// Default sets to seed on system/room creation
const DEFAULT_RULES = {
    basePrices: { A: 1000000, B: 500000, C: 200000 },
    slots: { A: 2, B: 3, C: 5 },
    minPlayers: 5,
    maxPlayers: 15
};

const DEFAULT_PLAYERS = [
    { name: 'Virat Kohli', category: 'A', basePrice: 1000000, age: 37, status: 'Pending', finalPrice: 0, winningTeam: null, photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=ViratKohli' },
    { name: 'Rohit Sharma', category: 'A', basePrice: 1000000, age: 39, status: 'Pending', finalPrice: 0, winningTeam: null, photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=RohitSharma' },
    { name: 'Jasprit Bumrah', category: 'A', basePrice: 1000000, age: 32, status: 'Pending', finalPrice: 0, winningTeam: null, photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=JaspritBumrah' },
    { name: 'Ravindra Jadeja', category: 'B', basePrice: 500000, age: 37, status: 'Pending', finalPrice: 0, winningTeam: null, photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=RavindraJadeja' },
    { name: 'MS Dhoni', category: 'A', basePrice: 1000000, age: 44, status: 'Pending', finalPrice: 0, winningTeam: null, photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=MSDhoni' },
    { name: 'Rinku Singh', category: 'C', basePrice: 200000, age: 28, status: 'Pending', finalPrice: 0, winningTeam: null, photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=RinkuSingh' }
];

const DEFAULT_TEAMS = [
    { name: 'Chennai Champions', budget: 10000000, initialBudget: 10000000 },
    { name: 'Mumbai Mavericks', budget: 10000000, initialBudget: 10000000 },
    { name: 'Pune Panthers', budget: 10000000, initialBudget: 10000000 },
    { name: 'Bangalore Bulls', budget: 10000000, initialBudget: 10000000 },
    { name: 'Delhi Dynamos', budget: 10000000, initialBudget: 10000000 }
];

const DEFAULT_AUCTION_STATE = {
    livePlayer: null,
    liveStatus: 'waiting',
    soldInfo: null,
    currentBid: 0,
    highestBidder: null,
    bidHistory: []
};

// --- AUTH MIDDLEWARE ---
router.use(clerkMiddleware());

// Middleware to ensure user is the creator/admin of the specified room
const requireRoomAdmin = async (req, res, next) => {
    try {
        const { userId } = getAuth(req);
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized: No active session' });
        }
        const roomId = req.params.roomId || req.body.roomId || req.query.roomId;
        if (!roomId || !mongoose.Types.ObjectId.isValid(roomId)) {
            return res.status(400).json({ error: 'Bad Request: Missing or invalid room ID' });
        }
        const room = await Room.findById(roomId);
        if (!room) {
            return res.status(404).json({ error: 'Room not found' });
        }

        // Auto-claim migration: If room is an old mock room, claim it for the current logged-in user!
        if (room.adminUserId === 'ADMIN') {
            room.adminUserId = userId;
            await room.save();
        }

        if (room.adminUserId !== userId) {
            return res.status(403).json({ error: 'Forbidden: You are not the admin of this room' });
        }
        req.room = room;
        next();
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// --- ROOM LOBBY API ---

// POST: Create new room (seeding defaults automatically)
router.post('/rooms', async (req, res) => {
    try {
        const { userId, sessionClaims } = getAuth(req);
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized: Sign in required to create rooms' });
        }
        const { name, passkey } = req.body;
        if (!name || !passkey) {
            return res.status(400).json({ error: 'Room name and passkey are required' });
        }

        const adminName = sessionClaims?.username || sessionClaims?.email || 'Admin';

        // Create Room
        const room = new Room({
            name,
            passkey,
            adminUserId: userId,
            adminName
        });
        await room.save();

        // Seed default dataset for this specific room
        const rules = new Rule({ room: room._id, ...DEFAULT_RULES });
        await rules.save();

        const state = new AuctionState({ room: room._id, ...DEFAULT_AUCTION_STATE });
        await state.save();

        await Player.insertMany(DEFAULT_PLAYERS.map(p => ({ ...p, room: room._id })));
        await Team.insertMany(DEFAULT_TEAMS.map(t => ({ ...t, room: room._id })));

        res.status(201).json(room);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET: Fetch list of rooms (excludes passkey)
router.get('/rooms', async (req, res) => {
    try {
        const rooms = await Room.find().select('-passkey').sort({ createdAt: -1 });
        res.json(rooms);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET: Fetch single room details (excludes passkey)
router.get('/rooms/:roomId', async (req, res) => {
    try {
        const room = await Room.findById(req.params.roomId).select('-passkey');
        if (!room) return res.status(404).json({ error: 'Room not found' });

        // Auto-claim migration: If room is an old mock room, claim it for the current logged-in user!
        const { userId } = getAuth(req);
        if (userId && room.adminUserId === 'ADMIN') {
            room.adminUserId = userId;
            await room.save();
        }

        res.json(room);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST: Verify passkey or check room admin ownership
router.post('/rooms/:roomId/verify-passkey', async (req, res) => {
    try {
        const { passkey } = req.body;
        const room = await Room.findById(req.params.roomId);
        if (!room) {
            return res.status(404).json({ error: 'Room not found' });
        }

        // Check if current logged-in user is the owner
        const { userId } = getAuth(req);

        // Auto-claim migration: If room is an old mock room, claim it for the current logged-in user!
        if (userId && room.adminUserId === 'ADMIN') {
            room.adminUserId = userId;
            await room.save();
        }

        if (userId && room.adminUserId === userId) {
            return res.json({ success: true, isAdmin: true });
        }

        if (room.passkey === passkey) {
            return res.json({ success: true, isAdmin: false });
        } else {
            return res.status(401).json({ success: false, error: 'Incorrect passkey' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// --- PLAYERS API ---

// GET: Fetch all players in a room
router.get('/players', async (req, res) => {
    try {
        const { roomId } = req.query;
        if (!roomId) return res.status(400).json({ error: 'Missing roomId' });
        const players = await Player.find({ room: roomId });
        res.json(players);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST: Add new player(s) to a room (Admin protected)
router.post('/players', requireRoomAdmin, async (req, res) => {
    try {
        const roomId = req.body.roomId || req.query.roomId;
        const data = req.body.data || req.body;
        let result;

        if (Array.isArray(data)) {
            await Player.deleteMany({ room: roomId });
            result = await Player.insertMany(data.map(p => {
                const { id, _id, ...rest } = p;
                const idToUse = _id || id;
                const doc = { ...rest, room: roomId };
                if (idToUse && mongoose.Types.ObjectId.isValid(idToUse)) {
                    doc._id = idToUse;
                }
                return doc;
            }));
        } else {
            const { name, photo, category, basePrice, age, status, finalPrice, winningTeam } = data;
            result = new Player({ name, photo, category, basePrice, age, status, finalPrice, winningTeam, room: roomId });
            await result.save();
        }

        const allPlayers = await Player.find({ room: roomId });
        const io = req.app.get('io');
        if (io) io.to(roomId).emit('playersUpdated', allPlayers);

        res.status(Array.isArray(data) ? 200 : 201).json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// DELETE: Wipe all players in a room (Admin protected)
router.delete('/players', requireRoomAdmin, async (req, res) => {
    try {
        const roomId = req.query.roomId;
        await Player.deleteMany({ room: roomId });
        const io = req.app.get('io');
        if (io) io.to(roomId).emit('playersUpdated', []);
        res.json({ message: 'All players deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// --- TEAMS API ---

// Helper to calculate exact reconciled budget for all teams from sold players (source of truth)
const getReconciledTeams = async (roomId) => {
    const teams = await Team.find({ room: roomId });
    const soldPlayers = await Player.find({ room: roomId, status: 'Sold' });

    const updates = [];
    for (const team of teams) {
        const teamSoldPlayers = soldPlayers.filter(p => p.winningTeam === team.name);
        const totalSpent = teamSoldPlayers.reduce((sum, p) => sum + (Number(p.finalPrice) || 0), 0);
        const initial = Number(team.initialBudget) || 10000000;
        const correctBudget = Math.max(0, initial - totalSpent);

        if (team.budget !== correctBudget) {
            team.budget = correctBudget;
            updates.push(team.save());
        }
    }
    if (updates.length > 0) {
        await Promise.all(updates);
    }
    return teams;
};

// GET: Fetch all teams in a room
router.get('/teams', async (req, res) => {
    try {
        const { roomId } = req.query;
        if (!roomId) return res.status(400).json({ error: 'Missing roomId' });
        const teams = await getReconciledTeams(roomId);
        res.json(teams);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST: Add new team(s) to a room (Admin protected)
router.post('/teams', requireRoomAdmin, async (req, res) => {
    try {
        const roomId = req.body.roomId || req.query.roomId;
        const data = req.body.data || req.body;
        let result;

        if (Array.isArray(data)) {
            await Team.deleteMany({ room: roomId });
            result = await Team.insertMany(data.map(t => {
                const { id, _id, ...rest } = t;
                const idToUse = _id || id;
                const doc = { ...rest, room: roomId };
                if (idToUse && mongoose.Types.ObjectId.isValid(idToUse)) {
                    doc._id = idToUse;
                }
                return doc;
            }));
        } else {
            const { name, budget, initialBudget } = data;
            result = new Team({ name, budget, initialBudget, room: roomId });
            await result.save();
        }

        const allTeams = await Team.find({ room: roomId });
        const io = req.app.get('io');
        if (io) io.to(roomId).emit('teamsUpdated', allTeams);

        res.status(Array.isArray(data) ? 200 : 201).json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// DELETE: Delete specific team in a room (Admin protected)
router.delete('/teams/:id', async (req, res) => {
    try {
        // Need to check admin ownership first since params holds team ID, not roomId
        const team = await Team.findById(req.params.id);
        if (!team) return res.status(404).json({ error: 'Team not found' });
        
        // Custom ownership check
        const { userId } = getAuth(req);
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized: No active session' });
        }
        const room = await Room.findById(team.room);
        if (!room || room.adminUserId !== userId) {
            return res.status(403).json({ error: 'Forbidden: Unauthorized' });
        }

        await Team.findByIdAndDelete(req.params.id);
        const allTeams = await Team.find({ room: team.room });
        const io = req.app.get('io');
        if (io) io.to(team.room.toString()).emit('teamsUpdated', allTeams);

        res.json({ message: 'Team deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE: Wipe all teams in a room (Admin protected)
router.delete('/teams', requireRoomAdmin, async (req, res) => {
    try {
        const roomId = req.query.roomId;
        await Team.deleteMany({ room: roomId });
        const io = req.app.get('io');
        if (io) io.to(roomId).emit('teamsUpdated', []);
        res.json({ message: 'All teams deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// --- RULES API ---

// GET: Fetch category rules for a room
router.get('/rules', async (req, res) => {
    try {
        const { roomId } = req.query;
        if (!roomId) return res.status(400).json({ error: 'Missing roomId' });
        let rule = await Rule.findOne({ room: roomId });
        if (!rule) {
            rule = new Rule({ room: roomId, ...DEFAULT_RULES });
            await rule.save();
        }
        res.json(rule);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST: Save/Update category rules for a room (Admin protected)
router.post('/rules', requireRoomAdmin, async (req, res) => {
    try {
        const roomId = req.body.roomId || req.query.roomId;
        const { basePrices, slots, minPlayers, maxPlayers } = req.body;
        let rule = await Rule.findOne({ room: roomId });
        if (!rule) {
            rule = new Rule({ room: roomId, basePrices, slots, minPlayers, maxPlayers });
        } else {
            rule.basePrices = basePrices;
            rule.slots = slots;
            if (minPlayers !== undefined) rule.minPlayers = minPlayers;
            if (maxPlayers !== undefined) rule.maxPlayers = maxPlayers;
        }
        await rule.save();

        const io = req.app.get('io');
        if (io) io.to(roomId).emit('rulesUpdated', rule);

        res.json(rule);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});


// --- AUCTION STATE API ---

// GET: Fetch live auction state for a room
router.get('/state', async (req, res) => {
    try {
        const { roomId } = req.query;
        if (!roomId) return res.status(400).json({ error: 'Missing roomId' });
        let state = await AuctionState.findOne({ room: roomId });
        if (!state) {
            state = new AuctionState({ room: roomId, ...DEFAULT_AUCTION_STATE });
            await state.save();
        }
        res.json(state);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST: Save/Update live auction state for a room (Admin protected)
router.post('/state', requireRoomAdmin, async (req, res) => {
    try {
        const roomId = req.body.roomId || req.query.roomId;
        let state = await AuctionState.findOne({ room: roomId });
        if (!state) {
            state = new AuctionState({ room: roomId, ...req.body });
        } else {
            Object.assign(state, req.body);
        }
        await state.save();

        const io = req.app.get('io');
        if (io) io.to(roomId).emit('auctionStateUpdated', state);

        res.json(state);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});


// --- SYSTEM/ROOM RESET API ---

// POST: Reset specific room to factory default mock dataset (Admin protected)
router.post('/rooms/:roomId/reset', requireRoomAdmin, async (req, res) => {
    try {
        const { roomId } = req.params;
        
        // Wipe room collection elements
        await Player.deleteMany({ room: roomId });
        await Team.deleteMany({ room: roomId });
        await Rule.deleteMany({ room: roomId });
        await AuctionState.deleteMany({ room: roomId });

        // Insert defaults
        const seededPlayers = await Player.insertMany(DEFAULT_PLAYERS.map(p => ({ ...p, room: roomId })));
        const seededTeams = await Team.insertMany(DEFAULT_TEAMS.map(t => ({ ...t, room: roomId })));
        
        const seededRule = new Rule({ room: roomId, ...DEFAULT_RULES });
        await seededRule.save();

        const seededState = new AuctionState({ room: roomId, ...DEFAULT_AUCTION_STATE });
        await seededState.save();

        const io = req.app.get('io');
        if (io) {
            io.to(roomId).emit('playersUpdated', seededPlayers);
            io.to(roomId).emit('teamsUpdated', seededTeams);
            io.to(roomId).emit('rulesUpdated', seededRule);
            io.to(roomId).emit('auctionStateUpdated', seededState);
        }

        res.json({
            message: 'Room reset successfully',
            players: seededPlayers,
            teams: seededTeams,
            rules: seededRule,
            state: seededState
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
