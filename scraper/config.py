from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class SelectorTemplate:
    """Template selectors for a source.

    These are intentionally broad because ecommerce DOMs change often.
    Update them when a source changes markup.
    """

    card_selectors: tuple[str, ...]
    title_selectors: tuple[str, ...]
    brand_selectors: tuple[str, ...]
    price_selectors: tuple[str, ...]
    original_price_selectors: tuple[str, ...]
    discount_selectors: tuple[str, ...]
    image_selectors: tuple[str, ...]
    link_selectors: tuple[str, ...]


DEFAULT_TEMPLATE = SelectorTemplate(
    card_selectors=(
        "[data-testid*='product']",
        "[data-test*='product']",
        "li",
        "article",
        "div.product",
    ),
    title_selectors=("h1", "h2", "h3", "[data-testid*='title']", ".title", ".product-title"),
    brand_selectors=(".brand", ".product-brand", "[data-testid*='brand']", "[data-test*='brand']"),
    price_selectors=(".price", ".product-price", "[data-testid*='price']", "[data-test*='price']"),
    original_price_selectors=(
        ".original-price",
        ".strike-price",
        ".mrp",
        "[data-testid*='mrp']",
        "[data-test*='mrp']",
    ),
    discount_selectors=(".discount", ".offer", "[data-testid*='discount']", "[data-test*='discount']"),
    image_selectors=("img",),
    link_selectors=("a[href]",),
)

SOURCE_TEMPLATES: dict[str, SelectorTemplate] = {
    # Update these selectors when the site changes. They are best-effort templates, not guarantees.
    "myntra": SelectorTemplate(
        card_selectors=("[data-test='product-base']", "li.product-base", "div.product-base"),
        title_selectors=(".product-product", "[data-test='product-title']", "h3"),
        brand_selectors=(".product-brand", "[data-test='brand-name']", "h4"),
        price_selectors=(".product-discountedPrice", ".product-price", "[data-test='price']"),
        original_price_selectors=(".product-strike", ".original-price", "[data-test='mrp']"),
        discount_selectors=(".product-discountPercentage", ".discount", "[data-test='discount']"),
        image_selectors=("img",),
        link_selectors=("a[href]",),
    ),
    "ajio": SelectorTemplate(
        card_selectors=(".item", ".product-item", "li"),
        title_selectors=(".nameCls", ".product-title", "h3"),
        brand_selectors=(".brand", ".product-brand", "h4"),
        price_selectors=(".price", ".product-price"),
        original_price_selectors=(".orginal-price", ".mrp", ".strike-price"),
        discount_selectors=(".discount", ".off", ".offer"),
        image_selectors=("img",),
        link_selectors=("a[href]",),
    ),
    "zara india": SelectorTemplate(
        card_selectors=("li.product-grid-product", "article", "li"),
        title_selectors=(".product-title", ".name", "h3"),
        brand_selectors=(".product-brand", ".brand", "h4"),
        price_selectors=(".price-current", ".price", "[data-test*='price']"),
        original_price_selectors=(".price-old", ".old-price", ".strike-price"),
        discount_selectors=(".discount", ".offer"),
        image_selectors=("img",),
        link_selectors=("a[href]",),
    ),
    "h&m india": SelectorTemplate(
        card_selectors=("article", "li.product-item", "li"),
        title_selectors=(".item-heading", ".product-title", "h3"),
        brand_selectors=(".brand", ".product-brand"),
        price_selectors=(".price", ".product-price"),
        original_price_selectors=(".old-price", ".strike-price", ".price-old"),
        discount_selectors=(".discount", ".price-drop"),
        image_selectors=("img",),
        link_selectors=("a[href]",),
    ),
    "nykaa fashion": SelectorTemplate(
        card_selectors=(".productCard", ".product-card", "article", "li"),
        title_selectors=(".productCard__title", ".title", "h3"),
        brand_selectors=(".productCard__brand", ".brand", "h4"),
        price_selectors=(".productCard__price", ".price", ".product-price"),
        original_price_selectors=(".productCard__mrp", ".mrp", ".strike-price"),
        discount_selectors=(".productCard__discount", ".discount"),
        image_selectors=("img",),
        link_selectors=("a[href]",),
    ),
    "flipkart": SelectorTemplate(
        card_selectors=("div[data-id]", "div._1AtVbE", "div.tUxRFH"),
        title_selectors=("a[title]", ".s1Q9rs", "._4rR01T", "a"),
        brand_selectors=(".s1Q9rs", "._2WkVRV", "a[title]"),
        price_selectors=("._30jeq3", "div.Nx9bqj", "._1_WHN1"),
        original_price_selectors=("._3I9_wc", "._3auQ3N", "._2p6lqe"),
        discount_selectors=("._3Ay6Sb span", "._23col5", "span.W_xCGt"),
        image_selectors=("img._396cs4", "img._2r_T1I", "img"),
        link_selectors=("a[href*='/p/']",),
    ),
}

