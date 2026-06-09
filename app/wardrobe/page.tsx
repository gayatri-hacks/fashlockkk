import { DM_Sans, Playfair_Display } from "next/font/google";
import { WardrobeClient } from "./wardrobe-client";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-fashlock-display",
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-fashlock-body",
  weight: ["400", "500", "600", "700"],
});

export default function WardrobePage() {
  return <WardrobeClient className={`${playfair.variable} ${dmSans.variable}`} />;
}
