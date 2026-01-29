import { CurrencyCode, detectCurrencies, normalizeCurrency } from "./currencies.js";
import { config } from "./config.js";
import { extractWithGemini } from "./gemini.js";
import { getRates } from "./sheets.js";
import { logger } from "./logger.js";

export type FSMState =
  | "IDLE"
  | "GREETING"
  | "TASK_DISCOVERY"
  | "QUOTE"
  | "READINESS_CHECK"
  | "COLLECT_REQUISITES"
  | "NORMALIZE_TASK"
  | "ESCALATED"
  | "STOPPED";

type TaskData = {
  fromCurrency?: CurrencyCode;
  toCurrency?: CurrencyCode;
  amountFrom?: number;
  amountTo?: number;
  requisit?: string;
  recipientName?: string;
  bank?: string;
  paymentSystem?: string;
};

export type Session = {
  state: FSMState;
  task: TaskData;
  lastQuestion?: string;
};

export type SendFn = (text: string) => Promise<void>;

export type SessionResult = {
  session: Session;
  stopProcessing?: boolean;
  escalation?: {
    message: string;
    fromCurrency: CurrencyCode;
  };
};

const greetingMessage =
  "Здравствуйте. Какая у вас задача: что отдаёте и что получаете, и на какую сумму?";

const readinessPrompt = "Курс на сейчас: {{rate}}. Готовы переводить сейчас?";

const notReadyMessage = "Напишите, как будете готовы переводить.";

const newTaskTriggers = /(новая задача|начать заново|старт)/i;

const yesRegex = /(да|готов|поехали|давайте|сейчас)/i;
const noRegex = /(нет|позже|не готов|потом)/i;

const amountRegex = /(\d+[.,]?\d*)/;
const phoneRegex = /(\+?\d[\d\s-]{8,}\d)/;
const cardRegex = /\b(\d{16,19})\b/;

const normalizeAmount = (value: string): number => Number(value.replace(",", "."));

const detectAmount = (text: string): number | undefined => {
  const match = text.match(amountRegex);
  if (!match) return undefined;
  const amount = normalizeAmount(match[1]);
  return Number.isNaN(amount) ? undefined : amount;
};

const extractDirectionalCurrencies = (text: string): {
  fromCurrency?: CurrencyCode;
  toCurrency?: CurrencyCode;
} => {
  const lower = text.toLowerCase();
  const currencies = detectCurrencies(text);
  if (currencies.length === 0) {
    return {};
  }

  const fromKeywords = /(отдаю|продаю|меняю|перевожу|плачу|отдаём|отдаю)/i;
  const toKeywords = /(получаю|получить|нужно|хочу|забрать|получу)/i;

  if (fromKeywords.test(lower) || toKeywords.test(lower)) {
    let fromCurrency: CurrencyCode | undefined;
    let toCurrency: CurrencyCode | undefined;
    for (const currency of currencies) {
      const pattern = new RegExp(`(${currency})`, "i");
      if (!fromCurrency && fromKeywords.test(lower) && pattern.test(text)) {
        fromCurrency = currency;
        continue;
      }
      if (!toCurrency && toKeywords.test(lower) && pattern.test(text)) {
        toCurrency = currency;
      }
    }
    return { fromCurrency, toCurrency };
  }

  if (currencies.length >= 2) {
    return { fromCurrency: currencies[0], toCurrency: currencies[1] };
  }

  return { fromCurrency: currencies[0] };
};

const detectAmountByCurrency = (text: string): {
  amount?: number;
  amountCurrency?: CurrencyCode;
} => {
  const regex =
    /(\d+[.,]?\d*)\s*(RUB|руб|₽|CNY|юан|¥|KZT|тенге|₸|USDT|тезер|tether|₮)/i;
  const match = text.match(regex);
  if (!match) return {};
  const amount = normalizeAmount(match[1]);
  const currency = normalizeCurrency(match[2]) ?? undefined;
  return { amount, amountCurrency: currency };
};

