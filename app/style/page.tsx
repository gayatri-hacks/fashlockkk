"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Brain, Camera, Heart, Paperclip, Send, X } from "lucide-react";
import { Cormorant_Garamond, DM_Sans } from "next/font/google";
import {
  buildAskLailaPromptForVariation,
  buildShopTermsForVariation,
  flattenStyleIdeasToLooks,
  rankStyleIdeas,
  type LookLibraryItem,
  type LookVariation as StyleIdeaVariation,
  type StyleIdea,
} from "@/lib/look-library";
import { buildLailaPersonalisationPrompt, readLailaTrendContext } from "@/lib/trend-styling/laila-handoff";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-style-sans",
  weight: ["200", "300", "400"],
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-style-display",
  weight: ["300", "400"],
  style: ["normal", "italic"],
});

type Gender = "female" | "male";
type ChatRole = "user" | "assistant";

type StyleResponse = {
  response: string;
  hasOutfitDirections: boolean;
  outfitDirections: Array<{ occasion: string; direction: string }>;
  generatedOutfitImages?: ChatOutfitImage[];
  trendKeywords: string[];
  shopTerms: string[];
  followUpSuggestions: string[];
};

type ChatOutfitImage = {
  occasion: string;
  direction: string;
  imagePath: string;
};

type Message = {
  id: string;
  role: ChatRole;
  content: string;
  structured?: StyleResponse;
  shoppingRequested?: boolean;
};

type StyleProfile = {
  session_id?: string;
  gender?: "female" | "male" | "both" | string | null;
  body_type?: string | null;
  skin_tone?: string | null;
  skin_undertone?: string | null;
  vibe?: string | null;
  colours_that_glow?: string[] | null;
  colours_to_avoid?: string[] | null;
  camilles_take?: string | null;
  current_outfit_read?: string | null;
  lifestyle?: string[] | null;
  style_personality?: string[] | null;
  colour_palette?: string[] | null;
  budget_range?: string | null;
  avoids?: string[] | null;
  favourite_pieces?: string | null;
  onboarding_complete?: boolean | null;
};

type ProductCard = {
  title: string;
  price: string;
  imageUrl: string;
  link: string;
  source: string;
};

type ProductCategory = "ethnic" | "western" | "activewear" | "premium" | "street";
type StyleFlowState = "upload" | "analysing" | "result" | "chat";

type VibeAnalysis = {
  vibe: string;
  skinTone: string;
  bodyType: string;
  coloursThatWillGlow?: string[];
  coloursToAvoid?: string[];
  currentlyWearing: string;
  currentOutfitRead?: string;
  whatIsWorking: string;
  theUpgrade: string;
  outfitDirections: Array<{ occasion: string; direction: string; why?: string }>;
  shopTerms: string[];
  stylePersonality: string;
  camillesTake?: string;
};

type ProductGroup = {
  term: string;
  products: ProductCard[];
};

type StyledPieceResult = {
  piece_description: string;
  outfits: Array<{ occasion: string; outfit: string; tip: string }>;
};

type StyleBriefTrend = {
  keyword: string;
  trendName: string;
  recommendation: string;
  identityNote: string;
  shoppingFocus: string;
  reason: string;
  styleNote: string;
  confidenceLevel: "HIGH" | "MEDIUM" | "WATCH";
  shopTerms: string[];
  formulas: Array<{ title: string; direction: string }>;
};

type StyleBrief = {
  season: string;
  year: number;
  gender?: string;
  profileSignals: string[];
  trends: StyleBriefTrend[];
  dailyEdit: Array<{ title: string; note: string; searchTerm: string }>;
  howToWear: Array<{ trendName: string; directions: Array<{ title: string; direction: string }> }>;
  shopLookTerms: string[];
};

type ResearchSourceSignal = {
  title: string;
  url: string;
  source: string;
  snippet: string;
};

type ResearchVariation = {
  title: string;
  formula: string;
  pieces: string[];
  stylingNote: string;
  whyItWorks: string;
  occasion: string;
  aesthetic: string;
  shopTerms: string[];
  sourceSignals: ResearchSourceSignal[];
};

type StyleResearchResult = {
  query: string;
  title: string;
  summary: string;
  variations: ResearchVariation[];
  cached?: boolean;
};

const LOOKBOOK_FILTERS = ["All", "Tops", "Bottoms", "Layering", "Dresses", "Materials", "Colours", "Aesthetics", "Celebrity", "Occasion", "Work", "College"];
const STYLE_RESEARCH_EXAMPLES = ["asymmetrical skirts", "capri pants", "scarf tops", "polka dot dresses", "satin halters"];

const lookHoverVariants = {
  rest: { y: "100%" },
  hover: { y: "0%" },
};

const lookHoverTransition = { duration: 0.3, ease: "easeOut" as const };

function getSessionId() {
  if (typeof window === "undefined") return "";
  const existing = window.localStorage.getItem("fashlock_session_id");
  if (existing) return existing;
  const legacy = window.localStorage.getItem("fashlock_style_session_id");
  if (legacy) {
    window.localStorage.setItem("fashlock_session_id", legacy);
    return legacy;
  }
  const id = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  window.localStorage.setItem("fashlock_session_id", id);
  return id;
}

async function compressPhotoForStorage(dataUrl: string, mimeType: string) {
  if (typeof window === "undefined") return dataUrl;
  if (dataUrl.length <= 2 * 1024 * 1024) return dataUrl;

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });

  const canvas = document.createElement("canvas");
  const maxSide = 1100;
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d");
  if (!context) return dataUrl;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  let quality = 0.82;
  let compressed = canvas.toDataURL(mimeType === "image/png" ? "image/jpeg" : mimeType, quality);
  while (compressed.length > 2 * 1024 * 1024 && quality > 0.45) {
    quality -= 0.08;
    compressed = canvas.toDataURL("image/jpeg", quality);
  }
  return compressed.length <= 2 * 1024 * 1024 ? compressed : "";
}

function detectProductCategory(text: string): ProductCategory {
  const lower = text.toLowerCase();
  if (/\b(lehenga|saree|sari|kurta|salwar|anarkali|dupatta|ethnic|sherwani)\b/.test(lower)) return "ethnic";
  if (/\b(gym|workout|activewear|training|sports bra|leggings|joggers|running)\b/.test(lower)) return "activewear";
  if (/\b(luxury|designer|premium|cocktail|silk|cashmere|occasion)\b/.test(lower)) return "premium";
  if (/\b(streetwear|cargo|oversized|sneaker|hoodie)\b/.test(lower)) return "street";
  return "western";
}

function analysisFromProfile(profile: StyleProfile): VibeAnalysis {
  const stylePersonality = profile.style_personality?.[0] || "Personal style";
  return {
    vibe: profile.vibe || stylePersonality,
    skinTone: profile.skin_tone || "Not specified",
    bodyType: profile.body_type || "Not specified",
    coloursThatWillGlow: profile.colours_that_glow || [],
    coloursToAvoid: profile.colours_to_avoid || [],
    currentlyWearing: profile.current_outfit_read || "Saved style context",
    currentOutfitRead: profile.current_outfit_read || "",
    whatIsWorking: profile.camilles_take || "Your saved style profile is ready.",
    theUpgrade: "Ask what you are dressing for today and I will filter it through what I already know about you.",
    outfitDirections: [],
    shopTerms: [],
    stylePersonality,
    camillesTake: profile.camilles_take || "",
  };
}

function joinReadable(items?: Array<string | null | undefined> | null, fallback = "Not mapped yet") {
  const cleanItems = (items || []).map((item) => String(item || "").trim()).filter(Boolean);
  return cleanItems.length ? cleanItems.join(", ") : fallback;
}

function profileValue(profile: StyleProfile | null, analysis: VibeAnalysis | null, key: "vibe" | "style" | "body" | "colours" | "avoid") {
  if (key === "vibe") return analysis?.vibe || profile?.vibe || "";
  if (key === "style") return analysis?.stylePersonality || joinReadable(profile?.style_personality, "");
  if (key === "body") return analysis?.bodyType || profile?.body_type || "";
  if (key === "colours") return joinReadable(analysis?.coloursThatWillGlow || profile?.colours_that_glow || profile?.colour_palette, "");
  return joinReadable(analysis?.coloursToAvoid || profile?.colours_to_avoid || profile?.avoids, "");
}

function hasIdentityData(profile: StyleProfile | null, analysis: VibeAnalysis | null) {
  return Boolean(
    profileValue(profile, analysis, "vibe") ||
      profileValue(profile, analysis, "style") ||
      profileValue(profile, analysis, "body") ||
      profileValue(profile, analysis, "colours") ||
      profileValue(profile, analysis, "avoid"),
  );
}

function isShoppingMessage(message: string) {
  return /\b(shop|shopping|products?|buy|find me|show me products?|link|links|where to buy|shop this|shop the look)\b/i.test(message);
}

function personalRecommendationTitle(trend: StyleBriefTrend) {
  const value = `${trend.keyword} ${trend.trendName}`.toLowerCase();
  if (/\blinen|cotton|fabric|breathable\b/.test(value)) return "Build around breathable tailoring.";
  if (/\bcargo|utility\b/.test(value)) return "Choose utility, but keep it clean.";
  if (/\bmini|skirt|dress\b/.test(value)) return "Use a shorter hem with structure.";
  if (/\blayer|cardigan|overshirt\b/.test(value)) return "Layer lightly, not heavily.";
  if (/\bdenim|jean\b/.test(value)) return "Upgrade denim with sharper proportions.";
  return trend.shoppingFocus.replace(/\.$/, ".");
}

function skipNoteForTrend(trend: StyleBriefTrend, profile: StyleProfile | null, analysis: VibeAnalysis | null) {
  const avoid = profileValue(profile, analysis, "avoid");
  const body = profileValue(profile, analysis, "body") || "your proportions";
  const value = `${trend.keyword} ${trend.trendName}`.toLowerCase();
  if (avoid) return `Skip it if it repeats what you already avoid: ${avoid.toLowerCase()}.`;
  if (/\bcargo|utility\b/.test(value)) return `Skip bulky pockets or heavy hardware if they fight ${body.toLowerCase()}.`;
  if (/\bmini|skirt|dress\b/.test(value)) return "Skip clingy cuts; the polished version has shape and breathing room.";
  if (/\blinen\b/.test(value)) return "Skip sheer or crushed linen; it should look relaxed, not careless.";
  return "Skip it if the styling starts feeling louder than you.";
}

function lifestyleFormulas(profile: StyleProfile | null, analysis: VibeAnalysis | null, trends: StyleBriefTrend[]) {
  const vibe = profileValue(profile, analysis, "vibe") || "polished";
  const colours = profileValue(profile, analysis, "colours") || "your best colours";
  const body = profileValue(profile, analysis, "body") || "your proportions";
  const lead = trends[0]?.trendName.toLowerCase() || "clean tailoring";

  return [
    {
      title: "College day",
      direction: `A clean tee or shirt, straight bottoms, and one ${lead} cue. Keep ${colours.toLowerCase()} near your face so it still feels like you.`,
    },
    {
      title: "Casual polish",
      direction: `Soft top, relaxed tailoring, grounded flats or loafers. The mood is ${vibe.toLowerCase()}, but the fit should stay intentional.`,
    },
    {
      title: "Internship/work",
      direction: `Crisp layer, structured trouser, neat shoe. For ${body.toLowerCase()}, keep one defined line so the outfit has authority.`,
    },
    {
      title: "Evening",
      direction: `One dressier texture, calmer accessories, and a sharper neckline or waist moment. Let colour do the glow-up, not extra styling.`,
    },
    {
      title: "Occasion/festive",
      direction: `Use richer fabric and one statement detail, then keep the silhouette clean. It should feel elevated, not overloaded.`,
    },
  ];
}

function visualGradient(colours: string[]) {
  const palette = colours.length ? colours : ["#FAF7F4", "#EDE8DF", "#D4AF37"];
  const first = palette[0] || "#FAF7F4";
  const second = palette[1] || first;
  const third = palette[2] || second;
  return {
    background: `linear-gradient(135deg, ${first} 0%, ${second} 58%, ${third} 100%)`,
  };
}

function ProductSkeletonRow() {
  return (
    <div className="productRow">
      {Array.from({ length: 4 }).map((_, index) => (
        <div className="productSkeleton" key={index} />
      ))}
    </div>
  );
}

function StaticProductRow({
  products,
  term,
  onShopClick,
}: {
  products: ProductCard[];
  term: string;
  onShopClick: (url: string, term: string) => void;
}) {
  if (!products.length) return null;

  return (
    <div className="productRow">
      {products.map((product) => (
        <button
          className="productCard"
          key={`${product.link}-${product.title}`}
          onClick={() => {
            window.open(product.link, "_blank", "noopener,noreferrer");
            onShopClick(product.link, term);
          }}
          type="button"
        >
          <div className="productImage">
            <img src={product.imageUrl} alt={product.title} loading="lazy" />
          </div>
          <div className="productBody">
            <p className="productSource">{product.source}</p>
            <p className="productTitle">{product.title}</p>
            <p className="productPrice">{product.price}</p>
            <p className="productShop">Shop →</p>
          </div>
        </button>
      ))}
    </div>
  );
}

