/**
 * Shared input validation for money-bearing and structural fields.
 * Every helper returns { ok, value, error } so handlers can bail out early
 * with a message that is safe to show to a client.
 */

const MAX_MONEY = Number.MAX_SAFE_INTEGER;

/**
 * Parses a currency amount that arrives from an untrusted client.
 * Rejects NaN, Infinity, negatives, fractional units, and unsafe integers.
 * Numeric strings are accepted so that form inputs keep working.
 */
function parseMoney(value, { min = 0, allowZero = true, field = 'Amount' } = {}) {
  if (value === undefined || value === null || value === '') {
    return { ok: false, value: null, error: `${field} is required.` };
  }

  let num;
  if (typeof value === 'number') {
    num = value;
  } else if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
      return { ok: false, value: null, error: `${field} must be a number.` };
    }
    num = Number(trimmed);
  } else {
    return { ok: false, value: null, error: `${field} must be a number.` };
  }

  if (!Number.isFinite(num)) {
    return { ok: false, value: null, error: `${field} must be a finite number.` };
  }
  if (!Number.isInteger(num)) {
    return { ok: false, value: null, error: `${field} must be a whole number (no paise).` };
  }
  if (Math.abs(num) > MAX_MONEY) {
    return { ok: false, value: null, error: `${field} is too large.` };
  }
  if (num < 0) {
    return { ok: false, value: null, error: `${field} cannot be negative.` };
  }
  if (num === 0 && !allowZero) {
    return { ok: false, value: null, error: `${field} must be greater than zero.` };
  }
  if (num < min) {
    return { ok: false, value: null, error: `${field} must be at least ${min}.` };
  }

  return { ok: true, value: num, error: null };
}

/** Trims and bounds a free-text field such as a room or team name. */
function parseText(value, { field = 'Field', min = 1, max = 120 } = {}) {
  if (typeof value !== 'string') {
    return { ok: false, value: null, error: `${field} must be text.` };
  }
  const trimmed = value.trim();
  if (trimmed.length < min) {
    return { ok: false, value: null, error: `${field} must be at least ${min} character${min === 1 ? '' : 's'}.` };
  }
  if (trimmed.length > max) {
    return { ok: false, value: null, error: `${field} must be at most ${max} characters.` };
  }
  return { ok: true, value: trimmed, error: null };
}

const CATEGORIES = ['A', 'B', 'C'];

/**
 * Validates the category rule set. Guards against values that can deadlock a
 * room (for example maxPlayers: 0 makes every bid and every hammer fail).
 */
function parseRuleSet({ basePrices, slots, minPlayers, maxPlayers }) {
  const errors = [];

  const cleanBasePrices = {};
  const cleanSlots = {};

  for (const cat of CATEGORIES) {
    const base = parseMoney(basePrices?.[cat], { field: `Base price for category ${cat}` });
    if (!base.ok) {
      errors.push(base.error);
    } else if (base.value === 0) {
      errors.push(`Base price for category ${cat} must be greater than zero.`);
    } else {
      cleanBasePrices[cat] = base.value;
    }

    const slot = parseMoney(slots?.[cat], { field: `Slots for category ${cat}` });
    if (!slot.ok) {
      errors.push(slot.error);
    } else if (slot.value < 1) {
      errors.push(`Slots for category ${cat} must be at least 1.`);
    } else if (slot.value > 50) {
      errors.push(`Slots for category ${cat} must be at most 50.`);
    } else {
      cleanSlots[cat] = slot.value;
    }
  }

  const min = parseMoney(minPlayers, { field: 'Minimum players' });
  if (!min.ok) errors.push(min.error);
  else if (min.value < 0) errors.push('Minimum players cannot be negative.');

  const max = parseMoney(maxPlayers, { field: 'Maximum players' });
  if (!max.ok) {
    errors.push(max.error);
  } else if (max.value < 1) {
    errors.push('Maximum players must be at least 1, otherwise no player can ever be sold.');
  } else if (max.value > 200) {
    errors.push('Maximum players must be at most 200.');
  }

  if (min.ok && max.ok && min.value > max.value) {
    errors.push('Minimum players cannot be greater than maximum players.');
  }

  const slotTotal = CATEGORIES.reduce((sum, cat) => sum + (cleanSlots[cat] || 0), 0);
  if (max.ok && slotTotal > 0 && slotTotal > max.value) {
    errors.push('Sum of category slots cannot exceed the maximum roster size.');
  }

  if (errors.length) {
    return { ok: false, value: null, error: errors[0], errors };
  }

  return {
    ok: true,
    error: null,
    errors: [],
    value: {
      basePrices: cleanBasePrices,
      slots: cleanSlots,
      minPlayers: min.value,
      maxPlayers: max.value,
    },
  };
}

/** Validates a bid/price against a category's reserve floor. */
function isAtLeastFloor(amount, floor) {
  if (floor === undefined || floor === null) return true;
  return Number(amount) >= Number(floor);
}

module.exports = {
  parseMoney,
  parseText,
  parseRuleSet,
  isAtLeastFloor,
  MAX_MONEY,
  CATEGORIES,
};
