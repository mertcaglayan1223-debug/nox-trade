// J7Tracker.io Alpha Social & Memecoin Engine
// Live data, monitored VIP accounts, keyword filters & AI deploy suggestions

export type AISuggestion = {
  name: string;
  symbol: string;
  icon: string;
  tagN?: string;
  tagT?: string;
  statusText?: string;
};

export type J7Tweet = {
  id: string;
  author: string;
  handle: string;
  avatar: string;
  text: string;
  time: number;
  timeStr: string;
  followers: string;
  url: string;
  verified: boolean;
  retweetedFrom?: string;
  imageUrl?: string;
  isHighlighted?: boolean;
  matchedKeyword?: string;
  aiSuggestions: AISuggestion[];
  detectedCAs?: string[];
  views?: string;
  retweets?: number;
  replies?: number;
};

export type MonitoredAccount = {
  handle: string;
  name: string;
  avatar: string;
  followers: string;
  verified: boolean;
  category: "influencer" | "news" | "founder" | "whale" | "custom";
  muted: boolean;
};

export type KeywordFilter = {
  id: string;
  word: string;
  color: "green" | "pink" | "red" | "yellow" | "blue" | "purple";
  matchType: "partial match" | "exact match";
  sound: boolean;
  highlight: boolean;
};

// ── MONITORED ACCOUNTS (From Screenshot 1 & 3 + Crypto VIPs) ──
export const DEFAULT_MONITORED_ACCOUNTS: MonitoredAccount[] = [
  { handle: "steipete", name: "Peter Steinberger", avatar: "https://unavatar.io/twitter/steipete", followers: "592.7K", verified: true, category: "influencer", muted: false },
  { handle: "stoolpresidente", name: "Dave Portnoy", avatar: "https://unavatar.io/twitter/stoolpresidente", followers: "3.9M", verified: true, category: "influencer", muted: false },
  { handle: "nypost", name: "New York Post", avatar: "https://unavatar.io/twitter/nypost", followers: "4.2M", verified: true, category: "news", muted: false },
  { handle: "elonmusk", name: "Elon Musk", avatar: "https://unavatar.io/twitter/elonmusk", followers: "198.4M", verified: true, category: "influencer", muted: false },
  { handle: "blknoiz06", name: "Ansem", avatar: "https://unavatar.io/twitter/blknoiz06", followers: "612.4K", verified: true, category: "influencer", muted: false },
  { handle: "MustStopMurad", name: "Murad", avatar: "https://unavatar.io/twitter/MustStopMurad", followers: "440.1K", verified: true, category: "influencer", muted: false },
  { handle: "defidevcorp", name: "DeFi Dev Corp", avatar: "https://unavatar.io/twitter/defidevcorp", followers: "88.2K", verified: false, category: "founder", muted: false },
  { handle: "muse", name: "Muse", avatar: "https://unavatar.io/twitter/muse", followers: "142.0K", verified: true, category: "influencer", muted: false },
  { handle: "bnbnetworkco", name: "BNB Network", avatar: "https://unavatar.io/twitter/bnbnetworkco", followers: "210.5K", verified: true, category: "news", muted: false },
  { handle: "micronceo", name: "Micron CEO", avatar: "https://unavatar.io/twitter/micronceo", followers: "64.3K", verified: false, category: "founder", muted: false },
  { handle: "build", name: "Build Onchain", avatar: "https://unavatar.io/twitter/build", followers: "95.1K", verified: true, category: "founder", muted: false },
  { handle: "johnternus", name: "John Ternus", avatar: "https://unavatar.io/twitter/johnternus", followers: "128.4K", verified: true, category: "founder", muted: false },
  { handle: "natan_benish", name: "Natan Benish", avatar: "https://unavatar.io/twitter/natan_benish", followers: "52.8K", verified: false, category: "whale", muted: false },
  { handle: "mavcel", name: "Mavcel", avatar: "https://unavatar.io/twitter/mavcel", followers: "118.9K", verified: true, category: "influencer", muted: false },
  { handle: "mapi0x", name: "Mapi 0x", avatar: "https://unavatar.io/twitter/mapi0x", followers: "76.4K", verified: false, category: "whale", muted: false },
  { handle: "kieranwarwick", name: "Kieran Warwick", avatar: "https://unavatar.io/twitter/kieranwarwick", followers: "164.0K", verified: true, category: "founder", muted: false },
  { handle: "reaitrumpcoins1", name: "Trump Coins VIP", avatar: "https://unavatar.io/twitter/reaitrumpcoins1", followers: "49.0K", verified: false, category: "whale", muted: false },
  { handle: "cruelhandeth", name: "Cruel Hand", avatar: "https://unavatar.io/twitter/cruelhandeth", followers: "83.1K", verified: false, category: "influencer", muted: false },
  { handle: "cryptogle", name: "Cryptogle", avatar: "https://unavatar.io/twitter/cryptogle", followers: "105.7K", verified: true, category: "news", muted: false },
  { handle: "doodles", name: "Doodles", avatar: "https://unavatar.io/twitter/doodles", followers: "390.2K", verified: true, category: "founder", muted: false },
  { handle: "realDonaldTrump", name: "Donald J. Trump", avatar: "https://unavatar.io/twitter/realDonaldTrump", followers: "92.6M", verified: true, category: "influencer", muted: false },
  { handle: "toly", name: "anatoly", avatar: "https://unavatar.io/twitter/aeyakovenko", followers: "389.0K", verified: true, category: "founder", muted: false },
  { handle: "pumpfun", name: "Pump.fun", avatar: "https://unavatar.io/twitter/pumpfun", followers: "512.0K", verified: true, category: "news", muted: false },
];

