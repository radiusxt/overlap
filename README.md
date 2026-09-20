# Overlap

**See what your investment portfolio actually holds**

An investment exposure tool that looks through your holdings of individual stocks and exchange traded funds (ETFs) to show your *true* underlying exposure by top 10 holdings, country, sector and currency rather than by the ticker itself.

Most portfolio trackers, analysers and visualisers stop at the ticker level. If you hold several different ETFs, each might concentrate in the same handful of companies, leaving you far more concentrated than a glance of your holdings suggests. Overlap unwraps each fund's holdings and aggregates them alongside your direct holdings (individual shares) to uncover hidden risk.

View on desktop for the best experience.

## How it Works and the Math Behind it

For a set of positions, (t_i, s_i) denoting the ith ticker symbol and the number of shares held for that ticker,

Net Liquidation Value (NLV) = sum(v_i) where v_i = s_i * p(t_i), p(t_i) is the price of the ith ticker.

Each position's weight in the portfolio, w(t_i) is an element of [0, 1] and sum(w(t_i)) = 1 by w(t_i) = v_i / NLV.

The contribution of an underlying holding inside that position is rescaled to the whole portfolio given by,

contribution(h, t) = w(t) * w(h, t)

The total exposure of a holding inside a portfolio is the sum of all contributions from all positions denoted by,

Exposure(h) = sum(contribution(h, t)) where t: h (is an element of) t

## Tech Stack

**Frontend**

- Next.js
- React
- Tailwind

**Backend**

- PostgreSQL
- Python
- TypeScript
- Yahoo Finance API

**Deployment**

- Supabase
- Vercel

**Testing**

- Pytest
- Vitest