const formatRate = (fromCurrency: CurrencyCode, rate: number): string => {
  return `1 ${fromCurrency} = ${rate.toFixed(2)} RUB`;
};

const calculateAmounts = (
  fromCurrency: CurrencyCode,
  toCurrency: CurrencyCode,
  amountFrom: number,
  rates: Record<CurrencyCode, number>,
): number => {
  const rubValue = amountFrom * rates[fromCurrency];
  return rubValue / rates[toCurrency];
};

const fallbackRates: Record<CurrencyCode, number> = {
  RUB: 1,
  CNY: 12.9,
  KZT: 0.02,
  USDT: 95,
};

const buildRequisitePrompt = (currency: CurrencyCode): string => {
  switch (currency) {
    case "RUB":
      return "Пришлите реквизиты для получения рублей: номер карты или телефон (СБП), имя, банк.";
    case "CNY":
      return "Пришлите реквизиты для получения юаней: WeChat ID или номер телефона, имя получателя.";
    case "USDT":
      return "Пришлите адрес кошелька, сеть (TRC20 / ERC20), имя.";
    case "KZT":
      return "Пришлите реквизиты для получения тенге: номер карты или телефон, имя, банк.";
  }
};

const extractRequisites = (text: string): Pick<TaskData, "requisit" | "recipientName" | "bank" | "paymentSystem"> => {
  const requisit = cardRegex.exec(text)?.[1] ?? phoneRegex.exec(text)?.[1];
  const paymentSystem = /\b(trc20|erc20|сбп|sbp)\b/i.exec(text)?.[1];
  const bankMatch = /(банк|сбер|тинькофф|tinkoff|vtb|альфа|росбанк|raiffeisen)/i.exec(text);
  const bank = bankMatch ? bankMatch[0] : undefined;
  const nameMatch = /([А-ЯA-Z][а-яa-z]+)\s*([А-ЯA-Z][а-яa-z]+)?/u.exec(text);
  const recipientName = nameMatch ? `${nameMatch[1]}${nameMatch[2] ? ` ${nameMatch[2]}` : ""}` : undefined;
  return { requisit: requisit ?? undefined, recipientName, bank, paymentSystem };
};

const hasMultipleRequisites = (text: string): boolean => {
  const cards = text.match(/\b\d{16,19}\b/g) ?? [];
  const phones = text.match(/(\+?\d[\d\s-]{8,}\d)/g) ?? [];
  return cards.length + phones.length > 1;
};

const looksLikeRequisites = (text: string): boolean => {
  if (cardRegex.test(text) || phoneRegex.test(text)) {
    return true;
  }
  const walletLike = /\b[0-9a-zA-Z]{20,}\b/.test(text);
  const hasNetwork = /\b(trc20|erc20|сбп|sbp)\b/i.test(text);
  return walletLike || hasNetwork;
};

const processRequisites = async (
  session: Session,
  text: string,
  send: SendFn,
): Promise<SessionResult> => {
  if (hasMultipleRequisites(text)) {
    await send("Вы указали несколько реквизитов. Какие использовать?");
    return { session };
  }
  const extracted = extractRequisites(text);
  session.task = { ...session.task, ...extracted };
  if (!session.task.requisit || !session.task.recipientName) {
    await send("Уточните реквизит и имя получателя.");
    return { session };
  }

  if (session.task.toCurrency === "USDT" && !session.task.paymentSystem) {
    await send("Уточните сеть для USDT (TRC20 или ERC20).");
    return { session };
  }

  if (session.task.requisit && /\+?\d/.test(session.task.requisit)) {
    session.task.paymentSystem = session.task.paymentSystem ?? "СБП";
  }

  session.state = "NORMALIZE_TASK";
  return { session };
};

const formatNormalizedTask = (session: Session): string => {
  const { task } = session;
  return [
    `Реквизит: ${task.requisit ?? "не указан"}`,
    `Имя: ${task.recipientName ?? "не указано"}`,
    `Банк: ${task.bank ?? "не указан"}`,
    `ПС: ${task.paymentSystem ?? "не указана"}`,
    "",
    `Сумма к получению: ${task.amountTo?.toFixed(2)} ${task.toCurrency ?? ""}`.trim(),
  ].join("\n");
};

