const mongoose = require('mongoose');

const ruleSchema = mongoose.Schema({
    basePrices: {
        A: { type: Number, default: 1000000 },
        B: { type: Number, default: 500000 },
        C: { type: Number, default: 200000 }
    },
    slots: {
        A: { type: Number, default: 2 },
        B: { type: Number, default: 3 },
        C: { type: Number, default: 5 }
    },
    minPlayers: { type: Number, default: 5 },
    maxPlayers: { type: Number, default: 15 }
}, {
    timestamps: true
});

module.exports = mongoose.model('Rule', ruleSchema);
