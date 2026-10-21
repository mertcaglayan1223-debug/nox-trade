"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { clusterApiUrl } from "@solana/web3.js";

export type SolanaNetwork = "mainnet-beta" | "devnet";

interface NetworkContextType {
  network: SolanaNetwork;
  rpcUrl: string;
  customRpcUrl: string;
  pingMs: number | null;
  setNetwork: (net: SolanaNetwork) => void;
  setCustomRpcUrl: (url: string) => void;
  resetDefaultRpc: () => void;
  checkRpcPing: (urlOverride?: string) => Promise<number | null>;
}

const NetworkContext = createContext<NetworkContextType | undefined>(undefined);

const NETWORK_STORAGE_KEY = "nox_solana_network";
const CUSTOM_RPC_STORAGE_KEY = "nox_custom_rpc";

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [network, setNetworkState] = useState<SolanaNetwork>("devnet");
  const [customRpcUrl, setCustomRpcState] = useState<string>("");
  const [pingMs, setPingMs] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const savedNet = (localStorage.getItem(NETWORK_STORAGE_KEY) || localStorage.getItem("axiom_solana_network")) as SolanaNetwork | null;
      if (savedNet === "mainnet-beta" || savedNet === "devnet") {
        setNetworkState(savedNet);
      }
      const savedRpc = localStorage.getItem(CUSTOM_RPC_STORAGE_KEY) || localStorage.getItem("axiom_custom_rpc");
      if (savedRpc) {
        setCustomRpcState(savedRpc);
      }
    } catch {}
  }, []);

  const setNetwork = (net: SolanaNetwork) => {
    setNetworkState(net);
    try {
      localStorage.setItem(NETWORK_STORAGE_KEY, net);
    } catch {}
  };

  const setCustomRpcUrl = (url: string) => {
    const trimmed = url.trim();
    setCustomRpcState(trimmed);
    try {
      if (trimmed) {
        localStorage.setItem(CUSTOM_RPC_STORAGE_KEY, trimmed);
      } else {
        localStorage.removeItem(CUSTOM_RPC_STORAGE_KEY);
      }
    } catch {}
  };

  const resetDefaultRpc = () => {
    setCustomRpcState("");
    try {
      localStorage.removeItem(CUSTOM_RPC_STORAGE_KEY);
      localStorage.removeItem("axiom_custom_rpc");
    } catch {}
  };

  const rpcUrl = useMemo(() => {
    if (customRpcUrl && customRpcUrl.startsWith("http")) {
      return customRpcUrl;
    }
    if (network === "mainnet-beta") {
      return (
        process.env.NEXT_PUBLIC_MAINNET_RPC ||
        process.env.NEXT_PUBLIC_RPC_URL ||
        "https://api.mainnet-beta.solana.com"
      );
    }
    return (
      process.env.NEXT_PUBLIC_DEVNET_RPC ||
      clusterApiUrl("devnet")
    );
  }, [network, customRpcUrl]);

  const checkRpcPing = async (urlOverride?: string): Promise<number | null> => {
    const targetUrl = urlOverride || rpcUrl;
    if (!targetUrl || !targetUrl.startsWith("http")) return null;
    try {
      const start = performance.now();
      const res = await fetch(targetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getLatestBlockhash",
          params: [{ commitment: "processed" }]
        })
      });
      if (res.ok) {
        const ms = Math.round(performance.now() - start);
        setPingMs(ms);
        return ms;
      }
      setPingMs(null);
      return null;
    } catch {
      setPingMs(null);
      return null;
    }
  };

  useEffect(() => {
    if (mounted && rpcUrl) {
      checkRpcPing();
    }
  }, [mounted, rpcUrl]);

  return (
    <NetworkContext.Provider
      value={{
        network,
        rpcUrl,
        customRpcUrl,
        pingMs,
        setNetwork,
        setCustomRpcUrl,
        resetDefaultRpc,
        checkRpcPing,
      }}
    >
      {children}
    </NetworkContext.Provider>
  );
}

export function useSolanaNetwork() {
  const ctx = useContext(NetworkContext);
  if (!ctx) {
    throw new Error("useSolanaNetwork must be used within a NetworkProvider");
  }
  return ctx;
}
