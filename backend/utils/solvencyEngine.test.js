const { validateBidSolvency, formatRupees } = require('./solvencyEngine');

let passedTests = 0;
let totalTests = 0;

function assert(condition, testName) {
  totalTests++;
  if (condition) {
    console.log(`✅ PASS: ${testName}`);
    passedTests++;
  } else {
    console.error(`❌ FAIL: ${testName}`);
    process.exitCode = 1;
  }
}

console.log('--- RUNNING SOLVENCY ENGINE UNIT TESTS ---\n');

const standardRules = {
  slots: { A: 2, B: 3, C: 5 },
  basePrices: { A: 1000000, B: 500000, C: 200000 }
};

// Edge Case 1: Brand New Team (0 players owned in every category)
// Bidding on Cat A: needs 1 A (10L), 3 B (15L), 5 C (10L) = 35L reserve.
// Budget = 100L -> maxBid = 65L
{
  const result = validateBidSolvency({
    teamBudget: 10000000,
    categoryConfigs: standardRules,
    currentOwned: { A: 0, B: 0, C: 0 },
    proposedBidCategory: 'A',
    proposedBidAmount: 6500000
  });
  assert(result.isAllowed === true, 'Edge Case 1A: 0 players owned - bid of 65L on Cat A is allowed');
  assert(result.mandatoryReserve === 3500000, 'Edge Case 1A: Mandatory reserve is exactly 35L');
  assert(result.maxBid === 6500000, 'Edge Case 1A: Max bid is exactly 65L');

  const overBid = validateBidSolvency({
    teamBudget: 10000000,
    categoryConfigs: standardRules,
    currentOwned: { A: 0, B: 0, C: 0 },
    proposedBidCategory: 'A',
    proposedBidAmount: 6500001
  });
  assert(overBid.isAllowed === false, 'Edge Case 1A: Bid of 65L + 1 is rejected');
  assert(overBid.rejectionMessage.includes('Solvency Lockout'), 'Edge Case 1A: Rejection message contains Solvency Lockout');
}

// Edge Case 1B: Brand New Team bidding on Cat C:
// Needs 2 A (20L), 3 B (15L), 4 C (8L) = 43L reserve.
// Budget = 100L -> maxBid = 57L
{
  const result = validateBidSolvency({
    teamBudget: 10000000,
    categoryConfigs: standardRules,
    currentOwned: { A: 0, B: 0, C: 0 },
    proposedBidCategory: 'C',
    proposedBidAmount: 5700000
  });
  assert(result.isAllowed === true, 'Edge Case 1B: 0 players owned - bid of 57L on Cat C is allowed');
  assert(result.mandatoryReserve === 4300000, 'Edge Case 1B: Mandatory reserve is exactly 43L');
  assert(result.maxBid === 5700000, 'Edge Case 1B: Max bid on Cat C is 57L');
}

// Edge Case 2: User\'s exact bug scenario (Budget 90L, owned: { A: 0, B: 0, C: 1 })
// Bidding on Cat C: needs 2 A (20L), 3 B (15L), 3 C (6L) = 41L reserve.
// Budget = 90L -> maxBid = 49L. Proposed bid = 60L -> MUST BE REJECTED!
{
  const result = validateBidSolvency({
    teamBudget: 9000000,
    categoryConfigs: standardRules,
    currentOwned: { A: 0, B: 0, C: 1 },
    proposedBidCategory: 'C',
    proposedBidAmount: 6000000
  });
  assert(result.isAllowed === false, 'Edge Case 2: 90L budget bidding 60L on Cat C is REJECTED');
  assert(result.mandatoryReserve === 4100000, 'Edge Case 2: Mandatory reserve is 41L');
  assert(result.maxBid === 4900000, 'Edge Case 2: Max bid allowed is 49L');
  assert(
    result.rejectionMessage === 'Solvency Lockout: Bidding ₹60,00,000 leaves ₹30,00,000, which is less than the ₹41,00,000 required to buy mandatory quota players.',
    'Edge Case 2: Exact format of rejection message matches specification'
  );
}

// Edge Case 3: Category quota already met (Depth bidding)
// Owned: { A: 2, B: 3, C: 3 }. Needs 2 more C (4L).
// Bidding on 3rd Cat A player: A needed = 0, B needed = 0, C needed = 2 (4L).
// Budget = 50L -> maxBid = 46L.
{
  const result = validateBidSolvency({
    teamBudget: 5000000,
    categoryConfigs: standardRules,
    currentOwned: { A: 2, B: 3, C: 3 },
    proposedBidCategory: 'A',
    proposedBidAmount: 4600000
  });
  assert(result.isAllowed === true, 'Edge Case 3: Depth bid on already-filled Cat A is allowed up to 46L');
  assert(result.mandatoryReserve === 400000, 'Edge Case 3: Mandatory reserve is only 4L for the remaining 2 Cat C players');
  assert(result.maxBid === 4600000, 'Edge Case 3: Max bid is 46L');
}

// Edge Case 4: One player away from completing entire minimum squad (Last player)
// Owned: { A: 2, B: 3, C: 4 } (9 players owned). Bidding on 10th player (Cat C).
// Reserve should be exactly 0. Team can bid 100% of remaining budget.
{
  const result = validateBidSolvency({
    teamBudget: 1500000,
    categoryConfigs: standardRules,
    currentOwned: { A: 2, B: 3, C: 4 },
    proposedBidCategory: 'C',
    proposedBidAmount: 1500000
  });
  assert(result.isAllowed === true, 'Edge Case 4: Final required player allows bidding 100% of remaining budget');
  assert(result.mandatoryReserve === 0, 'Edge Case 4: Mandatory reserve is 0');
  assert(result.maxBid === 1500000, 'Edge Case 4: Max bid is 15L');
}

