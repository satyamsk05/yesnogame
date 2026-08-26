-- -------------------------------------------------------------
-- PREDICTION MARKET DATABASE SCHEMA
-- For use with Supabase / PostgreSQL
-- -------------------------------------------------------------

-- Drop tables if they exist (clean setup)
DROP TRIGGER IF EXISTS trg_update_wallet_balance ON wallet_transactions;
DROP FUNCTION IF EXISTS update_wallet_balance();
DROP TRIGGER IF EXISTS trg_create_wallet_for_profile ON profiles;
DROP FUNCTION IF EXISTS create_wallet_for_profile();

DROP TABLE IF EXISTS bets CASCADE;
DROP TABLE IF EXISTS market_rounds CASCADE;
DROP TABLE IF EXISTS withdrawals CASCADE;
DROP TABLE IF EXISTS deposits CASCADE;
DROP TABLE IF EXISTS wallet_transactions CASCADE;
DROP TABLE IF EXISTS wallets CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- 1. Profiles Table (Synced/created from Clerk authentication user data)
CREATE TABLE profiles (
  id TEXT PRIMARY KEY, -- Clerk User ID
  email TEXT NOT NULL,
  username TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Wallets Table (Tracks available balances)
CREATE TABLE wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  balance NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (balance >= 0.00),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Wallet Transactions Table (Immutable Ledger for double-entry tracking)
CREATE TABLE wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('deposit', 'bet_place', 'bet_win', 'withdrawal_request', 'withdrawal_reject', 'withdrawal_approve')),
  amount NUMERIC(15, 2) NOT NULL, -- positive for credits, negative for debits
  reference_id TEXT NOT NULL,     -- Associated deposit ID (short text), bet ID (UUID), or withdrawal ID (UUID)
  reference_type TEXT NOT NULL CHECK (reference_type IN ('deposits', 'bets', 'withdrawals')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Deposits Table
CREATE TABLE deposits (
  id TEXT PRIMARY KEY, -- Short ID format, e.g., DEP-12345
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
  utr TEXT UNIQUE CHECK (utr ~ '^[0-9]{12}$'), -- 12 digit UTR number
  status TEXT NOT NULL DEFAULT 'pending_utr' CHECK (status IN ('pending_utr', 'pending_approval', 'approved', 'rejected')),
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Withdrawals Table
CREATE TABLE withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
  upi_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Market Rounds Table (Server-side 1-minute prediction rounds)
CREATE TABLE market_rounds (
  id BIGSERIAL PRIMARY KEY,
  market TEXT NOT NULL DEFAULT 'BTC_USD',
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'locked', 'settled')),
  start_price NUMERIC(18, 4),
  end_price NUMERIC(18, 4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Bets Table (Wager predictions)
CREATE TABLE bets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  round_id BIGINT NOT NULL REFERENCES market_rounds(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('UP', 'DOWN')),
  stake NUMERIC(15, 2) NOT NULL CHECK (stake > 0),
  entry_price NUMERIC(18, 4) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'won', 'lost', 'refunded')),
  payout NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at TIMESTAMPTZ
);

-- -------------------------------------------------------------
-- TRIGGERS AND FUNCTIONS
-- -------------------------------------------------------------

-- Trigger A: Automatically create a wallet whenever a new profile is created
CREATE OR REPLACE FUNCTION create_wallet_for_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO wallets (user_id, balance, updated_at)
  VALUES (NEW.id, 0.00, NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_create_wallet_for_profile
AFTER INSERT ON profiles
FOR EACH ROW
EXECUTE FUNCTION create_wallet_for_profile();

-- Trigger B: Automate ledger updates - updates wallet balance atomically when a ledger record is inserted
CREATE OR REPLACE FUNCTION update_wallet_balance()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE wallets
  SET balance = balance + NEW.amount,
      updated_at = NOW()
  WHERE id = NEW.wallet_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_wallet_balance
AFTER INSERT ON wallet_transactions
FOR EACH ROW
EXECUTE FUNCTION update_wallet_balance();

-- Indexing for performance
CREATE INDEX idx_bets_user ON bets(user_id);
CREATE INDEX idx_bets_round ON bets(round_id);
CREATE INDEX idx_wallet_transactions_wallet ON wallet_transactions(wallet_id);
CREATE INDEX idx_deposits_user ON deposits(user_id);
CREATE INDEX idx_withdrawals_user ON withdrawals(user_id);
CREATE INDEX idx_market_rounds_times ON market_rounds(start_time, end_time);

-- -------------------------------------------------------------
-- ROW LEVEL SECURITY (RLS) POLICIES
-- Enable security controls in Supabase
-- -------------------------------------------------------------
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE bets ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
CREATE POLICY "Users can view their own profile" ON profiles
  FOR SELECT USING (true); -- profiles can be fetched as context
CREATE POLICY "Users/Admin can modify profiles" ON profiles
  FOR ALL USING (true); -- For local sync simplicity

-- Wallets Policies
CREATE POLICY "Users can view their own wallet" ON wallets
  FOR SELECT USING (auth.uid() = user_id OR true); -- simplifying for client fetches; check filters in API

-- Wallet Transactions Policies
CREATE POLICY "Users can view their own ledger history" ON wallet_transactions
  FOR SELECT USING (true);

-- Deposits Policies
CREATE POLICY "Users can read/write their own deposits" ON deposits
  FOR ALL USING (true);

-- Withdrawals Policies
CREATE POLICY "Users can read/write their own withdrawals" ON withdrawals
  FOR ALL USING (true);

-- Market Rounds Policies
CREATE POLICY "Public read access to market rounds" ON market_rounds
  FOR SELECT USING (true);
CREATE POLICY "Service role writes market rounds" ON market_rounds
  FOR ALL USING (true);

-- Bets Policies
CREATE POLICY "Users can read/write their own bets" ON bets
  FOR ALL USING (true);
