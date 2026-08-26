import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase";
import { ensureUserSynced, getLiveBTCPrice } from "@/lib/engine";

export const dynamic = "force-dynamic";

// GET: Retrieve user's bet history and lazy-settle expired rounds
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    // 1. Fetch user's pending bets
    const { data: pendingBets, error: pendingBetsError } = await supabaseAdmin
      .from("bets")
      .select(`
        *,
        market_rounds!inner (
          id,
          start_time,
          end_time,
          status,
          start_price,
          end_price
        )
      `)
      .eq("user_id", userId)
      .eq("status", "pending");

    if (pendingBetsError) throw pendingBetsError;

    // 2. Filter bets where the round end_time has passed
    const now = new Date();
    const expiredBets = (pendingBets || []).filter((bet: any) => {
      const endTime = new Date(bet.market_rounds.end_time);
      return endTime <= now;
    });

    // 3. Lazy Settle each expired prediction
    if (expiredBets.length > 0) {
      for (const bet of expiredBets) {
        try {
          const round = bet.market_rounds;
          const endTimeMs = new Date(round.end_time).getTime();
          
          // Query Binance 1s candlesticks close price
          const binanceUrl = `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1s&startTime=${endTimeMs}&limit=1`;
          const binanceRes = await fetch(binanceUrl);
          const klines = await binanceRes.json();
          let endPrice = parseFloat(round.start_price.toString());
          
          if (klines && klines[0]) {
            endPrice = parseFloat(klines[0][4]); // Close price of the 1-second candle
          }
          
          const startPrice = parseFloat(round.start_price.toString());
          const stake = parseFloat(bet.stake.toString());
          let status: "won" | "lost" | "refunded" = "lost";
          let payout = 0;
          
          if (endPrice === startPrice) {
            status = "refunded";
            payout = stake;
          } else if (bet.direction === "UP" && endPrice > startPrice) {
            status = "won";
            payout = stake * 1.8;
          } else if (bet.direction === "DOWN" && endPrice < startPrice) {
            status = "won";
            payout = stake * 1.8;
          }
          
          // Settle round and bet
          await supabaseAdmin
            .from("market_rounds")
            .update({ status: "settled", end_price: endPrice })
            .eq("id", round.id);
            
          await supabaseAdmin
            .from("bets")
            .update({ status, payout })
            .eq("id", bet.id);
            
          if (payout > 0) {
            const { data: wallet } = await supabaseAdmin
              .from("wallets")
              .select("id")
              .eq("user_id", userId)
              .single();
              
            if (wallet) {
              await supabaseAdmin
                .from("wallet_transactions")
                .insert({
                  wallet_id: wallet.id,
                  type: status === "won" ? "bet_win" : "bet_refund",
                  amount: payout,
                  reference_id: bet.id,
                  reference_type: "bets",
                });
            }
          }
        } catch (err) {
          console.error(`Lazy settlement error for bet ${bet.id}:`, err);
        }
      }
    }

    // 4. Fetch updated bet history sorted by creation time
    const { data: bets, error } = await supabaseAdmin
      .from("bets")
      .select(`
        *,
        market_rounds (
          start_time,
          end_time,
          status,
          end_price
        )
      `)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    // 5. Fetch user wallet balance
    const { data: wallet } = await supabaseAdmin
      .from("wallets")
      .select("balance")
      .eq("user_id", userId)
      .single();

    return NextResponse.json({
      success: true,
      bets: bets || [],
      balance: wallet ? parseFloat(wallet.balance.toString()) : 0.00,
    });
  } catch (error: any) {
    console.error("Error in GET /api/bets:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// POST: Place a prediction (creates round on-demand)
export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { direction, stake } = body;

    // Validate inputs
    if (!direction || !stake || stake <= 0) {
      return NextResponse.json({ success: false, error: "Invalid inputs" }, { status: 400 });
    }
    if (direction !== "UP" && direction !== "DOWN") {
      return NextResponse.json({ success: false, error: "Direction must be UP or DOWN" }, { status: 400 });
    }

    // Ensure Clerk profile is synchronized with Supabase
    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "User session not found" }, { status: 400 });
    }
    const email = user.emailAddresses[0]?.emailAddress;
    const username = user.username || user.firstName || "User";
    await ensureUserSynced(userId, email, username);

    // 1. Fetch user's wallet
    const { data: wallet, error: walletError } = await supabaseAdmin
      .from("wallets")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (walletError || !wallet) {
      return NextResponse.json({ success: false, error: "Wallet not found" }, { status: 400 });
    }

    // Double check balance before inserting
    if (parseFloat(wallet.balance) < stake) {
      return NextResponse.json({ success: false, error: "Insufficient balance" }, { status: 400 });
    }

    // Get current live BTC price as entry price
    const entryPrice = await getLiveBTCPrice();

    // 2. Create a user-private 60-second round
    const now = new Date();
    const endTime = new Date(now.getTime() + 60 * 1000);
    const { data: round, error: roundError } = await supabaseAdmin
      .from("market_rounds")
      .insert({
        market: "BTC/USD",
        start_time: now.toISOString(),
        end_time: endTime.toISOString(),
        status: "open",
        start_price: entryPrice,
        end_price: null
      })
      .select()
      .single();

    if (roundError || !round) {
      console.error("Round creation error:", roundError);
      return NextResponse.json({ success: false, error: "Failed to create round" }, { status: 500 });
    }

    // 3. Insert the bet record
    const { data: bet, error: betInsertError } = await supabaseAdmin
      .from("bets")
      .insert({
        user_id: userId,
        round_id: round.id,
        direction,
        stake,
        entry_price: entryPrice,
        status: "pending",
      })
      .select()
      .single();

    if (betInsertError || !bet) {
      console.error("Bet insertion error:", betInsertError);
      return NextResponse.json({ success: false, error: "Failed to place bet" }, { status: 500 });
    }

    // 4. Debit the user's wallet via the ledger
    const { error: ledgerError } = await supabaseAdmin
      .from("wallet_transactions")
      .insert({
        wallet_id: wallet.id,
        type: "bet_place",
        amount: -stake,
        reference_id: bet.id,
        reference_type: "bets",
      });

    if (ledgerError) {
      console.error("Ledger transaction error (balance check):", ledgerError);

      // Clean up the bet and round we just created (revert)
      await supabaseAdmin.from("bets").delete().eq("id", bet.id);
      await supabaseAdmin.from("market_rounds").delete().eq("id", round.id);

      return NextResponse.json({ success: false, error: "Insufficient balance or transaction failed" }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: "Prediction placed successfully",
      bet,
    });
  } catch (error: any) {
    console.error("Error in POST /api/bets:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
