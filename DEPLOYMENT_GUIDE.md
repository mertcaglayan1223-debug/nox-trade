# 🚀 AXIOM TRADE & J7TRACKER CANLIYA ALMA (DEPLOYMENT) REHBERİ

Bu rehber, Next.js tabanlı memecoin deployer & trading terminalinizi internete herkese açık olarak nasıl yayına alacağınızı adım adım açıklar.

---

## ⚡ SEÇENEK 1: VERCEL İLE TEK TIKLA YAYINLAMA (En Kolay & Ücretsiz)

Vercel, Next.js için en hızlı ve ücretsiz hosting sağlayıcısıdır (Otomatik SSL + Global CDN).

### Adım 1: Projeyi GitHub'a Yükleyin
```bash
git init
git add .
git commit -m "feat: Axiom Trade terminal with J7Tracker & Auto-Sniper"
git branch -M main
# Kendi GitHub repository adresinizi ekleyin:
git remote add origin https://github.com/KULLANICI_ADINIZ/nifty-hopper.git
git push -u origin main
```

### Adım 2: Vercel'e Bağlayın
1. [vercel.com](https://vercel.com) adresine gidin ve GitHub hesabınızla giriş yapın.
2. **"Add New Project"** butonuna basıp az önce oluşturduğunuz repoyu seçin.
3. **Environment Variables** (Çevre Değişkenleri) bölümüne şunları ekleyin:
   - `TWEXAPI_KEY`: `.env.local` dosyanızdaki TwexAPI anahtarınız.
   - `NEXT_PUBLIC_SOLANA_NETWORK`: `mainnet-beta` (veya test için `devnet`).
   - `NEXT_PUBLIC_MAINNET_RPC`: `https://api.mainnet-beta.solana.com` (veya Helius/QuickNode URL'iniz).
4. **"Deploy"** butonuna basın. 2 dakika içinde siteniz `https://projeniz.vercel.app` şeklinde yayında olacaktır!

### Adım 3: Kendi Alan Adınızı (.com / .trade / .fun) Bağlayın
- Vercel Dashboard -> **Settings** -> **Domains** bölümüne gidin.
- Sahip olduğunuz alan adını (örn. `mysniper.trade`) yazın ve DNS ayarlarını (A record / CNAME) yönlendirin.

---

## 🖥️ SEÇENEK 2: ÖZEL SUNUCU (VPS / UBUNTU) İLE YAYINLAMA

Hetzner, DigitalOcean veya AWS üzerinde kendi sunucunuzda çalıştırmak için:

### 1. Sunucu Hazırlığı
```bash
# Node.js 20+ ve PM2 kurulumu
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

### 2. Projeyi Sunucuya Çekin & Derleyin
```bash
git clone https://github.com/KULLANICI_ADINIZ/nifty-hopper.git /var/www/axiom
cd /var/www/axiom
npm install
cp .env.example .env.local
# .env.local içine TWEXAPI_KEY değerinizi girin (nano .env.local)
npm run build
```

### 3. PM2 ile 7/24 Kesintisiz Başlatma
```bash
pm2 start npm --name "axiom-trade" -- start
pm2 save
pm2 startup
```

### 4. Nginx & Ücretsiz SSL (Certbot)
```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```
Nginx yapılandırması (`/etc/nginx/sites-available/axiom`):
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```
SSL sertifikasını aktif etme:
```bash
sudo ln -s /etc/nginx/sites-available/axiom /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

---

## 🔒 Güvenlik Notları
- `.env.local` dosyanız hiçbir zaman GitHub'a yüklenmez (`.gitignore` dosyasında yer almaktadır).
- Canlı Mainnet işlemlerinde Helius veya QuickNode gibi özel RPC'ler kullanılması pump.fun üzerindeki hızınızı katlayacaktır.
