import { supabaseAdmin } from "./supabase";

/**
 * Atomically process a deposit confirmation (confirm/approve or reject).
 * Executes the ledger update securely on the server.
 */
export async function processDepositConfirmation(
  depositId: string,
  action: "confirm" | "reject",
  rejectionReason?: string
) {
  // 1. Fetch deposit record
  const { data: deposit, error: fetchError } = await supabaseAdmin
    .from("deposits")
    .select("*")
    .eq("id", depositId)
    .single();

  if (fetchError || !deposit) {
    throw new Error(`Deposit request ${depositId} not found.`);
  }

  if (deposit.status !== "pending_approval") {
    throw new Error(`Deposit ${depositId} is not pending approval. Current status: ${deposit.status}`);
  }

  const amount = parseFloat(deposit.amount);

  if (action === "confirm") {
    console.log(`[DepositService] Approving deposit ${depositId} of ₹${amount}...`);

    // A. Update deposit status to approved
    const { error: updateError } = await supabaseAdmin
      .from("deposits")
      .update({
        status: "approved",
        updated_at: new Date().toISOString(),
      })
      .eq("id", depositId);

    if (updateError) throw updateError;

    // B. Fetch the user's wallet
    const { data: wallet, error: walletError } = await supabaseAdmin
      .from("wallets")
      .select("id")
      .eq("user_id", deposit.user_id)
      .single();

    if (walletError || !wallet) {
      // Revert deposit status
      await supabaseAdmin.from("deposits").update({ status: "pending_approval" }).eq("id", depositId);
      throw new Error(`Wallet not found for user ${deposit.user_id}`);
    }

    // C. Write transaction to wallet ledger
    // This will trigger the PostgreSQL AFTER INSERT trigger and atomically credit the wallet balance.
    const { error: ledgerError } = await supabaseAdmin
      .from("wallet_transactions")
      .insert({
        wallet_id: wallet.id,
        type: "deposit",
        amount: amount,
        reference_id: depositId,
        reference_type: "deposits",
      });

    if (ledgerError) {
      console.error(`[DepositService] Ledger write failed, reverting deposit status:`, ledgerError);
      // Revert deposit status back to pending_approval
      await supabaseAdmin.from("deposits").update({ status: "pending_approval" }).eq("id", depositId);
      throw ledgerError;
    }

    console.log(`[DepositService] Deposit ${depositId} approved and ₹${amount} credited successfully.`);
    return { success: true, message: `Deposit verified. ₹${amount} credited.` };
  } else {
    // Reject deposit
    console.log(`[DepositService] Rejecting deposit ${depositId}...`);

    const { error: updateError } = await supabaseAdmin
      .from("deposits")
      .update({
        status: "rejected",
        rejection_reason: rejectionReason || "Failed verification (UTR details mismatch).",
        updated_at: new Date().toISOString(),
      })
      .eq("id", depositId);

    if (updateError) throw updateError;

    console.log(`[DepositService] Deposit ${depositId} has been rejected.`);
    return { success: true, message: "Deposit rejected." };
  }
}
