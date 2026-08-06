const mongoose = require('mongoose');

const auctionStateSchema = mongoose.Schema({
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
    livePlayer: { type: Object, default: null },
    liveStatus: { type: String, enum: ['waiting', 'live', 'sold', 'unsold'], default: 'waiting' },
    soldInfo: {
        teamId: { type: String, default: null },
        teamName: { type: String, default: null },
        price: { type: Number, default: 0 }
    },
    currentBid: { type: Number, default: 0 },
    highestBidder: { type: String, default: null },
    bidHistory: { type: Array, default: [] }
}, {
    timestamps: true
});

module.exports = mongoose.model('AuctionState', auctionStateSchema);
