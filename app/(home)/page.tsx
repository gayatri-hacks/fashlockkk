import Link from "next/link";
import { Cormorant_Garamond, DM_Sans } from "next/font/google";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-fashlock-display",
  weight: ["300"],
  style: ["normal", "italic"],
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-fashlock-body",
  weight: ["200", "300"],
});

const corners = [
  { key: "top-left", style: { top: 28, left: 28, borderTopWidth: 0.5, borderLeftWidth: 0.5 } },
  { key: "top-right", style: { top: 28, right: 28, borderTopWidth: 0.5, borderRightWidth: 0.5 } },
  { key: "bottom-left", style: { bottom: 28, left: 28, borderBottomWidth: 0.5, borderLeftWidth: 0.5 } },
  { key: "bottom-right", style: { bottom: 28, right: 28, borderBottomWidth: 0.5, borderRightWidth: 0.5 } },
];

const navItems = [
  { label: "Discover", href: "/discover", active: true },
  { label: "Trends", href: "/trends" },
  { label: "Predict", href: "/predict" },
  { label: "Style", href: "/style" },
  { label: "Wardrobe", href: "/wardrobe" },
];

export default function HomePage() {
  return (
    <main
      className={`${cormorant.variable} ${dmSans.variable}`}
      style={{
        alignItems: "center",
        background: "#EDE8DF",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        minHeight: "100vh",
        overflow: "hidden",
        position: "relative",
        textAlign: "center",
      }}
    >
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes lineReveal {
          from { width: 0; }
          to { width: 80px; }
        }

        .openingFadeUp {
          opacity: 0;
          animation-name: fadeUp;
          animation-fill-mode: forwards;
          animation-timing-function: ease;
        }

        .openingNavLink {
          transition: color 0.2s ease;
        }

        .openingNavLink:hover {
          color: #B03A5B !important;
        }
      `}</style>

      {corners.map((corner) => (
        <span
          key={corner.key}
          aria-hidden="true"
          style={{
            ...corner.style,
            animation: "fadeUp 1s ease 2.2s forwards",
            borderColor: "#B8A898",
            height: 16,
            opacity: 0,
            pointerEvents: "none",
            position: "absolute",
            width: 16,
          }}
        />
      ))}

      <p
        className="openingFadeUp"
        style={{
          animationDelay: "0.3s",
          animationDuration: "0.8s",
          color: "#9C8E82",
          fontFamily: "var(--font-fashlock-body)",
          fontSize: 10,
          fontWeight: 200,
          letterSpacing: 6,
          lineHeight: 1,
          margin: "0 0 22px",
          textTransform: "uppercase",
        }}
      >
        THE FASHION INTELLIGENCE PLATFORM
      </p>

      <h1
        className="openingFadeUp"
        style={{
          animationDelay: "0.7s",
          animationDuration: "0.9s",
          fontFamily: "var(--font-fashlock-display)",
          fontSize: "clamp(64px, 10vw, 110px)",
          fontWeight: 300,
          letterSpacing: 0,
          lineHeight: 1,
          margin: 0,
        }}
      >
        <span style={{ color: "#1C1410" }}>Fash</span>
        <span style={{ color: "#B03A5B" }}>lock</span>
      </h1>

      <span
        aria-hidden="true"
        style={{
          animation: "lineReveal 0.8s ease 1.4s forwards",
          background: "#B8A898",
          display: "block",
          height: 0.5,
          margin: "24px auto 22px",
          width: 0,
        }}
      />

      <p
        className="openingFadeUp"
        style={{
          animationDelay: "1.6s",
          animationDuration: "0.9s",
          color: "#5C4E42",
          fontFamily: "var(--font-fashlock-body)",
          fontSize: "clamp(12px, 1.6vw, 16px)",
          fontWeight: 300,
          letterSpacing: 0.5,
          lineHeight: 1.2,
          margin: "0 0 16px",
        }}
      >
        Your world. Your style. Your universe.
      </p>

      <p
        className="openingFadeUp"
        style={{
          animationDelay: "1.9s",
          animationDuration: "0.9s",
          color: "#9C8E82",
          fontFamily: "var(--font-fashlock-display)",
          fontSize: "clamp(11px, 1.3vw, 14px)",
          fontStyle: "italic",
          fontWeight: 200,
          letterSpacing: 2,
          lineHeight: 1.3,
          margin: 0,
        }}
      >
        — La mode, c&apos;est une façon de vivre —
      </p>

      <nav
        className="openingFadeUp"
        style={{
          animationDelay: "2.2s",
          animationDuration: "0.8s",
          bottom: 32,
          display: "flex",
          flexWrap: "wrap",
          fontFamily: "var(--font-fashlock-body)",
          fontSize: 9,
          fontWeight: 200,
          gap: 32,
          justifyContent: "center",
          left: 24,
          letterSpacing: 4,
          lineHeight: 1,
          position: "absolute",
          right: 24,
          textTransform: "uppercase",
        }}
      >
        {navItems.map((item) => (
          <Link
            key={item.href}
            className="openingNavLink"
            href={item.href}
            style={{
              color: item.active ? "#B03A5B" : "#9C8E82",
              textDecoration: "none",
            }}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </main>
  );
}
