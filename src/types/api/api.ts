interface HoldingsProps {
  portfolio: Position[],
  prices: Map<string, number>,
  holdings: Row[],
  n?: number
}

interface Holding {
  holding_ticker: string;
  holding_name: string;
  sector: string;
  country: string;
  weight: number;
}

interface Position {
  ticker: string;
  shares: number;
}

interface Row {
  etf_ticker: string;
  holding_ticker: string;
  holding_name: string;
  sector: string;
  country: string;
  currency: string;
  weight: number;
}
