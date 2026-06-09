#!/usr/bin/env python3
"""Delete all products from Supabase to start fresh."""

import os
import sys
sys.path.insert(0, '/Users/aishu/Downloads/fashiontrend-main')

# Import after adding to path
from supabase import create_client, Client

SUPABASE_URL = "https://ikvmbvmkpdeuuxydojpv.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlrdm1idm1rcGRldXV4eWRvanB2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mjk1ODc3OTgsImV4cCI6MTc0NzE2Mzc5OH0.4j_IG_7FZcKj2-Wv0pR_F2HkQc01rNtNZ8YXWxL8FNQ"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Get count before
response = supabase.table("products").select("*", count="exact").execute()
count_before = response.count if hasattr(response, 'count') else len(response.data)
print(f"📦 Products before deletion: {count_before}")

if count_before > 0:
    # Delete all products
    result = supabase.table("products").delete().neq("id", -1).execute()
    print(f"✅ Deleted all products")

# Verify deletion
response = supabase.table("products").select("*", count="exact").execute()
count_after = response.count if hasattr(response, 'count') else len(response.data)
print(f"✅ Products after deletion: {count_after}")
