import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase";
import { ensureUserSynced, getLiveBTCPrice } from "@/lib/engine";

export const dynamic = "force-dynamic";

// GET: Retrieve user's bet history
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    // Fetch user bets sorted by creation time
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

    // Fetch user wallet balance
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

// POST: Place a prediction bet
export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { roundId, direction, stake } = body;

    // Validate inputs
    if (!roundId || !direction || !stake || stake <= 0) {
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

    // 2. Fetch the market round to verify constraints
    const { data: round, error: roundError } = await supabaseAdmin
      .from("market_rounds")
      .select("*")
      .eq("id", roundId)
      .single();

    if (roundError || !round) {
      return NextResponse.json({ success: false, error: "Round not found" }, { status: 404 });
    }

    if (round.status === "settled") {
      return NextResponse.json({ success: false, error: "Round already settled" }, { status: 400 });
    }

    // Check Lockout Window: Cutoff is 15 seconds before the round ends
    const now = new Date();
    const endTime = new Date(round.end_time);
    const secondsRemaining = (endTime.getTime() - now.getTime()) / 1000;

    if (secondsRemaining <= 15) {
      return NextResponse.json({
        success: false,
        error: "Round is locked. No more predictions allowed for this minute.",
      }, { status: 400 });
    }

    // Get current live BTC price as entry price
    const entryPrice = await getLiveBTCPrice();

    // 3. Insert the bet record
    const { data: bet, error: betInsertError } = await supabaseAdmin
      .from("bets")
      .insert({
        user_id: userId,
        round_id: roundId,
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
    // If the wallet balance constraint is breached (falls below zero), Postgres returns a DB error.
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

      // Clean up the bet we just created (revert)
      await supabaseAdmin.from("bets").delete().eq("id", bet.id);

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
