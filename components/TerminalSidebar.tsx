"use client";

export type TabId =
  | "j7-tracker"
  | "pump-launch"
  | "trade"
  | "volume-bot"
  | "create"
  | "draft"
  | "liquidity"
  | "multi-wallet"
  | "quick-launch"
  | "manage"
  | "track"
  | "pump"
  | "feed"
  | "history";

type Props = {
  activeTab: TabId;
  onSelectTab: (tab: TabId) => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
};

const NAV_GROUPS: {
  title: string;
  items: {
    id: TabId;
    label: string;
    icon: string;
    badge?: string;
    badgeColor?: string;
  }[];
}[] = [
  {
    title: "LANSMAN & ÜRETİM",
    items: [
      {
        id: "j7-tracker",
        label: "J7 Sosyal Radar & Sniper",
        icon: "🎯",
        badge: "RADAR",
        badgeColor: "bg-signal/20 text-signal border-signal/30 animate-pulse",
      },
      {
        id: "pump-launch",
        label: "Pump.fun Bonding",
        icon: "🚀",
        badge: "HOT",
        badgeColor: "bg-signal/20 text-signal border-signal/30",
      },
      {
        id: "create",
        label: "SPL Token Deployer",
        icon: "🪙",
      },
      {
        id: "draft",
        label: "Tweet'ten Token (AI)",
        icon: "🤖",
        badge: "AI",
        badgeColor: "bg-violet-500/20 text-violet-400 border-violet-500/30",
      },
    ],
  },
  {
    title: "İŞLEM & TİCARET",
    items: [
      {
        id: "trade",
        label: "Hızlı İşlem & Curve",
        icon: "⚡",
        badge: "SNIPER",
        badgeColor: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
      },
      {
        id: "volume-bot",
        label: "Hacim & Bump Botu",
        icon: "📊",
        badge: "ALGO",
        badgeColor: "bg-purple-500/20 text-purple-400 border-purple-500/30",
      },
    ],
  },
  {
    title: "DEX & LİKİDİTE",
    items: [
      {
        id: "liquidity",
        label: "Raydium Havuzu & CPMM",
        icon: "💧",
        badge: "DEX",
        badgeColor: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
      },
    ],
  },
  {
    title: "CÜZDAN & OPERASYON",
    items: [
      {
        id: "multi-wallet",
        label: "Çoklu Cüzdan & Funder",
        icon: "💼",
        badge: "PRO",
        badgeColor: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
      },
      {
        id: "quick-launch",
        label: "Hızlı Hot Wallet",
        icon: "⚡",
      },
      {
        id: "manage",
        label: "Token Yönetimi",
        icon: "⚙️",
      },
      {
        id: "track",
        label: "Cüzdan & Balina Radarı",
        icon: "👁️",
      },
    ],
  },
  {
    title: "CANLI İZLEME & ANALİTİK",
    items: [
      {
        id: "pump",
        label: "Axiom Pulse Radarı",
        icon: "⚡",
        badge: "PULSE",
        badgeColor: "bg-signal/20 text-signal border-signal/30 animate-pulse",
      },
      {
        id: "feed",
        label: "Devnet Blok Akışı",
        icon: "📡",
      },
      {
        id: "history",
        label: "Lansman Geçmişi",
        icon: "📜",
      },
    ],
  },
];

export default function TerminalSidebar({
  activeTab,
  onSelectTab,
  isOpenMobile,
  onCloseMobile,
}: Props) {
  return (
    <>
      {/* Mobile Backdrop */}
      {isOpenMobile && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
        />
      )}

      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 flex w-72 flex-col border-r border-white/[0.08] bg-[#07090e]/95 backdrop-blur-2xl transition-transform duration-300 lg:static lg:translate-x-0 ${
          isOpenMobile ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Logo / Header */}
        <div className="flex h-14 items-center justify-between border-b border-white/[0.08] px-5 bg-[#090b12]/60">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-signal to-signal-dark shadow-glow-sm border border-signal/40">
              <span className="font-mono text-xs font-black text-ink">PX</span>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-mono font-extrabold tracking-wider text-mist text-xs">
                  PROXIMA // AXIOM
                </span>
                <span className="rounded bg-signal/15 px-1.5 py-0.2 font-mono text-[9px] font-bold text-signal border border-signal/30">
                  v2.5
                </span>
              </div>
              <p className="text-[9px] font-mono text-dim tracking-tight">HFT DEPLOY & SNIPER</p>
            </div>
          </div>

          <button
            onClick={onCloseMobile}
            className="text-dim hover:text-mist lg:hidden p-1 rounded-md"
          >
            ✕
          </button>
        </div>

        {/* Navigation Categories */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {NAV_GROUPS.map((group) => (
            <div key={group.title} className="space-y-1">
              <h4 className="px-3 text-[10px] font-mono font-bold uppercase tracking-widest text-muted/80">
                {group.title}
              </h4>
              <div className="space-y-0.5 pt-1">
                {group.items.map((item) => {
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        onSelectTab(item.id);
                        onCloseMobile();
                      }}
                      className={`group flex w-full items-center justify-between rounded-md px-3 py-2 text-xs font-mono transition ${
                        isActive
                          ? "bg-gradient-to-r from-signal/15 via-signal/5 to-transparent text-signal border-l-2 border-signal font-bold shadow-glow-sm"
                          : "text-dim hover:bg-white/[0.03] hover:text-mist border-l-2 border-transparent"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-xs">{item.icon}</span>
                        <span>{item.label}</span>
                      </div>
                      {item.badge && (
                        <span
                          className={`rounded border px-1.5 py-0.2 text-[9px] font-mono font-bold uppercase ${
                            item.badgeColor || "border-white/10 bg-white/[0.03] text-dim"
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* System Stats Footer */}
        <div className="border-t border-white/[0.08] bg-[#090b12]/80 p-3">
          <div className="space-y-1.5 rounded border border-white/[0.08] bg-[#0c0f16] p-2.5 text-[10px] font-mono">
            <div className="flex items-center justify-between">
              <span className="text-muted">SOLANA NETWORK:</span>
              <span className="flex items-center gap-1.5 text-signal font-bold">
                <span className="h-1.5 w-1.5 rounded-full bg-signal animate-ping" />
                ONLINE (380ms)
              </span>
            </div>
            <div className="flex items-center justify-between text-dim">
              <span>ACTIVE TPS:</span>
              <span className="text-mist font-bold">2,840 TPS</span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
