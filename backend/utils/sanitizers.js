/**
 * Input sanitisers shared by the REST routes and the socket handlers so that
 * roster and purse data is filtered identically no matter which channel it
 * arrives on.
 */
const { parseMoney, parseText } = require('./validators');

const CATEGORIES = ['A', 'B', 'C'];
const MAX_TEAM_BUDGET = 1000000000; // 1,00,00,00,000
const MAX_ROSTER_UPLOAD = 2000;

/**
 * Builds a player document from untrusted input.
 * Only descriptive fields are accepted. status, finalPrice and winningTeam are
 * auction state owned by the server and are deliberately dropped, so an upload
 * cannot forge sale history or mint budget via the reconciliation engine.
 * Returns null when the record is unusable.
 */
function buildPlayerDoc(raw, roomId) {
    if (!raw || typeof raw !== 'object') return null;

    const name = parseText(raw.name, { field: 'Player name', min: 1, max: 80 });
    if (!name.ok) return null;

    const category = typeof raw.category === 'string' ? raw.category.trim().toUpperCase() : '';
    if (!CATEGORIES.includes(category)) return null;

    const doc = {
        name: name.value,
        category,
        room: roomId,
        status: 'Pending',
        finalPrice: 0,
        winningTeam: null,
    };

    if (typeof raw.photo === 'string' && raw.photo.trim()) {
        doc.photo = raw.photo.trim().slice(0, 500);
    }
    if (raw.basePrice !== undefined && raw.basePrice !== null && raw.basePrice !== '') {
        const base = parseMoney(raw.basePrice, { field: 'Base price' });
        if (!base.ok) return null;
        doc.basePrice = base.value;
    }
    if (raw.age !== undefined && raw.age !== null && raw.age !== '') {
        const age = parseMoney(raw.age, { field: 'Age' });
        if (!age.ok || age.value > 100) return null;
        doc.age = age.value;
    }
    return doc;
}

/**
 * Builds a team document from untrusted input. The purse is clamped and
 * initialBudget is always derived from the same value as budget, so an upload
 * cannot silently raise a team's spending limit.
 */
function buildTeamDoc(raw, roomId) {
    if (!raw || typeof raw !== 'object') return null;

    const name = parseText(raw.name, { field: 'Team name', min: 2, max: 60 });
    if (!name.ok) return null;

    const budget = parseMoney(raw.budget !== undefined && raw.budget !== null && raw.budget !== ''
        ? raw.budget
        : raw.initialBudget, { field: 'Budget', allowZero: false });
    if (!budget.ok || budget.value > MAX_TEAM_BUDGET) return null;

    return {
        name: name.value,
        budget: budget.value,
        initialBudget: budget.value,
        room: roomId,
    };
}

/** Rejects a roster that contains two teams with the same name. */
function hasDuplicateTeamNames(docs) {
    const seen = new Set();
    for (const doc of docs) {
        const key = doc.name.toLowerCase();
        if (seen.has(key)) return true;
        seen.add(key);
    }
    return false;
}

module.exports = {
    buildPlayerDoc,
    buildTeamDoc,
    hasDuplicateTeamNames,
    CATEGORIES,
    MAX_TEAM_BUDGET,
    MAX_ROSTER_UPLOAD,
};
