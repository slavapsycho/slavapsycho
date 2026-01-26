export type CurrencyCode = "RUB" | "CNY" | "KZT" | "USDT";

export const currencyLabels: Record<CurrencyCode, string> = {
  RUB: "RUB",
  CNY: "CNY",
  KZT: "KZT",
  USDT: "USDT",
};

export const currencySymbols: Record<CurrencyCode, string> = {
  RUB: "₽",
  CNY: "¥",
  KZT: "₸",
  USDT: "₮",
};

const currencyPatterns: Array<[CurrencyCode, RegExp]> = [
  ["RUB", /\b(rub|руб|₽|рубл)/i],
  ["CNY", /\b(cny|юан|¥|yuan)/i],
  ["KZT", /\b(kzt|тенге|₸)/i],
  ["USDT", /\b(usdt|тезер|tether|₮)/i],
];

export const detectCurrencies = (text: string): CurrencyCode[] => {
  const found: CurrencyCode[] = [];
  for (const [code, pattern] of currencyPatterns) {
    if (pattern.test(text)) {
      found.push(code);
    }
  }
  return found;
};

export const normalizeCurrency = (text: string): CurrencyCode | null => {
  for (const [code, pattern] of currencyPatterns) {
    if (pattern.test(text)) {
      return code;
    }
  }
  return null;
};
