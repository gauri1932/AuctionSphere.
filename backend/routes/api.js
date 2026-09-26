const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { clerkMiddleware, getAuth } = require('@clerk/express');

const Player = require('../models/Player');
const Team = require('../models/Team');
const Rule = require('../models/Rule');
const AuctionState = require('../models/AuctionState');
const Room = require('../models/Room');
const { parseText, parseRuleSet } = require('../utils/validators');
const { buildPlayerDoc, buildTeamDoc, hasDuplicateTeamNames, MAX_ROSTER_UPLOAD } = require('../utils/sanitizers');

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
        // req.body is undefined in Express 5 when a request carries no body
        // (for example a DELETE with only a query string).
        const body = req.body || {};
        const roomId = req.params.roomId || body.roomId || req.query.roomId;
        if (!roomId || !mongoose.Types.ObjectId.isValid(roomId)) {
            return res.status(400).json({ error: 'Bad Request: Missing or invalid room ID' });
        }
        const room = await Room.findById(roomId);
        if (!room) {
            return res.status(404).json({ error: 'Room not found' });
        }

        if (!room.adminUserId || room.adminUserId === 'ADMIN') {
            return res.status(403).json({ error: 'Forbidden: This room has no valid owner' });
        }

        if (room.adminUserId !== userId) {
            return res.status(403).json({ error: 'Forbidden: You are not the admin of this room' });
        }
        req.room = room;
        next();
    } catch (err) {
        console.error('requireRoomAdmin failed:', err);
        res.status(500).json({ error: 'Could not verify room ownership' });
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
        const body = req.body || {};
        const nameCheck = parseText(body.name, { field: 'Room name', min: 3, max: 80 });
        if (!nameCheck.ok) {
            return res.status(400).json({ error: nameCheck.error });
        }
        const passkeyCheck = parseText(body.passkey, { field: 'Room passkey', min: 6, max: 64 });
        if (!passkeyCheck.ok) {
            return res.status(400).json({ error: passkeyCheck.error });
        }

        const adminName = sessionClaims?.username || sessionClaims?.email || 'Admin';

        // Create Room
        const room = new Room({
            name: nameCheck.value,
            passkey: passkeyCheck.value,
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
        console.error('Failed to create room:', err);
        res.status(500).json({ error: 'Could not create the room' });
    }
});

// GET: Fetch list of rooms (never exposes passkeys or owner identity)
router.get('/rooms', async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 50));
        const filter = {};

        // An authenticated caller only ever sees the rooms they own. Anonymous
        // callers get a minimal directory so the passkey join flow still works.
        const { userId } = getAuth(req);
        if (userId) {
            filter.adminUserId = userId;
        }

        const rooms = await Room.find(filter)
            .select(userId ? '-passkey' : '-passkey -adminUserId -adminName')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit);

        res.json(rooms);
    } catch (err) {
        console.error('Failed to list rooms:', err);
        res.status(500).json({ error: 'Could not load rooms' });
    }
});

// GET: Fetch single room details (excludes passkey)
router.get('/rooms/:roomId', async (req, res) => {
    try {
        const { userId } = getAuth(req);
        const room = await Room.findById(req.params.roomId).select('-passkey');
        if (!room) return res.status(404).json({ error: 'Room not found' });

        // Owner identity is only useful to the owner. Exposing it to every
        // signed-in caller would let anyone enumerate who owns which room.
        const isOwner = !!userId
            && !!room.adminUserId
            && room.adminUserId !== 'ADMIN'
            && room.adminUserId === userId;
        if (!isOwner) {
            room.set('adminUserId', undefined);
            room.set('adminName', undefined);
        }

        res.json(room);
    } catch (err) {
        if (err.name === 'CastError') {
            return res.status(400).json({ error: 'Invalid room ID' });
        }
        console.error('Failed to load room:', err);
        res.status(500).json({ error: 'Could not load the room' });
    }
});


// POST: Verify passkey or check room admin ownership
router.post('/rooms/:roomId/verify-passkey', async (req, res) => {
    try {
        const body = req.body || {};
        const { passkey } = body;
        const { userId } = getAuth(req);
        const room = await Room.findById(req.params.roomId);
        if (!room) {
            return res.status(404).json({ error: 'Room not found' });
        }

        if (userId && room.adminUserId && room.adminUserId !== 'ADMIN' && room.adminUserId === userId) {
            return res.json({ success: true, isAdmin: true });
        }

        const passkeyCheck = parseText(passkey, { field: 'Room passkey', min: 1, max: 64 });
        if (!passkeyCheck.ok || room.passkey !== passkeyCheck.value) {
            return res.status(401).json({ success: false, error: 'Incorrect passkey' });
        }

        return res.json({ success: true, isAdmin: false });
    } catch (err) {
        if (err.name === 'CastError') {
            return res.status(400).json({ error: 'Invalid room ID' });
        }
        console.error('Failed to verify passkey:', err);
        res.status(500).json({ error: 'Could not verify the passkey' });
    }
});


