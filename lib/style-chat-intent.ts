export type StyleChatIntent = "appearance" | "shopping" | "outfit" | "advice";

const appearancePatterns = [
  /\bhow do (i|you think i) look\b/,
  /\bwhat vibe do i give off\b/,
  /\bwhat features? stand(?:s)? out\b/,
  /\bwhat aesthetic do i suit\b/,
  /\bwhat (colou?rs?|colors?) suit me\b/,
  /\bdo i look\b/,
  /\bmy vibe\b/,
  /\bmy aesthetic\b/,
  /\bmy features?\b/,
  /\bmy face\b/,
  /\bmy body type\b/,
  /\bmy proportions?\b/,
  /\bmy skin tone\b/,
  /\bmy undertone\b/,
];

const shoppingPatterns = [
  /\b(shop|shopping|buy|products?|find me|show me products?|link|links|where can i get|where to buy)\b/,
  /\b(search terms?|shopping edit|shop the look)\b/,
];

const outfitPatterns = [
  /\b(build|make|create|give me|style me)\b.*\boutfit\b/,
  /\boutfit\b/,
  /\bwhat to wear\b/,
  /\bdress for\b/,
  /\bstyle ideas?\b/,
  /\bclothes for\b/,
  /\b(wedding|date|work|office|gym|party|brunch|interview|vacation|travel)\b/,
];

function normalizeMessage(message: string) {
  return message.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

export function isAppearanceIntent(message: string) {
  const lower = normalizeMessage(message);
  if (shoppingPatterns.some((pattern) => pattern.test(lower))) return false;
  if (/\blook\b/.test(lower) && /\b(outfit|shop|products?|wear|dress|buy)\b/.test(lower)) return false;
  return appearancePatterns.some((pattern) => pattern.test(lower));
}

export function isShoppingIntent(message: string) {
  return shoppingPatterns.some((pattern) => pattern.test(normalizeMessage(message)));
}

export function isOutfitIntent(message: string) {
  if (isAppearanceIntent(message)) return false;
  const lower = normalizeMessage(message);
  return outfitPatterns.some((pattern) => pattern.test(lower));
}

export function classifyStyleChatIntent(message: string): StyleChatIntent {
  if (isAppearanceIntent(message)) return "appearance";
  if (isShoppingIntent(message)) return "shopping";
  if (isOutfitIntent(message)) return "outfit";
  return "advice";
}

export const STYLE_CHAT_INTENT_TEST_CASES: Array<{ input: string; expected: StyleChatIntent }> = [
  { input: "okay how do you think i look like", expected: "appearance" },
  { input: "what vibe do I give off", expected: "appearance" },
  { input: "what colors suit me", expected: "appearance" },
  { input: "build me an outfit", expected: "outfit" },
  { input: "show me products for linen shirt", expected: "shopping" },
];
