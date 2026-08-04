// Live tests. Skipped unless SOLHONESTY_LIVE=1, so `npm test` stays offline and
// deterministic. These are the tests that would catch an upstream layout or API
// change, which is exactly the failure a dataset must not publish through.

import test from 'node:test';
import assert from 'node:assert/strict';

import { SolanaRpc } from '../src/rpc.mjs';
import * as save from '../src/adapters/saveReserve.mjs';
import * as kamino from '../src/adapters/kaminoLend.mjs';

const LIVE = process.env.SOLHONESTY_LIVE === '1';
const opts = { skip: LIVE ? false : 'set SOLHONESTY_LIVE=1 to run tests that hit mainnet' };

const SAVE_USDC_RESERVE = 'BgxfHJDzm44T7XG68MYKx7YisTjZu73tVovyZSjJMpmw';
const KAMINO_MAIN = '7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF';
const KAMINO_USDC_RESERVE = 'D6q6wuQSrifJKZYpR1M8R4YawnLDtDsMmWM1NbBmgJ59';

test('public Solana RPC answers without a key', opts, async () => {
  const rpc = new SolanaRpc();
  assert.equal(await rpc.getHealth(), 'ok');
});

test('our share price for the Save USDC reserve agrees with the one Save publishes', opts, async () => {
  const rpc = new SolanaRpc();
  const [onChain, adv] = await Promise.all([
    save.readOnChain(rpc, SAVE_USDC_RESERVE),
    save.fetchAdvertised(SAVE_USDC_RESERVE),
  ]);
  assert.ok(onChain.pricePerShare > 1, 'a long running lending reserve must have a share price above 1');
  assert.ok(adv.issuerReportedExchangeRate, 'Save published no exchange rate to check against');
  const rel = Math.abs(onChain.pricePerShare - adv.issuerReportedExchangeRate) / adv.issuerReportedExchangeRate;
  // The two reads are seconds apart, so they will not be bit identical. A
  // relative difference above 1e-4 means the decoder, not the clock, is wrong.
  assert.ok(rel < 1e-4, `ours ${onChain.pricePerShare} theirs ${adv.issuerReportedExchangeRate} rel ${rel}`);
});

test('the Save reserve account is still owned by the Save program and still 619 bytes', opts, async () => {
  const rpc = new SolanaRpc();
  const acct = await rpc.getAccountRaw(SAVE_USDC_RESERVE);
  assert.equal(acct.owner, save.SAVE_PROGRAM_ID);
  assert.equal(acct.buffer.length, save.RESERVE_ACCOUNT_LEN);
});

test('Save still publishes a supply rate we can read', opts, async () => {
  const adv = await save.fetchAdvertised(SAVE_USDC_RESERVE);
  assert.equal(adv.figures.length, 1);
  assert.ok(Number.isFinite(adv.figures[0].pct));
  assert.ok(adv.figures[0].verbatim.includes('supplyInterest'));
});

test('Kamino still publishes a supply APY and a share price history for USDC', opts, async () => {
  const adv = await kamino.fetchAdvertised({ marketPubkey: KAMINO_MAIN, reservePubkey: KAMINO_USDC_RESERVE });
  assert.equal(adv.figures.length, 1);
  assert.ok(Number.isFinite(adv.figures[0].pct));

  const realized = await kamino.fetchRealized({ marketPubkey: KAMINO_MAIN, reservePubkey: KAMINO_USDC_RESERVE, windowDays: 30 });
  assert.equal(realized.ok, true, realized.reason);
  assert.ok(realized.observations > 100, `expected a dense history, got ${realized.observations}`);
  assert.ok(realized.ppsTo > realized.ppsFrom, 'an interest bearing reserve share price must rise over 30 days');
  assert.ok(realized.annualizedPct > 0 && realized.annualizedPct < 50, `implausible realized ${realized.annualizedPct}`);
});