// ── CUSTOM KEYWORDS (From Screenshot 2) ──
export const DEFAULT_KEYWORDS: KeywordFilter[] = [
  { id: "kw-1", word: "coin", color: "green", matchType: "partial match", sound: true, highlight: true },
  { id: "kw-2", word: "deploy", color: "green", matchType: "partial match", sound: true, highlight: true },
  { id: "kw-3", word: "justice", color: "pink", matchType: "partial match", sound: true, highlight: true },
  { id: "kw-4", word: "rip", color: "pink", matchType: "partial match", sound: true, highlight: true },
  { id: "kw-5", word: "dead", color: "pink", matchType: "partial match", sound: true, highlight: true },
  { id: "kw-6", word: "token", color: "green", matchType: "partial match", sound: true, highlight: true },
  { id: "kw-7", word: "lock", color: "pink", matchType: "partial match", sound: true, highlight: true },
  { id: "kw-8", word: "burn", color: "red", matchType: "partial match", sound: true, highlight: true },
  { id: "kw-9", word: "live", color: "yellow", matchType: "partial match", sound: true, highlight: true },
  { id: "kw-10", word: "onboard", color: "yellow", matchType: "partial match", sound: true, highlight: true },
  { id: "kw-11", word: "onboarding", color: "yellow", matchType: "partial match", sound: true, highlight: true },
  { id: "kw-12", word: "usdc", color: "blue", matchType: "partial match", sound: true, highlight: true },
  { id: "kw-13", word: "send", color: "purple", matchType: "partial match", sound: true, highlight: true },
];

// ── AI TOKEN METADATA & SUGGESTION GENERATOR ──
export function generateAISuggestions(text: string, author: string): AISuggestion[] {
  const cleaned = text.replace(/https?:\/\/\S+/g, "").trim();

  // Try extracting prominent words
  const words = cleaned
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !/^(the|and|for|this|that|with|from|have|will|just|they|what|been|were|about)$/i.test(w));

  const w1 = words[0] || "Sol";
  const w2 = words[1] || "Meme";

  const cleanSym = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) || "COIN";

  return [
    {
      name: `${w1} Sol`,
      symbol: `$${cleanSym(w1)}`,
      icon: "🤖",
      tagN: "N",
      tagT: "T",
    },
    {
      name: `${w1}${w2}`.slice(0, 16),
      symbol: `$${cleanSym(w1 + w2)}`,
      icon: "🔥",
      tagN: "N",
      tagT: "T",
    },
    {
      name: `GPT-6 ${w1}`,
      symbol: `$GPT${cleanSym(w1)}`,
      icon: "⚡",
      tagN: "N",
      tagT: "T",
    },
    {
      name: `${author.split(" ")[0]} ${w1}`,
      symbol: `$${cleanSym(author.slice(0, 3) + w1)}`,
      icon: "👑",
      tagN: "N",
      tagT: "T",
    },
  ];
}

