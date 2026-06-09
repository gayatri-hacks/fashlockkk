# Data Foundation Setup Guide

This guide walks you through setting up the complete data pipeline for Fashion Trend Intelligence.

## Overview

```
Supabase Database
       ↓
Database Schemas (SQL)
       ↓
Environment Variables (.env.local)
       ↓
Python Scraper
       ↓
Real Product Data
       ↓
Trend Calculator
       ↓
Live Dashboard
```

---

## Step 1: Set Up Environment Variables

### 1a. Create `.env.local` in the project root

```bash
cp .env.example .env.local
```

You now have:
- `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Public auth key
- `SUPABASE_SERVICE_ROLE_KEY` - Admin key (for backend operations)
- `SUPABASE_URL` - Backend URL
- `SUPABASE_ANON_KEY` - Backend auth

### 1b. Verify the keys are populated

```bash
cat .env.local
```

You should see real credentials (not placeholders). ✓

---

## Step 2: Set Up Database Schemas

### 2a. Open Supabase dashboard

1. Go to: https://app.supabase.com
2. Log in with your account
3. Select project: `ikvmbvmkpdeuuxydojpv`
4. Click "SQL Editor" in the left sidebar

### 2b. Run SQL migrations in order

**IMPORTANT:** Run these one at a time, in order.

#### Migration 1: Create base tables

Open [database/001_schema.sql](database/001_schema.sql) and copy-paste the entire content into the SQL editor, then click "Run".

This creates:
- `sources` table (Myntra, Ajio, Zara, H&M, Nykaa)
- `categories` table (Women Tops, Dresses, etc.)
- `products` table (25 mock products)
- `scrape_runs` table (logging)
- `trend_keywords` table (30 keywords to track)
- `trend_snapshots` table (weekly trend data)

**Expected output:** ✓ Success (all tables created)

#### Migration 2: Seed trend keywords

Open [database/002_seed_trend_keywords.sql](database/002_seed_trend_keywords.sql) and run it.

This inserts the 30 keywords the system tracks:
`oversized`, `baggy`, `cargo`, `denim`, `linen`, `washed`, `vintage`, `graphic`, `cropped`, etc.

**Expected output:** ✓ 30 rows inserted

#### Migration 3: Seed categories

Open [database/003_seed_categories.sql](database/003_seed_categories.sql) and run it.

This inserts 6 fashion categories.

**Expected output:** ✓ 6 rows inserted

### 2c. Verify tables exist

In Supabase, go to "Table Editor" and confirm you see:
- [ ] `sources` (5 rows)
- [ ] `categories` (6 rows)
- [ ] `products` (25 rows)
- [ ] `scrape_runs` (empty, will fill when scraper runs)
- [ ] `trend_keywords` (30 rows)
- [ ] `trend_snapshots` (empty, will fill when trend calculator runs)

---

## Step 3: Test the Next.js App with Database

### 3a. Restart the dev server

```bash
# Kill old process
pkill -f "npm run dev"

# Start fresh
npm run dev
```

### 3b. Visit the dashboard

Open: http://localhost:3001/dashboard

You should see:
- ✓ "Total products scraped: 25" (from mock data)
- ✓ "Total brands tracked: 15"
- ✓ Charts and trend cards

### 3c. Test the Products page

Visit: http://localhost:3001/products

- [ ] Table loads with 25 products
- [ ] Filters work instantly (Category, Brand, Color)
- [ ] Search finds products

### 3d. Test the API directly

```bash
# Get all products
curl http://localhost:3001/api/products | jq '.data | length'

# Get dashboard data
curl http://localhost:3001/api/dashboard | jq '.data.totalProducts'

