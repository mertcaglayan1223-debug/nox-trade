import React from 'react';

export const TokenCard = ({
  token,
  onQuickBuy,
  onClick,
  isSelected,
  buyingMint,
}: any) => {
  return (
    <div
      onClick={() => onClick && onClick(token)}
      className={`bg-[#111520] hover:bg-[#151a28] border ${
        isSelected
          ? 'border-[#00d2ff] ring-1 ring-[#00d2ff]/40 shadow-cyan-glow'
          : 'border-[#1e2538] hover:border-[#3b82f6]/40'
      } rounded-lg p-2.5 mb-2.5 transition-all duration-150 shadow-sm relative group cursor-pointer`}
    >
      {/* Üst Kısım: Sol Bilgiler + Sağ Finansal Veriler */}
      <div className="flex justify-between items-start gap-2">
        {/* Sol Taraf: Token Logosu + İsim + Quick Buy + Sosyal Linkler */}
        <div className="flex items-start gap-2.5 min-w-0">
          {/* Token Görseli */}
          <div className="relative shrink-0">
            <img
              src={
                token.image ||
                `https://api.dicebear.com/7.x/identicon/svg?seed=${token.symbol || 'token'}`
              }
              alt={token.symbol}
              className="w-11 h-11 rounded-lg object-cover border border-[#232b3e] bg-[#1a2133]"
              onError={(e) => {
                (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/identicon/svg?seed=${token.symbol || 'token'}`;
              }}
            />
            <span className="absolute -bottom-1 -right-1 w-2.5 h-2.5 bg-emerald-500 border-2 border-[#111520] rounded-full"></span>
          </div>

          {/* Token Detayları */}
          <div className="flex flex-col min-w-0">
            {/* Ticker & Quick Buy Butonu */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-bold text-white text-sm truncate max-w-[90px]">
                {token.symbol}
              </span>

              {/* Axiom Tarzı Parlak Quick Buy Butonu */}
              <button
                type="button"
                disabled={buyingMint === token.mint}
                onClick={(e) => {
                  e.stopPropagation();
                  onQuickBuy && onQuickBuy(token, e);
                }}
                className="px-2 py-0.5 rounded-full bg-[#00d2ff]/10 hover:bg-[#00d2ff]/20 text-[#00d2ff] border border-[#00d2ff]/30 text-[10px] font-bold flex items-center gap-1 transition-all active:scale-95 disabled:opacity-40"
              >
                <span>⚡</span> Quick Buy {token.quickBuyAmount || '0.1'} SOL
              </button>
            </div>

            {/* Yaş + Sosyal Medya İkon Alanı */}
            <div className="flex items-center gap-2 mt-1 text-[11px] text-gray-400">
              <span className="text-gray-400 font-medium">{token.age || '16s'}</span>

              {/* İkonlar */}
              <div className="flex items-center gap-1.5 text-gray-500">
                <span
                  className="hover:text-white cursor-pointer"
                  title="Website"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (token.website) window.open(token.website, '_blank');
                  }}
                >
                  🌐
                </span>
                <span
                  className="hover:text-white cursor-pointer"
                  title="Explorer / Pump"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (token.mint) window.open(`https://pump.fun/coin/${token.mint}`, '_blank');
                  }}
                >
                  🔍
                </span>
                <span className="hover:text-white cursor-pointer">
                  👥 {token.holders || '137'}
                </span>
              </div>
            </div>

            {/* Twitter / Dev Bilgisi */}
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[10px] text-blue-400 font-medium truncate max-w-[110px]">
                {token.twitter || '@handle'}
              </span>
              <span className="text-[9px] bg-blue-900/30 text-blue-300 px-1 py-0.2 rounded border border-blue-800/30">
                DS 9mo
              </span>
            </div>
          </div>
        </div>

        {/* Sağ Taraf: Market Cap & Liquidity (Mavi/Cyan Metinler) */}
        <div className="flex flex-col items-end shrink-0">
          <div className="text-right">
            <span className="text-[#00d2ff] font-extrabold text-sm tracking-tight block">
              ${token.mcap || '29K'}{' '}
              <span className="text-[10px] text-[#00d2ff]/70 font-semibold">MC</span>
            </span>
            <span className="text-blue-400 font-bold text-xs block">
              {token.liquidity || '$18.1K'}
            </span>
          </div>

          <div className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
            <span>F</span>{' '}
            <span className="text-gray-200 font-semibold">{token.solAmount || '1.647'}</span>
            <span>TX</span>{' '}
            <span className="text-gray-200 font-semibold">{token.txCount || '364'}</span>
          </div>
        </div>
      </div>

      {/* İnce Bonding Curve / Progress Çubuğu */}
      <div className="w-full bg-[#1b2234] h-1 rounded-full mt-2 overflow-hidden">
        <div
          className="bg-gradient-to-r from-blue-500 to-cyan-400 h-full rounded-full transition-all duration-300"
          style={{ width: `${token.bondingProgress || 65}%` }}
        ></div>
      </div>

      {/* Alt Rozetler (Safety / Dev Out / Holders) */}
      <div className="flex items-center justify-between gap-1 mt-2 pt-1.5 border-t border-[#1e2538]/60 text-[10px]">
        <div className="flex items-center gap-1">
          {token.isDevSold !== false ? (
            <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
              DEV OUT
            </span>
          ) : (
            <span className="px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-medium">
              DEV {token.devHoldingPercent || '0'}%
            </span>
          )}
          <span className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-300 font-medium">
            TOP10 {token.top10Percent || '31'}%
          </span>
          <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
            BNDL {token.bundlePercent ? `${token.bundlePercent}%` : '19%'}
          </span>
        </div>
        <span className="text-gray-500 font-mono text-[9px]">{token.tx || `${token.txCount || '11'} TX`}</span>
      </div>
    </div>
  );
};

export default TokenCard;
