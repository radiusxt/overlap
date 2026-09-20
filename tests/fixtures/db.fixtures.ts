// Synthetic ETF holdings and pricing data used to mock postgres and yahoo finance.

export interface Row {
  etf_ticker: string;
  holding_ticker: string;
  holding_name: string;
  sector: string;
  country: string;
  currency: string;
  weight: number; // as a percentage
}


const SP500: Array<Omit<Row, "etf_ticker" | "currency">> = [
  { holding_ticker: "AAPL", holding_name: "Apple Inc", sector: "Information Technology", country: "United States", weight: 7.0 },
  { holding_ticker: "MSFT", holding_name: "Microsoft Corp", sector: "Information Technology", country: "United States", weight: 6.5 },
  { holding_ticker: "NVDA", holding_name: "NVIDIA Corp", sector: "Information Technology", country: "United States", weight: 6.0 },
  { holding_ticker: "AMZN", holding_name: "Amazon.com Inc", sector: "Consumer Discretionary", country: "United States", weight: 3.5 },
  { holding_ticker: "GOOGL", holding_name: "Alphabet Inc Class A", sector: "Communication Services", country: "United States", weight: 2.0 },
  { holding_ticker: "META", holding_name: "Meta Platforms Inc", sector: "Communication Services", country: "United States", weight: 2.0 },
  { holding_ticker: "GOOG", holding_name: "Alphabet Inc Class C", sector: "Communication Services", country: "United States", weight: 1.8 },
  { holding_ticker: "AVGO", holding_name: "Broadcom Inc", sector: "Information Technology", country: "United States", weight: 1.5 },
  { holding_ticker: "TSLA", holding_name: "Tesla Inc", sector: "Consumer Discretionary", country: "United States", weight: 1.5 },
  { holding_ticker: "BRK.B", holding_name: "Berkshire Hathaway Inc Class B", sector: "Financials", country: "United States", weight: 1.2 },
  { holding_ticker: "AMD", holding_name: "Advanced Micro Devices Inc", sector: "Information Technology", country: "United States", weight: 1.0 },
  { holding_ticker: "JNJ", holding_name: "Johnson & Johnson", sector: "Health Care", country: "United States", weight: 0.9 },
  { holding_ticker: "XOM", holding_name: "Exxon Mobil Corp", sector: "Energy", country: "United States", weight: 0.85 },
  { holding_ticker: "UNH", holding_name: "UnitedHealth Group Inc", sector: "Health Care", country: "United States", weight: 0.8 },
  { holding_ticker: "HD", holding_name: "Home Depot Inc", sector: "Consumer Discretionary", country: "United States", weight: 0.75 },
];

// IVV.AX and IHVV.AX track the same underlying index, so weights are identical and the only difference is currency.
const IHVV_HOLDINGS: Row[] = SP500.map((h) => ({ etf_ticker: "IHVV.AX", ...h, currency: "AUD" }));
const IVV_HOLDINGS: Row[] = SP500.map((h) => ({ etf_ticker: "IVV.AX", ...h, currency: "USD" }));

const NDQ_HOLDINGS: Row[] = [
  { etf_ticker: "NDQ.AX", holding_ticker: "AAPL", holding_name: "Apple Inc", sector: "Information Technology", country: "United States", currency: "USD", weight: 8.5 },
  { etf_ticker: "NDQ.AX", holding_ticker: "MSFT", holding_name: "Microsoft Corp", sector: "Information Technology", country: "United States", currency: "USD", weight: 8.0 },
  { etf_ticker: "NDQ.AX", holding_ticker: "NVDA", holding_name: "NVIDIA Corp", sector: "Information Technology", country: "United States", currency: "USD", weight: 7.5 },
  { etf_ticker: "NDQ.AX", holding_ticker: "AMZN", holding_name: "Amazon.com Inc", sector: "Consumer Discretionary", country: "United States", currency: "USD", weight: 5.0 },
  { etf_ticker: "NDQ.AX", holding_ticker: "AVGO", holding_name: "Broadcom Inc", sector: "Information Technology", country: "United States", currency: "USD", weight: 4.0 },
  { etf_ticker: "NDQ.AX", holding_ticker: "META", holding_name: "Meta Platforms Inc", sector: "Communication Services", country: "United States", currency: "USD", weight: 3.5 },
  { etf_ticker: "NDQ.AX", holding_ticker: "GOOGL", holding_name: "Alphabet Inc Class A", sector: "Communication Services", country: "United States", currency: "USD", weight: 2.8 },
  { etf_ticker: "NDQ.AX", holding_ticker: "GOOG", holding_name: "Alphabet Inc Class C", sector: "Communication Services", country: "United States", currency: "USD", weight: 2.5 },
  { etf_ticker: "NDQ.AX", holding_ticker: "TSLA", holding_name: "Tesla Inc", sector: "Consumer Discretionary", country: "United States", currency: "USD", weight: 2.5 },
  { etf_ticker: "NDQ.AX", holding_ticker: "COST", holding_name: "Costco Wholesale Corp", sector: "Consumer Staples", country: "United States", currency: "USD", weight: 2.0 },
  { etf_ticker: "NDQ.AX", holding_ticker: "AMD", holding_name: "Advanced Micro Devices Inc", sector: "Information Technology", country: "United States", currency: "USD", weight: 1.8 },
  { etf_ticker: "NDQ.AX", holding_ticker: "ADBE", holding_name: "Adobe Inc", sector: "Information Technology", country: "United States", currency: "USD", weight: 1.6 },
  { etf_ticker: "NDQ.AX", holding_ticker: "NFLX", holding_name: "Netflix Inc", sector: "Communication Services", country: "United States", currency: "USD", weight: 1.5 },
  { etf_ticker: "NDQ.AX", holding_ticker: "CSCO", holding_name: "Cisco Systems Inc", sector: "Information Technology", country: "United States", currency: "USD", weight: 1.3 },
  { etf_ticker: "NDQ.AX", holding_ticker: "INTC", holding_name: "Intel Corp", sector: "Information Technology", country: "United States", currency: "USD", weight: 1.2 },
];

