import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase";
import { ensureUserSynced } from "@/lib/engine";

export const dynamic = "force-dynamic";

// Helper to send message to Telegram bot
async function sendTelegramDepositNotification(
  depositId: string,
  username: string,
  amount: number,
  utr: string
) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;

  const text = `<b>💰 New Deposit Request</b>\n\n` +
               `<b>User:</b> ${username}\n` +
               `<b>Amount:</b> ₹${amount.toFixed(2)}\n` +
               `<b>UTR:</b> <code>${utr}</code>\n` +
               `<b>Deposit ID:</b> <code>${depositId}</code>`;

  if (!token || !chatId) {
    console.log("=========================================");
    console.log("MOCK TELEGRAM BOT NOTIFICATION (NO CREDENTIALS SET)");
    console.log(`Text: ${text.replace(/<[^>]*>/g, "")}`);
    console.log(`Action URLs for testing:`);
    console.log(`Confirm Callback: confirm:${depositId}`);
    console.log(`Reject Callback: reject:${depositId}`);
    console.log("=========================================");
    return;
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Confirm", callback_data: `confirm:${depositId}` },
              { text: "❌ Reject", callback_data: `reject:${depositId}` }
            ]
          ]
        }
      })
    });
    if (!res.ok) {
      console.error("Telegram bot API error response:", await res.text());
    }
  } catch (err) {
    console.error("Failed to send telegram notification:", err);
  }
}

// GET: Retrieve user's deposit history
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { data: deposits, error } = await supabaseAdmin
      .from("deposits")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ success: true, deposits: deposits || [] });
  } catch (error: any) {
    console.error("Error in GET /api/deposits:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// POST: Initiate deposit or submit UTR
export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    // Ensure user has profile synced
    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "User session not found" }, { status: 400 });
    }
    const email = user.emailAddresses[0]?.emailAddress;
    const username = user.username || user.firstName || "User";
    await ensureUserSynced(userId, email, username);

    const body = await req.json();
    const { action, amount, depositId, utr } = body;

    // Action A: INITIATE DEPOSIT
    if (action === "initiate") {
      if (!amount || amount <= 0) {
        return NextResponse.json({ success: false, error: "Amount must be greater than zero" }, { status: 400 });
      }

      // Generate a short readable deposit ID: DEP-XXXXX (e.g. DEP-38491)
      const randomDigits = Math.floor(10000 + Math.random() * 90000);
      const newDepositId = `DEP-${randomDigits}`;

      const { data: deposit, error: insertError } = await supabaseAdmin
        .from("deposits")
        .insert({
          id: newDepositId,
          user_id: userId,
          amount: amount,
          status: "pending_utr",
        })
        .select()
        .single();

      if (insertError) {
        console.error("Error creating deposit request:", insertError);
        return NextResponse.json({ success: false, error: "Failed to initiate deposit" }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        depositId: newDepositId,
        deposit,
      });
    }

    // Action B: SUBMIT UTR
    if (action === "submit_utr") {
      if (!depositId || !utr) {
        return NextResponse.json({ success: false, error: "Deposit ID and UTR are required" }, { status: 400 });
      }

      // Validate UTR is exactly 12 digits
      const utrRegex = /^[0-9]{12}$/;
      if (!utrRegex.test(utr)) {
        return NextResponse.json({ success: false, error: "UTR must be a 12-digit numeric code" }, { status: 400 });
      }

      // Fetch the deposit
      const { data: deposit, error: fetchError } = await supabaseAdmin
        .from("deposits")
        .select("*")
        .eq("id", depositId)
        .eq("user_id", userId)
        .single();

      if (fetchError || !deposit) {
        return NextResponse.json({ success: false, error: "Deposit record not found" }, { status: 404 });
      }

      if (deposit.status !== "pending_utr") {
        return NextResponse.json({ success: false, error: "UTR already submitted for this deposit" }, { status: 400 });
      }

      // Update deposit with UTR and change status to pending_approval
      const { data: updatedDeposit, error: updateError } = await supabaseAdmin
        .from("deposits")
        .update({
          utr: utr,
          status: "pending_approval",
          updated_at: new Date().toISOString(),
        })
        .eq("id", depositId)
        .select()
        .single();

      if (updateError) {
        if (updateError.code === "23505") {
          return NextResponse.json({ success: false, error: "This UTR has already been submitted before." }, { status: 400 });
        }
        console.error("Error updating UTR:", updateError);
        return NextResponse.json({ success: false, error: "Failed to submit UTR" }, { status: 500 });
      }

      // Dispatch Telegram Bot Notification
      await sendTelegramDepositNotification(
        depositId,
        username,
        parseFloat(deposit.amount),
        utr
      );

      return NextResponse.json({
        success: true,
        message: "UTR submitted. Awaiting admin verification.",
        deposit: updatedDeposit,
      });
    }

    return NextResponse.json({ success: false, error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    console.error("Error in POST /api/deposits:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
