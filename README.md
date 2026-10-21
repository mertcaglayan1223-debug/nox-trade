# Memecoin Deployer – Adım 1 (cüzdan bağlama)

Solana Devnet üzerinde çalışan Next.js web uygulaması iskeleti.

## Kurulum

```bash
npm install
cp .env.example .env.local   # opsiyonel, kendi RPC adresini yazabilirsin
npm run dev
```

http://localhost:3000 adresini aç.

## Test için

1. Phantom → Ayarlar → Developer Settings → Testnet Mode'u aç, ağı **Solana Devnet** yap.
2. https://faucet.solana.com adresinden cüzdan adresine devnet SOL al.
3. Sayfada "Select Wallet" ile bağlan. Cüzdan, ağ ve bakiye görünüyorsa Adım 1 tamam.

## Sonraki adım

Adım 2: token formu + görsel/metadata'yı IPFS'e yükleme.
