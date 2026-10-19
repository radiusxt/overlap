export interface HoldingsProps {
  portfolio: Position[],
  prices: Map<string, number>,
  holdings: Row[],
  n?: number
}

export interface Holding {
  holding_ticker: string;
  holding_name: string;
  sector: string;
  country: string;
  weight: number;
}

export interface Position {
  ticker: string;
  shares: number;
}

export interface Row {
  etf_ticker: string;
  holding_ticker: string;
  holding_name: string;
  sector: string;
  country: string;
  currency: string;
  weight: number;
}
