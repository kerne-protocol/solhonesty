#!/usr/bin/env node
// solhonesty CLI.
//
//   solhonesty build [--out DIR] [--registry FILE] [--window N]
//   solhonesty verify --key KEY      recompute one row's share price from chain
//
// No arguments are required. From a clean clone, `node bin/solhonesty.mjs build`
// produces a full board with nothing installed and no key configured.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadRegistry, buildBoard, appendObservations } from '../src/engine.mjs';
import { writeOutputs } from '../src/publish.mjs';
import { SolanaRpc } from '../src/rpc.mjs';
import * as save from '../src/adapters/saveReserve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function cmdBuild() {
  const registryFile = path.resolve(arg('registry', path.join(ROOT, 'registry', 'products.json')));
  const outDir = path.resolve(arg('out', path.join(ROOT, 'out')));
  const observationsFile = path.join(outDir, 'observations.jsonl');

  const registry = loadRegistry(registryFile);
  if (arg('window')) registry.windowDays = Number(arg('window'));

  console.log(`solhonesty: building ${registry.products.length} products, window ${registry.windowDays} days`);
  const t0 = Date.now();
  const board = await buildBoard({ registry, observationsFile });

  appendObservations(observationsFile, board.new_observations);
  const written = writeOutputs(board, outDir);

  for (const r of board.rows) {
    const flag = r.comparable ? 'OK ' : '   ';
    const adv = r.advertised_pct === null ? '    n/a' : `${r.advertised_pct.toFixed(4)}%`;
    const rea = r.realized_pct === null ? '    n/a' : `${r.realized_pct.toFixed(4)}%`;
    const gap = r.gap_pct === null ? '   n/a' : `${r.gap_pct >= 0 ? '+' : ''}${r.gap_pct.toFixed(4)}`;
    console.log(`${flag} ${r.key.padEnd(20)} advertised ${adv.padStart(9)}  realized ${rea.padStart(9)}  gap ${gap.padStart(9)}  ${r.realized_method ?? '-'}`);
    if (!r.comparable && r.reason) console.log(`      reason: ${r.reason}`);
  }

  console.log(`\nsummary: ${JSON.stringify(board.summary)}`);
  console.log(`wrote:\n  ${written.join('\n  ')}`);
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

async function cmdVerify() {
  const key = arg('key');
  if (!key) throw new Error('verify needs --key');
  const registry = loadRegistry(path.join(ROOT, 'registry', 'products.json'));
  const product = registry.products.find((p) => p.key === key);
  if (!product) throw new Error(`no product with key ${key}`);
  if (product.adapter !== 'save-reserve') {
    throw new Error(`verify currently only supports save-reserve rows; ${key} uses ${product.adapter}`);
  }

  const rpc = new SolanaRpc();
  const onChain = await save.readOnChain(rpc, product.reservePubkey);
  const adv = await save.fetchAdvertised(product.reservePubkey);

  const ours = onChain.pricePerShare;
  const theirs = adv.issuerReportedExchangeRate;
  const relDiff = theirs ? Math.abs(ours - theirs) / theirs : null;

  console.log(`reserve            ${product.reservePubkey}`);
  console.log(`slot               ${onChain.slot}`);
  console.log(`share price (ours) ${ours}`);
  console.log(`share price (them) ${theirs}`);
  console.log(`relative difference ${relDiff === null ? 'n/a' : relDiff.toExponential(3)}`);
  console.log(relDiff !== null && relDiff < 1e-4 ? 'AGREES' : 'DIVERGES, investigate before publishing');
}

const cmd = process.argv[2] ?? 'build';
try {
  if (cmd === 'build') await cmdBuild();
  else if (cmd === 'verify') await cmdVerify();
  else {
    console.error(`unknown command ${cmd}`);
    process.exit(2);
  }
} catch (err) {
  console.error(`solhonesty failed: ${err.message}`);
  process.exit(1);
}
