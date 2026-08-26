"use client";

import { useState, useEffect, useRef } from "react";
import { useUser, SignInButton } from "@clerk/nextjs";
import { Wallet, History, CreditCard, ArrowRight, Percent, Award, Flame, Check, X } from "lucide-react";
import Navbar from "@/components/Navbar";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

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

  // Dashboard balances & lists
  const [balance, setBalance] = useState<number>(1000); // Default local virtual balance
  const [bets, setBets] = useState<Bet[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);

  // Modal triggers
  const [depositOpen, setDepositOpen] = useState<boolean>(false);
  const [withdrawOpen, setWithdrawOpen] = useState<boolean>(false);
  
  // Deposit flow state
  const [depositAmount, setDepositAmount] = useState<number>(500);
  const [utr, setUtr] = useState<string>("");
  const [verifying, setVerifying] = useState<boolean>(false);

  // Withdraw flow state
  const [withdrawAmount, setWithdrawAmount] = useState<number>(500);
  const [withdrawUpi, setWithdrawUpi] = useState<string>("");
  const [withdrawing, setWithdrawing] = useState<boolean>(false);

  // Notifications
  const [toastMsg, setToastMsg] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");

  // Sync dashboard data
  const fetchUserData = async () => {
    if (!isSignedIn) return;
    try {
      const betsRes = await fetch("/api/bets", { cache: "no-store" });
      const betsData = await betsRes.json();
      if (betsData.success) {
        setBets(betsData.bets);
        setBalance(betsData.balance);
      }

      const depRes = await fetch("/api/deposits", { cache: "no-store" });
      const depData = await depRes.json();
      if (depData.success) {
        setDeposits(depData.deposits);
      }
    } catch (err) {
      console.error("Error fetching profile data:", err);
    }
  };

  useEffect(() => {
    if (isSignedIn) {
      fetchUserData();
      const interval = setInterval(fetchUserData, 4000);
      return () => clearInterval(interval);
    } else {
      // Clear real data and load mockup sets for guest view
      setBets([]);
      setDeposits([]);
      setBalance(1000);
    }
  }, [isSignedIn]);

  // Derived statistics metrics
  const totalPredictions = bets.length;
  const wonBets = bets.filter((b) => b.status === "won");
  const winRate = totalPredictions > 0 ? (wonBets.length / totalPredictions) * 100 : 0;
  
  // Total winnings profit
  const totalWinnings = bets.reduce((sum, b) => {
    if (b.status === "won") return sum + (parseFloat(b.payout.toString()) - parseFloat(b.stake.toString()));
    if (b.status === "lost") return sum - parseFloat(b.stake.toString());
    return sum;
  }, 0);

  // Current consecutive win streak calculation
  const calculateStreak = () => {
    let streak = 0;
    // Iterate from newest to oldest bets
    for (const bet of bets) {
      if (bet.status === "won") {
        streak++;
      } else if (bet.status === "lost") {
        break; // Streak broken
      }
    }
    return streak;
  };
  const currentStreak = calculateStreak();

  // Calculated deposits metrics
  const totalDeposited = isSignedIn
    ? deposits.filter((d) => d.status === "approved").reduce((sum, d) => sum + parseFloat(d.amount.toString()), 0)
    : 0;

  const totalWithdrawn = isSignedIn
    ? 0.00 // Static ledger withdraw mockup
    : 0.00;

  // Deposit verify simulation
  const handleVerifyDeposit = async () => {
    if (depositAmount <= 0) {
      setErrorMsg("Please enter a valid amount.");
      return;
    }
    
    setVerifying(true);
    setErrorMsg("");

    if (isSignedIn) {
      // Real database write
      try {
        const res = await fetch("/api/deposits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount: depositAmount }),
        });
        const data = await res.json();
        if (data.success) {
          // Provide UTR verification update
          const verifyRes = await fetch("/api/deposits", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              depositId: data.deposit.id,
              utr: utr || Math.random().toString().slice(2, 14), // Mock random UTR if blank
            }),
          });
          const verifyData = await verifyRes.json();
          if (verifyData.success) {
            // Simulate 2s loading state
            setTimeout(() => {
              setVerifying(false);
              setDepositOpen(false);
              setToastMsg(`✅ Deposit request submitted! ₹${depositAmount} pending administrator verification.`);
              fetchUserData();
              setTimeout(() => setToastMsg(""), 5000);
            }, 2000);
          } else {
            setErrorMsg("Failed to apply verification UTR reference.");
            setVerifying(false);
          }
        } else {
          setErrorMsg(data.error || "Failed to create deposit.");
          setVerifying(false);
        }
      } catch (err) {
        setErrorMsg("Network error. Please try again.");
        setVerifying(false);
      }
    } else {
      // Mock Local Simulation
      setTimeout(() => {
        setBalance((prev) => prev + depositAmount);
        setVerifying(false);
        setDepositOpen(false);
        setToastMsg(`✅ [DEMO PLAY] ₹${depositAmount} credited to virtual wallet balance.`);
        setTimeout(() => setToastMsg(""), 4000);
      }, 2000);
    }
  };

  // Withdraw simulation
  const handleWithdraw = () => {
    if (withdrawAmount <= 0 || withdrawAmount > balance) {
      setErrorMsg("Invalid withdrawal amount or insufficient balance.");
      return;
    }
    if (!withdrawUpi) {
      setErrorMsg("Please enter your UPI Address.");
      return;
    }

    setWithdrawing(true);
    setErrorMsg("");

    setTimeout(() => {
      setBalance((prev) => prev - withdrawAmount);
      setWithdrawing(false);
      setWithdrawOpen(false);
      setToastMsg(`✅ Withdrawal request of ₹${withdrawAmount} submitted successfully.`);
      setTimeout(() => setToastMsg(""), 4000);
    }, 2000);
  };

  // User details fallback
  const userInitials = user?.firstName 
    ? user.firstName.slice(0, 2).toUpperCase() 
    : user?.username 
    ? user.username.slice(0, 2).toUpperCase() 
    : "YN";
    
  const userName = user?.firstName ? `${user.firstName} ${user.lastName || ""}` : user?.username || "Guest Trader";
  const userHandle = user?.primaryEmailAddress?.emailAddress || "guest.mode@predictbtc.local";
  const userJoinDate = user?.createdAt 
    ? `Member since ${new Date(user.createdAt).toLocaleDateString(undefined, { month: "long", year: "numeric" })}` 
    : "Viewing in Guest Play mode";

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Navbar />

      <div className={styles.profileWrapper}>
        {/* HEADER ROW */}
        <div className={styles.profileHeader}>
          <div className={styles.profileInfoCol}>
            <div className={styles.avatarCircle}>{userInitials}</div>
            <div className={styles.profileNameGroup}>
              <h2 className={styles.userName}>{userName}</h2>
              <span className={styles.userHandle}>{userHandle}</span>
              <span className={styles.userJoinDate}>{userJoinDate}</span>
            </div>
          </div>
          <button className={styles.editProfileBtn}>Edit Profile</button>
        </div>

        {/* WALLET SUMMARY CARD */}
        <div className={styles.walletCard}>
          <div className={styles.statsRow3}>
            <div className={styles.statCol}>
              <span className={styles.statLabel}>Available Balance</span>
              <span className={styles.statVal}>₹{balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            
            <div className={styles.statCol}>
              <span className={styles.statLabel}>Total Deposited</span>
              <span className={styles.statVal}>₹{totalDeposited.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>

            <div className={styles.statCol}>
              <span className={styles.statLabel}>Total Withdrawn</span>
              <span className={styles.statVal}>₹{totalWithdrawn.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
          </div>

          <div className={styles.walletActions}>
            <button className={styles.solidBtn} onClick={() => setDepositOpen(true)}>
              <CreditCard size={16} />
              <span>Deposit Funds</span>
            </button>
            <button className={styles.outlineBtn} onClick={() => setWithdrawOpen(true)}>
              <Wallet size={16} />
              <span>Withdraw to Bank</span>
            </button>
          </div>
        </div>

        {/* 4-KPI PREDICTION STATS ROW */}
        <div className={styles.predictionStatsRow}>
          <div className={styles.smallStatCard}>
            <span className={styles.smallStatLabel}>Total Predictions</span>
            <span className={styles.smallStatVal}>{totalPredictions}</span>
          </div>

          <div className={styles.smallStatCard}>
            <span className={styles.smallStatLabel}>Win Rate %</span>
            <span className={styles.smallStatVal} style={{ color: "#10b981" }}>
              {winRate.toFixed(1)}%
            </span>
          </div>

          <div className={styles.smallStatCard}>
            <span className={styles.smallStatLabel}>Total Profit P/L</span>
            <span className={`${styles.smallStatVal} ${totalWinnings >= 0 ? styles.resultWon : styles.resultLost}`}>
              {totalWinnings >= 0 ? "+" : ""}₹{totalWinnings.toFixed(2)}
            </span>
          </div>

          <div className={styles.smallStatCard}>
            <span className={styles.smallStatLabel}>Current Streak</span>
            <span className={styles.smallStatVal} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span>{currentStreak}</span>
              {currentStreak > 0 && <Flame size={18} style={{ color: "#f59e0b", fill: "#f59e0b" }} />}
            </span>
          </div>
        </div>

        {/* RECENT ACTIVITY TABLE */}
        <div className={styles.activityCard}>
          <h3 className={styles.activityTitle}>
            <History size={16} />
            <span>Recent Activity / Prediction History</span>
          </h3>

          <div className={styles.tableWrapper}>
            {bets.length === 0 ? (
              <div className={styles.emptyState}>No activity found. Go to the trade page to start predictions!</div>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Market</th>
                    <th>Direction</th>
                    <th>Stake</th>
                    <th>Result</th>
                    <th>Net P/L</th>
                  </tr>
                </thead>
                <tbody>
                  {bets.map((bet) => {
                    const date = new Date(bet.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
                    const stake = parseFloat(bet.stake.toString());
                    const payout = parseFloat(bet.payout.toString() || "0");
                    const isWon = bet.status === "won";
                    const isRefund = bet.status === "refunded";
                    const isPending = bet.status === "pending";

                    return (
                      <tr key={bet.id}>
                        <td>{date}</td>
                        <td style={{ fontWeight: 600 }}>BTC / USD</td>
                        <td>
                          <span className={`${styles.directionBadge} ${bet.direction === "UP" ? styles.badgeUp : styles.badgeDown}`}>
                            {bet.direction}
                          </span>
                        </td>
                        <td>₹{stake.toFixed(2)}</td>
                        <td>
                          {isPending ? (
                            <span style={{ color: "#b45309", fontWeight: 600 }}>PENDING</span>
                          ) : isRefund ? (
                            <span className={styles.resultRefund}>REFUND</span>
                          ) : isWon ? (
                            <span className={styles.resultWon}>WIN</span>
                          ) : (
                            <span className={styles.resultLost}>LOSS</span>
                          )}
                        </td>
                        <td style={{ fontWeight: 700 }}>
                          {isPending ? (
                            <span>--</span>
                          ) : isRefund ? (
                            <span>₹0.00</span>
                          ) : isWon ? (
                            <span className={styles.resultWon}>+₹{(payout - stake).toFixed(2)}</span>
                          ) : (
                            <span className={styles.resultLost}>-₹{stake.toFixed(2)}</span>
                          )}
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

      {/* MOCK DEPOSIT MODAL */}
      {depositOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Deposit Funds</h3>
              <button className={styles.closeBtn} onClick={() => setDepositOpen(false)}>
                <X size={20} />
              </button>
            </div>

            {/* UPI QR Code mockup */}
            <div className={styles.qrContainer}>
              {/* Minimal Geometric SVG representing a QR Code */}
              <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="64" height="64" rx="8" fill="#e2e8f0" />
                <rect x="8" y="8" width="16" height="16" fill="#1e293b" />
                <rect x="12" y="12" width="8" height="8" fill="#e2e8f0" />
                <rect x="40" y="8" width="16" height="16" fill="#1e293b" />
                <rect x="44" y="12" width="8" height="8" fill="#e2e8f0" />
                <rect x="8" y="40" width="16" height="16" fill="#1e293b" />
                <rect x="12" y="44" width="8" height="8" fill="#e2e8f0" />
                <rect x="28" y="28" width="8" height="8" fill="#1e293b" />
                <rect x="44" y="44" width="12" height="12" fill="#1e293b" />
                <rect x="40" y="32" width="8" height="8" fill="#1e293b" />
                <rect x="32" y="48" width="8" height="8" fill="#1e293b" />
              </svg>
              <span className={styles.qrLabel}>Scan QR to Pay via UPI</span>
            </div>

            {errorMsg && (
              <div className={`${styles.alertBox} ${styles.errorAlert}`} style={{ padding: "8px 12px", fontSize: "12px" }}>
                <span>{errorMsg}</span>
              </div>
            )}

            <div className={styles.inputGroup}>
              <label className={styles.inputLabel}>Deposit Amount (INR)</label>
              <input
                type="number"
                value={depositAmount}
                onChange={(e) => setDepositAmount(Math.max(1, parseInt(e.target.value) || 0))}
                className={styles.textInput}
                disabled={verifying}
              />
            </div>

            <div className={styles.inputGroup}>
              <label className={styles.inputLabel}>UPI UTR / Reference ID</label>
              <input
                type="text"
                placeholder="Enter 12-digit transaction ID"
                value={utr}
                onChange={(e) => setUtr(e.target.value)}
                className={styles.textInput}
                disabled={verifying}
              />
            </div>

            <button className={styles.solidBtn} onClick={handleVerifyDeposit} disabled={verifying} style={{ width: "100%", justifyContent: "center" }}>
              {verifying ? (
                <>
                  <span className={styles.loaderSpinner}></span>
                  <span>Verifying Payment Ledger...</span>
                </>
              ) : (
                <span>I've Paid — Verify</span>
              )}
            </button>
          </div>
        </div>
      )}

      {/* MOCK WITHDRAW MODAL */}
      {withdrawOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Withdraw Funds</h3>
              <button className={styles.closeBtn} onClick={() => setWithdrawOpen(false)}>
                <X size={20} />
              </button>
            </div>

            {errorMsg && (
              <div className={`${styles.alertBox} ${styles.errorAlert}`} style={{ padding: "8px 12px", fontSize: "12px" }}>
                <span>{errorMsg}</span>
              </div>
            )}

            <div className={styles.inputGroup}>
              <label className={styles.inputLabel}>Withdraw Amount (INR)</label>
              <input
                type="number"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(Math.max(1, parseInt(e.target.value) || 0))}
                className={styles.textInput}
                disabled={withdrawing}
              />
            </div>

            <div className={styles.inputGroup}>
              <label className={styles.inputLabel}>Destination UPI ID</label>
              <input
                type="text"
                placeholder="username@upi"
                value={withdrawUpi}
                onChange={(e) => setWithdrawUpi(e.target.value)}
                className={styles.textInput}
                disabled={withdrawing}
              />
            </div>

            <button className={styles.solidBtn} onClick={handleWithdraw} disabled={withdrawing} style={{ width: "100%", justifyContent: "center" }}>
              {withdrawing ? (
                <>
                  <span className={styles.loaderSpinner}></span>
                  <span>Processing bank transfer...</span>
                </>
              ) : (
                <span>Confirm Withdrawal</span>
              )}
            </button>
          </div>
        </div>
      )}

      {/* FLOATING SUCCESS TOAST */}
      {toastMsg && (
        <div className={styles.toastNotification}>
          <Check size={16} style={{ color: "#10b981" }} />
          <span>{toastMsg}</span>
        </div>
      )}
    </div>
  );
}
