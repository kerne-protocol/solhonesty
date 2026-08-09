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

Snapshot generated 2026-08-09T18:52:23.393Z. Window 30 days.
13 products across 3 protocols,
13 comparable, 0 published but not
comparable. Realized figures: 5 by issuer_share_price_history, 8 by thirdparty_rate_series.

| product | advertised | realized | gap | delivered | realized method |
| --- | --- | --- | --- | --- | --- |
| Kamino Lend USDC (Main market) | 3.8687 | 4.103 | -0.2343 | 106.06 | issuer_share_price_history |
| Kamino Lend USDG (Main market) | 2.6039 | 2.84 | -0.236 | 109.07 | issuer_share_price_history |
| Kamino Lend PYUSD (Main market) | 4.1191 | 4.7352 | -0.6161 | 114.96 | issuer_share_price_history |
| Kamino Lend USDT (Main market) | 2.7094 | 3.6269 | -0.9175 | 133.86 | issuer_share_price_history |
| Kamino Lend USDS (Main market) | 3.9462 | 4.2957 | -0.3495 | 108.86 | issuer_share_price_history |
| Save USDC (Main pool) | 2.52 | 2.3659 | 0.1541 | 93.88 | thirdparty_rate_series |
| Save USDT (Main pool) | 1.43 | 1.3908 | 0.0392 | 97.26 | thirdparty_rate_series |
| Jupiter Lend Earn USDC | 5.1057 | 3.9944 | 1.1114 | 78.23 | thirdparty_rate_series |
| Jupiter Lend Earn JupUSD | 3.8314 | 3.7644 | 0.067 | 98.25 | thirdparty_rate_series |
| Jupiter Lend Earn USDT | 3.1175 | 3.2648 | -0.1473 | 104.73 | thirdparty_rate_series |
| Jupiter Lend Earn USDS | 3.51 | 3.7209 | -0.2109 | 106.01 | thirdparty_rate_series |
| Jupiter Lend Earn USDG | 4.3831 | 4.3654 | 0.0177 | 99.6 | thirdparty_rate_series |
| Jupiter Lend Earn EURC | 3.0041 | 3.4686 | -0.4645 | 115.46 | thirdparty_rate_series |

Widest gap among rows this board can rank: kamino-lend-usdt, at 0.14 percent against the median of its own advertised history.

**8 comparable row(s) are deliberately excluded from that ranking** (save-usdc, save-usdt, jupiter-lend-usdc, jupiter-lend-jupusd, jupiter-lend-usdt, jupiter-lend-usds, jupiter-lend-usdg, jupiter-lend-eurc). Their issuers publish a rate but no history of it, so there is no way yet to tell whether their `gap_pct` describes the product or the minute the collector ran. They are published in full, with their gap, and left unranked. This repository records their advertised figure on every run, so they become rankable from this project's own series rather than from a borrowed one.

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
| Kamino Lend USDC (Main market) | 3.8687 | 3.2082 | 3.8524 | 24.3491 | 7.59x | 50.7 | -0.2506 |
| Kamino Lend USDG (Main market) | 2.6039 | 1.8958 | 2.4842 | 11.7439 | 6.19x | 67.7 | -0.3558 |
| Kamino Lend PYUSD (Main market) | 4.1191 | 1.3223 | 4.0441 | 24.3431 | 18.41x | 54.4 | -0.6911 |
| Kamino Lend USDT (Main market) | 2.7094 | 2.2113 | 3.7693 | 4.2655 | 1.93x | 11.6 | 0.1424 |
| Kamino Lend USDS (Main market) | 3.9462 | 3.3428 | 4.2785 | 4.7902 | 1.43x | 11.3 | -0.0172 |
| Save USDC (Main pool) | 2.52 | not published | not published | not published | n/a | n/a | n/a |
| Save USDT (Main pool) | 1.43 | not published | not published | not published | n/a | n/a | n/a |
| Jupiter Lend Earn USDC | 5.1057 | not published | not published | not published | n/a | n/a | n/a |
| Jupiter Lend Earn JupUSD | 3.8314 | not published | not published | not published | n/a | n/a | n/a |
| Jupiter Lend Earn USDT | 3.1175 | not published | not published | not published | n/a | n/a | n/a |
| Jupiter Lend Earn USDS | 3.51 | not published | not published | not published | n/a | n/a | n/a |
| Jupiter Lend Earn USDG | 4.3831 | not published | not published | not published | n/a | n/a | n/a |
| Jupiter Lend Earn EURC | 3.0041 | not published | not published | not published | n/a | n/a | n/a |

Widest range in this snapshot: kamino-lend-pyusd, whose advertised figure ran from 1.32 percent to 24.34 percent over the window, a factor of 18.41.

**2 row(s) in this snapshot were captured outside the middle half of their own recent range** (kamino-lend-usdt, kamino-lend-usds). For those rows, prefer `gap_vs_median_pct` over `gap_pct`.

`gap_vs_median_pct` is the same subtraction done against the median of the
advertised figure's own published history rather than against one reading of it.
Where both exist, it is the more honest number, and it is the one to quote.

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