// ── INITIAL RECENT TWEETS (Matching Screenshot 1 & 20.10.2026 Today's Live Date!) ──
export function getInitialJ7Feed(): J7Tweet[] {
  const now = Date.now();
  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
  };

  return [
    {
      id: "tweet-1",
      author: "Peter Steinberger",
      handle: "steipete",
      avatar: "https://unavatar.io/twitter/steipete",
      text: "Oh. Well. I didn't expect that to work. Deploying the whole framework directly to Solana mainnet in seconds.",
      time: now - 14000,
      timeStr: formatTime(now - 14000),
      followers: "592.7K",
      verified: true,
      retweetedFrom: "@ScriptedAlchemy",
      imageUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80",
      isHighlighted: false,
      aiSuggestions: [
        { name: "6 Sol", symbol: "$6", icon: "🤖", tagN: "N", tagT: "T" },
        { name: "6SOL", symbol: "$6SOL", icon: "🔥", tagN: "N", tagT: "T" },
        { name: "GPT-6 Sol", symbol: "$GPT6SOL", icon: "⚡", tagN: "N", tagT: "T" },
        { name: "Solo Solana", symbol: "$SOLAI", icon: "👑", tagN: "N", tagT: "T" },
      ],
      url: "https://x.com/steipete",
    },
    {
      id: "tweet-2",
      author: "Dave Portnoy",
      handle: "stoolpresidente",
      avatar: "https://unavatar.io/twitter/stoolpresidente",
      text: "Okay fine. Give the ball right back to Breisman. We are not selling a single token until the moon.",
      time: now - 48000,
      timeStr: formatTime(now - 48000),
      followers: "3.9M",
      verified: true,
      isHighlighted: true,
      matchedKeyword: "token",
      aiSuggestions: [
        { name: "Breisman", symbol: "$BREISMAN", icon: "🏀", tagN: "N", tagT: "T" },
        { name: "Portnoy Ball", symbol: "$BALL", icon: "🐶", tagN: "N", tagT: "T" },
        { name: "Never Sell", symbol: "$MOON", icon: "🚀", tagN: "N", tagT: "T" },
      ],
      url: "https://x.com/stoolpresidente",
    },
    {
      id: "tweet-3",
      author: "New York Post",
      handle: "nypost",
      avatar: "https://unavatar.io/twitter/nypost",
      text: "Mojtaba Khamenei had to be 'pulled from the rubble' of hospital after US, Israel nearly killed him a second time: report https://trib.al/wxv2ptE",
      time: now - 95000,
      timeStr: formatTime(now - 95000),
      followers: "4.2M",
      verified: true,
      imageUrl: "https://images.unsplash.com/photo-1579202673506-ca3ce28943ef?w=600&auto=format&fit=crop&q=80",
      isHighlighted: true,
      matchedKeyword: "live",
      aiSuggestions: [
        { name: "Mojtaba Khamenei", symbol: "$KHAMENEI", icon: "🏛️", tagN: "N", tagT: "T" },
        { name: "Mojtaba Sol", symbol: "$MOJTABA", icon: "⚡", tagN: "N", tagT: "T" },
        { name: "Rubble Survivor", symbol: "$RUBBLE", icon: "🔥", tagN: "N", tagT: "T" },
      ],
      url: "https://x.com/nypost",
    },
    {
      id: "tweet-4",
      author: "Elon Musk",
      handle: "elonmusk",
      avatar: "https://unavatar.io/twitter/elonmusk",
      text: "Grok 3 multi-agent architecture will autonomously deploy and verify code on the blockchain 🤖🚀",
      time: now - 160000,
      timeStr: formatTime(now - 160000),
      followers: "198.4M",
      verified: true,
      isHighlighted: true,
      matchedKeyword: "deploy",
      aiSuggestions: [
        { name: "Grok Agent", symbol: "$GROKAI", icon: "🤖", tagN: "N", tagT: "T" },
        { name: "Multi Agent Sol", symbol: "$AGENT", icon: "⚡", tagN: "N", tagT: "T" },
        { name: "Grok 3 Autonomous", symbol: "$GROK3", icon: "🚀", tagN: "N", tagT: "T" },
      ],
      url: "https://x.com/elonmusk",
    },
    {
      id: "tweet-5",
      author: "Ansem",
      handle: "blknoiz06",
      avatar: "https://unavatar.io/twitter/blknoiz06",
      text: "If you are not watching the live Solana liquidity migration right now you are missing generational alpha.",
      time: now - 240000,
      timeStr: formatTime(now - 240000),
      followers: "612.4K",
      verified: true,
      isHighlighted: true,
      matchedKeyword: "live",
      aiSuggestions: [
        { name: "Generational Alpha", symbol: "$ALPHA", icon: "👑", tagN: "N", tagT: "T" },
        { name: "Ansem Sol", symbol: "$ANSEM", icon: "⚡", tagN: "N", tagT: "T" },
      ],
      url: "https://x.com/blknoiz06",
    },
  ];
}

