#!/bin/bash

# Activate venv
source .venv/bin/activate

# Define all 30 scrapes (source, category, url)
SCRAPES=(
    # Myntra (6 scrapes)
    "Myntra|Women Tops|https://www.myntra.com/women-tops"
    "Myntra|Women Bottomwear|https://www.myntra.com/women-bottomwear"
    "Myntra|Men Shirts|https://www.myntra.com/men-shirts"
    "Myntra|Dresses|https://www.myntra.com/women-dresses"
    "Myntra|Outerwear|https://www.myntra.com/outerwear"
    "Myntra|Accessories|https://www.myntra.com/accessories"
    
    # Ajio (6 scrapes)
    "Ajio|Women Tops|https://www.ajio.com/c/women-topwear-0-new"
    "Ajio|Women Bottomwear|https://www.ajio.com/c/women-bottomwear-0-new"
    "Ajio|Men Shirts|https://www.ajio.com/c/men-shirts-0-new"
    "Ajio|Dresses|https://www.ajio.com/c/women-dresses-0-new"
    "Ajio|Outerwear|https://www.ajio.com/c/women-winterwear-0-new"
    "Ajio|Accessories|https://www.ajio.com/c/accessories-0-new"
    
    # Zara India (6 scrapes)
    "Zara India|Women Tops|https://www.zara.com/in/en/women-tops-aw22-l1186.html"
    "Zara India|Women Bottomwear|https://www.zara.com/in/en/women-bottoms-aw22-l1187.html"
    "Zara India|Men Shirts|https://www.zara.com/in/en/men-shirts-aw22-l1195.html"
    "Zara India|Dresses|https://www.zara.com/in/en/women-dresses-aw22-l1183.html"
    "Zara India|Outerwear|https://www.zara.com/in/en/woman-jackets-blazers-aw22-l1184.html"
    "Zara India|Accessories|https://www.zara.com/in/en/accessories-aw22-l1198.html"
    
    # H&M India (6 scrapes)
    "H&M India|Women Tops|https://www2.hm.com/en_in/women/products/tops.html"
    "H&M India|Women Bottomwear|https://www2.hm.com/en_in/women/products/bottoms.html"
    "H&M India|Men Shirts|https://www2.hm.com/en_in/men/products/shirts.html"
    "H&M India|Dresses|https://www2.hm.com/en_in/women/products/dresses-jumpsuits.html"
    "H&M India|Outerwear|https://www2.hm.com/en_in/women/products/jackets-coats.html"
    "H&M India|Accessories|https://www2.hm.com/en_in/women/products/accessories.html"
    
    # Nykaa Fashion (6 scrapes)
    "Nykaa Fashion|Women Tops|https://www.nykaafashion.com/women-tops/c/3370"
    "Nykaa Fashion|Women Bottomwear|https://www.nykaafashion.com/women-bottomwear/c/3371"
    "Nykaa Fashion|Men Shirts|https://www.nykaafashion.com/men-shirts/c/3385"
    "Nykaa Fashion|Dresses|https://www.nykaafashion.com/women-dresses/c/3369"
    "Nykaa Fashion|Outerwear|https://www.nykaafashion.com/women-jackets/c/3395"
    "Nykaa Fashion|Accessories|https://www.nykaafashion.com/women-accessories/c/3372"
)

TOTAL=${#SCRAPES[@]}
SUCCESS=0
FAILED=0
CURRENT=1

echo "=========================================="
echo "FASHION TREND ENTERPRISE SCRAPER"
echo "Target: $TOTAL scrapes (5 sources × 6 categories)"
echo "=========================================="
echo ""

for scrape in "${SCRAPES[@]}"; do
    IFS='|' read -r source category url <<< "$scrape"
    
    TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$TIMESTAMP] [$CURRENT/$TOTAL] Scraping: $source - $category"
    echo "   URL: $url"
    
    if python scrape_products.py --source "$source" --category "$category" --url "$url" 2>&1 | tee -a scrape_log.txt | grep -q "Saved.*products"; then
        SUCCESS=$((SUCCESS + 1))
        echo "   ✅ SUCCESS"
    else
        FAILED=$((FAILED + 1))
        echo "   ❌ FAILED"
    fi
    
    CURRENT=$((CURRENT + 1))
    echo ""
    
    # Small delay between requests
    sleep 3
done

echo "=========================================="
echo "BATCH SCRAPE COMPLETE"
echo "Total: $TOTAL | Success: $SUCCESS | Failed: $FAILED"
echo "=========================================="
