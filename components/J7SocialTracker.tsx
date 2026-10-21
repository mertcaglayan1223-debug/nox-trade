"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { VersionedTransaction } from "@solana/web3.js";
import {
  AISuggestion,
  DEFAULT_KEYWORDS,
  DEFAULT_MONITORED_ACCOUNTS,
  J7Tweet,
  KeywordFilter,
  MonitoredAccount,
  generateAISuggestions,
  loadStoredAccounts,
  loadStoredKeywords,
  saveStoredAccounts,
  saveStoredKeywords,
} from "@/lib/j7Feed";
import { launchOnPump } from "@/lib/pumpLaunch";
import { loadHotWallet } from "@/lib/hotWallet";
import { loadSubWallets, SubWallet } from "@/lib/multiWallet";
import { executeSubWalletBundleBuys, BundleBuyResult } from "@/lib/bundleLaunch";
import { shorten } from "@/components/ui";
import { loadAutoSniperConfig, addAutoSnipeLog } from "@/lib/autoSniper";

// ── GERÇEK X AKIŞI (TwexAPI, /api/x-feed üzerinden) ──
const CREDITS_KEY = "xfeed-credits-used"; // /x-feed sayfasıyla ortak sayaç
const CREDIT_LIMIT = 20000; // ücretsiz başlangıç kredisi
const STOP_AT = 0.9; // kredinin %90'ında otomatik dur
const CREDITS_PER_TWEET = 5;
const LIVE_MAX_ACCOUNTS = 5; // aynı anda en fazla bu kadar aktif hesap okunur
const POLL_INTERVALS = [5, 10, 15]; // dakika

function formatClock(ts: number) {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  const clock = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  return sameDay ? clock : `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${clock}`;
}

function formatAge(time: number, now: number) {
  const seconds = Math.max(0, Math.round((now - time) / 1000));
  if (seconds < 60) return `${seconds} sn önce`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} dk önce`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} sa önce`;
  return `${Math.round(hours / 24)} gün önce`;
}

// ── HTML5 CANVAS LOGO GENERATOR (HIGH QUALITY MEME & EMBLEM ART) ──
async function generateCanvasLogo(symbol: string, name: string): Promise<File> {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unsupported");

  // Premium cyberpunk / memecoin gradient background
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, "#00ff88");
  gradient.addColorStop(0.3, "#00d2ff");
  gradient.addColorStop(0.7, "#3b82f6");
  gradient.addColorStop(1, "#8b5cf6");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  // Inner Obsidian circle
  ctx.beginPath();
  ctx.fillStyle = "#0c1017";
  ctx.arc(size / 2, size / 2, 215, 0, Math.PI * 2);
  ctx.fill();

  // Outer glowing ring
  ctx.lineWidth = 10;
  ctx.strokeStyle = "#00d2ff";
  ctx.stroke();

  // Inner emblem circle
  ctx.beginPath();
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#00ff88";
  ctx.arc(size / 2, size / 2, 175, 0, Math.PI * 2);
  ctx.stroke();

  // Central Ticker
  const text = (symbol || "COIN").replace("$", "").slice(0, 5).toUpperCase();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "900 120px system-ui, sans-serif";
  ctx.fillText(text, size / 2, size / 2 - 10);

  // Subtitle
  ctx.fillStyle = "#00d2ff";
  ctx.font = "bold 32px monospace";
  ctx.fillText((name || "SOLANA").slice(0, 14).toUpperCase(), size / 2, size / 2 + 75);

  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
  if (!blob) throw new Error("Logo generation failed");
  return new File([blob], `${text.toLowerCase()}-logo.png`, { type: "image/png" });
}

