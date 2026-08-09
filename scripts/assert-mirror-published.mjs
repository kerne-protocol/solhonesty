// Check the artifact a stranger downloads, not the response code we got back.
//
// The mirror step can report success and still leave the public dataset stale:
// a token that silently lost write scope, a namespace rename, a partial commit,
// a cache serving an older revision. Every one of those looks like a green tick
// from inside the job. The only claim worth making is about the file someone
// else can actually fetch, so this reads the published index.json back over the
// public URL and holds its snapshot instant against the one just built.
//
// It runs unauthenticated on purpose. If it needs our token to pass, it is not
// testing what the public sees.
//
// Usage: node scripts/assert-mirror-published.mjs [--out out] [--dataset owner/name]

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const outDir = arg('--out', 'out');
const dataset = arg('--dataset', process.env.HF_DATASET || 'kerne-protocol/solana-yield-honesty');
const url = `https://huggingface.co/datasets/${dataset}/resolve/main/index.json`;

const local = JSON.parse(fs.readFileSync(path.join(outDir, 'index.json'), 'utf8'));

// A CDN can lag a commit by a few seconds. It cannot lag it by an hour.
const MAX_LAG_MINUTES = 60;

let published;
try {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'solhonesty mirror check', Accept: 'application/json' },
    redirect: 'follow',
  });
  if (!res.ok) {
    console.error(`FAIL  the published dataset returned HTTP ${res.status} for ${url}`);
    console.error('      Anyone trying to use this dataset right now is getting the same thing.');
    process.exit(1);
  }
  published = await res.json();
} catch (err) {
  console.error(`FAIL  the published dataset could not be fetched at all: ${err.message}`);
  process.exit(1);
}

const lagMinutes = (Date.parse(local.generated_at) - Date.parse(published.generated_at)) / 60_000;

if (!Number.isFinite(lagMinutes)) {
  console.error(`FAIL  could not compare snapshot instants: local ${local.generated_at}, published ${published.generated_at}`);
  process.exit(1);
}

if (lagMinutes > MAX_LAG_MINUTES) {
  console.error(
    `FAIL  the mirror reported success but the public dataset is ${Math.round(lagMinutes)} minutes behind the board just built.`,
  );
  console.error(`      built     ${local.generated_at}`);
  console.error(`      published ${published.generated_at}`);
  console.error('      The repository describes this dataset as self-refreshing. Right now that is false.');
  process.exit(1);
}

const localRows = Array.isArray(local.rows) ? local.rows.length : 0;
const publishedRows = Array.isArray(published.rows) ? published.rows.length : 0;
if (publishedRows !== localRows) {
  console.error(`FAIL  the published dataset has ${publishedRows} rows, the board just built has ${localRows}.`);
  process.exit(1);
}

console.log(`ok    the public dataset serves the snapshot just built: ${published.generated_at}, ${publishedRows} rows`);
console.log(`ok    verified unauthenticated at ${url}`);
