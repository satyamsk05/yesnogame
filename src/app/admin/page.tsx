"use client";

import { useState, useEffect } from "react";
import { MessageSquare, Check, X, ShieldAlert, AlertCircle, RefreshCw } from "lucide-react";
import Navbar from "@/components/Navbar";
import styles from "./page.module.css";

interface Deposit {
  id: string;
  amount: number;
  utr: string | null;
  status: "pending_utr" | "pending_approval" | "approved" | "rejected";
  rejection_reason: string | null;
  created_at: string;
  profiles?: {
    email: string;
    username: string;
  };
}

export default function Admin() {
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [successMsg, setSuccessMsg] = useState<string>("");

  // Fetch all deposits (for mock admin console monitoring)
  const fetchDeposits = async () => {
    try {
      const res = await fetch("/api/admin/simulate-telegram", { cache: "no-store" });
      const data = await res.json();
      if (data.success) {
        setDeposits(data.deposits);
      }
    } catch (err) {
      console.error("Error loading admin deposits:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeposits();
    // Poll every 3 seconds
    const interval = setInterval(fetchDeposits, 3000);
    return () => clearInterval(interval);
  }, []);

  // Process deposit simulate actions
  const handleSimulateAction = async (depositId: string, action: "confirm" | "reject") => {
    setActionLoading(depositId);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const res = await fetch("/api/admin/simulate-telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          depositId,
          action,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setSuccessMsg(data.message || `Deposit ${depositId} processed successfully.`);
        fetchDeposits();
      } else {
        setErrorMsg(data.error || "Failed to process transaction.");
      }
    } catch (err) {
      setErrorMsg("Network error. Failed to hit backend simulation API.");
    } finally {
      setActionLoading(null);
    }
  };

  // Filter out pending approvals to render Telegram messages
  const pendingApprovals = deposits.filter((d) => d.status === "pending_approval");
  const processedDeposits = deposits.filter((d) => d.status !== "pending_approval" && d.status !== "pending_utr");

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", backgroundColor: "var(--background)" }}>
      <Navbar />

      <div className={styles.container}>
        <div className={styles.titleSection}>
          <h2 className={styles.title}>Developer Test Console</h2>
          <p className={styles.subtitle}>
            This panel simulates your live <b>Telegram Admin Bot</b> activity. As soon as a user submits their 12-digit UTR on the Deposit page, it triggers a Telegram update. You can simulate confirming or rejecting it below to watch the <b>INR Wallet Ledger</b> react.
          </p>
        </div>

        {errorMsg && (
          <div className={`${styles.alert} ${styles.error}`}>
            <AlertCircle size={18} />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className={`${styles.alert} ${styles.success}`}>
            <Check size={18} />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Telegram Bot Feed Simulation */}
        <div className={styles.telegramSection}>
          <div className={styles.listHeader}>
            💬 Telegram Admin Bot Feed ({pendingApprovals.length} Pending)
          </div>

          {loading ? (
            <div style={{ textAlign: "center", padding: 24, color: "var(--text-secondary)" }}>
              <RefreshCw size={24} style={{ animation: "spin-slow 2s infinite" }} />
            </div>
          ) : pendingApprovals.length === 0 ? (
            <div className={styles.emptyState}>
              <MessageSquare size={36} style={{ color: "var(--text-muted)", marginBottom: 12 }} />
              <p>No pending Telegram notifications. Go to <b>Profile</b>, click <b>Deposit</b>, copy VPA details, and submit a 12-digit UTR to trigger notifications.</p>
            </div>
          ) : (
            pendingApprovals.map((dep) => {
              const username = dep.profiles?.username || dep.profiles?.email || "User";
              const dateText = new Date(dep.created_at).toLocaleTimeString();

              return (
                <div key={dep.id} className={styles.telegramMsgCard}>
                  <div className={styles.telegramHeader}>
                    <div className={styles.telegramIcon}>T</div>
                    <span>Telegram Admin Bot Notification</span>
                    <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--text-muted)" }}>{dateText}</span>
                  </div>

                  <div className={styles.telegramBody}>
                    <b>💰 New Deposit Request</b>{"\n\n"}
                    <b>User:</b> {username}{"\n"}
                    <b>Amount:</b> ₹{parseFloat(dep.amount.toString()).toFixed(2)}{"\n"}
                    <b>UTR:</b> <code className={styles.telegramCode}>{dep.utr}</code>{"\n"}
                    <b>Deposit ID:</b> <code className={styles.telegramCode}>{dep.id}</code>
                  </div>

                  <div className={styles.telegramButtons}>
                    <button
                      onClick={() => handleSimulateAction(dep.id, "confirm")}
                      disabled={actionLoading === dep.id}
                      className={`${styles.telegramBtn} ${styles.confirmBtn}`}
                    >
                      {actionLoading === dep.id ? "Processing..." : "✅ Confirm (Credit User)"}
                    </button>
                    <button
                      onClick={() => handleSimulateAction(dep.id, "reject")}
                      disabled={actionLoading === dep.id}
                      className={`${styles.telegramBtn} ${styles.rejectBtn}`}
                    >
                      ❌ Reject (Decline Fund)
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Processed Transactions History */}
        <div style={{ marginTop: 16 }}>
          <div className={styles.listHeader} style={{ marginBottom: 12 }}>
            🛡️ Processed Verification History ({processedDeposits.length})
          </div>

          <div className="glass-panel" style={{ overflow: "hidden" }}>
            {processedDeposits.length === 0 ? (
              <div style={{ textAlign: "center", padding: 24, color: "var(--text-secondary)", fontSize: 13 }}>
                No processed logs found.
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, textAlign: "left" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                    <th style={{ padding: 12, color: "var(--text-secondary)" }}>ID</th>
                    <th style={{ padding: 12, color: "var(--text-secondary)" }}>User</th>
                    <th style={{ padding: 12, color: "var(--text-secondary)" }}>Amount</th>
                    <th style={{ padding: 12, color: "var(--text-secondary)" }}>UTR</th>
                    <th style={{ padding: 12, color: "var(--text-secondary)" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {processedDeposits.map((dep) => {
                    const isApproved = dep.status === "approved";
                    return (
                      <tr key={dep.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.02)" }}>
                        <td style={{ padding: 12 }}><code>{dep.id}</code></td>
                        <td style={{ padding: 12 }}>{dep.profiles?.username || dep.profiles?.email}</td>
                        <td style={{ padding: 12 }}>₹{parseFloat(dep.amount.toString()).toFixed(2)}</td>
                        <td style={{ padding: 12 }}><code>{dep.utr}</code></td>
                        <td style={{ padding: 12, fontWeight: 700, color: isApproved ? "var(--color-up)" : "var(--color-down)" }}>
                          {dep.status.toUpperCase()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