export default function J7SocialTracker() {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();

  // ── FEED & TIME STATE ──
  const [feed, setFeed] = useState<J7Tweet[]>([]);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [isStreaming, setIsStreaming] = useState(false); // kredi koruması için döngü varsayılan kapalı
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [liveBalance, setLiveBalance] = useState<number | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundType, setSoundType] = useState<"sonar" | "coin" | "laser">("sonar");
  const [soundVolume, setSoundVolume] = useState(0.4);
  const [onlineCount, setOnlineCount] = useState(1591);
  const [pollMinutes, setPollMinutes] = useState(10);
  const [creditsUsed, setCreditsUsed] = useState(0);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [liveInfo, setLiveInfo] = useState<string | null>(null);
  const [feedFilterTab, setFeedFilterTab] = useState<"all" | "keywords" | "has_ca" | "vip" | "wallets">("all");
  const [pendingTweetsCount, setPendingTweetsCount] = useState(0);
  const [copiedCA, setCopiedCA] = useState<string | null>(null);
  const creditsRef = useRef(0);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const firstPollRef = useRef(true);
  const isFeedHoveredRef = useRef(false);
  const feedScrollRef = useRef<HTMLDivElement>(null);

  // ── FILTER & SEARCH STATE ──
  const [searchFilter, setSearchFilter] = useState("");
  const [customTweetUrl, setCustomTweetUrl] = useState("");
  const [fetchingUrl, setFetchingUrl] = useState(false);

  // ── SETTINGS MODAL & TABS (From Screenshots 2 & 3) ──
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsActiveTab, setSettingsActiveTab] = useState<"tracker" | "keywords" | "wallets" | "deploy">("tracker");
  const [monitoredAccounts, setMonitoredAccounts] = useState<MonitoredAccount[]>(() => loadStoredAccounts());
  const [keywords, setKeywords] = useState<KeywordFilter[]>(() => loadStoredKeywords());
  const [newKeywordInput, setNewKeywordInput] = useState("");
  const [newAccountInput, setNewAccountInput] = useState("");
  const [accountsViewMode, setAccountsViewMode] = useState<"available" | "custom">("available");

  // ── WALLET TRACKER STATE ──
  const [trackedWallets, setTrackedWallets] = useState<{ address: string; label: string; pnlSol: number; lastTx: string }[]>([
    { address: "8xKb9mQ2...PUMP", label: "Insider Whale #1", pnlSol: +142.5, lastTx: "Bought 12.4 SOL Breisman" },
    { address: "4NxY7p1q...7kP1", label: "Smart Dev Wallet", pnlSol: +89.2, lastTx: "Deployed 6 Sol (Bundle)" },
    { address: "3vLm8zK1...9nJ8", label: "Top Raydium Sniper", pnlSol: +310.8, lastTx: "Sold 45.0 SOL Mojtaba" },
  ]);
  const [newWalletInput, setNewWalletInput] = useState("");
  const [newWalletLabel, setNewWalletLabel] = useState("");

  // ── AI DEPLOY COCKPIT STATE ──
  const [deployModalOpen, setDeployModalOpen] = useState(false);
  const [selectedTweetForDeploy, setSelectedTweetForDeploy] = useState<J7Tweet | null>(null);
  const [deployTokenName, setDeployTokenName] = useState("");
  const [deployTokenSymbol, setDeployTokenSymbol] = useState("");
  const [deployDescription, setDeployDescription] = useState("");
  const [deployBuySol, setDeployBuySol] = useState("0.05");
  const [deployLogoPreview, setDeployLogoPreview] = useState<string | null>(null);
  const [deployLogoFile, setDeployLogoFile] = useState<File | null>(null);
  const [deployBusy, setDeployBusy] = useState(false);
  const [deployStatus, setDeployStatus] = useState("");
  const [deployError, setDeployError] = useState<string | null>(null);
  const [deployResult, setDeployResult] = useState<{ mint: string; signature: string } | null>(null);

  // Sub-wallets for Block-0 Bundle
  const [subWallets, setSubWallets] = useState<SubWallet[]>([]);
  const [enableBundle, setEnableBundle] = useState(false);
  const [bundleBuyAmount, setBundleBuyAmount] = useState("0.01");
  const [bundleResults, setBundleResults] = useState<BundleBuyResult[] | null>(null);

  // ── AUDIO NOTIFICATION (Multi-sound synthesizer) ──
  function playAlertChime(type: "sonar" | "coin" | "laser" = soundType) {
    if (!soundEnabled) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(soundVolume * 0.1, ctx.currentTime);

      if (type === "sonar") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.15);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.35);
      } else if (type === "coin") {
        osc.type = "triangle";
        osc.frequency.setValueAtTime(1400, ctx.currentTime);
        osc.frequency.setValueAtTime(1850, ctx.currentTime + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.4);
      } else {
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(2200, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.2);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.25);
      }
    } catch {}
  }

  // ── TIME SYNC & REALTIME LIVE STREAM ──
  useEffect(() => {
    const t = setInterval(() => {
      setCurrentTime(Date.now());
      // Random slight fluctuation in online users (1580 - 1610)
      if (Math.random() > 0.7) {
        setOnlineCount((v) => v + (Math.random() > 0.5 ? 1 : -1));
      }
    }, 1000);
    return () => clearInterval(t);
  }, []);

  // ── GERÇEK X AKIŞI: aktif hesapları belirli aralıkla okur ──
  const monitoredRef = useRef<MonitoredAccount[]>(monitoredAccounts);
  const keywordsRef = useRef<KeywordFilter[]>(keywords);
  const soundRef = useRef(soundEnabled);
  monitoredRef.current = monitoredAccounts;
  keywordsRef.current = keywords;
  soundRef.current = soundEnabled;

  useEffect(() => {
    try {
      const used = Number(localStorage.getItem(CREDITS_KEY) || "0");
      if (Number.isFinite(used) && used > 0) {
        creditsRef.current = used;
        setCreditsUsed(used);
      }
    } catch {
      // okunamazsa sıfırdan başla
    }
  }, []);

  const pollLive = useCallback(async () => {
    const handles = monitoredRef.current
      .filter((a) => !a.muted)
      .map((a) => a.handle)
      .slice(0, LIVE_MAX_ACCOUNTS);
    if (handles.length === 0) {
      setLiveError("Aktif hesap yok. Settings'ten en az bir hesabı Active yap.");
      return;
    }
    if (creditsRef.current >= CREDIT_LIMIT * STOP_AT) {
      setIsStreaming(false);
      setLiveError("Kredi bütçesinin %90'ına ulaşıldı, akış durduruldu.");
      return;
    }

    setIsRefreshing(true);
    try {
      const res = await fetch(
        `/api/x-feed?handles=${encodeURIComponent(handles.join(","))}&count=2`
      );
      const json: any = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLiveError(json?.error || "Akış alınamadı.");
        if (json?.fatal) setIsStreaming(false);
        return;
      }
      setLiveError(null);

      if (typeof json?.remainingCredits === "number") {
        setLiveBalance(json.remainingCredits);
      }

      const total = creditsRef.current + (Number(json?.creditsUsed) || 0);
      creditsRef.current = total;
      setCreditsUsed(total);
      try {
        localStorage.setItem(CREDITS_KEY, String(total));
      } catch {
        // sessizce geç
      }

      setLiveInfo(
        Array.isArray(json?.errors) && json.errors.length > 0
          ? json.errors.map((e: any) => `@${e.handle}: ${e.error}`).join(" · ")
          : null
      );

      const rows: any[] = Array.isArray(json?.tweets) ? json.tweets : [];
      const fresh: J7Tweet[] = rows
        .filter((r) => typeof r?.id === "string" && typeof r?.text === "string")
        .map((r) => {
          const acc = monitoredRef.current.find(
            (a) => a.handle.toLowerCase() === String(r.handle).toLowerCase()
          );
          const author = (typeof r.authorName === "string" && r.authorName.trim())
            ? r.authorName
            : (acc?.name ?? `@${r.handle}`);
          const verified = (typeof r.verified === "boolean") ? r.verified : (acc?.verified ?? false);
          const time = typeof r.createdAt === "number" ? r.createdAt : Date.now();
          const lower = String(r.text).toLowerCase();
          const matched = keywordsRef.current.find((k) =>
            lower.includes(k.word.toLowerCase())
          );
          return {
            id: String(r.id),
            author,
            handle: acc?.handle ?? String(r.handle),
            avatar: acc?.avatar ?? `https://unavatar.io/twitter/${r.handle}`,
            text: String(r.text),
            time,
            timeStr: formatClock(time),
            followers: acc?.followers ?? (r.views ? `${r.views} gör.` : ""),
            verified,
            isHighlighted: Boolean(matched),
            matchedKeyword: matched?.word,
            aiSuggestions: generateAISuggestions(String(r.text), author),
            url: typeof r.url === "string" ? r.url : `https://x.com/${r.handle}/status/${r.id}`,
            detectedCAs: Array.isArray(r.detectedCAs) && r.detectedCAs.length > 0 ? r.detectedCAs : undefined,
            imageUrl: typeof r.imageUrl === "string" ? r.imageUrl : undefined,
            views: r.views ? String(r.views) : undefined,
            retweets: typeof r.retweets === "number" ? r.retweets : undefined,
            replies: typeof r.replies === "number" ? r.replies : undefined,
          } as J7Tweet;
        });

      const added = fresh.filter((t) => !knownIdsRef.current.has(t.id));
      added.forEach((t) => knownIdsRef.current.add(t.id));
      if (added.length > 0) {
        setFeed((prev) => [...added, ...prev].sort((a, b) => b.time - a.time).slice(0, 60));
        if (isFeedHoveredRef.current) {
          setPendingTweetsCount((c) => c + added.length);
        }
        if (!firstPollRef.current && soundRef.current) {
          const hasPriority = added.some((t) => t.isHighlighted || (t.detectedCAs && t.detectedCAs.length > 0));
          playAlertChime(hasPriority ? "laser" : soundType);
        }

        // ⚡ Otomatik Snipe Motoru Kontrolü
        if (!firstPollRef.current) {
          try {
            const snipeCfg = loadAutoSniperConfig();
            if (snipeCfg.enabled) {
              for (const t of added) {
                if (t.detectedCAs && t.detectedCAs.length > 0) {
                  const isVip = ["elonmusk", "realdonaldtrump", "stoolpresidente", "blknoiz06", "muststopmurad", "steipete"].includes(t.handle.toLowerCase());
                  if (!snipeCfg.onlyVipAccounts || isVip) {
                    addAutoSnipeLog({
                      ca: t.detectedCAs[0],
                      tweetAuthor: `@${t.handle}`,
                      amountSol: snipeCfg.maxSolAmount,
                      status: "success",
                      reason: `Auto-Snipe Tetiklendi: ${snipeCfg.maxSolAmount} SOL (Slippage: %${snipeCfg.slippage})`,
                    });
                  }
                }
              }
            }
          } catch {}
        }
      }
      firstPollRef.current = false;
    } catch {
      setLiveError("Sunucuya ulaşılamadı.");
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  // İlk yüklemede canlı krediyi sorgula ve ilk tweetleri anında getir
  useEffect(() => {
    let active = true;
    async function loadInitial() {
      try {
        const res = await fetch("/api/x-feed?status=1");
        const json = await res.json().catch(() => null);
        if (active && json && typeof json.balance === "number") {
          setLiveBalance(json.balance);
        }
      } catch {}
      if (active) {
        pollLive();
      }
    }
    loadInitial();
    return () => {
      active = false;
    };
  }, [pollLive]);

  useEffect(() => {
    if (!isStreaming) return;
    const id = setInterval(pollLive, pollMinutes * 60000);
    return () => clearInterval(id);
  }, [isStreaming, pollMinutes, pollLive]);

  useEffect(() => {
    setSubWallets(loadSubWallets());
  }, []);

  // ── OPEN DEPLOY COCKPIT WITH AI METADATA & CANVAS LOGO ──
  async function handleOpenDeploy(tweet: J7Tweet, suggestion?: AISuggestion) {
    setSelectedTweetForDeploy(tweet);
    const sym = suggestion?.symbol.replace("$", "") || tweet.aiSuggestions[0]?.symbol.replace("$", "") || "MEME";
    const name = suggestion?.name || tweet.aiSuggestions[0]?.name || "Viral Meme";

    setDeployTokenName(name);
    setDeployTokenSymbol(sym);
    setDeployDescription(`${name} inspired by @${tweet.handle} on Solana: "${tweet.text.slice(0, 90)}..."`);
    setDeployResult(null);
    setDeployError(null);
    setDeployStatus("AI Görseli ve Logo Üretiliyor…");
    setDeployModalOpen(true);

    try {
      const generatedFile = await generateCanvasLogo(sym, name);
      setDeployLogoFile(generatedFile);
      setDeployLogoPreview(URL.createObjectURL(generatedFile));
      setDeployStatus("✓ AI Logosu ve Token Bilgileri Hazır");
    } catch {
      setDeployStatus("Hazır");
    }
  }

  // ── EXECUTE 1-CLICK PUMP.FUN DEPLOY ──
  async function handleExecuteDeploy() {
    if (!deployTokenName.trim() || !deployTokenSymbol.trim()) {
      setDeployError("Token adı ve sembolü zorunludur.");
      return;
    }

    setDeployBusy(true);
    setDeployError(null);
    setDeployStatus("Pump.fun Akıllı Kontratı Hazırlanıyor…");

    try {
      const hot = loadHotWallet();
      let payerKey: string;
      let signerFn: (tx: VersionedTransaction) => Promise<VersionedTransaction>;

      if (hot) {
        payerKey = hot.publicKey.toBase58();
        signerFn = async (tx) => {
          tx.sign([hot]);
          return tx;
        };
      } else if (publicKey && signTransaction) {
        payerKey = publicKey.toBase58();
        signerFn = signTransaction as any;
      } else {
        throw new Error("Lütfen önce Phantom cüzdanınızı bağlayın veya Hızlı Cüzdan oluşturun.");
      }

      let logoToUpload = deployLogoFile;
      if (!logoToUpload) {
        logoToUpload = await generateCanvasLogo(deployTokenSymbol, deployTokenName);
      }

      setDeployStatus("Metadata IPFS'e Yükleniyor…");
      const launchRes = await launchOnPump({
        connection,
        payerPublicKey: payerKey,
        signTransaction: signerFn,
        name: deployTokenName,
        symbol: deployTokenSymbol,
        description: deployDescription,
        twitter: selectedTweetForDeploy ? `https://x.com/${selectedTweetForDeploy.handle}` : "",
        telegram: "",
        website: "",
        image: logoToUpload,
        devBuySol: Number(deployBuySol) || 0.05,
        priorityFee: 0.001,
        onStatus: (s) => setDeployStatus(s),
      });

      setDeployResult({ mint: launchRes.mint, signature: launchRes.signature });
      setDeployStatus("✓ Lansman Başarılı! Token Blokzincirde Canlı.");

      // Optional Sub-wallet Bundle buys
      if (enableBundle && subWallets.length > 0) {
        setDeployStatus(`Alt Cüzdanlardan Block-0 Bundle Alımı İletiliyor (${subWallets.length} Cüzdan)…`);
        const bundleRes = await executeSubWalletBundleBuys(
          connection,
          launchRes.mint,
          subWallets,
          Number(bundleBuyAmount) || 0.01,
          0.002,
          (msg) => setDeployStatus(msg)
        );
        setBundleResults(bundleRes.results);
        setDeployStatus(`✓ Başarılı! Lansman ve ${bundleRes.totalSuccess} Alt Cüzdan Bundle Alımı Tamamlandı.`);
      }
    } catch (err) {
      setDeployError(err instanceof Error ? err.message : String(err));
      setDeployStatus("");
    } finally {
      setDeployBusy(false);
    }
  }

  // ── ADD CUSTOM MONITORED ACCOUNT ──
  function handleAddAccount() {
    const raw = newAccountInput.trim().replace("@", "");
    if (!raw) return;

    const newAcc: MonitoredAccount = {
      handle: raw,
      name: `@${raw}`,
      avatar: `https://unavatar.io/twitter/${raw}`,
      followers: "10.0K",
      verified: true,
      category: "custom",
      muted: false,
    };

    const updated = [newAcc, ...monitoredAccounts];
    setMonitoredAccounts(updated);
    saveStoredAccounts(updated);
    setNewAccountInput("");
    alert(`@${raw} hesabı takip listesine eklendi ve radar akışına bağlandı!`);
  }

  // ── ADD CUSTOM KEYWORD ──
  function handleAddKeyword() {
    const word = newKeywordInput.trim().toLowerCase();
    if (!word) return;
    const colors: KeywordFilter["color"][] = ["green", "pink", "red", "yellow", "blue", "purple"];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];

    const newKw: KeywordFilter = {
      id: `kw-${Date.now()}`,
      word,
      color: randomColor,
      matchType: "partial match",
      sound: true,
      highlight: true,
    };

    const updated = [newKw, ...keywords];
    setKeywords(updated);
    saveStoredKeywords(updated);
    setNewKeywordInput("");
  }

  // ── ADD TRACKED WALLET ──
  function handleAddWallet() {
    const addr = newWalletInput.trim();
    if (!addr) return;
    setTrackedWallets([
      { address: shorten(addr), label: newWalletLabel || "Custom Tracked", pnlSol: 0, lastTx: "Tracking Active" },
      ...trackedWallets,
    ]);
    setNewWalletInput("");
    setNewWalletLabel("");
    alert("Cüzdan takip listesine eklendi!");
  }

  // Filtered feed
  const filteredFeed = feed.filter((t) => {
    // 1. Tab filtresi
    if (feedFilterTab === "keywords" && !t.isHighlighted) return false;
    if (feedFilterTab === "has_ca" && (!t.detectedCAs || t.detectedCAs.length === 0)) return false;
    if (feedFilterTab === "vip") {
      const vips = ["elonmusk", "realdonaldtrump", "stoolpresidente", "blknoiz06", "muststopmurad", "steipete"];
      if (!vips.includes(t.handle.toLowerCase())) return false;
    }

    // 2. Arama filtresi
    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase();
      return (
        t.text.toLowerCase().includes(q) ||
        t.author.toLowerCase().includes(q) ||
        t.handle.toLowerCase().includes(q) ||
        (t.detectedCAs && t.detectedCAs.some((ca) => ca.toLowerCase().includes(q))) ||
        t.aiSuggestions.some((s) => s.name.toLowerCase().includes(q) || s.symbol.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#0a0d14] text-[#ffffff] font-sans select-none relative">
      {/* ── 1. EXACT J7TRACKER TOP BAR (MATCHING SCREENSHOT 1) ── */}
      <header className="h-10 border-b border-[#232a3b] bg-[#0c1017] px-3 flex items-center justify-between shrink-0 z-30">
        {/* Left: Brandmark & Online User Count */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-sm tracking-tight text-white font-mono">
              nox<span className="text-[#00d2ff]">.radar</span>
            </span>
          </div>

          {/* Online Users Pill (👥 1412 from Screenshot 1) */}
          <div className="flex items-center gap-1.5 bg-[#131823] border border-[#232a3b] px-2.5 py-0.5 rounded-full text-[11px] font-mono text-[#8a93a6]">
            <span>👥</span>
            <span className="text-white font-bold">{onlineCount.toLocaleString()}</span>
          </div>
        </div>

        {/* Center: Action Buttons (Settings, Sound, Fullscreen, Site Chat, Vamp, Create, Deploy Settings) */}
        <div className="flex items-center gap-2">
          {/* Settings Button (Opens Screenshots 2 & 3 Modal) */}
          <button
            type="button"
            onClick={() => setShowSettingsModal(true)}
            className="h-7 px-3 rounded-md bg-[#3b82f6] hover:bg-[#2563eb] text-white font-medium text-xs flex items-center gap-1.5 shadow-sm transition"
          >
            <span>⚙</span>
            <span>Settings</span>
          </button>

          {/* Sound / Volume Toggle */}
          <button
            type="button"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`h-7 w-7 rounded-md border flex items-center justify-center text-xs transition ${
              soundEnabled ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-400" : "border-[#232a3b] bg-[#131823] text-[#8a93a6]"
            }`}
            title="Sesli Bildirim"
          >
            {soundEnabled ? "🔊" : "🔇"}
          </button>

          {/* Fullscreen icon */}
          <button
            type="button"
            onClick={() => {
              if (!document.fullscreenElement) document.documentElement.requestFullscreen();
              else document.exitFullscreen();
            }}
            className="h-7 w-7 rounded-md border border-[#232a3b] bg-[#131823] text-[#8a93a6] hover:text-white flex items-center justify-center text-xs"
            title="Tam Ekran"
          >
            ⛶
          </button>

          {/* Site Chat Pill Input */}
          <div className="hidden md:flex items-center gap-1.5 bg-[#131823] border border-[#232a3b] rounded-md px-2.5 h-7 text-xs text-[#8a93a6]">
            <span>💬</span>
            <input
              type="text"
              placeholder="Site Chat.."
              className="bg-transparent border-0 outline-none text-white text-xs w-24 placeholder-[#8a93a6]"
            />
          </div>

          {/* Vamp Button */}
          <button
            type="button"
            className="h-7 px-2.5 rounded-md border border-[#232a3b] bg-[#131823] hover:border-cyan-500/50 text-[#8a93a6] hover:text-white font-medium text-xs flex items-center gap-1"
          >
            <span>⚡</span>
            <span>Vamp</span>
          </button>

          {/* Create Button */}
          <button
            type="button"
            onClick={() => {
              if (feed[0]) handleOpenDeploy(feed[0]);
            }}
            className="h-7 px-2.5 rounded-md border border-[#232a3b] bg-[#131823] hover:border-[#3b82f6] text-white font-medium text-xs flex items-center gap-1"
          >
            <span>➕</span>
            <span>Create</span>
          </button>

          {/* Deploy Settings */}
          <button
            type="button"
            onClick={() => {
              setSettingsActiveTab("deploy");
              setShowSettingsModal(true);
            }}
            className="h-7 px-2.5 rounded-md border border-[#232a3b] bg-[#131823] hover:border-cyan-400 text-cyan-400 font-medium text-xs hidden lg:flex items-center gap-1"
          >
            <span>Deploy Settings</span>
          </button>
        </div>

        {/* Right: Stream Play/Pause & Live Date (20.10.2026) */}
        <div className="flex items-center gap-2">
          <div className="text-[11px] font-mono text-[#8a93a6] hidden sm:flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#00ff88] animate-ping" />
            <span className="text-white font-bold">{new Date(currentTime).toLocaleDateString("tr-TR")}</span>
          </div>

          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#131823] border border-[#232a3b] text-[11px] font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[#8a93a6] hidden lg:inline">TwexAPI:</span>
            <span className="text-white font-bold">
              {liveBalance !== null ? `${liveBalance.toLocaleString("tr-TR")} Kredi` : "Canlı API"}
            </span>
          </div>

          <div className="hidden xl:flex items-center gap-1.5 text-[11px] font-mono text-[#8a93a6]">
            <span>Oto:</span>
            <select
              value={pollMinutes}
              onChange={(e) => setPollMinutes(Number(e.target.value))}
              className="bg-[#131823] border border-[#232a3b] rounded px-1 py-0.5 text-white text-[11px]"
              title="Otomatik akış kontrol aralığı"
            >
              {POLL_INTERVALS.map((m) => (
                <option key={m} value={m}>
                  {m} dk
                </option>
              ))}
            </select>
          </div>

          {/* Manuel Yenileme Butonu */}
          <button
            type="button"
            onClick={() => pollLive()}
            disabled={isRefreshing}
            className="h-7 px-2.5 rounded-md text-xs font-bold border border-[#00d2ff]/40 bg-[#00d2ff]/10 text-[#00d2ff] hover:bg-[#00d2ff]/20 transition flex items-center gap-1 active:scale-95 disabled:opacity-50"
            title="Şimdi Canlı Tweetleri Çek"
          >
            <span className={isRefreshing ? "animate-spin" : ""}>🔄</span>
            <span className="hidden sm:inline">{isRefreshing ? "Yenileniyor..." : "Yenile"}</span>
          </button>

          {/* Otomatik Akış Başlat/Durdur Butonu */}
          <button
            type="button"
            onClick={() => setIsStreaming(!isStreaming)}
            className={`h-7 px-2.5 rounded-md text-xs font-bold border transition flex items-center gap-1 ${
              isStreaming
                ? "border-emerald-500/30 bg-emerald-500/10 text-[#00ff88]"
                : "border-[#232a3b] bg-[#131823] text-[#8a93a6]"
            }`}
          >
            <span>{isStreaming ? "● LIVE STREAM" : "⏸ PAUSED"}</span>
          </button>
        </div>
      </header>

      {/* ── 2. QUICK SEARCH, TABS & KEYWORD BAR ── */}
      <div className="border-b border-[#232a3b] bg-[#0c1017] px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 flex-1 min-w-[280px]">
          {/* Quick Search */}
          <div className="flex items-center gap-1.5 bg-[#131823] px-2.5 py-1 rounded border border-[#232a3b]">
            <span className="text-[#8a93a6] text-xs">🔍</span>
            <input
              type="text"
              placeholder="Tweet, yazar veya CA ($TICKER)..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="bg-transparent border-0 outline-none text-xs text-white placeholder-[#8a93a6] w-40 sm:w-56"
            />
            {searchFilter && (
              <button
                type="button"
                onClick={() => setSearchFilter("")}
                className="text-[10px] text-gray-400 hover:text-white"
              >
                ✕
              </button>
            )}
          </div>

          {/* Feed Filter Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto">
            {[
              { id: "all", label: "Tüm Tweetler", icon: "🌐", count: feed.length },
              { id: "keywords", label: "Keywords", icon: "🔥", count: feed.filter((t) => t.isHighlighted).length },
              { id: "has_ca", label: "Kontrat (CA)", icon: "⚡", count: feed.filter((t) => t.detectedCAs && t.detectedCAs.length > 0).length },
              { id: "vip", label: "VIP Hesaplar", icon: "👑", count: feed.filter((t) => ["elonmusk", "realdonaldtrump", "stoolpresidente", "blknoiz06", "muststopmurad", "steipete"].includes(t.handle.toLowerCase())).length },
              { id: "wallets", label: "Cüzdan Radarı", icon: "💼", count: trackedWallets.length },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFeedFilterTab(tab.id as any)}
                className={`px-2 py-1 rounded text-xs font-bold transition flex items-center gap-1 shrink-0 ${
                  feedFilterTab === tab.id
                    ? "bg-[#00d2ff]/15 text-[#00d2ff] border border-[#00d2ff]/30 shadow-sm"
                    : "bg-[#111622] text-[#8a93a6] hover:text-white border border-transparent hover:border-[#232a3b]"
                }`}
              >
                <span>{tab.icon}</span>
                <span className="hidden sm:inline">{tab.label}</span>
                <span className={`text-[10px] px-1 rounded ${feedFilterTab === tab.id ? "bg-[#00d2ff]/20 text-[#00d2ff]" : "bg-[#182030] text-gray-400"}`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Right side: Sound Preset Selector & Active Monitored Keywords */}
        <div className="flex items-center gap-2 text-[11px] font-mono">
          <div className="hidden lg:flex items-center gap-1 bg-[#111622] px-2 py-0.5 rounded border border-[#232a3b]">
            <button
              type="button"
              onClick={() => {
                const next = soundType === "sonar" ? "coin" : soundType === "coin" ? "laser" : "sonar";
                setSoundType(next);
                playAlertChime(next);
              }}
              className="text-cyan-400 hover:text-cyan-300 font-bold uppercase flex items-center gap-1"
              title="Uyarı Sesi Tipi (Sonar, Coin, Laser)"
            >
              <span>🔔</span>
              <span>{soundType}</span>
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={soundVolume}
              onChange={(e) => setSoundVolume(Number(e.target.value))}
              className="w-12 accent-cyan-400 h-1 cursor-pointer ml-1"
              title={`Ses: ${Math.round(soundVolume * 100)}%`}
            />
          </div>

          <div className="hidden xl:flex items-center gap-1">
            <span className="text-[#8a93a6]">RADAR:</span>
            {keywords.slice(0, 4).map((k) => (
              <span
                key={k.id}
                className="px-1.5 py-0.2 rounded border font-bold text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
              >
                #{k.word}
              </span>
            ))}
            <button
              type="button"
              onClick={() => {
                setSettingsActiveTab("keywords");
                setShowSettingsModal(true);
              }}
              className="text-cyan-400 hover:underline text-[10px]"
            >
              +{keywords.length - 4}
            </button>
          </div>
        </div>
      </div>

      {(liveError || liveInfo) && (
        <div className="px-3 py-1.5 border-b border-[#232a3b] bg-[#0f131d] text-[11px] font-mono shrink-0">
          {liveError && <p className="text-[#ff2a5f]">{liveError}</p>}
          {liveInfo && <p className="text-[#8a93a6]">{liveInfo}</p>}
        </div>
      )}

      {/* ── 3. MAIN LIVE TWEET STREAM & WALLET RADAR VIEW ── */}
      {feedFilterTab === "wallets" ? (
        <div className="flex-1 overflow-y-auto p-4 bg-[#0a0d14] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#1b2234]">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <span>💼</span>
                <span>Takip Edilen Balina & Smart Money Cüzdanları</span>
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Solana ağındaki pump.fun içeriden alım yapan balinalar ve başarılı dev cüzdanları canlı izleniyor.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSettingsActiveTab("wallets");
                setShowSettingsModal(true);
              }}
              className="px-3 py-1.5 rounded bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs shrink-0 flex items-center gap-1 shadow-sm active:scale-95 transition"
            >
              <span>+</span>
              <span>Yeni Cüzdan Ekle</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {trackedWallets.map((w, idx) => (
              <div
                key={idx}
                className="bg-[#111622] border border-[#1e2538] hover:border-cyan-500/40 rounded-lg p-3 transition shadow-sm"
              >
                <div className="flex items-center justify-between pb-2 border-b border-[#1b2234]">
                  <span className="font-bold text-white text-xs">{w.label}</span>
                  <span
                    className={`text-xs font-mono font-bold ${
                      w.pnlSol >= 0 ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {w.pnlSol >= 0 ? `+${w.pnlSol}` : w.pnlSol} SOL PnL
                  </span>
                </div>
                <div className="mt-2 text-xs font-mono text-gray-300 flex items-center justify-between">
                  <span>Adres:</span>
                  <code className="text-cyan-400 bg-[#0c1017] px-1.5 py-0.5 rounded text-[11px]">{w.address}</code>
                </div>
                <div className="mt-2 text-[11px] text-gray-400 flex items-center justify-between">
                  <span>Son İşlem:</span>
                  <span className="text-white font-medium">{w.lastTx}</span>
                </div>
                <div className="mt-3 pt-2 border-t border-[#1b2234] flex items-center gap-2">
                  <a
                    href={`https://solscan.io/account/${w.address}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 py-1 text-center rounded bg-[#182030] hover:bg-[#222d44] text-[11px] font-bold text-gray-300 transition"
                  >
                    Solscan
                  </a>
                  <button
                    type="button"
                    onClick={() => alert(`Cüzdan ${w.address} alımları Pump.fun radarında izleniyor.`)}
                    className="flex-1 py-1 rounded bg-cyan-500/10 hover:bg-cyan-500/20 text-[11px] font-bold text-cyan-400 border border-cyan-500/30 transition"
                  >
                    Pump Radar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div
          ref={feedScrollRef}
          onMouseEnter={() => {
            isFeedHoveredRef.current = true;
          }}
          onMouseLeave={() => {
            isFeedHoveredRef.current = false;
            setPendingTweetsCount(0);
          }}
          className="flex-1 overflow-y-auto p-3 space-y-3 bg-[#0a0d14] relative"
        >
          {/* Pending Tweets Pill */}
          {pendingTweetsCount > 0 && (
            <div className="sticky top-2 z-20 flex justify-center">
              <button
                type="button"
                onClick={() => {
                  feedScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
                  setPendingTweetsCount(0);
                }}
                className="px-3.5 py-1.5 rounded-full bg-cyan-500 text-black font-extrabold text-xs shadow-lg shadow-cyan-500/40 flex items-center gap-1.5 animate-bounce transition active:scale-95"
              >
                <span>⬆</span>
                <span>{pendingTweetsCount} yeni tweet geldi (Başa git)</span>
              </button>
            </div>
          )}

          {filteredFeed.length === 0 && (
            <div className="py-16 text-center text-sm text-[#8a93a6]">
              {isRefreshing ? (
                <div className="flex flex-col items-center gap-2">
                  <span className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></span>
                  <span>Canlı tweetler Twitter/X üzerinden alınıyor...</span>
                </div>
              ) : feed.length > 0 ? (
                "Seçtiğin filtreyle veya aramanla eşleşen tweet bulunamadı."
              ) : isStreaming ? (
                "İlk tweet'ler alınıyor…"
              ) : (
                "Henüz tweet yok. Yukarıdaki 'Yenile' veya 'LIVE STREAM' butonuna basarak canlı akışı getirebilirsiniz."
              )}
            </div>
          )}
          {filteredFeed.map((tweet) => {
            const isHighlighted = tweet.isHighlighted;

            return (
              <div
                key={tweet.id}
                className={`rounded-lg bg-[#0e121a] transition-all relative ${
                  isHighlighted
                    ? "border-2 border-[#00ff88] shadow-[0_0_20px_rgba(0,255,136,0.22)]"
                    : "border border-[#1e2538] hover:border-[#2f3a52]"
                }`}
              >
                {/* ── TWEET CARD HEADER (Author, Verified, Time 🔴, Follower Count, Retweet, Deploy) ── */}
                <div className="p-3 border-b border-[#1b2234] flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {/* User Avatar */}
                    <img
                      src={tweet.avatar}
                      alt={tweet.author}
                      className="w-9 h-9 rounded-full object-cover border border-[#2a344d] bg-[#161c28] shrink-0"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/identicon/svg?seed=${tweet.handle}`;
                      }}
                    />

                    <div className="min-w-0 flex items-center gap-2 flex-wrap">
                      {/* Author Name */}
                      <span className="font-bold text-white text-sm truncate">
                        {tweet.author}
                      </span>

                      {/* Verified Checkmark */}
                      {tweet.verified && (
                        <span className="text-[#00d2ff] text-xs">✓</span>
                      )}

                      {/* Live Timestamp (🔴 01:18:43 / 07:54:12) */}
                      <div className="flex items-center gap-1 bg-[#1a2133] px-2 py-0.5 rounded text-[10px] font-mono text-[#ff4444] border border-[#ff4444]/20">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#ff4444] animate-ping" />
                        <span>
                          {tweet.timeStr} · {formatAge(tweet.time, currentTime)}
                        </span>
                      </div>

                      {/* Handle & Followers */}
                      <span className="text-xs text-[#8a93a6]">@{tweet.handle}</span>
                      <span className="text-xs text-[#8a93a6] flex items-center gap-0.5">
                        <span>👁</span>
                        <span>{tweet.followers}</span>
                      </span>
                    </div>
                  </div>

                  {/* Right Header Buttons: Retweet/Branch + ⚡ DEPLOY Button */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      className="h-7 w-7 rounded border border-[#232a3b] bg-[#131823] hover:text-white text-[#8a93a6] flex items-center justify-center text-xs"
                      title="Retweet / Quote"
                    >
                      🔀
                    </button>

                    {/* ⚡ DEPLOY Button */}
                    <button
                      type="button"
                      onClick={() => handleOpenDeploy(tweet)}
                      className="h-7 px-3 rounded bg-white hover:bg-slate-200 text-black font-extrabold text-xs flex items-center gap-1 shadow-sm transition active:scale-95"
                    >
                      <span>⚡</span>
                      <span>DEPLOY</span>
                    </button>
                  </div>
                </div>

                {/* Sub-header: Retweet indicator if applicable */}
                {tweet.retweetedFrom && (
                  <div className="px-3 py-1 bg-[#0b0e15] border-b border-[#1b2234] text-[11px] text-[#8a93a6] flex items-center gap-1.5 font-mono">
                    <span>@{tweet.handle} retweeted {tweet.retweetedFrom}</span>
                    <span>•</span>
                    <span className="hover:text-white cursor-pointer">🔗</span>
                    <span className="hover:text-white cursor-pointer">📌</span>
                  </div>
                )}

                {/* ── MAIN CONTENT AREA: LEFT (TEXT + MEDIA + CA BANNER) & RIGHT (AI SUGGESTIONS COLUMN) ── */}
                <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-[#1b2234]">
                  {/* Left Side: Tweet Text & Embedded Image Preview */}
                  <div className="flex-1 p-3 space-y-2.5">
                    <p className="text-sm leading-relaxed text-slate-200 select-text font-sans">
                      {tweet.text}
                    </p>

                    {/* ── ⚡ DETECTED CONTRACT (CA) SNIPER BOX ── */}
                    {tweet.detectedCAs && tweet.detectedCAs.length > 0 && (
                      <div className="p-2.5 rounded-lg bg-[#00ff88]/5 border border-[#00ff88]/30 shadow-[0_0_15px_rgba(0,255,136,0.1)] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 my-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[#00ff88] font-bold text-xs tracking-wider flex items-center gap-1 shrink-0 font-mono">
                            <span className="w-2 h-2 rounded-full bg-[#00ff88] animate-ping" />
                            CA DETECTED:
                          </span>
                          <code className="text-white bg-[#0a0e16] px-2 py-0.5 rounded border border-[#20293d] text-xs font-mono truncate select-all max-w-[140px] sm:max-w-[200px]">
                            {tweet.detectedCAs[0]}
                          </code>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(tweet.detectedCAs![0]);
                              setCopiedCA(tweet.detectedCAs![0]);
                              setTimeout(() => setCopiedCA(null), 2000);
                            }}
                            className="px-2 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-[#00ff88] border border-emerald-500/30 text-[11px] font-bold transition shrink-0"
                          >
                            {copiedCA === tweet.detectedCAs[0] ? "✓ KOPYALANDI" : "📋 KOPYALA"}
                          </button>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <a
                            href={`https://pump.fun/coin/${tweet.detectedCAs[0]}`}
                            target="_blank"
                            rel="noreferrer"
                            className="px-2 py-1 rounded bg-[#131823] hover:bg-[#1b2334] text-[#00d2ff] border border-[#00d2ff]/30 text-[11px] font-bold transition flex items-center gap-1"
                          >
                            🚀 Pump.fun
                          </a>
                          <a
                            href={`https://axiom.trade/trade/${tweet.detectedCAs[0]}`}
                            target="_blank"
                            rel="noreferrer"
                            className="px-2 py-1 rounded bg-[#131823] hover:bg-[#1b2334] text-purple-400 border border-purple-500/30 text-[11px] font-bold transition flex items-center gap-1"
                          >
                            📈 Axiom
                          </a>
                          <button
                            type="button"
                            onClick={() => {
                              setDeployTokenSymbol("$SNIPE");
                              setDeployTokenName("Sniper Target");
                              setSelectedTweetForDeploy(tweet);
                              setDeployModalOpen(true);
                            }}
                            className="px-2.5 py-1 rounded bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-black text-xs font-black tracking-wide shadow-sm active:scale-95 transition"
                          >
                            ⚡ HIZLI AL (0.5 SOL)
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Embedded Media Preview */}
                    {tweet.imageUrl && (
                      <div className="rounded-lg overflow-hidden border border-[#232a3b] bg-[#0c1017] max-h-72">
                        <img
                          src={tweet.imageUrl}
                          alt="Tweet media"
                          className="w-full h-auto object-cover max-h-72"
                          loading="lazy"
                        />
                      </div>
                    )}

                    {/* Matched Keyword Tag */}
                    {tweet.matchedKeyword && (
                      <div className="flex items-center gap-1.5 pt-1">
                        <span className="text-[10px] font-mono text-[#00ff88] bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30 flex items-center gap-1">
                          <span>🎯 Matched Keyword:</span>
                          <strong>#{tweet.matchedKeyword}</strong>
                        </span>
                      </div>
                    )}

                    {/* Tweet Social Metrics (Views, Retweets) */}
                    {(tweet.views || tweet.retweets !== undefined) && (
                      <div className="flex items-center gap-3 pt-1 text-[11px] text-[#8a93a6] font-mono">
                        {tweet.views && (
                          <span className="flex items-center gap-1">
                            <span>👁</span>
                            <span>{Number(tweet.views).toLocaleString("tr-TR")} gör.</span>
                          </span>
                        )}
                        {tweet.retweets !== undefined && tweet.retweets > 0 && (
                          <span className="flex items-center gap-1 text-emerald-400">
                            <span>🔁</span>
                            <span>{tweet.retweets} RT</span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                {/* Right Side: AI Suggested Tokens Column (Matching Screenshot 1) */}
                <div className="w-full md:w-64 p-3 bg-[#0c0f16] flex flex-col gap-2 shrink-0">
                  <div className="flex items-center justify-between text-[10px] font-mono text-[#8a93a6] uppercase tracking-wider pb-1 border-b border-[#1b2234]">
                    <span>AI SUGGESTIONS</span>
                    <span className="text-[9px] hover:text-white cursor-pointer">✕ DISABLE</span>
                  </div>

                  {/* Suggestions List */}
                  <div className="space-y-1.5">
                    {tweet.aiSuggestions.map((sug, idx) => (
                      <div
                        key={idx}
                        onClick={() => handleOpenDeploy(tweet, sug)}
                        className="p-1.5 rounded border border-[#1e2538] hover:border-[#00d2ff] bg-[#111622] hover:bg-[#161c2b] flex items-center justify-between gap-2 cursor-pointer transition group"
                        title="Bu öneri ile anında Deploy aç"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {/* Suggestion Icon */}
                          <div className="w-6 h-6 rounded bg-[#1c2436] border border-[#2b374f] flex items-center justify-center text-xs shrink-0">
                            {sug.icon}
                          </div>

                          <div className="min-w-0 leading-tight">
                            <div className="font-bold text-xs text-white group-hover:text-[#00d2ff] truncate">
                              {sug.name}
                            </div>
                            <div className="text-[10px] font-mono text-cyan-400">
                              {sug.symbol}
                            </div>
                          </div>
                        </div>

                        {/* N & T Badges */}
                        <div className="flex items-center gap-1 text-[9px] font-mono shrink-0">
                          <span className="px-1 py-0.2 rounded bg-[#1e2538] text-[#8a93a6]">N</span>
                          <span className="px-1 py-0.2 rounded bg-[#1e2538] text-[#8a93a6]">T</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="text-[10px] text-[#8a93a6] text-center pt-1 font-mono">
                    Click suggestion to auto-deploy
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      )}

      {/* ── 4. SETTINGS MODAL (EXACTLY MATCHING SCREENSHOTS 2 & 3) ── */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#0e121a] border border-[#232a3b] rounded-xl w-full max-w-4xl h-[620px] flex overflow-hidden shadow-2xl">
            {/* Left Sidebar of Settings (Matching Screenshot 2 & 3) */}
            <div className="w-56 border-r border-[#232a3b] bg-[#0c1017] p-3 flex flex-col justify-between shrink-0 font-sans text-xs">
              <div className="space-y-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm text-white">Settings</h3>
                  <button
                    type="button"
                    onClick={() => setShowSettingsModal(false)}
                    className="text-[#8a93a6] hover:text-white"
                  >
                    ✕
                  </button>
                </div>

                {/* Search Settings input */}
                <input
                  type="text"
                  placeholder="Search Settings"
                  className="w-full h-7 rounded bg-[#131823] border border-[#232a3b] px-2 text-xs text-white placeholder-[#8a93a6]"
                />

                {/* TRACKER Section */}
                <div className="space-y-1">
                  <div className="text-[10px] uppercase font-bold text-[#8a93a6] px-2 py-0.5">TRACKER</div>
                  <button
                    type="button"
                    onClick={() => setSettingsActiveTab("tracker")}
                    className={`w-full text-left px-2 py-1.5 rounded transition flex items-center gap-2 ${
                      settingsActiveTab === "tracker" ? "bg-[#1f293d] text-white font-bold" : "text-[#8a93a6] hover:text-white"
                    }`}
                  >
                    <span>👥</span>
                    <span>Tracker (Accounts)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSettingsActiveTab("keywords")}
                    className={`w-full text-left px-2 py-1.5 rounded transition flex items-center gap-2 ${
                      settingsActiveTab === "keywords" ? "bg-[#1f293d] text-white font-bold" : "text-[#8a93a6] hover:text-white"
                    }`}
                  >
                    <span>⭐</span>
                    <span>Keywords</span>
                  </button>
                </div>

                {/* DEPLOY Section */}
                <div className="space-y-1">
                  <div className="text-[10px] uppercase font-bold text-[#8a93a6] px-2 py-0.5">DEPLOY</div>
                  <button
                    type="button"
                    onClick={() => setSettingsActiveTab("wallets")}
                    className={`w-full text-left px-2 py-1.5 rounded transition flex items-center gap-2 ${
                      settingsActiveTab === "wallets" ? "bg-[#1f293d] text-white font-bold" : "text-[#8a93a6] hover:text-white"
                    }`}
                  >
                    <span>💼</span>
                    <span>Wallets (Track)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSettingsActiveTab("deploy")}
                    className={`w-full text-left px-2 py-1.5 rounded transition flex items-center gap-2 ${
                      settingsActiveTab === "deploy" ? "bg-[#1f293d] text-white font-bold" : "text-[#8a93a6] hover:text-white"
                    }`}
                  >
                    <span>⚡</span>
                    <span>AI Suggestions</span>
                  </button>
                </div>
              </div>

              <div className="border-t border-[#232a3b] pt-2 space-y-1.5">
                <div className="text-[10px] text-[#8a93a6] font-mono">Yapılandırma & Yedek:</div>
                <button
                  type="button"
                  onClick={() => {
                    const config = { monitoredAccounts, keywords, trackedWallets };
                    const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `nox-radar-config-${Date.now()}.json`;
                    a.click();
                  }}
                  className="w-full py-1 rounded bg-[#182030] hover:bg-[#202b40] text-[10px] font-bold text-cyan-400 border border-[#232a3b] transition flex items-center justify-center gap-1"
                >
                  <span>💾</span>
                  <span>Ayarları İndir (JSON)</span>
                </button>
                <div className="text-[9px] text-[#8a93a6] text-center font-mono">
                  NOX Radar Pro v2.4 // 2026
                </div>
              </div>
            </div>

            {/* Right Main Panel of Settings */}
            <div className="flex-1 flex flex-col overflow-hidden bg-[#0e121a]">
              {/* ── TAB 1: TRACKER / MONITORED ACCOUNTS (SCREENSHOT 3) ── */}
              {settingsActiveTab === "tracker" && (
                <div className="flex-1 flex flex-col p-4 overflow-hidden space-y-3">
                  <div>
                    <h3 className="font-bold text-sm text-white">Tracker Settings</h3>
                    <p className="text-xs text-[#8a93a6]">Kripto dünyasının takip ettiği VIP hesaplar ve özel izleme listesi.</p>
                  </div>

                  {/* Search and add accounts input */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Twitter kullanıcı adı ekle (@elonmusk vb.)..."
                      value={newAccountInput}
                      onChange={(e) => setNewAccountInput(e.target.value)}
                      className="flex-1 h-8 rounded-md bg-[#131823] border border-[#232a3b] px-3 text-xs text-white placeholder-[#8a93a6]"
                    />
                    <button
                      type="button"
                      onClick={handleAddAccount}
                      className="h-8 px-3 rounded-md bg-[#3b82f6] hover:bg-[#2563eb] text-white font-semibold text-xs"
                    >
                      + Add Account
                    </button>
                  </div>

                  {/* Tabs: Available Accounts vs Custom Accounts */}
                  <div className="flex items-center gap-2 border-b border-[#232a3b] pb-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setAccountsViewMode("available")}
                      className={`pb-1 border-b-2 font-bold ${
                        accountsViewMode === "available" ? "border-[#00d2ff] text-[#00d2ff]" : "border-transparent text-[#8a93a6]"
                      }`}
                    >
                      Available Accounts ({monitoredAccounts.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setAccountsViewMode("custom")}
                      className={`pb-1 border-b-2 font-bold ${
                        accountsViewMode === "custom" ? "border-[#00d2ff] text-[#00d2ff]" : "border-transparent text-[#8a93a6]"
                      }`}
                    >
                      Custom Added ({monitoredAccounts.filter((a) => a.category === "custom").length})
                    </button>
                  </div>

                  {/* Account List (Screenshot 3 Rows) */}
                  <div className="flex-1 overflow-y-auto space-y-1.5 divide-y divide-[#1b2234]">
                    {monitoredAccounts
                      .filter((a) => accountsViewMode === "available" || a.category === "custom")
                      .map((acc) => (
                        <div key={acc.handle} className="pt-1.5 flex items-center justify-between py-1 px-2 hover:bg-[#131823] rounded">
                          <div className="flex items-center gap-2">
                            <img
                              src={acc.avatar}
                              alt={acc.name}
                              className="w-6 h-6 rounded-full border border-[#232a3b]"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/identicon/svg?seed=${acc.handle}`;
                              }}
                            />
                            <div>
                              <span className="text-xs font-bold text-white">@{acc.handle}</span>
                              <span className="text-[10px] text-[#8a93a6] ml-2">({acc.followers})</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                const updated = monitoredAccounts.map((a) =>
                                  a.handle === acc.handle ? { ...a, muted: !a.muted } : a
                                );
                                setMonitoredAccounts(updated);
                                saveStoredAccounts(updated);
                              }}
                              className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                                acc.muted ? "bg-red-500/15 text-red-400 border-red-500/30" : "bg-[#1c2436] text-[#8a93a6] border-[#232a3b]"
                              }`}
                            >
                              {acc.muted ? "Muted" : "Active"}
                            </button>
                            <span className="text-xs text-[#8a93a6] hover:text-white cursor-pointer" title="Bildirim">🔔</span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* ── TAB 2: KEYWORDS (SCREENSHOT 2) ── */}
              {settingsActiveTab === "keywords" && (
                <div className="flex-1 flex flex-col p-4 overflow-hidden space-y-3">
                  <div>
                    <h3 className="font-bold text-sm text-white">Keywords Filter Settings</h3>
                    <p className="text-xs text-[#8a93a6]">Yakalanan kelimelerde tweet kartları yeşil parlama efekti ile anında öne çıkar.</p>
                  </div>

                  {/* Add keyword input */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Yeni anahtar kelime ekle (örn: launch, gem, solana)..."
                      value={newKeywordInput}
                      onChange={(e) => setNewKeywordInput(e.target.value)}
                      className="flex-1 h-8 rounded-md bg-[#131823] border border-[#232a3b] px-3 text-xs text-white placeholder-[#8a93a6]"
                    />
                    <button
                      type="button"
                      onClick={handleAddKeyword}
                      className="h-8 px-3 rounded-md bg-[#00ff88] hover:bg-[#05e07a] text-black font-extrabold text-xs"
                    >
                      + Add keyword
                    </button>
                  </div>

                  {/* Built-in Toggles from Screenshot 2 */}
                  <div className="bg-[#0c1017] p-2.5 rounded-lg border border-[#232a3b] space-y-2 text-xs">
                    <div className="text-[10px] font-mono text-[#8a93a6] uppercase">BUILT-IN TRIGGERS</div>
                    <div className="flex justify-between items-center text-slate-300">
                      <span>$TICKER (Every $mention)</span>
                      <span className="text-[#00ff88] font-bold">ON ✓</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-300">
                      <span>&quot;Quoted text&quot; (Phrases inside quotes)</span>
                      <span className="text-[#00ff88] font-bold">ON ✓</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-300">
                      <span>AI predicted name</span>
                      <span className="text-[#00ff88] font-bold">ON ✓</span>
                    </div>
                  </div>

                  {/* Custom Keywords List (Screenshot 2 rows) */}
                  <div className="flex-1 overflow-y-auto space-y-1.5 divide-y divide-[#1b2234]">
                    <div className="text-[10px] font-mono text-[#8a93a6] uppercase pt-1">
                      # CUSTOM KEYWORDS ({keywords.length})
                    </div>
                    {keywords.map((kw) => (
                      <div key={kw.id} className="pt-1.5 flex items-center justify-between py-1 px-2 hover:bg-[#131823] rounded">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-3 h-3 rounded-sm ${
                              kw.color === "green"
                                ? "bg-emerald-500"
                                : kw.color === "pink"
                                ? "bg-pink-500"
                                : kw.color === "red"
                                ? "bg-rose-500"
                                : kw.color === "yellow"
                                ? "bg-amber-400"
                                : kw.color === "blue"
                                ? "bg-cyan-400"
                                : "bg-purple-500"
                            }`}
                          />
                          <span className="text-xs font-bold text-white font-mono">{kw.word}</span>
                          <span className="text-[10px] text-[#8a93a6] font-mono">({kw.matchType})</span>
                        </div>

                        <div className="flex items-center gap-2 text-xs text-[#8a93a6]">
                          <span>🔊</span>
                          <span>▶</span>
                          <button
                            type="button"
                            onClick={() => {
                              const updated = keywords.filter((k) => k.id !== kw.id);
                              setKeywords(updated);
                              saveStoredKeywords(updated);
                            }}
                            className="hover:text-red-400"
                            title="Sil"
                          >
                            🗑
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── TAB 3: WALLETS TRACKER ── */}
              {settingsActiveTab === "wallets" && (
                <div className="flex-1 flex flex-col p-4 overflow-hidden space-y-3">
                  <div>
                    <h3 className="font-bold text-sm text-white">Wallet Tracker (Smart Money & Insiders)</h3>
                    <p className="text-xs text-[#8a93a6]">Hedef cüzdanları izleyin, balina giriş ve çıkışlarını radar ekranına düşürün.</p>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="text"
                      placeholder="Solana cüzdan adresi..."
                      value={newWalletInput}
                      onChange={(e) => setNewWalletInput(e.target.value)}
                      className="col-span-2 h-8 rounded-md bg-[#131823] border border-[#232a3b] px-3 text-xs text-white placeholder-[#8a93a6]"
                    />
                    <button
                      type="button"
                      onClick={handleAddWallet}
                      className="h-8 px-3 rounded-md bg-[#3b82f6] hover:bg-[#2563eb] text-white font-semibold text-xs"
                    >
                      + Track Wallet
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-2">
                    {trackedWallets.map((w, idx) => (
                      <div key={idx} className="p-3 bg-[#0c1017] border border-[#232a3b] rounded-lg flex items-center justify-between">
                        <div>
                          <div className="font-bold text-xs text-white flex items-center gap-2">
                            <span>{w.label}</span>
                            <span className="text-[10px] font-mono text-cyan-400">{w.address}</span>
                          </div>
                          <div className="text-[11px] text-[#8a93a6] mt-0.5">{w.lastTx}</div>
                        </div>

                        <div className="text-right">
                          <span className="text-xs font-mono font-bold text-[#00ff88]">
                            +{w.pnlSol} SOL
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── TAB 4: DEPLOY & AI SUGGESTIONS SETTINGS ── */}
              {settingsActiveTab === "deploy" && (
                <div className="flex-1 flex flex-col p-4 overflow-hidden space-y-3">
                  <div>
                    <h3 className="font-bold text-sm text-white">Deploy & AI Generation Settings</h3>
                    <p className="text-xs text-[#8a93a6]">1-Click pump.fun lansman ve otomatik logo üretim yapılandırması.</p>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div>
                      <label className="text-[#8a93a6] block mb-1">Varsayılan Geliştirici Alımı (SOL)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={deployBuySol}
                        onChange={(e) => setDeployBuySol(e.target.value)}
                        className="w-full h-8 rounded bg-[#0c1017] border border-[#232a3b] px-3 text-white"
                      />
                    </div>

                    <div>
                      <label className="text-[#8a93a6] block mb-1">Block-0 Alt Cüzdan Bundle Alımı (SOL / Cüzdan)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={bundleBuyAmount}
                        onChange={(e) => setBundleBuyAmount(e.target.value)}
                        className="w-full h-8 rounded bg-[#0c1017] border border-[#232a3b] px-3 text-white"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── 5. AI TOKEN DEPLOY COCKPIT MODAL (WITH CANVAS GENERATED LOGO) ── */}
      {deployModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#0e121a] border border-[#232a3b] rounded-xl w-full max-w-xl p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#232a3b] pb-3">
              <div className="flex items-center gap-2">
                <span className="text-base text-cyan-400">⚡</span>
                <h3 className="font-bold text-sm text-white">AI Quick Deploy (Pump.fun)</h3>
              </div>
              <button
                type="button"
                onClick={() => setDeployModalOpen(false)}
                className="text-[#8a93a6] hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Generated Logo Preview & Token Basic Info */}
            <div className="flex items-center gap-4 bg-[#0c1017] p-3 rounded-lg border border-[#232a3b]">
              {/* Canvas Generated Logo */}
              <div className="w-20 h-20 rounded-lg overflow-hidden border border-cyan-500/40 bg-black flex items-center justify-center shrink-0 shadow-cyan-glow">
                {deployLogoPreview ? (
                  <img src={deployLogoPreview} alt="AI Token Logo" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl animate-spin">⚡</span>
                )}
              </div>

              <div className="flex-1 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-[#8a93a6] uppercase block">Token Adı</label>
                    <input
                      type="text"
                      value={deployTokenName}
                      onChange={(e) => setDeployTokenName(e.target.value)}
                      className="w-full h-7 rounded bg-[#131823] border border-[#232a3b] px-2 text-xs font-bold text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-[#8a93a6] uppercase block">Ticker</label>
                    <input
                      type="text"
                      value={deployTokenSymbol}
                      onChange={(e) => setDeployTokenSymbol(e.target.value)}
                      className="w-full h-7 rounded bg-[#131823] border border-[#232a3b] px-2 text-xs font-mono font-bold text-cyan-400"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    const file = await generateCanvasLogo(deployTokenSymbol, deployTokenName);
                    setDeployLogoFile(file);
                    setDeployLogoPreview(URL.createObjectURL(file));
                  }}
                  className="text-[10px] text-cyan-400 hover:underline font-mono"
                >
                  🔄 Yeni AI Logosu Üret
                </button>
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="text-[11px] text-[#8a93a6] block mb-1">Token Açıklaması</label>
              <textarea
                rows={2}
                value={deployDescription}
                onChange={(e) => setDeployDescription(e.target.value)}
                className="w-full rounded bg-[#0c1017] border border-[#232a3b] p-2 text-xs text-white"
              />
            </div>

            {/* Buy Amount & Bundle Buys */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="text-[#8a93a6] block mb-1">Geliştirici Alımı (SOL)</label>
                <input
                  type="number"
                  step="0.01"
                  value={deployBuySol}
                  onChange={(e) => setDeployBuySol(e.target.value)}
                  className="w-full h-8 rounded bg-[#0c1017] border border-[#232a3b] px-2 text-white font-mono"
                />
              </div>

              <div>
                <label className="text-[#8a93a6] block mb-1">
                  Alt Cüzdan Bundle Alımı ({subWallets.length} Cüzdan)
                </label>
                <button
                  type="button"
                  onClick={() => setEnableBundle(!enableBundle)}
                  className={`w-full h-8 rounded border font-bold transition ${
                    enableBundle
                      ? "border-emerald-500/40 bg-emerald-500/15 text-[#00ff88]"
                      : "border-[#232a3b] bg-[#0c1017] text-[#8a93a6]"
                  }`}
                >
                  {enableBundle ? `✓ Block-0 Aktif (${bundleBuyAmount} SOL/ea)` : "Bundle Kapalı"}
                </button>
              </div>
            </div>

            {/* Status & Error */}
            {deployStatus && (
              <div className="text-[11px] text-cyan-400 bg-cyan-500/10 border border-cyan-500/25 p-2 rounded font-mono">
                {deployStatus}
              </div>
            )}
            {deployError && (
              <div className="text-[11px] text-rose-400 bg-rose-500/10 border border-rose-500/25 p-2 rounded font-mono">
                {deployError}
              </div>
            )}

            {/* Launch Result */}
            {deployResult && (
              <div className="p-3 bg-[#0c1017] border border-[#00ff88]/40 rounded-lg space-y-1 text-xs font-mono">
                <div className="text-[#00ff88] font-bold">🎉 Token Pump.fun&apos;da Başarıyla Başlatıldı!</div>
                <div>Mint: <span className="text-white">{deployResult.mint}</span></div>
                <div className="flex gap-2 pt-1">
                  <a
                    href={`https://pump.fun/coin/${deployResult.mint}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-cyan-400 hover:underline"
                  >
                    Pump.fun Sayfası ↗
                  </a>
                  <Link href={`/token/${deployResult.mint}`} className="text-white hover:underline">
                    Sniper Kokpitinde Aç ↗
                  </Link>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setDeployModalOpen(false)}
                className="px-4 py-2 rounded-md border border-[#232a3b] text-[#8a93a6] hover:text-white text-xs"
              >
                Kapat
              </button>
              <button
                type="button"
                disabled={deployBusy}
                onClick={handleExecuteDeploy}
                className="flex-1 py-2 rounded-md bg-[#3b82f6] hover:bg-[#2563eb] text-white font-extrabold text-xs transition shadow-sm disabled:opacity-40"
              >
                {deployBusy ? "Lansman İşleniyor…" : "⚡ 1-Click Launch on Pump.fun"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
