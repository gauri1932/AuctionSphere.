/**
 * Client-side mirrors of the server's input rules.
 *
 * The backend is the authority (see backend/utils/validators.js), but
 * validating here means the admin gets an instant, specific message instead
 * of a rejected round trip. Anything that passes here can still be rejected
 * server-side, so these checks are a UX layer, never a security boundary.
 */

export const MIN_PASSKEY = 6;
export const MAX_PASSKEY = 64;
export const MIN_ROOM_NAME = 3;
export const MAX_ROOM_NAME = 80;

/** Default step applied when a team taps to raise. */
export const BID_INCREMENT = 50000;

/** Above this, an amount is refused by the server as unsafe. */
const MAX_MONEY = 1e15;

/**
 * Parses a money amount the way the server does: a positive, finite, whole
 * number. Numeric strings are accepted because every <input type="number">
 * hands us a string.
 * @returns {{ok: true, value: number} | {ok: false, error: string}}
 */
export function parseWholeMoney(raw) {
  if (raw === null || raw === undefined || raw === '') {
    return { ok: false, error: 'Enter an amount.' };
  }
  const value = typeof raw === 'number' ? raw : Number(String(raw).trim());
  if (!Number.isFinite(value)) {
    return { ok: false, error: 'Amount must be a number.' };
  }
  if (value <= 0) {
    return { ok: false, error: 'Amount must be greater than zero.' };
  }
  if (!Number.isInteger(value)) {
    return { ok: false, error: 'Amount must be a whole number (no paise).' };
  }
  if (value > MAX_MONEY) {
    return { ok: false, error: 'Amount is too large.' };
  }
  return { ok: true, value };
}

export function validatePasskey(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return { ok: false, error: 'Please enter a room passkey.' };
  if (value.length < MIN_PASSKEY) {
    return { ok: false, error: `Room passkey must be at least ${MIN_PASSKEY} characters.` };
  }
  if (value.length > MAX_PASSKEY) {
    return { ok: false, error: `Room passkey cannot exceed ${MAX_PASSKEY} characters.` };
  }
  return { ok: true, value };
}

export function validateRoomName(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return { ok: false, error: 'Please enter a room name.' };
  if (value.length < MIN_ROOM_NAME) {
    return { ok: false, error: `Room name must be at least ${MIN_ROOM_NAME} characters.` };
  }
  if (value.length > MAX_ROOM_NAME) {
    return { ok: false, error: `Room name cannot exceed ${MAX_ROOM_NAME} characters.` };
  }
  return { ok: true, value };
}

/**
 * The next bid a team can legally make. The server requires a bid to strictly
 * exceed the standing bid, and the standing bid starts at the category base
 * price, so we always add an increment rather than sending the typed value.
 */
export function nextBid(typedAmount, standingBid) {
  const typed = parseWholeMoney(typedAmount);
  const standing = parseWholeMoney(standingBid);
  const base = Math.max(typed.ok ? typed.value : 0, standing.ok ? standing.value : 0);
  return base > 0 ? base + BID_INCREMENT : BID_INCREMENT;
}

/** Percentage of a purse already spent, guarded against a zero purse. */
export function spentPercentage(initialBudget, budget) {
  const initial = Number(initialBudget);
  const remaining = Number(budget);
  if (!Number.isFinite(initial) || initial <= 0 || !Number.isFinite(remaining)) return 0;
  return ((initial - remaining) / initial) * 100;
}
