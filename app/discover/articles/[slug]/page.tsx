import { redirect } from "next/navigation";
import { seedArticles } from "@/lib/discover-seeds";

type LegacyArticlePageProps = {
  params: Promise<{ slug: string }>;
};

export default async function LegacyArticlePage({ params }: LegacyArticlePageProps) {
  const { slug } = await params;
  const article = seedArticles.find((item) => item.slug === slug);
  const topic = article?.title ?? slug.replace(/-/g, " ");

  redirect(`/article?topic=${encodeURIComponent(topic)}`);
}

