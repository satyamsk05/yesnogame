import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { tickEngine, getLiveBTCPrice } from "@/lib/engine";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // 1. Run lazy tick to ensure rounds are up-to-date
    await tickEngine();

    const now = new Date().toISOString();
    const livePrice = await getLiveBTCPrice();

    // 2. Fetch the active round
    const { data: activeRounds, error: activeError } = await supabaseAdmin
      .from("market_rounds")
      .select("*")
      .lte("start_time", now)
      .gt("end_time", now)
      .neq("status", "settled")
      .order("start_time", { ascending: false });

    if (activeError) throw activeError;
    const activeRound = activeRounds && activeRounds.length > 0 ? activeRounds[0] : null;

    // 3. Fetch recent settled rounds
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
      activeRound,
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
