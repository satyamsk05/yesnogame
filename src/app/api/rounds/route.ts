import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getLiveBTCPrice } from "@/lib/engine";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const livePrice = await getLiveBTCPrice();

    // Fetch recent settled rounds for history display
    const { data: settledRounds, error: settledError } = await supabaseAdmin
      .from("market_rounds")
      .select("*")
      .eq("status", "settled")
      .order("end_time", { ascending: false })
      .limit(15);

    if (settledError) throw settledError;

    return NextResponse.json({
      success: true,
      price: livePrice,
      activeRound: null, // Rounds are now on-demand per user bet
      history: settledRounds || [],
      serverTime: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Error in /api/rounds API:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
