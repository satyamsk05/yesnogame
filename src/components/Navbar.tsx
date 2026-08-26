"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignInButton, UserButton, useUser } from "@clerk/nextjs";
import { TrendingUp, User, LayoutDashboard } from "lucide-react";
import styles from "./Navbar.module.css";

export default function Navbar() {
  const pathname = usePathname();
  const { isSignedIn } = useUser();

  return (
    <header className={styles.header}>
      <div className={styles.container}>
        <div className={styles.logoGroup}>
          <Link href="/" className={styles.logo}>
            <TrendingUp size={24} className={styles.logoIcon} style={{ color: "#10b981" }} />
            <span className={styles.logoText}>
              Predict<span className={styles.gradientText}>BTC</span>
            </span>
          </Link>
        </div>

        <nav className={styles.nav}>
          {isSignedIn ? (
            <>
              <Link href="/trade" className={`${styles.navLink} ${pathname === "/trade" ? styles.active : ""}`}>
                <LayoutDashboard size={18} />
                <span>Trade</span>
              </Link>
              <Link href="/profile" className={`${styles.navLink} ${pathname === "/profile" ? styles.active : ""}`}>
                <User size={18} />
                <span>Profile & Wallet</span>
              </Link>
            </>
          ) : (
            <>
              <Link href="/#preview" className={styles.navLink}>
                <span>Markets</span>
              </Link>
              <Link href="/#features" className={styles.navLink}>
                <span>Features</span>
              </Link>
              <Link href="/#how-it-works" className={styles.navLink}>
                <span>How It Works</span>
              </Link>
            </>
          )}
        </nav>

        <div className={styles.authGroup}>
          {isSignedIn ? (
            <UserButton
              appearance={{
                elements: {
                  avatarBox: styles.userAvatar,
                },
              }}
            />
          ) : (
            <SignInButton mode="modal">
              <button className={styles.loginBtn}>Sign In</button>
            </SignInButton>
          )}
        </div>
      </div>
    </header>
  );
}