const VAS_HOLDINGS: Row[] = [
  { etf_ticker: "VAS.AX", holding_ticker: "CBA", holding_name: "Commonwealth Bank of Australia", sector: "Financials", country: "Australia", currency: "AUD", weight: 10.0 },
  { etf_ticker: "VAS.AX", holding_ticker: "BHP", holding_name: "BHP Group", sector: "Materials", country: "Australia", currency: "AUD", weight: 8.0 },
  { etf_ticker: "VAS.AX", holding_ticker: "CSL", holding_name: "CSL Limited", sector: "Health Care", country: "Australia", currency: "AUD", weight: 6.0 },
  { etf_ticker: "VAS.AX", holding_ticker: "NAB", holding_name: "National Australia Bank", sector: "Financials", country: "Australia", currency: "AUD", weight: 5.0 },
  { etf_ticker: "VAS.AX", holding_ticker: "WBC", holding_name: "Westpac Banking Corp", sector: "Financials", country: "Australia", currency: "AUD", weight: 4.5 },
  { etf_ticker: "VAS.AX", holding_ticker: "ANZ", holding_name: "ANZ Group Holdings", sector: "Financials", country: "Australia", currency: "AUD", weight: 4.0 },
  { etf_ticker: "VAS.AX", holding_ticker: "WES", holding_name: "Wesfarmers", sector: "Consumer Discretionary", country: "Australia", currency: "AUD", weight: 3.5 },
  { etf_ticker: "VAS.AX", holding_ticker: "MQG", holding_name: "Macquarie Group", sector: "Financials", country: "Australia", currency: "AUD", weight: 3.0 },
  { etf_ticker: "VAS.AX", holding_ticker: "TLS", holding_name: "Telstra Group", sector: "Communication Services", country: "Australia", currency: "AUD", weight: 2.5 },
  { etf_ticker: "VAS.AX", holding_ticker: "WOW", holding_name: "Woolworths Group", sector: "Consumer Staples", country: "Australia", currency: "AUD", weight: 2.0 },
  { etf_ticker: "VAS.AX", holding_ticker: "RIO", holding_name: "Rio Tinto Ltd", sector: "Materials", country: "Australia", currency: "AUD", weight: 1.8 },
  { etf_ticker: "VAS.AX", holding_ticker: "WDS", holding_name: "Woodside Energy Group", sector: "Energy", country: "Australia", currency: "AUD", weight: 1.6 },
  { etf_ticker: "VAS.AX", holding_ticker: "GMG", holding_name: "Goodman Group", sector: "Real Estate", country: "Australia", currency: "AUD", weight: 1.5 },
  { etf_ticker: "VAS.AX", holding_ticker: "COL", holding_name: "Coles Group", sector: "Consumer Staples", country: "Australia", currency: "AUD", weight: 1.4 },
  { etf_ticker: "VAS.AX", holding_ticker: "FMG", holding_name: "Fortescue Ltd", sector: "Materials", country: "Australia", currency: "AUD", weight: 1.3 },
];

export const MOCK_HOLDINGS: Row[] = [
  ...VAS_HOLDINGS,
  ...IVV_HOLDINGS,
  ...IHVV_HOLDINGS,
  ...NDQ_HOLDINGS,
];

export const MOCK_PRICES: Record<string, number> = {
  "IHVV.AX": 65,
  "IVV.AX": 70,
  "NDQ.AX": 60,
  "VAS.AX": 100,
};
