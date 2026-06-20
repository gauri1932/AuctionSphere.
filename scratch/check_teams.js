const mongoose = require('mongoose');

const check = async () => {
    try {
        await mongoose.connect('mongodb://127.0.0.1:27017/auction_db');
        const db = mongoose.connection.db;
        const collections = await db.listCollections().toArray();
        console.log('Collections:', collections.map(c => c.name));
        
        const rawTeams = await db.collection('teams').find().toArray();
        console.log('Raw Teams:', rawTeams);
        
        const rawPlayers = await db.collection('players').find().toArray();
        console.log('Raw Players Count:', rawPlayers.length);
        console.log('Raw Players (first 3):', rawPlayers.slice(0, 3));
        
        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
    }
};

check();
