"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { SignInButton, useUser } from "@clerk/nextjs";
import { TrendingUp, Clock, History, AlertCircle, Award } from "lucide-react";
import Navbar from "@/components/Navbar";
import BTCChart from "@/components/BTCChart";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

interface Round {
  id: string;
  market: string;
  start_time: string;
  end_time: string;
  status: string;
  start_price: number | null;
  end_price: number | null;
}

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
    start_time: string;
    end_time: string;
    status: string;
    end_price: number | null;
  };
}

export default function Home() {
  const { isSignedIn } = useUser();

  // Price & Market states
  const [livePrice, setLivePrice] = useState<number>(0);
  const prevPriceRef = useRef<number>(0);
  const [priceDirection, setPriceDirection] = useState<"up" | "down" | "flat">("flat");
  const [timeframe, setTimeframe] = useState<string>("1m");

  // Round states
  const [activeRound, setActiveRound] = useState<Round | null>(null);
  const [roundHistory, setRoundHistory] = useState<Round[]>([]);
  const [timeLeft, setTimeLeft] = useState<number>(60);
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const serverTimeOffsetRef = useRef<number>(0);

  // User states
  const [balance, setBalance] = useState<number>(0);
  const [bets, setBets] = useState<Bet[]>([]);
  const [wager, setWager] = useState<number>(100);

  // UI feedback states
  const [placingBet, setPlacingBet] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [successMsg, setSuccessMsg] = useState<string>("");

  // Track live price updates from WebSocket in chart
  const handlePriceUpdate = useCallback((price: number) => {
    setLivePrice((prev) => {
      prevPriceRef.current = prev;
      if (price > prev) setPriceDirection("up");
      else if (price < prev) setPriceDirection("down");
      return price;
    });
  }, []);

  // Fetch Rounds API (lazy settlements and round sync)
  const fetchRounds = async () => {
    try {
      const res = await fetch("/api/rounds", { cache: "no-store" });
      const data = await res.json();
      if (data.success) {
        if (data.price && livePrice === 0) {
          setLivePrice(data.price);
        }
        setActiveRound(data.activeRound);
        setRoundHistory(data.history);

        // Calculate skew/offset between server time and client clock
        const serverTime = new Date(data.serverTime).getTime();
        const localTime = Date.now();
        serverTimeOffsetRef.current = serverTime - localTime;
      }
    } catch (err) {
      console.error("Error fetching rounds:", err);
    }
  };

  // Fetch User Bets & Balance
  const fetchUserBets = async () => {
    if (!isSignedIn) return;
    try {
      const res = await fetch("/api/bets", { cache: "no-store" });
      const data = await res.json();
      if (data.success) {
        setBets(data.bets);
        setBalance(data.balance);
      }
    } catch (err) {
      console.error("Error fetching user data:", err);
    }
  };

  // Periodically synchronize rounds and bets
  useEffect(() => {
    fetchRounds();
    const interval = setInterval(fetchRounds, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (isSignedIn) {
      fetchUserBets();
      const interval = setInterval(fetchUserBets, 3000);
      return () => clearInterval(interval);
    } else {
      setBets([]);
      setBalance(0);
    }
  }, [isSignedIn]);

  // Timer Countdown loop (synchronized with server time)
  useEffect(() => {
    if (!activeRound) return;

    const timer = setInterval(() => {
      const serverNow = Date.now() + serverTimeOffsetRef.current;
      const endTime = new Date(activeRound.end_time).getTime();
      const diff = Math.max(0, Math.floor((endTime - serverNow) / 1000));

      setTimeLeft(diff);
      // Lock round when less than or equal to 15 seconds remain
      setIsLocked(diff <= 15);

      if (diff === 0) {
        // Trigger immediate fetch to capture round transition
        fetchRounds();
        fetchUserBets();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [activeRound]);

  // Bet placement handler
  const handlePlaceBet = async (direction: "UP" | "DOWN") => {
    if (!isSignedIn) return;
    if (isLocked) {
      setErrorMsg("Round is locked. Please wait for the next round.");
      return;
    }
    if (wager <= 0 || wager > balance) {
      setErrorMsg("Invalid wager amount or insufficient balance.");
      return;
    }

    setPlacingBet(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const res = await fetch("/api/bets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roundId: activeRound?.id,
          direction,
          stake: wager,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setSuccessMsg(`Prediction placed successfully: ₹${wager} ${direction}`);
        fetchUserBets();
        // Clear message after 4s
        setTimeout(() => setSuccessMsg(""), 4000);
      } else {
        setErrorMsg(data.error || "Failed to place prediction.");
      }
    } catch (err) {
      setErrorMsg("Network error. Please try again.");
    } finally {
      setPlacingBet(false);
    }
  };

  // Format countdown clock: MM:SS
  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60).toString().padStart(2, "0");
    const s = (sec % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  // Helper to extract active predictions for the current round to draw line series overlays
  const activeBetsForChart = bets
    .filter((b) => b.status === "pending" && activeRound && Number(b.round_id) === Number(activeRound.id))
    .map((b) => ({
      id: b.id,
      direction: b.direction,
      stake: parseFloat(b.stake.toString()),
      entry_price: parseFloat(b.entry_price.toString()),
      status: b.status,
    }));

  const pendingBets = bets.filter((b) => b.status === "pending");
  const settledBets = bets.filter((b) => b.status !== "pending");

  return (
    <div className={styles.main}>
      <Navbar />

      <div className={styles.workspace}>
        {/* LEFT PANE: Charts & Analytics */}
        <div className={`${styles.chartCard} glass-panel`}>
          <div className={styles.chartHeader}>
            <div className={styles.chartTitleGroup}>
              <h2 className={styles.chartTitle}>BTC / USD Market</h2>
              <span className={styles.marketBadge}>1m cycle</span>
            </div>
            <div className={styles.livePriceBadge}>
              ${livePrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>

          {/* Timeframe Selector Bar */}
          <div className={styles.timeframeBar}>
            {["1m", "2m", "3m", "5m", "10m", "15m", "30m", "1h"].map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`${styles.timeframeBtn} ${timeframe === tf ? styles.timeframeActive : ""}`}
              >
                {tf}
              </button>
            ))}
          </div>

          <div className={styles.chartBody}>
            <BTCChart
              onPriceUpdate={handlePriceUpdate}
              activeBets={activeBetsForChart}
              roundStartPrice={activeRound ? parseFloat(activeRound.start_price?.toString() || "0") : null}
            />
          </div>
        </div>

        {/* RIGHT PANE: Trade Controls */}
        <div className={styles.panel}>
          <div className={`${styles.controlCard} glass-panel`}>
            {/* Live Ticker */}
            <div className={styles.priceDisplay}>
              <div className={styles.priceLabel}>Bitcoin Live Price</div>
              <div className={styles.priceValue}>
                ${livePrice.toFixed(2)}
              </div>
            </div>

            {/* Timer countdown */}
            <div className={styles.timerSection}>
              <div className={styles.timerLabel}>
                {isLocked ? "ROUND LOCKED" : "Will BTC go UP or DOWN?"}
              </div>
              <div className={styles.timerClock}>
                {formatTime(timeLeft)}
              </div>
              {isLocked ? (
                <div className={styles.lockedText}>Locked. Settle in {timeLeft}s</div>
              ) : (
                <div className={styles.activeText}>Accepting predictions</div>
              )}
            </div>

            {/* User Wallet Balance */}
            <div className={styles.balanceRow}>
              <span className={styles.balanceLabel}>Available Balance</span>
              <span className={styles.balanceValue}>₹{balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>

            {/* Alert boxes */}
            {errorMsg && (
              <div className={`${styles.alertBox} ${styles.errorAlert}`}>
                <AlertCircle size={15} style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />
                <span>{errorMsg}</span>
              </div>
            )}
            {successMsg && (
              <div className={`${styles.alertBox} ${styles.successAlert}`}>
                <Award size={15} style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />
                <span>{successMsg}</span>
              </div>
            )}

            {/* Bet Input Controls */}
            {isSignedIn ? (
              <>
                <div className={styles.wagerSection}>
                  <div className={styles.wagerInputWrapper}>
                    <span className={styles.currencyPrefix}>₹</span>
                    <input
                      type="number"
                      value={wager}
                      onChange={(e) => setWager(Math.max(1, parseInt(e.target.value) || 0))}
                      className={styles.wagerInput}
                      disabled={isLocked || placingBet}
                    />
                  </div>
                  <div className={styles.quickWagerRow}>
                    {[50, 100, 250, 500, 1000].map((amt) => (
                      <button
                        key={amt}
                        onClick={() => setWager(amt)}
                        className={`${styles.quickWagerBtn} ${wager === amt ? styles.quickWagerActive : ""}`}
                        disabled={isLocked || placingBet}
                      >
                        ₹{amt}
                      </button>
                    ))}
                  </div>
                  <div className={styles.payoutNotice}>
                    Potential Win: <span className={styles.payoutHighlight}>+₹{(wager * 0.8).toFixed(2)}</span>
                  </div>
                </div>

                <div className={styles.actionButtons}>
                  <button
                    onClick={() => handlePlaceBet("UP")}
                    disabled={isLocked || placingBet || wager > balance}
                    className={`${styles.predictBtn} ${styles.btnUp}`}
                  >
                    <span>YES / UP</span>
                    <span className={styles.btnSubtext}>Price rises</span>
                  </button>
                  <button
                    onClick={() => handlePlaceBet("DOWN")}
                    disabled={isLocked || placingBet || wager > balance}
                    className={`${styles.predictBtn} ${styles.btnDown}`}
                  >
                    <span>NO / DOWN</span>
                    <span className={styles.btnSubtext}>Price drops</span>
                  </button>
                </div>
              </>
            ) : (
              <SignInButton mode="modal">
                <button className={styles.loginPromptBtn}>Sign In to Predict</button>
              </SignInButton>
            )}
          </div>
        </div>
      </div>

      {/* BOTTOM SECTION: Prediction History & Current Predictions */}
      <div className={styles.historySection}>
        {/* Active Predictions */}
        <div className={`${styles.historyCard} glass-panel`}>
          <h3 className={styles.historyTitle}>
            <Clock size={16} />
            <span>Active Predictions ({pendingBets.length})</span>
          </h3>
          <div className={styles.tableWrapper}>
            {pendingBets.length === 0 ? (
              <div className={styles.emptyState}>No active predictions. Choose UP or DOWN above!</div>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Direction</th>
                    <th>Stake</th>
                    <th>Entry Price</th>
                    <th>Live Price</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingBets.map((bet) => {
                    const entryPrice = parseFloat(bet.entry_price.toString());
                    const isUp = bet.direction === "UP";
                    const isWinning =
                      livePrice === entryPrice
                        ? null
                        : isUp
                        ? livePrice > entryPrice
                        : livePrice < entryPrice;

                    return (
                      <tr key={bet.id}>
                        <td>
                          <span className={isUp ? styles.directionUp : styles.directionDown}>
                            {isUp ? "UP" : "DOWN"}
                          </span>
                        </td>
                        <td>₹{parseFloat(bet.stake.toString()).toFixed(2)}</td>
                        <td>${entryPrice.toLocaleString()}</td>
                        <td>${livePrice.toLocaleString()}</td>
                        <td>
                          {isWinning === null ? (
                            <span className={styles.statusPending}>Pending</span>
                          ) : isWinning ? (
                            <span className={styles.statusWon}>Winning (+₹{(bet.stake * 0.8).toFixed(0)})</span>
                          ) : (
                            <span className={styles.statusLost}>Losing (-₹{parseFloat(bet.stake.toString()).toFixed(0)})</span>
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

        {/* Settled Predictions */}
        <div className={`${styles.historyCard} glass-panel`}>
          <h3 className={styles.historyTitle}>
            <History size={16} />
            <span>Settled Predictions ({settledBets.length})</span>
          </h3>
          <div className={styles.tableWrapper}>
            {settledBets.length === 0 ? (
              <div className={styles.emptyState}>No prediction history found.</div>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Direction</th>
                    <th>Stake</th>
                    <th>Entry Price</th>
                    <th>Settle Price</th>
                    <th>Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {settledBets.slice(0, 10).map((bet) => {
                    const entryPrice = parseFloat(bet.entry_price.toString());
                    const endPrice = bet.market_rounds?.end_price
                      ? parseFloat(bet.market_rounds.end_price.toString())
                      : entryPrice;
                    const isWon = bet.status === "won";
                    const isRefunded = bet.status === "refunded";

                    return (
                      <tr key={bet.id}>
                        <td>
                          <span className={bet.direction === "UP" ? styles.directionUp : styles.directionDown}>
                            {bet.direction}
                          </span>
                        </td>
                        <td>₹{parseFloat(bet.stake.toString()).toFixed(2)}</td>
                        <td>${entryPrice.toLocaleString()}</td>
                        <td>${endPrice.toLocaleString()}</td>
                        <td>
                          {isRefunded ? (
                            <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>REFUNDED</span>
                          ) : isWon ? (
                            <span className={styles.statusWon}>WIN (+₹{parseFloat(bet.payout.toString() || "0") - parseFloat(bet.stake.toString() || "0")})</span>
                          ) : (
                            <span className={styles.statusLost}>LOSS (-₹{parseFloat(bet.stake.toString()).toFixed(0)})</span>
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
    </div>
  );
}