export const handleMessage = async (
  session: Session,
  text: string,
  send: SendFn,
): Promise<SessionResult> => {
  if (session.state === "ESCALATED" || session.state === "STOPPED") {
    if (!newTaskTriggers.test(text)) {
      return { session, stopProcessing: true };
    }
    session.state = "IDLE";
    session.task = {};
  }

  if (session.state === "IDLE") {
    await send(greetingMessage);
    session.state = "TASK_DISCOVERY";
    return { session };
  }

  if (session.state === "TASK_DISCOVERY") {
    const gemini = await extractWithGemini(text);
    const direction = extractDirectionalCurrencies(text);
    const { amount, amountCurrency } = detectAmountByCurrency(text);
    const fromCurrency = gemini?.fromCurrency ?? direction.fromCurrency;
    const toCurrency = gemini?.toCurrency ?? direction.toCurrency;
    const amountValue = gemini?.amount ?? amount ?? detectAmount(text);

    session.task.fromCurrency = fromCurrency ?? session.task.fromCurrency;
    session.task.toCurrency = toCurrency ?? session.task.toCurrency;
    session.task.amountFrom = amountValue ?? session.task.amountFrom;

    if (amountCurrency && session.task.fromCurrency && amountCurrency !== session.task.fromCurrency) {
      session.task.toCurrency = amountCurrency;
    }

    if (!session.task.fromCurrency || !session.task.toCurrency || !session.task.amountFrom) {
      const question =
        "Уточните, пожалуйста: какую валюту отдаёте, какую получаете и на какую сумму?";
      await send(question);
      session.lastQuestion = question;
      return { session };
    }

    let rates: Record<CurrencyCode, number>;
    try {
      rates = await getRates();
    } catch (error) {
      logger.error("Failed to fetch rates", { error });
      if (config.env !== "production") {
        rates = fallbackRates;
      } else {
        await send("Секунду, уточняю актуальный курс у оператора.");
        session.state = "ESCALATED";
        return {
          session,
          escalation: {
            message: "Клиент ожидает курс, Sheets недоступен.",
            fromCurrency: session.task.fromCurrency!,
          },
        };
      }
    }

    const amountTo = calculateAmounts(
      session.task.fromCurrency,
      session.task.toCurrency,
      session.task.amountFrom,
      rates,
    );
    session.task.amountTo = amountTo;
    const rateText = formatRate(session.task.fromCurrency, rates[session.task.fromCurrency]);
    await send(readinessPrompt.replace("{{rate}}", rateText));
    session.state = "READINESS_CHECK";
    return { session };
  }

  if (session.state === "READINESS_CHECK") {
    if (noRegex.test(text)) {
      await send(notReadyMessage);
      session.state = "STOPPED";
      return { session };
    }
    if (!yesRegex.test(text) && !looksLikeRequisites(text)) {
      await send("Подтвердите, готовы ли переводить сейчас?");
      return { session };
    }
    if (!session.task.toCurrency) {
      await send("Уточните, какую валюту хотите получить?");
      return { session };
    }
    if (looksLikeRequisites(text)) {
      session.state = "COLLECT_REQUISITES";
      return processRequisites(session, text, send);
    }
    await send(buildRequisitePrompt(session.task.toCurrency));
    session.state = "COLLECT_REQUISITES";
    return { session };
  }

  if (session.state === "COLLECT_REQUISITES") {
    return processRequisites(session, text, send);
  }

  if (session.state === "NORMALIZE_TASK") {
    const normalized = formatNormalizedTask(session);
    session.state = "ESCALATED";
    logger.info("Task normalized and escalated", { normalized });
    if (session.task.fromCurrency) {
      return {
        session,
        escalation: { message: normalized, fromCurrency: session.task.fromCurrency },
      };
    }
    return { session };
  }

  return { session };
};
