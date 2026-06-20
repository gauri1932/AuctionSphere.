const mongoose = require('mongoose');

const teamSchema = mongoose.Schema({
    name: { type: String, required: true, unique: true },
    budget: { type: Number, required: true }, // Remaining Budget
    initialBudget: { type: Number, required: true } // Starting Budget
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

module.exports = mongoose.model('Team', teamSchema);
