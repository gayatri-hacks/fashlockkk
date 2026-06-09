"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { Brain, Camera, Paperclip, Send } from "lucide-react";
import { Cormorant_Garamond, DM_Sans } from "next/font/google";

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
  trendKeywords: string[];
  shopTerms: string[];
  followUpSuggestions: string[];
};

type Message = {
  id: string;
  role: ChatRole;
  content: string;
  structured?: StyleResponse;
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
}: {
  response: StyleResponse;
  gender: Gender;
  onSuggestion: (text: string) => void;
  onShopClick: (url: string, term: string) => void;
}) {
  const shopTerms = response.shopTerms?.slice(0, 3) || [];

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
                <ProductRow
                  direction={direction}
                  gender={gender}
                  onShopClick={onShopClick}
                  searchTerm={shopTerms[index] || direction.direction}
                />
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
  const [analysisTextIndex, setAnalysisTextIndex] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [chatImagePreview, setChatImagePreview] = useState("");
  const [chatImageBase64, setChatImageBase64] = useState("");
  const [chatImageMimeType, setChatImageMimeType] = useState("");
  const chatRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const chatFileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const returningGreetingLoaded = useRef(false);

  const analysisTexts = ["Reading your style...", "Analysing your vibe...", "Understanding your aesthetic...", "Seeing what works..."];

  useEffect(() => {
    setSessionId(getSessionId());
  }, []);

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
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

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
          {profile?.onboarding_complete ? (
            <button className="editProfileButton" onClick={editProfile} type="button">
              Edit my profile
            </button>
          ) : null}
        </div>
      </section>

      <section className={`styleChat ${flowState === "result" ? "resultMode" : ""} ${flowState === "upload" || flowState === "analysing" ? "uploadMode" : ""}`} ref={chatRef}>
        {flowState === "upload" ? (
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
            <input
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={(event) => handleFile(event.target.files?.[0])}
              ref={fileInputRef}
              type="file"
            />
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
                  <p className="vibeLabel sectionGap">FIND THESE PIECES</p>
                  <div className="productGroups">
                    {analysisProducts.map((group) => (
                      <div className="productGroup" key={group.term}>
                        <p className="productGroupLabel">{group.term}</p>
                        <StaticProductRow products={group.products} term={group.term} onShopClick={logShopClick} />
                      </div>
                    ))}
                  </div>
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
                  <AssistantCard response={message.structured} gender={gender} onShopClick={logShopClick} onSuggestion={sendMessage} />
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
