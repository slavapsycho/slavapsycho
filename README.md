# MT PAY WeChat FX Agent

## Требования
- Node.js 20+
- Wechaty Puppet (например, `wechaty-puppet-service`)
- Доступ к Google Sheets API
- Доступ к Gemini API

## Установка
```bash
npm install
```

## Настройка окружения
Скопируйте пример:
```bash
cp .env.example .env
```

Заполните переменные:
- `WECHATY_PUPPET` — имя puppet (например, `wechaty-puppet-service`).
- `WECHATY_PUPPET_SERVICE_TOKEN` — токен от Wechaty Puppet Service.
- `GEMINI_API_KEY` — API-ключ Gemini.
- `GEMINI_MODEL` — модель, например `gemini-1.5-flash`.
- `GOOGLE_SHEETS_API_KEY` — API-ключ Google Sheets.
- `NODE_ENV` — `production` или `development`.

Системный промпт хранится в `src/systemPrompt.ts` и используется в вызовах Gemini.

## Получение ключей

### Gemini API
1. Откройте Google AI Studio: https://aistudio.google.com/app/apikey
2. Создайте ключ.
3. Запишите его в `GEMINI_API_KEY`.

### Wechaty Puppet Service
1. Зарегистрируйтесь/войдите в Wechaty Puppet Service.
2. Создайте токен (Service Token).
3. Укажите:
   - `WECHATY_PUPPET=wechaty-puppet-service`
   - `WECHATY_PUPPET_SERVICE_TOKEN=<ваш_токен>`

Официальный ресурс: https://wechaty.js.org/docs/puppet-services/ .

### Google Sheets API
1. В Google Cloud Console создайте проект.
2. Включите API: **Google Sheets API**.
3. Создайте API key (ограничьте по IP/HTTP referrer по необходимости).
4. Укажите ключ в `GOOGLE_SHEETS_API_KEY`.
5. Убедитесь, что таблица доступна по API с ID
   `1xQSaI-gnWl7xPHsRZglUrkw2mGq6hN1F8fDV1HHpkDI` и листом `Лист1`.

Документация: https://developers.google.com/sheets/api .

## Запуск
Сборка:
```bash
npm run build
```

Запуск:
```bash
npm run start
```

Для разработки:
```bash
npm run dev
```

## Управление ботом (скрытый локальный интерфейс)
Чтобы интерфейс не был виден клиенту, управление делается через локальную веб-страницу
на сервере. Добавьте в `.env`:

```
CONTROL_PORT=8088
CONTROL_TOKEN=сложный_секрет
```

Запустите бота и откройте:
`http://localhost:8088/?token=сложный_секрет`

На странице можно:
- включать/останавливать бота,
- привязывать бота к конкретному чату,
- сбрасывать привязку.

Важно: бот отвечает только в одном активном чате. Чтобы выбрать чат, сначала дождитесь
сообщения из нужного чата (чтобы он появился в списке), затем нажмите «Привязать».

## Развёртывание с Windows
### Вариант 1 — запуск на Windows
1. Установите Node.js 20+ (например, с https://nodejs.org/).
2. Установите Git for Windows.
3. Склонируйте репозиторий и выполните:
   ```bash
   npm install
   cp .env.example .env
   ```
4. Заполните `.env`.
5. Соберите и запустите:
   ```bash
   npm run build
   npm run start
   ```

Чтобы бот работал постоянно, можно использовать планировщик задач Windows:
1. Откройте «Планировщик заданий».
2. Создайте новую задачу.
3. В «Действиях» укажите запуск `node` с аргументом `dist/index.js`.
4. В «Условиях» включите «Запускать при входе пользователя».

### Вариант 2 — запуск через WSL2 (рекомендуется)
1. Установите WSL2 и Ubuntu.
2. В Ubuntu установите Node.js 20 (например, через `nvm`).
3. Клонируйте репозиторий, настройте `.env`, затем:
   ```bash
   npm install
   npm run build
   npm run start
   ```
4. Для постоянной работы используйте `systemd` или `pm2`.
