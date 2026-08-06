const mongoose = require('mongoose');

const roomSchema = mongoose.Schema({
    name: { type: String, required: true },
    passkey: { type: String, required: true }, // Secret PIN/password for participant entry
    status: { type: String, enum: ['scheduled', 'active', 'ended'], default: 'scheduled' },
    adminUserId: { type: String, required: true }, // Clerk user ID of the creator
    adminName: { type: String } // Dynamic profile name from Clerk
}, {
    timestamps: true
});

module.exports = mongoose.model('Room', roomSchema);
