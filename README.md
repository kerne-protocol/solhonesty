# solhonesty

**What each Solana stablecoin product says it pays, next to what it actually paid.**

A working prototype of the Solana Honesty Index. Zero runtime dependencies, no
API key, no wallet. From a clean clone:

```
node bin/solhonesty.mjs build
```

Live output, 2026-08-04, seven products, thirty day window:

```
OK  kamino-lend-usdc     advertised   4.2792%  realized   4.0744%  gap   +0.2047  issuer_share_price_history
OK  kamino-lend-usdg     advertised   2.4567%  realized   3.4307%  gap   -0.9740  issuer_share_price_history
OK  kamino-lend-pyusd    advertised   6.9214%  realized   4.6032%  gap   +2.3182  issuer_share_price_history
OK  kamino-lend-usdt     advertised   4.1217%  realized   3.7641%  gap   +0.3576  issuer_share_price_history
OK  kamino-lend-usds     advertised   3.9964%  realized   4.2846%  gap   -0.2881  issuer_share_price_history
OK  save-usdc            advertised   2.2400%  realized   2.3182%  gap   -0.0782  thirdparty_rate_series
OK  save-usdt            advertised   1.4200%  realized   1.3651%  gap   +0.0549  thirdparty_rate_series
```

Read the widest one out loud: Kamino's PYUSD reserve advertises 6.92 percent and
its own published share price grew at 4.60 percent over the last thirty days.
That is a 2.32 point gap and a 66.5 percent delivery ratio, and it is not an
accusation. It is what happens when a reserve's utilisation moves and the rate
on the page is the rate right now rather than the rate you lived through. The
point of this project is that nobody currently has to say which one they meant.

## Why this does not already exist

The measurement is easy on Ethereum and hard on Solana, for one reason.

ERC-4626 gives every EVM vault the same `convertToAssets` call, so you can read
a share price from any of them with one line and no protocol specific code. That
is why advertised versus realized boards exist for EVM stablecoins.

Solana has no equivalent standard. I checked the obvious escape hatch before
building anything: none of USDY, PYUSD, BUIDL, syrupUSDC, sUSDe, USDC or USDG
carries the Token-2022 `InterestBearingConfig` or `ScaledUiAmount` extension, so
there is no protocol agnostic on chain rate to read either. And DeFiLlama, the
usual fallback, returns a `pricePerShare` for exactly one of the top thirty two
Solana stablecoin pools by TVL.

So realized yield on Solana has to be assembled per protocol, from raw account
data, and that is why the column is empty everywhere.

## What is here

```
src/rpc.mjs                  Solana JSON-RPC, endpoint rotation, no key
src/base58.mjs               base58 both directions, no dependency
src/basis.mjs                the comparability gate
src/realized.mjs             share price to annualized yield
src/adapters/saveReserve.mjs raw 619 byte reserve decode, share price from chain
src/adapters/kaminoLend.mjs  issuer share price history, advertised supply APY
src/adapters/llamaSeries.mjs third party bootstrap, clearly labelled as weaker
src/engine.mjs               registry in, board out
src/publish.mjs              current.csv, index.json, generated dataset card
```

42 tests, 37 of which run with no network at all.

```
npm test                  offline, deterministic
SOLHONESTY_LIVE=1 npm test adds five tests that hit mainnet
```

## The part that makes it checkable

`solhonesty verify` recomputes a share price from the raw account and holds it
against the number the protocol publishes about itself:

```
$ node bin/solhonesty.mjs verify --key save-usdc
reserve             BgxfHJDzm44T7XG68MYKx7YisTjZu73tVovyZSjJMpmw
slot                437202410
share price (ours)  1.302988992106209
share price (them)  1.3029889921062106
relative difference 1.193e-15
AGREES
```

That is a 619 byte account decoded by hand, over a public RPC, agreeing with
Save's own API to fifteen decimal places. No SDK, no key, no trust.

## The comparability gate

This is the part that decides whether a board like this is worth anything.

A protocol quoting a since inception average is not answering the same question
as a protocol quoting what a holder earns today. If you rank a board by whichever
number is largest on each protocol's own page, you have ranked marketing copy,
and every protocol can improve its position by adding a bigger number to its
site. I know this failure mode specifically because I shipped it on the EVM
version of this board and had to publish the correction.

So: an advertised figure is compared only when its basis is `spot-apy` or
`trailing-30d`. Everything else is still published, with the reason it was not
compared attached. Where a protocol publishes several comparable figures, the
**most conservative** wins. There are unit tests that assert a protocol cannot
improve its standing by publishing a larger number, and that a row bundling an
external incentive is refused rather than silently compared against a share
price that never contained it.

## Realized methods, weakest to strongest

Every row states how its realized figure was obtained, because a reader who
cannot tell these apart has been misled by the format rather than the numbers.

| method | what it means |
| --- | --- |
| `thirdparty_rate_series` | a time weighted mean of somebody else's daily rate observations. Weakest. Used only where no share price series exists yet. |
| `issuer_share_price_history` | a share price series the issuer publishes. |
| `onchain_share_price` | the share price derived here from raw account data. |

The independently collected on chain series starts the day this collector first
runs. It does not backfill and it will say `insufficient_history` rather than
annualize a window it does not have.

## Prior art, and what I actually checked

Plenty of places publish Solana yields. What I went looking for was something
narrower: an issuer's advertised figure, quoted verbatim from the issuer's own
surface and dated, sitting next to an independently computed realized figure,
under a written rule about when the two may be compared.

What I checked on 2026-08-04, and what I found:

- **DeFiLlama** publishes rates, not advertised claims, and returns a
  `pricePerShare` for **one** of the top thirty two Solana stablecoin pools by
  TVL. It cannot answer the question.
- **vaults.fyi** is paywalled. `GET /v2/networks` returns `402 Payment
  required`, so whatever it covers is not an open dataset.
- **Hugging Face** has no dataset matching `solana yield`. The search returns an
  empty array.
- Protocol analytics (Kamino's own, Dune boards) report each protocol against
  itself, which is the one comparison that cannot detect a gap.

I am stating what I searched rather than that nothing exists, because the second
is not a claim I can support. If something does this already, the right outcome
is that I find it and stop, and I would rather be told than not.

## Licence

Code: MIT, in full at [`LICENSE`](LICENSE). Data produced by it: CC BY 4.0,
except `advertised_verbatim`, which is short factual quotation from each
issuer's own public surface, attributed and dated. Protocol names are used
nominatively to identify the products measured.

## Status

Prototype, built 2026-08-04. Seven products. The methodology is a port of a
board that has been running on EVM stablecoins since 2026-07-14 and is published
as an open dataset at
[huggingface.co/datasets/kerne-protocol/honesty-index](https://huggingface.co/datasets/kerne-protocol/honesty-index).
