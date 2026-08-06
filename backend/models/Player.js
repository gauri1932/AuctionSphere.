const mongoose = require('mongoose');

const playerSchema = mongoose.Schema({
    name: { type: String, required: true },
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
    photo: { type: String, default: 'default.png' },
    category: { type: String, required: true }, // A, B, C, etc.
    basePrice: { type: Number }, // Derived from category rules if not specified
    age: { type: Number },
    status: { type: String, enum: ['Pending', 'Live', 'Sold', 'Unsold'], default: 'Pending' },
    finalPrice: { type: Number, default: 0 },
    winningTeam: { type: String, default: null }, // Team name string
    isLive: { type: Boolean, default: false }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

module.exports = mongoose.model('Player', playerSchema);
