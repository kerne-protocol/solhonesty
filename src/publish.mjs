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
  'advertised_min_pct',
  'advertised_p25_pct',
  'advertised_median_pct',
  'advertised_p75_pct',
  'advertised_max_pct',
  'advertised_spread_ratio',
  'advertised_history_observations',
  'spot_percentile',
  'spot_is_representative',
  'gap_vs_median_pct',
  'delivered_vs_median_pct',
  'advertised_basis',
  'advertised_transform',
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

// Symbols this board treats as dollar denominated. Anything else is still a
// stablecoin and still belongs here, but its yield is denominated in something
// other than dollars, and a reader sorting the advertised column would be
// comparing two different currencies without being told. Derived from the rows
// rather than hardcoded as prose, so the caveat appears exactly when it applies
// and disappears when it stops applying.
const USD_SYMBOLS = new Set(['USDC', 'USDT', 'USDS', 'USDG', 'PYUSD', 'DAI', 'USDE', 'FDUSD', 'USD1', 'USDY', 'JupUSD', 'USDU', 'USX']);

export function nonDollarRows(rows) {
  return rows.filter((r) => r.symbol && !USD_SYMBOLS.has(r.symbol));
}

// The lowest delivery ratio a row may carry and still be named as the worked
// example beside the commissioned-report paragraph.
//
// 90 is not a grade and this board applies it nowhere else. It exists because
// the example row sits next to a price, and a row measuring well below its own
// advertised rate must never be the row pointed at there. Leading with a
// product that is delivering makes the offer read as measurement, which is what
// it is. Leading with one that is not makes it read as an accusation with an
// invoice attached, which is the one change that could cost this board its
// standing with the protocols on it. If no row clears the floor the card names
// none, which is the honest degradation rather than reaching further down.
export const EXAMPLE_DELIVERY_FLOOR = 90;

// Scoped landing page. ⛔ NO `?row=` HERE, DELIBERATELY, AND DO NOT ADD ONE.
// That parameter resolves against the EVM roster in kerne.fi's own
// honesty-index-vaults (auditScopeRows), which contains no Solana keys, so a
// link carrying `row=kamino-lend-usdc` would prefill nothing and quietly look
// broken to the one reader it was built for. `src` is an analytics label only:
// it is read by the site's first-party funnel and is never rendered.
export const AUDIT_URL = 'https://kerne.fi/disclosure-audit?src=hf-sol';

// ⛔ THIS NUMBER IS A COPY AND ITS SOURCE OF TRUTH IS IN ANOTHER REPOSITORY:
// kerne-main, `frontend/src/lib/payment-services.ts`, `SERVICE_PRICE['disclosure-audit']`.
// It is duplicated here only because this repository cannot import from that
// one, and a card refreshed daily by a job nobody watches must not quote a
// figure the checkout has stopped charging: that is a published price we would
// have to honour or retract. The EVM sibling card READS the constant instead of
// copying it; this is the weaker of the two arrangements and it is deliberate.
// If /disclosure-audit is ever repriced, this line moves in the same change.
export const DISCLOSURE_AUDIT_PRICE_USD = 499;

