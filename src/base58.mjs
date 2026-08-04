// Base58 (Bitcoin alphabet, as used by Solana) encode and decode.
// No dependencies, so this project can run from a clean clone with nothing
// installed. Solana account keys are 32 raw bytes; every public surface prints
// them base58, so a reader that touches raw account data needs both directions.

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const MAP = new Map([...ALPHABET].map((c, i) => [c, BigInt(i)]));

export function decodeBase58(str) {
  if (typeof str !== 'string' || str.length === 0) {
    throw new Error('decodeBase58: expected a non-empty string');
  }
  let n = 0n;
  for (const ch of str) {
    const v = MAP.get(ch);
    if (v === undefined) throw new Error(`decodeBase58: invalid character ${JSON.stringify(ch)}`);
    n = n * 58n + v;
  }
  const bytes = [];
  while (n > 0n) {
    bytes.unshift(Number(n % 256n));
    n /= 256n;
  }
  // Leading '1's are leading zero bytes.
  for (const ch of str) {
    if (ch === '1') bytes.unshift(0);
    else break;
  }
  return Buffer.from(bytes);
}

export function encodeBase58(buf) {
  if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf);
  let n = 0n;
  for (const b of buf) n = n * 256n + BigInt(b);
  let out = '';
  while (n > 0n) {
    out = ALPHABET[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of buf) {
    if (b === 0) out = '1' + out;
    else break;
  }
  return out === '' ? '1' : out;
}

// Solana addresses are 32 bytes. Anything else is a typo, not an address.
export function isValidSolanaAddress(str) {
  try {
    return decodeBase58(str).length === 32;
  } catch {
    return false;
  }
}
