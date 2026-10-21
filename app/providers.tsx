"use client";

import { ReactNode } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { NetworkProvider, useSolanaNetwork } from "@/lib/networkContext";
import "@solana/wallet-adapter-react-ui/styles.css";

function SolanaAdapterInner({ children }: { children: ReactNode }) {
  const { rpcUrl } = useSolanaNetwork();

  // Phantom, Solflare, Backpack gibi cüzdanlar otomatik algılanır (Wallet Standard).
  return (
    <ConnectionProvider endpoint={rpcUrl}>
      <WalletProvider wallets={[]} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <NetworkProvider>
      <SolanaAdapterInner>{children}</SolanaAdapterInner>
    </NetworkProvider>
  );
}