// Ranked by CLOSENESS TO EXACT DELIVERY, not by the highest ratio, and the
// difference matters. The highest ratio on this board is routinely a row paying
// well above its advertised rate, which is not dishonesty but is also not the
// claim being made here: naming a product "delivering 134 percent" as the worked
// example for a disclosure review says its advertised figure was wrong in the
// other direction, which is a criticism dressed as a compliment. A row landing
// within a point of what it says is the clean example, and it is the one that
// makes the offer read as measurement.
// ⛔ `advertised_history_ok` IS REQUIRED HERE, not optional. The standing rule
// added with Jupiter Lend is that the board may not NAME a row it cannot rank,
// because a spot reading of a rate whose distribution is unknown measures when
// the collector ran at least as much as it measures the product. That rule was
// written for the widest-gap headline, and it applies with the same force to a
// row named beside a price: a flattering number is no safer than an unflattering
// one if the board cannot stand behind it. See summarize() in engine.mjs.
export function exampleRows(rows) {
  return rows
    .filter(
      (r) =>
        r.comparable &&
        r.advertised_history_ok &&
        Number.isFinite(r.delivered_pct) &&
        r.delivered_pct >= EXAMPLE_DELIVERY_FLOOR,
    )
    .sort(
      (a, b) =>
        Math.abs(a.delivered_pct - 100) - Math.abs(b.delivered_pct - 100) ||
        String(a.key).localeCompare(String(b.key)),
    )
    .slice(0, 2);
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

  // ⛔ Only rows with a readable advertised history are eligible to be named
  // here, and they are ranked on gap_vs_median_pct. See summarize() in
  // engine.mjs for why naming a protocol off a single spot reading is the one
  // thing this dataset must never do.
  const nonDollar = nonDollarRows(board.rows);
  const currencyNote =
    nonDollar.length > 0
      ? `\n**Not every row on this board is denominated in dollars.** ${nonDollar
          .map((r) => `${r.product} (${r.symbol})`)
          .join(', ')}. Each such row is internally consistent, because its advertised and realized figures are both measured in its own unit, so its \`gap_pct\` is meaningful. Sorting the \`advertised_pct\` column across the whole board is not, because it puts two currencies in one ranking. The \`symbol\` column is what tells them apart.\n`
      : '';

  const widest = s.widest_gap
    ? `Widest gap among rows this board can rank: ${s.widest_gap.key}, at ${pct(
        s.widest_gap.gap_vs_median_pct,
      )} against the median of its own advertised history.`
    : 'No row in this snapshot carries an advertised history long enough to be ranked, so this snapshot names no widest gap. That is the honest answer rather than a ranking of whichever row happened to be sampled at an extreme.';

  const unrankedNote =
    (s.rows_unrankable ?? 0) > 0
      ? `\n**${s.rows_unrankable} comparable row(s) are deliberately excluded from that ranking** (${(s.unrankable_keys ?? []).join(', ')}). Their issuers publish a rate but no history of it, so there is no way yet to tell whether their \`gap_pct\` describes the product or the minute the collector ran. They are published in full, with their gap, and left unranked. This repository records their advertised figure on every run, so they become rankable from this project's own series rather than from a borrowed one.`
      : '';

  const stab = s.advertised_stability ?? {};
  const spreadTable = [
    '| product | advertised now | advertised min | median | max | range | spot percentile | gap vs median |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...board.rows.map((r) =>
      r.advertised_history_ok
        ? `| ${r.product} | ${r.advertised_pct ?? 'n/a'} | ${r.advertised_min_pct} | ${r.advertised_median_pct} | ${r.advertised_max_pct} | ${r.advertised_spread_ratio}x | ${r.spot_percentile} | ${r.gap_vs_median_pct ?? 'n/a'} |`
        : `| ${r.product} | ${r.advertised_pct ?? 'n/a'} | not published | not published | not published | n/a | n/a | n/a |`,
    ),
  ].join('\n');

  // The worked example, or an honest absence of one. See EXAMPLE_DELIVERY_FLOOR.
  const examples = exampleRows(board.rows);
  const commissionSection = `## If one of these products is yours

Everything above is free, and stays free whether or not anybody ever buys anything. Nothing on this
board is for sale: no row moves for money, no row is added or removed for money, and no protocol
here has been contacted about its row. That is the boundary, and this section is the only commercial
passage in this file.

There is a longer version of this measurement that a protocol can commission **about itself**:
<${AUDIT_URL}>

${
  examples.length > 0
    ? `The products below are picked out of **this snapshot**, closest to exact delivery first, rather than typed into this file. Today the rows landing nearest their own advertised rate are ${examples
        .map((r) => `**${r.product}** (${r.delivered_pct} percent of what it advertises)`)
        .join(' and ')}.`
    : `No row in this snapshot is currently comparable and delivering close enough to its own advertised rate to be worth naming here, so this release names none.`
}

**What it is:** a Disclosure Integrity Audit, ${DISCLOSURE_AUDIT_PRICE_USD} US dollars flat, one report inside 72 hours of
scope confirmation, commissioned by the protocol being reviewed and delivered privately to it. It
reviews whether your public claims match your chain on three axes: advertised against realized yield
(the method in this dataset, run properly over your whole surface rather than one reserve), the
addresses and figures in your documentation against the live registry, and your oracle and
attestation posture. It ends in a signed findings summary you are free to publish or to never
mention again.

**What it is not:** it is disclosure review, not a security audit and not assurance. It certifies
nothing about your security, your solvency or your compliance, and it is not a rating. It is also
not this board: commissioning one does not add, move or remove a row here.

`;

  const stabilityLine = stab.widest_spread
    ? `Widest range in this snapshot: ${stab.widest_spread.key}, whose advertised figure ran from ${pct(
        stab.widest_spread.min_pct,
      )} to ${pct(stab.widest_spread.max_pct)} over the window, a factor of ${stab.widest_spread.ratio}.`
    : 'No row in this snapshot carried a readable advertised history.';

  // The `configs` block is what makes the Hugging Face dataset viewer parse
  // current.csv instead of showing a file listing. Without it the mirror is a
  // folder of downloads rather than a browsable table, which is most of the
  // reason to mirror it at all.
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
  - kamino
  - jupiter
  - save
pretty_name: Solana Yield Honesty Index
size_categories:
  - n<1K
configs:
  - config_name: current
    data_files:
      - split: train
        path: current.csv
---

# Solana Honesty Index

What each Solana stablecoin product **says** it pays, next to what it **actually
paid**, measured from a share price rather than from a claim.

