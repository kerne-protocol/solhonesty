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
pretty_name: Solana Honesty Index
---

# Solana Honesty Index

What each Solana stablecoin product **says** it pays, next to what it **actually
paid**, measured from a share price rather than from a claim.

Snapshot generated 2026-08-04T15:43:22.555Z. Window 30 days.
7 products tracked, 7 comparable,
0 published but not comparable. Realized figures: 5 by issuer_share_price_history, 2 by thirdparty_rate_series.

| product | advertised | realized | gap | delivered | realized method |
| --- | --- | --- | --- | --- | --- |
| Kamino Lend USDC (Main market) | 4.2792 | 4.0744 | 0.2047 | 95.22 | issuer_share_price_history |
| Kamino Lend USDG (Main market) | 2.4567 | 3.4307 | -0.974 | 139.65 | issuer_share_price_history |
| Kamino Lend PYUSD (Main market) | 6.9214 | 4.6032 | 2.3182 | 66.51 | issuer_share_price_history |
| Kamino Lend USDT (Main market) | 4.1217 | 3.7641 | 0.3576 | 91.32 | issuer_share_price_history |
| Kamino Lend USDS (Main market) | 3.9964 | 4.2846 | -0.2881 | 107.21 | issuer_share_price_history |
| Save USDC (Main pool) | 2.24 | 2.3182 | -0.0782 | 103.49 | thirdparty_rate_series |
| Save USDT (Main pool) | 1.42 | 1.3651 | 0.0549 | 96.13 | thirdparty_rate_series |

The widest gap in this snapshot belongs to kamino-lend-pyusd, at 2.32 percent.

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
