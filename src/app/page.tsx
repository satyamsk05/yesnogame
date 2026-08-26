"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { SignUpButton } from "@clerk/nextjs";
import { TrendingUp, Zap, Wallet, Check, MessageSquare, Shield, ChevronDown, ChevronRight, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Navbar from "@/components/Navbar";
import BTCChart from "@/components/BTCChart";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

// Dotted count-up component that triggers on scroll view
function CountUp({ end, duration = 1.5, suffix = "" }: { end: number; duration?: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true;
          let startTimestamp: number | null = null;
          const step = (timestamp: number) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / (duration * 1000), 1);
            setCount(Math.floor(progress * end));
            if (progress < 1) {
              window.requestAnimationFrame(step);
            }
          };
          window.requestAnimationFrame(step);
        }
      },
      { threshold: 0.1 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [end, duration]);

  return <span ref={ref}>{count.toLocaleString()}{suffix}</span>;
}

export default function Home() {
  const [livePrice, setLivePrice] = useState<number>(0);
  const [priceDirection, setPriceDirection] = useState<"up" | "down" | "flat">("flat");
  const [faqOpen, setFaqOpen] = useState<{ [key: number]: boolean }>({});

  // Connect directly to Binance WebSocket for live hero price ticking
  useEffect(() => {
    const ws = new WebSocket("wss://stream.binance.com:9443/ws/btcusdt@ticker");
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      const price = parseFloat(data.c);
      setLivePrice((prev) => {
        if (price > prev) setPriceDirection("up");
        else if (price < prev) setPriceDirection("down");
        return price;
      });
    };
    return () => ws.close();
  }, []);

  const toggleFaq = (index: number) => {
    setFaqOpen((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const listContainerVariants: any = {
    hidden: {},
    show: {
      transition: { staggerChildren: 0.08 }
    }
  };

  const itemVariants: any = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } }
  };

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
          Predict the Next <span style={{ color: "#10b981" }}>Move</span>.
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
          <Link href="/trade">
            <motion.button 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={`${styles.landingCta} ${styles.primaryCta}`}
            >
              <span>Start Predicting</span>
              <ArrowRight size={16} className={styles.arrowIcon} />
            </motion.button>
          </Link>
          
          <a href="#preview">
            <motion.button 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={`${styles.landingCta} ${styles.secondaryCta}`}
            >
              Explore BTC Market
            </motion.button>
          </a>
        </motion.div>
      </section>

      {/* LIVE INTERACTIVE PREVIEW WIDGET */}
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
                className={`${styles.previewPrice} ${priceDirection === "up" ? styles.priceUpFlash : priceDirection === "down" ? styles.priceDownFlash : ""}`}
              >
                ${livePrice > 0 ? livePrice.toLocaleString(undefined, { minimumFractionDigits: 2 }) : "Ticking..."}
              </motion.div>
              <div className={styles.previewPriceLabel}>Bitcoin Price</div>
            </div>
          </div>

          {/* Non-interactive Live Chart */}
          <div style={{ height: 260, position: "relative", marginBottom: 12 }}>
            <BTCChart
              onPriceUpdate={() => {}}
              activeBets={[]}
              roundStartPrice={null}
            />
          </div>

          <div className={styles.previewFooterRow}>
            <div className={styles.previewIndicatorCol}>
              <span className={styles.previewSelectorLabel}>1M prediction status</span>
              <span className={styles.previewTimerVal}>Accepting Predictions</span>
            </div>
            <Link href="/trade" className={styles.previewPlayLink}>
              <span>Enter Workspace</span>
              <ChevronRight size={16} />
            </Link>
          </div>
        </div>
      </motion.section>

      {/* 2x3 FEATURES GRID (Flat Doc-style layout) */}
      <section id="features" className={styles.featuresBg}>
        <motion.div 
          className={styles.featuresContainer}
          variants={listContainerVariants}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-100px" }}
        >
          <motion.div className={styles.featCardDoc} variants={itemVariants}>
            <div className={styles.featIconBox} style={{ color: "#3b82f6", background: "#eff6ff" }}>
              <TrendingUp size={20} />
            </div>
            <h4 className={styles.featTitle}>Live BTC Markets</h4>
            <p className={styles.featDesc}>
              Connect to raw data streams straight from Binance WebSockets. Zero delay, 100% price accuracy.
            </p>
          </motion.div>

          <motion.div className={styles.featCardDoc} variants={itemVariants}>
            <div className={styles.featIconBox} style={{ color: "#3b82f6", background: "#eff6ff" }}>
              <Zap size={20} />
            </div>
            <h4 className={styles.featTitle}>Simple Predictions</h4>
            <p className={styles.featDesc}>
              No complicated order books or options sheets. Predict the next 1-minute price direction and win.
            </p>
          </motion.div>

          <motion.div className={styles.featCardDoc} variants={itemVariants}>
            <div className={styles.featIconBox} style={{ color: "#3b82f6", background: "#eff6ff" }}>
              <Wallet size={20} />
            </div>
            <h4 className={styles.featTitle}>Secure INR Wallet</h4>
            <p className={styles.featDesc}>
              Deposit using instant UPI QR codes. Quick verification and fast bank withdrawals.
            </p>
          </motion.div>

          <motion.div className={styles.featCardDoc} variants={itemVariants}>
            <div className={styles.featIconBox} style={{ color: "#10b981", background: "#ecfdf5" }}>
              <Check size={20} />
            </div>
            <h4 className={styles.featTitle}>Instant Payouts</h4>
            <p className={styles.featDesc}>
              Settle rounds atomically. Winners receive credit balances automatically inside 10ms of round end.
            </p>
          </motion.div>

          <motion.div className={styles.featCardDoc} variants={itemVariants}>
            <div className={styles.featIconBox} style={{ color: "#3b82f6", background: "#eff6ff" }}>
              <MessageSquare size={20} />
            </div>
            <h4 className={styles.featTitle}>Telegram Webhook</h4>
            <p className={styles.featDesc}>
              Sync deposit verifications and receive payout confirmations directly via automated bot notifications.
            </p>
          </motion.div>

          <motion.div className={styles.featCardDoc} variants={itemVariants}>
            <div className={styles.featIconBox} style={{ color: "#f59e0b", background: "#fffbeb" }}>
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
              <div className={styles.statNum}>
                <CountUp end={1450000} suffix="+" />
              </div>
              <div className={styles.statNumLabel}>Total Bets</div>
            </motion.div>

            <motion.div className={styles.statNumCard} variants={itemVariants} whileHover={{ y: -2 }}>
              <div className={styles.statNum}>
                <CountUp end={60} suffix="s" />
              </div>
              <div className={styles.statNumLabel}>Round Time</div>
            </motion.div>

            <motion.div className={styles.statNumCard} variants={itemVariants} whileHover={{ y: -2 }}>
              <div className={styles.statNum}>99.98%</div>
              <div className={styles.statNumLabel}>Settle Success</div>
            </motion.div>

            <motion.div className={styles.statNumCard} variants={itemVariants} whileHover={{ y: -2 }}>
              <div className={styles.statNum}>
                <CountUp end={12000} suffix="+" />
              </div>
              <div className={styles.statNumLabel}>Active Users</div>
            </motion.div>
          </div>
        </motion.div>
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
              <div className={styles.stepNumberBadge}>1</div>
              <h5 className={styles.stepTitle}>Choose Amount</h5>
              <p className={styles.stepDesc}>Decide how much you want to stake on the next 1-minute round.</p>
            </motion.div>

            <motion.div className={styles.stepCard} variants={itemVariants}>
              <div className={styles.stepNumberBadge}>2</div>
              <h5 className={styles.stepTitle}>Select Direction</h5>
              <p className={styles.stepDesc}>Predict whether the round will settle UP or DOWN compared to the start price.</p>
            </motion.div>

            <motion.div className={styles.stepCard} variants={itemVariants}>
              <div className={styles.stepNumberBadge}>3</div>
              <h5 className={styles.stepTitle}>Watch Round</h5>
              <p className={styles.stepDesc}>Wait for the 1-minute countdown clock to expire as live prices tick.</p>
            </motion.div>

            <motion.div className={styles.stepCard} variants={itemVariants}>
              <div className={styles.stepNumberBadge}>4</div>
              <h5 className={styles.stepTitle}>Collect Payout</h5>
              <p className={styles.stepDesc}>Correct predictions win +80% profit credited immediately to your balance.</p>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* MINIMAL FOOTER */}
      <footer className={styles.landingFooter}>
        <div className={styles.footerContainer}>
          <div className={styles.footerTop}>
            <div className={styles.footerLogoCol}>
              <div className={styles.footerLogo}>
                <TrendingUp size={20} className={styles.logoIcon} style={{ marginRight: 6, color: "#10b981" }} />
                <span style={{ fontWeight: "bold" }}>Predict<span style={{ color: "#10b981" }}>BTC</span></span>
              </div>
              <p className={styles.footerLogoDesc}>
                A clean, high-performance prediction market platform. Experience the thrill of 1-minute forecasting.
              </p>
            </div>

            <div className={styles.footerLinksRow}>
              <div className={styles.footerCol}>
                <span className={styles.footerColTitle}>Platform</span>
                <a href="#preview" className={styles.footerLink}>Markets</a>
                <a href="#features" className={styles.footerLink}>Features</a>
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
            <span>© {new Date().getFullYear()} PredictBTC Inc. All rights reserved.</span>
            <span>Inspired by clean SaaS design principles.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
