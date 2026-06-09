# Data Foundation Checklist ✅

Track your progress setting up the data pipeline.

## Pre-Launch Checklist

### Configuration (5 min)
- [ ] `.env.local` exists in project root
- [ ] `.env.local` contains real Supabase credentials
- [ ] Can ping Supabase: `curl https://ikvmbvmkpdeuuxydojpv.supabase.co/rest/v1/`

### Database Setup (10 min)
- [ ] Created Supabase account
- [ ] Project: `ikvmbvmkpdeuuxydojpv`
- [ ] Ran `001_schema.sql` → 6 tables created
- [ ] Ran `002_seed_trend_keywords.sql` → 30 keywords inserted
- [ ] Ran `003_seed_categories.sql` → 6 categories inserted
- [ ] Verified in Table Editor:
  - [ ] `sources` table has 5 rows
  - [ ] `categories` table has 6 rows  
  - [ ] `products` table has 25 rows
  - [ ] `trend_keywords` table has 30 rows

### Frontend Verification (5 min)
- [ ] `npm run dev` starts without errors
- [ ] Dashboard loads: http://localhost:3001/dashboard
- [ ] Shows "25 products scraped"
- [ ] Products page loads: http://localhost:3001/products
- [ ] Filters work (Category, Brand, Color dropdown)
- [ ] Trends page shows mock data: http://localhost:3001/trends
- [ ] Brands page shows 15 brands: http://localhost:3001/brands

### API Verification (2 min)
```bash
# Each should return data without errors:
curl http://localhost:3001/api/products | jq '.data | length'        # Should be 25
curl http://localhost:3001/api/dashboard | jq '.data.totalProducts'  # Should be 25
curl http://localhost:3001/api/trends | jq '.data.trendRows | length' # Should be 30+
curl http://localhost:3001/api/brands | jq '.data.brandRows | length' # Should be 15+
```

- [ ] All 4 API endpoints return data successfully

---

## Real Data Launch (Tomorrow)

### Python Setup (10 min)
```bash
cd scraper
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m playwright install
```
- [ ] Python venv created and activated
- [ ] All dependencies installed
- [ ] Playwright browser installed

### Create scraper/.env (2 min)
```bash
cp .env.example .env  # In scraper/ folder
# OR manually create with credentials
```
- [ ] `scraper/.env` created
- [ ] Contains `SUPABASE_URL` and `SUPABASE_KEY`

### Test Scraper (5 min)
```bash
python scrape_products.py --source "Myntra" --category "Women Tops" --url "https://www.myntra.com/women-tops" --max-products 5
```
- [ ] Scraper runs without errors
- [ ] Logs show "Found X products"
- [ ] Check Supabase: `products` table now has 30 rows (25 old + 5 new)

### Test Trend Calculator (5 min)
```bash
python calculate_trends.py
```
- [ ] Calculator runs without errors
- [ ] Logs show trend analysis complete
- [ ] Check Supabase: `trend_snapshots` table now populated
- [ ] Dashboard `/trends` page shows real keywords

---

## Live Metrics

Once completed, you'll have:

| Metric | Target | Status |
|--------|--------|--------|
| Database Tables | 6 | ⏳ |
| Products Tracked | 25+ | ⏳ |
| Keywords Monitored | 30 | ⏳ |
| Dashboard Pages | 4 | ⏳ |
| API Endpoints | 4 | ⏳ |
| Data Refresh Rate | Daily | ⏳ |

---

## Integration with Deadstock Platform

After all checks pass, you can:

1. **Query trends from your marketplace backend**
   ```typescript
   const trends = await supabase.from('trend_snapshots').select('*')
     .eq('status', 'Rising')
     .order('growth_percentage', { ascending: false });
   ```

2. **Show trending badges on listings**
   ```
   Product: "Linen deadstock"
   Badge: "Linen RISING 🔥 (+45% this week)"
   ```

3. **Alert sellers about trending fabrics**
   ```
   Email: "Cargo is trending! List now while demand is high"
   ```

4. **Prioritize buying recommendations**
   ```
   Recommendation: "Buy these 5 linen deadstocks—trending categories"
   ```

---

## Support

- **Documentation**: See `SETUP.md` for detailed guide
- **Quick Reference**: See `FOUNDATION.md` for schema and API docs
- **Troubleshooting**: See SETUP.md → "Troubleshooting" section

Mark items as complete and you'll have a fully operational trend intelligence platform powering your Deadstock Exchange! 🚀