function ProductRow({
  direction,
  searchTerm,
  gender,
  onShopClick,
}: {
  direction: { occasion: string; direction: string };
  searchTerm?: string;
  gender: Gender;
  onShopClick: (url: string, term: string) => void;
}) {
  const [products, setProducts] = useState<ProductCard[]>([]);
  const [loading, setLoading] = useState(true);
  const searchQuery = searchTerm || direction.direction;

  useEffect(() => {
    let active = true;
    setLoading(true);

    fetch("/api/style/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        searchQuery,
        category: detectProductCategory(searchQuery),
        gender,
      }),
    })
      .then((response) => (response.ok ? response.json() : { products: [] }))
      .then((payload) => {
        if (active) setProducts(Array.isArray(payload.products) ? payload.products : []);
      })
      .catch((error) => {
        console.error("Style products fetch error:", error);
        if (active) setProducts([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [gender, searchQuery]);

  if (loading) return <ProductSkeletonRow />;
  if (!products.length) return null;

  return (
    <div className="productRow" aria-label={`Products for ${direction.occasion}`}>
      {products.map((product) => (
        <button
          className="productCard"
          key={`${product.link}-${product.title}`}
          onClick={() => {
            window.open(product.link, "_blank", "noopener,noreferrer");
            onShopClick(product.link, searchQuery);
          }}
          type="button"
        >
          <div className="productImage">
            <img src={product.imageUrl} alt={product.title} loading="lazy" />
          </div>
          <div className="productBody">
            <p className="productSource">{product.source}</p>
            <p className="productTitle">{product.title}</p>
            <p className="productPrice">{product.price}</p>
            <p className="productShop">Shop →</p>
          </div>
        </button>
      ))}
    </div>
  );
}

function ChatOutfitCard({
  outfit,
  gender,
  onShopClick,
  onMakeMine,
}: {
  outfit: ChatOutfitImage;
  gender: Gender;
  onShopClick: (url: string, term: string) => void;
  onMakeMine: (text: string) => void;
}) {
  const [products, setProducts] = useState<ProductCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [requested, setRequested] = useState(false);

  async function shopThisLook() {
    if (requested || loading) return;
    setRequested(true);
    setLoading(true);

    try {
      const response = await fetch("/api/style/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          searchQuery: outfit.direction,
          category: detectProductCategory(outfit.direction),
          gender,
        }),
      });
      const payload = response.ok ? await response.json() : { products: [] };
      setProducts(Array.isArray(payload.products) ? payload.products : []);
    } catch (error) {
      console.error("Chat outfit products fetch error:", error);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="chatOutfitCard"
      initial={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      <img src={outfit.imagePath} alt={outfit.direction} loading="lazy" />
      <div className="chatOutfitActions">
        <button className="chatOutfitShop" onClick={shopThisLook} type="button">
          SHOP THIS LOOK
        </button>
        <button className="chatOutfitMine" onClick={() => onMakeMine(`Make this outfit mine: ${outfit.direction}`)} type="button">
          MAKE THIS MINE
        </button>
      </div>
      {loading ? <ProductSkeletonRow /> : null}
      {products.length ? <StaticProductRow products={products} term={outfit.direction} onShopClick={onShopClick} /> : null}
    </motion.div>
  );
}

function responseFallback(message: string): StyleResponse {
  return {
    response: "Keep it simple, specific, and wearable. One strong piece, breathable fabric, and a clean shoe will do more than adding five extra details.",
    hasOutfitDirections: true,
    outfitDirections: [
      { occasion: "DAY", direction: "Crisp shirt + straight trousers + loafers + small structured bag" },
      { occasion: "EASY", direction: "Soft tee + relaxed jeans + clean sneakers + light overshirt" },
    ],
    trendKeywords: [],
    shopTerms: [message, "white shirt", "straight trousers"],
    followUpSuggestions: ["Make it more polished", "Make it more casual"],
  };
}

function TypingCard() {
  return (
    <div className="styleTyping" aria-label="Fashlock is thinking">
      <span />
      <span />
      <span />
    </div>
  );
}

function AssistantCard({
  response,
  gender,
  onSuggestion,
  onShopClick,
  onMakeMine,
  showProducts,
}: {
  response: StyleResponse;
  gender: Gender;
  onSuggestion: (text: string) => void;
  onShopClick: (url: string, term: string) => void;
  onMakeMine: (text: string) => void;
  showProducts: boolean;
}) {
  const shopTerms = response.shopTerms?.slice(0, 3) || [];
  const generatedOutfits = response.generatedOutfitImages || [];

  return (
    <article className="assistantCard">
      <p className="assistantMain">{response.response}</p>

      {response.hasOutfitDirections && response.outfitDirections?.length > 0 ? (
        <section className="assistantSection">
          <p className="assistantLabel">WHAT TO WEAR</p>
          <div className="productGroups">
            {response.outfitDirections.slice(0, 3).map((direction, index) => (
              <div className="productGroup" key={`${direction.occasion}-${index}-products`}>
                <p className="productGroupLabel">{direction.occasion}</p>
                <p className="directionText">{direction.direction}</p>
                {generatedOutfits[index] ? (
                  <ChatOutfitCard
                    gender={gender}
                    onMakeMine={onMakeMine}
                    onShopClick={onShopClick}
                    outfit={generatedOutfits[index]}
                  />
                ) : null}
                {showProducts ? (
                  <ProductRow
                    direction={direction}
                    gender={gender}
                    onShopClick={onShopClick}
                    searchTerm={shopTerms[index] || direction.direction}
                  />
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {(!response.outfitDirections?.length && generatedOutfits.length) ? (
        <section className="assistantSection">
          <p className="assistantLabel">WHAT TO WEAR</p>
          <div className="productGroups">
            {generatedOutfits.map((outfit) => (
              <div className="productGroup" key={`${outfit.imagePath}-${outfit.occasion}`}>
                <p className="productGroupLabel">{outfit.occasion}</p>
                <p className="directionText">{outfit.direction}</p>
                <ChatOutfitCard gender={gender} onMakeMine={onMakeMine} onShopClick={onShopClick} outfit={outfit} />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {response.trendKeywords?.length ? (
        <section className="assistantSection">
          <p className="assistantLabel">WHAT'S TRENDING NOW</p>
          <div className="trendPills">
            {response.trendKeywords.slice(0, 6).map((keyword) => (
              <span key={keyword}>{keyword}</span>
            ))}
          </div>
        </section>
      ) : null}

      {response.followUpSuggestions?.length ? (
        <div className="followUps">
          {response.followUpSuggestions.slice(0, 2).map((suggestion) => (
            <button key={suggestion} onClick={() => onSuggestion(suggestion)} type="button">
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function FashionIdentityPanel({
  profile,
  analysis,
  onUpdatePhoto,
  onAskStylist,
}: {
  profile: StyleProfile | null;
  analysis: VibeAnalysis | null;
  onUpdatePhoto: () => void;
  onAskStylist: (text: string) => void;
}) {
  const hasData = hasIdentityData(profile, analysis);
  const vibe = profileValue(profile, analysis, "vibe");
  const style = profileValue(profile, analysis, "style");
  const colours = profileValue(profile, analysis, "colours");
  const body = profileValue(profile, analysis, "body");
  const avoid = profileValue(profile, analysis, "avoid");
  const suits = analysis?.whatIsWorking || profile?.camilles_take || profile?.current_outfit_read || "";

  if (!hasData) {
    return (
      <section className="fashionIdentityPanel empty">
        <div>
          <p className="assistantLabel">YOUR FASHION IDENTITY</p>
          <h2>Your personal fashion map starts here.</h2>
          <p>Upload a photo or chat with Laila once, and this becomes your personal fashion map.</p>
        </div>
        <button onClick={onUpdatePhoto} type="button">Update with a photo</button>
      </section>
    );
  }

  return (
    <section className="fashionIdentityPanel">
      <div className="identityLead">
        <p className="assistantLabel">YOUR FASHION IDENTITY</p>
        <h2>{vibe || style || "Your style, mapped."}</h2>
        <p>{suits || "This is the filter Laila uses before she suggests a trend, outfit, colour, or piece."}</p>
        <div className="identityActions">
          <button onClick={onUpdatePhoto} type="button">Update with a photo</button>
          <button onClick={() => onAskStylist("What vibe do I give off?")} type="button">Ask Laila about my vibe</button>
        </div>
      </div>
      <div className="identityGrid">
        <article>
          <span>Style personality</span>
          <p>{style || "Not mapped yet"}</p>
        </article>
        <article>
          <span>Colour story</span>
          <p>{colours || "Upload a photo to map your best colours"}</p>
        </article>
        <article>
          <span>Body/proportion notes</span>
          <p>{body || "Upload a full or half body photo for proportion notes"}</p>
        </article>
        <article>
          <span>What suits you</span>
          <p>{analysis?.theUpgrade || profile?.favourite_pieces || "Clean styling, thoughtful fit, and colours that support your natural contrast."}</p>
        </article>
        <article>
          <span>What to avoid</span>
          <p>{avoid || "Anything that overwhelms your frame, colouring, or actual routine."}</p>
        </article>
      </div>
    </section>
  );
}

function SaveLookButton({
  isSaved,
  look,
  onToggle,
}: {
  isSaved: boolean;
  look: LookLibraryItem;
  onToggle: (look: LookLibraryItem) => void;
}) {
  return (
    <motion.button
      aria-label={isSaved ? `Unsave ${look.title}` : `Save ${look.title}`}
      className={`saveLookButton${isSaved ? " saved" : ""}`}
      onClick={(event) => {
        event.stopPropagation();
        onToggle(look);
      }}
      transition={{ duration: 0.16, ease: "easeOut" }}
      type="button"
      whileTap={{ scale: 1.18 }}
    >
      <Heart fill={isSaved ? "currentColor" : "none"} size={18} strokeWidth={1.8} />
    </motion.button>
  );
}

function StylePieceSection({
  loading,
  preview,
  result,
  onAskLaila,
  onUploadClick,
}: {
  loading: boolean;
  preview: string;
  result: StyledPieceResult | null;
  onAskLaila: (text: string) => void;
  onUploadClick: () => void;
}) {
  return (
    <section className="stylePieceShell" aria-label="Style a piece you own">
      <div className="stylePieceCopy">
        <p className="styleLabel">STYLE A PIECE YOU OWN</p>
        <h2>Own something you don't know how to wear?</h2>
        <p>Upload one piece. Laila styles it 3 ways.</p>
      </div>
      <button className="stylePieceUpload" onClick={onUploadClick} type="button">
        {preview ? <img src={preview} alt="Uploaded clothing item" /> : <Camera size={24} strokeWidth={1.4} />}
        <span>{loading ? "Laila is styling this..." : preview ? "Choose another piece" : "Upload a piece"}</span>
        <small>JPG, PNG, WEBP</small>
      </button>

      {result?.outfits.length ? (
        <div className="stylePieceResults">
          <p className="stylePieceDescription">{result.piece_description}</p>
          <div className="stylePieceCards">
            {result.outfits.map((outfit) => (
              <article className="stylePieceCard" key={`${outfit.occasion}-${outfit.outfit}`}>
                <p>{outfit.occasion}</p>
                <h3>{outfit.outfit}</h3>
                <em>{outfit.tip}</em>
              </article>
            ))}
          </div>
          <button
            className="stylePieceAsk"
            onClick={() => onAskLaila(`I own ${result.piece_description}, can you help me style it?`)}
            type="button"
          >
            Ask Laila about this piece
          </button>
        </div>
      ) : null}
    </section>
  );
}

function LookbookLayer({
  brief,
  profile,
  analysis,
  activeFilter,
  selectedLook,
  products,
  productsLoading,
  savedLookIds,
  showPersonaliseBanner,
  onFilterChange,
  onDismissPersonaliseBanner,
  onPersonaliseFeed,
  onToggleSaveLook,
  onShopLook,
  onAskLaila,
  onShopClick,
}: {
  brief: StyleBrief;
  profile: StyleProfile | null;
  analysis: VibeAnalysis | null;
  activeFilter: string;
  selectedLook: LookLibraryItem | null;
  products: ProductCard[];
  productsLoading: boolean;
  savedLookIds: Set<string>;
  showPersonaliseBanner: boolean;
  onFilterChange: (filter: string) => void;
  onDismissPersonaliseBanner: () => void;
  onPersonaliseFeed: () => void;
  onToggleSaveLook: (look: LookLibraryItem) => void;
  onShopLook: (look: LookLibraryItem) => void;
  onAskLaila: (look: LookLibraryItem) => void;
  onShopClick: (url: string, term: string) => void;
}) {
  const [drawerIdea, setDrawerIdea] = useState<StyleIdea | null>(null);
  const [researchQuery, setResearchQuery] = useState("");
  const [researchResult, setResearchResult] = useState<StyleResearchResult | null>(null);
  const [researchLoading, setResearchLoading] = useState(false);
  const [researchError, setResearchError] = useState("");
  const trendDrivers = [
    ...brief.trends.map((trend) => trend.keyword),
    ...brief.trends.map((trend) => trend.trendName),
    ...brief.shopLookTerms,
  ];
  const profileSignals = [
    profile?.vibe,
    profile?.body_type,
    profile?.skin_tone,
    profile?.skin_undertone,
    ...(profile?.style_personality || []),
    ...(profile?.colour_palette || []),
    ...(profile?.colours_that_glow || []),
    ...(profile?.lifestyle || []),
    analysis?.vibe,
    analysis?.stylePersonality,
    analysis?.bodyType,
    ...(analysis?.coloursThatWillGlow || []),
  ].filter((item): item is string => Boolean(item));
  const genderFilter = brief.gender as "female" | "male" | undefined;
  const ideas = rankStyleIdeas({ trendDrivers, profileSignals, savedLookIds, gender: genderFilter });
  const compatibilityLooks = flattenStyleIdeasToLooks(ideas);
  const lookByVariationId = new Map(compatibilityLooks.map((look) => [look.id, look]));
  const filteredIdeas =
    activeFilter === "All"
      ? ideas
      : ideas.filter((idea) => {
          const filter = activeFilter.toLowerCase();
          const haystack = [
            idea.title,
            idea.description,
            idea.category,
            idea.season,
            ...idea.mood,
            ...idea.aesthetic,
            ...idea.references,
            ...idea.trendDrivers,
            ...idea.sourceSignals,
            ...idea.variations.flatMap((variation) => [
              variation.title,
              variation.occasion,
              variation.stylingNote,
              variation.whyItWorks,
              ...variation.pieces,
              ...variation.tags,
              ...variation.colours,
              ...variation.materials,
            ]),
          ]
            .join(" ")
            .toLowerCase();
          const match = filter.replace(/s$/, "");
          return haystack.includes(filter) || haystack.includes(match);
        });
  const displayIdeas = filteredIdeas.length ? filteredIdeas : ideas;
  const heroIdea = displayIdeas[0] || null;
  const supportingIdeas = displayIdeas.slice(1);
  const shopTerm = selectedLook?.shopTerms?.[0] || "";
  const moreLikeThis = drawerIdea
    ? ideas
        .filter((idea) => idea.id !== drawerIdea.id && (idea.category === drawerIdea.category || idea.aesthetic.some((item) => drawerIdea.aesthetic.includes(item))))
        .slice(0, 4)
    : [];

  const heroVariationForIdea = (idea: StyleIdea) =>
    idea.variations.find((variation) => variation.id === idea.heroLookId) || idea.variations[0];

  const previewPieces = (idea: StyleIdea) => heroVariationForIdea(idea)?.pieces.slice(0, 3) || [];

  const variationToLook = (idea: StyleIdea, variation: StyleIdeaVariation): LookLibraryItem => {
    const compatibilityLook = lookByVariationId.get(variation.id);
    if (compatibilityLook) {
      return {
        ...compatibilityLook,
        title: variation.title,
        heroImage: variation.image,
        pieces: variation.pieces,
        stylingNote: variation.stylingNote,
        shopTerms: buildShopTermsForVariation(variation),
        story: variation.whyItWorks,
        mood: idea.description,
        askLailaPrompt: buildAskLailaPromptForVariation(idea, variation),
      };
    }

    return flattenStyleIdeasToLooks([idea]).find((look) => look.id === variation.id) || compatibilityLooks[0];
  };

  const shopVariation = (idea: StyleIdea, variation: StyleIdeaVariation) => {
    onShopLook(variationToLook(idea, variation));
  };

  const askLailaForVariation = (idea: StyleIdea, variation: StyleIdeaVariation) => {
    onAskLaila(variationToLook(idea, variation));
  };

  const ideaHasSavedVariation = (idea: StyleIdea) => idea.variations.some((variation) => savedLookIds.has(variation.id));

  async function runStyleResearch(query: string) {
    const cleaned = query.trim();
    if (!cleaned || researchLoading) return;

    setResearchQuery(cleaned);
    setResearchLoading(true);
    setResearchError("");
    setResearchResult(null);

    try {
      const response = await fetch("/api/style/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: cleaned, gender: genderFilter }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Style research failed");
      }

      setResearchResult(payload as StyleResearchResult);
    } catch (error) {
      setResearchError(error instanceof Error ? error.message : "Style research failed");
    } finally {
      setResearchLoading(false);
    }
  }

  function submitStyleResearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runStyleResearch(researchQuery);
  }

  function researchVariationToLook(variation: ResearchVariation): LookLibraryItem {
    const id = `research-${researchResult?.query || "style"}-${variation.title}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const shopTerms = variation.shopTerms.length ? variation.shopTerms.slice(0, 4) : [variation.formula, ...variation.pieces].slice(0, 4);
    const prompt = [
      `Make this researched style idea mine: ${researchResult?.title || researchResult?.query || researchQuery}.`,
      `Variation: ${variation.title}.`,
      `Formula: ${variation.formula}.`,
      `Pieces: ${variation.pieces.join(", ")}.`,
      `Styling note: ${variation.stylingNote}.`,
      "Personalize it for my vibe, body, colours, wardrobe, and the occasion I am dressing for.",
    ].join(" ");

    return {
      id,
      gender: genderFilter || "female",
      trendCluster: "style-research",
      title: variation.title,
      icon: researchResult?.title || researchQuery || "Style research",
      iconContext: variation.sourceSignals[0]?.source || "Current web styling signals",
      feeling: variation.formula,
      whyNow: variation.whyItWorks,
      pieces: variation.pieces,
      stylingNote: variation.stylingNote,
      colours: [],
      materials: [],
      occasion: variation.occasion,
      season: `${brief.season} ${brief.year}`,
      category: "Research",
      aesthetic: variation.aesthetic,
      tags: [variation.aesthetic, variation.occasion, researchResult?.query || researchQuery].filter(Boolean),
      shopTerms,
      pexelsQuery: `${variation.title} outfit editorial`,
      askLailaPrompt: prompt,
      story: variation.whyItWorks,
      mood: researchResult?.summary || variation.formula,
      visualHint: variation.sourceSignals.map((signal) => signal.source).filter(Boolean).join(", "),
      size: "standard",
      trendDrivers: [researchResult?.query || researchQuery, variation.aesthetic, ...variation.pieces].filter(Boolean),
      era: "Now",
    };
  }

  function shopResearchVariation(variation: ResearchVariation) {
    onShopLook(researchVariationToLook(variation));
  }

  function askLailaForResearchVariation(variation: ResearchVariation) {
    onAskLaila(researchVariationToLook(variation));
  }

  return (
    <section className="lookbookShell" aria-label="Style Lookbook">
      <div className="lookbookHero">
        <div>
          <p className="styleLabel">STYLE LOOKBOOK</p>
          <h2>Style ideas worth stealing right now.</h2>
          <p>Fashion ideas, edited into multiple wearable variations you can shop or ask Laila to make yours.</p>
        </div>
        <span>
          {brief.season} {brief.year}
        </span>
      </div>

      <div className="lookbookFilterRail" aria-label="Lookbook filters">
        {LOOKBOOK_FILTERS.map((filter) => (
          <button className={activeFilter === filter ? "active" : ""} key={filter} onClick={() => onFilterChange(filter)} type="button">
            {filter}
          </button>
        ))}
      </div>

      <section className="styleResearchShell" aria-label="Style research">
        <div className="styleResearchHeader">
          <div>
            <p className="styleLabel">STYLE RESEARCH</p>
            <h3>Research a fashion idea in the wild.</h3>
            <p>Search a trend or item and see the recurring outfit formulas showing up in current styling signals.</p>
          </div>
          {researchResult?.cached ? <span>Cached edit</span> : null}
        </div>
        <form className="styleResearchForm" onSubmit={submitStyleResearch}>
          <input
            maxLength={80}
            onChange={(event) => setResearchQuery(event.target.value)}
            placeholder="Research a style idea..."
            value={researchQuery}
          />
          <button disabled={researchLoading || researchQuery.trim().length < 2} type="submit">
            {researchLoading ? "Researching..." : "Research"}
          </button>
        </form>
        <div className="styleResearchExamples">
          {STYLE_RESEARCH_EXAMPLES.map((example) => (
            <button key={example} onClick={() => void runStyleResearch(example)} type="button">
              {example}
            </button>
          ))}
        </div>
        {researchError ? <p className="briefMuted">{researchError}</p> : null}
        {researchLoading ? <p className="lookVariationLoading">Reading current styling signals...</p> : null}
        {researchResult ? (
          <section className="styleResearchResult">
            <div className="briefSectionHeader">
              <p className="assistantLabel">{`HOW ${researchResult.query.toUpperCase()} IS BEING STYLED NOW`}</p>
              <span>{researchResult.variations.length ? `${researchResult.variations.length} formulas found` : "No reliable formulas yet"}</span>
            </div>
            <h3>{researchResult.title}</h3>
            <p>{researchResult.summary}</p>
            {researchResult.variations.length ? (
              <div className="lookVariationGrid">
                {researchResult.variations.map((variation) => (
                  <article className="lookVariationCard" key={`${variation.title}-${variation.formula}`}>
                    <h3>{variation.title}</h3>
                    <p>{variation.formula}</p>
                    <div className="lookVariationPieces">
                      {variation.pieces.map((piece) => (
                        <span key={piece}>{piece}</span>
                      ))}
                    </div>
                    <p>{variation.whyItWorks}</p>
                    <em>{variation.stylingNote}</em>
                    <div className="styleResearchMeta">
                      <span>{variation.occasion}</span>
                      <span>{variation.aesthetic}</span>
                    </div>
                    {variation.sourceSignals.length ? (
                      <div className="styleResearchSources">
                        {variation.sourceSignals.slice(0, 3).map((signal) => (
                          <a href={signal.url || "#"} key={`${signal.title}-${signal.url}`} rel="noopener noreferrer" target="_blank">
                            <span>{signal.source || "Source"}</span>
                            {signal.title}
                          </a>
                        ))}
                      </div>
                    ) : null}
                    <div className="lookVariationActions">
                      <button onClick={() => shopResearchVariation(variation)} type="button">Shop this variation</button>
                      <button onClick={() => askLailaForResearchVariation(variation)} type="button">Ask Laila to make this mine</button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="briefMuted">Try a more specific item, material, or silhouette.</p>
            )}
          </section>
        ) : null}
      </section>

      {heroIdea ? (
        <div className="lookbookGrid">
          <motion.article className="lookCard heroLookCard" initial="rest" animate="rest" whileHover="hover" onClick={() => setDrawerIdea(heroIdea)}>
            {heroVariationForIdea(heroIdea) ? (
              <SaveLookButton isSaved={ideaHasSavedVariation(heroIdea)} look={variationToLook(heroIdea, heroVariationForIdea(heroIdea))} onToggle={onToggleSaveLook} />
            ) : null}
            <div className={`lookVisual${heroVariationForIdea(heroIdea)?.image ? " hasImage" : ""}`} style={heroVariationForIdea(heroIdea)?.image ? undefined : visualGradient(heroVariationForIdea(heroIdea)?.colours || [])}>
              {heroVariationForIdea(heroIdea)?.image ? (
                <img src={heroVariationForIdea(heroIdea)?.image} alt={heroIdea.title} />
              ) : (
                <div className="lookSwatches" aria-hidden="true">
                  {(heroVariationForIdea(heroIdea)?.colours || []).map((swatch) => (
                    <span key={swatch} style={{ background: swatch }} />
                  ))}
                </div>
              )}
            </div>
            <div className="lookRestCopy">
              <span className="lookSeasonLabel">{`${brief.season} ${brief.year}`}</span>
              <h3>{heroIdea.title}</h3>
              <p>{heroIdea.description}</p>
              <div className="lookActions heroLookActions">
                <button onClick={(event) => { event.stopPropagation(); setDrawerIdea(heroIdea); }} type="button">Explore ways to wear it</button>
              </div>
            </div>
            <motion.div className="lookHoverOverlay" variants={lookHoverVariants} transition={lookHoverTransition}>
              <span className="lookSeasonLabel">{`${brief.season} ${brief.year}`}</span>
              <h3>{heroIdea.title}</h3>
              <p>{`${previewPieces(heroIdea).join(", ")} · ${heroIdea.variations.length} variations`}</p>
              <div className="lookActions">
                <button onClick={(event) => { event.stopPropagation(); setDrawerIdea(heroIdea); }} type="button">Explore ways to wear it</button>
              </div>
            </motion.div>
          </motion.article>

          {supportingIdeas.map((idea) => {
            const heroVariation = heroVariationForIdea(idea);
            return (
            <motion.article className="lookCard" key={idea.id} initial="rest" animate="rest" whileHover="hover" onClick={() => setDrawerIdea(idea)}>
              {heroVariation ? (
                <SaveLookButton isSaved={ideaHasSavedVariation(idea)} look={variationToLook(idea, heroVariation)} onToggle={onToggleSaveLook} />
              ) : null}
              <div className={`lookVisual compact${heroVariation?.image ? " hasImage" : ""}`} style={heroVariation?.image ? undefined : visualGradient(heroVariation?.colours || [])}>
                {heroVariation?.image ? (
                  <img src={heroVariation.image} alt={idea.title} />
                ) : (
                  <div className="lookSwatches" aria-hidden="true">
                    {(heroVariation?.colours || []).map((swatch) => (
                      <span key={swatch} style={{ background: swatch }} />
                    ))}
                  </div>
                )}
              </div>
              <div className="lookRestCopy">
                <h3>{idea.title}</h3>
                <p>{idea.description}</p>
              </div>
              <motion.div className="lookHoverOverlay" variants={lookHoverVariants} transition={lookHoverTransition}>
                <h3>{idea.title}</h3>
                <p>{`${previewPieces(idea).join(", ")} · ${idea.variations.length} variations`}</p>
                <div className="lookActions">
                  <button onClick={(event) => { event.stopPropagation(); setDrawerIdea(idea); }} type="button">Explore ways to wear it</button>
                </div>
              </motion.div>
            </motion.article>
            );
          })}
        </div>
      ) : null}

      {showPersonaliseBanner ? (
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="personaliseBanner"
          initial={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        >
          <div>
            <p>Want looks picked for your body and colouring?</p>
            <span>Upload one photo — it takes 10 seconds.</span>
          </div>
          <button className="personaliseBannerCta" onClick={onPersonaliseFeed} type="button">
            Personalise my feed
          </button>
          <button className="personaliseBannerClose" onClick={onDismissPersonaliseBanner} type="button" aria-label="Dismiss personalisation prompt">
            <X size={16} strokeWidth={1.6} />
          </button>
        </motion.div>
      ) : null}

      <AnimatePresence>
        {drawerIdea ? (
          <motion.div className="lookDrawerOverlay" initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ duration: 0.4, ease: "easeOut" }}>
            <button className="lookDrawerClose" onClick={() => setDrawerIdea(null)} type="button" aria-label="Close style idea details">
              <X size={18} strokeWidth={1.5} />
            </button>

            <div className="lookDrawerContent">
              <section className="lookDrawerIntro">
                <div className={`lookDrawerImage${heroVariationForIdea(drawerIdea)?.image ? " hasImage" : ""}`} style={heroVariationForIdea(drawerIdea)?.image ? undefined : visualGradient(heroVariationForIdea(drawerIdea)?.colours || [])}>
                  {heroVariationForIdea(drawerIdea)?.image ? (
                    <img src={heroVariationForIdea(drawerIdea)?.image} alt={drawerIdea.title} />
                  ) : (
                    <div className="lookSwatches" aria-hidden="true">
                      {(heroVariationForIdea(drawerIdea)?.colours || []).map((swatch) => (
                        <span key={swatch} style={{ background: swatch }} />
                      ))}
                    </div>
                  )}
                </div>
                <div className="lookDrawerText">
                  <p className="lookDrawerLabel">{`${brief.season} ${brief.year} · ${drawerIdea.category}`}</p>
                  <h2>{drawerIdea.title}</h2>
                  <p>{drawerIdea.description}</p>
                  <span>{`References: ${drawerIdea.references.slice(0, 4).join(", ") || "Fashlock archive"}`}</span>
                </div>
              </section>

              <section className="lookDrawerSection">
                <p className="lookDrawerLabel">MOOD / AESTHETIC</p>
                <div className="lookDrawerPieces">
                  {[...drawerIdea.mood.slice(0, 4), ...drawerIdea.aesthetic].map((item) => (
                    <p key={item}>{item}</p>
                  ))}
                </div>
              </section>

              <section className="lookDrawerSection">
                <p className="lookDrawerLabel">SEEN THROUGH</p>
                <div className="lookDrawerPieces">
                  {drawerIdea.sourceSignals.slice(0, 6).map((signal) => (
                    <p key={signal}>{signal}</p>
                  ))}
                </div>
              </section>

              <section className="lookDrawerSection">
                <p className="lookDrawerLabel">WAYS TO WEAR THIS NOW</p>
                <div className="lookVariationGrid">
                  {drawerIdea.variations.map((variation) => {
                    return (
                      <article className="lookVariationCard" key={variation.id}>
                        <div className={`moreLikeImage${variation.image ? " hasImage" : ""}`} style={variation.image ? undefined : visualGradient(variation.colours)}>
                          {variation.image ? <img src={variation.image} alt={variation.title} /> : null}
                        </div>
                        <h3>{variation.title}</h3>
                        <p>{variation.occasion}</p>
                        <div className="lookVariationPieces">
                          {variation.pieces.map((piece) => (
                            <span key={piece}>{piece}</span>
                          ))}
                        </div>
                        <p>{variation.whyItWorks}</p>
                        <em>{variation.stylingNote}</em>
                        <div className="lookVariationActions">
                          <button onClick={() => shopVariation(drawerIdea, variation)} type="button">Shop this variation</button>
                          <button onClick={() => askLailaForVariation(drawerIdea, variation)} type="button">Ask Laila to make this mine</button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>

              <section className="lookDrawerSection">
                <p className="lookDrawerLabel">MORE LIKE THIS</p>
                <div className="moreLikeRail">
                  {moreLikeThis.map((idea) => {
                    const variation = heroVariationForIdea(idea);
                    return (
                    <button className="moreLikeCard" key={idea.id} onClick={() => setDrawerIdea(idea)} type="button">
                      <div className={`moreLikeImage${variation?.image ? " hasImage" : ""}`} style={variation?.image ? undefined : visualGradient(variation?.colours || [])}>
                        {variation?.image ? <img src={variation.image} alt={idea.title} /> : null}
                      </div>
                      <h3>{idea.title}</h3>
                      <p>{idea.description}</p>
                    </button>
                    );
                  })}
                </div>
              </section>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <section className="lookbookShopSection">
        <div className="briefSectionHeader">
          <p className="assistantLabel">SHOP THE EDIT</p>
          {selectedLook ? <span>{`Shopping edit for ${selectedLook.title}: ${shopTerm}`}</span> : <span>Pick a look first</span>}
        </div>
        {selectedLook ? (
          productsLoading ? (
            <ProductSkeletonRow />
          ) : products.length ? (
            <StaticProductRow products={products} term={shopTerm} onShopClick={onShopClick} />
          ) : (
            <p className="briefMuted">No products found yet. Try another look.</p>
          )
        ) : (
          <div className="shopPrompt">
            {ideas.slice(0, 4).map((idea) => {
              const variation = heroVariationForIdea(idea);
              return variation ? (
              <button key={idea.id} onClick={() => shopVariation(idea, variation)} type="button">
                {idea.title}
              </button>
              ) : null;
            })}
          </div>
        )}
      </section>

      <div className="askStylistDivider">
        <p className="assistantLabel">ASK LAILA TO MAKE IT YOURS</p>
        <h3>Need something more personal?</h3>
        <p>Ask Laila to translate this into your wardrobe, body, colours, or occasion.</p>
      </div>
    </section>
  );
}

export default function StylePage() {
  const [gender, setGender] = useState<Gender>("female");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [profile, setProfile] = useState<StyleProfile | null>(null);
  const [flowState, setFlowState] = useState<StyleFlowState>("upload");
  const [photoPreview, setPhotoPreview] = useState("");
  const [photoBase64, setPhotoBase64] = useState("");
  const [photoMimeType, setPhotoMimeType] = useState("");
  const [analysis, setAnalysis] = useState<VibeAnalysis | null>(null);
  const [analysisProducts, setAnalysisProducts] = useState<ProductGroup[]>([]);
  const [showAnalysisProducts, setShowAnalysisProducts] = useState(false);
  const [styleBrief, setStyleBrief] = useState<StyleBrief | null>(null);
  const [briefProducts, setBriefProducts] = useState<ProductCard[]>([]);
  const [briefProductsLoading, setBriefProductsLoading] = useState(false);
  const [selectedLook, setSelectedLook] = useState<LookLibraryItem | null>(null);
  const [activeLookbookFilter, setActiveLookbookFilter] = useState("All");
  const [analysisTextIndex, setAnalysisTextIndex] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [chatImagePreview, setChatImagePreview] = useState("");
  const [chatImageBase64, setChatImageBase64] = useState("");
  const [chatImageMimeType, setChatImageMimeType] = useState("");
  const [savedLookIds, setSavedLookIds] = useState<Set<string>>(() => new Set());
  const [savedLooksAuthenticated, setSavedLooksAuthenticated] = useState(false);
  const [saveToast, setSaveToast] = useState("");
  const [sessionSavedLookCount, setSessionSavedLookCount] = useState(0);
  const [personaliseBannerDismissed, setPersonaliseBannerDismissed] = useState(false);
  const [photoUploadRequested, setPhotoUploadRequested] = useState(false);
  const [stylePiecePreview, setStylePiecePreview] = useState("");
  const [stylePieceLoading, setStylePieceLoading] = useState(false);
  const [stylePieceResult, setStylePieceResult] = useState<StyledPieceResult | null>(null);
  const chatRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const stylePieceFileInputRef = useRef<HTMLInputElement | null>(null);
  const chatFileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const returningGreetingLoaded = useRef(false);
  const wardrobeHandoffLoaded = useRef(false);
  const trendHandoffLoaded = useRef(false);

  const analysisTexts = ["Reading your style...", "Analysing your vibe...", "Understanding your aesthetic...", "Seeing what works..."];
  const hasPhotoAnalysis = Boolean(
    analysis ||
      photoPreview ||
      profile?.onboarding_complete ||
      profile?.current_outfit_read ||
      profile?.camilles_take ||
      profile?.body_type ||
      profile?.skin_tone,
  );
  const showPersonaliseBanner = sessionSavedLookCount >= 3 && !hasPhotoAnalysis && !personaliseBannerDismissed;

  useEffect(() => {
    setSessionId(getSessionId());
    setPersonaliseBannerDismissed(window.localStorage.getItem("fashlock_personalise_banner_dismissed") === "true");
  }, []);

  useEffect(() => {
    let active = true;

    fetch("/api/style/saved-looks")
      .then((response) => (response.ok ? response.json() : { savedLookIds: [], authenticated: false }))
      .then((payload) => {
        if (!active) return;
        setSavedLooksAuthenticated(Boolean(payload.authenticated));
        setSavedLookIds(new Set(Array.isArray(payload.savedLookIds) ? payload.savedLookIds : []));
      })
      .catch((error) => {
        console.error("Saved looks fetch error:", error);
        if (active) {
          setSavedLooksAuthenticated(false);
          setSavedLookIds(new Set());
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!saveToast) return;
    const timer = window.setTimeout(() => setSaveToast(""), 2200);
    return () => window.clearTimeout(timer);
  }, [saveToast]);

  useEffect(() => {
    if (!sessionId) return;
    let active = true;

    fetch(`/api/style/profile?sessionId=${encodeURIComponent(sessionId)}`)
      .then((response) => (response.ok ? response.json() : { profile: null }))
      .then(async (payload) => {
        if (!active) return;
        const nextProfile = payload.profile || null;
        setProfile(nextProfile);
        if (nextProfile?.gender === "male") setGender("male");
        if (nextProfile?.gender === "female") setGender("female");
        if (nextProfile?.onboarding_complete && !returningGreetingLoaded.current) {
          returningGreetingLoaded.current = true;
          const savedPhoto = window.localStorage.getItem("fashlock_photo") || "";
          if (savedPhoto) {
            setPhotoPreview(savedPhoto);
            const [meta = "", base64 = ""] = savedPhoto.split(",");
            setPhotoBase64(base64);
            setPhotoMimeType(meta.match(/^data:(.*?);base64$/)?.[1] || "image/jpeg");
          }
          const savedAnalysis = analysisFromProfile(nextProfile);
          setAnalysis(savedAnalysis);
          setAnalysisProducts([]);
          setFlowState("chat");

          const greetingResponse = await fetch("/api/style/greeting", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId }),
          }).then((response) => (response.ok ? response.json() : { greeting: "What are we dressing for today?" }));

          if (!active) return;
          const greeting = String(greetingResponse.greeting || "What are we dressing for today?");
          setMessages([
            {
              id: crypto.randomUUID(),
              role: "assistant",
              content: greeting,
              structured: {
                response: greeting,
                hasOutfitDirections: false,
                outfitDirections: [],
                trendKeywords: [savedAnalysis.vibe, savedAnalysis.stylePersonality].filter(Boolean),
                shopTerms: [],
                followUpSuggestions: ["Dress me for today", "Build outfits from my colours"],
              },
            },
          ]);
        }
      })
      .catch((error) => {
        console.error("Style profile load error:", error);
        if (active) setProfile(null);
      });

    return () => {
      active = false;
    };
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    let active = true;

    fetch(`/api/style/brief?sessionId=${encodeURIComponent(sessionId)}`)
      .then((response) => (response.ok ? response.json() : { brief: null }))
      .then((payload) => {
        if (!active) return;
        const nextBrief = payload.brief ? { ...payload.brief, gender } : null;
        setStyleBrief(nextBrief);
        setSelectedLook(null);
        setBriefProducts([]);
      })
      .catch((error) => {
        console.error("Style brief fetch error:", error);
        if (active) setStyleBrief(null);
      });

    return () => {
      active = false;
    };
  }, [sessionId, gender, profile?.vibe, profile?.style_personality?.join("|"), profile?.gender]);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (wardrobeHandoffLoaded.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("wardrobe") !== "true") return;

    wardrobeHandoffLoaded.current = true;
    setFlowState("chat");
    setInput("I uploaded pieces to my wardrobe — can you tell me what actually suits my style and body type?");

    params.delete("wardrobe");
    const nextUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}${window.location.hash}`;
    window.history.replaceState(null, "", nextUrl);

    window.setTimeout(() => {
      textareaRef.current?.focus();
      textareaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
  }, []);

  useEffect(() => {
    if (trendHandoffLoaded.current) return;
    const context = readLailaTrendContext(new URLSearchParams(window.location.search));
    if (!context) return;
    trendHandoffLoaded.current = true;
    setGender(context.audience === "men" ? "male" : "female");
    setFlowState("chat");
    fetch("/api/wardrobe/items")
      .then((response) => response.ok ? response.json() : { items: [] })
      .then((payload) => {
        const wardrobe = (payload.items || []).slice(0, 20).map((item: { name?: string; color?: string }) => [item.color, item.name].filter(Boolean).join(" "));
        setInput(buildLailaPersonalisationPrompt(context, wardrobe));
        window.setTimeout(() => { textareaRef.current?.focus(); textareaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }, 0);
      })
      .catch(() => setInput(buildLailaPersonalisationPrompt(context)));
  }, []);

  useEffect(() => {
    if (flowState !== "analysing") return;
    const timer = window.setInterval(() => {
      setAnalysisTextIndex((index) => (index + 1) % analysisTexts.length);
    }, 1500);
    return () => window.clearInterval(timer);
  }, [analysisTexts.length, flowState]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }, [input]);

  async function analyseFile(file: File) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      console.error("Unsupported style photo type:", file.type);
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      console.error("Style photo too large. Max size is 10MB.");
      return;
    }

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const [, base64 = ""] = dataUrl.split(",");
    setPhotoPreview(dataUrl);
    setPhotoBase64(base64);
    setPhotoMimeType(file.type);
    setFlowState("analysing");
    setAnalysis(null);
    setAnalysisProducts([]);
    setShowAnalysisProducts(false);

    try {
      const response = await fetch("/api/style/analyse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: base64,
          mimeType: file.type,
          gender,
          sessionId,
        }),
      });

      if (!response.ok) {
        console.error("Style analysis failed:", response.status, await response.text());
        throw new Error("Style analysis failed");
      }

      const payload = await response.json();
      setAnalysis(payload.analysis);
      setAnalysisProducts(Array.isArray(payload.productGroups) ? payload.productGroups : []);
      setShowAnalysisProducts(false);
      const storedPhoto = await compressPhotoForStorage(dataUrl, file.type);
      if (storedPhoto) window.localStorage.setItem("fashlock_photo", storedPhoto);
      setProfile((current) => ({
        ...(current || {}),
        gender,
        skin_tone: payload.analysis?.skinTone,
        body_type: payload.analysis?.bodyType,
        vibe: payload.analysis?.vibe,
        colours_that_glow: payload.analysis?.coloursThatWillGlow || [],
        colours_to_avoid: payload.analysis?.coloursToAvoid || [],
        camilles_take: payload.analysis?.camillesTake,
        current_outfit_read: payload.analysis?.currentOutfitRead || payload.analysis?.currentlyWearing,
        style_personality: payload.analysis?.stylePersonality ? [payload.analysis.stylePersonality] : current?.style_personality || [],
        onboarding_complete: true,
      }));
      setFlowState("result");
    } catch (error) {
      console.error("Style analysis error:", error);
      setFlowState("upload");
    }
  }

  function handleFile(file: File | undefined) {
    if (!file) return;
    void analyseFile(file);
  }

  async function handleChatImage(file: File | undefined) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      console.error("Unsupported chat image type:", file.type);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      console.error("Chat image too large. Max size is 10MB.");
      return;
    }

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const [, base64 = ""] = dataUrl.split(",");
    setChatImagePreview(dataUrl);
    setChatImageBase64(base64);
    setChatImageMimeType(file.type);
  }

  async function handleStylePieceImage(file: File | undefined) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      console.error("Unsupported style piece image type:", file.type);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      console.error("Style piece image too large. Max size is 10MB.");
      return;
    }

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const [, base64 = ""] = dataUrl.split(",");
    setStylePiecePreview(dataUrl);
    setStylePieceResult(null);
    setStylePieceLoading(true);

    try {
      const response = await fetch("/api/style/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "style-piece",
          imageBase64: base64,
          imageMimeType: file.type,
          mimeType: file.type,
        }),
      });

      if (!response.ok) {
        console.error("Style piece analysis failed:", response.status, await response.text());
        throw new Error("Style piece analysis failed");
      }

      const payload = (await response.json()) as StyledPieceResult;
      setStylePieceResult({
        piece_description: String(payload.piece_description || "this piece"),
        outfits: Array.isArray(payload.outfits) ? payload.outfits.slice(0, 3) : [],
      });
    } catch (error) {
      console.error("Style piece error:", error);
      setStylePieceResult(null);
    } finally {
      setStylePieceLoading(false);
      if (stylePieceFileInputRef.current) stylePieceFileInputRef.current.value = "";
    }
  }

  function clearChatImage() {
    setChatImagePreview("");
    setChatImageBase64("");
    setChatImageMimeType("");
    if (chatFileInputRef.current) chatFileInputRef.current.value = "";
  }

  async function handleSend() {
    await sendMessage(input);
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.metaKey) {
      event.preventDefault();
      void handleSend();
    }
  }

  function startFresh() {
    setFlowState("upload");
    setPhotoPreview("");
    setPhotoBase64("");
    setPhotoMimeType("");
    setAnalysis(null);
    setAnalysisProducts([]);
    setShowAnalysisProducts(false);
    setMessages([]);
    setInput("");
    clearChatImage();
  }

  function clearLocalStyleMemory() {
    window.localStorage.removeItem("fashlock_photo");
    window.localStorage.removeItem("fashlock_session_id");
    window.localStorage.removeItem("fashlock_style_session_id");
  }

  async function startPhotoChat(text?: string) {
    setFlowState("chat");
    if (analysis && messages.length === 0) {
      setMessages([
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "What do you want to sharpen first?",
          structured: {
            response: "What do you want to sharpen first?",
            hasOutfitDirections: false,
            outfitDirections: [],
            trendKeywords: [analysis.vibe, analysis.stylePersonality].filter(Boolean),
            shopTerms: [],
            followUpSuggestions: ["Make this more polished", "Build outfits from this vibe"],
          },
        },
      ]);
    }
    if (text?.trim()) await sendMessage(text);
  }

  async function sendMessage(text: string) {
    const cleaned = text.trim();
    if (!cleaned || loading) return;

    const userMessage: Message = { id: crypto.randomUUID(), role: "user", content: cleaned };
    const conversationHistory = messages.slice(-12).map((message) => ({
      role: message.role,
      content: message.role === "assistant" ? message.structured?.response || message.content : message.content,
    }));

    setMessages((current) => [...current, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/style/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: cleaned,
          gender,
          conversationHistory,
          sessionId,
          imageBase64: chatImageBase64 || photoBase64 || undefined,
          imageMimeType: chatImageMimeType || photoMimeType || undefined,
          mimeType: chatImageMimeType || photoMimeType || undefined,
          vibeAnalysis: analysis || undefined,
        }),
      });

      if (!response.ok) {
        console.error("Style chat failed:", response.status, await response.text());
        throw new Error("Style chat failed");
      }

      const data = (await response.json()) as StyleResponse;
      console.log("Style response:", JSON.stringify(data, null, 2));
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: data.response,
          structured: data,
          shoppingRequested: isShoppingMessage(cleaned),
        },
      ]);
      clearChatImage();
    } catch (error) {
      console.error("Style chat error:", error);
      const fallback = responseFallback(cleaned);
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: fallback.response,
          structured: fallback,
          shoppingRequested: isShoppingMessage(cleaned),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await sendMessage(input);
  }

  async function logShopClick(productUrl: string, term: string) {
    if (!sessionId) return;
    fetch("/api/style/interactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, productUrl, message: term }),
    }).catch((error) => console.error("Style shop click log error:", error));
  }

  function toggleSaveLook(look: LookLibraryItem) {
    if (!savedLooksAuthenticated) {
      setSaveToast("sign-in");
      return;
    }

    const wasSaved = savedLookIds.has(look.id);
    if (!wasSaved) {
      setSessionSavedLookCount((count) => count + 1);
    }
    setSavedLookIds((current) => {
      const next = new Set(current);
      if (wasSaved) next.delete(look.id);
      else next.add(look.id);
      return next;
    });

    fetch("/api/style/saved-looks", {
      method: wasSaved ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lookId: look.id, lookTitle: look.title }),
    }).then((response) => {
      if (response.ok) return;
      setSavedLookIds((current) => {
        const next = new Set(current);
        if (wasSaved) next.add(look.id);
        else next.delete(look.id);
        return next;
      });
      if (!wasSaved) {
        setSessionSavedLookCount((count) => Math.max(0, count - 1));
      }
      if (response.status === 401) {
        setSavedLooksAuthenticated(false);
        setSaveToast("sign-in");
      }
    }).catch((error) => {
      console.error("Saved look toggle error:", error);
      setSavedLookIds((current) => {
        const next = new Set(current);
        if (wasSaved) next.add(look.id);
        else next.delete(look.id);
        return next;
      });
      if (!wasSaved) {
        setSessionSavedLookCount((count) => Math.max(0, count - 1));
      }
    });
  }

  function shopLook(look: LookLibraryItem) {
    setSelectedLook(look);
    setBriefProducts([]);
    const searchTerms = look.shopTerms?.length ? look.shopTerms.slice(0, 3) : [`${look.title} outfit`];
    setBriefProductsLoading(true);

    void (async () => {
      try {
        for (const searchQuery of searchTerms) {
          const response = await fetch("/api/style/products", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              searchQuery,
              category: detectProductCategory(searchQuery),
              gender,
            }),
          });
          const payload = response.ok ? await response.json() : { products: [] };
          const products = Array.isArray(payload.products) ? payload.products : [];
          if (products.length || searchQuery === searchTerms.at(-1)) {
            setBriefProducts(products);
            break;
          }
        }
      } catch (error) {
        console.error("Style brief products fetch error:", error);
        setBriefProducts([]);
      } finally {
        setBriefProductsLoading(false);
      }
    })();
  }

  function askLailaForLook(look: LookLibraryItem) {
    const pieces = look.pieces.length ? `\n\nPieces:\n${look.pieces.map((piece) => `- ${piece}`).join("\n")}` : "";
    const stylingNote = look.story ? `\n\nStory: ${look.story}` : "";
    const prompt =
      look.askLailaPrompt ||
      `Style this look for me: ${look.title}.${pieces}${stylingNote}\n\nUse my profile. Use my colours. Use my body type. Use my lifestyle.`;
    void startPhotoChat(prompt);
    window.setTimeout(() => chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" }), 0);
  }

  function prefillChatPrompt(text: string) {
    setFlowState("chat");
    setInput(text);
    window.setTimeout(() => {
      textareaRef.current?.focus();
      textareaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
  }

  function dismissPersonaliseBanner() {
    setPersonaliseBannerDismissed(true);
    window.localStorage.setItem("fashlock_personalise_banner_dismissed", "true");
  }

  function personaliseFeed() {
    setPhotoUploadRequested(true);
    fileInputRef.current?.click();
  }

  async function confirmStartOver() {
    if (!sessionId) return;

    await fetch(`/api/style/profile?sessionId=${encodeURIComponent(sessionId)}`, {
      method: "DELETE",
    }).catch((error) => console.error("Style profile delete error:", error));

    clearLocalStyleMemory();
    returningGreetingLoaded.current = false;
    const nextSessionId = getSessionId();
    setSessionId(nextSessionId);
    setProfile(null);
    setResetConfirmOpen(false);
    setMemoryOpen(false);
    startFresh();
  }

  function editProfile() {
    setResetConfirmOpen(true);
  }

  return (
    <main className={`${dmSans.variable} ${cormorant.variable} stylePage`}>
      <style>{`
        .stylePage {
          --rose: #B03A5B;
          --ink: #2C2418;
          --ivory: #FAF7F4;
          --paper: #F0EBE3;
          --line: #D4C8BC;
          --muted: #8C7B6E;
          background: var(--ivory);
          color: var(--ink);
          display: flex;
          flex-direction: column;
          font-family: var(--font-style-sans);
          height: calc(100vh - 52px);
          overflow: hidden;
        }

        .styleTopBar {
          align-items: center;
          background: var(--paper);
          border-bottom: 0.5px solid var(--line);
          display: flex;
          justify-content: space-between;
          padding: 16px 48px;
        }

        .styleLabel,
        .assistantLabel {
          color: var(--rose);
          font-family: var(--font-style-sans);
          font-size: 8px;
          font-weight: 200;
          letter-spacing: 5px;
          line-height: 1;
          margin: 0;
          text-transform: uppercase;
        }

        .styleTitle {
          color: var(--ink);
          font-family: var(--font-style-display);
          font-size: 22px;
          font-style: italic;
          font-weight: 300;
          line-height: 1.2;
          margin: 8px 0 0;
        }

        .genderToggle {
          align-items: center;
          display: flex;
          gap: 8px;
        }

        .rememberedPhoto {
          background: #EDE8DF;
          border: 0.5px solid var(--line);
          border-radius: 999px;
          height: 48px;
          object-fit: cover;
          object-position: top center;
          width: 48px;
        }

        .genderToggle button {
          border: 0;
          background: transparent;
          color: var(--muted);
          cursor: pointer;
          font-family: var(--font-style-sans);
          font-size: 11px;
          font-weight: 300;
          letter-spacing: 2px;
          padding: 8px 24px;
          text-transform: uppercase;
          transition: 0.2s ease;
        }

        .genderToggle button.active {
          background: var(--ink);
          border-radius: 20px;
          color: var(--paper);
        }

        .genderToggle .editProfileButton {
          color: #C4B4A6;
          font-size: 9px;
          font-weight: 200;
          letter-spacing: 2px;
          padding: 8px 0 8px 12px;
        }

        .genderToggle .editProfileButton:hover {
          color: var(--rose);
        }

        .memoryButton {
          align-items: center;
          background: transparent;
          border: 0;
          color: #C4B4A6;
          cursor: pointer;
          display: flex;
          justify-content: center;
          padding: 8px;
          transition: 0.2s ease;
        }

        .memoryButton:hover {
          color: var(--rose);
        }

        .savedLooksCount {
          align-items: center;
          color: #B03A5B;
          display: inline-flex;
          font-size: 11px;
          font-weight: 300;
          gap: 5px;
          letter-spacing: 1px;
          padding: 0 6px;
        }

        .saveToast {
          background: rgba(44, 36, 24, 0.86);
          border: 0.5px solid rgba(255, 249, 244, 0.18);
          border-radius: 999px;
          color: #FFF9F4;
          font-size: 11px;
          font-weight: 300;
          left: 50%;
          letter-spacing: 1px;
          padding: 10px 16px;
          position: fixed;
          top: 86px;
          transform: translateX(-50%);
          z-index: 80;
        }

        .saveToast a {
          color: #FFF9F4;
          font-weight: 400;
          margin-left: 8px;
          text-decoration: underline;
          text-underline-offset: 3px;
        }

        .styleChat {
          flex: 1;
          overflow-y: auto;
          padding: 32px 48px 112px;
        }

        .styleChat.resultMode,
        .styleChat.uploadMode {
          padding: 0;
        }

        .chatInner {
          margin: 0 auto;
          max-width: 800px;
          width: 100%;
        }

        .welcomeState {
          align-items: center;
          display: flex;
          flex-direction: column;
          min-height: calc(100vh - 260px);
          justify-content: center;
          text-align: center;
        }

        .welcomeState h1 {
          color: var(--ink);
          font-family: var(--font-style-display);
          font-size: 32px;
          font-style: italic;
          font-weight: 300;
          line-height: 1.2;
          margin: 0;
        }

        .welcomeState p {
          color: var(--muted);
          font-size: 12px;
          font-weight: 300;
          line-height: 1.7;
          margin: 8px 0 0;
        }

        .onboardingShell {
          align-items: center;
          display: flex;
          flex-direction: column;
          justify-content: center;
          margin: 0 auto;
          min-height: calc(100vh - 260px);
          max-width: 760px;
          width: 100%;
        }

        .onboardingDots {
          display: flex;
          gap: 10px;
          margin-bottom: 32px;
        }

        .onboardingDots span {
          border: 0.5px solid var(--line);
          border-radius: 50%;
          height: 9px;
          width: 9px;
        }

        .onboardingDots span.active {
          background: var(--rose);
          border-color: var(--rose);
        }

        .onboardingQuestion,
        .onboardingFreeText {
          align-items: center;
          display: flex;
          flex-direction: column;
          text-align: center;
          width: 100%;
        }

        .onboardingQuestion > p,
        .onboardingFreeText > p {
          color: var(--ink);
          font-family: var(--font-style-display);
          font-size: 26px;
          font-style: italic;
          font-weight: 300;
          line-height: 1.35;
          margin: 0 0 24px;
          max-width: 620px;
        }

        .onboardingOptions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          justify-content: center;
          max-width: 720px;
        }

        .onboardingOptions button,
        .onboardingFreeText button {
          background: var(--paper);
          border: 0.5px solid var(--line);
          border-radius: 22px;
          color: var(--ink);
          cursor: pointer;
          font-family: var(--font-style-sans);
          font-size: 12px;
          font-weight: 300;
          line-height: 1.4;
          padding: 11px 18px;
          transition: 0.2s ease;
        }

        .onboardingOptions button:hover,
        .onboardingOptions button.selected,
        .onboardingFreeText button:hover:not(:disabled) {
          background: #F4DCE4;
          border-color: var(--rose);
          color: var(--rose);
        }

        .onboardingOptions .onboardingDone {
          background: var(--ink);
          border-color: var(--ink);
          color: var(--paper);
        }

        .onboardingFreeText input {
          background: var(--paper);
          border: 0.5px solid var(--line);
          border-radius: 28px;
          color: var(--ink);
          font-family: var(--font-style-sans);
          font-size: 14px;
          font-weight: 300;
          margin-bottom: 14px;
          max-width: 620px;
          outline: none;
          padding: 15px 22px;
          width: 100%;
        }

        .onboardingFreeText input:focus {
          border-color: var(--rose);
        }

        .onboardingFreeText button:disabled {
          cursor: default;
          opacity: 0.45;
        }

        .chipRow,
        .followUps,
        .trendPills {
          display: flex;
          gap: 10px;
          overflow-x: auto;
          padding: 2px 0 8px;
          width: 100%;
        }

        .chipRow {
          margin-top: 28px;
          justify-content: flex-start;
        }

        .chipRow button,
        .followUps button {
          background: var(--paper);
          border: 0.5px solid var(--line);
          border-radius: 20px;
          color: var(--ink);
          cursor: pointer;
          flex: 0 0 auto;
          font-family: var(--font-style-sans);
          font-size: 12px;
          font-weight: 300;
          max-width: none;
          overflow: visible;
          padding: 10px 20px;
          text-overflow: clip;
          transition: 0.2s ease;
          white-space: nowrap;
        }

        .chipRow button:hover,
        .followUps button:hover {
          border-color: var(--rose);
          color: var(--rose);
        }

        .messageRow {
          display: flex;
          margin-bottom: 16px;
        }

        .messageRow.user {
          justify-content: flex-end;
        }

        .messageRow.assistant {
          justify-content: flex-start;
          margin-bottom: 24px;
        }

        .userBubble {
          background: var(--ink);
          border-radius: 16px 16px 4px 16px;
          color: var(--paper);
          font-size: 14px;
          font-weight: 300;
          line-height: 1.6;
          max-width: 70%;
          padding: 12px 18px;
        }

        .assistantCard {
          background: transparent;
          max-width: 100%;
          width: 100%;
        }

        .assistantMain {
          color: var(--ink);
          font-family: var(--font-style-display);
          font-size: 18px;
          font-style: italic;
          font-weight: 300;
          line-height: 1.7;
          margin: 0;
        }

        .assistantSection {
          margin-top: 24px;
        }

        .directionGrid {
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          margin-top: 12px;
        }

        .directionCard {
          background: var(--paper);
          border-radius: 2px;
          padding: 16px;
        }

        .directionOccasion {
          color: var(--muted);
          font-size: 8px;
          font-weight: 200;
          letter-spacing: 3px;
          margin: 0 0 10px;
          text-transform: uppercase;
        }

        .directionText {
          color: var(--ink);
          font-family: var(--font-style-display);
          font-size: 16px;
          font-style: italic;
          font-weight: 300;
          line-height: 1.5;
          margin: 0;
        }

        .chatOutfitCard {
          margin-top: 14px;
          width: 100%;
        }

        .chatOutfitCard > img {
          background: #F0EBE3;
          border-radius: 8px;
          display: block;
          height: 320px;
          object-fit: contain;
          object-position: top center;
          width: 100%;
        }

        .chatOutfitActions {
          display: grid;
          gap: 8px;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          margin-top: 12px;
        }

        .chatOutfitActions button {
          border-radius: 999px;
          cursor: pointer;
          font-family: var(--font-style-sans);
          font-size: 9px;
          font-weight: 300;
          letter-spacing: 2px;
          padding: 11px 12px;
          text-transform: uppercase;
          transition: 0.25s ease;
        }

        .chatOutfitShop {
          background: #B03A5B;
          border: 0.5px solid #B03A5B;
          color: #FFF9F4;
        }

        .chatOutfitMine {
          background: transparent;
          border: 0.5px solid rgba(44, 36, 24, 0.28);
          color: var(--ink);
        }

        .chatOutfitActions button:hover {
          transform: translateY(-1px);
        }

        .productGroups {
          display: grid;
          gap: 18px;
          margin-top: 18px;
        }

        .productGroupLabel {
          color: #B8ADA2;
          font-size: 8px;
          font-weight: 200;
          letter-spacing: 2px;
          margin: 0 0 8px;
          text-transform: uppercase;
        }

        .productRow {
          display: flex;
          gap: 12px;
          overflow-x: auto;
          padding: 0 0 8px;
        }

        .productCard {
          background: #FAF7F4;
          border: 0.5px solid #E8E0D4;
          border-radius: 2px;
          box-shadow: none;
          color: var(--ink);
          cursor: pointer;
          flex: 0 0 160px;
          font-family: var(--font-style-sans);
          overflow: hidden;
          padding: 0;
          text-align: left;
          transition: 0.3s ease;
          width: 160px;
        }

        .productCard:hover {
          box-shadow: 0 8px 24px rgba(44,36,24,0.1);
          transform: translateY(-3px);
        }

        .productImage {
          align-items: center;
          background: #FFFFFF;
          border-bottom: 0.5px solid #E8E0D4;
          display: flex;
          height: 200px;
          justify-content: center;
          width: 160px;
        }

        .productImage img {
          height: 100%;
          object-fit: contain;
          width: 100%;
        }

        .productBody {
          background: #FAF7F4;
          padding: 10px;
        }

        .productSource {
          color: #B8ADA2;
          font-family: var(--font-style-sans);
          font-size: 8px;
          font-style: normal;
          font-weight: 200;
          letter-spacing: 1px;
          line-height: 1.3;
          margin: 0 0 4px;
        }

        .productTitle {
          color: var(--ink);
          display: -webkit-box;
          font-size: 11px;
          font-weight: 300;
          line-height: 1.4;
          margin: 0 0 6px;
          overflow: hidden;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
        }

        .productPrice {
          color: var(--rose);
          font-size: 12px;
          font-weight: 400;
          margin: 0 0 8px;
        }

        .productShop {
          color: var(--rose);
          font-size: 9px;
          font-weight: 200;
          letter-spacing: 2px;
          margin: 0;
          text-transform: uppercase;
        }

        .productSkeleton {
          animation: styleProductPulse 1.4s ease-in-out infinite;
          background: #E8E0D4;
          border-radius: 2px;
          flex: 0 0 160px;
          height: 294px;
          width: 160px;
        }

        @keyframes styleProductPulse {
          0%, 100% { opacity: 0.55; }
          50% { opacity: 1; }
        }

        .trendPills {
          margin-top: 12px;
        }

        .trendPills span {
          background: #F4DCE4;
          border-radius: 20px;
          color: var(--rose);
          flex: 0 0 auto;
          font-size: 11px;
          font-weight: 300;
          padding: 6px 14px;
          white-space: nowrap;
        }

        .followUps {
          margin-top: 24px;
        }

        .styleTyping {
          align-items: center;
          background: var(--paper);
          border-radius: 2px;
          display: inline-flex;
          gap: 8px;
          padding: 16px;
        }

        .styleTyping span {
          animation: styleBounce 0.9s infinite ease-in-out;
          background: #C4B4A6;
          border-radius: 50%;
          height: 6px;
          width: 6px;
        }

        .styleTyping span:nth-child(2) {
          animation-delay: 0.2s;
        }

        .styleTyping span:nth-child(3) {
          animation-delay: 0.4s;
        }

        @keyframes styleBounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.45; }
          40% { transform: translateY(-5px); opacity: 1; }
        }

        .styleInputBar {
          background: var(--paper);
          border-top: 0.5px solid var(--line);
          bottom: 0;
          left: 0;
          padding: 16px 48px;
          position: fixed;
          right: 0;
          z-index: 45;
        }

        .chatImagePreview {
          align-items: center;
          background: var(--paper);
          border-radius: 12px;
          display: inline-flex;
          gap: 8px;
          margin: 0 auto 8px;
          max-width: 800px;
          padding: 8px;
        }

        .chatImagePreview img {
          border-radius: 8px;
          height: 48px;
          object-fit: cover;
          width: 48px;
        }

        .chatImagePreview button {
          background: transparent;
          border: 0;
          color: var(--muted);
          cursor: pointer;
          font-family: var(--font-style-sans);
          font-size: 14px;
          font-weight: 300;
          padding: 4px;
        }

        .styleInputRow {
          align-items: flex-end;
          display: flex;
          gap: 12px;
          margin: 0 auto;
          max-width: 800px;
          width: 100%;
        }

        .styleInputRow textarea {
          background: #FAF7F4;
          border: 0.5px solid var(--line);
          border-radius: 24px;
          color: var(--ink);
          flex: 1;
          font-family: var(--font-style-sans);
          font-size: 14px;
          font-weight: 300;
          line-height: 1.6;
          max-height: 200px;
          min-height: 48px;
          outline: none;
          overflow-y: auto;
          padding: 14px 20px;
          resize: none;
          transition: 0.2s ease;
          width: 100%;
        }

        .styleInputRow textarea:focus {
          border-color: var(--rose);
        }

        .attachButton {
          align-items: center;
          background: transparent;
          border: 0;
          color: #C4B4A6;
          cursor: pointer;
          display: flex;
          height: 48px;
          justify-content: center;
          padding: 0;
          transition: 0.2s ease;
          width: 28px;
        }

        .attachButton:hover {
          color: var(--rose);
        }

        .styleInputRow button[type="submit"] {
          align-items: center;
          background: var(--rose);
          border: 0;
          border-radius: 50%;
          color: white;
          cursor: pointer;
          display: flex;
          height: 44px;
          justify-content: center;
          transition: 0.2s ease;
          width: 44px;
        }

        .styleInputRow button[type="submit"]:hover:not(:disabled) {
          background: #8C2A40;
        }

        .styleInputRow button[type="submit"]:disabled {
          cursor: default;
          opacity: 0.45;
        }

        .resetOverlay {
          align-items: center;
          background: rgba(28,20,16,0.28);
          display: flex;
          inset: 0;
          justify-content: center;
          padding: 24px;
          position: fixed;
          z-index: 80;
        }

        .memoryOverlay {
          background: rgba(0,0,0,0.2);
          inset: 0;
          position: fixed;
          z-index: 70;
        }

        .memoryPanel {
          animation: memorySlideIn 0.3s ease both;
          background: var(--paper);
          border-left: 0.5px solid var(--line);
          bottom: 0;
          box-shadow: -12px 0 32px rgba(44,36,24,0.08);
          height: 100vh;
          overflow-y: auto;
          padding: 32px 24px;
          position: fixed;
          right: 0;
          top: 0;
          width: 320px;
        }

        @keyframes memorySlideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }

        .memoryPanel h2 {
          color: var(--ink);
          font-family: var(--font-style-display);
          font-size: 22px;
          font-style: italic;
          font-weight: 300;
          line-height: 1.15;
          margin: 0 32px 24px 0;
        }

        .memoryClose {
          background: transparent;
          border: 0;
          color: var(--muted);
          cursor: pointer;
          font-family: var(--font-style-sans);
          font-size: 18px;
          font-weight: 300;
          position: absolute;
          right: 20px;
          top: 24px;
        }

        .memoryItem {
          margin-bottom: 20px;
        }

        .memoryItem p {
          color: var(--rose);
          font-size: 8px;
          font-weight: 200;
          letter-spacing: 4px;
          margin: 0 0 8px;
          text-transform: uppercase;
        }

        .memoryItem span {
          color: var(--ink);
          display: block;
          font-size: 13px;
          font-weight: 300;
          line-height: 1.6;
        }

        .memoryItem em {
          color: var(--muted);
          display: block;
          font-family: var(--font-style-display);
          font-size: 15px;
          font-style: italic;
          font-weight: 300;
          line-height: 1.6;
        }

        .memoryPills {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .memoryPills span {
          background: #F4DCE4;
          border-radius: 20px;
          color: var(--rose);
          display: inline-flex;
          font-size: 11px;
          font-weight: 300;
          line-height: 1;
          padding: 7px 11px;
        }

        .clearMemoryButton {
          background: transparent;
          border: 0;
          color: #C4B4A6;
          cursor: pointer;
          font-family: var(--font-style-sans);
          font-size: 9px;
          font-weight: 200;
          margin-top: 16px;
          padding: 0;
          text-align: left;
        }

        .clearMemoryButton:hover {
          color: var(--rose);
        }

        .resetDialog {
          background: var(--paper);
          border: 0.5px solid var(--line);
          border-radius: 2px;
          max-width: 360px;
          padding: 32px;
          width: 100%;
        }

        .resetDialog h2 {
          color: var(--ink);
          font-family: var(--font-style-display);
          font-size: 28px;
          font-style: italic;
          font-weight: 300;
          line-height: 1.1;
          margin: 0 0 8px;
        }

        .resetDialog p {
          color: var(--muted);
          font-size: 12px;
          font-weight: 300;
          line-height: 1.6;
          margin: 0 0 24px;
        }

        .resetDialog div {
          display: flex;
          gap: 10px;
        }

        .resetDialog button {
          background: var(--ivory);
          border: 0.5px solid var(--line);
          border-radius: 20px;
          color: var(--ink);
          cursor: pointer;
          font-family: var(--font-style-sans);
          font-size: 11px;
          font-weight: 300;
          padding: 10px 18px;
          transition: 0.2s ease;
        }

        .resetDialog button:first-child {
          background: var(--ink);
          border-color: var(--ink);
          color: var(--paper);
        }

        .resetDialog button:hover {
          border-color: var(--rose);
          color: var(--rose);
        }

        .photoUploadState {
          align-items: center;
          display: flex;
          flex: 1;
          flex-direction: column;
          justify-content: center;
          min-height: calc(100vh - 170px);
          padding: 24px;
          text-align: center;
        }

        .photoUploadState h1 {
          color: var(--ink);
          font-family: var(--font-style-display);
          font-size: 48px;
          font-style: italic;
          font-weight: 300;
          line-height: 1.1;
          margin: 0;
        }

        .photoUploadState > p {
          color: var(--muted);
          font-size: 13px;
          font-weight: 300;
          line-height: 1.7;
          margin: 12px auto 28px;
          max-width: 460px;
        }

        .photoUploadBox {
          align-items: center;
          background: var(--paper);
          border: 1.5px dashed var(--line);
          border-radius: 4px;
          color: #C4B4A6;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          height: 480px;
          justify-content: center;
          overflow: hidden;
          position: relative;
          transition: 0.2s ease;
          max-width: 500px;
          width: 100%;
        }

        .photoUploadBox:hover,
        .photoUploadBox.dragging {
          background: #EDE8DF;
          border-color: var(--rose);
        }

        .photoUploadBox.dragging {
          box-shadow: inset 0 0 0 999px rgba(176,58,91,0.06);
        }

        .photoUploadBox span {
          color: var(--muted);
          font-family: var(--font-style-display);
          font-size: 20px;
          font-style: italic;
          font-weight: 300;
          margin-top: 16px;
        }

        .photoUploadBox small {
          color: #C4B4A6;
          font-size: 10px;
          font-weight: 200;
          margin-top: 8px;
        }

        .photoPrivacy {
          color: #C4B4A6 !important;
          font-size: 9px !important;
          font-weight: 200 !important;
          margin-top: 16px !important;
        }

        .photoTip {
          color: #C4B4A6 !important;
          font-size: 9px !important;
          font-weight: 200 !important;
          margin: 10px auto 0 !important;
          text-align: center;
        }

        .photoPreviewBox {
          background: #EDE8DF;
        }

        .photoPreviewBox img {
          height: 100%;
          object-fit: contain;
          width: 100%;
        }

        .analysisOverlay {
          align-items: center;
          background: rgba(28,20,16,0.5);
          color: var(--paper);
          display: flex;
          flex-direction: column;
          inset: 0;
          justify-content: center;
          position: absolute;
        }

        .analysisOverlay .styleTyping {
          background: transparent;
        }

        .analysisOverlay .styleTyping span {
          background: var(--paper);
        }

        .analysisOverlay p {
          color: var(--paper);
          font-family: var(--font-style-display);
          font-size: 16px;
          font-style: italic;
          font-weight: 300;
          margin: 6px 0 0;
        }

        .vibeResult {
          display: grid;
          grid-template-columns: 40% 60%;
          height: 100%;
          min-height: calc(100vh - 124px);
          width: 100%;
        }

        .vibePhotoPane {
          align-items: center;
          background: #EDE8DF;
          display: flex;
          justify-content: center;
          min-height: calc(100vh - 124px);
          overflow: hidden;
          padding: 24px;
        }

        .vibePhotoPane img {
          height: auto;
          max-height: 600px;
          max-width: 100%;
          object-fit: contain;
          width: auto;
        }

        .vibeContentPane {
          overflow-y: auto;
          padding: 48px;
        }

        .vibeLabel {
          color: var(--rose);
          font-size: 8px;
          font-weight: 200;
          letter-spacing: 5px;
          margin: 0 0 12px;
          text-transform: uppercase;
        }

        .sectionGap {
          margin-top: 32px;
        }

        .vibeContentPane h1 {
          color: var(--ink);
          font-family: var(--font-style-display);
          font-size: 36px;
          font-style: italic;
          font-weight: 300;
          line-height: 1.2;
          margin: 0;
        }

        .workingCopy {
          color: var(--ink);
          font-family: var(--font-style-display);
          font-size: 18px;
          font-style: italic;
          font-weight: 300;
          line-height: 1.7;
          margin: 0;
        }

        .upgradeCopy {
          color: var(--ink);
          font-size: 14px;
          font-weight: 300;
          line-height: 1.7;
          margin: 0;
        }

        .resultDirectionStack {
          display: grid;
          gap: 12px;
        }

        .continueBlock {
          margin-top: 36px;
          padding-bottom: 24px;
        }

        .continueBlock h2 {
          color: var(--muted);
          font-family: var(--font-style-display);
          font-size: 20px;
          font-style: italic;
          font-weight: 300;
          margin: 0;
        }

        .continueBlock > p {
          color: #C4B4A6;
          font-size: 12px;
          font-weight: 300;
          margin: 8px 0 14px;
        }

        .compactChat {
          display: flex;
          max-width: 520px;
        }

        .compactChat input {
          background: var(--ivory);
          border: 0.5px solid var(--line);
          border-radius: 22px;
          color: var(--ink);
          flex: 1;
          font-family: var(--font-style-sans);
          font-size: 13px;
          font-weight: 300;
          outline: none;
          padding: 12px 18px;
        }

        .compactChat input:focus {
          border-color: var(--rose);
        }

        .compactChat button {
          align-items: center;
          background: var(--rose);
          border: 0;
          border-radius: 50%;
          color: white;
          cursor: pointer;
          display: flex;
          height: 40px;
          justify-content: center;
          margin-left: 10px;
          width: 40px;
        }

        .compactChat button:disabled {
          opacity: 0.45;
        }

        .startFresh {
          background: transparent;
          border: 0;
          color: #C4B4A6;
          cursor: pointer;
          font-family: var(--font-style-sans);
          font-size: 9px;
          font-weight: 200;
          letter-spacing: 2px;
          margin-top: 14px;
          padding: 0;
          text-transform: uppercase;
        }

        .photoChatInner {
          padding-top: 8px;
        }

        .photoChatContext {
          align-items: center;
          display: flex;
          gap: 12px;
          margin-bottom: 24px;
        }

        .photoChatContext img {
          border-radius: 50%;
          height: 48px;
          object-fit: cover;
          width: 48px;
        }

        .photoChatContext span {
          color: var(--muted);
          font-size: 10px;
          font-weight: 200;
        }

        .stylePieceShell {
          background: #F0EBE3;
          border: 0.5px solid var(--line);
          border-radius: 8px;
          display: grid;
          gap: 20px;
          grid-template-columns: minmax(0, 1fr) 220px;
          margin: 0 auto 20px;
          max-width: 1220px;
          padding: 26px 48px;
          width: 100%;
        }

        .stylePieceCopy h2 {
          color: var(--ink);
          font-family: var(--font-style-display);
          font-size: 34px;
          font-style: italic;
          font-weight: 300;
          line-height: 1;
          margin: 10px 0 8px;
        }

        .stylePieceCopy p:not(.styleLabel) {
          color: var(--muted);
          font-size: 13px;
          font-weight: 300;
          margin: 0;
        }

        .stylePieceUpload {
          align-items: center;
          align-self: start;
          background: rgba(250, 247, 244, 0.58);
          border: 0.75px dashed #BDAFA2;
          border-radius: 8px;
          color: var(--ink);
          cursor: pointer;
          display: flex;
          flex-direction: column;
          gap: 8px;
          height: 180px;
          justify-content: center;
          overflow: hidden;
          padding: 16px;
          text-align: center;
        }

        .stylePieceUpload img {
          height: 100%;
          object-fit: contain;
          width: 100%;
        }

        .stylePieceUpload span {
          color: var(--ink);
          font-family: var(--font-style-display);
          font-size: 18px;
          font-style: italic;
          font-weight: 300;
        }

        .stylePieceUpload small {
          color: var(--muted);
          font-size: 8px;
          font-weight: 300;
          letter-spacing: 2px;
        }

        .stylePieceResults {
          grid-column: 1 / -1;
        }

        .stylePieceDescription {
          color: var(--muted);
          font-family: var(--font-style-display);
          font-size: 18px;
          font-style: italic;
          font-weight: 300;
          margin: 2px 0 16px;
        }

        .stylePieceCards {
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .stylePieceCard {
          background: #FAF7F4;
          border: 0.5px solid #E1D7CC;
          border-radius: 8px;
          padding: 18px;
        }

        .stylePieceCard p {
          color: var(--rose);
          font-size: 8px;
          font-weight: 300;
          letter-spacing: 3px;
          margin: 0 0 12px;
          text-transform: uppercase;
        }

        .stylePieceCard h3 {
          color: var(--ink);
          font-family: var(--font-style-display);
          font-size: 19px;
          font-style: italic;
          font-weight: 300;
          line-height: 1.35;
          margin: 0 0 14px;
        }

        .stylePieceCard em {
          color: var(--muted);
          font-size: 12px;
          font-weight: 300;
          line-height: 1.5;
        }

        .stylePieceAsk {
          background: transparent;
          border: 0.5px solid var(--ink);
          border-radius: 999px;
          color: var(--ink);
          cursor: pointer;
          font-family: var(--font-style-sans);
          font-size: 9px;
          font-weight: 300;
          letter-spacing: 2px;
          margin-top: 16px;
          padding: 12px 16px;
          text-transform: uppercase;
        }

        .lookbookShell {
          border-bottom: 0.5px solid var(--line);
          margin: 0 auto 24px;
          max-width: 1220px;
          padding: 36px 48px 30px;
          width: 100%;
        }

        .lookbookHero {
          align-items: end;
          display: grid;
          gap: 24px;
          grid-template-columns: minmax(0, 1fr) auto;
          margin-bottom: 22px;
        }

        .lookbookHero h2 {
          color: var(--ink);
          font-family: var(--font-style-display);
          font-size: 64px;
          font-style: italic;
          font-weight: 300;
          letter-spacing: 0;
          line-height: 0.95;
          margin: 12px 0 10px;
          max-width: 760px;
        }

        .lookbookHero p:not(.styleLabel) {
          color: var(--muted);
          font-size: 13px;
          font-weight: 300;
          line-height: 1.65;
          margin: 0;
          max-width: 560px;
        }

        .lookbookHero > span {
          color: #B8ADA2;
          font-size: 9px;
          font-weight: 200;
          letter-spacing: 2px;
          text-transform: uppercase;
        }

        .lookbookFilterRail {
          display: flex;
          gap: 10px;
          margin-bottom: 20px;
          overflow-x: auto;
          padding-bottom: 6px;
        }

        .lookbookFilterRail button {
          background: var(--paper);
          border: 0.5px solid var(--line);
          border-radius: 20px;
          color: var(--ink);
          cursor: pointer;
          flex: 0 0 auto;
          font-family: var(--font-style-sans);
          font-size: 10px;
          font-weight: 300;
          letter-spacing: 2px;
          padding: 10px 16px;
          text-transform: uppercase;
          transition: 0.2s ease;
        }

        .lookbookFilterRail button.active,
        .lookbookFilterRail button:hover {
          background: var(--ink);
          border-color: var(--ink);
          color: var(--paper);
        }

        .styleResearchShell {
          background: #F0EBE3;
          border: 0.5px solid var(--line);
          border-radius: 10px;
          margin: 18px 0 28px;
          padding: 22px;
        }

        .styleResearchHeader {
          align-items: start;
          display: flex;
          gap: 20px;
          justify-content: space-between;
          margin-bottom: 16px;
        }

        .styleResearchHeader h3,
        .styleResearchResult h3 {
          color: var(--ink);
          font-family: var(--font-style-display);
          font-size: 30px;
          font-style: italic;
          font-weight: 300;
          line-height: 1.05;
          margin: 9px 0 8px;
        }

        .styleResearchHeader p:not(.styleLabel),
        .styleResearchResult > p {
          color: var(--muted);
          font-size: 12px;
          font-weight: 300;
          line-height: 1.7;
          margin: 0;
          max-width: 680px;
        }

        .styleResearchHeader > span {
          color: var(--rose);
          font-size: 9px;
          font-weight: 300;
          letter-spacing: 2px;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .styleResearchForm {
          align-items: center;
          display: grid;
          gap: 10px;
          grid-template-columns: minmax(0, 1fr) auto;
        }

        .styleResearchForm input {
          background: #FAF7F4;
          border: 0.5px solid var(--line);
          border-radius: 999px;
          color: var(--ink);
          font-family: var(--font-style-sans);
          font-size: 14px;
          font-weight: 300;
          outline: none;
          padding: 14px 18px;
          width: 100%;
        }

        .styleResearchForm input:focus {
          border-color: var(--rose);
        }

        .styleResearchForm button {
          background: var(--ink);
          border: 0;
          border-radius: 999px;
          color: var(--paper);
          cursor: pointer;
          font-family: var(--font-style-sans);
          font-size: 10px;
          font-weight: 300;
          letter-spacing: 2px;
          padding: 14px 18px;
          text-transform: uppercase;
        }

        .styleResearchForm button:disabled {
          cursor: default;
          opacity: 0.45;
        }

        .styleResearchExamples {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 12px;
        }

        .styleResearchExamples button {
          background: transparent;
          border: 0.5px solid #D8CCC0;
          border-radius: 999px;
          color: var(--muted);
          cursor: pointer;
          font-family: var(--font-style-sans);
          font-size: 10px;
          font-weight: 300;
          padding: 8px 12px;
        }

        .styleResearchExamples button:hover {
          border-color: var(--rose);
          color: var(--rose);
        }

        .styleResearchResult {
          border-top: 0.5px solid var(--line);
          margin-top: 20px;
          padding-top: 20px;
        }

        .styleResearchMeta {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 14px;
        }

        .styleResearchMeta span {
          background: #F4DCE4;
          border-radius: 999px;
          color: var(--rose);
          font-size: 10px;
          font-weight: 300;
          padding: 6px 10px;
        }

        .styleResearchSources {
          display: grid;
          gap: 8px;
          margin-top: 14px;
        }

        .styleResearchSources a {
          border-left: 1px solid var(--line);
          color: var(--muted);
          display: grid;
          font-size: 11px;
          font-weight: 300;
          gap: 3px;
          line-height: 1.45;
          padding-left: 10px;
        }

        .styleResearchSources a span {
          color: var(--rose);
          font-size: 8px;
          letter-spacing: 2px;
          text-transform: uppercase;
        }

        .lookbookGrid {
          display: grid;
          gap: 16px;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          margin-top: 24px;
        }

        .lookbookGrid .lookCard {
          min-height: 500px;
        }

        .lookbookGrid .heroLookCard {
          grid-column: 1 / -1;
          min-height: 70vh;
        }

        .lookCard {
          background: #E8E2DA;
          border: 0;
          border-radius: 8px;
          color: white;
          cursor: pointer;
          min-height: 500px;
          overflow: hidden;
          position: relative;
        }

        .saveLookButton {
          align-items: center;
          backdrop-filter: blur(10px);
          background: rgba(0, 0, 0, 0.2);
          border: 0;
          border-radius: 999px;
          color: #FFFFFF;
          cursor: pointer;
          display: flex;
          filter: drop-shadow(0 3px 8px rgba(0, 0, 0, 0.28));
          height: 36px;
          justify-content: center;
          padding: 0;
          position: absolute;
          right: 12px;
          top: 12px;
          width: 36px;
          z-index: 8;
        }

        .saveLookButton.saved {
          color: #B03A5B;
        }

        .personaliseBanner {
          align-items: center;
          background: #F0EBE3;
          border: 0.5px solid #D8CCC0;
          border-radius: 8px;
          display: grid;
          gap: 16px;
          grid-template-columns: minmax(0, 1fr) auto auto;
          margin: 18px 0 6px;
          padding: 18px 18px 18px 20px;
        }

        .personaliseBanner p {
          color: var(--ink);
          font-family: var(--font-style-display);
          font-size: 22px;
          font-style: italic;
          font-weight: 300;
          line-height: 1.15;
          margin: 0 0 5px;
        }

        .personaliseBanner span {
          color: var(--muted);
          font-size: 12px;
          font-weight: 300;
        }

        .personaliseBannerCta {
          background: #B03A5B;
          border: 0.5px solid #B03A5B;
          border-radius: 999px;
          color: #FFF9F4;
          cursor: pointer;
          font-family: var(--font-style-sans);
          font-size: 9px;
          font-weight: 300;
          letter-spacing: 2px;
          padding: 12px 16px;
          text-transform: uppercase;
        }

        .personaliseBannerClose {
          align-items: center;
          background: transparent;
          border: 0;
          color: var(--muted);
          cursor: pointer;
          display: flex;
          justify-content: center;
          padding: 6px;
        }

        .lookCardImage {
          display: block;
          height: 16rem;
          object-fit: cover;
          width: 100%;
        }

        .pexelsAttribution {
          color: #A8A29E;
          font-size: 10px;
          font-weight: 300;
          line-height: 1.2;
          margin: 4px 12px 0;
        }

        .heroLookCard {
          min-height: 70vh;
        }

        .lookCard.wide {
          grid-column: span 2;
        }

        .lookVisual {
          background: #E8E2DA;
          inset: 0;
          overflow: hidden;
          position: absolute;
          width: 100%;
          height: 100%;
        }

        .heroLookCard .lookVisual,
        .lookVisual.compact {
          inset: 0;
          position: absolute;
          width: 100%;
          height: 100%;
          min-height: 100%;
          overflow: hidden;
        }

        .lookVisual::after {
          background: linear-gradient(to top, rgba(28,20,16,0.68), rgba(28,20,16,0.24) 46%, rgba(28,20,16,0));
          bottom: 0;
          content: "";
          height: 42%;
          left: 0;
          position: absolute;
          right: 0;
          z-index: 1;
        }

        .lookVisual img {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: top center;
          display: block;
        }

        .lookVisual.hasImage::before {
          content: none;
        }

        .lookSwatches {
          display: flex;
          gap: 8px;
          position: relative;
          z-index: 3;
        }

        .lookSwatches span {
          border: 0.5px solid rgba(44,36,24,0.12);
          border-radius: 50%;
          height: 28px;
          width: 28px;
        }

        .lookRestCopy {
          bottom: 26px;
          left: 24px;
          position: absolute;
          right: 24px;
          z-index: 2;
        }

        .lookRestCopy h3,
        .lookHoverOverlay h3 {
          color: white;
          font-family: var(--font-style-display);
          font-size: 38px;
          font-style: italic;
          font-weight: 300;
          line-height: 1.02;
          margin: 0;
        }

        .heroLookCard .lookRestCopy {
          bottom: 42px;
          left: 42px;
          max-width: 760px;
          right: 42px;
        }

        .heroLookCard .lookRestCopy h3 {
          font-size: 72px;
        }

        .lookSeasonLabel {
          color: rgba(250,247,244,0.86);
          display: block;
          font-size: 10px;
          font-weight: 300;
          letter-spacing: 4px;
          margin-bottom: 12px;
          text-transform: uppercase;
        }

        .lookRestCopy p,
        .lookHoverOverlay p {
          color: rgba(255,255,255,0.82);
          font-size: 12px;
          font-weight: 300;
          letter-spacing: 1.8px;
          line-height: 1.45;
          margin: 8px 0 0;
          text-transform: uppercase;
        }

        .lookHoverOverlay {
          background: rgba(44,36,24,0.8);
          bottom: 0;
          display: flex;
          flex-direction: column;
          justify-content: end;
          left: 0;
          min-height: 50%;
          padding: 24px;
          position: absolute;
          right: 0;
          z-index: 4;
        }

        .lookHoverOverlay h3 {
          font-size: 30px;
        }

        .heroLookCard .lookHoverOverlay h3 {
          font-size: 48px;
        }

        .lookHoverOverlay p {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .lookActions {
          display: flex;
          gap: 10px;
          margin-top: 18px;
        }

        .lookActions button {
          background: #B03A5B;
          border: 0.5px solid #B03A5B;
          border-radius: 22px;
          color: white;
          cursor: pointer;
          flex: 1;
          font-family: var(--font-style-sans);
          font-size: 10px;
          font-weight: 300;
          letter-spacing: 2px;
          padding: 10px 15px;
          text-transform: uppercase;
          transition: 0.2s ease;
        }

        .lookActions button:last-child {
          background: transparent;
          border-color: rgba(255,255,255,0.78);
          color: white;
        }

        .lookActions button:hover {
          background: white;
          border-color: white;
          color: #2C2418;
        }

        .heroLookActions {
          max-width: 420px;
        }

        .lookDrawerOverlay {
          background: #FAF7F4;
          bottom: 0;
          color: var(--ink);
          left: 0;
          overflow-y: auto;
          position: fixed;
          right: 0;
          top: 0;
          z-index: 120;
        }

        .lookDrawerClose {
          align-items: center;
          background: rgba(250,247,244,0.72);
          border: 0.5px solid rgba(44,36,24,0.16);
          border-radius: 50%;
          color: var(--ink);
          cursor: pointer;
          display: flex;
          height: 42px;
          justify-content: center;
          position: fixed;
          right: 24px;
          top: 24px;
          width: 42px;
          z-index: 130;
        }

        .lookDrawerContent {
          margin: 0 auto;
          max-width: 980px;
          padding: 0 24px 72px;
        }

        .lookDrawerIntro {
          padding-bottom: 42px;
        }

        .lookDrawerImage {
          background: #F0EBE3;
          height: 65vh;
          margin: 0 -24px;
          overflow: hidden;
          position: relative;
        }

        .lookDrawerImage img {
          display: block;
          height: 100%;
          object-fit: contain;
          object-position: center;
          width: 100%;
        }

        .moreLikeImage img {
          display: block;
          height: 100%;
          object-fit: cover;
          object-position: top center;
          width: 100%;
        }

        .lookDrawerText {
          padding-top: 28px;
        }

        .lookDrawerLabel {
          color: #9A8B7B;
          font-size: 10px;
          font-weight: 300;
          letter-spacing: 3px;
          line-height: 1.4;
          margin: 0 0 16px;
          text-transform: uppercase;
        }

        .lookDrawerText h2 {
          color: #2C2418;
          font-family: var(--font-style-display);
          font-size: 48px;
          font-style: italic;
          font-weight: 300;
          line-height: 0.98;
          margin: 0 0 12px;
        }

        .lookDrawerText p {
          color: #75685E;
          font-size: 13px;
          font-weight: 300;
          line-height: 1.6;
          margin: 0;
        }

        .lookDrawerText span {
          color: #9A8B7B;
          display: block;
          font-size: 9px;
          font-weight: 300;
          letter-spacing: 2px;
          margin-top: 16px;
          text-transform: uppercase;
        }

        .lookDrawerSection {
          border-top: 0.5px solid #E3D9CD;
          padding: 30px 0;
        }

        .lookDrawerSection > p:not(.lookDrawerLabel) {
          color: #4B4037;
          font-size: 14px;
          font-weight: 300;
          line-height: 1.7;
          margin: 0;
          max-width: 680px;
        }

        .lookDrawerPieces {
          display: grid;
          gap: 10px;
          margin-bottom: 22px;
        }

        .lookDrawerPieces p {
          border-bottom: 0.5px solid #E8E0D4;
          color: #2C2418;
          font-size: 15px;
          font-weight: 300;
          line-height: 1.4;
          margin: 0;
          padding-bottom: 10px;
        }

        .lookDrawerSection em {
          color: #75685E;
          display: block;
          font-family: var(--font-style-display);
          font-size: 22px;
          font-style: italic;
          font-weight: 300;
          line-height: 1.35;
          max-width: 720px;
        }

        .lookDrawerShopButton {
          background: #B03A5B;
          border: 0;
          border-radius: 28px;
          color: white;
          cursor: pointer;
          font-family: var(--font-style-sans);
          font-size: 11px;
          font-weight: 300;
          letter-spacing: 2.4px;
          padding: 16px 24px;
          text-transform: uppercase;
          width: 100%;
        }

        .lookVariationLoading {
          color: #9A8B7B;
          font-size: 12px;
          font-weight: 300;
          margin: 0 0 14px;
        }

        .lookVariationGrid {
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .lookVariationCard {
          background: #F0EBE3;
          border: 0.5px solid #E3D9CD;
          padding: 18px;
        }

        .lookVariationCard h3 {
          color: #2C2418;
          font-family: var(--font-style-display);
          font-size: 28px;
          font-style: italic;
          font-weight: 300;
          line-height: 1;
          margin: 0 0 8px;
        }

        .lookVariationCard > p {
          color: #4B4037;
          font-size: 13px;
          font-weight: 300;
          line-height: 1.55;
          margin: 0;
        }

        .lookVariationPieces {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 14px;
        }

        .lookVariationPieces span {
          color: #8C2A40;
          font-size: 9px;
          font-weight: 300;
          letter-spacing: 1.6px;
          text-transform: uppercase;
        }

        .lookVariationCard em {
          color: #75685E;
          display: block;
          font-size: 13px;
          font-style: italic;
          font-weight: 300;
          line-height: 1.5;
          margin-top: 14px;
        }

        .lookVariationActions {
          display: grid;
          gap: 8px;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          margin-top: 16px;
        }

        .lookVariationActions button {
          background: #B03A5B;
          border: 0.5px solid #B03A5B;
          border-radius: 24px;
          color: white;
          cursor: pointer;
          font-family: var(--font-style-sans);
          font-size: 9px;
          font-weight: 300;
          letter-spacing: 1.8px;
          padding: 11px 12px;
          text-transform: uppercase;
        }

        .lookVariationActions button:last-child {
          background: transparent;
          border-color: #B03A5B;
          color: #B03A5B;
        }

        .moreLikeRail {
          display: flex;
          gap: 14px;
          margin: 0 -24px;
          overflow-x: auto;
          padding: 0 24px 8px;
        }

        .moreLikeCard {
          background: transparent;
          border: 0;
          color: var(--ink);
          cursor: pointer;
          flex: 0 0 220px;
          padding: 0;
          text-align: left;
        }

        .moreLikeImage {
          background: #E8E2DA;
          border-radius: 8px;
          height: 280px;
          margin-bottom: 12px;
          overflow: hidden;
        }

        .moreLikeCard h3 {
          color: #2C2418;
          font-family: var(--font-style-display);
          font-size: 24px;
          font-style: italic;
          font-weight: 300;
          line-height: 1;
          margin: 0 0 6px;
        }

        .moreLikeCard p {
          color: #75685E;
          font-size: 11px;
          font-weight: 300;
          line-height: 1.45;
          margin: 0;
        }

        .lookbookShopSection {
          margin-top: 28px;
        }

        @media (max-width: 1024px) {
          .lookbookGrid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        .styleBriefShell {
          border-bottom: 0.5px solid var(--line);
          margin: 0 auto 24px;
          max-width: 1180px;
          padding: 36px 48px 28px;
          width: 100%;
        }

        .fashionIdentityPanel {
          background: #EDE8DF;
          border: 0.5px solid var(--line);
          display: grid;
          gap: 28px;
          grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.25fr);
          padding: 28px;
        }

        .fashionIdentityPanel.empty {
          align-items: end;
          grid-template-columns: minmax(0, 1fr) auto;
        }

        .fashionIdentityPanel h2 {
          color: var(--ink);
          font-family: var(--font-style-display);
          font-size: 42px;
          font-style: italic;
          font-weight: 300;
          line-height: 1.05;
          margin: 12px 0 12px;
        }

        .fashionIdentityPanel p {
          color: var(--muted);
          font-size: 13px;
          font-weight: 300;
          line-height: 1.65;
          margin: 0;
        }

        .identityLead > p:last-of-type {
          color: var(--ink);
          font-family: var(--font-style-display);
          font-size: 18px;
          font-style: italic;
          line-height: 1.5;
        }

        .identityActions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 22px;
        }

        .identityActions button,
        .fashionIdentityPanel.empty button,
        .briefHeroCard button,
        .briefTrendCard button,
        .revealProductsButton {
          background: transparent;
          border: 0.5px solid var(--rose);
          border-radius: 22px;
          color: var(--rose);
          cursor: pointer;
          font-family: var(--font-style-sans);
          font-size: 10px;
          font-weight: 300;
          letter-spacing: 2px;
          padding: 10px 15px;
          text-transform: uppercase;
          transition: 0.2s ease;
        }

        .identityActions button:first-child,
        .fashionIdentityPanel.empty button,
        .briefHeroCard button,
        .revealProductsButton {
          background: var(--rose);
          color: white;
        }

        .identityActions button:hover,
        .fashionIdentityPanel.empty button:hover,
        .briefHeroCard button:hover,
        .briefTrendCard button:hover,
        .revealProductsButton:hover {
          background: var(--ink);
          border-color: var(--ink);
          color: var(--paper);
        }

        .identityGrid {
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .identityGrid article {
          background: rgba(250,247,244,0.58);
          border-top: 0.5px solid var(--line);
          padding: 14px 0 0;
        }

        .identityGrid article:last-child {
          grid-column: 1 / -1;
        }

        .identityGrid span {
          color: var(--rose);
          display: block;
          font-size: 8px;
          font-weight: 200;
          letter-spacing: 3px;
          margin-bottom: 8px;
          text-transform: uppercase;
        }

        .briefHeader {
          margin-bottom: 28px;
          max-width: 720px;
        }

        .briefHeader h2 {
          color: var(--ink);
          font-family: var(--font-style-display);
          font-size: 44px;
          font-style: italic;
          font-weight: 300;
          letter-spacing: 0;
          line-height: 1.05;
          margin: 10px 0 0;
        }

        .briefHeader p:last-child {
          color: var(--muted);
          font-size: 12px;
          font-weight: 300;
          line-height: 1.6;
          margin: 12px 0 0;
        }

        .briefSection {
          margin-top: 28px;
        }

        .briefSectionHeader {
          align-items: center;
          display: flex;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 12px;
        }

        .briefSectionHeader span {
          color: #B8ADA2;
          font-size: 9px;
          font-weight: 200;
          letter-spacing: 2px;
          text-align: right;
          text-transform: uppercase;
        }

        .briefMeaningPanel {
          background: #F7EFEF;
          border-left: 2px solid var(--rose);
          margin: 0 0 18px;
          padding: 18px 20px;
        }

        .briefMeaningPanel p {
          color: var(--ink);
          font-family: var(--font-style-display);
          font-size: 21px;
          font-style: italic;
          font-weight: 300;
          line-height: 1.45;
          margin: 0;
        }

        .briefMeaningPanel span {
          color: var(--muted);
          display: block;
          font-size: 12px;
          font-weight: 300;
          line-height: 1.6;
          margin-top: 8px;
        }

        .briefTrendLayout {
          display: grid;
          gap: 14px;
          grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
        }

        .briefHeroCard,
        .briefTrendCard {
          background: var(--paper);
          border: 0.5px solid var(--line);
          border-radius: 3px;
          color: var(--ink);
          flex: 0 0 220px;
          font-family: var(--font-style-sans);
          min-height: 210px;
          padding: 18px;
          text-align: left;
          transition: 0.25s ease;
        }

        .briefHeroCard {
          background: #EDE8DF;
          min-height: 360px;
          padding: 28px;
        }

        .briefSupportGrid {
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .briefTrendCard {
          min-height: 170px;
        }

        .briefHeroCard:hover,
        .briefHeroCard.active,
        .briefTrendCard:hover,
        .briefTrendCard.active {
          background: #F7EFEF;
          border-color: rgba(176,58,91,0.55);
        }

        .briefTrendCard span,
        .briefHeroCard span,
        .dailyEditFeature span,
        .dailyEditCard span,
        .formulaCard span {
          color: var(--rose);
          display: block;
          font-size: 8px;
          font-weight: 200;
          letter-spacing: 3px;
          margin-bottom: 12px;
          text-transform: uppercase;
        }

        .briefHeroCard h3,
        .briefTrendCard h3 {
          color: var(--ink);
          font-family: var(--font-style-display);
          font-size: 24px;
          font-style: italic;
          font-weight: 300;
          line-height: 1.1;
          margin: 0 0 12px;
        }

        .briefHeroCard h3 {
          font-size: 36px;
          line-height: 1.05;
          max-width: 560px;
        }

        .briefHeroCard p,
        .briefTrendCard p,
        .dailyEditFeature p,
        .dailyEditCard p,
        .formulaCard p,
        .briefMuted {
          color: var(--muted);
          font-size: 12px;
          font-weight: 300;
          line-height: 1.55;
          margin: 0;
        }

        .briefHeroCard p {
          color: var(--ink);
          font-size: 14px;
          line-height: 1.7;
          max-width: 560px;
        }

        .briefHeroCard em,
        .briefTrendCard em {
          color: var(--ink);
          display: block;
          font-family: var(--font-style-display);
          font-size: 15px;
          font-style: italic;
          font-weight: 300;
          line-height: 1.45;
          margin-top: 14px;
        }

        .briefHeroCard button,
        .briefTrendCard button {
          margin-top: 18px;
        }

        .seasonDailyEdit {
          margin-top: 26px;
        }

        .dailyEditFeature {
          align-items: stretch;
          background: var(--paper);
          border: 0.5px solid var(--line);
          color: var(--ink);
          cursor: pointer;
          display: grid;
          gap: 18px;
          font-family: var(--font-style-sans);
          grid-template-columns: 88px 1fr;
          margin-top: 12px;
          padding: 18px;
          text-align: left;
        }

        .dailyEditFeature:hover {
          background: #F7EFEF;
        }

        .dailySwatchStrip {
          display: grid;
          gap: 6px;
          grid-template-columns: repeat(3, 1fr);
          min-height: 112px;
        }

        .dailySwatchStrip span:nth-child(1) { background: #E8D8CF; }
        .dailySwatchStrip span:nth-child(2) { background: #B03A5B; }
        .dailySwatchStrip span:nth-child(3) { background: #2C2418; }

        .dailyEditGrid {
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          margin-top: 12px;
        }

        .dailyEditCard,
        .formulaCard {
          background: transparent;
          border: 0;
          border-top: 0.5px solid var(--line);
          color: var(--ink);
          font-family: var(--font-style-sans);
          padding: 14px 0 0;
          text-align: left;
        }

        .dailyEditCard {
          cursor: pointer;
        }

        .dailyEditCard:hover p {
          color: var(--ink);
        }

        .formulaList {
          display: grid;
          gap: 14px;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          margin-top: 14px;
        }

        .shopPrompt {
          display: flex;
          gap: 10px;
          overflow-x: auto;
          padding-bottom: 4px;
        }

        .shopPrompt button {
          background: var(--paper);
          border: 0.5px solid var(--line);
          border-radius: 20px;
          color: var(--ink);
          cursor: pointer;
          flex: 0 0 auto;
          font-family: var(--font-style-sans);
          font-size: 11px;
          font-weight: 300;
          padding: 10px 16px;
        }

        .shopPrompt button:hover {
          border-color: var(--rose);
          color: var(--rose);
        }

        .askStylistDivider {
          border-top: 0.5px solid var(--line);
          margin-top: 32px;
          padding-top: 22px;
        }

        .askStylistDivider h3 {
          color: var(--ink);
          font-family: var(--font-style-display);
          font-size: 30px;
          font-style: italic;
          font-weight: 300;
          line-height: 1.1;
          margin: 12px 0 6px;
        }

        .askStylistDivider p:last-child {
          color: var(--muted);
          font-size: 13px;
          font-weight: 300;
          line-height: 1.6;
          margin: 0;
        }

        @media (max-width: 760px) {
          .styleTopBar {
            align-items: flex-start;
            flex-direction: column;
            gap: 14px;
            padding: 16px 20px;
          }

          .styleChat {
            padding: 16px 20px 96px;
          }

          .styleChat.uploadMode,
          .styleChat.resultMode {
            padding: 0 0 96px;
          }

          .lookbookShell {
            padding: 28px 20px 24px;
          }

          .lookbookHero {
            align-items: start;
            grid-template-columns: 1fr;
          }

          .stylePieceShell {
            grid-template-columns: 1fr;
            padding: 24px 20px;
          }

          .stylePieceUpload {
            max-width: 260px;
          }

          .stylePieceCards {
            grid-template-columns: 1fr;
          }

          .lookbookHero h2 {
            font-size: 46px;
          }

          .lookbookGrid {
            display: grid;
            grid-template-columns: 1fr;
          }

          .personaliseBanner {
            grid-template-columns: 1fr auto;
          }

          .personaliseBannerCta {
            grid-column: 1 / -1;
            width: 100%;
          }

          .heroLookCard {
            min-height: 70vh;
            margin-bottom: 14px;
          }

          .heroLookCard .lookVisual {
            min-height: 70vh;
          }

          .heroLookCard .lookRestCopy {
            bottom: 28px;
            left: 24px;
            right: 24px;
          }

          .heroLookCard .lookRestCopy h3,
          .heroLookCard .lookHoverOverlay h3 {
            font-size: 46px;
          }

          .lookCopy h3 {
            font-size: 30px;
          }

          .lookVisual.compact {
            min-height: 300px;
          }

          .lookVariationGrid,
          .lookVariationActions {
            grid-template-columns: 1fr;
          }

          .styleBriefShell {
            margin-bottom: 8px;
            padding: 28px 20px 24px;
          }

          .fashionIdentityPanel,
          .fashionIdentityPanel.empty,
          .identityGrid {
            grid-template-columns: 1fr;
          }

          .fashionIdentityPanel {
            padding: 22px;
          }

          .fashionIdentityPanel h2 {
            font-size: 34px;
          }

          .briefHeader h2 {
            font-size: 36px;
          }

          .briefSectionHeader {
            align-items: flex-start;
            flex-direction: column;
          }

          .briefSectionHeader span {
            text-align: left;
          }

          .briefTrendLayout,
          .briefSupportGrid,
          .dailyEditGrid,
          .formulaList {
            display: grid;
            grid-template-columns: 1fr;
          }

          .briefHeroCard {
            min-height: 0;
            padding: 22px;
          }

          .briefHeroCard h3 {
            font-size: 30px;
          }

          .briefTrendCard {
            min-height: 0;
          }

          .briefMeaningPanel p {
            font-size: 19px;
          }

          .dailyEditFeature {
            grid-template-columns: 1fr;
          }

          .dailySwatchStrip {
            min-height: 42px;
          }

          .welcomeState {
            min-height: calc(100vh - 260px);
          }

          .chipRow {
            justify-content: flex-start;
          }

          .directionGrid {
            display: flex;
            overflow-x: auto;
          }

          .directionCard {
            min-width: 230px;
          }

          .userBubble {
            max-width: 86%;
          }

          .styleInputBar {
            padding: 12px 20px;
          }

          .photoUploadState {
            padding: 20px;
          }

          .photoUploadState h1 {
            font-size: 40px;
          }

          .photoUploadBox {
            height: 480px;
            width: 100%;
          }

          .vibeResult {
            display: block;
            height: auto;
            min-height: 0;
          }

          .vibePhotoPane {
            height: 300px;
            min-height: 0;
            padding: 16px;
          }

          .vibeContentPane {
            padding: 32px 20px 96px;
          }
        }
      `}</style>

      <section className="styleTopBar">
        <div>
          <p className="styleLabel">STYLE</p>
          <h1 className="styleTitle">Your personal style assistant</h1>
        </div>
        <div className="genderToggle" aria-label="Gender edit">
          {profile?.onboarding_complete && photoPreview ? (
            <img className="rememberedPhoto" src={photoPreview} alt="Saved style profile" />
          ) : null}
          <button className="memoryButton" onClick={() => setMemoryOpen(true)} type="button" aria-label="Open Laila memory">
            <Brain size={18} strokeWidth={1.5} />
          </button>
          <button className={gender === "female" ? "active" : ""} onClick={() => setGender("female")} type="button">
            HER
          </button>
          <button className={gender === "male" ? "active" : ""} onClick={() => setGender("male")} type="button">
            HIM
          </button>
          {savedLooksAuthenticated && savedLookIds.size > 0 ? (
            <span className="savedLooksCount" aria-label={`${savedLookIds.size} saved looks`}>
              <Heart fill="currentColor" size={13} strokeWidth={1.6} />
              {savedLookIds.size}
            </span>
          ) : null}
          {profile?.onboarding_complete ? (
            <button className="editProfileButton" onClick={editProfile} type="button">
              Edit my profile
            </button>
          ) : null}
        </div>
      </section>

      <input
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(event) => handleFile(event.target.files?.[0])}
        ref={fileInputRef}
        type="file"
      />
      <input
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(event) => handleStylePieceImage(event.target.files?.[0])}
        ref={stylePieceFileInputRef}
        type="file"
      />

      <AnimatePresence>
        {saveToast ? (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="saveToast"
            exit={{ opacity: 0, y: -6 }}
            initial={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            {saveToast === "sign-in" ? (
              <>
                Sign in to save looks <a href="/signin">Sign In</a>
              </>
            ) : (
              saveToast
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <section className={`styleChat ${flowState === "result" ? "resultMode" : ""} ${flowState === "upload" || flowState === "analysing" ? "uploadMode" : ""}`} ref={chatRef}>
        <StylePieceSection
          loading={stylePieceLoading}
          onAskLaila={prefillChatPrompt}
          onUploadClick={() => stylePieceFileInputRef.current?.click()}
          preview={stylePiecePreview}
          result={stylePieceResult}
        />

        {styleBrief ? (
          <LookbookLayer
            activeFilter={activeLookbookFilter}
            analysis={analysis}
            brief={styleBrief}
            onAskLaila={askLailaForLook}
            onDismissPersonaliseBanner={dismissPersonaliseBanner}
            onFilterChange={setActiveLookbookFilter}
            onPersonaliseFeed={personaliseFeed}
            onShopClick={logShopClick}
            onShopLook={shopLook}
            onToggleSaveLook={toggleSaveLook}
            profile={profile}
            products={briefProducts}
            productsLoading={briefProductsLoading}
            savedLookIds={savedLookIds}
            selectedLook={selectedLook}
            showPersonaliseBanner={showPersonaliseBanner}
          />
        ) : null}

        {flowState === "upload" && photoUploadRequested ? (
          <div className="photoUploadState">
            <h1>What vibe do you give off?</h1>
            <p>Upload a photo and I'll tell you exactly what your style says — and how to make it say more.</p>
            <button
              className={`photoUploadBox ${dragging ? "dragging" : ""}`}
              onClick={() => fileInputRef.current?.click()}
              onDragLeave={() => setDragging(false)}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                handleFile(event.dataTransfer.files?.[0]);
              }}
              type="button"
            >
              <Camera size={32} strokeWidth={1.4} />
              <span>Drop your photo here</span>
              <small>or click to choose</small>
            </button>
            <p className="photoPrivacy">Your photo is saved only in this browser so I can remember your style.</p>
            <p className="photoTip">For best results: full body or half body photo works best</p>
          </div>
        ) : null}

        {flowState === "analysing" ? (
          <div className="photoUploadState">
            <div className="photoUploadBox photoPreviewBox">
              {photoPreview ? <img src={photoPreview} alt="Uploaded style preview" /> : null}
              <div className="analysisOverlay">
                <TypingCard />
                <p>{analysisTexts[analysisTextIndex]}</p>
              </div>
            </div>
            <p className="photoTip">For best results: full body or half body photo works best</p>
          </div>
        ) : null}

        {flowState === "result" && analysis ? (
          <div className="vibeResult">
            <div className="vibePhotoPane">
              <img src={photoPreview} alt="Uploaded style analysis" />
            </div>
            <div className="vibeContentPane">
              <p className="vibeLabel">YOUR VIBE</p>
              <h1>{analysis.vibe}</h1>

              <p className="vibeLabel sectionGap">WHAT'S WORKING</p>
              <p className="workingCopy">{analysis.whatIsWorking}</p>

              <p className="vibeLabel sectionGap">THE UPGRADE</p>
              <p className="upgradeCopy">{analysis.theUpgrade}</p>

              <p className="vibeLabel sectionGap">OUTFITS THAT WOULD SUIT YOU</p>
              <div className="resultDirectionStack">
                {analysis.outfitDirections.map((direction, index) => (
                  <div className="directionCard" key={`${direction.occasion}-${index}`}>
                    <p className="directionOccasion">{direction.occasion}</p>
                    <p className="directionText">{direction.direction}</p>
                  </div>
                ))}
              </div>

              {analysisProducts.length ? (
                <>
                  <p className="vibeLabel sectionGap">SHOPPING</p>
                  {!showAnalysisProducts ? (
                    <button className="revealProductsButton" onClick={() => setShowAnalysisProducts(true)} type="button">
                      Shop these pieces
                    </button>
                  ) : (
                    <div className="productGroups">
                      {analysisProducts.map((group) => (
                        <div className="productGroup" key={group.term}>
                          <p className="productGroupLabel">{group.term}</p>
                          <StaticProductRow products={group.products} term={group.term} onShopClick={logShopClick} />
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : null}

              <div className="continueBlock">
                <h2>Want to go deeper?</h2>
                <p>Ask me anything about your style.</p>
                <form
                  className="compactChat"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void startPhotoChat(input);
                  }}
                >
                  <input
                    onChange={(event) => setInput(event.target.value)}
                    placeholder="Ask about your style..."
                    value={input}
                  />
                  <button disabled={!input.trim() || loading} type="submit" aria-label="Ask about your style">
                    <Send size={16} strokeWidth={1.8} />
                  </button>
                </form>
                <button className="startFresh" onClick={startFresh} type="button">
                  Start fresh
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {flowState === "chat" ? (
          <div className="chatInner photoChatInner">
            {photoPreview ? (
              <div className="photoChatContext">
                <img src={photoPreview} alt="Your style context" />
                <span>Styled for you</span>
              </div>
            ) : null}
            {messages.map((message) => (
              <div className={`messageRow ${message.role}`} key={message.id}>
                {message.role === "user" ? (
                  <div className="userBubble">{message.content}</div>
                ) : message.structured ? (
                  <AssistantCard
                    response={message.structured}
                    gender={gender}
                    onMakeMine={prefillChatPrompt}
                    onShopClick={logShopClick}
                    onSuggestion={sendMessage}
                    showProducts={Boolean(message.shoppingRequested)}
                  />
                ) : null}
              </div>
            ))}
            {loading ? (
              <div className="messageRow assistant">
                <TypingCard />
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      {flowState === "chat" ? (
        <form className="styleInputBar" onSubmit={handleSubmit}>
          {chatImagePreview ? (
            <div className="chatImagePreview">
              <img src={chatImagePreview} alt="Attached outfit preview" />
              <button onClick={clearChatImage} type="button" aria-label="Remove attached image">
                ×
              </button>
            </div>
          ) : null}
          <div className="styleInputRow">
            <button className="attachButton" onClick={() => chatFileInputRef.current?.click()} type="button" aria-label="Attach image">
              <Paperclip size={20} strokeWidth={1.6} />
            </button>
            <textarea
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="Ask about style, outfits, occasions..."
              ref={textareaRef}
              rows={1}
              value={input}
            />
            <input
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={(event) => handleChatImage(event.target.files?.[0])}
              ref={chatFileInputRef}
              type="file"
            />
            <button disabled={!input.trim() || loading} type="submit" aria-label="Send message">
              <Send size={18} strokeWidth={1.8} />
            </button>
          </div>
        </form>
      ) : null}

      {memoryOpen ? (
        <div className="memoryOverlay" onClick={() => setMemoryOpen(false)}>
          <aside className="memoryPanel" onClick={(event) => event.stopPropagation()}>
            <button className="memoryClose" onClick={() => setMemoryOpen(false)} type="button" aria-label="Close memory">
              ×
            </button>
            <h2>What Laila knows about you</h2>

            {profile?.vibe ? (
              <div className="memoryItem">
                <p>YOUR VIBE</p>
                <span>{profile.vibe}</span>
              </div>
            ) : null}
            {profile?.body_type ? (
              <div className="memoryItem">
                <p>BODY TYPE</p>
                <span>{profile.body_type}</span>
              </div>
            ) : null}
            {profile?.skin_tone ? (
              <div className="memoryItem">
                <p>SKIN TONE</p>
                <span>{profile.skin_tone}</span>
              </div>
            ) : null}
            {profile?.colours_that_glow?.length ? (
              <div className="memoryItem">
                <p>COLOURS THAT SUIT YOU</p>
                <div className="memoryPills">
                  {profile.colours_that_glow.map((colour) => (
                    <span key={colour}>{colour}</span>
                  ))}
                </div>
              </div>
            ) : null}
            {profile?.colours_to_avoid?.length ? (
              <div className="memoryItem">
                <p>COLOURS TO AVOID</p>
                <div className="memoryPills">
                  {profile.colours_to_avoid.map((colour) => (
                    <span key={colour}>{colour}</span>
                  ))}
                </div>
              </div>
            ) : null}
            {profile?.style_personality?.length ? (
              <div className="memoryItem">
                <p>YOUR STYLE</p>
                <span>{profile.style_personality.join(", ")}</span>
              </div>
            ) : null}
            {profile?.camilles_take ? (
              <div className="memoryItem">
                <p>LAILA'S TAKE</p>
                <em>{profile.camilles_take}</em>
              </div>
            ) : null}

            {!profile?.onboarding_complete ? (
              <div className="memoryItem">
                <p>MEMORY</p>
                <span>Laila has not saved a style profile yet.</span>
              </div>
            ) : null}

            <button className="clearMemoryButton" onClick={() => setResetConfirmOpen(true)} type="button">
              Clear memory
            </button>
          </aside>
        </div>
      ) : null}

      {resetConfirmOpen ? (
        <div className="resetOverlay" role="dialog" aria-modal="true" aria-labelledby="reset-title">
          <div className="resetDialog">
            <h2 id="reset-title">Start fresh?</h2>
            <p>This will clear your style profile.</p>
            <div>
              <button onClick={confirmStartOver} type="button">
                Yes, start over
              </button>
              <button onClick={() => setResetConfirmOpen(false)} type="button">
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
