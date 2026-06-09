#!/bin/bash

# Fashion Trend Intelligence - Data Foundation Setup
# This script automates the database initialization

set -e

echo "🚀 Fashion Trend Intelligence - Data Foundation Setup"
echo "=================================================="
echo ""

# Check if .env.local exists
if [ ! -f ".env.local" ]; then
    echo "❌ .env.local not found!"
    echo "📝 Creating .env.local from .env.example..."
    cp .env.example .env.local
    echo "✅ .env.local created. Please verify credentials."
    exit 1
fi

echo "✅ .env.local found"
echo ""

# Extract credentials
export $(cat .env.local | xargs)

echo "🔐 Verifying Supabase connection..."
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/")
if [ "$RESPONSE" = "200" ] || [ "$RESPONSE" = "404" ]; then
    echo "✅ Supabase is reachable"
else
    echo "❌ Cannot reach Supabase. Check your URL."
    exit 1
fi

echo ""
echo "📊 Next steps to initialize database:"
echo ""
echo "1. Open Supabase Dashboard:"
echo "   https://app.supabase.com"
echo ""
echo "2. Go to SQL Editor"
echo ""
echo "3. Run these files in order:"
echo "   • database/001_schema.sql"
echo "   • database/002_seed_trend_keywords.sql" 
echo "   • database/003_seed_categories.sql"
echo ""
echo "4. Then run:"
./scripts/init-db.sh 2>/dev/null || echo "   npm run dev"
echo ""
echo "✨ After database is ready, your dashboard will show real data!"
