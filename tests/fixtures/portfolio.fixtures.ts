/**
 * Sample portfolios for API testing.
 * 
 * These are simple, fixed compositions so expected results
 * can be manually calculated and reused across all tests.
 */

export interface Position {
  ticker: string;
  shares: number;
}

// Single ASX ETF
export const VAS: Position[] = [
  {
    ticker: "VAS.AX",
    shares: 500
  },
];

// Dual ASX ETFs with 2 distinct regions
export const IVV_VAS: Position[] = [
  {
    ticker: "IVV.AX",
    shares: 450
  },
  {
    ticker: "VAS.AX",
    shares: 200
  },
];

// Dual ASX ETFs with hedging
export const IHVV_VAS: Position[] = [
  {
    ticker: "IHVV.AX",
    shares: 400
  },
  {
    ticker: "VAS.AX",
    shares: 150
  },
];

// Typical ASX portfolio someone might have
export const IVV_NDQ_VAS: Position[] = [
  {
    ticker: "IVV.AX",
    shares: 500
  },
  {
    ticker: "NDQ.AX",
    shares: 275
  },
  {
    ticker: "VAS.AX",
    shares: 100
  },
];

export const MOCK_PORTFOLIOS = {
  p1: VAS,
  p2: IVV_VAS,
  p3: IHVV_VAS,
  p4: IVV_NDQ_VAS,
}
