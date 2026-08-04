// Outputs: current.csv, index.json, and a dataset card.
//
// The card is generated from the board it describes. Nothing in it is typed by
// hand, so it cannot claim a standing the data does not support, and it cannot
// go stale while the data underneath it moves.

import fs from 'node:fs';
import path from 'node:path';

const CSV_COLUMNS = [
  'key',
  'protocol',
  'product',
  'symbol',
  'chain',
  'reserve',
  'comparable',
  'advertised_pct',
  'realized_pct',
  'gap_pct',
  'delivered_pct',
  'advertised_basis',
  'realized_method',
  'window_days',
  'realized_from',
  'realized_to',
  'advertised_source_url',
  'advertised_verbatim',
  'captured_at',
  'reason',
];

export function toCsv(rows, columns = CSV_COLUMNS) {
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.join(',')];
  for (const r of rows) lines.push(columns.map((c) => esc(r[c])).join(','));
  return lines.join('\n') + '\n';
}

function pct(n) {
  return Number.isFinite(n) ? `${n.toFixed(2)} percent` : 'not available';
}

export function datasetCard(board) {
  const s = board.summary;
  const comparable = board.rows.filter((r) => r.comparable);
  const notComparable = board.rows.filter((r) => !r.comparable);
  const methods = Object.entries(s.realized_methods)
    .map(([k, v]) => `${v} by ${k}`)
    .join(', ');

  const table = [
    '| product | advertised | realized | gap | delivered | realized method |',
    '| --- | --- | --- | --- | --- | --- |',
    ...board.rows.map(
      (r) =>
        `| ${r.product} | ${r.advertised_pct ?? 'n/a'} | ${r.realized_pct ?? 'n/a'} | ${
          r.gap_pct ?? 'n/a'
        } | ${r.delivered_pct ?? 'n/a'} | ${r.realized_method ?? 'none'} |`,
    ),
  ].join('\n');

  const widest = s.widest_gap
    ? `The widest gap in this snapshot belongs to ${s.widest_gap.key}, at ${pct(s.widest_gap.gap_pct)}.`
    : 'No row in this snapshot produced a comparable gap.';

  return `---
license: cc-by-4.0
language:
  - en
tags:
  - solana
  - stablecoins
  - defi
  - yield
  - transparency
pretty_name: Solana Honesty Index
---

# Solana Honesty Index

What each Solana stablecoin product **says** it pays, next to what it **actually
paid**, measured from a share price rather than from a claim.

Snapshot generated ${board.generated_at}. Window ${board.window_days} days.
${board.rows.length} products tracked, ${s.rows_comparable} comparable,
${s.rows_not_comparable} published but not comparable. Realized figures: ${methods}.

${table}

${widest}

## How realized is measured

A share price is the only measure of a yield product a holder cannot be talked
out of. It moves when value lands and it does not move when value does not.

Solana has no ERC-4626, so there is no single call that returns a share price
across products. Each adapter is responsible for producing a series of
\`{ timestampSeconds, pricePerShare }\` and everything after that is one piece of
arithmetic applied identically to every row:

    annualized = ((ppsTo / ppsFrom) ^ (365 / days) - 1) * 100

The \`realized_method\` column says how each row's series was obtained, and the
three values are not equally strong:

- \`onchain_share_price\` reads the protocol's own account data over plain
  JSON-RPC and derives the share price ourselves.
- \`issuer_share_price_history\` uses a share price series the issuer publishes.
- \`thirdparty_rate_series\` is the weakest, a time weighted mean of a third
  party's daily rate observations, used only where no share price series exists
  yet. A row on this method has not been independently measured, and it says so.

## The comparability gate

A protocol quoting a since inception average is not answering the same question
as a protocol quoting what a holder earns today. Ranking a board by whichever
number is largest on each protocol's own page produces a ranking of marketing
copy, so this dataset refuses to do it.

An advertised figure is compared only when its basis is \`spot-apy\` or
\`trailing-30d\`. Everything else is still published, with the reason it was not
compared in the \`reason\` column. Where a protocol publishes several comparable
figures, the **most conservative** one is used, never the largest, so no
protocol can improve its standing here by adding a bigger number to its page.

${
  notComparable.length > 0
    ? `Rows not compared in this snapshot:\n\n${notComparable
        .map((r) => `- **${r.product}**: ${r.reason}`)
        .join('\n')}`
    : 'Every row in this snapshot was comparable.'
}

## Columns

| column | meaning |
| --- | --- |
| advertised_pct | the figure the issuer publishes on the surface named in advertised_source_url |
| realized_pct | annualized share price growth over the window, computed here |
| gap_pct | advertised minus realized, in percentage points |
| delivered_pct | realized as a percentage of advertised |
| advertised_basis | what question the advertised figure answers |
| realized_method | how the realized figure was obtained, weakest to strongest above |
| advertised_verbatim | the issuer's own words or payload, quoted and dated |

## Licence and scope

The compilation and every column computed here are released under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

\`advertised_verbatim\` is short factual quotation from each issuer's own public
surface, attributed and dated, and is not claimed under that licence. Protocol
names and marks are used nominatively to identify the products measured.

## Limitations, stated rather than buried

- ${comparable.length} of ${board.rows.length} rows in this snapshot carry a comparable pair. The rest are published with their reason.
- Rows on \`thirdparty_rate_series\` depend on a third party and are labelled as such.
- The independently collected share price series in this repository starts on the
  day this collector first ran. It does not backfill, and a row will say
  \`insufficient_history\` rather than annualize a window it does not have.
- A figure read from an issuer API is the figure that API served at
  \`captured_at\`. It is not a claim about what a human sees in that issuer's app
  at any other moment.
`;
}

export function writeOutputs(board, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const files = {};

  files['index.json'] = JSON.stringify(
    { ...board, new_observations: undefined },
    (k, v) => (typeof v === 'bigint' ? v.toString() : v),
    2,
  );
  files['current.csv'] = toCsv(board.rows);
  files['DATASET_CARD.md'] = datasetCard(board);

  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(outDir, name), content, 'utf8');
  }
  return Object.keys(files).map((f) => path.join(outDir, f));
}
