#!/bin/bash
SCRAPER_DIR="/Users/aishu/Downloads/fashiontrend-main/scraper"
PYTHON="/Users/aishu/Downloads/fashiontrend-main/.venv/bin/python3"
LOG_DIR="$SCRAPER_DIR/logs"
LOG_FILE="$LOG_DIR/weekly_$(date +%Y-%m-%d).log"

mkdir -p "$LOG_DIR"

echo "========================================" >> "$LOG_FILE"
echo "Weekly scrape started: $(date)" >> "$LOG_FILE"
echo "========================================" >> "$LOG_FILE"

cd "$SCRAPER_DIR"

brands=(
  "Snitch|Men T-Shirts|https://www.snitch.co.in"
  "Urban Monkey|Men T-Shirts|https://www.urbanmonkey.com"
  "Freakins|Men T-Shirts|https://www.freakins.com"
  "Fugazee|Men T-Shirts|https://www.fugazee.com"
  "WTF Wardrobe|Men T-Shirts|https://www.wtfwardrobe.com"
  "Powerlook|Men T-Shirts|https://www.powerlook.in"
  "Veirdo|Men T-Shirts|https://www.veirdo.in"
  "Nobero|Men T-Shirts|https://www.nobero.com"
  "Fashor|Women Ethnic Wear|https://www.fashor.com"
  "Jaywalking|Men Streetwear|https://www.jaywalking.in"
  "Bonkers Corner|Men Streetwear|https://www.bonkerscorner.com"
  "Nicobar|Quiet Luxury|https://www.nicobar.com"
)

for entry in "${brands[@]}"; do
  IFS='|' read -r source category url <<< "$entry"
  echo "Scraping: $source" >> "$LOG_FILE"
  "$PYTHON" scrape_shopify.py --source "$source" --category "$category" --url "$url" >> "$LOG_FILE" 2>&1
  echo "Done: $source" >> "$LOG_FILE"
  sleep 2
done

echo "Waiting 60s before Google Trends..." >> "$LOG_FILE"
sleep 60

echo "Running calculate_trends.py..." >> "$LOG_FILE"
"$PYTHON" calculate_trends.py >> "$LOG_FILE" 2>&1

echo "========================================" >> "$LOG_FILE"
echo "Weekly scrape finished: $(date)" >> "$LOG_FILE"
echo "========================================" >> "$LOG_FILE"
# Added May 15
# Jaywalking, Bonkers Corner, Nicobar added above the calculate_trends line