# Get trends
curl http://localhost:3001/api/trends | jq '.data.trendRows | length'
```

Expected: All return data ✓

---

## Step 4: Set Up Python Scraper

### 4a. Create Python environment

```bash
cd scraper
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
```

### 4b. Install dependencies

```bash
pip install -r requirements.txt
python -m playwright install
```

### 4c. Create scraper config

Create `scraper/.env`:

```bash
SUPABASE_URL=https://ikvmbvmkpdeuuxydojpv.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlrdm1idm1rcGRldXV4eWRvanB2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1NjI5NjgsImV4cCI6MjA5NDEzODk2OH0.wfPMX2QeveTiW7G-V8DksI1Ejl5gYP1biRiwGzwkIes
```

(Copy from `.env.local` at project root)

### 4d. Test the scraper

```bash
python scrape_products.py --source "Myntra" --category "Women Tops" --url "https://www.myntra.com/women-tops" --max-products 5
```

Expected output:
```
✓ Scraping: https://www.myntra.com/women-tops
✓ Found 5 products
✓ Saved to Supabase
```

Check Supabase: Products table should now have 30 products (25 mock + 5 new)

---

## Step 5: Run the Trend Calculator

### 5a. Make sure scraper ran first

The trend calculator needs real product data. If you just ran the scraper, you're good.

### 5b. Run the calculator

```bash
python calculate_trends.py
```

Expected output:
```
✓ Loaded 30 products
✓ Counted keywords
✓ Calculated trends
✓ Rising: 8 (Growth > 15%)
✓ Stable: 12
✓ Declining: 10
✓ Saved to trend_snapshots
```

### 5c. Verify in Supabase

Go to Supabase → Table Editor → `trend_snapshots`

You should see 30 rows with:
- `keyword` (oversized, cargo, etc.)
- `current_count` (number of products this week)
- `previous_count` (number last week)
- `growth_percentage` (% change)
- `status` (Rising / Stable / Declining)

---

## Step 6: See Live Trends in Dashboard

### 6a. Refresh the dashboard

Visit: http://localhost:3001/trends

Now you should see **real data** instead of mock:
- [ ] Rising trends with your actual keyword growth
- [ ] Chart showing keyword momentum over time
- [ ] Stable keywords
- [ ] Declining keywords

### 6b. Check dashboard homepage

Visit: http://localhost:3001/dashboard

Now shows:
- [ ] Your actual product count
- [ ] Your actual brand count
- [ ] Real top rising/declining keywords
- [ ] Charts based on real data

---

## Step 7: Automate the Pipeline (Optional)

To run scraper + trend calculator on schedule:

### Option A: Manual cron (Linux/Mac)

```bash
# Edit crontab
crontab -e

# Add this line (runs daily at 2 AM)
0 2 * * * cd /path/to/fashiontrend-main/scraper && python scrape_products.py --source "Myntra" --category "Women Tops" --url "https://www.myntra.com/women-tops" && python calculate_trends.py
```

### Option B: GitHub Actions (if on GitHub)

Create `.github/workflows/scrape.yml`:

```yaml
name: Daily Scrape & Trends

on:
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM UTC

jobs:
  scrape:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-python@v4
      - run: |
          cd scraper
          pip install -r requirements.txt
          python -m playwright install
          python scrape_products.py --source "Myntra" --category "Women Tops"
          python calculate_trends.py
```

### Option C: Cloud Scheduler

Deploy this to Vercel + set up cron endpoint:

```typescript
// app/api/cron/scrape/route.ts
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  // Validate cron secret
  if (request.headers.get("Authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Call Python scraper via shell
    // (Requires special setup for Python on Vercel)
    
    return NextResponse.json({ success: true, message: "Scrape triggered" });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
```

---

## Troubleshooting

### "Cannot connect to Supabase"
- [ ] Check `.env.local` has real credentials
- [ ] Verify Supabase project is active (check dashboard)
- [ ] Test: `curl https://ikvmbvmkpdeuuxydojpv.supabase.co/rest/v1`

### "Products table is empty"
- [ ] Run SQL migrations again (001, 002, 003)
- [ ] Verify in Supabase Table Editor → products → should see 25 rows

### "Scraper fails"
- [ ] Check Python version: `python --version` (should be 3.8+)
- [ ] Check `.venv` activated: `which python` (should show `.venv/bin/python`)
- [ ] Re-install: `pip install -r requirements.txt`

### "Trends not calculating"
- [ ] Run scraper first: `python scrape_products.py ...`
- [ ] Check `scrape_runs` table has entries
- [ ] Then run: `python calculate_trends.py`

---

## Success Checklist

- [ ] `.env.local` created with Supabase credentials
- [ ] All 3 SQL migrations ran successfully
- [ ] Can see 25 products in Supabase
- [ ] Dashboard loads with mock data
- [ ] Python scraper runs without errors
- [ ] New products appear in Supabase
- [ ] Trend calculator runs successfully
- [ ] Trends appear in `/trends` page
- [ ] Filters work fast on `/products` page

**Done!** Your data foundation is live. 🚀

---

## Next: Integration with Deadstock Platform

Once this is working, you can:

1. **Query trends from your marketplace:**
   ```javascript
   const trends = await fetch('http://localhost:3001/api/trends').then(r => r.json());
   // trends.data.trendRows shows rising/declining keywords
   ```

2. **Add trend badges to product listings:**
   ```
   "Linen" → Trending Rising 🔥 (+45% this week)
   ```

3. **Push sellers to list trending fab fabrics:**
   ```
   "Cargo trending → List your cargo deadstock now"
   ```

This is how you layer the trend engine into your exchange.
