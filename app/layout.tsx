import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Providers from "./providers";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "NOX TRADE // Solana Pulse Terminal & Alpha Radar",
  description: "NOX Trade - Ultra-fast Solana Memecoin Trading Terminal, Social Alpha Radar and Auto-Sniper.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr" className="dark">
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} font-sans bg-[#0a0d14] text-[#ffffff] antialiased selection:bg-[#00d2ff]/20 selection:text-[#00d2ff]`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
