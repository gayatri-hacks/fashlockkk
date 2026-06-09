-- Add story editorials cache table
CREATE TABLE IF NOT EXISTS story_editorials (
  slug TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add expanded content column to news_articles
ALTER TABLE news_articles 
ADD COLUMN IF NOT EXISTS expanded_content TEXT;

-- Create index on fetched_at for pagination
CREATE INDEX IF NOT EXISTS idx_news_articles_fetched_at 
ON news_articles(fetched_at DESC);
