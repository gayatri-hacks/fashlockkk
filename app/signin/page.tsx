"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Cormorant_Garamond, DM_Sans } from "next/font/google";
import { supabase } from "@/app/lib/supabase";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-signin-sans",
  weight: ["200", "300"],
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-signin-display",
  weight: ["300"],
  style: ["normal", "italic"],
});

function SignInContent() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const next = searchParams.get("next") || "/discover";

  function callbackUrl() {
    const url = new URL("/auth/callback", window.location.origin);
    url.searchParams.set("next", next);
    return url.toString();
  }

  async function signInWithGoogle() {
    setError("");
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callbackUrl(),
      },
    });
  }

  async function sendCode(event: FormEvent) {
    event.preventDefault();
    if (!email.trim()) return;
    setError("");
    setLoading(true);

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: callbackUrl(),
      },
    });

    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setOtpSent(true);
  }

  async function verifyCode(event: FormEvent) {
    event.preventDefault();
    if (!email.trim() || !otp.trim()) return;
    setError("");
    setLoading(true);

    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: otp.trim(),
      type: "email",
    });

    setLoading(false);
    if (error) {
      setError("That code didn't work. Try again.");
      return;
    }
    window.location.href = next;
  }

  return (
    <main className={`${dmSans.variable} ${cormorant.variable} signinPage`}>
      <style>{`
        .signinPage {
          align-items: center;
          background: #F0EBE3;
          color: #2C2418;
          display: flex;
          flex-direction: column;
          font-family: var(--font-signin-sans);
          justify-content: center;
          min-height: 100vh;
          padding: 32px;
          text-align: center;
        }

        .signinLogo {
          color: #1C1410;
          font-family: var(--font-signin-display);
          font-size: 32px;
          font-weight: 300;
          letter-spacing: 6px;
          line-height: 1;
          margin-bottom: 48px;
          text-transform: uppercase;
        }

        .signinLogo span {
          color: #B03A5B;
        }

        .signinPage h1 {
          color: #2C2418;
          font-family: var(--font-signin-display);
          font-size: 36px;
          font-style: italic;
          font-weight: 300;
          line-height: 1.1;
          margin: 0;
        }

        .signinSubtitle {
          color: #8C7B6E;
          font-size: 13px;
          font-weight: 300;
          line-height: 1.7;
          margin: 12px 0 0;
          max-width: 360px;
        }

        .googleButton {
          align-items: center;
          background: #2C2418;
          border: 0;
          border-radius: 2px;
          color: #F0EBE3;
          cursor: pointer;
          display: flex;
          font-family: var(--font-signin-sans);
          font-size: 14px;
          font-weight: 300;
          gap: 12px;
          justify-content: center;
          letter-spacing: 1px;
          margin-top: 40px;
          padding: 16px 24px;
          transition: 0.2s;
          width: 320px;
        }

        .googleButton:hover {
          background: #1C1410;
        }

        .googleIcon {
          color: #F0EBE3;
          font-size: 20px;
          line-height: 1;
        }

        .signinDivider {
          align-items: center;
          display: flex;
          gap: 16px;
          margin: 24px 0;
          width: 320px;
        }

        .signinDivider::before,
        .signinDivider::after {
          background: #D4C8BC;
          content: "";
          flex: 1;
          height: 0.5px;
        }

        .signinDivider span {
          color: #C4B4A6;
          font-size: 10px;
          font-weight: 200;
        }

        .emailForm {
          width: 320px;
        }

        .emailForm input {
          background: #FAF7F4;
          border: 0.5px solid #D4C8BC;
          border-radius: 2px;
          color: #2C2418;
          font-family: var(--font-signin-sans);
          font-size: 14px;
          font-weight: 300;
          outline: none;
          padding: 14px 20px;
          transition: 0.2s;
          width: 100%;
        }

        .emailForm input:focus {
          border-color: #B03A5B;
        }

        .otpInput {
          font-size: 24px !important;
          letter-spacing: 8px;
          margin: 0 auto;
          text-align: center;
          width: 200px !important;
        }

        .emailForm button {
          background: #F0EBE3;
          border: 0.5px solid #D4C8BC;
          border-radius: 2px;
          color: #2C2418;
          cursor: pointer;
          font-family: var(--font-signin-sans);
          font-size: 13px;
          font-weight: 300;
          margin-top: 12px;
          padding: 14px;
          transition: 0.2s;
          width: 100%;
        }

        .emailForm button:hover:not(:disabled) {
          border-color: #B03A5B;
        }

        .emailForm button:disabled {
          cursor: default;
          opacity: 0.5;
        }

        .otpCopy {
          color: #8C7B6E;
          font-size: 13px;
          font-weight: 300;
          line-height: 1.6;
          margin: 0 0 16px;
        }

        .signinError {
          color: #B03A5B;
          font-size: 12px;
          font-weight: 300;
          margin: 12px 0 0;
        }

        .signinTerms {
          color: #C4B4A6;
          font-size: 9px;
          font-weight: 200;
          line-height: 1.6;
          margin: 32px 0 0;
          max-width: 320px;
        }

        .guestLink {
          color: #8C7B6E;
          display: inline-flex;
          font-size: 10px;
          font-weight: 200;
          letter-spacing: 3px;
          margin-top: 20px;
          text-decoration: none;
          text-transform: uppercase;
          transition: 0.2s;
        }

        .guestLink:hover {
          color: #B03A5B;
        }
      `}</style>

      <div className="signinLogo">
        Fash<span>lock</span>
      </div>
      <h1>Your style universe awaits.</h1>
      <p className="signinSubtitle">Sign in to unlock your personal style profile, saved trends, and wardrobe.</p>

      <button className="googleButton" onClick={signInWithGoogle} type="button">
        <span className="googleIcon">G</span>
        Continue with Google
      </button>

      <div className="signinDivider">
        <span>or</span>
      </div>

      {!otpSent ? (
        <form className="emailForm" onSubmit={sendCode}>
          <input
            autoComplete="email"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="your@email.com"
            type="email"
            value={email}
          />
          <button disabled={loading || !email.trim()} type="submit">
            Send code
          </button>
        </form>
      ) : (
        <form className="emailForm" onSubmit={verifyCode}>
          <p className="otpCopy">Check your email for a 6-digit code</p>
          <input
            className="otpInput"
            inputMode="numeric"
            maxLength={6}
            onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
            value={otp}
          />
          <button disabled={loading || otp.length !== 6} type="submit">
            Verify
          </button>
        </form>
      )}

      {error ? <p className="signinError">{error}</p> : null}
      <Link className="guestLink" href={next}>
        Continue without signing in
      </Link>
      <p className="signinTerms">By signing in you agree to Fashlock's terms of service.</p>
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInContent />
    </Suspense>
  );
}
