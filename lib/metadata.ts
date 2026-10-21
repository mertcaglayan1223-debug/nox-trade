import { Buffer } from "buffer";
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";

// Metaplex Token Metadata programı (token'a isim, sembol ve görsel bağlar)
export const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);

export function getMetadataPda(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata"),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    TOKEN_METADATA_PROGRAM_ID
  )[0];
}

function borshString(value: string): Buffer {
  const bytes = Buffer.from(value, "utf8");
  const length = Buffer.alloc(4);
  length.writeUInt32LE(bytes.length, 0);
  return Buffer.concat([length, bytes]);
}

type Params = {
  mint: PublicKey;
  mintAuthority: PublicKey;
  payer: PublicKey;
  updateAuthority: PublicKey;
  name: string;
  symbol: string;
  uri: string;
  isMutable?: boolean; // false: metadata sonradan değiştirilemez
};

// CreateMetadataAccountV3 talimatı (talimat numarası 33)
export function createMetadataInstruction(p: Params): TransactionInstruction {
  const data = Buffer.concat([
    Buffer.from([33]),
    borshString(p.name),
    borshString(p.symbol),
    borshString(p.uri),
    Buffer.from([0, 0]), // seller_fee_basis_points = 0
    Buffer.from([0]), // creators: yok
    Buffer.from([0]), // collection: yok
    Buffer.from([0]), // uses: yok
    Buffer.from([p.isMutable === false ? 0 : 1]), // is_mutable
    Buffer.from([0]), // collection_details: yok
  ]);

  return new TransactionInstruction({
    programId: TOKEN_METADATA_PROGRAM_ID,
    keys: [
      { pubkey: getMetadataPda(p.mint), isSigner: false, isWritable: true },
      { pubkey: p.mint, isSigner: false, isWritable: false },
      { pubkey: p.mintAuthority, isSigner: true, isWritable: false },
      { pubkey: p.payer, isSigner: true, isWritable: true },
      { pubkey: p.updateAuthority, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

// Metadata hesabından isim ve sembolü okur
export function parseMetadataAccount(data: Uint8Array): {
  name: string;
  symbol: string;
} {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const decoder = new TextDecoder();
  let offset = 65; // key(1) + update authority(32) + mint(32)
  const readString = () => {
    const length = view.getUint32(offset, true);
    offset += 4;
    const text = decoder.decode(data.subarray(offset, offset + length));
    offset += length;
    return text.replace(/\0+$/, "").trim();
  };
  const name = readString();
  const symbol = readString();
  return { name, symbol };
}
