#!/usr/bin/env python3
"""
Generate and cache all story editorials to Supabase.
Run once, covers 12 featured stories forever.
"""

import os
import sys
import time
import json
import requests
from datetime import datetime

# Story slugs to generate
STORY_SLUGS = [
    'pochampally-weavers',
    'zardozi-gold-threads',
    'gen-z-saree',
    'boro-patching',
    'harajuku-today',
    'hanbok-modern',
    'seoul-streetwear',
    'italian-tailoring',
    'french-effortless',
    'ankara-global',
    'brazil-beach-fashion',
    'savile-row-future',
]

SLUG_CONTENT = {
    'pochampally-weavers':  { 'topic': 'Pochampally ikat weaving', 'region': 'Telangana, India', 'angle': 'The ancient ikat tradition of Pochampally and the weavers keeping it alive today' },
    'zardozi-gold-threads': { 'topic': 'Zardozi embroidery', 'region': 'Lucknow, India', 'angle': 'How Mughal-era gold thread embroidery survived centuries and still defines Indian luxury fashion' },
    'gen-z-saree':          { 'topic': 'Gen Z and the modern saree', 'region': 'Mumbai, India', 'angle': 'How young Indians are rewearing and reimagining the saree as a contemporary fashion statement' },
    'boro-patching':        { 'topic': 'Boro Japanese textile art', 'region': 'Tokyo, Japan', 'angle': 'How the Japanese art of boro — patching worn cloth — became a philosophy and a global aesthetic' },
    'harajuku-today':       { 'topic': 'Harajuku street fashion 2025', 'region': 'Tokyo, Japan', 'angle': 'Harajuku street style in 2025 — still rebellious, still weird, still completely itself' },
    'hanbok-modern':        { 'topic': 'Hanbok in global fashion', 'region': 'Seoul, Korea', 'angle': 'How the hanbok travelled from Korean heritage to global runways and K-drama wardrobes' },
    'seoul-streetwear':     { 'topic': 'Seoul streetwear scene', 'region': 'Seoul, Korea', 'angle': "Why Seoul's streetwear culture — from Hongdae to Ader Error — is setting the global agenda" },
    'italian-tailoring':    { 'topic': 'Neapolitan bespoke tailoring', 'region': 'Naples, Italy', 'angle': 'The Naples suit — soft shoulders, unlined jackets, a living craft passed down through families' },
    'french-effortless':    { 'topic': 'French Parisian style', 'region': 'Paris, France', 'angle': "The myth and the reality of effortless French style — what it actually takes to look like you're not trying" },
    'ankara-global':        { 'topic': 'Ankara wax print fashion', 'region': 'Lagos, Nigeria', 'angle': "Ankara isn't a trend. It's a language — how West African wax print fabric carries identity across the world" },
    'brazil-beach-fashion': { 'topic': 'Brazilian fashion evolution', 'region': 'São Paulo, Brazil', 'angle': 'From Copacabana to couture — how Brazil built a fashion identity that is bold, colourful, and entirely its own' },
    'savile-row-future':    { 'topic': 'Savile Row bespoke tailoring', 'region': 'London, UK', 'angle': 'Savile Row at a crossroads — can the home of British bespoke survive fast fashion, casualisation, and changing tastes?' },
}

def ensure_tables_exist(client):
    """Ensure tables exist by checking, creating if needed."""
    try:
        # Try a simple query to check if table exists
        client.table('story_editorials').select('slug').limit(1).execute()
        print("✅ story_editorials table exists")
        return True
    except Exception as e:
        print(f"❌ story_editorials table does not exist or is not accessible: {e}")
        print("Apply database/006_content_cache.sql in the Supabase SQL Editor, then rerun this script.")
        return False

def call_gemini(prompt: str) -> str:
    """Call Gemini API to generate content."""
    api_key = os.getenv('GEMINI_API_KEY')
    if not api_key:
        print("❌ GEMINI_API_KEY not set")
        sys.exit(1)
    
    url = f'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}'
    
    try:
        response = requests.post(
            url,
            json={
                'contents': [{'parts': [{'text': prompt}]}],
                'generationConfig': {'temperature': 0.8}
            },
            headers={'Content-Type': 'application/json'},
            timeout=30
        )
        if not response.ok:
            print(f"Gemini error: {response.status_code} {response.text}")
            return ''
        response.raise_for_status()
        data = response.json()
        return data.get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0].get('text', '')
    except Exception as e:
        print(f"❌ Gemini API error: {e}")
        return ''

def generate_editorial(slug: str) -> str:
    """Generate editorial for a story slug."""
    content = SLUG_CONTENT.get(slug)
    if not content:
        print(f"⚠️  Unknown slug: {slug}")
        return ''
    
    prompt = f"""You are a senior fashion editor writing for Vogue or Monocle.

Write a compelling editorial piece about: {content['angle']}
Region: {content['region']}
Topic: {content['topic']}

Open with a strong hook — a scene, a detail, a striking observation. Weave history, culture, and contemporary relevance. Write with warmth and authority. No bullet points, no headers, just flowing prose.
Under 450 words."""
    
    return call_gemini(prompt)

def save_to_supabase(client, slug: str, editorial: str) -> bool:
    """Save editorial to Supabase."""
    try:
        result = client.table('story_editorials').upsert({
            'slug': slug,
            'content': editorial,
            'generated_at': datetime.utcnow().isoformat()
        }).execute()
        
        return bool(result.data)
    except Exception as e:
        print(f"❌ Supabase error for {slug}: {e}")
        return False

def main():
    """Generate and cache all story editorials."""
    from supabase import create_client
    
    print("🎬 Starting story editorial generation...")
    print(f"📦 Will generate {len(STORY_SLUGS)} editorials\n")
    
    url = os.getenv('NEXT_PUBLIC_SUPABASE_URL')
    key = os.getenv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
    
    if not url or not key:
        print("❌ Supabase credentials not set (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)")
        sys.exit(1)
    
    client = create_client(url, key)
    if not ensure_tables_exist(client):
        return 1
    
    success_count = 0
    
    for i, slug in enumerate(STORY_SLUGS, 1):
        print(f"[{i}/{len(STORY_SLUGS)}] Generating: {slug}...")
        
        # Generate editorial
        editorial = generate_editorial(slug)
        if not editorial:
            print(f"  ❌ Failed to generate editorial")
            time.sleep(5)
            continue
        
        # Save to Supabase
        if save_to_supabase(client, slug, editorial):
            print(f"  ✅ Saved ({len(editorial)} chars)")
            success_count += 1
        else:
            print(f"  ❌ Failed to save")
        
        # Rate limit: 5 seconds between API calls
        if i < len(STORY_SLUGS):
            print("  ⏳ Waiting 5 seconds...\n")
            time.sleep(5)
    
    print(f"\n✨ Done! Generated {success_count}/{len(STORY_SLUGS)} editorials")
    return 0 if success_count == len(STORY_SLUGS) else 1

if __name__ == '__main__':
    sys.exit(main())
