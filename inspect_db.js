const mongoose = require('mongoose');
const Player = require('./backend/models/Player');
const Team = require('./backend/models/Team');
const AuctionState = require('./backend/models/AuctionState');

const inspect = async () => {
    try {
        await mongoose.connect('mongodb://127.0.0.1:27017/auction_db');
        console.log('--- CONNECTED ---');
        
        const players = await Player.find();
        console.log('--- PLAYERS ---');
        console.log(players.map(p => ({
            id: p.id,
            _id: p._id,
            name: p.name,
            status: p.status,
            winningTeam: p.winningTeam,
            finalPrice: p.finalPrice
        })));

        const teams = await Team.find();
        console.log('--- TEAMS ---');
        console.log(teams.map(t => ({
            id: t.id,
            _id: t._id,
            name: t.name,
            budget: t.budget
        })));

        const state = await AuctionState.findOne();
        console.log('--- AUCTION STATE ---');
        console.log(JSON.stringify(state, null, 2));

        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
    }
};

inspect();
