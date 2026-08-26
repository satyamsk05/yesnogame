import { supabaseAdmin } from "./supabase";

/**
 * Fetch the current live BTC price from Binance API.
 * Uses BTCUSDT ticker which is free, fast, and does not require credentials.
 */
export async function getLiveBTCPrice(): Promise<number> {
  try {
    const res = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT", {
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Binance HTTP error: ${res.status}`);
    const data = await res.json();
    return parseFloat(data.price);
  } catch (error) {
    console.error("Error fetching live BTC price from Binance:", error);
    // Return a fallback price if API is rate-limited or offline
    return 98500.00;
  }
}

/**
 * Ensure a Clerk user has a corresponding Profile and Wallet record in Supabase.
 * Triggers in Postgres will automatically create a wallet with zero balance when profile is inserted.
 */
export async function ensureUserSynced(
  clerkUserId: string,
  email: string,
  username: string | null
) {
  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", clerkUserId)
    .single();

  if (error || !profile) {
    console.log(`Syncing Clerk user ${clerkUserId} to Supabase...`);
    const { data: newProfile, error: insertError } = await supabaseAdmin
      .from("profiles")
      .insert({
        id: clerkUserId,
        email: email,
        username: username || email.split("@")[0],
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error inserting synced profile:", insertError);
      throw insertError;
    }
    return newProfile;
  }
  return profile;
}

/**
 * Helper to settle an expired round, calculate bets results, update bet status,
 * and credit winners atomically in the ledger.
 */
export async function settleRound(roundId: number, settlementPrice: number) {
  console.log(`[Engine] Settling Round #${roundId} at price $${settlementPrice}`);

  // 1. Update the round status to settled
  const { error: roundUpdateError } = await supabaseAdmin
    .from("market_rounds")
    .update({
      status: "settled",
      end_price: settlementPrice,
    })
    .eq("id", roundId);

  if (roundUpdateError) {
    console.error(`[Engine] Failed to update status of Round #${roundId}:`, roundUpdateError);
    return;
  }

  // 2. Fetch all pending bets placed on this round
  const { data: bets, error: betsError } = await supabaseAdmin
    .from("bets")
    .select("*")
    .eq("round_id", roundId)
    .eq("status", "pending");

  if (betsError) {
    console.error(`[Engine] Failed to load bets for Round #${roundId}:`, betsError);
    return;
  }

  if (!bets || bets.length === 0) {
    console.log(`[Engine] No pending bets to settle for Round #${roundId}`);
    return;
  }

  // 3. Evaluate each bet against the settlement price
  for (const bet of bets) {
    const entryPrice = parseFloat(bet.entry_price.toString());
    const stake = parseFloat(bet.stake.toString());
    let outcome: "won" | "lost" | "refunded" = "lost";
    let payout = 0;

    if (settlementPrice === entryPrice) {
      outcome = "refunded";
      payout = stake; // Return the exact stake
    } else if (bet.direction === "UP") {
      if (settlementPrice > entryPrice) {
        outcome = "won";
        payout = stake * 1.80; // 80% profit
      }
    } else if (bet.direction === "DOWN") {
      if (settlementPrice < entryPrice) {
        outcome = "won";
        payout = stake * 1.80; // 80% profit
      }
    }

    // Update the individual bet status
    const { error: betUpdateError } = await supabaseAdmin
      .from("bets")
      .update({
        status: outcome,
        payout: payout,
        settled_at: new Date().toISOString(),
      })
      .eq("id", bet.id);

    if (betUpdateError) {
      console.error(`[Engine] Failed to update Bet #${bet.id}:`, betUpdateError);
      continue;
    }

    // 4. Write payout transaction to the ledger if user won or was refunded
    if (payout > 0) {
      // Find user wallet
      const { data: wallet, error: walletError } = await supabaseAdmin
        .from("wallets")
        .select("id")
        .eq("user_id", bet.user_id)
        .single();

      if (walletError || !wallet) {
        console.error(`[Engine] Failed to locate wallet for User ID: ${bet.user_id}:`, walletError);
        continue;
      }

      // Record payout to ledger
      const { error: ledgerError } = await supabaseAdmin
        .from("wallet_transactions")
        .insert({
          wallet_id: wallet.id,
          type: "bet_win",
          amount: payout,
          reference_id: bet.id,
          reference_type: "bets",
        });

      if (ledgerError) {
        console.error(`[Engine] Failed to write win ledger for Bet #${bet.id}:`, ledgerError);
      } else {
        console.log(`[Engine] Bet #${bet.id} settled as ${outcome.toUpperCase()}. Paid ₹${payout} to user.`);
      }
    } else {
      console.log(`[Engine] Bet #${bet.id} settled as LOST. Payout is ₹0.`);
    }
  }
}

/**
 * Main engine heartbeat function.
 * Called regularly (e.g., via interval scheduler or lazy trigger).
 * Handles expired round settlement, starts new rounds, and updates round states.
 */
export async function tickEngine() {
  const now = new Date();

  // 1. Fetch live BTC price
  const currentPrice = await getLiveBTCPrice();

  // 2. Fetch and settle all open rounds that have expired (end_time <= now)
  const { data: expiredRounds, error: expiredError } = await supabaseAdmin
    .from("market_rounds")
    .select("*")
    .lt("end_time", now.toISOString())
    .neq("status", "settled");

  if (expiredError) {
    console.error("[Engine] Error searching for expired rounds:", expiredError);
  } else if (expiredRounds && expiredRounds.length > 0) {
    for (const round of expiredRounds) {
      await settleRound(round.id, currentPrice);
    }
  }

  // 3. Check if there is an active running round for the current minute
  // A round is active if start_time <= now AND end_time > now
  const { data: activeRounds, error: activeError } = await supabaseAdmin
    .from("market_rounds")
    .select("*")
    .lte("start_time", now.toISOString())
    .gt("end_time", now.toISOString())
    .neq("status", "settled");

  if (activeError) {
    console.error("[Engine] Error checking active rounds:", activeError);
  } else if (!activeRounds || activeRounds.length === 0) {
    // No active round for the current time. Let's create one.
    // Start time: rounded down to the current minute
    const startTime = new Date(Math.floor(now.getTime() / 60000) * 60000);
    const endTime = new Date(startTime.getTime() + 60000);

    console.log(`[Engine] Starting new round: ${startTime.toISOString()} to ${endTime.toISOString()}`);

    const { error: insertError } = await supabaseAdmin
      .from("market_rounds")
      .insert({
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        status: "open",
        start_price: currentPrice,
      });

    if (insertError) {
      console.error("[Engine] Error creating new round:", insertError);
    }
  }
}
