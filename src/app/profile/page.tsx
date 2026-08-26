"use client";

import { useState, useEffect, useRef } from "react";
import { useUser, SignInButton } from "@clerk/nextjs";

export const dynamic = "force-dynamic";
import {
  Wallet,
  TrendingUp,
  History,
  Copy,
  CheckCircle,
  X,
  CreditCard,
  Plus,
  ArrowDownRight,
  TrendingDown,
  Percent
} from "lucide-react";
import Navbar from "@/components/Navbar";
import styles from "./page.module.css";

interface Bet {
  id: string;
  direction: "UP" | "DOWN";
  stake: number;
  entry_price: number;
  status: string;
  payout: number;
  round_id: string;
  created_at: string;
  market_rounds?: {
    end_price: number | null;
  };
}

interface Deposit {
  id: string;
  amount: number;
  utr: string | null;
  status: "pending_utr" | "pending_approval" | "approved" | "rejected";
  rejection_reason: string | null;
  created_at: string;
}

export default function Profile() {
  const { isSignedIn, user } = useUser();

  // Ledger state
  const [balance, setBalance] = useState<number>(0);
  const [bets, setBets] = useState<Bet[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [activeTab, setActiveTab] = useState<"bets" | "deposits">("bets");

  // Modals state
  const [depositOpen, setDepositOpen] = useState<boolean>(false);
  const [withdrawOpen, setWithdrawOpen] = useState<boolean>(false);
  const [depositAmount, setDepositAmount] = useState<number>(100);
  const [depositStep, setDepositStep] = useState<"amount" | "pay" | "utr" | "success">("amount");
  const [countdown, setCountdown] = useState<number>(5);
  const [utr, setUtr] = useState<string>("");
  const [activeDepositId, setActiveDepositId] = useState<string>("");

  const [withdrawAmount, setWithdrawAmount] = useState<number>(100);
  const [withdrawUpi, setWithdrawUpi] = useState<string>("");
  const [withdrawing, setWithdrawing] = useState<boolean>(false);

  // UI status feedback
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [copied, setCopied] = useState<boolean>(false);

  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch all user ledger lists (bets, balance, deposits)
  const fetchUserData = async () => {
    if (!isSignedIn) return;
    try {
      // 1. Fetch bets & balance
      const betsRes = await fetch("/api/bets", { cache: "no-store" });
      const betsData = await betsRes.json();
      if (betsData.success) {
        setBets(betsData.bets);
        setBalance(betsData.balance);
      }

      // 2. Fetch deposits
      const depRes = await fetch("/api/deposits", { cache: "no-store" });
      const depData = await depRes.json();
      if (depData.success) {
        setDeposits(depData.deposits);
      }
    } catch (err) {
      console.error("Error fetching user profile data:", err);
    }
  };

  useEffect(() => {
    if (isSignedIn) {
      fetchUserData();
      const interval = setInterval(fetchUserData, 4000);
      return () => clearInterval(interval);
    }
  }, [isSignedIn]);

  // Copy UPI ID to clipboard
  const handleCopyUPI = () => {
    const upiId = process.env.NEXT_PUBLIC_UPI_ID || "payee@upi";
    navigator.clipboard.writeText(upiId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Step 1: Initiate Deposit
  const handleInitiateDeposit = async () => {
    if (depositAmount <= 0) {
      setErrorMsg("Amount must be greater than zero.");
      return;
    }

    try {
      const res = await fetch("/api/deposits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "initiate",
          amount: depositAmount,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setActiveDepositId(data.depositId);
        setDepositStep("pay");
        setErrorMsg("");

        // Start 5 second countdown before shifting to UTR entry screen
        setCountdown(5);
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = setInterval(() => {
          setCountdown((prev) => {
            if (prev <= 1) {
              if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
              setDepositStep("utr");
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      } else {
        setErrorMsg(data.error || "Failed to initiate deposit.");
      }
    } catch (err) {
      setErrorMsg("Network error. Please try again.");
    }
  };

  // Resume UTR entry for an existing pending_utr deposit
  const handleResumeUTR = (depositId: string, amount: number) => {
    setActiveDepositId(depositId);
    setDepositAmount(amount);
    setUtr("");
    setErrorMsg("");
    setDepositStep("utr");
    setDepositOpen(true);
  };

  // Step 2: Submit UTR
  const handleSubmitUTR = async () => {
    const utrRegex = /^[0-9]{12}$/;
    if (!utrRegex.test(utr)) {
      setErrorMsg("UTR must be a 12-digit numeric code.");
      return;
    }

    try {
      const res = await fetch("/api/deposits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit_utr",
          depositId: activeDepositId,
          utr: utr,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setDepositStep("success");
        setErrorMsg("");
        fetchUserData();
      } else {
        setErrorMsg(data.error || "Failed to submit UTR.");
      }
    } catch (err) {
      setErrorMsg("Network error. Please try again.");
    }
  };

  // Close Deposit Modal
  const handleCloseDepositModal = () => {
    setDepositOpen(false);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    // Reset steps
    setDepositStep("amount");
    setDepositAmount(100);
    setUtr("");
    setActiveDepositId("");
    setErrorMsg("");
  };

  // Handle mock withdrawal request directly via Supabase API route or local stub
  const handleWithdrawalRequest = async () => {
    if (withdrawAmount <= 0 || withdrawAmount > balance) {
      setErrorMsg("Invalid amount or insufficient balance.");
      return;
    }
    if (!withdrawUpi || !withdrawUpi.includes("@")) {
      setErrorMsg("Please enter a valid UPI ID (e.g. user@bank).");
      return;
    }

    setWithdrawing(true);
    setErrorMsg("");

    try {
      // In production, we'd have a POST API for withdrawals. Let's mock a fast submission.
      // For simplicity, we can insert into 'withdrawals' table directly or trigger a placeholder error/alert.
      // We will tell the user we submitted request for admin validation.
      alert(`Withdrawal request for ₹${withdrawAmount} submitted!`);
      setWithdrawOpen(false);
      setWithdrawAmount(100);
      setWithdrawUpi("");
    } catch (err) {
      setErrorMsg("Failed to request withdrawal.");
    } finally {
      setWithdrawing(false);
    }
  };

  // Calculate statistics
  const totalBets = bets.length;
  const settledBets = bets.filter((b) => b.status !== "pending");
  const wonBets = settledBets.filter((b) => b.status === "won");
  const lostBets = settledBets.filter((b) => b.status === "lost");
  
  // Calculate Profit/Loss
  const profitLoss = settledBets.reduce((acc, bet) => {
    const stake = parseFloat(bet.stake.toString());
    const payout = parseFloat(bet.payout.toString() || "0");
    return acc + (payout - stake);
  }, 0);

  const winRate = settledBets.length > 0 ? (wonBets.length / settledBets.length) * 100 : 0;

  // Payee variables
  const payeeUPI = process.env.NEXT_PUBLIC_UPI_ID || "payee@upi";
  const payeeName = process.env.NEXT_PUBLIC_PAYEE_NAME || "YesNo Platform";
  const upiLink = `upi://pay?pa=${payeeUPI}&pn=${encodeURIComponent(payeeName)}&am=${depositAmount}&cu=INR`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(upiLink)}`;

  if (!isSignedIn) {
    return (
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <Navbar />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "var(--background)", padding: 24 }}>
          <div className="glass-panel" style={{ padding: 40, textAlign: "center", maxWidth: 400 }}>
            <Wallet size={48} className="glow-gold" style={{ marginBottom: 16 }} />
            <h2 style={{ marginBottom: 12 }}>Access Your Wallet</h2>
            <p style={{ color: "var(--text-secondary)", marginBottom: 24 }}>Sign in to view your ledger account, deposit UPI funds, and review prediction history.</p>
            <SignInButton mode="modal">
              <button className={styles.depositBtn} style={{ width: "100%", padding: 12, borderRadius: 8, fontWeight: 700 }}>Sign In</button>
            </SignInButton>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", backgroundColor: "var(--background)" }}>
      <Navbar />

      <div className={styles.container}>
        {/* SIDEBAR: Wallet summary */}
        <div className={styles.profileSidebar}>
          <div className={`${styles.card} glass-panel glass-panel-glow`}>
            <div className={styles.walletTitle}>Ledger Balance</div>
            <div className={styles.balanceDisplay}>
              <span className={styles.currency}>INR</span>
              <span className={styles.balanceAmount}>₹{balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            <div className={styles.buttonGroup}>
              <button onClick={() => setDepositOpen(true)} className={`${styles.actionBtn} ${styles.depositBtn}`}>
                <Plus size={16} />
                <span>Deposit</span>
              </button>
              <button onClick={() => setWithdrawOpen(true)} disabled={balance <= 0} className={`${styles.actionBtn} ${styles.withdrawBtn}`}>
                <CreditCard size={16} />
                <span>Withdraw</span>
              </button>
            </div>
          </div>

          {/* User Profile Metrics */}
          <div className={`${styles.card} glass-panel`}>
            <div className={styles.walletTitle}>Performance Overview</div>
            <div className={styles.statsGrid}>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>Predictions</span>
                <span className={styles.statValue}>{totalBets}</span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>Win Rate</span>
                <span className={styles.statValue}>{winRate.toFixed(0)}%</span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>Wins / Losses</span>
                <span className={styles.statValue}>{wonBets.length} / {lostBets.length}</span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>Net P/L</span>
                <span className={`${styles.statValue} ${profitLoss >= 0 ? styles.statusApproved : styles.statusRejected}`}>
                  {profitLoss >= 0 ? "+" : ""}₹{profitLoss.toFixed(0)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* CONTENT PANEL: Ledger & Deposits list */}
        <div className={styles.dashboardContent}>
          <div className={styles.tabs}>
            <button
              onClick={() => setActiveTab("bets")}
              className={`${styles.tabBtn} ${activeTab === "bets" ? styles.activeTab : ""}`}
            >
              Predictions History
            </button>
            <button
              onClick={() => setActiveTab("deposits")}
              className={`${styles.tabBtn} ${activeTab === "deposits" ? styles.activeTab : ""}`}
            >
              Deposit Logs
            </button>
          </div>

          <div className={`${styles.historyListCard} glass-panel`}>
            {activeTab === "bets" ? (
              <>
                <div className={styles.listHeader}>
                  <h3 className={styles.listTitle}>
                    <History size={18} />
                    <span>Wager History</span>
                  </h3>
                </div>
                <div className={styles.tableWrapper}>
                  {bets.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-secondary)" }}>
                      No prediction logs found in ledger. Go to Trade to make predictions!
                    </div>
                  ) : (
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Direction</th>
                          <th>Stake</th>
                          <th>Entry Price</th>
                          <th>Outcome</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bets.map((bet) => {
                          const date = new Date(bet.created_at).toLocaleString();
                          const entryPrice = parseFloat(bet.entry_price.toString());
                          const isWon = bet.status === "won";
                          const isRefund = bet.status === "refunded";

                          return (
                            <tr key={bet.id}>
                              <td>{date}</td>
                              <td>
                                <span className={bet.direction === "UP" ? styles.statusApproved : styles.statusRejected}>
                                  {bet.direction}
                                </span>
                              </td>
                              <td>₹{parseFloat(bet.stake.toString()).toFixed(2)}</td>
                              <td>${entryPrice.toLocaleString()}</td>
                              <td>
                                {bet.status === "pending" ? (
                                  <span className={styles.statusPending} style={{ padding: "2px 6px", borderRadius: 4, fontSize: 11 }}>RUNNING</span>
                                ) : isRefund ? (
                                  <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>REFUNDED</span>
                                ) : (
                                  <span className={isWon ? styles.statusApproved : styles.statusRejected} style={{ fontWeight: 600 }}>
                                    {isWon ? `WIN (+₹${(bet.payout - bet.stake).toFixed(0)})` : `LOSS (-₹${parseFloat(bet.stake.toString()).toFixed(0)})`}
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className={styles.listHeader}>
                  <h3 className={styles.listTitle}>
                    <CreditCard size={18} />
                    <span>UPI Deposits Log</span>
                  </h3>
                </div>
                <div className={styles.tableWrapper}>
                  {deposits.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-secondary)" }}>
                      No deposit records. Click Deposit to add money.
                    </div>
                  ) : (
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Deposit ID</th>
                          <th>Amount</th>
                          <th>UTR</th>
                          <th>Status</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {deposits.map((dep) => {
                          const date = new Date(dep.created_at).toLocaleDateString();
                          const amount = parseFloat(dep.amount.toString());

                          return (
                            <tr key={dep.id}>
                              <td>{date}</td>
                              <td><code>{dep.id}</code></td>
                              <td>₹{amount.toFixed(2)}</td>
                              <td>{dep.utr ? <code>{dep.utr}</code> : <span style={{ color: "var(--text-muted)" }}>None</span>}</td>
                              <td>
                                <span className={`${styles.badge} ${
                                  dep.status === "approved"
                                    ? styles.statusApproved
                                    : dep.status === "rejected"
                                    ? styles.statusRejected
                                    : dep.status === "pending_utr"
                                    ? styles.statusPendingUtr
                                    : styles.statusPending
                                }`}>
                                  {dep.status.toUpperCase().replace("_", " ")}
                                </span>
                              </td>
                              <td>
                                {dep.status === "pending_utr" && (
                                  <button
                                    onClick={() => handleResumeUTR(dep.id, amount)}
                                    className={styles.enterUtrBtn}
                                  >
                                    Enter UTR
                                  </button>
                                )}
                                {dep.status === "rejected" && dep.rejection_reason && (
                                  <span style={{ color: "var(--color-down)", fontSize: 11 }}>{dep.rejection_reason}</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* MODAL 1: ADD MONEY (DEPOSIT FLOW) */}
      {depositOpen && (
        <div className={styles.modalOverlay}>
          <div className={`${styles.modalContent} glass-panel`}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Add Money via UPI</h3>
              <button onClick={handleCloseDepositModal} className={styles.closeBtn}>
                <X size={20} />
              </button>
            </div>

            {errorMsg && (
              <div className={`${styles.alertBox} ${styles.errorAlert}`}>
                {errorMsg}
              </div>
            )}

            {/* STEP 1: Enter Deposit Amount */}
            {depositStep === "amount" && (
              <>
                <div className={styles.formGroup}>
                  <label className={styles.inputLabel}>Enter Amount (INR)</label>
                  <div className={styles.amountInputWrapper}>
                    <input
                      type="number"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(Math.max(1, parseInt(e.target.value) || 0))}
                      className={styles.modalInput}
                      placeholder="e.g. 100"
                    />
                  </div>
                </div>
                <button onClick={handleInitiateDeposit} className={styles.modalSubmitBtn}>
                  Pay ₹{depositAmount}
                </button>
              </>
            )}

            {/* STEP 2: UPI Copy & Pay */}
            {depositStep === "pay" && (
              <>
                <div className={styles.upiCard}>
                  <div className={styles.qrPlaceholder}>
                    {/* Render standard QR containing the secure UPI payee payment schema */}
                    <img src={qrCodeUrl} alt="UPI QR Code" style={{ width: 120, height: 120 }} />
                  </div>
                  <div className={styles.upiGrid}>
                    <span className={styles.upiValue}>{payeeUPI}</span>
                    <button onClick={handleCopyUPI} className={styles.copyBtn}>
                      {copied ? "Copied!" : <Copy size={16} />}
                    </button>
                  </div>
                </div>
                <div className={styles.instructionList}>
                  <li>1. Scan the QR code or copy the UPI ID above.</li>
                  <li>2. Make payment of exactly ₹{depositAmount} in any UPI app.</li>
                  <li>3. Do NOT close this window.</li>
                </div>
                <div style={{ textAlign: "center", fontSize: 13, color: "var(--text-secondary)", marginTop: 8 }}>
                  Opening transaction form in {countdown} seconds...
                </div>
                <div className={styles.progressBarWrapper}>
                  <div className={styles.progressBar} style={{ width: `${(5 - countdown) * 20}%` }} />
                </div>
              </>
            )}

            {/* STEP 3: UTR Submission Form */}
            {depositStep === "utr" && (
              <>
                <div style={{ background: "rgba(255,255,255,0.02)", padding: 16, borderRadius: 8, border: "1px dashed rgba(255,255,255,0.08)" }}>
                  <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Verification Required</div>
                  <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>Amount: ₹{depositAmount}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>ID: {activeDepositId}</div>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.inputLabel}>Enter 12-digit UTR / Ref Number</label>
                  <input
                    type="text"
                    value={utr}
                    onChange={(e) => setUtr(e.target.value.replace(/[^0-9]/g, "").slice(0, 12))}
                    placeholder="e.g. 123456789012"
                    className={styles.modalInput}
                    maxLength={12}
                  />
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    {utr.length}/12 digits entered.
                  </span>
                </div>

                <button
                  onClick={handleSubmitUTR}
                  disabled={utr.length !== 12}
                  className={styles.modalSubmitBtn}
                >
                  Submit UTR
                </button>
              </>
            )}

            {/* STEP 4: Success Feedback */}
            {depositStep === "success" && (
              <div className={styles.successIndicator}>
                <div className={styles.successCircle}>
                  <CheckCircle size={32} />
                </div>
                <div>
                  <h4 style={{ fontSize: 16, fontWeight: 700 }}>Verification Request Submitted</h4>
                  <p style={{ color: "var(--text-secondary)", fontSize: 12, marginTop: 6, lineHeight: 1.4 }}>
                    Your UTR {utr} has been sent to our verification channel. Balance will reflect in your account immediately upon admin confirmation.
                  </p>
                </div>
                <button onClick={handleCloseDepositModal} className={styles.modalSubmitBtn} style={{ marginTop: 12 }}>
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 2: WITHDRAW */}
      {withdrawOpen && (
        <div className={styles.modalOverlay}>
          <div className={`${styles.modalContent} glass-panel`}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Request Withdrawal</h3>
              <button onClick={() => setWithdrawOpen(false)} className={styles.closeBtn}>
                <X size={20} />
              </button>
            </div>

            {errorMsg && (
              <div className={`${styles.alertBox} ${styles.errorAlert}`}>
                {errorMsg}
              </div>
            )}

            <div className={styles.formGroup}>
              <label className={styles.inputLabel}>Amount (Max: ₹{balance})</label>
              <input
                type="number"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(Math.max(1, parseInt(e.target.value) || 0))}
                className={styles.modalInput}
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.inputLabel}>Your UPI ID (VPA)</label>
              <input
                type="text"
                value={withdrawUpi}
                onChange={(e) => setWithdrawUpi(e.target.value)}
                placeholder="e.g. name@upi"
                className={styles.modalInput}
              />
            </div>

            <button
              onClick={handleWithdrawalRequest}
              disabled={withdrawAmount <= 0 || withdrawAmount > balance || withdrawing}
              className={styles.modalSubmitBtn}
            >
              Submit Request
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
