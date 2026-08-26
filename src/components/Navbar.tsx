"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignInButton, UserButton, useUser } from "@clerk/nextjs";
import { TrendingUp, User, LayoutDashboard, Terminal } from "lucide-react";
import styles from "./Navbar.module.css";

export default function Navbar() {
  const pathname = usePathname();
  const { isSignedIn } = useUser();

  return (
    <header className={styles.header}>
      <div className={styles.container}>
        <div className={styles.logoGroup}>
          <Link href="/" className={styles.logo}>
            <TrendingUp size={24} className={styles.logoIcon} />
            <span className={styles.logoText}>Yes<span className={styles.gradientText}>No</span></span>
          </Link>
        </div>

        <nav className={styles.nav}>
          <Link href="/" className={`${styles.navLink} ${pathname === "/" ? styles.active : ""}`}>
            <LayoutDashboard size={18} />
            <span>Trade</span>
          </Link>
          <Link href="/profile" className={`${styles.navLink} ${pathname === "/profile" ? styles.active : ""}`}>
            <User size={18} />
            <span>Profile & Wallet</span>
          </Link>
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
