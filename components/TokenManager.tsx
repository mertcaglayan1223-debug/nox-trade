"use client";

import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  AuthorityType,
  createAssociatedTokenAccountIdempotentInstruction,
  createBurnInstruction,
  createSetAuthorityInstruction,
  createTransferCheckedInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  getMint,
} from "@solana/spl-token";
import { getMetadataPda, parseMetadataAccount } from "@/lib/metadata";
import { ActivityType, addActivity, loadActivity } from "@/lib/activity";
import {
  Field,
  formatUnits,
  ghostButtonClass,
  inputClass,
  shorten,
  toRaw,
} from "@/components/ui";

type Info = {
  mint: PublicKey;
  supply: bigint;
  decimals: number;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  name: string;
  symbol: string;
  balance: bigint;
};

export default function TokenManager() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();

  const [address, setAddress] = useState("");
  const [info, setInfo] = useState<Info | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);

  const [burnAmount, setBurnAmount] = useState("");
  const [sendTo, setSendTo] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  useEffect(() => {
    const mints = loadActivity()
      .filter((a) => a.type === "launch")
      .map((a) => a.mint);
    setRecent(Array.from(new Set(mints)).slice(0, 5));
  }, []);

  async function load(value: string) {
    if (!publicKey) return;
    setError(null);
    setNotice(null);
    setInfo(null);

    let mintKey: PublicKey;
    try {
      mintKey = new PublicKey(value.trim());
    } catch {
      setError("Geçerli bir Solana adresi değil.");
      return;
    }

    setLoading(true);
    try {
      const mint = await getMint(connection, mintKey);

      let name = "";
      let symbol = "";
      try {
        const account = await connection.getAccountInfo(
          getMetadataPda(mintKey)
        );
        if (account) {
          const meta = parseMetadataAccount(account.data);
          name = meta.name;
          symbol = meta.symbol;
        }
      } catch {
        // metadata yoksa boş bırak
      }

      let balance = BigInt(0);
      try {
        const ata = getAssociatedTokenAddressSync(mintKey, publicKey);
        const account = await getAccount(connection, ata);
        balance = account.amount;
      } catch {
        // token hesabın yoksa bakiye 0
      }

      setInfo({
        mint: mintKey,
        supply: mint.supply,
        decimals: mint.decimals,
        mintAuthority: mint.mintAuthority
          ? mint.mintAuthority.toBase58()
          : null,
        freezeAuthority: mint.freezeAuthority
          ? mint.freezeAuthority.toBase58()
          : null,
        name,
        symbol,
        balance,
      });
    } catch {
      setError(
        "Bu adres bir SPL token (mint) değil ya da bulunamadı. Doğru ağda (Devnet) olduğundan emin ol."
      );
    } finally {
      setLoading(false);
    }
  }

  async function run(
    type: ActivityType,
    label: string,
    instructions: TransactionInstruction[]
  ) {
    if (!publicKey || !info) return;
    const mintAddress = info.mint.toBase58();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const tx = new Transaction().add(...instructions);
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;

      const signature = await sendTransaction(tx, connection);
      const confirmation = await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed"
      );
      if (confirmation.value.err) {
        throw new Error("İşlem zincirde başarısız oldu.");
      }
      addActivity({ type, mint: mintAddress, signature, label });
      await load(mintAddress);
      setNotice(`${label} tamamlandı.`);
      setBurnAmount("");
      setSendAmount("");
      setConfirmRevoke(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(
        /reject/i.test(message) ? "Cüzdanda işlemi reddettin." : message
      );
    } finally {
      setBusy(false);
    }
  }

  function handleBurn() {
    if (!publicKey || !info) return;
    const raw = toRaw(burnAmount, info.decimals);
    if (raw === null || raw <= BigInt(0)) {
      return setError("Geçerli bir miktar yaz.");
    }
    if (raw > info.balance) {
      return setError("Cüzdanındaki bakiyeden fazlasını yakamazsın.");
    }
    const ata = getAssociatedTokenAddressSync(info.mint, publicKey);
    run("burn", `${burnAmount} token yakıldı`, [
      createBurnInstruction(ata, info.mint, publicKey, raw),
    ]);
  }

  function handleSend() {
    if (!publicKey || !info) return;
    const raw = toRaw(sendAmount, info.decimals);
    if (raw === null || raw <= BigInt(0)) {
      return setError("Geçerli bir miktar yaz.");
    }
    if (raw > info.balance) {
      return setError("Cüzdanındaki bakiyeden fazlasını gönderemezsin.");
    }
    let recipient: PublicKey;
    try {
      recipient = new PublicKey(sendTo.trim());
    } catch {
      return setError("Alıcı adresi geçerli değil.");
    }
    const source = getAssociatedTokenAddressSync(info.mint, publicKey);
    const destination = getAssociatedTokenAddressSync(
      info.mint,
      recipient,
      true
    );
    run("send", `${sendAmount} token ${shorten(recipient.toBase58())} adresine gönderildi`, [
      createAssociatedTokenAccountIdempotentInstruction(
        publicKey,
        destination,
        recipient,
        info.mint
      ),
      createTransferCheckedInstruction(
        source,
        info.mint,
        destination,
        publicKey,
        raw,
        info.decimals
      ),
    ]);
  }

  function handleRevoke(kind: "mint" | "freeze") {
    if (!publicKey || !info) return;
    run(
      "revoke",
      kind === "mint" ? "Mint yetkisi kapatıldı" : "Freeze yetkisi kapatıldı",
      [
        createSetAuthorityInstruction(
          info.mint,
          publicKey,
          kind === "mint"
            ? AuthorityType.MintTokens
            : AuthorityType.FreezeAccount,
          null
        ),
      ]
    );
  }

  if (!publicKey) {
    return (
      <p className="text-dim">Token yönetmek için önce cüzdanını bağla.</p>
    );
  }

  const wallet = publicKey.toBase58();
  const isMintAuthority = info?.mintAuthority === wallet;
  const isFreezeAuthority = info?.freezeAuthority === wallet;

  return (
    <section className="w-full space-y-4 rounded-xl border border-line bg-panel p-5 text-left">
      <div>
        <h2 className="text-xl font-bold">Token yönet / içe aktar</h2>
        <p className="text-sm text-dim">
          Bir token adresini yükle, bilgilerini gör. Cüzdanında bakiyesi varsa
          yakabilir ya da gönderebilirsin. Tüm işlemleri sen onaylarsın.
        </p>
      </div>

      <div className="space-y-2">
        <Field label="Token (mint) adresi">
          <input
            className={inputClass}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Token adresini yapıştır"
          />
        </Field>
        <button
          type="button"
          disabled={loading || !address.trim()}
          onClick={() => load(address)}
          className={ghostButtonClass}
        >
          {loading ? "Yükleniyor…" : "Yükle"}
        </button>
        {recent.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-dim">
            <span>Son oluşturdukların:</span>
            {recent.map((m) => (
              <button
                key={m}
                type="button"
                className="underline"
                onClick={() => {
                  setAddress(m);
                  load(m);
                }}
              >
                {shorten(m)}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-signal">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-dim">
          {notice}
        </p>
      )}

      {info && (
        <div className="space-y-4">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg border border-line bg-ink p-4 text-sm">
            <dt className="text-dim">Token</dt>
            <dd>
              {info.name || "İsimsiz"}
              {info.symbol ? ` (${info.symbol})` : ""}
            </dd>
            <dt className="text-dim">Toplam arz</dt>
            <dd>{formatUnits(info.supply, info.decimals)}</dd>
            <dt className="text-dim">Ondalık</dt>
            <dd>{info.decimals}</dd>
            <dt className="text-dim">Mint yetkisi</dt>
            <dd>
              {info.mintAuthority === null
                ? "Kapalı"
                : isMintAuthority
                ? "Sende"
                : shorten(info.mintAuthority)}
            </dd>
            <dt className="text-dim">Freeze yetkisi</dt>
            <dd>
              {info.freezeAuthority === null
                ? "Kapalı"
                : isFreezeAuthority
                ? "Sende"
                : shorten(info.freezeAuthority)}
            </dd>
            <dt className="text-dim">Senin bakiyen</dt>
            <dd>{formatUnits(info.balance, info.decimals)}</dd>
          </dl>

          <div className="space-y-2 rounded-lg border border-line bg-ink p-4">
            <p className="font-semibold">Yak</p>
            <input
              className={inputClass}
              inputMode="decimal"
              value={burnAmount}
              onChange={(e) => setBurnAmount(e.target.value)}
              placeholder="Yakılacak miktar"
              aria-label="Yakılacak miktar"
            />
            <button
              type="button"
              disabled={busy || info.balance === BigInt(0)}
              onClick={handleBurn}
              className={ghostButtonClass}
            >
              Yak
            </button>
            <p className="text-xs text-dim">
              Yakılan token kalıcı olarak yok olur, geri alınamaz.
            </p>
          </div>

          <div className="space-y-2 rounded-lg border border-line bg-ink p-4">
            <p className="font-semibold">Gönder</p>
            <input
              className={inputClass}
              value={sendTo}
              onChange={(e) => setSendTo(e.target.value)}
              placeholder="Alıcı cüzdan adresi"
              aria-label="Alıcı cüzdan adresi"
            />
            <input
              className={inputClass}
              inputMode="decimal"
              value={sendAmount}
              onChange={(e) => setSendAmount(e.target.value)}
              placeholder="Miktar"
              aria-label="Gönderilecek miktar"
            />
            <button
              type="button"
              disabled={busy || info.balance === BigInt(0)}
              onClick={handleSend}
              className={ghostButtonClass}
            >
              Gönder
            </button>
          </div>

          {(isMintAuthority || isFreezeAuthority) && (
            <div className="space-y-2 rounded-lg border border-line bg-ink p-4">
              <p className="font-semibold">Yetkileri kapat</p>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={confirmRevoke}
                  onChange={(e) => setConfirmRevoke(e.target.checked)}
                />
                <span>Bunun geri alınamaz olduğunu anlıyorum.</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {isMintAuthority && (
                  <button
                    type="button"
                    disabled={busy || !confirmRevoke}
                    onClick={() => handleRevoke("mint")}
                    className={ghostButtonClass}
                  >
                    Mint yetkisini kapat
                  </button>
                )}
                {isFreezeAuthority && (
                  <button
                    type="button"
                    disabled={busy || !confirmRevoke}
                    onClick={() => handleRevoke("freeze")}
                    className={ghostButtonClass}
                  >
                    Freeze yetkisini kapat
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
