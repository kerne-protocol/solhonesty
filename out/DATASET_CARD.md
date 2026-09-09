---
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

Snapshot generated 2026-09-09T11:58:09.264Z. Window 30 days.
13 products across 3 protocols,
13 comparable, 0 published but not
comparable. Realized figures: 5 by issuer_share_price_history, 2 by onchain_share_price, 6 by issuer_share_price_observed.

| product | advertised | realized | gap | delivered | realized method |
| --- | --- | --- | --- | --- | --- |
| Kamino Lend USDC (Main market) | 3.4501 | 4.7322 | -1.2821 | 137.16 | issuer_share_price_history |
| Kamino Lend USDG (Main market) | 4.4692 | 3.4218 | 1.0474 | 76.56 | issuer_share_price_history |
| Kamino Lend PYUSD (Main market) | 2.2878 | 3.3454 | -1.0576 | 146.23 | issuer_share_price_history |
| Kamino Lend USDT (Main market) | 3.2548 | 3.7036 | -0.4488 | 113.79 | issuer_share_price_history |
| Kamino Lend USDS (Main market) | 3.3938 | 3.5481 | -0.1544 | 104.55 | issuer_share_price_history |
| Save USDC (Main pool) | 3.11 | 2.8337 | 0.2763 | 91.11 | onchain_share_price |
| Save USDT (Main pool) | 1.83 | 1.7584 | 0.0716 | 96.09 | onchain_share_price |
| Jupiter Lend Earn USDC | 3.9249 | 5.0494 | -1.1246 | 128.65 | issuer_share_price_observed |
| Jupiter Lend Earn JupUSD | 5.1057 | 5.7662 | -0.6604 | 112.94 | issuer_share_price_observed |
| Jupiter Lend Earn USDT | 3.8729 | 3.9233 | -0.0504 | 101.3 | issuer_share_price_observed |
| Jupiter Lend Earn USDS | 4.6234 | 4.3123 | 0.3111 | 93.27 | issuer_share_price_observed |
| Jupiter Lend Earn USDG | 4.2266 | 5.0965 | -0.8698 | 120.58 | issuer_share_price_observed |
| Jupiter Lend Earn EURC | 4.2579 | 3.7372 | 0.5207 | 87.77 | issuer_share_price_observed |

Widest gap among rows this board can rank: kamino-lend-pyusd, at 0.12 percent against the median of its own advertised history.


**Not every row on this board is denominated in dollars.** Jupiter Lend Earn EURC (EURC). Each such row is internally consistent, because its advertised and realized figures are both measured in its own unit, so its `gap_pct` is meaningful. Sorting the `advertised_pct` column across the whole board is not, because it puts two currencies in one ranking. The `symbol` column is what tells them apart.


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

| product | advertised now | advertised min | median | max | range | spot percentile | gap vs median |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Kamino Lend USDC (Main market) | 3.4501 | 3.1918 | 4.1172 | 33.1006 | 10.37x | 6.2 | -0.615 |
| Kamino Lend USDG (Main market) | 4.4692 | 2.4486 | 3.02 | 16.179 | 6.61x | 92.9 | -0.4018 |
| Kamino Lend PYUSD (Main market) | 2.2878 | 0.9743 | 3.464 | 7.0385 | 7.22x | 17.4 | 0.1186 |
| Kamino Lend USDT (Main market) | 3.2548 | 1.5187 | 3.1591 | 17.4433 | 11.49x | 57.4 | -0.5445 |
| Kamino Lend USDS (Main market) | 3.3938 | 2.4898 | 3.4516 | 4.1882 | 1.68x | 32.7 | -0.0965 |
| Save USDC (Main pool) | 3.11 | 2.26 | 2.52 | 3.11 | 1.38x | 98.7 | -0.3137 |
| Save USDT (Main pool) | 1.83 | 1.34 | 1.445 | 1.83 | 1.37x | 98.7 | -0.3134 |
| Jupiter Lend Earn USDC | 3.9249 | 3.4583 | 4.3674 | 5.8016 | 1.68x | 26.3 | -0.682 |
| Jupiter Lend Earn JupUSD | 5.1057 | 3.8314 | 4.4457 | 5.5164 | 1.44x | 81.6 | -1.3205 |
| Jupiter Lend Earn USDT | 3.8729 | 3.1175 | 3.6861 | 5.4636 | 1.75x | 57.9 | -0.2372 |
| Jupiter Lend Earn USDS | 4.6234 | 3.2619 | 3.8262 | 5.5903 | 1.71x | 76.3 | -0.4861 |
| Jupiter Lend Earn USDG | 4.2266 | 3.3446 | 4.6077 | 7.8199 | 2.34x | 10.5 | -0.4888 |
| Jupiter Lend Earn EURC | 4.2579 | 2.86 | 3.6188 | 5.0322 | 1.76x | 89.5 | -0.1184 |

Widest range in this snapshot: kamino-lend-usdt, whose advertised figure ran from 1.52 percent to 17.44 percent over the window, a factor of 11.49.

