const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        // Will use an in-memory or standard local MongoDB. The user can adjust the URI.
        const conn = await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/auction_db');
        console.log(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
};

module.exports = connectDB;

