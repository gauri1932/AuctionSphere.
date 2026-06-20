const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Player = require('../models/Player');
const Team = require('../models/Team');
const Rule = require('../models/Rule');
const AuctionState = require('../models/AuctionState');

// Default sets to seed on system reset
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

// --- PLAYERS API ---

// GET: Fetch all players
router.get('/players', async (req, res) => {
    try {
        const players = await Player.find();
        res.json(players);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST: Add new player(s)
router.post('/players', async (req, res) => {
    try {
        const data = req.body;    //req.body is a built-in property in Express that holds all the data sent by the client (frontend) in the body of the HTTP request.
        let result;
        // If it's a bulk save of the entire roster
        if (Array.isArray(data)) {
            // Delete all and insert the new array
            await Player.deleteMany({});
            result = await Player.insertMany(data.map(p => {
                const { id, _id, ...rest } = p;
                const idToUse = _id || id;
                if (idToUse && mongoose.Types.ObjectId.isValid(idToUse)) {
                    return { _id: idToUse, ...rest };
                }
                return rest;
            }));
        } else {
            // Single player creation
            const { name, photo, category, basePrice, age, status, finalPrice, winningTeam } = data;
            result = new Player({ name, photo, category, basePrice, age, status, finalPrice, winningTeam });
            await result.save();
        }

        const allPlayers = await Player.find();
        const io = req.app.get('io');
        if (io) io.emit('playersUpdated', allPlayers);

        res.status(Array.isArray(data) ? 200 : 201).json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// DELETE: Wipe all players
router.delete('/players', async (req, res) => {
    try {
        await Player.deleteMany({});
        const io = req.app.get('io');
        if (io) io.emit('playersUpdated', []);
        res.json({ message: 'All players deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// --- TEAMS API ---

// GET: Fetch all teams
router.get('/teams', async (req, res) => {
    try {
        const teams = await Team.find();
        res.json(teams);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST: Add new team(s)
router.post('/teams', async (req, res) => {
    try {
        const data = req.body;
        let result;
        if (Array.isArray(data)) {
            await Team.deleteMany({});
            result = await Team.insertMany(data.map(t => {
                const { id, _id, ...rest } = t;
                const idToUse = _id || id;
                if (idToUse && mongoose.Types.ObjectId.isValid(idToUse)) {
                    return { _id: idToUse, ...rest };
                }
                return rest;
            }));
        } else {
            const { name, budget, initialBudget } = data;
            result = new Team({ name, budget, initialBudget });
            await result.save();
        }

        const allTeams = await Team.find();
        const io = req.app.get('io');
        if (io) io.emit('teamsUpdated', allTeams);

        res.status(Array.isArray(data) ? 200 : 201).json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// DELETE: Wipe or delete specific team
router.delete('/teams/:id', async (req, res) => {
    try {
        await Team.findByIdAndDelete(req.params.id);
        const allTeams = await Team.find();
        const io = req.app.get('io');
        if (io) io.emit('teamsUpdated', allTeams);
        res.json({ message: 'Team deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/teams', async (req, res) => {
    try {
        await Team.deleteMany({});
        const io = req.app.get('io');
        if (io) io.emit('teamsUpdated', []);
        res.json({ message: 'All teams deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// --- RULES API ---

// GET: Fetch category rules
router.get('/rules', async (req, res) => {
    try {
        let rule = await Rule.findOne();
        if (!rule) {
            rule = new Rule(DEFAULT_RULES);
            await rule.save();
        }
        res.json(rule);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST: Save/Update category rules
router.post('/rules', async (req, res) => {
    try {
        const { basePrices, slots, minPlayers, maxPlayers } = req.body;
        let rule = await Rule.findOne();
        if (!rule) {
            rule = new Rule({ basePrices, slots, minPlayers, maxPlayers });
        } else {
            rule.basePrices = basePrices;
            rule.slots = slots;
            if (minPlayers !== undefined) rule.minPlayers = minPlayers;
            if (maxPlayers !== undefined) rule.maxPlayers = maxPlayers;
        }
        await rule.save();

        const io = req.app.get('io');
        if (io) io.emit('rulesUpdated', rule);

        res.json(rule);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});


// --- AUCTION STATE API ---

// GET: Fetch live auction state
router.get('/state', async (req, res) => {
    try {
        let state = await AuctionState.findOne();
        if (!state) {
            state = new AuctionState(DEFAULT_AUCTION_STATE);
            await state.save();
        }
        res.json(state);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST: Save/Update live auction state
router.post('/state', async (req, res) => {
    try {
        let state = await AuctionState.findOne();
        if (!state) {
            state = new AuctionState(req.body);
        } else {
            Object.assign(state, req.body);
        }
        await state.save();

        const io = req.app.get('io');
        if (io) io.emit('auctionStateUpdated', state);

        res.json(state);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});


// --- SYSTEM RESET API ---

// POST: Reset system to factory default mock dataset
router.post('/system/reset', async (req, res) => {
    try {
        // Wipe all collections
        await Player.deleteMany({});
        await Team.deleteMany({});
        await Rule.deleteMany({});
        await AuctionState.deleteMany({});

        // Insert defaults
        const seededPlayers = await Player.insertMany(DEFAULT_PLAYERS);
        const seededTeams = await Team.insertMany(DEFAULT_TEAMS);
        
        const seededRule = new Rule(DEFAULT_RULES);
        await seededRule.save();

        const seededState = new AuctionState(DEFAULT_AUCTION_STATE);
        await seededState.save();

        const io = req.app.get('io');
        if (io) {
            io.emit('playersUpdated', seededPlayers);
            io.emit('teamsUpdated', seededTeams);
            io.emit('rulesUpdated', seededRule);
            io.emit('auctionStateUpdated', seededState);
        }

        res.json({
            message: 'System reset successfully',
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
