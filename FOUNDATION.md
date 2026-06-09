# Quick Start - Data Foundation

## 3-Step Setup

### Step 1️⃣: Create .env.local (5 seconds)
```bash
cp .env.example .env.local
```
✓ Done! You now have Supabase credentials configured.

### Step 2️⃣: Run SQL Migrations (2 minutes)

Go to: https://app.supabase.com → SQL Editor

Run these 3 files in order:
```sql
-- File 1: database/001_schema.sql
-- Creates all 6 tables

-- File 2: database/002_seed_trend_keywords.sql  
-- Adds 30 keywords to track

-- File 3: database/003_seed_categories.sql
-- Adds 6 fashion categories
```

After each file, you'll see:
```
✓ Success: X rows created/inserted
```

### Step 3️⃣: Start the app
```bash
npm run dev
```

Open: http://localhost:3001/dashboard

✓ You should see 25 products loaded!

---

## What You Just Built

| Layer | Technology | Status |
|-------|-----------|--------|
| **Database** | Supabase PostgreSQL | ✅ Ready |
| **Backend API** | Next.js `/api/*` routes | ✅ Ready |
| **Frontend** | Dashboard + 4 pages | ✅ Ready |
| **Mock Data** | 25 products loaded | ✅ Ready |
| **Real Data** | Python scraper (not yet run) | ⏳ Next |

---

## Next: Add Real Data

### Option A: Manual Test (5 min)
```bash
cd scraper
source .venv/bin/activate
python scrape_products.py --source "Myntra" --category "Women Tops" --url "https://www.myntra.com/women-tops" --max-products 5
```

Your dashboard will now show 30 products (25 mock + 5 real).

### Option B: Full Pipeline (10 min)
```bash
# Scrape
python scrape_products.py --source "Myntra" --category "Women Tops" --url "https://www.myntra.com/women-tops"

# Calculate trends
python calculate_trends.py

# Visit dashboard
# http://localhost:3001/trends
```

Now you see real trending keywords! 🔥

---

## Database Schema Reference

### `sources` (5 rows)
Places to scrape products from
```
id | name          | base_url
1  | Myntra        | myntra.com
2  | Zara India    | zara.com/in
3  | H&M India     | hm.com
4  | Ajio          | ajio.com
5  | Nykaa Fashion | nykaafashion.com
```

### `categories` (6 rows)
Types of clothing
```
id | name
1  | Women Tops
2  | Women Bottomwear
3  | Men Shirts
4  | Dresses
5  | Outerwear
6  | Accessories
```

### `products` (grows when you scrape)
Every product collected
```
id | title            | brand    | price | discount | color  | category_id | source_id
1  | Oversized shirt  | Roadster | 1799  | 22%      | Beige  | 1           | 1
2  | Cargo pants      | H&M      | 2499  | 17%      | Khaki  | 2           | 1
```

### `trend_keywords` (30 rows)
Words the system tracks
```
keyword      | category
oversized    | silhouette
baggy        | silhouette
cargo        | style
denim        | fabric
linen        | fabric
brown        | color
... (24 more)
```

### `trend_snapshots` (30 rows per week)
How keywords are trending
```
keyword   | current_count | previous_count | growth_pct | status
linen     | 23            | 12             | +91.7%     | Rising
cargo     | 5             | 5              | 0%         | Stable
denim     | 3             | 8              | -62.5%     | Declining
```

### `scrape_runs` (logs)
When scraper ran and what it found
```
id | source_id | category_id | products_found | status    | started_at
1  | 1         | 1           | 47             | completed | 2026-05-12 09:00:00
```

---

## API Endpoints

All live at `http://localhost:3001/api/*`

### GET `/api/products`
```bash
curl "http://localhost:3001/api/products?category=Dresses&brand=H&M"
```
Returns: Filtered product list

### GET `/api/trends`
```bash
curl http://localhost:3001/api/trends
```
Returns: Rising, stable, declining keywords

### GET `/api/dashboard`
```bash
curl http://localhost:3001/api/dashboard
```
Returns: All dashboard stats, KPIs, charts

### GET `/api/brands`
```bash
curl http://localhost:3001/api/brands
```
Returns: Brand metrics, activity

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Dashboard shows 0 products | Run SQL migrations 001-003 |
| Python: "ModuleNotFoundError" | `pip install -r requirements.txt` |
| Scraper: "Cannot connect to Supabase" | Check `.env` in scraper/ folder |
| Filters are slow | (Fixed! Now using memoization) |

---

## You Now Have Everything For Your Deadstock Platform

This trend engine feeds directly into your marketplace. Example integration:

```javascript
// Your marketplace shows trending fabrics
const trends = await fetch('http://localhost:3001/api/trends').then(r => r.json());
const risingTrends = trends.data.trendRows.filter(t => t.status === 'Rising');

// Display to sellers:
// "Linen is RISING (+45%) - List deadstock now to capture demand"

// Display to buyers:
// "Linen trending - Source surplus before prices rise"
```

---

## Files Modified/Created Today

✅ `SETUP.md` — Full setup guide  
✅ `setup.sh` — Automated setup  
✅ `.env.example` — Template updated  
✅ `FOUNDATION.md` — This file  

Get started: `bash setup.sh` or `npm run dev` 🚀