Snapshot generated ${board.generated_at}. Window ${board.window_days} days.
${board.rows.length} products across ${s.protocols_tracked ?? 'several'} protocols,
${s.rows_comparable} comparable, ${s.rows_not_comparable} published but not
comparable. Realized figures: ${methods}.

${table}

${widest}
${unrankedNote}
${currencyNote}

## Read the gap column with this next to it

A lending reserve's advertised supply APY is an **instantaneous** rate set by
utilisation, not a forecast and not a trailing average. On a reserve sitting near
a kink in its own rate curve, that number moves by multiples within a single day
while the realized 30 day figure moves by hundredths of a point. Subtracting a
30 day realized figure from one spot reading therefore measures **when the
collector ran** at least as much as it measures the product.

This is not hypothetical and it is not somebody else's mistake. This project
reported a 2.32 point gap on Kamino's PYUSD reserve on 2026-08-04 and a gap of
the opposite sign on the same reserve three days later, and very nearly published
the first one as a finding. So every row that can support it now carries the
distribution its spot reading was drawn from:

${spreadTable}

${stabilityLine}
${
  (stab.rows_whose_spot_reading_is_unrepresentative ?? 0) > 0
    ? `\n**${stab.rows_whose_spot_reading_is_unrepresentative} row(s) in this snapshot were captured outside the middle half of their own recent range** (${(stab.unrepresentative_keys ?? []).join(', ')}). For those rows, prefer \`gap_vs_median_pct\` over \`gap_pct\`.`
    : '\nEvery row with a readable history was captured inside the middle half of its own recent range, so the spot gaps in this snapshot are fair samples.'
}

\`gap_vs_median_pct\` is the same subtraction done against the median of the
advertised figure's own published history rather than against one reading of it.
Where both exist, it is the more honest number, and it is the one to quote.

${commissionSection}## How realized is measured

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
- \`issuer_share_price_observed\` is a share price this collector samples once per
  run and accumulates itself. The issuer reports the assets; the share count is
  the SPL mint supply, which this project reads on chain and holds against the
  reported figure on every run. Half independently verified, half not.
- \`thirdparty_rate_series\` is the weakest, a time weighted mean of a third
  party's daily rate observations, used only where no share price series exists
  yet. A row on this method has not been independently measured, and it says so.

## Where a figure was converted rather than quoted

Not every issuer publishes in the units this board compares in. Jupiter quotes
\`supplyRate\` as a **simple** annual rate; the realized figure here is a
**compounded** annualization of a share price. Placing the two side by side
untouched would manufacture a gap out of pure arithmetic, so the advertised
figure is converted to its daily compounded equivalent before comparison.

Any row where that happened says so in \`advertised_transform\`, and
\`advertised_verbatim\` still carries the issuer's raw payload so the conversion
can be checked or rejected. An empty \`advertised_transform\` means the number in
\`advertised_pct\` is the issuer's own, unaltered.

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
| advertised_transform | empty when advertised_pct is the issuer's own number. Otherwise, the conversion this board applied to make it answer the same question as the realized figure |
| realized_method | how the realized figure was obtained, weakest to strongest above |
| advertised_verbatim | the issuer's own words or payload, quoted and dated |
| advertised_min_pct, advertised_max_pct | the range the advertised figure covered over the same window, from the issuer's own published history |
| advertised_median_pct | the median of that history. Against a volatile spot rate this is the figure a holder is more likely to have lived through |
| advertised_spread_ratio | max divided by min. A value near 1 means the advertised figure is stable and the spot gap is trustworthy; a large value means it is not |
| spot_percentile | where the reading in advertised_pct sat inside that history, 0 to 100 |
| spot_is_representative | true when the reading fell inside the middle half of its own range |
| gap_vs_median_pct | advertised median minus realized. Prefer this to gap_pct wherever it is present |

## Why the publisher is not on this board

This dataset is built by Kerne, and there is no Kerne row on it. That is the
first thing a reader should be suspicious of, so here is the reason and the
place to check it rather than an omission left to be noticed.

This board measures **Solana** products. Kerne's products are on Base. There is
no Kerne row to add here that would not be invented, and inventing one to look
even handed would be the same failure this dataset exists to measure.

Kerne does publish itself, by the same method, on the EVM board at
[huggingface.co/datasets/kerne-protocol/honesty-index](https://huggingface.co/datasets/kerne-protocol/honesty-index),
where its own row is flagged \`is_kerne\` and is measured by the same share price
arithmetic as every other protocol on it. It does not come out of that well.
Read the row rather than this paragraph: it refreshes daily and this paragraph
does not, and a number typed here would be a false claim the moment it moved.

If Kerne ever ships a Solana product it goes on this board, measured by this
code, with no exemption. Until then, absence here is a scope boundary and not a
favour.

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
