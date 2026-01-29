import { WechatyBuilder, types } from "wechaty";
import type { Message } from "wechaty";
import qrTerminal from "qrcode-terminal";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { handleMessage, Session } from "./fsm.js";
import { startControlServer } from "./control.js";

const operatorMentions = {
  RUB: "@Jack 杰克 ［MT PAY]",
  CNY: "@Mike 麦克［MT PAY]",
  OTHER: "@Donnie Octo @Patrick 帕特里克 [MT PAY] @Mark Baum",
};

const attachmentTypes = new Set([
  types.MessageType.Image,
  types.MessageType.Attachment,
  types.MessageType.Video,
  types.MessageType.Audio,
]);

const sessions = new Map<string, Session>();
const chats = new Map<string, { name: string; type: "room" | "direct" }>();
let activeChatId: string | null = null;
let botEnabled = true;

const getSession = (chatId: string): Session => {
  const existing = sessions.get(chatId);
  if (existing) {
    return existing;
  }
  const session: Session = { state: "IDLE", task: {} };
  sessions.set(chatId, session);
  return session;
};

const buildOperatorMention = (fromCurrency: string): string => {
  if (fromCurrency === "RUB") return operatorMentions.RUB;
  if (fromCurrency === "CNY") return operatorMentions.CNY;
  return operatorMentions.OTHER;
};

export const startAgent = (): void => {
  const bot = WechatyBuilder.build({
    puppet: config.wechaty.puppet as string,
    name: "mt-pay-wechat-fx-agent",
  });

  bot.on("scan", (qrcode, status) => {
    logger.info("Scan QR Code to login", { status });
    qrTerminal.generate(qrcode, { small: true });
    const qrUrl = `https://wechaty.js.org/qrcode/${encodeURIComponent(qrcode)}`;
    logger.info("QR Code URL", { qrUrl });
  });

  bot.on("login", (user) => {
    logger.info("Logged in", { user: user.name() });
  });

  bot.on("logout", (user) => {
    logger.info("Logged out", { user: user.name() });
  });

  bot.on("error", (error) => {
    logger.error("Wechaty error", { error });
  });

  bot.on("message", async (message: Message) => {
    const room = message.room();
    const chatId = room ? room.id : message.talker().id;
    const chatName = room ? await room.topic() : message.talker().name();
    chats.set(chatId, { name: chatName, type: room ? "room" : "direct" });

    if (message.self()) {
      return;
    }

    const text = message.text().trim();

    if (!botEnabled) {
      return;
    }

    if (!activeChatId) {
      activeChatId = chatId;
    }

    if (activeChatId !== chatId) {
      return;
    }

    const session = getSession(chatId);

    if (attachmentTypes.has(message.type())) {
      await message.say(",");
      session.state = "STOPPED";
      return;
    }

    if (!text) {
      return;
    }

    const send = async (response: string): Promise<void> => {
      await message.say(response);
    };

    const result = await handleMessage(session, text, send);
    sessions.set(chatId, result.session);

    if (result.escalation) {
      const mention = buildOperatorMention(result.escalation.fromCurrency);
      await message.say(`${mention}\n${result.escalation.message}`);
    }
  });

  bot.start().catch((error: unknown) => {
    logger.error("Failed to start bot", { error });
  });

  if (config.control.port) {
    if (!config.control.token) {
      throw new Error("CONTROL_TOKEN is required when CONTROL_PORT is set.");
    }
    startControlServer(config.control.port, config.control.token, {
      getState: () => ({
        botEnabled,
        activeChatId,
        chats: Array.from(chats.entries()).map(([id, value]) => ({
          id,
          name: value.name,
          type: value.type,
        })),
      }),
      setEnabled: (value) => {
        botEnabled = value;
      },
      bindChat: (chatId) => {
        if (!chats.has(chatId)) {
          return false;
        }
        activeChatId = chatId;
        botEnabled = true;
        return true;
      },
      unbind: () => {
        activeChatId = null;
      },
    });
  }
};
