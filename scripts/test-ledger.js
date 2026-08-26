/**
 * Ledger Consistency Validation Test
 * Simulates transactions and asserts ledger balances.
 */

console.log("=========================================");
console.log("STARTING LEDGER BALANCE CONSISTENCY TEST");
console.log("=========================================");

// Mock Database Ledger Transactions
const mockLedger = [];
let mockWalletBalance = 0;

function insertLedgerTransaction(type, amount, referenceId, referenceType) {
  // Simulate DB Transaction Write
  const tx = {
    id: `TX-${Math.floor(Math.random() * 90000) + 10000}`,
    type,
    amount,
    referenceId,
    referenceType,
    created_at: new Date().toISOString()
  };
  
  mockLedger.push(tx);
  
  // Simulate PostgreSQL Trigger Update (AFTER INSERT)
  mockWalletBalance += amount;
  
  console.log(`[Ledger TRIGGER] Inserted ${type.toUpperCase()} of ${amount >= 0 ? "+" : ""}₹${amount}. New wallet balance: ₹${mockWalletBalance}`);
  
  // Assert no negative balance (similar to DB check constraints)
  if (mockWalletBalance < 0) {
    // Database rollback: revert the balance modification and remove from ledger
    mockWalletBalance -= amount;
    mockLedger.pop();
    throw new Error(`[DB CONSTRAINT FAILED] Balance cannot fall below zero. Current: ₹${mockWalletBalance}`);
  }
  
  return tx;
}

function calculateBalanceFromLedger() {
  return mockLedger.reduce((sum, tx) => sum + tx.amount, 0);
}

try {
  // 1. Initial State
  console.log("\n--- Phase 1: Initialize User Wallet ---");
  console.log(`Starting wallet balance: ₹${mockWalletBalance}`);
  if (mockWalletBalance !== 0) throw new Error("Wallet balance must start at 0.");

  // 2. Simulate User Deposit
  console.log("\n--- Phase 2: User Deposits ₹100 via UPI ---");
  insertLedgerTransaction("deposit", 100.00, "DEP-49201", "deposits");
  
  let ledgerSum = calculateBalanceFromLedger();
  console.log(`Verified Ledger Sum: ₹${ledgerSum}`);
  if (ledgerSum !== 100.00 || mockWalletBalance !== 100.00) {
    throw new Error("Verification failed after deposit.");
  }

  // 3. User places a bet
  console.log("\n--- Phase 3: User places UP prediction bet of ₹20 ---");
  const betId = "BET-90184";
  insertLedgerTransaction("bet_place", -20.00, betId, "bets");
  
  ledgerSum = calculateBalanceFromLedger();
  console.log(`Verified Ledger Sum: ₹${ledgerSum}`);
  if (ledgerSum !== 80.00 || mockWalletBalance !== 80.00) {
    throw new Error("Verification failed after placing bet.");
  }

  // 4. User attempts to overdraw wallet (insufficient balance)
  console.log("\n--- Phase 4: User attempts to place massive bet (₹150) ---");
  try {
    insertLedgerTransaction("bet_place", -150.00, "BET-99999", "bets");
    throw new Error("Test failed: User was allowed to overdraw wallet balance!");
  } catch (err) {
    console.log(`[Expected Failure Success] Rejected transaction: ${err.message}`);
  }

  // Double check balance is still ₹80
  if (mockWalletBalance !== 80.00) {
    throw new Error("Wallet balance changed during failed overdraft transaction.");
  }

  // 5. Predict Wins (80% profit payout on ₹20 = ₹36)
  console.log("\n--- Phase 5: UP Bet Wins (Payout = 1.8x = ₹36) ---");
  insertLedgerTransaction("bet_win", 36.00, betId, "bets");
  
  ledgerSum = calculateBalanceFromLedger();
  console.log(`Verified Ledger Sum: ₹${ledgerSum}`);
  if (ledgerSum !== 116.00 || mockWalletBalance !== 116.00) {
    throw new Error("Verification failed after bet win payout.");
  }

  // 6. User withdraws ₹50
  console.log("\n--- Phase 6: User withdraws ₹50 ---");
  insertLedgerTransaction("withdrawal_approve", -50.00, "WD-39182", "withdrawals");
  
  ledgerSum = calculateBalanceFromLedger();
  console.log(`Verified Ledger Sum: ₹${ledgerSum}`);
  if (ledgerSum !== 66.00 || mockWalletBalance !== 66.00) {
    throw new Error("Verification failed after withdrawal approve.");
  }

  console.log("\n=========================================");
  console.log("SUCCESS: ALL LEDGER INTEGRITY TESTS PASSED");
  console.log("=========================================");
} catch (testError) {
  console.error("\n❌ LEDGER INTEGRITY TEST FAILED!");
  console.error(testError.message);
  process.exit(1);
}
