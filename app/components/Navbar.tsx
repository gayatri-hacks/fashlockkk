"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Cormorant_Garamond, DM_Sans } from "next/font/google";
import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/app/lib/supabase";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-global-nav-display",
  weight: ["300"],
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-global-nav-body",
  weight: ["200"],
});

const navItems = [
  { label: "Discover", href: "/discover", match: (pathname: string) => pathname === "/discover" || pathname.startsWith("/discover/") },
  { label: "Trends", href: "/trends", match: (pathname: string) => pathname === "/trends" },
  { label: "Predict", href: "/predict", match: (pathname: string) => pathname === "/predict" || pathname === "/trends/predictions" },
  { label: "Style", href: "/style", match: (pathname: string) => pathname === "/style" || pathname === "/outfit-upload" || pathname === "/style-quiz" },
  { label: "Wardrobe", href: "/wardrobe", match: (pathname: string) => pathname === "/wardrobe" },
];

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setSession(data.session);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const avatarLabel = useMemo(() => {
    const name = session?.user.user_metadata?.name || session?.user.user_metadata?.full_name || session?.user.email || "";
    return String(name).charAt(0).toUpperCase() || "F";
  }, [session]);

  async function signOut() {
    await supabase.auth.signOut();
    setMenuOpen(false);
    router.push("/");
    router.refresh();
  }

  if (pathname === "/" || pathname === "/signin") {
    return null;
  }

  return (
    <header
      className={`${cormorant.variable} ${dmSans.variable}`}
      style={{
        alignItems: "center",
        backdropFilter: "blur(8px)",
        background: "rgba(237,232,223,0.92)",
        borderBottom: "0.5px solid #D4C8BC",
        display: "flex",
        height: 52,
        justifyContent: "space-between",
        left: 0,
        padding: "0 48px",
        position: "fixed",
        right: 0,
        top: 0,
        WebkitBackdropFilter: "blur(8px)",
        width: "100%",
        zIndex: 50,
      }}
    >
      <style>{`
        .globalNavItem {
          color: #9C8E82;
          transition: color 0.2s ease;
        }

        .globalNavItem:hover {
          color: #B03A5B !important;
        }

        .authArea {
          align-items: center;
          display: flex;
          gap: 18px;
          position: relative;
        }

        .signinLink {
          color: #B03A5B;
          font-family: var(--font-global-nav-body);
          font-size: 10px;
          font-weight: 200;
          letter-spacing: 3px;
          text-decoration: none;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .avatarButton {
          align-items: center;
          background: #2C2418;
          border: 0;
          border-radius: 50%;
          color: #F0EBE3;
          cursor: pointer;
          display: flex;
          font-family: var(--font-global-nav-body);
          font-size: 11px;
          font-weight: 300;
          height: 28px;
          justify-content: center;
          overflow: hidden;
          padding: 0;
          width: 28px;
        }

        .avatarButton img {
          height: 100%;
          object-fit: cover;
          width: 100%;
        }

        .authDropdown {
          background: #F0EBE3;
          border: 0.5px solid #D4C8BC;
          border-radius: 2px;
          box-shadow: 0 8px 28px rgba(44,36,24,0.08);
          display: grid;
          gap: 0;
          min-width: 150px;
          padding: 8px;
          position: absolute;
          right: 0;
          top: 40px;
          z-index: 70;
        }

        .authDropdown a,
        .authDropdown button {
          background: transparent;
          border: 0;
          color: #2C2418;
          cursor: pointer;
          font-family: var(--font-global-nav-body);
          font-size: 10px;
          font-weight: 200;
          letter-spacing: 2px;
          padding: 10px 12px;
          text-align: left;
          text-decoration: none;
          text-transform: uppercase;
        }

        .authDropdown a:hover,
        .authDropdown button:hover {
          color: #B03A5B;
        }
      `}</style>

      <Link
        href="/"
        style={{
          color: "#1C1410",
          fontFamily: "var(--font-global-nav-display)",
          fontSize: 16,
          fontWeight: 300,
          letterSpacing: 6,
          lineHeight: 1,
          textDecoration: "none",
          textTransform: "uppercase",
          whiteSpace: "nowrap",
        }}
      >
        Fashlock
      </Link>

      <div
        style={{
          alignItems: "center",
          display: "flex",
          fontFamily: "var(--font-global-nav-body)",
          fontSize: 10,
          fontWeight: 200,
          gap: 36,
          letterSpacing: 4,
          lineHeight: 1,
          marginLeft: 32,
          overflowX: "auto",
          textTransform: "uppercase",
          whiteSpace: "nowrap",
        }}
      >
        <nav aria-label="Primary" style={{ alignItems: "center", display: "flex", gap: 36 }}>
          {navItems.map((item) => {
            const active = item.match(pathname);

            return (
              <Link
                key={item.href}
                className="globalNavItem"
                href={item.href}
                style={{
                  color: active ? "#B03A5B" : "#9C8E82",
                  textDecoration: "none",
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="authArea">
          {!session ? (
            <Link className="signinLink" href="/signin">
              Sign in
            </Link>
          ) : (
            <>
              <button className="avatarButton" onClick={() => setMenuOpen((open) => !open)} type="button" aria-label="Account menu">
                {session.user.user_metadata?.avatar_url ? (
                  <img src={session.user.user_metadata.avatar_url} alt="" />
                ) : (
                  avatarLabel
                )}
              </button>
              {menuOpen ? (
                <div className="authDropdown">
                  <Link href="/style" onClick={() => setMenuOpen(false)}>
                    My Style
                  </Link>
                  <Link href="/wardrobe" onClick={() => setMenuOpen(false)}>
                    My Wardrobe
                  </Link>
                  <button onClick={signOut} type="button">
                    Sign out
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </header>
  );
}
