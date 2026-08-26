import { NextResponse } from "next/server";
import { processDepositConfirmation } from "@/lib/deposit-service";

export const dynamic = "force-dynamic";

// Helper to edit the Telegram message to remove buttons and show confirmation status
async function updateTelegramMessage(
  token: string,
  chatId: number | string,
  messageId: number,
  originalText: string,
  statusText: string
) {
  try {
    const updatedText = `${originalText}\n\n<b>Status:</b> ${statusText}\n<i>Updated at: ${new Date().toLocaleTimeString()}</i>`;

    await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text: updatedText,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [] }, // Clears the buttons
      }),
    });
  } catch (err) {
    console.error("Failed to update telegram message UI:", err);
  }
}

// Helper to send a temporary callback popup notice in Telegram client
async function answerCallbackQuery(token: string, callbackQueryId: string, alertText: string) {
  try {
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text: alertText,
        show_alert: false,
      }),
    });
  } catch (err) {
    console.error("Failed to answer callback query:", err);
  }
}

export async function POST(req: Request) {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  try {
    const update = await req.json();

    // Verify it is a callback query update
    const callbackQuery = update.callback_query;
    if (!callbackQuery) {
      return NextResponse.json({ ok: true });
    }

    const { data: callbackData, id: queryId, message } = callbackQuery;
    if (!callbackData || !message) {
      return NextResponse.json({ ok: true });
    }

    // callbackData structure: "confirm:DEP-12345" or "reject:DEP-12345"
    const parts = callbackData.split(":");
    const action = parts[0] as "confirm" | "reject";
    const depositId = parts[1];

    if (!depositId || (action !== "confirm" && action !== "reject")) {
      if (token) await answerCallbackQuery(token, queryId, "Invalid callback action.");
      return NextResponse.json({ ok: true });
    }

    const chat_id = message.chat.id;
    const message_id = message.message_id;
    const originalText = message.text || "Deposit Request";

    // 1. Process the deposit update in our ledger system
    try {
      const result = await processDepositConfirmation(depositId, action);

      if (token) {
        const alertMsg = action === "confirm" ? "Deposit approved successfully!" : "Deposit rejected.";
        await answerCallbackQuery(token, queryId, alertMsg);

        const statusLabel = action === "confirm" ? "✅ APPROVED & CREDITED" : "❌ REJECTED";
        await updateTelegramMessage(token, chat_id, message_id, originalText, statusLabel);
      }

      console.log(`[TelegramWebhook] Successfully completed ${action} for ${depositId}`);
    } catch (dbErr: any) {
      console.error("[TelegramWebhook] Database transaction error:", dbErr);
      if (token) {
        await answerCallbackQuery(token, queryId, `Error: ${dbErr.message || "Failed to process."}`);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[TelegramWebhook] Webhook router crash:", err);
    // Always return 200 to Telegram to prevent retry loops
    return NextResponse.json({ ok: true, error: err.message });
  }
}
