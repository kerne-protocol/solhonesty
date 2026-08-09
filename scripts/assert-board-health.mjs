// Refuse to publish a board that is not worth publishing.
//
// The failure this guards against is not a crash. A crash is loud and somebody
// notices. The failure that actually happened to this project is quieter: a
// scheduled job goes red for four consecutive nights while the repository keeps
// telling the world the dataset refreshes itself, and nothing anywhere says
// otherwise. The dataset did not become wrong. It became old, silently, which on
// a project whose entire subject is other people's honesty is worse.
//
// So the build now has to pass a health check before its outputs are committed
// or mirrored, and the check fails the run rather than printing a warning into a
// log nobody reads. A red badge is a fact somebody can act on. A stale dataset
// that still says "self-refreshing" is not.
//
// Usage: node scripts/assert-board-health.mjs [--out out] [--registry registry/products.json]

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const outDir = arg('--out', 'out');
const registryFile = arg('--registry', path.join('registry', 'products.json'));

// A build older than this did not happen in this run. Wide enough that a slow
// collector on a busy runner never trips it, tight enough that a committed
// artifact from yesterday cannot masquerade as today's.
const MAX_AGE_MINUTES = 360;

// Upstream APIs fail sometimes and that is not a reason to take the whole board
// down. Losing a third of the board is.
const MAX_ERROR_FRACTION = 1 / 3;

const failures = [];
const notes = [];

function fail(msg) {
  failures.push(msg);
}

const indexPath = path.join(outDir, 'index.json');
if (!fs.existsSync(indexPath)) {
  console.error(`FAIL  ${indexPath} does not exist, so the build did not produce a board at all`);
  process.exit(1);
}

const board = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
const rows = Array.isArray(board.rows) ? board.rows : [];

// 1. Did this build actually happen just now?
const ageMinutes = (Date.now() - Date.parse(board.generated_at)) / 60_000;
if (!Number.isFinite(ageMinutes)) {
  fail(`generated_at is not a readable timestamp: ${board.generated_at}`);
} else if (ageMinutes > MAX_AGE_MINUTES) {
  fail(
    `the board is ${Math.round(ageMinutes)} minutes old, older than the ${MAX_AGE_MINUTES} minute ceiling. The step that was meant to rebuild it did not.`,
  );
} else {
  notes.push(`generated ${Math.round(ageMinutes)} minute(s) ago`);
}

// 2. Is every product in the registry actually on the board?
if (fs.existsSync(registryFile)) {
  const registry = JSON.parse(fs.readFileSync(registryFile, 'utf8'));
  const expected = (registry.products ?? []).map((p) => p.key);
  const present = new Set(rows.map((r) => r.key));
  const missing = expected.filter((k) => !present.has(k));
  if (missing.length > 0) {
    fail(`${missing.length} registered product(s) produced no row at all: ${missing.join(', ')}`);
  } else {
    notes.push(`all ${expected.length} registered products produced a row`);
  }
} else {
  fail(`registry ${registryFile} is missing, so board completeness cannot be checked`);
}

// 3. How much of the board failed to build?
const errored = rows.filter((r) => r.error);
if (rows.length === 0) {
  fail('the board has no rows');
} else if (errored.length / rows.length > MAX_ERROR_FRACTION) {
  fail(
    `${errored.length} of ${rows.length} rows failed to build, above the ${Math.round(
      MAX_ERROR_FRACTION * 100,
    )} percent ceiling: ${errored.map((r) => `${r.key} (${r.error})`).join('; ')}`,
  );
} else if (errored.length > 0) {
  notes.push(`${errored.length} of ${rows.length} rows failed to build but the board is still usable`);
}

// 4. Does the board still say anything? A board where nothing is comparable has
//    published a table of nulls and a licence.
const comparable = rows.filter((r) => r.comparable);
if (comparable.length === 0) {
  fail('no row on the board is comparable, so this snapshot makes no statement worth mirroring');
} else {
  notes.push(`${comparable.length} of ${rows.length} rows comparable`);
}

// 5. Every comparable row must carry the evidence that makes it checkable. A
//    figure with no source URL and no verbatim is an assertion, and this project
//    does not publish assertions.
const unsourced = comparable.filter((r) => !r.advertised_source_url || !r.advertised_verbatim);
if (unsourced.length > 0) {
  fail(`${unsourced.length} comparable row(s) carry no source URL or no verbatim quote: ${unsourced.map((r) => r.key).join(', ')}`);
}

// 6. A realized figure outside this range is a decimal point in the wrong place,
//    not a yield. Publishing one would be a false claim about a named protocol.
const implausible = rows.filter((r) => Number.isFinite(r.realized_pct) && (r.realized_pct < -50 || r.realized_pct > 200));
if (implausible.length > 0) {
  fail(`${implausible.length} row(s) carry an implausible realized figure: ${implausible.map((r) => `${r.key}=${r.realized_pct}`).join(', ')}`);
}

for (const n of notes) console.log(`ok    ${n}`);
if (failures.length === 0) {
  console.log(`\nboard health: PASS (${rows.length} rows)`);
  process.exit(0);
}

for (const f of failures) console.error(`FAIL  ${f}`);
console.error(`\nboard health: FAIL (${failures.length} problem(s)). Refusing to publish this snapshot.`);
process.exit(1);
