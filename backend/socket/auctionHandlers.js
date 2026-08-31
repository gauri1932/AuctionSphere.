const mongoose = require('mongoose');
const Player = require('../models/Player');
const Team = require('../models/Team');
const Rule = require('../models/Rule');
const AuctionState = require('../models/AuctionState');
const Room = require('../models/Room');

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
    console.log(`New client socket connected: ${socket.id}`);

    // Helper to ensure socket has joined a room before running database/broadcast actions
    const getRoomId = (callback) => {
        if (!socket.roomId) {
            if (typeof callback === 'function') callback({ success: false, error: 'Unauthorized: Room not joined.' });
            return null;
        }
        return socket.roomId;
    };

    // 0. Join Room (Handles authentication and sets admin rights on success)
    socket.on('joinRoom', async ({ roomId, passkey, clerkToken }, callback) => {
        try {
            if (!roomId || !mongoose.Types.ObjectId.isValid(roomId)) {
                if (typeof callback === 'function') callback({ success: false, error: 'Invalid room ID.' });
                return;
            }

            const room = await Room.findById(roomId);
            if (!room) {
                if (typeof callback === 'function') callback({ success: false, error: 'Room not found.' });
                return;
            }

            let isAdmin = false;
            if (clerkToken) {
                try {
                    const { verifyToken } = require('@clerk/express');
                    const decoded = await verifyToken(clerkToken, {
                        secretKey: process.env.CLERK_SECRET_KEY
                    });
                    if (decoded && decoded.sub === room.adminUserId) {
                        isAdmin = true;
                    }
                } catch (jwtErr) {
                    console.error('Socket JWT verification failed:', jwtErr.message);
                }
            }

            // If not verified as admin, check room passkey
            if (!isAdmin) {
                if (room.passkey !== passkey) {
                    if (typeof callback === 'function') callback({ success: false, error: 'Incorrect room passkey.' });
                    return;
                }
            }

            // Leave any previously joined room channels
            const activeRooms = Array.from(socket.rooms);
            for (const r of activeRooms) {
                if (r !== socket.id) {
                    socket.leave(r);
                }
            }

            // Join the specific room channel
            socket.join(roomId.toString());
            socket.roomId = roomId.toString();
            socket.isAdmin = isAdmin;

            // Fetch room state
            const players = await Player.find({ room: roomId });
            const teams = await Team.find({ room: roomId });
            let rules = await Rule.findOne({ room: roomId });
            if (!rules) {
                rules = new Rule({ room: roomId, ...DEFAULT_RULES });
                await rules.save();
            }
            let state = await AuctionState.findOne({ room: roomId });
            if (!state) {
                state = new AuctionState({ room: roomId, ...DEFAULT_AUCTION_STATE });
                await state.save();
            }

            console.log(`Socket ${socket.id} successfully joined Room ${roomId} (Admin: ${isAdmin})`);

            if (typeof callback === 'function') {
                callback({
                    success: true,
                    data: { players, teams, rules, state },
                    isAdmin
                });
            }
        } catch (err) {
            console.error('Error joining socket room:', err);
            if (typeof callback === 'function') callback({ success: false, error: err.message });
        }
    });

    // 1. Fetch initial application dataset
    socket.on('fetchInitialData', async (callback) => {
        const roomId = getRoomId(callback);
        if (!roomId) return;

        try {
            const players = await Player.find({ room: roomId });
            const teams = await Team.find({ room: roomId });
            let rules = await Rule.findOne({ room: roomId });
            if (!rules) {
                rules = new Rule({ room: roomId, ...DEFAULT_RULES });
                await rules.save();
            }
            let state = await AuctionState.findOne({ room: roomId });
            if (!state) {
                state = new AuctionState({ room: roomId, ...DEFAULT_AUCTION_STATE });
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
        const roomId = getRoomId(callback);
        if (!roomId) return;

        if (!socket.isAdmin) {
            if (typeof callback === 'function') return callback({ success: false, error: 'Unauthorized' });
            return;
        }

        try {
            const { playerId } = data;
            const player = await Player.findOne({ _id: playerId, room: roomId });
            if (!player) {
                if (typeof callback === 'function') return callback({ success: false, error: 'Player not found in this room.' });
                return;
            }

            // Reset other live players in this room
            await Player.updateMany({ room: roomId, status: 'Live' }, { status: 'Pending' });

            // Set current player live
            player.status = 'Live';
            await player.save();

            // Resolve base price
            const rules = await Rule.findOne({ room: roomId }) || DEFAULT_RULES;
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

            let state = await AuctionState.findOne({ room: roomId });
            if (!state) {
                state = new AuctionState({ room: roomId, ...newState });
            } else {
                Object.assign(state, newState);
            }
            await state.save();

            const freshPlayers = await Player.find({ room: roomId });

            // Broadcast updates to room
            io.to(roomId).emit('playersUpdated', freshPlayers);
            io.to(roomId).emit('auctionStateUpdated', state);

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
        const roomId = getRoomId(callback);
        if (!roomId) return;

        if (!socket.isAdmin) {
            if (typeof callback === 'function') return callback({ success: false, error: 'Unauthorized' });
            return;
        }

        try {
            const { teamId, teamName, bidAmount } = data;

            // 1. Fetch State, Team, and Rules concurrently
            const teamQuery = (teamId && mongoose.Types.ObjectId.isValid(teamId))
                ? { _id: teamId, room: roomId }
                : { name: teamName, room: roomId };

            const [state, team, rule] = await Promise.all([
                AuctionState.findOne({ room: roomId }),
                Team.findOne(teamQuery),
                Rule.findOne({ room: roomId })
            ]);

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

            if (!team) {
                const errMsg = 'Team not found in this room.';
                if (typeof callback === 'function') return callback({ success: false, error: errMsg });
                return socket.emit('bidRejected', { message: errMsg });
            }

            // Solvency check
            if (team.budget < bidAmount) {
                const errMsg = `Solvency Lockout: ${team.name} cannot afford the bid of ₹${bidAmount.toLocaleString()}`;
                if (typeof callback === 'function') return callback({ success: false, error: errMsg });
                return socket.emit('bidRejected', { message: errMsg });
            }

            const activePlayerCat = state.livePlayer.category;

            // 2. Fetch team players counts concurrently
            const [teamPlayersCount, teamCatCount] = await Promise.all([
                Player.countDocuments({ room: roomId, status: 'Sold', winningTeam: team.name }),
                Player.countDocuments({ room: roomId, status: 'Sold', winningTeam: team.name, category: activePlayerCat })
            ]);

            const activeRule = rule || DEFAULT_RULES;

            // Check global squad size limit
            if (teamPlayersCount >= activeRule.maxPlayers) {
                const errMsg = `Max roster limit reached: ${team.name} already has ${activeRule.maxPlayers} players.`;
                if (typeof callback === 'function') return callback({ success: false, error: errMsg });
                return socket.emit('bidRejected', { message: errMsg });
            }

            // Check Category slot limit
            const maxCatSlots = (activeRule.slots && activeRule.slots[activePlayerCat]) || 999;
            if (teamCatCount >= maxCatSlots) {
                const errMsg = `Category Slot limit reached: ${team.name} already has ${teamCatCount} players in Category ${activePlayerCat}.`;
                if (typeof callback === 'function') return callback({ success: false, error: errMsg });
                return socket.emit('bidRejected', { message: errMsg });
            }

            // Check budget solvency for min required players
            const needed = activeRule.minPlayers - teamPlayersCount;
            if (needed > 1) {
                const prices = Object.values(activeRule.basePrices || DEFAULT_RULES.basePrices);
                const minPrice = Math.min(...prices);
                const requiredFundsForOthers = (needed - 1) * minPrice;
                if (team.budget - bidAmount < requiredFundsForOthers) {
                    const errMsg = `Solvency Lockout: Placing this bid will leave ${team.name} with insufficient funds to reach the minimum roster size of ${activeRule.minPlayers} players.`;
                    if (typeof callback === 'function') return callback({ success: false, error: errMsg });
                    return socket.emit('bidRejected', { message: errMsg });
                }
            }

            // Apply bid update
            state.currentBid = bidAmount;
            state.highestBidder = team.name;
            state.bidHistory.push({ teamId: team._id, teamName: team.name, bidAmount, time: new Date() });
            await state.save();

            // Broadcast updates to room
            io.to(roomId).emit('bidAccepted', state);
            io.to(roomId).emit('auctionStateUpdated', state);

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
        const roomId = getRoomId(callback);
        if (!roomId) return;

        if (!socket.isAdmin) {
            if (typeof callback === 'function') return callback({ success: false, error: 'Unauthorized' });
            return;
        }
        try {
            const { bidAmount } = data;
            const state = await AuctionState.findOne({ room: roomId });
            if (state) {
                state.currentBid = bidAmount;
                await state.save();
                io.to(roomId).emit('auctionStateUpdated', state);
            }
            if (typeof callback === 'function') callback({ success: true, data: state });
        } catch (err) {
            console.error('Error updating current bid:', err);
            if (typeof callback === 'function') callback({ success: false, error: err.message });
        }
    });

    // 4. Mark Player Sold (Admin restricted)
    socket.on('markPlayerSold', async (data, callback) => {
        const roomId = getRoomId(callback);
        if (!roomId) return;

        if (!socket.isAdmin) {
            if (typeof callback === 'function') return callback({ success: false, error: 'Unauthorized' });
            return;
        }

        try {
            const { buyingTeamId, price } = data;
            const state = await AuctionState.findOne({ room: roomId });
            if (!state || !state.livePlayer) {
                if (typeof callback === 'function') return callback({ success: false, error: 'No live player active.' });
                return;
            }

            if (state.liveStatus === 'sold') {
                if (typeof callback === 'function') return callback({ success: false, error: 'Player is already sold.' });
                return;
            }

            const winningTeam = await Team.findOne({ _id: buyingTeamId, room: roomId });
            if (!winningTeam) {
                if (typeof callback === 'function') return callback({ success: false, error: 'Winning franchise not found in this room.' });
                return;
            }

            const rule = await Rule.findOne({ room: roomId }) || DEFAULT_RULES;

            // Roster limit checks
            const activeCount = await Player.countDocuments({ room: roomId, status: 'Sold', winningTeam: winningTeam.name });
            if (activeCount >= rule.maxPlayers) {
                if (typeof callback === 'function') return callback({ success: false, error: `Roster Lockout: ${winningTeam.name} already reached the limit.` });
                return;
            }

            const activePlayerCat = state.livePlayer.category;
            const catCount = await Player.countDocuments({ room: roomId, status: 'Sold', winningTeam: winningTeam.name, category: activePlayerCat });
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
            const player = await Player.findOne({ _id: state.livePlayer._id, room: roomId });
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
                }
            };
            Object.assign(state, newState);
            await state.save();

            const freshPlayers = await Player.find({ room: roomId });
            const freshTeams = await Team.find({ room: roomId });

            // Broadcast updates to room
            io.to(roomId).emit('playersUpdated', freshPlayers);
            io.to(roomId).emit('teamsUpdated', freshTeams);
            io.to(roomId).emit('auctionStateUpdated', state);

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
        const roomId = getRoomId(callback);
        if (!roomId) return;

        if (!socket.isAdmin) {
            if (typeof callback === 'function') return callback({ success: false, error: 'Unauthorized' });
            return;
        }

        try {
            const state = await AuctionState.findOne({ room: roomId });
            if (!state || !state.livePlayer) {
                if (typeof callback === 'function') return callback({ success: false, error: 'No live player active.' });
                return;
            }

            // Set Player status
            const player = await Player.findOne({ _id: state.livePlayer._id, room: roomId });
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

            const freshPlayers = await Player.find({ room: roomId });

            // Broadcast updates to room
            io.to(roomId).emit('playersUpdated', freshPlayers);
            io.to(roomId).emit('auctionStateUpdated', state);

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
        const roomId = getRoomId(callback);
        if (!roomId) return;

        if (!socket.isAdmin) {
            if (typeof callback === 'function') return callback({ success: false, error: 'Unauthorized' });
            return;
        }

        try {
            const state = await AuctionState.findOne({ room: roomId });
            if (state) {
                state.livePlayer = null;
                state.liveStatus = 'waiting';
                state.soldInfo = null;
                state.bidHistory = [];
                await state.save();
                io.to(roomId).emit('auctionStateUpdated', state);
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

    // 6.5. Undo Last Bid (Admin restricted)
    socket.on('undoLastBid', async (callback) => {
        const roomId = getRoomId(callback);
        if (!roomId) return;

        if (!socket.isAdmin) {
            if (typeof callback === 'function') return callback({ success: false, error: 'Unauthorized' });
            return;
        }

        try {
            const state = await AuctionState.findOne({ room: roomId });
            if (!state || state.liveStatus !== 'live' || !state.livePlayer) {
                if (typeof callback === 'function') return callback({ success: false, error: 'No live auction is active.' });
                return;
            }

            if (!state.bidHistory || state.bidHistory.length === 0) {
                if (typeof callback === 'function') return callback({ success: false, error: 'No bids to undo.' });
                return;
            }

            // Remove the last bid
            state.bidHistory.pop();

            // Set current bid to the previous bid, or basePrice if no bids left
            if (state.bidHistory.length > 0) {
                const prevBid = state.bidHistory[state.bidHistory.length - 1];
                state.currentBid = prevBid.bidAmount;
                state.highestBidder = prevBid.teamName;
            } else {
                const rules = await Rule.findOne({ room: roomId }) || DEFAULT_RULES;
                state.currentBid = (rules.basePrices && rules.basePrices[state.livePlayer.category] !== undefined)
                    ? rules.basePrices[state.livePlayer.category]
                    : state.livePlayer.basePrice;
                state.highestBidder = null;
            }

            await state.save();

            io.to(roomId).emit('auctionStateUpdated', state);

            if (typeof callback === 'function') {
                callback({ success: true, data: state });
            }
        } catch (err) {
            console.error('Error in undoLastBid:', err);
            if (typeof callback === 'function') callback({ success: false, error: err.message });
        }
    });

    // 6.6. Undo Player Sale (Admin restricted)
    socket.on('undoPlayerSale', async (data, callback) => {
        const roomId = getRoomId(callback);
        if (!roomId) return;

        if (!socket.isAdmin) {
            if (typeof callback === 'function') return callback({ success: false, error: 'Unauthorized' });
            return;
        }

        try {
            const { playerId } = data;
            const player = await Player.findOne({ _id: playerId, room: roomId });
            if (!player || player.status !== 'Sold') {
                if (typeof callback === 'function') return callback({ success: false, error: 'Sold player not found.' });
                return;
            }

            // Find the team to refund
            const team = await Team.findOne({ name: player.winningTeam, room: roomId });
            if (team) {
                team.budget += player.finalPrice;
                await team.save();
            }

            // Restore player status back to Live
            player.status = 'Live';
            player.finalPrice = 0;
            player.winningTeam = null;
            await player.save();

            // Restore AuctionState
            const state = await AuctionState.findOne({ room: roomId });
            if (state) {
                state.livePlayer = player;
                state.liveStatus = 'live';
                state.soldInfo = null;

                // Rollback last bid if it was the team's winning bid
                if (state.bidHistory && state.bidHistory.length > 0) {
                    state.bidHistory.pop(); // Remove the accidental winning bid
                }

                // Set current bid to the previous bid, or basePrice if no bids left
                if (state.bidHistory && state.bidHistory.length > 0) {
                    const prevBid = state.bidHistory[state.bidHistory.length - 1];
                    state.currentBid = prevBid.bidAmount;
                    state.highestBidder = prevBid.teamName;
                } else {
                    const rules = await Rule.findOne({ room: roomId }) || DEFAULT_RULES;
                    state.currentBid = (rules.basePrices && rules.basePrices[player.category] !== undefined)
                        ? rules.basePrices[player.category]
                        : player.basePrice;
                    state.highestBidder = null;
                }

                await state.save();
            }

            const freshPlayers = await Player.find({ room: roomId });
            const freshTeams = await Team.find({ room: roomId });

            // Broadcast updates
            io.to(roomId).emit('playersUpdated', freshPlayers);
            io.to(roomId).emit('teamsUpdated', freshTeams);
            if (state) io.to(roomId).emit('auctionStateUpdated', state);

            if (typeof callback === 'function') {
                callback({ success: true, data: { players: freshPlayers, teams: freshTeams, state } });
            }
        } catch (err) {
            console.error('Error in undoPlayerSale:', err);
            if (typeof callback === 'function') callback({ success: false, error: err.message });
        }
    });

    // 7. Add Player to Roster (Admin restricted)
    socket.on('addPlayer', async (playerData, callback) => {
        const roomId = getRoomId(callback);
        if (!roomId) return;

        if (!socket.isAdmin) {
            if (typeof callback === 'function') return callback({ success: false, error: 'Unauthorized' });
            return;
        }

        try {
            const newPlayer = new Player({ ...playerData, room: roomId });
            await newPlayer.save();

            const freshPlayers = await Player.find({ room: roomId });
            io.to(roomId).emit('playersUpdated', freshPlayers);

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
        const roomId = getRoomId(callback);
        if (!roomId) return;

        if (!socket.isAdmin) {
            if (typeof callback === 'function') return callback({ success: false, error: 'Unauthorized' });
            return;
        }

        try {
            const newTeam = new Team({ ...teamData, room: roomId });
            await newTeam.save();

            const freshTeams = await Team.find({ room: roomId });
            io.to(roomId).emit('teamsUpdated', freshTeams);

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
        const roomId = getRoomId(callback);
        if (!roomId) return;

        if (!socket.isAdmin) {
            if (typeof callback === 'function') return callback({ success: false, error: 'Unauthorized' });
            return;
        }

        try {
            const { teamId } = data;
            await Team.findOneAndDelete({ _id: teamId, room: roomId });

            const freshTeams = await Team.find({ room: roomId });
            io.to(roomId).emit('teamsUpdated', freshTeams);

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
        const roomId = getRoomId(callback);
        if (!roomId) return;

        if (!socket.isAdmin) {
            if (typeof callback === 'function') return callback({ success: false, error: 'Unauthorized' });
            return;
        }

        try {
            const { basePrices, slots, minPlayers, maxPlayers } = rulesData;
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

            io.to(roomId).emit('rulesUpdated', rule);

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

    // 11. System Reset (Admin restricted, verifies against Room passkey)
    socket.on('systemReset', async (data, callback) => {
        const roomId = getRoomId(callback);
        if (!roomId) return;

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

        const room = await Room.findById(roomId);
        if (!room) {
            if (typeof callback === 'function') return callback({ success: false, error: 'Room not found.' });
            return;
        }

        // Verify PIN matches room passkey
        if (securityPin !== room.passkey) {
            if (typeof callback === 'function') {
                return callback({ success: false, error: 'Invalid security PIN' });
            }
            return;
        }

        try {
            if (type === 'hard') {
                await Player.deleteMany({ room: roomId });
                await Team.deleteMany({ room: roomId });
                await Rule.deleteMany({ room: roomId });
                await AuctionState.deleteMany({ room: roomId });

                const seededPlayers = await Player.insertMany(DEFAULT_PLAYERS.map(p => ({ ...p, room: roomId })));
                const seededTeams = await Team.insertMany(DEFAULT_TEAMS.map(t => ({ ...t, room: roomId })));
                
                const seededRule = new Rule({ room: roomId, ...DEFAULT_RULES });
                await seededRule.save();

                const seededState = new AuctionState({ room: roomId, ...DEFAULT_AUCTION_STATE });
                await seededState.save();

                io.to(roomId).emit('playersUpdated', seededPlayers);
                io.to(roomId).emit('teamsUpdated', seededTeams);
                io.to(roomId).emit('rulesUpdated', seededRule);
                io.to(roomId).emit('auctionStateUpdated', seededState);

                if (typeof callback === 'function') {
                    callback({ success: true, data: { players: seededPlayers, teams: seededTeams, rules: seededRule, state: seededState } });
                }
            } else if (type === 'clear') {
                await Player.deleteMany({ room: roomId });
                await Team.deleteMany({ room: roomId });
                await AuctionState.deleteMany({ room: roomId });

                const cleanState = {
                    room: roomId,
                    livePlayer: null,
                    liveStatus: 'waiting',
                    soldInfo: null,
                    bidHistory: []
                };
                const seededState = new AuctionState(cleanState);
                await seededState.save();

                io.to(roomId).emit('playersUpdated', []);
                io.to(roomId).emit('teamsUpdated', []);
                io.to(roomId).emit('auctionStateUpdated', seededState);

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
        console.log(`Client socket disconnected: ${socket.id}`);
    });
};