// --- PLAYERS API ---


// GET: Fetch all players in a room
router.get('/players', async (req, res) => {
    try {
        const { roomId } = req.query;
        if (!roomId) return res.status(400).json({ error: 'Missing roomId' });
        if (!mongoose.Types.ObjectId.isValid(roomId)) return res.status(400).json({ error: 'Invalid roomId' });
        const players = await Player.find({ room: roomId });
        res.json(players);
    } catch (err) {
        console.error('Failed to load players:', err);
        res.status(500).json({ error: 'Could not load players' });
    }
});

// POST: Add new player(s) to a room (Admin protected)
router.post('/players', requireRoomAdmin, async (req, res) => {
    try {
        const body = req.body || {};
        const roomId = body.roomId || req.query.roomId;
        const data = body.data || body;
        let result;

        if (Array.isArray(data)) {
            if (data.length > MAX_ROSTER_UPLOAD) {
                return res.status(413).json({ error: 'Too many players in one upload (max ' + MAX_ROSTER_UPLOAD + ')' });
            }
            const docs = data.map((p) => buildPlayerDoc(p, roomId)).filter(Boolean);
            if (docs.length !== data.length) {
                return res.status(400).json({ error: 'One or more players were missing a name or category' });
            }
            await Player.deleteMany({ room: roomId });
            result = await Player.insertMany(docs);
        } else {
            const doc = buildPlayerDoc(data, roomId);
            if (!doc) {
                return res.status(400).json({ error: 'Player name and category are required' });
            }
            result = new Player(doc);
            await result.save();
        }

        const allPlayers = await Player.find({ room: roomId });
        const freshTeams = await getReconciledTeams(roomId);
        const io = req.app.get('io');
        if (io) {
            io.to(roomId).emit('playersUpdated', allPlayers);
            io.to(roomId).emit('teamsUpdated', freshTeams);
        }

        res.status(Array.isArray(data) ? 200 : 201).json(result);
    } catch (err) {
        console.error('Failed to save players:', err);
        res.status(400).json({ error: err.name === 'ValidationError' ? 'Invalid player data' : 'Could not save players' });
    }
});

// DELETE: Wipe all players in a room (Admin protected)
router.delete('/players', requireRoomAdmin, async (req, res) => {
    try {
        const roomId = req.query.roomId;
        await Player.deleteMany({ room: roomId });
        const freshTeams = await getReconciledTeams(roomId);
        const io = req.app.get('io');
        if (io) {
            io.to(roomId).emit('playersUpdated', []);
            io.to(roomId).emit('teamsUpdated', freshTeams);
        }
        res.json({ message: 'All players deleted successfully' });
    } catch (err) {
        console.error('Request failed:', err);
        res.status(500).json({ error: 'Unexpected server error' });
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
        console.error('Request failed:', err);
        res.status(500).json({ error: 'Unexpected server error' });
    }
});

// POST: Add new team(s) to a room (Admin protected)
router.post('/teams', requireRoomAdmin, async (req, res) => {
    try {
        const body = req.body || {};
        const roomId = body.roomId || req.query.roomId;
        const data = body.data || body;
        let result;

        if (Array.isArray(data)) {
            if (data.length > 200) {
                return res.status(413).json({ error: 'Too many teams in one upload (max 200)' });
            }
            const docs = data.map((t) => buildTeamDoc(t, roomId)).filter(Boolean);
            if (docs.length !== data.length) {
                return res.status(400).json({ error: 'One or more teams were missing a name or a valid budget' });
            }
            if (hasDuplicateTeamNames(docs)) {
                return res.status(400).json({ error: 'Team names must be unique within a room' });
            }
            await Team.deleteMany({ room: roomId });
            result = await Team.insertMany(docs);
        } else {
            const doc = buildTeamDoc(data, roomId);
            if (!doc) {
                return res.status(400).json({ error: 'Team name and a valid budget are required' });
            }
            const clash = await Team.exists({ room: roomId, name: doc.name });
            if (clash) {
                return res.status(409).json({ error: 'A team with that name already exists in this room' });
            }
            result = new Team(doc);
            await result.save();
        }

        const allTeams = await getReconciledTeams(roomId);
        const io = req.app.get('io');
        if (io) io.to(roomId).emit('teamsUpdated', allTeams);

        res.status(Array.isArray(data) ? 200 : 201).json(result);
    } catch (err) {
        console.error('Failed to save teams:', err);
        res.status(400).json({ error: err.name === 'ValidationError' ? 'Invalid team data' : 'Could not save teams' });
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
        if (!room || !room.adminUserId || room.adminUserId === 'ADMIN' || room.adminUserId !== userId) {
            return res.status(403).json({ error: 'Forbidden: Unauthorized' });
        }

        // Refuse to orphan players already sold to this team, which would
        // silently drop their spend out of every total and summary.
        const owned = await Player.countDocuments({ room: team.room, status: 'Sold', winningTeam: team.name });
        if (owned > 0) {
            return res.status(409).json({
                error: `${team.name} owns ${owned} sold player${owned === 1 ? '' : 's'}. Undo those sales before deleting the team.`,
            });
        }

        await Team.findByIdAndDelete(req.params.id);
        const allTeams = await getReconciledTeams(team.room);

        const io = req.app.get('io');
        if (io) io.to(team.room.toString()).emit('teamsUpdated', allTeams);

        res.json({ message: 'Team deleted successfully' });
    } catch (err) {
        console.error('Request failed:', err);
        res.status(500).json({ error: 'Unexpected server error' });
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
        console.error('Request failed:', err);
        res.status(500).json({ error: 'Unexpected server error' });
    }
});


