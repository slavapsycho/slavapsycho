import http from "node:http";
import { logger } from "./logger.js";

export type ChatSummary = {
  id: string;
  name: string;
  type: "room" | "direct";
};

export type ControlState = {
  botEnabled: boolean;
  activeChatId: string | null;
  chats: ChatSummary[];
};

export type ControlActions = {
  getState: () => ControlState;
  setEnabled: (value: boolean) => void;
  bindChat: (chatId: string) => boolean;
  unbind: () => void;
};

const parseBody = async (req: http.IncomingMessage): Promise<Record<string, string>> => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }
  const body = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(body) as Record<string, string>;
  } catch {
    return {};
  }
};

const renderPage = (state: ControlState): string => {
  const chatItems = state.chats
    .map((chat) => {
      const active = state.activeChatId === chat.id ? " (активный)" : "";
      return `<li>${chat.name} [${chat.type}]${active}
        <button data-chat="${chat.id}">Привязать</button></li>`;
    })
    .join("");
  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <title>MT PAY Bot Control</title>
    <style>
      body { font-family: sans-serif; max-width: 720px; margin: 32px auto; }
      button { margin: 4px; padding: 6px 10px; }
      ul { padding-left: 20px; }
    </style>
  </head>
  <body>
    <h1>MT PAY Bot Control</h1>
    <p>Статус: <strong>${state.botEnabled ? "включен" : "остановлен"}</strong></p>
    <p>Активный чат: <strong>${state.activeChatId ?? "не выбран"}</strong></p>
    <div>
      <button onclick="action('start')">Включить</button>
      <button onclick="action('stop')">Остановить</button>
      <button onclick="action('unbind')">Снять привязку</button>
    </div>
    <h2>Доступные чаты</h2>
    <ul>${chatItems || "<li>Пока нет активных чатов</li>"}</ul>
    <script>
      async function action(cmd, chatId) {
        await fetch('/' + cmd, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId })
        });
        location.reload();
      }
      document.querySelectorAll('button[data-chat]').forEach((btn) => {
        btn.addEventListener('click', () => action('bind', btn.dataset.chat));
      });
    </script>
  </body>
</html>`;
};

const isAuthorized = (req: http.IncomingMessage, token?: string): boolean => {
  if (!token) {
    return true;
  }
  const header = req.headers.authorization;
  if (header === `Bearer ${token}`) {
    return true;
  }
  const url = new URL(req.url ?? "/", "http://localhost");
  return url.searchParams.get("token") === token;
};

export const startControlServer = (
  port: number,
  token: string | undefined,
  actions: ControlActions,
): void => {
  const server = http.createServer(async (req, res) => {
    if (!isAuthorized(req, token)) {
      res.writeHead(401, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Unauthorized");
      return;
    }

    const url = new URL(req.url ?? "/", "http://localhost");
    if (req.method === "GET" && url.pathname === "/") {
      const html = renderPage(actions.getState());
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }

    if (req.method === "POST") {
      const body = await parseBody(req);
      if (url.pathname === "/start") {
        actions.setEnabled(true);
        res.writeHead(204);
        res.end();
        return;
      }
      if (url.pathname === "/stop") {
        actions.setEnabled(false);
        res.writeHead(204);
        res.end();
        return;
      }
      if (url.pathname === "/unbind") {
        actions.unbind();
        res.writeHead(204);
        res.end();
        return;
      }
      if (url.pathname === "/bind") {
        const ok = body.chatId ? actions.bindChat(body.chatId) : false;
        res.writeHead(ok ? 204 : 400);
        res.end();
        return;
      }
    }

    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not Found");
  });

  server.listen(port, () => {
    logger.info("Control server started", { port });
  });
};
