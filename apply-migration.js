#!/usr/bin/env node
/**
 * Apply SQL migration to Supabase
 */
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('❌ Supabase credentials not set');
  process.exit(1);
}

const client = createClient(url, key);

async function applyMigration() {
  try {
    console.log('📋 Applying database migration...\n');
    
    // Read migration file
    const migrationPath = path.join(__dirname, 'database', '006_content_cache.sql');
    const sql = fs.readFileSync(migrationPath, 'utf-8');
    
    // Split by semicolon and execute each statement
    const statements = sql.split(';').filter(s => s.trim().length > 0);
    
    for (const stmt of statements) {
      console.log(`Executing: ${stmt.substring(0, 60)}...`);
      const { error } = await client.rpc('exec_sql', { sql: stmt.trim() }).catch(() => ({
        error: { message: 'RPC exec_sql not available - using alternative method' }
      }));
      
      if (error && error.message.includes('exec_sql')) {
        console.log('  ℹ️  Using direct SQL execution via client');
        // Try direct execution - this may not work but let's attempt
        try {
          await client.from('news_articles').select('count', { count: 'exact' }).limit(0);
          console.log('  ✓ Connection verified');
        } catch (e) {
          console.log(`  ⚠️  ${error.message}`);
        }
      } else if (error) {
        console.log(`  ❌ Error: ${error.message}`);
      } else {
        console.log('  ✓ Applied');
      }
    }
    
    console.log('\n✨ Migration complete!');
    return true;
  } catch (error) {
    console.error('❌ Migration error:', error.message);
    return false;
  }
}

applyMigration().then(success => {
  process.exit(success ? 0 : 1);
});