// ── DYNAMIC STREAM POOL FOR 20.10.2026 LIVE STREAMING ──
export const LIVE_STREAM_DROPS = [
  {
    author: "Donald J. Trump",
    handle: "realDonaldTrump",
    avatar: "https://unavatar.io/twitter/realDonaldTrump",
    text: "We are building the greatest digital asset treasury in world history right here in the United States!",
    followers: "92.6M",
    verified: true,
    matchedKeyword: "coin",
  },
  {
    author: "anatoly",
    handle: "toly",
    avatar: "https://unavatar.io/twitter/aeyakovenko",
    text: "Sub-10ms execution on Solana is now confirmed across all global validator testnets. The machine is unstoppable.",
    followers: "389.0K",
    verified: true,
    matchedKeyword: "send",
  },
  {
    author: "Murad",
    handle: "MustStopMurad",
    avatar: "https://unavatar.io/twitter/MustStopMurad",
    text: "The parabolic phase of the memecoin supercycle is starting. Cult communities will hold forever.",
    followers: "440.1K",
    verified: true,
    matchedKeyword: "token",
  },
  {
    author: "Elon Musk",
    handle: "elonmusk",
    avatar: "https://unavatar.io/twitter/elonmusk",
    text: "Optimus robot just completed autonomous dog walking simulation with 100% precision 🤖🐕",
    followers: "198.4M",
    verified: true,
    matchedKeyword: "live",
  },
  {
    author: "New York Post",
    handle: "nypost",
    avatar: "https://unavatar.io/twitter/nypost",
    text: "Breaking: Tech titan announces full treasury conversion to onchain liquidity pools across multi-chain ecosystem.",
    followers: "4.2M",
    verified: true,
    matchedKeyword: "usdc",
  },
  {
    author: "DeFi Dev Corp",
    handle: "defidevcorp",
    avatar: "https://unavatar.io/twitter/defidevcorp",
    text: "New deployer contracts locked and verified. 1-click bundle deployment enabled for all VIP snipers.",
    followers: "88.2K",
    verified: false,
    matchedKeyword: "deploy",
  },
  {
    author: "Peter Steinberger",
    handle: "steipete",
    avatar: "https://unavatar.io/twitter/steipete",
    text: "AI code assistants have surpassed manual coding by 10x. The speed of creation is surreal.",
    followers: "592.7K",
    verified: true,
    matchedKeyword: "deploy",
  },
];

// Helper to save and load custom monitored accounts
const ACCOUNTS_STORAGE_KEY = "j7-custom-accounts";

export function loadStoredAccounts(): MonitoredAccount[] {
  if (typeof window === "undefined") return DEFAULT_MONITORED_ACCOUNTS;
  try {
    const raw = localStorage.getItem(ACCOUNTS_STORAGE_KEY);
    if (!raw) return DEFAULT_MONITORED_ACCOUNTS;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    return DEFAULT_MONITORED_ACCOUNTS;
  } catch {
    return DEFAULT_MONITORED_ACCOUNTS;
  }
}

export function saveStoredAccounts(accounts: MonitoredAccount[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
  } catch {}
}

// Helper to save and load custom keywords
const KEYWORDS_STORAGE_KEY = "j7-custom-keywords";

export function loadStoredKeywords(): KeywordFilter[] {
  if (typeof window === "undefined") return DEFAULT_KEYWORDS;
  try {
    const raw = localStorage.getItem(KEYWORDS_STORAGE_KEY);
    if (!raw) return DEFAULT_KEYWORDS;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    return DEFAULT_KEYWORDS;
  } catch {
    return DEFAULT_KEYWORDS;
  }
}

export function saveStoredKeywords(keywords: KeywordFilter[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEYWORDS_STORAGE_KEY, JSON.stringify(keywords));
  } catch {}
}
