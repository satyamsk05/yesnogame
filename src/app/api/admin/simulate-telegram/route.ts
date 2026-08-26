import { NextResponse } from "next/server";
import { processDepositConfirmation } from "@/lib/deposit-service";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// GET: Fetch all deposits (for admin dashboard view)
export async function GET() {
  try {
    const { data: deposits, error } = await supabaseAdmin
      .from("deposits")
      .select(`
        *,
        profiles (
          email,
          username
        )
      `)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ success: true, deposits: deposits || [] });
  } catch (error: any) {
    console.error("Error in GET /api/admin/simulate-telegram:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// POST: Simulate the Telegram inline Confirm/Reject buttons
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { depositId, action, rejectionReason } = body;

    if (!depositId || (action !== "confirm" && action !== "reject")) {
      return NextResponse.json({ success: false, error: "Invalid request payload" }, { status: 400 });
    }

    // Call the shared deposit ledger processing function
    const result = await processDepositConfirmation(depositId, action, rejectionReason);

    return NextResponse.json({
      success: true,
      message: result.message,
    });
  } catch (error: any) {
    console.error("Error in POST /api/admin/simulate-telegram:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
