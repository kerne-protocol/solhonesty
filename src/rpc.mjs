// Solana JSON-RPC client with endpoint rotation. No dependencies, no API key.
//
// Public RPC rate limits are real and they bite in the middle of a run rather
// than at the start, so a single hardcoded endpoint fails the collector at an
// unpredictable point. Rotating on failure keeps a full board readable from a
// laptop with nothing configured.

import { postJson } from './http.mjs';

export const DEFAULT_ENDPOINTS = [
  'https://api.mainnet-beta.solana.com',
  'https://solana-rpc.publicnode.com',
  'https://rpc.ankr.com/solana',
];

export class SolanaRpc {
  constructor(endpoints = DEFAULT_ENDPOINTS) {
    if (!Array.isArray(endpoints) || endpoints.length === 0) {
      throw new Error('SolanaRpc: at least one endpoint is required');
    }
    this.endpoints = endpoints;
    this.cursor = 0;
    this.callCount = 0;
  }

  get endpoint() {
    return this.endpoints[this.cursor % this.endpoints.length];
  }

  rotate() {
    this.cursor = (this.cursor + 1) % this.endpoints.length;
  }

  async call(method, params = []) {
    let lastErr;
    for (let i = 0; i < this.endpoints.length; i++) {
      const url = this.endpoint;
      try {
        this.callCount++;
        const res = await postJson(url, { jsonrpc: '2.0', id: this.callCount, method, params }, { retries: 1 });
        if (res.error) throw new Error(`${method} rpc error: ${JSON.stringify(res.error).slice(0, 200)}`);
        return res.result;
      } catch (err) {
        lastErr = err;
        this.rotate();
      }
    }
    throw new Error(`SolanaRpc.${method} failed on all ${this.endpoints.length} endpoints: ${lastErr?.message}`);
  }

  async getHealth() {
    return this.call('getHealth');
  }

  async getSlot() {
    return this.call('getSlot');
  }

  // Returns { buffer, owner, slot } or null when the account does not exist.
  async getAccountRaw(address) {
    const res = await this.call('getAccountInfo', [address, { encoding: 'base64' }]);
    if (!res || !res.value) return null;
    return {
      buffer: Buffer.from(res.value.data[0], 'base64'),
      owner: res.value.owner,
      lamports: res.value.lamports,
      slot: res.context?.slot ?? null,
    };
  }

  async getTokenSupply(mint) {
    const res = await this.call('getTokenSupply', [mint]);
    return res?.value ?? null;
  }

  async getTokenAccountBalance(account) {
    const res = await this.call('getTokenAccountBalance', [account]);
    return res?.value ?? null;
  }
}

// Little-endian readers for raw account data.
export function readU64LE(buf, offset) {
  return buf.readBigUInt64LE(offset);
}

export function readU128LE(buf, offset) {
  const lo = buf.readBigUInt64LE(offset);
  const hi = buf.readBigUInt64LE(offset + 8);
  return (hi << 64n) + lo;
}
