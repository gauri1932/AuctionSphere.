/**
 * Solvency Engine
 * Calculates mandatory reserves across category quotas and validates bids.
 */

// Helper to format currency in Indian Rupees format (INR)
export const formatRupees = (amount) => {
  if (amount === undefined || amount === null || isNaN(Number(amount))) return '₹0';
  
  const num = Math.round(Number(amount));
  const isNegative = num < 0;
  const absStr = Math.abs(num).toString();
  
  let lastThree = absStr.substring(absStr.length - 3);
  const otherNumbers = absStr.substring(0, absStr.length - 3);
  if (otherNumbers !== '') {
    lastThree = ',' + lastThree;
  }
  const formatted = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + lastThree;
  return (isNegative ? '-₹' : '₹') + formatted;
};

/**
 * Validates whether a proposed bid by a franchise is solvent and legal.
 * 
 * @param {Object} params
 * @param {number} params.teamBudget - Current remaining budget of the team
 * @param {Object|Array} params.categoryConfigs - Category configurations (slots & basePrices or array of {name, minRequired, minBasePrice})
 * @param {Object} [params.currentOwned={}] - Map of category name to count of currently owned players
 * @param {string} params.proposedBidCategory - The category of the player currently being bid on
 * @param {number} params.proposedBidAmount - The proposed bid amount
 * @returns {Object} { isAllowed, maxBid, mandatoryReserve, remainingNeededPerCategory, rejectionMessage }
 */
export function validateBidSolvency({
  teamBudget = 0,
  categoryConfigs = {},
  currentOwned = {},
  proposedBidCategory = '',
  proposedBidAmount = 0
}) {
  const budget = Number(teamBudget) || 0;
  const bidAmount = Number(proposedBidAmount) || 0;

  // Normalize category configs into a uniform map of { minRequired, minBasePrice }
  const normalizedConfigs = {};

  if (Array.isArray(categoryConfigs)) {
    for (const cat of categoryConfigs) {
      if (cat && cat.name) {
        normalizedConfigs[cat.name] = {
          minRequired: Number(cat.minRequired) || 0,
          minBasePrice: Number(cat.minBasePrice) || 0
        };
      }
    }
  } else if (categoryConfigs.slots || categoryConfigs.basePrices) {
    const slots = categoryConfigs.slots || {};
    const basePrices = categoryConfigs.basePrices || {};
    const allCatKeys = new Set([...Object.keys(slots), ...Object.keys(basePrices)]);
    for (const key of allCatKeys) {
      normalizedConfigs[key] = {
        minRequired: Number(slots[key]) || 0,
        minBasePrice: Number(basePrices[key]) || 0
      };
    }
  } else {
    for (const [key, val] of Object.entries(categoryConfigs)) {
      if (val && typeof val === 'object') {
        normalizedConfigs[key] = {
          minRequired: Number(val.minRequired) || 0,
          minBasePrice: Number(val.minBasePrice) || 0
        };
      }
    }
  }

  let mandatoryReserve = 0;
  const remainingNeededPerCategory = {};

  // Compute remaining needed and mandatory reserve across ALL configured categories
  for (const [catName, config] of Object.entries(normalizedConfigs)) {
    const minRequired = config.minRequired || 0;
    const minBasePrice = config.minBasePrice || 0;
    const ownedCount = Number(currentOwned[catName]) || 0;
    const isCurrentCategory = (catName === proposedBidCategory);

    // Subtract 1 if this is the category being bid on
    const needed = Math.max(0, minRequired - ownedCount - (isCurrentCategory ? 1 : 0));
    remainingNeededPerCategory[catName] = needed;

    mandatoryReserve += (needed * minBasePrice);
  }

  const maxBid = budget - mandatoryReserve;
  const isAllowed = (bidAmount <= maxBid);

  let rejectionMessage = null;
  if (!isAllowed) {
    const leavesAmount = budget - bidAmount;
    rejectionMessage = `Solvency Lockout: Bidding ${formatRupees(bidAmount)} leaves ${formatRupees(leavesAmount)}, which is less than the ${formatRupees(mandatoryReserve)} required to buy mandatory quota players.`;
  }

  return {
    isAllowed,
    maxBid,
    mandatoryReserve,
    remainingNeededPerCategory,
    rejectionMessage
  };
}
