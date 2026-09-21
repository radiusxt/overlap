# Overlap

**See what your investment portfolio actually holds**

An investment exposure tool that looks through your holdings of individual stocks and exchange traded funds (ETFs) to show your *true* underlying exposure by top 10 holdings, country, sector and currency rather than by the ticker itself.

Most portfolio trackers, analysers and visualisers stop at the ticker level. If you hold several different ETFs, each might concentrate in the same handful of companies, leaving you far more concentrated than a glance of your holdings suggests. Overlap unwraps each fund's holdings and aggregates them alongside your direct holdings (individual shares) to uncover hidden risk.

View on desktop for the best experience.

## The Math Behind it

For a set of positions $(t_i, s_i)$, where $t_i$ is the $i$-th ticker symbol and $s_i$ is the number of shares held:

$$v_i = s_i \cdot p(t_i)$$

where $p(t_i)$ is the current market price of ticker $t_i$. The portfolio's total value (Net Liquidation Value) is:

$$\text{NLV} = \sum_i v_i$$

Each position's weight in the portfolio is:

$$w(t_i) = \frac{v_i}{\text{NLV}}$$

with $w(t_i) \in [0, 1]$ and $\sum_i w(t_i) = 1$.

Let $t$ refer generically to "some position in the portfolio" rather than a specific index.

Let $\omega(h, t)$ be holding $h$'s weight *within* ETF $t$, as disclosed by the fund's investment principles, often described as a **percentage**, $\omega(h, t) \in [0, 100]$, not a fraction like $w(t)$. A holding's contribution to the overall portfolio, rescaled through position $t$, is:

$$\text{contribution}(h, t) = w(t) \cdot \omega(h, t)$$

Since $w(t)$ is a fraction and $\omega(h, t)$ is a percentage, $\text{contribution}(h, t)$ is described as **percentage points of the whole portfolio**.

The same holding can appear in more than one ETF in the portfolio and with how many options there are, overlap between them is common. Its total exposure is the sum of its contribution across every position that holds it:

$$\text{Exposure}(h) = \sum_{t \,:\, h \in t} \text{contribution}(h, t)$$

where the sum ranges over positions $t$ whose underlying holdings include $h$. Summed across every distinct underlying holding, $\sum_h \text{Exposure}(h) \approx 100$ when an ETF's disclosed weights don't fully sum to 100 likely due to cash, cash equivalents, derivatives, futures, etc.

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
