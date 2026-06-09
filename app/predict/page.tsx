import { Cormorant_Garamond, DM_Sans } from "next/font/google";
import { PredictPageExperience } from "@/components/trends/predict-page-experience";
import { loadPredictPageData } from "@/lib/predict-page";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-predict-display",
  weight: ["300", "400"],
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-predict-body",
  weight: ["200", "300"],
});

export const dynamic = "force-dynamic";

export default async function PredictPage() {
  const data = await loadPredictPageData();

  return (
    <main className={`${cormorant.variable} ${dmSans.variable}`}>
      <PredictPageExperience data={data} />
    </main>
  );
}
