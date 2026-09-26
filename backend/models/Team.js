const mongoose = require('mongoose');

const teamSchema = mongoose.Schema({
    name: { type: String, required: true },
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
    budget: { type: Number, required: true }, // Remaining Budget
    initialBudget: { type: Number, required: true } // Starting Budget
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Sold players reference their owner by team NAME, so duplicate names inside a
// room would merge budgets. The API rejects duplicates; this index enforces it.
teamSchema.index({ room: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Team', teamSchema);