// Edge Case 5: Insolvent team (Budget is already less than mandatory reserve)
// Budget = 20L, owned = { A: 0, B: 0, C: 0 }, bidding on Cat A (Reserve = 35L).
// maxBid = 20L - 35L = -15L. Any bid (even 10L base price) MUST be rejected.
{
  const result = validateBidSolvency({
    teamBudget: 2000000,
    categoryConfigs: standardRules,
    currentOwned: { A: 0, B: 0, C: 0 },
    proposedBidCategory: 'A',
    proposedBidAmount: 1000000
  });
  assert(result.isAllowed === false, 'Edge Case 5: Insolvent team bidding base price is REJECTED');
  assert(result.maxBid === -1500000, 'Edge Case 5: Max bid is negative (-15L)');
}

// Edge Case 6: Exact boundary test (bid === maxBid vs bid === maxBid + 1)
{
  const budget = 5000000;
  // Owned { A: 1, B: 2, C: 3 }. Bidding on Cat B:
  // Needs 1 A (10L), 0 B (0L), 2 C (4L) = 14L reserve. Max bid = 36L.
  const passBid = validateBidSolvency({
    teamBudget: budget,
    categoryConfigs: standardRules,
    currentOwned: { A: 1, B: 2, C: 3 },
    proposedBidCategory: 'B',
    proposedBidAmount: 3600000
  });
  assert(passBid.isAllowed === true, 'Edge Case 6: Bid exactly equal to maxBid (36L) is ALLOWED');

  const failBid = validateBidSolvency({
    teamBudget: budget,
    categoryConfigs: standardRules,
    currentOwned: { A: 1, B: 2, C: 3 },
    proposedBidCategory: 'B',
    proposedBidAmount: 3600001
  });
  assert(failBid.isAllowed === false, 'Edge Case 6: Bid of maxBid + 1 (36L + 1) is REJECTED');
}

// Edge Case 7: Unconfigured category (handled gracefully)
{
  const result = validateBidSolvency({
    teamBudget: 50000000,
    categoryConfigs: standardRules,
    currentOwned: { A: 0, B: 0, C: 0 },
    proposedBidCategory: 'Special',
    proposedBidAmount: 5000000
  });
  assert(result.isAllowed === true, 'Edge Case 7: Unconfigured category is processed gracefully');
  assert(result.mandatoryReserve === 4500000, 'Edge Case 7: Full reserve for standard categories (45L) is preserved');
}

// Edge Case 8: User's EXACT Room Configuration (A: 4, B: 2, C: 4 with basePrices 10L, 5L, 2L, budget 100L)
const userRoomRules = {
  slots: { A: 4, B: 2, C: 4 },
  basePrices: { A: 1000000, B: 500000, C: 200000 }
};

// Team owns 0 players in all categories, bidding on Category A player:
// Reserve = 3 A (30L) + 2 B (10L) + 4 C (8L) = 48L
// Max allowed bid = 100L - 48L = 52L
{
  // Test 1: Bid of 60L on Cat A -> REJECTED
  const res60L = validateBidSolvency({
    teamBudget: 10000000,
    categoryConfigs: userRoomRules,
    currentOwned: { A: 0, B: 0, C: 0 },
    proposedBidCategory: 'A',
    proposedBidAmount: 6000000
  });
  assert(res60L.isAllowed === false, 'User Room: Bid of 60L on Cat A is REJECTED');
  assert(res60L.mandatoryReserve === 4800000, 'User Room: Mandatory reserve is exactly 48L');
  assert(res60L.maxBid === 5200000, 'User Room: Max bid is exactly 52L');
  assert(
    res60L.rejectionMessage === 'Solvency Lockout: Bidding ₹60,00,000 leaves ₹40,00,000, which is less than the ₹48,00,000 required to buy mandatory quota players.',
    'User Room: Rejection message for 60L matches format'
  );

  // Test 2: Bid of 52L on Cat A -> ALLOWED (Exact boundary)
  const res52L = validateBidSolvency({
    teamBudget: 10000000,
    categoryConfigs: userRoomRules,
    currentOwned: { A: 0, B: 0, C: 0 },
    proposedBidCategory: 'A',
    proposedBidAmount: 5200000
  });
  assert(res52L.isAllowed === true, 'User Room: Bid of 52L on Cat A (exact boundary) is ALLOWED');

  // Test 3: Bid of 52L + 1 (5200001) on Cat A -> REJECTED
  const res52LPlus1 = validateBidSolvency({
    teamBudget: 10000000,
    categoryConfigs: userRoomRules,
    currentOwned: { A: 0, B: 0, C: 0 },
    proposedBidCategory: 'A',
    proposedBidAmount: 5200001
  });
  assert(res52LPlus1.isAllowed === false, 'User Room: Bid of 5200001 on Cat A is REJECTED');
  assert(
    res52LPlus1.rejectionMessage === 'Solvency Lockout: Bidding ₹52,00,001 leaves ₹47,99,999, which is less than the ₹48,00,000 required to buy mandatory quota players.',
    'User Room: Rejection message for 5200001 matches format'
  );
}

console.log(`\n=====================================`);
console.log(`TEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED`);
console.log(`=====================================\n`);
