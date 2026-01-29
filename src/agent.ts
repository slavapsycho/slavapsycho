import { ScanStatus, WechatyBuilder, types } from "wechaty";
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

const UOS_PATCH_CLIENT_VERSION = "2.0.0";
const UOS_PATCH_EXTSPAM =
  "Gp8ICJkIEpkICggwMDAwMDAwMRAGGoAI1GiJSIpeO1RZTq9QBKsRbPJdi84ropi16EYI10WB6g74sGmRwSNXjPQnYUKYotKkvLGpshucCaeWZMOylnc6o2AgDX9grhQQx7fm2DJRTyuNhUlwmEoWhjoG3F0ySAWUsEbH3bJMsEBwoB//0qmFJob74ffdaslqL+IrSy7LJ76/G5TkvNC+J0VQkpH1u3iJJs0uUYyLDzdBIQ6Ogd8LDQ3VKnJLm4g/uDLe+G7zzzkOPzCjXL+70naaQ9medzqmh+/SmaQ6uFWLDQLcRln++wBwoEibNpG4uOJvqXy+ql50DjlNchSuqLmeadFoo9/mDT0q3G7o/80P15ostktjb7h9bfNc+nZVSnUEJXbCjTeqS5UYuxn+HTS5nZsPVxJA2O5GdKCYK4x8lTTKShRstqPfbQpplfllx2fwXcSljuYi3YipPyS3GCAqf5A7aYYwJ7AvGqUiR2SsVQ9Nbp8MGHET1GxhifC692APj6SJxZD3i1drSYZPMMsS9rKAJTGz2FEupohtpf2tgXm6c16nDk/cw+C7K7me5j5PLHv55DFCS84b06AytZPdkFZLj7FHOkcFGJXitHkX5cgww7vuf6F3p0yM/W73SoXTx6GX4G6Hg2rYx3O/9VU2Uq8lvURB4qIbD9XQpzmyiFMaytMnqxcZJcoXCtfkTJ6pI7a92JpRUvdSitg967VUDUAQnCXCM/m0snRkR9LtoXAO1FUGpwlp1EfIdCZFPKNnXMeqev0j9W9ZrkEs9ZWcUEexSj5z+dKYQBhIICviYUQHVqBTZSNy22PlUIeDeIs11j7q4t8rD8LPvzAKWVqXE+5lS1JPZkjg4y5hfX1Dod3t96clFfwsvDP6xBSe1NBcoKbkyGxYK0UvPGtKQEE0Se2zAymYDv41klYE9s+rxp8e94/H8XhrL9oGm8KWb2RmYnAE7ry9gd6e8ZuBRIsISlJAE/e8y8xFmP031S6Lnaet6YXPsFpuFsdQs535IjcFd75hh6DNMBYhSfjv456cvhsb99+fRw/KVZLC3yzNSCbLSyo9d9BI45Plma6V8akURQA/qsaAzU0VyTIqZJkPDTzhuCl92vD2AD/QOhx6iwRSVPAxcRFZcWjgc2wCKh+uCYkTVbNQpB9B90YlNmI3fWTuUOUjwOzQRxJZj11NsimjOJ50qQwTTFj6qQvQ1a/I+MkTx5UO+yNHl718JWcR3AXGmv/aa9rD1eNP8ioTGlOZwPgmr2sor2iBpKTOrB83QgZXP+xRYkb4zVC+LoAXEoIa1+zArywlgREer7DLePukkU6wHTkuSaF+ge5Of1bXuU4i938WJHj0t3D8uQxkJvoFi/EYN/7u2P1zGRLV4dHVUsZMGCCtnO6BBigFMAA=";

const attachmentTypes = new Set([
  types.Message.Image,
  types.Message.Attachment,
  types.Message.Video,
  types.Message.Audio,
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
  process.env.WECHATY_PUPPET_WECHAT_PUPPETEER_UOS = "true";
  process.env.WECHATY_PUPPET_WECHAT_TOKEN = UOS_PATCH_EXTSPAM;
  const bot = WechatyBuilder.build({
    puppet: "wechaty-puppet-wechat",
    puppetOptions: {
      uos: true,
      token: UOS_PATCH_EXTSPAM,
    },
    name: "mt-pay-wechat-fx-agent",
  });

  bot.on("scan", (qrcode, status) => {
    if (status === ScanStatus.Waiting || status === ScanStatus.Timeout) {
      console.log("\n=== WECHAT LOGIN QR ===\n");
      qrTerminal.generate(qrcode, { small: true });
      console.log("\nOpen this URL if the terminal QR is not readable:\n");
      console.log(`https://wechaty.js.org/qrcode/${encodeURIComponent(qrcode)}\n`);
    } else {
      console.log("Scan status:", ScanStatus[status]);
    }
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
