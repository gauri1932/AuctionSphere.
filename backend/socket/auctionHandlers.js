const Player = require('../models/Player');
const Team = require('../models/Team');
const Rule = require('../models/Rule');
const AuctionState = require('../models/AuctionState');

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

module.exports = (io, socket) => {
    console.log(`New client connected: ${socket.id} (Admin: ${socket.isAdmin})`);

    // Initial state sync on connection
    (async () => {
        try {
            let state = await AuctionState.findOne();
            if (!state) {
                state = new AuctionState(DEFAULT_AUCTION_STATE);
                await state.save();
            }
            socket.emit('syncAuctionState', state);
        } catch (err) {
            console.error('Error syncing socket state:', err);
        }
    })();

    // 1. Fetch initial application dataset
    socket.on('fetchInitialData', async (callback) => {
        try {
            const players = await Player.find();
            const teams = await Team.find();
            let rules = await Rule.findOne();
            if (!rules) {
                rules = new Rule(DEFAULT_RULES);
                await rules.save();
            }
            let state = await AuctionState.findOne();
            if (!state) {
                state = new AuctionState(DEFAULT_AUCTION_STATE);
                await state.save();
            }
            if (typeof callback === 'function') {
                callback({ success: true, data: { players, teams, rules, state } });
            }
        } catch (err) {
            console.error('Error fetching initial data:', err);
            if (typeof callback === 'function') {
                callback({ success: false, error: err.message });
            }
        }
    });

    // 2. Push Player to Live Stage (Admin restricted)
    socket.on('pushPlayerLive', async (data, callback) => {
        if (!socket.isAdmin) {
            if (typeof callback === 'function') return callback({ success: false, error: 'Unauthorized' });
            return;
        }

        try {
            const { playerId } = data;
            const player = await Player.findById(playerId);
            if (!player) {
                if (typeof callback === 'function') return callback({ success: false, error: 'Player not found' });
                return;
            }

            // Reset other live players
            await Player.updateMany({ status: 'Live' }, { status: 'Pending' });

            // Set current player live
            player.status = 'Live';
            await player.save();

            // Resolve base price
            const rules = await Rule.findOne() || DEFAULT_RULES;
            const configBasePrice = (rules.basePrices && rules.basePrices[player.category] !== undefined)
                ? rules.basePrices[player.category]
                : player.basePrice;

            const newState = {
                livePlayer: player,
                liveStatus: 'live',
                soldInfo: null,
                currentBid: configBasePrice,
                highestBidder: null,
                bidHistory: []
            };

            let state = await AuctionState.findOne();
            if (!state) {
                state = new AuctionState(newState);
            } else {
                Object.assign(state, newState);
            }
            await state.save();

            const freshPlayers = await Player.find();

            // Broadcast updates
            io.emit('playersUpdated', freshPlayers);
            io.emit('auctionStateUpdated', state);

            if (typeof callback === 'function') {
                callback({ success: true, data: { players: freshPlayers, state } });
            }
        } catch (err) {
            console.error('Error pushing player live:', err);
            if (typeof callback === 'function') {
                callback({ success: false, error: err.message });
            }
        }
    });

    // 3. Place Bid
    socket.on('placeBid', async (data, callback) => {
        try {
            const { teamId, teamName, bidAmount } = data;
            const state = await AuctionState.findOne();
            if (!state || state.liveStatus !== 'live' || !state.livePlayer) {
                const errMsg = 'No live auction is active.';
                if (typeof callback === 'function') return callback({ success: false, error: errMsg });
                return socket.emit('bidRejected', { message: errMsg });
            }

            // Ensure bid is higher
            if (bidAmount <= state.currentBid && state.highestBidder !== null) {
                const errMsg = 'Bid must be higher than current highest bid.';
                if (typeof callback === 'function') return callback({ success: false, error: errMsg });
                return socket.emit('bidRejected', { message: errMsg });
            }

            const team = await Team.findById(teamId) || await Team.findOne({ name: teamName });
            if (!team) {
                const errMsg = 'Team not found.';
                if (typeof callback === 'function') return callback({ success: false, error: errMsg });
                return socket.emit('bidRejected', { message: errMsg });
            }

            // Solvency check
            if (team.budget < bidAmount) {
                const errMsg = `Solvency Lockout: ${team.name} cannot afford the bid of ₹${bidAmount.toLocaleString()}`;
                if (typeof callback === 'function') return callback({ success: false, error: errMsg });
                return socket.emit('bidRejected', { message: errMsg });
            }

            // Check global squad size limit
            const teamPlayersCount = await Player.countDocuments({ status: 'Sold', winningTeam: team.name });
            const rule = await Rule.findOne() || DEFAULT_RULES;
            if (teamPlayersCount >= rule.maxPlayers) {
                const errMsg = `Max roster limit reached: ${team.name} already has ${rule.maxPlayers} players.`;
                if (typeof callback === 'function') return callback({ success: false, error: errMsg });
                return socket.emit('bidRejected', { message: errMsg });
            }

            // Check Category slot limit
            const activePlayerCat = state.livePlayer.category;
            const teamCatCount = await Player.countDocuments({ status: 'Sold', winningTeam: team.name, category: activePlayerCat });
            const maxCatSlots = (rule.slots && rule.slots[activePlayerCat]) || 999;
            if (teamCatCount >= maxCatSlots) {
                const errMsg = `Category Slot limit reached: ${team.name} already has ${teamCatCount} players in Category ${activePlayerCat}.`;
                if (typeof callback === 'function') return callback({ success: false, error: errMsg });
                return socket.emit('bidRejected', { message: errMsg });
            }

            // Check budget solvency for min required players
            const needed = rule.minPlayers - teamPlayersCount;
            if (needed > 1) {
                const prices = Object.values(rule.basePrices || DEFAULT_RULES.basePrices);
                const minPrice = Math.min(...prices);
                const requiredFundsForOthers = (needed - 1) * minPrice;
                if (team.budget - bidAmount < requiredFundsForOthers) {
                    const errMsg = `Solvency Lockout: Placing this bid will leave ${team.name} with insufficient funds to reach the minimum roster size of ${rule.minPlayers} players.`;
                    if (typeof callback === 'function') return callback({ success: false, error: errMsg });
                    return socket.emit('bidRejected', { message: errMsg });
                }
            }

            // Apply bid update
            state.currentBid = bidAmount;
            state.highestBidder = team.name;
            state.bidHistory.push({ teamId: team._id, teamName: team.name, bidAmount, time: new Date() });
            await state.save();

            // Broadcast updates
            io.emit('bidAccepted', state);
            io.emit('auctionStateUpdated', state);

            if (typeof callback === 'function') {
                callback({ success: true, data: state });
            }
        } catch (error) {
            console.error('Error processing socket bid:', error);
            if (typeof callback === 'function') {
                callback({ success: false, error: error.message });
            } else {
                socket.emit('bidRejected', { message: 'Internal server error processing bid.' });
            }
        }
    });

    // 3.5. Update Current Bid Price (Admin restricted)
    socket.on('updateCurrentBid', async (data, callback) => {
        if (!socket.isAdmin) {
            if (typeof callback === 'function') return callback({ success: false, error: 'Unauthorized' });
            return;
        }
        try {
            const { bidAmount } = data;
            const state = await AuctionState.findOne();
            if (state) {
                state.currentBid = bidAmount;
                await state.save();
                io.emit('auctionStateUpdated', state);
            }
            if (typeof callback === 'function') callback({ success: true, data: state });
        } catch (err) {
            console.error('Error updating current bid:', err);
            if (typeof callback === 'function') callback({ success: false, error: err.message });
        }
    });

    // 4. Mark Player Sold (Admin restricted)
    socket.on('markPlayerSold', async (data, callback) => {
        if (!socket.isAdmin) {
            if (typeof callback === 'function') return callback({ success: false, error: 'Unauthorized' });
            return;
        }

        try {
            const { buyingTeamId, price } = data;
            const state = await AuctionState.findOne();
            if (!state || !state.livePlayer) {
                if (typeof callback === 'function') return callback({ success: false, error: 'No live player active.' });
                return;
            }

            const winningTeam = await Team.findById(buyingTeamId);
            if (!winningTeam) {
                if (typeof callback === 'function') return callback({ success: false, error: 'Winning franchise not found.' });
                return;
            }

            const rule = await Rule.findOne() || DEFAULT_RULES;

            // Roster limit checks
            const activeCount = await Player.countDocuments({ status: 'Sold', winningTeam: winningTeam.name });
            if (activeCount >= rule.maxPlayers) {
                if (typeof callback === 'function') return callback({ success: false, error: `Roster Lockout: ${winningTeam.name} already reached the limit.` });
                return;
            }

            const activePlayerCat = state.livePlayer.category;
            const catCount = await Player.countDocuments({ status: 'Sold', winningTeam: winningTeam.name, category: activePlayerCat });
            const maxCatSlots = rule.slots?.[activePlayerCat] || 999;
            if (catCount >= maxCatSlots) {
                if (typeof callback === 'function') return callback({ success: false, error: `Category Roster Full: ${winningTeam.name} category full.` });
                return;
            }

            if (winningTeam.budget < price) {
                if (typeof callback === 'function') return callback({ success: false, error: 'Insufficient budget!' });
                return;
            }

            // Deduct winning team budget
            winningTeam.budget -= price;
            await winningTeam.save();

            // Mark Player as Sold
            const player = await Player.findById(state.livePlayer._id);
            if (player) {
                player.status = 'Sold';
                player.finalPrice = price;
                player.winningTeam = winningTeam.name;
                await player.save();
            }

            // Set state to SOLD screen
            const newState = {
                livePlayer: state.livePlayer,
                liveStatus: 'sold',
                soldInfo: {
                    teamId: winningTeam._id,
                    teamName: winningTeam.name,
                    price: price
                },
                bidHistory: []
            };
            Object.assign(state, newState);
            await state.save();

            const freshPlayers = await Player.find();
            const freshTeams = await Team.find();

            // Broadcast updates
            io.emit('playersUpdated', freshPlayers);
            io.emit('teamsUpdated', freshTeams);
            io.emit('auctionStateUpdated', state);

            if (typeof callback === 'function') {
                callback({ success: true, data: { players: freshPlayers, teams: freshTeams, state } });
            }
        } catch (err) {
            console.error('Error in markPlayerSold:', err);
            if (typeof callback === 'function') {
                callback({ success: false, error: err.message });
            }
        }
    });

    // 5. Mark Player Unsold (Admin restricted)
    socket.on('markPlayerUnsold', async (callback) => {
        if (!socket.isAdmin) {
            if (typeof callback === 'function') return callback({ success: false, error: 'Unauthorized' });
            return;
        }

        try {
            const state = await AuctionState.findOne();
            if (!state || !state.livePlayer) {
                if (typeof callback === 'function') return callback({ success: false, error: 'No live player active.' });
                return;
            }

            // Set Player status
            const player = await Player.findById(state.livePlayer._id);
            if (player) {
                player.status = 'Unsold';
                player.finalPrice = 0;
                player.winningTeam = null;
                await player.save();
            }

            // Set state status
            state.liveStatus = 'unsold';
            state.soldInfo = null;
            state.bidHistory = [];
            await state.save();

            const freshPlayers = await Player.find();

            // Broadcast updates
            io.emit('playersUpdated', freshPlayers);
            io.emit('auctionStateUpdated', state);

            if (typeof callback === 'function') {
                callback({ success: true, data: { players: freshPlayers, state } });
            }
        } catch (err) {
            console.error('Error in markPlayerUnsold:', err);
            if (typeof callback === 'function') {
                callback({ success: false, error: err.message });
            }
        }
    });

    // 6. Clear Live Stage / Revert to Waiting (Admin restricted)
    socket.on('clearLiveStage', async (callback) => {
        if (!socket.isAdmin) {
            if (typeof callback === 'function') return callback({ success: false, error: 'Unauthorized' });
            return;
        }

        try {
            const state = await AuctionState.findOne();
            if (state) {
                state.livePlayer = null;
                state.liveStatus = 'waiting';
                state.soldInfo = null;
                state.bidHistory = [];
                await state.save();
                io.emit('auctionStateUpdated', state);
            }
            if (typeof callback === 'function') {
                callback({ success: true, data: state });
            }
        } catch (err) {
            console.error('Error in clearLiveStage:', err);
            if (typeof callback === 'function') {
                callback({ success: false, error: err.message });
            }
        }
    });

    // 7. Add Player to Roster (Admin restricted)
    socket.on('addPlayer', async (playerData, callback) => {
        if (!socket.isAdmin) {
            if (typeof callback === 'function') return callback({ success: false, error: 'Unauthorized' });
            return;
        }

        try {
            const newPlayer = new Player(playerData);
            await newPlayer.save();

            const freshPlayers = await Player.find();
            io.emit('playersUpdated', freshPlayers);

            if (typeof callback === 'function') {
                callback({ success: true, data: freshPlayers });
            }
        } catch (err) {
            console.error('Error in addPlayer:', err);
            if (typeof callback === 'function') {
                callback({ success: false, error: err.message });
            }
        }
    });

    // 8. Add Franchise Team (Admin restricted)
    socket.on('addTeam', async (teamData, callback) => {
        if (!socket.isAdmin) {
            if (typeof callback === 'function') return callback({ success: false, error: 'Unauthorized' });
            return;
        }

        try {
            const newTeam = new Team(teamData);
            await newTeam.save();

            const freshTeams = await Team.find();
            io.emit('teamsUpdated', freshTeams);

            if (typeof callback === 'function') {
                callback({ success: true, data: freshTeams });
            }
        } catch (err) {
            console.error('Error in addTeam:', err);
            if (typeof callback === 'function') {
                callback({ success: false, error: err.message });
            }
        }
    });

    // 9. Delete Franchise Team (Admin restricted)
    socket.on('deleteTeam', async (data, callback) => {
        if (!socket.isAdmin) {
            if (typeof callback === 'function') return callback({ success: false, error: 'Unauthorized' });
            return;
        }

        try {
            const { teamId } = data;
            await Team.findByIdAndDelete(teamId);

            const freshTeams = await Team.find();
            io.emit('teamsUpdated', freshTeams);

            if (typeof callback === 'function') {
                callback({ success: true, data: freshTeams });
            }
        } catch (err) {
            console.error('Error in deleteTeam:', err);
            if (typeof callback === 'function') {
                callback({ success: false, error: err.message });
            }
        }
    });

    // 10. Save Rules (Admin restricted)
    socket.on('updateRules', async (rulesData, callback) => {
        if (!socket.isAdmin) {
            if (typeof callback === 'function') return callback({ success: false, error: 'Unauthorized' });
            return;
        }

        try {
            const { basePrices, slots, minPlayers, maxPlayers } = rulesData;
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

            io.emit('rulesUpdated', rule);

            if (typeof callback === 'function') {
                callback({ success: true, data: rule });
            }
        } catch (err) {
            console.error('Error in updateRules:', err);
            if (typeof callback === 'function') {
                callback({ success: false, error: err.message });
            }
        }
    });

    // 11. System Reset (Admin restricted, Elevated Check & Confirmation Safety Guard)
    socket.on('systemReset', async (data, callback) => {
        if (!socket.isAdmin) {
            if (typeof callback === 'function') return callback({ success: false, error: 'Unauthorized' });
            return;
        }

        const { confirm, securityPin, type } = data || {};

        if (!confirm) {
            if (typeof callback === 'function') {
                return callback({ success: false, error: 'Confirmation required' });
            }
            return;
        }

        if (securityPin !== '1234') {
            if (typeof callback === 'function') {
                return callback({ success: false, error: 'Invalid security PIN' });
            }
            return;
        }

        try {
            if (type === 'hard') {
                await Player.deleteMany({});
                await Team.deleteMany({});
                await Rule.deleteMany({});
                await AuctionState.deleteMany({});

                const seededPlayers = await Player.insertMany(DEFAULT_PLAYERS);
                const seededTeams = await Team.insertMany(DEFAULT_TEAMS);
                
                const seededRule = new Rule(DEFAULT_RULES);
                await seededRule.save();

                const seededState = new AuctionState(DEFAULT_AUCTION_STATE);
                await seededState.save();

                io.emit('playersUpdated', seededPlayers);
                io.emit('teamsUpdated', seededTeams);
                io.emit('rulesUpdated', seededRule);
                io.emit('auctionStateUpdated', seededState);

                if (typeof callback === 'function') {
                    callback({ success: true, data: { players: seededPlayers, teams: seededTeams, rules: seededRule, state: seededState } });
                }
            } else if (type === 'clear') {
                await Player.deleteMany({});
                await Team.deleteMany({});
                await AuctionState.deleteMany({});

                const cleanState = {
                    livePlayer: null,
                    liveStatus: 'waiting',
                    soldInfo: null,
                    bidHistory: []
                };
                const seededState = new AuctionState(cleanState);
                await seededState.save();

                io.emit('playersUpdated', []);
                io.emit('teamsUpdated', []);
                io.emit('auctionStateUpdated', seededState);

                if (typeof callback === 'function') {
                    callback({ success: true, data: { players: [], teams: [], state: seededState } });
                }
            }
        } catch (err) {
            console.error('Error in systemReset:', err);
            if (typeof callback === 'function') {
                callback({ success: false, error: err.message });
            }
        }
    });

    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
    });
};
