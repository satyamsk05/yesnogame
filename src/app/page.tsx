"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { SignInButton, SignUpButton, useUser } from "@clerk/nextjs";
import { TrendingUp, Clock, History, AlertCircle, Award, ArrowRight, Zap, Wallet, ChevronDown, MessageSquare, HelpCircle, Shield, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
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
  const { isLoaded, isSignedIn } = useUser();

  // Price & Market states
  const [livePrice, setLivePrice] = useState<number>(0);
  const prevPriceRef = useRef<number>(0);
  const [priceDirection, setPriceDirection] = useState<"up" | "down" | "flat">("flat");
  const [timeframe, setTimeframe] = useState<string>("1m");

  // FAQ Accordion open states
  const [faqOpen, setFaqOpen] = useState<{ [key: number]: boolean }>({});

  const toggleFaq = (index: number) => {
    setFaqOpen((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  // Round states
  const [roundHistory, setRoundHistory] = useState<Round[]>([]);
  const [timeLeft, setTimeLeft] = useState<number>(60);
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const serverTimeOffsetRef = useRef<number>(0);

  // User states
  const [balance, setBalance] = useState<number>(0);
  const [bets, setBets] = useState<Bet[]>([]);
  const [wager, setWager] = useState<number>(100);

  // Derive active round from user's oldest pending bet
  const activeBet = bets.find((b) => b.status === "pending");
  const activeRound = activeBet && activeBet.market_rounds
    ? {
        id: activeBet.round_id,
        market: "BTC/USD",
        start_time: activeBet.market_rounds.start_time,
        end_time: activeBet.market_rounds.end_time,
        status: activeBet.market_rounds.status,
        start_price: activeBet.entry_price,
        end_price: activeBet.market_rounds.end_price,
      }
    : null;

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
    if (!activeRound) {
      setTimeLeft(60);
      setIsLocked(false);
      return;
    }

    const timer = setInterval(() => {
      const serverNow = Date.now() + serverTimeOffsetRef.current;
      const endTime = new Date(activeRound.end_time).getTime();
      const diff = Math.max(0, Math.floor((endTime - serverNow) / 1000));

      setTimeLeft(diff);
      setIsLocked(true); // Lock further placements until the active prediction settles

      if (diff === 0) {
        fetchUserBets();
        fetchRounds();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [activeRound]);

  // Bet placement handler
  const handlePlaceBet = async (direction: "UP" | "DOWN") => {
    if (!isSignedIn) return;
    if (isLocked) {
      setErrorMsg("You already have an active prediction running.");
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
          direction,
          stake: wager,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setSuccessMsg(`Prediction placed successfully: ₹${wager} ${direction}`);
        fetchUserBets();
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

  // Stagger variants for list entrances
  const listContainerVariants: any = {
    hidden: {},
    show: {
      transition: {
        staggerChildren: 0.08,
      },
    },
  };

  const itemVariants: any = {
    hidden: { opacity: 0, y: 16 },
    show: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.5,
        ease: "easeOut",
      },
    },
  };

  // FAQs data list
  const faqs = [
    {
      q: "How are Bitcoin price feeds verified?",
      a: "All price feed updates stream in real-time from Binance's official WebSockets API. Our server-side settle engine matches trade prices against these atomic block triggers, guaranteeing absolute price transparency."
    },
    {
      q: "How long is each round and how are payouts processed?",
      a: "Each prediction round runs on a 1-minute cycle. Once the countdown expires, the settle engine immediately matches the end price against the start price. Winners are paid out an 80% net return, credited directly to their wallet balances in milliseconds."
    },
    {
      q: "Are my deposits and withdrawals secure?",
      a: "Yes. All deposits are backed by UPI reference numbers (UTR) checked manually by administrators. Our backend ledger tracks balance changes via double-entry accounting records, ensuring fund consistency."
    },
    {
      q: "Is there a Telegram integration?",
      a: "Yes! We run automated Telegram notifications for deposit status and payouts. You can link your account and receive messages on round updates and settlements in real-time."
    }
  ];

  // Render Marketing Landing Page for Unauthenticated users
  const renderLandingPage = () => {
    return (
      <div className={styles.landingWrapper}>
        <Navbar />
        
        {/* HERO SECTION */}
        <section className={styles.hero}>
          <motion.div 
            className={styles.badgeContainer}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          >
            <div className={styles.pillBadge}>
              <span className={styles.pillBadgeGreen}></span>
              <span>Live BTC Round Predictions</span>
            </div>
          </motion.div>
          
          <motion.h1 
            className={styles.headline}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
          >
            Predict the Next Move.
          </motion.h1>
          
          <motion.p 
            className={styles.subheadline}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2, ease: "easeOut" }}
          >
            Predict whether Bitcoin will move UP or DOWN. Choose your stake, watch the 1-minute market, and see the result.
          </motion.p>
          
          <motion.div 
            className={styles.ctaGroup}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3, ease: "easeOut" }}
          >
            <SignUpButton mode="modal">
              <motion.button 
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={`${styles.landingCta} ${styles.primaryCta}`}
              >
                <span>Start Predicting</span>
                <ArrowRight size={16} />
              </motion.button>
            </SignUpButton>
            
            <motion.a 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              href="#preview" 
              className={`${styles.landingCta} ${styles.secondaryCta}`}
            >
              Explore BTC Market
            </motion.a>
          </motion.div>
        </section>

        {/* INTERACTIVE PREVIEW WIDGET */}
        <motion.section 
          id="preview" 
          className={styles.previewWrapper}
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          <div className={styles.previewContainer}>
            <div className={styles.previewHeader}>
              <div className={styles.previewTitleGroup}>
                <h3 className={styles.previewTitle}>BTC / USD Market Preview</h3>
                <span className={styles.previewSubtitle}>Real-time WebSocket feed</span>
              </div>
              <div className={styles.previewPriceGroup}>
                <motion.div 
                  key={livePrice}
                  initial={{ scale: 0.97, opacity: 0.8 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.15 }}
                  className={styles.previewPrice}
                >
                  ${livePrice > 0 ? livePrice.toLocaleString(undefined, { minimumFractionDigits: 2 }) : "Live Ticker..."}
                </motion.div>
                <div className={styles.previewPriceLabel}>Bitcoin Price</div>
              </div>
            </div>

            {/* Live Chart Container */}
            <div style={{ height: 260, position: "relative", marginBottom: 12 }}>
              <BTCChart
                onPriceUpdate={handlePriceUpdate}
                activeBets={[]}
                roundStartPrice={activeRound ? parseFloat(activeRound.start_price?.toString() || "0") : null}
              />
            </div>

            {/* Control Playground */}
            <div className={styles.previewGrid}>
              <div className={styles.previewLeft}>
                <div className={styles.previewSelectorLabel}>Select Stake Amount (INR)</div>
                <div className={styles.previewStakes}>
                  {[50, 100, 250, 500].map((amt) => (
                    <button
                      key={amt}
                      onClick={() => setWager(amt)}
                      className={`${styles.previewStakeBtn} ${wager === amt ? styles.previewStakeBtnActive : ""}`}
                    >
                      ₹{amt}
                    </button>
                  ))}
                </div>
                
                <div className={styles.previewActions}>
                  <SignInButton mode="modal">
                    <motion.button 
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      className={styles.previewPredictBtn} 
                      style={{ backgroundColor: "var(--color-up)" }}
                    >
                      Predict UP (+80%)
                    </motion.button>
                  </SignInButton>
                  <SignInButton mode="modal">
                    <motion.button 
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      className={styles.previewPredictBtn} 
                      style={{ backgroundColor: "var(--color-down)" }}
                    >
                      Predict DOWN (+80%)
                    </motion.button>
                  </SignInButton>
                </div>
              </div>

              <div className={styles.previewRight}>
                <div className={styles.previewTimerRow}>
                  <span className={styles.previewSelectorLabel}>ROUND ENDS IN</span>
                  <motion.span 
                    key={timeLeft}
                    initial={{ scale: 0.9, opacity: 0.5 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className={styles.previewTimerVal}
                  >
                    {formatTime(timeLeft)}
                  </motion.span>
                </div>
                <div className={styles.previewResultNotice} style={{ backgroundColor: "rgba(16, 185, 129, 0.05)", border: "1px solid rgba(16, 185, 129, 0.1)", color: "var(--color-up)" }}>
                  Last Round Result: <strong>UP (Winner)</strong>
                </div>
              </div>
            </div>
          </div>
        </motion.section>

        {/* 6-FEATURES Grid */}
        <section id="features" className={styles.featuresBg}>
          <motion.div 
            className={styles.featuresContainer}
            variants={listContainerVariants}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-100px" }}
          >
            <motion.div className={styles.featCard} variants={itemVariants} whileHover={{ y: -4 }}>
              <div className={styles.featIconWrapper}>
                <TrendingUp size={20} />
              </div>
              <h4 className={styles.featTitle}>Live BTC Markets</h4>
              <p className={styles.featDesc}>
                Connect to raw data streams straight from Binance WebSockets. Zero delay, 100% price accuracy.
              </p>
            </motion.div>
            
            <motion.div className={styles.featCard} variants={itemVariants} whileHover={{ y: -4 }}>
              <div className={styles.featIconWrapper}>
                <Zap size={20} />
              </div>
              <h4 className={styles.featTitle}>Simple Predictions</h4>
              <p className={styles.featDesc}>
                No complicated order books or options sheets. Predict the next 1-minute price direction and win.
              </p>
            </motion.div>

            <motion.div className={styles.featCard} variants={itemVariants} whileHover={{ y: -4 }}>
              <div className={styles.featIconWrapper}>
                <Wallet size={20} />
              </div>
              <h4 className={styles.featTitle}>Secure INR Wallet</h4>
              <p className={styles.featDesc}>
                Deposit using instant UPI QR codes. Quick verification and fast bank withdrawals.
              </p>
            </motion.div>

            <motion.div className={styles.featCard} variants={itemVariants} whileHover={{ y: -4 }}>
              <div className={styles.featIconWrapper} style={{ color: "var(--color-up)" }}>
                <Check size={20} />
              </div>
              <h4 className={styles.featTitle}>Instant Payouts</h4>
              <p className={styles.featDesc}>
                Settle rounds atomically. Winners receive credit balances automatically inside 10ms of round end.
              </p>
            </motion.div>

            <motion.div className={styles.featCard} variants={itemVariants} whileHover={{ y: -4 }}>
              <div className={styles.featIconWrapper} style={{ color: "#38bdf8" }}>
                <MessageSquare size={20} />
              </div>
              <h4 className={styles.featTitle}>Telegram Webhook</h4>
              <p className={styles.featDesc}>
                Sync deposit verifications and receive payout confirmations directly via automated bot notifications.
              </p>
            </motion.div>

            <motion.div className={styles.featCard} variants={itemVariants} whileHover={{ y: -4 }}>
              <div className={styles.featIconWrapper} style={{ color: "var(--color-gold)" }}>
                <Shield size={20} />
              </div>
              <h4 className={styles.featTitle}>Ledger Integrity</h4>
              <p className={styles.featDesc}>
                Double-entry ledger accounting locks transactional data, preventing balance tampering or inconsistencies.
              </p>
            </motion.div>
          </motion.div>
        </section>

        {/* STATISTICS SECTION */}
        <section className={styles.statsBg}>
          <motion.div 
            className={styles.statsContainer}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            variants={listContainerVariants}
          >
            <motion.h3 className={styles.sectionTitle} variants={itemVariants}>
              Platform Health Statistics
            </motion.h3>
            
            <div className={styles.statsGrid}>
              <motion.div className={styles.statNumCard} variants={itemVariants} whileHover={{ y: -2 }}>
                <div className={styles.statNum}>1.4M+</div>
                <div className={styles.statNumLabel}>Total Bets</div>
              </motion.div>
              
              <motion.div className={styles.statNumCard} variants={itemVariants} whileHover={{ y: -2 }}>
                <div className={styles.statNum}>60s</div>
                <div className={styles.statNumLabel}>Round Time</div>
              </motion.div>

              <motion.div className={styles.statNumCard} variants={itemVariants} whileHover={{ y: -2 }}>
                <div className={styles.statNum}>99.98%</div>
                <div className={styles.statNumLabel}>Settle Success</div>
              </motion.div>

              <motion.div className={styles.statNumCard} variants={itemVariants} whileHover={{ y: -2 }}>
                <div className={styles.statNum}>14,500+</div>
                <div className={styles.statNumLabel}>Active Users</div>
              </motion.div>
            </div>
          </motion.div>
        </section>

        {/* TELEGRAM SPOTLIGHT SHOWCASE */}
        <section className={styles.telegramSectionBg}>
          <div className={styles.telegramContainer}>
            <motion.div 
              className={styles.telegramTextCol}
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <h3 className={styles.sectionTitle}>
                Telegram Webhook <span className={styles.telegramHighlight}>Callbacks</span>
              </h3>
              <p className={styles.telegramDesc}>
                Connect your account to our dedicated Telegram Bot to verify cash-ins and receive instant push notifications when a prediction settles.
              </p>
              <div className={styles.telegramList}>
                <div className={styles.telegramListItem}>
                  <Check size={18} className={styles.telegramListIcon} />
                  <span>Verify UPI deposits with UTR numbers instantly in chat.</span>
                </div>
                <div className={styles.telegramListItem}>
                  <Check size={18} className={styles.telegramListIcon} />
                  <span>Receive round lock alarms 15 seconds before closure.</span>
                </div>
                <div className={styles.telegramListItem}>
                  <Check size={18} className={styles.telegramListIcon} />
                  <span>Atomic win notifications showing net P/L credits.</span>
                </div>
              </div>
            </motion.div>

            <motion.div 
              className={styles.telegramMockCol}
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <div className={styles.telegramHeader}>
                <div className={styles.telegramAvatar}>YN</div>
                <div className={styles.telegramNameGroup}>
                  <span className={styles.telegramBotName}>YesNo Admin Bot</span>
                  <span className={styles.telegramBotStatus}>online</span>
                </div>
              </div>

              <div className={`${styles.telegramBubble} ${styles.telegramBubbleUser}`}>
                Verify deposit ₹500. UTR: 987654321098
              </div>

              <div className={styles.telegramBubble}>
                🤖 <strong>Deposit Verified!</strong><br />
                ₹500.00 has been credited to your wallet balance.<br /><br />
                New Wallet Balance: <strong>₹1,250.00</strong>
                <div className={styles.telegramInlineBtn}>
                  Predict UP / DOWN
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* HOW IT WORKS SECTION */}
        <section id="how-it-works" className={styles.howItWorksBg}>
          <div className={styles.howItWorksContainer}>
            <motion.h3 
              className={styles.sectionTitle}
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              How It Works
            </motion.h3>
            
            <motion.div 
              className={styles.stepsGrid}
              variants={listContainerVariants}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: "-100px" }}
            >
              <motion.div className={styles.stepCard} variants={itemVariants}>
                <div className={styles.stepNumber}>1</div>
                <h5 className={styles.stepTitle}>Choose Amount</h5>
                <p className={styles.stepDesc}>Decide how much you want to stake on the next 1-minute round.</p>
              </motion.div>

              <motion.div className={styles.stepCard} variants={itemVariants}>
                <div className={styles.stepNumber}>2</div>
                <h5 className={styles.stepTitle}>Select Direction</h5>
                <p className={styles.stepDesc}>Predict whether the round will settle UP or DOWN compared to the start price.</p>
              </motion.div>

              <motion.div className={styles.stepCard} variants={itemVariants}>
                <div className={styles.stepNumber}>3</div>
                <h5 className={styles.stepTitle}>Watch Round</h5>
                <p className={styles.stepDesc}>Wait for the 1-minute countdown clock to expire as live prices tick.</p>
              </motion.div>

              <motion.div className={styles.stepCard} variants={itemVariants}>
                <div className={styles.stepNumber}>4</div>
                <h5 className={styles.stepTitle}>Collect Payout</h5>
                <p className={styles.stepDesc}>Correct predictions win +80% profit credited immediately to your balance.</p>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* ACCORDION FAQ SECTION */}
        <section className={styles.faqBg}>
          <div className={styles.faqContainer}>
            <motion.h3 
              className={styles.sectionTitle}
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              Frequently Asked Questions
            </motion.h3>

            <motion.div 
              className={styles.faqList}
              variants={listContainerVariants}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true }}
            >
              {faqs.map((faq, index) => {
                const isOpen = faqOpen[index];
                return (
                  <motion.div 
                    key={index} 
                    className={styles.faqItem}
                    variants={itemVariants}
                  >
                    <button 
                      className={styles.faqQuestionBtn} 
                      onClick={() => toggleFaq(index)}
                    >
                      <span>{faq.q}</span>
                      <motion.div
                        animate={{ rotate: isOpen ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                        style={{ display: "inline-flex" }}
                      >
                        <ChevronDown size={18} />
                      </motion.div>
                    </button>
                    
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25, ease: "easeInOut" }}
                          className={styles.faqAnswer}
                        >
                          <div className={styles.faqAnswerText}>
                            {faq.a}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </motion.div>
          </div>
        </section>

        {/* RISK COMPLIANCE DISCLAIMER */}
        <section className={styles.disclaimerSection}>
          <motion.div 
            className={styles.disclaimerContainer}
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <AlertCircle size={20} style={{ color: "var(--color-down)", flexShrink: 0, marginTop: 2 }} />
            <div className={styles.disclaimerTextGroup}>
              <h5 className={styles.disclaimerTitle}>Risk Disclosure Statement</h5>
              <p className={styles.disclaimerDesc}>
                Prediction markets involve significant market volatility. Forecasting digital currency outcomes carries risk of capital loss. Predict responsibly and ensure you understand the terms before making deposits or staking balances.
              </p>
            </div>
          </motion.div>
        </section>

        {/* FINAL CONVERSION SECTION */}
        <section className={styles.bottomCtaBg}>
          <motion.div 
            className={styles.bottomCtaCard}
            initial={{ opacity: 0, scale: 0.98 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h3 className={styles.bottomTitle}>Ready to Forecast the Next Move?</h3>
            <p className={styles.bottomDesc}>
              Join thousands of predictors tracing real-time blockchain ticks. Choose your side, watch the clock, and settle balances instantly.
            </p>
            <SignUpButton mode="modal">
              <motion.button 
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className={`${styles.landingCta} ${styles.primaryCta}`}
                style={{ background: "#ffffff", color: "#111827", padding: "14px 28px" }}
              >
                <span>Register Account</span>
                <ArrowRight size={16} />
              </motion.button>
            </SignUpButton>
          </motion.div>
        </section>

        {/* MINIMAL FOOTER */}
        <footer className={styles.landingFooter}>
          <div className={styles.footerContainer}>
            <div className={styles.footerTop}>
              <div className={styles.footerLogoCol}>
                <div className={styles.footerLogo}>
                  <TrendingUp size={20} className={styles.logoIcon} style={{ marginRight: 6 }} />
                  <span>YesNo</span>
                </div>
                <p className={styles.footerLogoDesc}>
                  A clean, high-performance prediction market platform. Experience the thrill of 1-minute forecasting.
                </p>
              </div>

              <div className={styles.footerLinksRow}>
                <div className={styles.footerCol}>
                  <span className={styles.footerColTitle}>Platform</span>
                  <a href="#preview" className={styles.footerLink}>Markets</a>
                  <SignInButton mode="modal">
                    <button className={styles.footerLink} style={{ textAlign: "left" }}>Predict</button>
                  </SignInButton>
                  <a href="#how-it-works" className={styles.footerLink}>How It Works</a>
                </div>

                <div className={styles.footerCol}>
                  <span className={styles.footerColTitle}>Legal</span>
                  <span className={styles.footerLink} style={{ cursor: "pointer" }}>Terms of Service</span>
                  <span className={styles.footerLink} style={{ cursor: "pointer" }}>Privacy Policy</span>
                </div>
              </div>
            </div>

            <div className={styles.footerBottom}>
              <span>© {new Date().getFullYear()} YesNo Inc. All rights reserved.</span>
              <span>Inspired by clean SaaS design principles.</span>
            </div>
          </div>
        </footer>
      </div>
    );
  };

  // Render simple loader during session fetch
  if (!isLoaded) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", backgroundColor: "var(--background)" }}>
        <div style={{ width: 40, height: 40, border: "3px solid #e5e7eb", borderTopColor: "#2563eb", borderRadius: "50%", animation: "spin 1s linear infinite" }}></div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Route: Logged-out Landing page vs Logged-in Platform dashboard
  if (!isSignedIn) {
    return renderLandingPage();
  }

  // Active predictions list mapping
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
