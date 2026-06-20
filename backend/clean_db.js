const mongoose = require('mongoose');
const Team = require('./models/Team');

const clean = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/auction_db');
        console.log('Connected to DB for cleanup.');
        
        // Remove team documents that don't have a name property
        const result = await Team.deleteMany({ name: { $exists: false } });
        console.log(`Removed ${result.deletedCount} corrupted documents from teams collection.`);
        
        await mongoose.disconnect();
        console.log('Cleanup completed successfully.');
    } catch (err) {
        console.error('Error during cleanup:', err);
    }
};

clean();