// --- RULES API ---

// GET: Fetch category rules for a room
router.get('/rules', async (req, res) => {
    try {
        const { roomId } = req.query;
        if (!roomId) return res.status(400).json({ error: 'Missing roomId' });
        if (!mongoose.Types.ObjectId.isValid(roomId)) return res.status(400).json({ error: 'Invalid roomId' });
        let rule = await Rule.findOne({ room: roomId });
        if (!rule) {
            rule = new Rule({ room: roomId, ...DEFAULT_RULES });
            await rule.save();
        }
        res.json(rule);
    } catch (err) {
        console.error('Failed to load rules:', err);
        res.status(500).json({ error: 'Could not load rules' });
    }
});


// POST: Save/Update category rules for a room (Admin protected)
router.post('/rules', requireRoomAdmin, async (req, res) => {
    try {
        const body = req.body || {};
        const roomId = body.roomId || req.query.roomId;
        let rule = await Rule.findOne({ room: roomId });

        // Start from the stored values so a partial update cannot blank a field.
        const merged = {
            basePrices: { ...(rule ? rule.basePrices.toObject() : DEFAULT_RULES.basePrices), ...(body.basePrices || {}) },
            slots: { ...(rule ? rule.slots.toObject() : DEFAULT_RULES.slots), ...(body.slots || {}) },
            minPlayers: body.minPlayers !== undefined ? body.minPlayers : (rule ? rule.minPlayers : DEFAULT_RULES.minPlayers),
            maxPlayers: body.maxPlayers !== undefined ? body.maxPlayers : (rule ? rule.maxPlayers : DEFAULT_RULES.maxPlayers),
        };

        const check = parseRuleSet(merged);
        if (!check.ok) {
            return res.status(400).json({ error: check.error, errors: check.errors });
        }

        if (!rule) {
            rule = new Rule({ room: roomId, ...check.value });
        } else {
            rule.basePrices = check.value.basePrices;
            rule.slots = check.value.slots;
            rule.minPlayers = check.value.minPlayers;
            rule.maxPlayers = check.value.maxPlayers;
        }
        await rule.save();

        const io = req.app.get('io');
        if (io) io.to(roomId).emit('rulesUpdated', rule);

        res.json(rule);
    } catch (err) {
        console.error('Failed to save rules:', err);
        res.status(400).json({ error: 'Could not save the rules' });
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
        console.error('Request failed:', err);
        res.status(500).json({ error: 'Unexpected server error' });
    }
});

// POST: Save/Update live auction state for a room (Admin protected)
// Only the coarse phase flag is writable over REST. Bid amounts, the leading
// bidder and bid history are owned exclusively by the socket handlers, so this
// endpoint cannot be used to sidestep the solvency and atomicity guarantees.
router.post('/state', requireRoomAdmin, async (req, res) => {
    try {
        const body = req.body || {};
        const roomId = body.roomId || req.query.roomId;
        const allowed = ['waiting', 'live', 'sold', 'unsold'];
        if (!allowed.includes(body.liveStatus)) {
            return res.status(400).json({ error: `liveStatus must be one of: ${allowed.join(', ')}` });
        }
        const state = await AuctionState.findOneAndUpdate(
            { room: roomId },
            { $set: { liveStatus: body.liveStatus } },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );

        const io = req.app.get('io');
        if (io) io.to(roomId).emit('auctionStateUpdated', state);

        res.json(state);
    } catch (err) {
        console.error('Failed to update state:', err);
        res.status(400).json({ error: 'Could not update the auction state' });
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
        console.error('Request failed:', err);
        res.status(500).json({ error: 'Unexpected server error' });
    }
});

module.exports = router;