COLOR_KEYWORDS = {
    # Neutrals
    "black": "Black",
    "white": "White",
    "grey": "Grey",
    "gray": "Grey",
    "beige": "Beige",
    "brown": "Brown",
    "cream": "Cream",
    "ivory": "Ivory",
    "off white": "Off White",
    "off-white": "Off White",
    "ecru": "Cream",
    "sand": "Sand",
    "stone": "Stone",
    "taupe": "Taupe",
    "camel": "Camel",
    "tan": "Tan",
    "charcoal": "Charcoal",
    # Blues
    "blue": "Blue",
    "navy": "Navy",
    "cobalt": "Cobalt Blue",
    "teal": "Teal",
    "turquoise": "Turquoise",
    "aqua": "Aqua",
    "indigo": "Indigo",
    "denim": "Denim Blue",
    "sky blue": "Sky Blue",
    "royal blue": "Royal Blue",
    "powder blue": "Powder Blue",
    "ice blue": "Ice Blue",
    "steel blue": "Steel Blue",
    # Greens
    "green": "Green",
    "olive": "Olive",
    "khaki": "Khaki",
    "sage": "Sage",
    "mint": "Mint",
    "forest": "Forest Green",
    "bottle green": "Bottle Green",
    "lime": "Lime",
    "emerald": "Emerald",
    "army": "Army Green",
    "pista": "Pista",
    "moss": "Moss Green",
    "hunter green": "Hunter Green",
    "jade": "Jade",
    # Reds & Pinks
    "red": "Red",
    "pink": "Pink",
    "maroon": "Maroon",
    "burgundy": "Burgundy",
    "wine": "Wine",
    "rust": "Rust",
    "coral": "Coral",
    "salmon": "Salmon",
    "blush": "Blush",
    "rose": "Rose",
    "fuchsia": "Fuchsia",
    "magenta": "Magenta",
    "cherry": "Cherry",
    "crimson": "Crimson",
    "raspberry": "Raspberry",
    "brick": "Brick Red",
    "tomato": "Tomato Red",
    "candy": "Candy Pink",
    # Yellows & Oranges
    "yellow": "Yellow",
    "orange": "Orange",
    "mustard": "Mustard",
    "gold": "Gold",
    "amber": "Amber",
    "peach": "Peach",
    "apricot": "Apricot",
    "lemon": "Lemon",
    "saffron": "Saffron",
    "copper": "Copper",
    "marigold": "Marigold",
    "mango": "Mango",
    # Purples
    "purple": "Purple",
    "lavender": "Lavender",
    "violet": "Violet",
    "lilac": "Lilac",
    "mauve": "Mauve",
    "plum": "Plum",
    "grape": "Grape",
    # Patterns (treated as color category)
    "multi": "Multicolor",
    "multicolor": "Multicolor",
    "printed": "Printed",
    "tie dye": "Tie Dye",
    "tie-dye": "Tie Dye",
    "camouflage": "Camouflage",
    "camo": "Camouflage",
    "stripe": "Striped",
    "check": "Checked",
    "floral": "Floral",
    # Metals
    "silver": "Silver",
    "chrome": "Silver",
    "rose gold": "Rose Gold",
}

