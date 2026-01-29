import { config } from "./config.js";
import { CurrencyCode } from "./currencies.js";
import { logger } from "./logger.js";

const GSHEET_ID = "1xQSaI-gnWl7xPHsRZglUrkw2mGq6hN1F8fDV1HHpkDI";
const SHEET_NAME = "Лист1";
const RANGE = "A:B";
const CACHE_TTL_MS = 60_000;

type RateCache = {
  data: Record<CurrencyCode, number>;
  fetchedAt: number;
};

let cache: RateCache | null = null;

const normalizeRow = (currencyRaw: string, rateRaw: string): [CurrencyCode, number] | null => {
  const currency = currencyRaw.replace(/[^A-Z]/gi, "").toUpperCase();
  const normalizedRate = rateRaw.replace(",", ".").trim();
  const rate = Number(normalizedRate);
  if (!rate || Number.isNaN(rate)) {
    return null;
  }
  if (currency === "RUB" || currency === "CNY" || currency === "KZT" || currency === "USDT") {
    return [currency as CurrencyCode, rate];
  }
  return null;
};

const fetchRates = async (): Promise<Record<CurrencyCode, number>> => {
  const endpoint = [
    "https://sheets.googleapis.com/v4/spreadsheets",
    GSHEET_ID,
    "values",
    `${encodeURIComponent(`${SHEET_NAME}!${RANGE}`)}?key=${config.google.apiKey}`,
  ].join("/");

  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error(`Sheets request failed: ${response.status}`);
  }

  const payload = (await response.json()) as { values?: string[][] };
  const rows = payload.values ?? [];

  const rates: Partial<Record<CurrencyCode, number>> = {};
  for (const row of rows.slice(1)) {
    const [currencyRaw, rateRaw] = row;
    if (!currencyRaw || !rateRaw) {
      continue;
    }
    const normalized = normalizeRow(currencyRaw, rateRaw);
    if (normalized) {
      const [currency, rate] = normalized;
      rates[currency] = rate;
    }
  }

  if (!rates.RUB || !rates.CNY) {
    throw new Error("Missing required rates");
  }

  return rates as Record<CurrencyCode, number>;
};

export const getRates = async (): Promise<Record<CurrencyCode, number>> => {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.data;
  }

  const data = await fetchRates();
  cache = { data, fetchedAt: Date.now() };
  logger.info("Rates cache updated", { currencies: Object.keys(data) });
  return data;
};
