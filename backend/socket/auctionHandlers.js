const mongoose = require('mongoose');
const Player = require('../models/Player');
const Team = require('../models/Team');
const Rule = require('../models/Rule');
const AuctionState = require('../models/AuctionState');
const Room = require('../models/Room');
const { validateBidSolvency } = require('../utils/solvencyEngine');
const { parseMoney, parseRuleSet } = require('../utils/validators');
const { buildPlayerDoc, buildTeamDoc } = require('../utils/sanitizers');

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

            // Fetch room state with reconciled budgets
            const players = await Player.find({ room: roomId });
            const teams = await getReconciledTeams(roomId);
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
            if (typeof callback === 'function') callback({ success: false, error: 'Something went wrong. Please try again.' });
        }
    });

    // 1. Fetch initial application dataset
    socket.on('fetchInitialData', async (callback) => {
        const roomId = getRoomId(callback);
        if (!roomId) return;

        try {
            const players = await Player.find({ room: roomId });
            const teams = await getReconciledTeams(roomId);
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
                callback({ success: false, error: 'Something went wrong. Please try again.' });
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
            const { playerId } = data || {};
            const player = await Player.findOne({
                _id: (playerId && mongoose.Types.ObjectId.isValid(playerId)) ? playerId : null,
                room: roomId,
            });
            if (!player) {
                if (typeof callback === 'function') return callback({ success: false, error: 'Player not found in this room.' });
                return;
            }

            if (player.status === 'Sold') {
                if (typeof callback === 'function') return callback({ success: false, error: 'This player has already been sold. Use "Undo Sale" to reverse it first.' });
                return;
            }

            const state0 = await AuctionState.findOne({ room: roomId });
            if (state0 && state0.livePlayer && String(state0.livePlayer._id) !== String(player._id)
                && state0.liveStatus === 'live') {
                if (typeof callback === 'function') return callback({ success: false, error: 'Another player is already on the live stage. Clear the stage first.' });
                return;
            }

            // Claim the stage atomically so two concurrent pushes cannot both
            // leave their player marked Live.
            const livePlayerRef = { _id: player._id, name: player.name, category: player.category, basePrice: player.basePrice, photo: player.photo, age: player.age, status: 'Live' };

            let state = await AuctionState.findOneAndUpdate(
                {
                    room: roomId,
                    liveStatus: { $ne: 'live' },
                    $or: [
                        { livePlayer: null },
                        { 'livePlayer._id': { $ne: player._id } },
                    ],
                },
                {
                    $set: {
                        livePlayer: livePlayerRef,
                        liveStatus: 'live',
                        soldInfo: null,
                        highestBidder: null,
                        bidHistory: [],
                    },
                },
                { new: true }
            );

            if (!state) {
                state = await AuctionState.findOne({ room: roomId });
                const samePlayer = state && state.livePlayer && String(state.livePlayer._id) === String(player._id);
                if (state && state.liveStatus === 'live' && samePlayer) {
                    // Idempotent re-push of the player already on stage.
                    const rulesNow = await Rule.findOne({ room: roomId }) || DEFAULT_RULES;
                    const baseNow = (rulesNow.basePrices && rulesNow.basePrices[player.category] !== undefined)
                        ? rulesNow.basePrices[player.category]
                        : player.basePrice;
                    state.currentBid = Number(baseNow) || 0;
                    state.highestBidder = null;
                    state.bidHistory = [];
                    state.soldInfo = null;
                    state.liveStatus = 'live';
                    await state.save();
                } else {
                    if (typeof callback === 'function') return callback({ success: false, error: 'The live stage is busy. Clear it before pushing another player.' });
                    return;
                }
            } else {
                const rules0 = await Rule.findOne({ room: roomId }) || DEFAULT_RULES;
                const base0 = (rules0.basePrices && rules0.basePrices[player.category] !== undefined)
                    ? rules0.basePrices[player.category]
                    : player.basePrice;
                state = await AuctionState.findOneAndUpdate(
                    { _id: state._id },
                    { $set: { currentBid: Number(base0) || 0 } },
                    { new: true }
                );
            }

            // Reset other live players, then flip this one. Ordered after the
            // state claim so a concurrent push cannot resurrect a second Live row.
            await Player.updateMany(
                { room: roomId, status: 'Live', _id: { $ne: player._id } },
                { $set: { status: 'Pending' } }
            );
            await Player.updateOne(
                { _id: player._id, room: roomId },
                { $set: { status: 'Live' } }
            );

            const freshPlayers = await Player.find({ room: roomId });
            const finalState = await AuctionState.findOne({ room: roomId });

            // Broadcast updates to room
            io.to(roomId).emit('playersUpdated', freshPlayers);
            io.to(roomId).emit('auctionStateUpdated', finalState);

            if (typeof callback === 'function') {
                callback({ success: true, data: { players: freshPlayers, state: finalState } });
            }
        } catch (err) {
            console.error('Error pushing player live:', err);
            if (typeof callback === 'function') {
                callback({ success: false, error: 'Could not push the player live. Please try again.' });
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
            const { teamId, teamName, bidAmount } = data || {};

            // Amounts are untrusted: reject negatives, fractions, NaN and unsafe
            // integers before they can reach the ledger.
            const amount = parseMoney(bidAmount, { allowZero: false, field: 'Bid amount' });
            if (!amount.ok) {
                if (typeof callback === 'function') return callback({ success: false, error: amount.error });
                return socket.emit('bidRejected', { message: amount.error });
            }
            const bid = amount.value;

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

            // A bid must always beat the standing bid. On the opening bid the
            // standing bid is the category base price, so this also enforces the
            // reserve floor that used to be bypassed via highestBidder === null.
            if (bid <= state.currentBid) {
                const errMsg = `Bid must be higher than the current bid of ${state.currentBid}.`;
                if (typeof callback === 'function') return callback({ success: false, error: errMsg });
                return socket.emit('bidRejected', { message: errMsg });
            }

            if (!team) {
                const errMsg = 'Team not found in this room.';
                if (typeof callback === 'function') return callback({ success: false, error: errMsg });
                return socket.emit('bidRejected', { message: errMsg });
            }

            const activePlayerCat = state.livePlayer.category;
            const activeRule = rule || DEFAULT_RULES;

            // Fetch all sold players for this team to evaluate live squad composition
            const teamSoldPlayers = await Player.find({ room: roomId, status: 'Sold', winningTeam: team.name });

            // Check global squad size limit
            if (teamSoldPlayers.length >= activeRule.maxPlayers) {
                const errMsg = `Max roster limit reached: ${team.name} already has ${activeRule.maxPlayers} players.`;
                if (typeof callback === 'function') return callback({ success: false, error: errMsg });
                return socket.emit('bidRejected', { message: errMsg });
            }

            // Map current owned players count per category
            const currentOwned = {};
            for (const p of teamSoldPlayers) {
                if (p.category) {
                    currentOwned[p.category] = (currentOwned[p.category] || 0) + 1;
                }
            }

            // Check Category slot limit
            const maxCatSlots = (activeRule.slots && activeRule.slots[activePlayerCat]) || 999;
            const teamCatCount = currentOwned[activePlayerCat] || 0;
            if (teamCatCount >= maxCatSlots) {
                const errMsg = `Category Slot limit reached: ${team.name} already has ${teamCatCount} players in Category ${activePlayerCat}.`;
                if (typeof callback === 'function') return callback({ success: false, error: errMsg });
                return socket.emit('bidRejected', { message: errMsg });
            }

            // Perform Category-Aware Solvency Validation across ALL categories
            const solvency = validateBidSolvency({
                teamBudget: team.budget,
                categoryConfigs: activeRule,
                currentOwned,
                proposedBidCategory: activePlayerCat,
                proposedBidAmount: bid
            });

            if (!solvency.isAllowed) {
                const errMsg = solvency.rejectionMessage;
                if (typeof callback === 'function') return callback({ success: false, error: errMsg });
                return socket.emit('bidRejected', { message: errMsg });
            }


            // Apply the bid atomically. The currentBid guard means a concurrent
            // bid that already moved the price wins, and this one is rejected
            // instead of silently overwriting a higher bid.
            const updated = await AuctionState.findOneAndUpdate(
                {
                    _id: state._id,
                    room: roomId,
                    liveStatus: 'live',
                    'livePlayer._id': state.livePlayer._id,
                    currentBid: { $lt: bid },
                },
                {
                    $set: { currentBid: bid, highestBidder: team.name },
                    $push: {
                        bidHistory: { teamId: team._id, teamName: team.name, bidAmount: bid, time: new Date() },
                    },
                },
                { new: true }
            );

            if (!updated) {
                const errMsg = 'A higher bid was placed moments ago. This bid was not accepted.';
                if (typeof callback === 'function') return callback({ success: false, error: errMsg });
                return socket.emit('bidRejected', { message: errMsg });
            }

            // Broadcast updates to room
            io.to(roomId).emit('bidAccepted', updated);
            io.to(roomId).emit('auctionStateUpdated', updated);

            if (typeof callback === 'function') {
                callback({ success: true, data: updated });
            }
        } catch (error) {
            console.error('Error processing socket bid:', error);
            if (typeof callback === 'function') {
                callback({ success: false, error: 'Could not process the bid. Please try again.' });
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
            const amount = parseMoney(data && data.bidAmount, { allowZero: false, field: 'Bid amount' });
            if (!amount.ok) {
                if (typeof callback === 'function') return callback({ success: false, error: amount.error });
                return socket.emit('bidRejected', { message: amount.error });
            }
            const bidAmount = amount.value;

            const state = await AuctionState.findOne({ room: roomId });
            if (!state || !state.livePlayer) {
                if (typeof callback === 'function') return callback({ success: false, error: 'No live player active.' });
                return;
            }

            const rule = await Rule.findOne({ room: roomId }) || DEFAULT_RULES;
            const reserve = (rule.basePrices && rule.basePrices[state.livePlayer.category] !== undefined)
                ? rule.basePrices[state.livePlayer.category]
                : state.livePlayer.basePrice;
            const floor = Number.isFinite(Number(reserve)) ? Number(reserve) : 0;

            if (bidAmount < floor) {
                const errMsg = `Bid cannot be lower than the base price of ${floor}.`;
                if (typeof callback === 'function') return callback({ success: false, error: errMsg });
                return socket.emit('bidRejected', { message: errMsg });
            }

            // If a leading bidder is currently holding the lead, validate solvency for that team
            if (state.highestBidder) {
                const team = await Team.findOne({ name: state.highestBidder, room: roomId });
                if (team) {
                    const teamSoldPlayers = await Player.find({ room: roomId, status: 'Sold', winningTeam: team.name });
                    const currentOwned = {};
                    for (const p of teamSoldPlayers) {
                        if (p.category) {
                            currentOwned[p.category] = (currentOwned[p.category] || 0) + 1;
                        }
                    }

                    const solvency = validateBidSolvency({
                        teamBudget: team.budget,
                        categoryConfigs: rule,
                        currentOwned,
                        proposedBidCategory: state.livePlayer.category,
                        proposedBidAmount: bidAmount
                    });

                    if (!solvency.isAllowed) {
                        if (typeof callback === 'function') return callback({ success: false, error: solvency.rejectionMessage });
                        return socket.emit('bidRejected', { message: solvency.rejectionMessage });
                    }
                }
            }

            const updated = await AuctionState.findOneAndUpdate(
                { _id: state._id, room: roomId, liveStatus: 'live' },
                { $set: { currentBid: bidAmount } },
                { new: true }
            );

            if (!updated) {
                if (typeof callback === 'function') return callback({ success: false, error: 'Auction state changed. Refresh and try again.' });
                return;
            }

            io.to(roomId).emit('auctionStateUpdated', updated);

            if (typeof callback === 'function') callback({ success: true, data: updated });
        } catch (err) {
            console.error('Error updating current bid:', err);
            if (typeof callback === 'function') callback({ success: false, error: 'Could not update the bid. Please try again.' });
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
            // The winning bid is owned by the server. A client may suggest which
            // team it thinks won, but the price and the buyer are always derived
            // from AuctionState so a tampered payload cannot redirect a sale.
            const suggestedTeamId = data && data.buyingTeamId;
            const state = await AuctionState.findOne({ room: roomId });
            if (!state || !state.livePlayer) {
                if (typeof callback === 'function') return callback({ success: false, error: 'No live player active.' });
                return;
            }

            if (state.liveStatus !== 'live') {
                const errMsg = state.liveStatus === 'sold'
                    ? 'Player is already sold.'
                    : `This player is already marked ${state.liveStatus}.`;
                if (typeof callback === 'function') return callback({ success: false, error: errMsg });
                return;
            }

            if (!state.highestBidder) {
                if (typeof callback === 'function') return callback({ success: false, error: 'No bids have been placed. Push a player and place a bid before selling.' });
                return;
            }

            const salePrice = Number(state.currentBid) || 0;
            if (salePrice <= 0) {
                if (typeof callback === 'function') return callback({ success: false, error: 'Standing bid is not a valid amount.' });
                return;
            }

            const winningTeam = await Team.findOne({ name: state.highestBidder, room: roomId });
            if (!winningTeam) {
                if (typeof callback === 'function') return callback({ success: false, error: 'Leading team no longer exists in this room.' });
                return;
            }

            if (suggestedTeamId && mongoose.Types.ObjectId.isValid(suggestedTeamId)
                && String(suggestedTeamId) !== String(winningTeam._id)) {
                if (typeof callback === 'function') {
                    return callback({ success: false, error: `Leading bid belongs to ${winningTeam.name}. Refresh and try again.` });
                }
                return;
            }

            const rule = await Rule.findOne({ room: roomId }) || DEFAULT_RULES;


            // Roster limit checks
            const teamSoldPlayers = await Player.find({ room: roomId, status: 'Sold', winningTeam: winningTeam.name });
            if (teamSoldPlayers.length >= rule.maxPlayers) {
                if (typeof callback === 'function') return callback({ success: false, error: `Roster Lockout: ${winningTeam.name} already reached the limit of ${rule.maxPlayers} players.` });
                return;
            }

            const activePlayerCat = state.livePlayer.category;
            const currentOwned = {};
            for (const p of teamSoldPlayers) {
                if (p.category) {
                    currentOwned[p.category] = (currentOwned[p.category] || 0) + 1;
                }
            }

            const maxCatSlots = rule.slots?.[activePlayerCat] || 999;
            const catCount = currentOwned[activePlayerCat] || 0;
            if (catCount >= maxCatSlots) {
                if (typeof callback === 'function') return callback({ success: false, error: `Category Roster Full: ${winningTeam.name} already reached the limit for Category ${activePlayerCat}.` });
                return;
            }

            // Hard Solvency Gate before finalizing sale
            const solvency = validateBidSolvency({
                teamBudget: winningTeam.budget,
                categoryConfigs: rule,
                currentOwned,
                proposedBidCategory: activePlayerCat,
                proposedBidAmount: salePrice
            });

            if (!solvency.isAllowed) {
                if (typeof callback === 'function') return callback({ success: false, error: solvency.rejectionMessage });
                return socket.emit('bidRejected', { message: solvency.rejectionMessage });
            }

            // Atomically claim the sale. Only one concurrent hammer can flip
            // liveStatus from 'live' to 'sold', so a double click cannot sell the
            // same player to two teams.
            const soldState = await AuctionState.findOneAndUpdate(
                {
                    _id: state._id,
                    room: roomId,
                    liveStatus: 'live',
                    currentBid: salePrice,
                    highestBidder: winningTeam.name,
                },
                {
                    $set: {
                        liveStatus: 'sold',
                        soldInfo: {
                            teamId: winningTeam._id,
                            teamName: winningTeam.name,
                            price: salePrice,
                        },
                    },
                },
                { new: true }
            );

            if (!soldState) {
                if (typeof callback === 'function') return callback({ success: false, error: 'Auction state changed. Refresh before selling.' });
                return;
            }

            // Mark Player as Sold. The status guard makes this a no-op if the
            // player was retired between the claim and now.
            const player = await Player.findOneAndUpdate(
                { _id: state.livePlayer._id, room: roomId, status: { $in: ['Pending', 'Live', 'Unsold'] } },
                { $set: { status: 'Sold', finalPrice: salePrice, winningTeam: winningTeam.name } },
                { new: true }
            );

            if (!player) {
                // Roll the claim back so the stage is not left showing a phantom sale.
                await AuctionState.updateOne(
                    { _id: state._id, liveStatus: 'sold' },
                    { $set: { liveStatus: 'live', soldInfo: null } }
                );
                if (typeof callback === 'function') return callback({ success: false, error: 'This player is no longer available for sale.' });
                return;
            }

            // Reconcile teams budget mathematically from all sold players
            const freshTeams = await getReconciledTeams(roomId);
            const freshPlayers = await Player.find({ room: roomId });
            const finalState = await AuctionState.findOne({ room: roomId });

            // Broadcast updates to room
            io.to(roomId).emit('playersUpdated', freshPlayers);
            io.to(roomId).emit('teamsUpdated', freshTeams);
            io.to(roomId).emit('auctionStateUpdated', finalState);

            if (typeof callback === 'function') {
                callback({ success: true, data: { players: freshPlayers, teams: freshTeams, state: finalState } });
            }
        } catch (err) {
            console.error('Error in markPlayerSold:', err);
            if (typeof callback === 'function') {
                callback({ success: false, error: 'Could not complete the sale. Please try again.' });
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
            const freshTeams = await getReconciledTeams(roomId);

            // Broadcast updates to room
            io.to(roomId).emit('playersUpdated', freshPlayers);
            io.to(roomId).emit('teamsUpdated', freshTeams);
            io.to(roomId).emit('auctionStateUpdated', state);

            if (typeof callback === 'function') {
                callback({ success: true, data: { players: freshPlayers, teams: freshTeams, state } });
            }
        } catch (err) {
            console.error('Error in markPlayerUnsold:', err);
            if (typeof callback === 'function') {
                callback({ success: false, error: 'Something went wrong. Please try again.' });
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
                callback({ success: false, error: 'Something went wrong. Please try again.' });
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
            if (typeof callback === 'function') callback({ success: false, error: 'Something went wrong. Please try again.' });
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

            // 1. Reset player fields
            player.status = 'Pending';
            player.finalPrice = 0;
            player.winningTeam = null;
            await player.save();

            // 2. Reconcile all teams so budget is mathematically guaranteed to be refunded
            const freshTeams = await getReconciledTeams(roomId);

            // 3. Restore AuctionState
            const state = await AuctionState.findOne({ room: roomId });
            if (state) {
                const isCurrentlyOnStage = state.livePlayer && state.livePlayer._id.toString() === player._id.toString();
                const isStageIdle = state.liveStatus === 'waiting' || state.liveStatus === 'sold' || !state.livePlayer;

                if (isCurrentlyOnStage || isStageIdle) {
                    // Ensure NO other player in database is marked Live
                    await Player.updateMany({ room: roomId, status: 'Live', _id: { $ne: player._id } }, { status: 'Pending' });

                    player.status = 'Live';
                    await player.save();

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
            }

            const freshPlayers = await Player.find({ room: roomId });

            // Broadcast updates
            io.to(roomId).emit('playersUpdated', freshPlayers);
            io.to(roomId).emit('teamsUpdated', freshTeams);
            if (state) io.to(roomId).emit('auctionStateUpdated', state);

            if (typeof callback === 'function') {
                callback({ success: true, data: { players: freshPlayers, teams: freshTeams, state } });
            }
        } catch (err) {
            console.error('Error in undoPlayerSale:', err);
            if (typeof callback === 'function') callback({ success: false, error: 'Something went wrong. Please try again.' });
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
            const doc = buildPlayerDoc(playerData, roomId);
            if (!doc) {
                if (typeof callback === 'function') return callback({ success: false, error: 'Player needs a name and a valid category (A, B or C).' });
                return;
            }
            const newPlayer = new Player(doc);
            await newPlayer.save();

            const freshPlayers = await Player.find({ room: roomId });
            io.to(roomId).emit('playersUpdated', freshPlayers);

            if (typeof callback === 'function') {
                callback({ success: true, data: freshPlayers });
            }
        } catch (err) {
            console.error('Error in addPlayer:', err);
            if (typeof callback === 'function') {
                callback({ success: false, error: 'Something went wrong. Please try again.' });
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
            const doc = buildTeamDoc(teamData, roomId);
            if (!doc) {
                if (typeof callback === 'function') return callback({ success: false, error: 'Team needs a name and a valid budget.' });
                return;
            }
            const clash = await Team.exists({ room: roomId, name: doc.name });
            if (clash) {
                if (typeof callback === 'function') return callback({ success: false, error: 'A team with that name already exists in this room.' });
                return;
            }
            const newTeam = new Team(doc);
            await newTeam.save();

            const freshTeams = await getReconciledTeams(roomId);
            io.to(roomId).emit('teamsUpdated', freshTeams);

            if (typeof callback === 'function') {
                callback({ success: true, data: freshTeams });
            }
        } catch (err) {
            console.error('Error in addTeam:', err);
            if (typeof callback === 'function') {
                callback({ success: false, error: 'Something went wrong. Please try again.' });
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
            const { teamId } = data || {};
            const team = await Team.findOne({ _id: teamId, room: roomId });
            if (!team) {
                if (typeof callback === 'function') return callback({ success: false, error: 'Team not found in this room.' });
                return;
            }

            // Refuse to orphan players that are already sold to this team, which
            // would silently drop their spend out of every total and summary.
            const owned = await Player.countDocuments({ room: roomId, status: 'Sold', winningTeam: team.name });
            if (owned > 0) {
                if (typeof callback === 'function') {
                    return callback({ success: false, error: `${team.name} owns ${owned} sold player${owned === 1 ? '' : 's'}. Undo those sales before deleting the team.` });
                }
                return;
            }

            await Team.findOneAndDelete({ _id: teamId, room: roomId });

            const freshTeams = await getReconciledTeams(roomId);
            io.to(roomId).emit('teamsUpdated', freshTeams);

            if (typeof callback === 'function') {
                callback({ success: true, data: freshTeams });
            }
        } catch (err) {
            console.error('Error in deleteTeam:', err);
            if (typeof callback === 'function') {
                callback({ success: false, error: 'Something went wrong. Please try again.' });
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
            const payload = rulesData || {};
            let rule = await Rule.findOne({ room: roomId });

            const merged = {
                basePrices: { ...(rule ? rule.basePrices.toObject() : DEFAULT_RULES.basePrices), ...(payload.basePrices || {}) },
                slots: { ...(rule ? rule.slots.toObject() : DEFAULT_RULES.slots), ...(payload.slots || {}) },
                minPlayers: payload.minPlayers !== undefined ? payload.minPlayers : (rule ? rule.minPlayers : DEFAULT_RULES.minPlayers),
                maxPlayers: payload.maxPlayers !== undefined ? payload.maxPlayers : (rule ? rule.maxPlayers : DEFAULT_RULES.maxPlayers),
            };

            const check = parseRuleSet(merged);
            if (!check.ok) {
                if (typeof callback === 'function') return callback({ success: false, error: check.error, errors: check.errors });
                return;
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

            io.to(roomId).emit('rulesUpdated', rule);

            if (typeof callback === 'function') {
                callback({ success: true, data: rule });
            }
        } catch (err) {
            console.error('Error in updateRules:', err);
            if (typeof callback === 'function') {
                callback({ success: false, error: 'Something went wrong. Please try again.' });
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
                callback({ success: false, error: 'Something went wrong. Please try again.' });
            }
        }
    });

    socket.on('disconnect', () => {
        console.log(`Client socket disconnected: ${socket.id}`);
    });
};
