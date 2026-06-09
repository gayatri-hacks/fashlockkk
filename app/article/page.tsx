import { DM_Sans, Playfair_Display } from "next/font/google";
import { FashlockArticleEngine } from "@/components/article/fashlock-article-engine";

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

export const dynamic = "force-dynamic";

export default function ArticlePage() {
  return <FashlockArticleEngine className={`${playfair.variable} ${dmSans.variable}`} />;
}

