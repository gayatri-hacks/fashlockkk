# Fashion Trend Intelligence Platform

Phase 1 of a production-ready fashion trend intelligence platform built with Next.js, TypeScript, Tailwind CSS, Supabase, Playwright, Recharts, TanStack Table, and Zod.

## What this phase does

- Scrapes fashion ecommerce product listings.
- Stores products, scrape runs, sources, categories, and trend snapshots in Supabase Postgres.
- Calculates keyword-based fashion trend movement without AI.
- Displays dashboard, products, trends, and brands views.
- Falls back to mock data when Supabase environment variables are missing.

## Project Structure

- `app/` Next.js App Router pages and API routes
- `components/` reusable UI and chart components
- `lib/` shared data, analytics, schema, and Supabase helpers
- `scraper/` Playwright scraper and trend calculator
- `database/` SQL migrations and seed files
- `public/` static assets if needed later

## Setup

1. Install dependencies:

```bash
npm install
```

2. Install Python packages:

```bash
cd scraper
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m playwright install
cd ..
```

3. Create environment variables:

- Copy `.env.example` to `.env.local` for the Next.js app.
- Copy `scraper/.env.example` to `scraper/.env` for Python scripts.
- Fill in your Supabase URL and keys.

## Supabase Setup

1. Create a Supabase project.
2. Open the SQL editor.
3. Run the files in `database/` in this order:

```sql
database/001_schema.sql
database/002_seed_trend_keywords.sql
database/003_seed_categories.sql
```

4. Confirm the tables exist:

- `sources`
- `categories`
- `scrape_runs`
- `products`
- `trend_keywords`
- `trend_snapshots`

5. Make sure your Supabase key has permission to read/write these tables.

## Run the Scraper

The scraper accepts a source name, category name, and listing URL.

```bash
cd scraper
python scrape_products.py --source "Myntra" --category "Women Tops" --url "https://www.myntra.com/women-tops"
```

Optional visible browser mode:

```bash
python scrape_products.py --source "Myntra" --category "Women Tops" --url "https://www.myntra.com/women-tops" --headed
```

Supported starter sources:

- Myntra
- Ajio
- Zara India
- H&M India
- Nykaa Fashion

If a source changes its markup, update the selector templates in `scraper/config.py`.

## Calculate Trends

After scraping products into Supabase, run the trend engine:

```bash
cd scraper
python calculate_trends.py
```

This reads product titles, counts keyword matches, compares the current week with the previous week, and writes results into `trend_snapshots`.

## Run the Next.js App

```bash
npm run dev
```

Then open:

- `/dashboard`
- `/products`
- `/trends`
- `/brands`

## Expected Flow

1. Run the scraper.
2. Products are saved to Supabase.
3. Run trend calculation.
4. Open the dashboard.
5. Review rising and declining fashion trends.

## Notes

- No authentication is included.
- No AI is included.
- No payments are included.
- No social media scraping is included.
- The frontend uses mock fallback data when Supabase env vars are absent.
