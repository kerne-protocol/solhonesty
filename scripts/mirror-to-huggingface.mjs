#!/usr/bin/env node
//
// Mirror the built board to a Hugging Face dataset repository.
//
// WHY A DATASET REPOSITORY
// ------------------------
// A GitHub repository is read by people who already went looking for it. A
// dataset repository is read by retrievers, and by people searching for the
// subject rather than for us. On the EVM version of this board the mirror
// out-distributed every owned channel put together within a week, at zero
// promotional cost, which is the entire argument for this file existing.
//
// NO DEPENDENCIES, deliberately, like the rest of this repository. The Hugging
// Face commit endpoint takes NDJSON over plain fetch: one `header` line for the
// commit message, then one `file` line per file, base64 encoded.
//
//   HF_TOKEN    a write token scoped to the target namespace
//   HF_DATASET  owner/name, e.g. kerne-protocol/solana-yield-honesty
//
// Exits non-zero on any failure. A mirror that silently publishes nothing is
// worse than one that goes red, because the repository advertises this dataset
// as self-refreshing and that claim has already been false once.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const OUT = path.join(ROOT, 'out');

const TOKEN = process.env.HF_TOKEN;
const DATASET = process.env.HF_DATASET || 'kerne-protocol/solana-yield-honesty';

function die(msg) {
  console.error(`mirror-to-huggingface: ${msg}`);
  process.exit(1);
}

if (!TOKEN) die('HF_TOKEN is not set');
if (!/^[\w.-]+\/[\w.-]+$/.test(DATASET)) die(`HF_DATASET "${DATASET}" is not owner/name`);

// The card becomes README.md at the dataset root, because that is the file
// Hugging Face renders as the dataset card. Everything else keeps its name.
const FILES = [
  { from: 'DATASET_CARD.md', to: 'README.md', required: true },
  { from: 'current.csv', to: 'current.csv', required: true },
  { from: 'index.json', to: 'index.json', required: true },
  { from: 'observations.jsonl', to: 'observations.jsonl', required: false },
];

const payload = [];
for (const f of FILES) {
  const p = path.join(OUT, f.from);
  if (!fs.existsSync(p)) {
    if (f.required) die(`${f.from} is missing from out/. Run the build first.`);
    continue;
  }
  payload.push({ to: f.to, content: fs.readFileSync(p) });
}

// Read the snapshot instant out of the board itself rather than stamping "now".
// A commit message that says when the push ran, while the data inside it is from
// last week, is exactly the failure this project measures in other people.
let stamp = 'unknown snapshot';
let rows = 0;
try {
  const board = JSON.parse(fs.readFileSync(path.join(OUT, 'index.json'), 'utf8'));
  stamp = board.generated_at ?? stamp;
  rows = Array.isArray(board.rows) ? board.rows.length : 0;
} catch (err) {
  die(`could not read out/index.json: ${err.message}`);
}

const ndjson =
  [
    JSON.stringify({
      key: 'header',
      value: {
        summary: `Refresh: snapshot ${stamp}`,
        description: `${rows} products, 30 day window, built by solhonesty from each issuer's own surface. Source: https://github.com/kerne-protocol/solhonesty`,
      },
    }),
    ...payload.map((f) =>
      JSON.stringify({
        key: 'file',
        value: { path: f.to, content: f.content.toString('base64'), encoding: 'base64' },
      }),
    ),
  ].join('\n') + '\n';

const res = await fetch(`https://huggingface.co/api/datasets/${DATASET}/commit/main`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/x-ndjson' },
  body: ndjson,
});

const body = await res.text();
if (!res.ok) {
  die(`push failed ${res.status}: ${body.slice(0, 500)}`);
}

console.log(
  'mirror-to-huggingface: pushed snapshot %s, %d rows, %d files to https://huggingface.co/datasets/%s',
  stamp,
  rows,
  payload.length,
  DATASET,
);
