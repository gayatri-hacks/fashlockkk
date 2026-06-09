from __future__ import annotations
import os, time, logging
from pathlib import Path
import requests
from PIL import Image
from io import BytesIO
import torch
from transformers import CLIPModel, CLIPProcessor
from supabase import create_client
from dotenv import load_dotenv

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("clip-embeddings")

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
BATCH_SIZE = 32

def get_supabase():
    load_dotenv(PROJECT_ROOT / ".env")
    load_dotenv(SCRIPT_DIR / ".env", override=True)
    url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")
    return create_client(url, key)

def fetch_image(url: str) -> Image.Image | None:
    try:
        resp = requests.get(url, timeout=10, headers={"User-Agent": "Mozilla/5.0"})
        if resp.status_code == 200:
            return Image.open(BytesIO(resp.content)).convert("RGB")
    except Exception as e:
        logger.warning("Failed to fetch %s: %s", url, e)
    return None

def main():
    client = get_supabase()

    # Load CLIP — downloads ~600MB once, cached after
    logger.info("Loading CLIP model...")
    model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32")
    processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")
    model.eval()

    # Fetch only products without embeddings yet — paginated
    all_products = []
    offset = 0
    page_size = 1000

    while True:
        result = client.table("products")\
            .select("id, image_url")\
            .is_("embedding", "null")\
            .not_.like("image_url", "%placeholder%")\
            .range(offset, offset + page_size - 1)\
            .execute()

        batch = result.data or []
        if not batch:
            break
        all_products.extend(batch)
        offset += page_size
        logger.info("Fetched %d products so far...", len(all_products))

    products = all_products
    logger.info("Found %d products without embeddings", len(products))

    success, failed = 0, 0

    for i in range(0, len(products), BATCH_SIZE):
        batch = products[i:i + BATCH_SIZE]
        images, valid_ids = [], []

        for p in batch:
            img = fetch_image(p["image_url"])
            if img:
                images.append(img)
                valid_ids.append(p["id"])
            else:
                failed += 1

        if not images:
            continue

        with torch.no_grad():
            inputs = processor(images=images, return_tensors="pt", padding=True)
            outputs = model.get_image_features(**inputs)
            # Fix 2: extract tensor from output object
            if isinstance(outputs, torch.Tensor):
                embeddings = outputs
            elif hasattr(outputs, 'image_embeds'):
                embeddings = outputs.image_embeds
            elif hasattr(outputs, 'pooler_output'):
                embeddings = outputs.pooler_output
            else:
                # Last resort: try to get first tensor attribute
                embeddings = outputs[0] if isinstance(outputs, (tuple, list)) else outputs
            # Normalize to unit vectors
            embeddings = embeddings / embeddings.norm(dim=-1, keepdim=True)
            embeddings = embeddings.cpu().numpy().tolist()

        for pid, embedding in zip(valid_ids, embeddings):
            try:
                client.table("products")\
                    .update({"embedding": embedding})\
                    .eq("id", pid)\
                    .execute()
                success += 1
            except Exception as e:
                logger.error("Failed to save embedding for product %d: %s", pid, e)
                failed += 1

        logger.info("Progress: %d/%d (✓%d ✗%d)",
                    min(i + BATCH_SIZE, len(products)), len(products), success, failed)
        time.sleep(0.1)

    logger.info("Done. Success: %d, Failed: %d", success, failed)

if __name__ == "__main__":
    main()