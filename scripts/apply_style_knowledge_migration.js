#!/usr/bin/env node

const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\n/)) {
    const match = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

loadEnvFile(path.join(__dirname, "..", ".env.local"));
loadEnvFile(path.join(__dirname, "..", ".env"));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("Supabase credentials not set");
  process.exit(1);
}

const client = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function splitSql(sql) {
  return sql
    .split(/;\s*\n/)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function main() {
  const migrationFile = process.argv[2] || "011_style_knowledge.sql";
  const migrationPath = path.join(__dirname, "..", "database", migrationFile);
  const sql = fs.readFileSync(migrationPath, "utf8");
  const statements = splitSql(sql);

  for (const statement of statements) {
    const { error } = await client.rpc("exec_sql", { sql: statement.endsWith(";") ? statement : `${statement};` });
    if (error) {
      console.error("Could not apply statement through exec_sql:", error.message);
      console.error(`Apply database/${migrationFile} in the Supabase SQL editor, then rerun this script if needed.`);
      process.exit(1);
    }
  }

  console.log(`Applied ${statements.length} statements from ${migrationFile}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
