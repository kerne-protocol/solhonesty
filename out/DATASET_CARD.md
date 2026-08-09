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

Snapshot generated 2026-08-09T07:41:35.073Z. Window 30 days.
7 products tracked, 7 comparable,
0 published but not comparable. Realized figures: 5 by issuer_share_price_history, 2 by thirdparty_rate_series.

| product | advertised | realized | gap | delivered | realized method |
| --- | --- | --- | --- | --- | --- |
| Kamino Lend USDC (Main market) | 3.9808 | 4.106 | -0.1252 | 103.15 | issuer_share_price_history |
| Kamino Lend USDG (Main market) | 2.4888 | 2.8851 | -0.3963 | 115.92 | issuer_share_price_history |
| Kamino Lend PYUSD (Main market) | 4.9498 | 4.7203 | 0.2295 | 95.36 | issuer_share_price_history |
| Kamino Lend USDT (Main market) | 2.6844 | 3.6387 | -0.9543 | 135.55 | issuer_share_price_history |
| Kamino Lend USDS (Main market) | 3.9425 | 4.2987 | -0.3562 | 109.04 | issuer_share_price_history |
| Save USDC (Main pool) | 2.53 | 2.3633 | 0.1667 | 93.41 | thirdparty_rate_series |
| Save USDT (Main pool) | 1.43 | 1.3903 | 0.0397 | 97.23 | thirdparty_rate_series |

The widest gap in this snapshot belongs to kamino-lend-pyusd, at 0.23 percent.

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
| Kamino Lend USDC (Main market) | 3.9808 | 3.2082 | 3.8536 | 24.3491 | 7.59x | 54.8 | -0.2524 |
| Kamino Lend USDG (Main market) | 2.4888 | 1.8958 | 2.4842 | 11.7439 | 6.19x | 51.6 | -0.4009 |
| Kamino Lend PYUSD (Main market) | 4.9498 | 1.3223 | 4.016 | 24.3431 | 18.41x | 79.9 | -0.7043 |
| Kamino Lend USDT (Main market) | 2.6844 | 2.2113 | 3.7693 | 4.2655 | 1.93x | 8.4 | 0.1306 |
| Kamino Lend USDS (Main market) | 3.9425 | 3.3428 | 4.2785 | 4.7902 | 1.43x | 8.8 | -0.0202 |
| Save USDC (Main pool) | 2.53 | not published | not published | not published | n/a | n/a | n/a |
| Save USDT (Main pool) | 1.43 | not published | not published | not published | n/a | n/a | n/a |

Widest range in this snapshot: kamino-lend-pyusd, whose advertised figure ran from 1.32 percent to 24.34 percent over the window, a factor of 18.41.

**3 row(s) in this snapshot were captured outside the middle half of their own recent range** (kamino-lend-pyusd, kamino-lend-usdt, kamino-lend-usds). For those rows, prefer `gap_vs_median_pct` over `gap_pct`.

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
- `thirdparty_rate_series` is the weakest, a time weighted mean of a third
  party's daily rate observations, used only where no share price series exists
  yet. A row on this method has not been independently measured, and it says so.

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
| realized_method | how the realized figure was obtained, weakest to strongest above |
| advertised_verbatim | the issuer's own words or payload, quoted and dated |
| advertised_min_pct, advertised_max_pct | the range the advertised figure covered over the same window, from the issuer's own published history |
| advertised_median_pct | the median of that history. Against a volatile spot rate this is the figure a holder is more likely to have lived through |
| advertised_spread_ratio | max divided by min. A value near 1 means the advertised figure is stable and the spot gap is trustworthy; a large value means it is not |
| spot_percentile | where the reading in advertised_pct sat inside that history, 0 to 100 |
| spot_is_representative | true when the reading fell inside the middle half of its own range |
| gap_vs_median_pct | advertised median minus realized. Prefer this to gap_pct wherever it is present |

## Licence and scope

The compilation and every column computed here are released under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

`advertised_verbatim` is short factual quotation from each issuer's own public
surface, attributed and dated, and is not claimed under that licence. Protocol
names and marks are used nominatively to identify the products measured.

## Limitations, stated rather than buried

- 7 of 7 rows in this snapshot carry a comparable pair. The rest are published with their reason.
- Rows on `thirdparty_rate_series` depend on a third party and are labelled as such.
- The independently collected share price series in this repository starts on the
  day this collector first ran. It does not backfill, and a row will say
  `insufficient_history` rather than annualize a window it does not have.
- A figure read from an issuer API is the figure that API served at
  `captured_at`. It is not a claim about what a human sees in that issuer's app
  at any other moment.