**10 row(s) in this snapshot were captured outside the middle half of their own recent range** (kamino-lend-usdc, kamino-lend-usdg, kamino-lend-pyusd, save-usdc, save-usdt, jupiter-lend-usdc, jupiter-lend-jupusd, jupiter-lend-usds, jupiter-lend-usdg, jupiter-lend-eurc). For those rows, prefer `gap_vs_median_pct` over `gap_pct`.

`gap_vs_median_pct` is the same subtraction done against the median of the
advertised figure's own published history rather than against one reading of it.
Where both exist, it is the more honest number, and it is the one to quote.

## If one of these products is yours

Everything above is free, and stays free whether or not anybody ever buys anything. Nothing on this
board is for sale: no row moves for money, no row is added or removed for money, and no protocol
here has been contacted about its row. That is the boundary, and this section is the only commercial
passage in this file.

There is a longer version of this measurement that a protocol can commission **about itself**:
<https://kerne.fi/disclosure-audit?src=hf-sol>

The products below are picked out of **this snapshot**, closest to exact delivery first, rather than typed into this file. Today the rows landing nearest their own advertised rate are **Jupiter Lend Earn USDT** (101.3 percent of what it advertises) and **Save USDT (Main pool)** (96.09 percent of what it advertises).

**What it is:** a Disclosure Integrity Audit, 499 US dollars flat, one report inside 72 hours of
scope confirmation, commissioned by the protocol being reviewed and delivered privately to it. It
reviews whether your public claims match your chain on three axes: advertised against realized yield
(the method in this dataset, run properly over your whole surface rather than one reserve), the
addresses and figures in your documentation against the live registry, and your oracle and
attestation posture. It ends in a signed findings summary you are free to publish or to never
mention again.

**What it is not:** it is disclosure review, not a security audit and not assurance. It certifies
nothing about your security, your solvency or your compliance, and it is not a rating. It is also
not this board: commissioning one does not add, move or remove a row here.

## How realized is measured

A share price is the only measure of a yield product a holder cannot be talked
out of. It moves when value lands and it does not move when value does not.

Solana has no ERC-4626, so there is no single call that returns a share price
across products. Each adapter is responsible for producing a series of
`{ timestampSeconds, pricePerShare }` and everything after that is one piece of
arithmetic applied identically to every row:

    annualized = ((ppsTo / ppsFrom) ^ (365 / days) - 1) * 100

The `realized_method` column says how each row's series was obtained, and the
three values are not equally strong:

- `onchain_share_price` reads the protocol's own account data over plain
  JSON-RPC and derives the share price ourselves.
- `issuer_share_price_history` uses a share price series the issuer publishes.
- `issuer_share_price_observed` is a share price this collector samples once per
  run and accumulates itself. The issuer reports the assets; the share count is
  the SPL mint supply, which this project reads on chain and holds against the
  reported figure on every run. Half independently verified, half not.
- `thirdparty_rate_series` is the weakest, a time weighted mean of a third
  party's daily rate observations, used only where no share price series exists
  yet. A row on this method has not been independently measured, and it says so.

## Where a figure was converted rather than quoted

Not every issuer publishes in the units this board compares in. Jupiter quotes
`supplyRate` as a **simple** annual rate; the realized figure here is a
**compounded** annualization of a share price. Placing the two side by side
untouched would manufacture a gap out of pure arithmetic, so the advertised
figure is converted to its daily compounded equivalent before comparison.

Any row where that happened says so in `advertised_transform`, and
`advertised_verbatim` still carries the issuer's raw payload so the conversion
can be checked or rejected. An empty `advertised_transform` means the number in
`advertised_pct` is the issuer's own, unaltered.

## The comparability gate

A protocol quoting a since inception average is not answering the same question
as a protocol quoting what a holder earns today. Ranking a board by whichever
number is largest on each protocol's own page produces a ranking of marketing
copy, so this dataset refuses to do it.

An advertised figure is compared only when its basis is `spot-apy` or
`trailing-30d`. Everything else is still published, with the reason it was not
compared in the `reason` column. Where a protocol publishes several comparable
figures, the **most conservative** one is used, never the largest, so no
protocol can improve its standing here by adding a bigger number to its page.

Every row in this snapshot was comparable.

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
where its own row is flagged `is_kerne` and is measured by the same share price
arithmetic as every other protocol on it. It does not come out of that well.
Read the row rather than this paragraph: it refreshes daily and this paragraph
does not, and a number typed here would be a false claim the moment it moved.

If Kerne ever ships a Solana product it goes on this board, measured by this
code, with no exemption. Until then, absence here is a scope boundary and not a
favour.

## Licence and scope

The compilation and every column computed here are released under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

`advertised_verbatim` is short factual quotation from each issuer's own public
surface, attributed and dated, and is not claimed under that licence. Protocol
names and marks are used nominatively to identify the products measured.

## Limitations, stated rather than buried

- 13 of 13 rows in this snapshot carry a comparable pair. The rest are published with their reason.
- Rows on `thirdparty_rate_series` depend on a third party and are labelled as such.
- The independently collected share price series in this repository starts on the
  day this collector first ran. It does not backfill, and a row will say
  `insufficient_history` rather than annualize a window it does not have.
- A figure read from an issuer API is the figure that API served at
  `captured_at`. It is not a claim about what a human sees in that issuer's app
  at any other moment.
