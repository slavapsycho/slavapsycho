# MT PAY WeChat FX Agent

Подробная инструкция **только для WSL2** (Windows Subsystem for Linux). Если у вас ещё нет WSL2 — установите его, это самый стабильный способ запуска.

---

## 1) Требования

**На Windows:**
- Windows 10/11
- Права администратора для включения WSL2

**Внутри WSL (Ubuntu):**
- Node.js 20+
- Git
- Доступ к интернету
- Wechaty Puppet `wechaty-puppet-wechat` (QR‑логин в личный WeChat)
- Доступ к Google Sheets API
- Доступ к Gemini API

---

## 2) Установка WSL2 и Ubuntu

Откройте **PowerShell от имени администратора** и выполните:
```powershell
wsl --install
```
После перезагрузки выберите **Ubuntu** из Microsoft Store (если она не установилась автоматически), запустите её и создайте пользователя.

Проверьте, что WSL2 активен:
```powershell
wsl -l -v
```
В списке дистрибутивов версия должна быть **2**.

---

## 3) Установка Node.js 20 в WSL

Внутри Ubuntu (WSL) выполните:
```bash
sudo apt update
sudo apt install -y curl git
```
Установите Node.js 20 через nvm (рекомендуется):
```bash
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
```
Перезапустите терминал Ubuntu или выполните:
```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
```
Установите Node.js 20:
```bash
nvm install 20
nvm use 20
```
Проверьте версии:
```bash
node -v
npm -v
```

---

## 4) Клонирование репозитория

Внутри Ubuntu:
```bash
git clone https://github.com/slavapsycho/slavapsycho.git
cd slavapsycho
```

---

## 5) Установка зависимостей

```bash
npm install
```

---

## 6) Настройка окружения

Скопируйте пример файла окружения:
```bash
cp .env.example .env
```
Откройте `.env` любым редактором, например:
```bash
nano .env
```

Заполните **обязательные** переменные:
- `WECHATY_PUPPET=wechaty-puppet-wechat` (обязательно)
- `GEMINI_API_KEY=...` (обязательно)
- `GEMINI_MODEL=gemini-1.5-flash` (или другая модель Gemini Flash)
- `GOOGLE_SHEETS_API_KEY=...` (обязательно)
- `NODE_ENV=production` или `development`

**Опционально:**
- `WECHATY_LOG=verbose` (для детальных логов)
- `CONTROL_PORT=8088` и `CONTROL_TOKEN=сложный_секрет` (скрытый веб-интерфейс управления)

Системный промпт хранится в `src/systemPrompt.ts` и используется в вызовах Gemini.

---

## 7) Получение ключей

### 7.1 Gemini API
1. Откройте Google AI Studio: https://aistudio.google.com/app/apikey
2. Создайте ключ.
3. Вставьте его в `.env` как `GEMINI_API_KEY`.

### 7.2 WeChat (QR‑логин, личный аккаунт)
Ключи **не нужны**. Авторизация происходит через QR‑код.
В `.env` обязательно:
```
WECHATY_PUPPET=wechaty-puppet-wechat
```

### 7.3 Google Sheets API
1. Откройте Google Cloud Console: https://console.cloud.google.com/
2. Создайте проект.
3. Включите API: **Google Sheets API**.
4. Создайте API key.
5. Вставьте ключ в `.env` как `GOOGLE_SHEETS_API_KEY`.
6. Проверьте доступ к таблице:
   - ID: `1xQSaI-gnWl7xPHsRZglUrkw2mGq6hN1F8fDV1HHpkDI`
   - Лист: `Лист1`

Документация Google Sheets: https://developers.google.com/sheets/api

---

## 8) Запуск бота

### Сборка
```bash
npm run build
```

### Запуск
```bash
npm run start
```

### Режим разработки (без сборки)
```bash
npm run dev
```

---

## 9) QR‑логин в WeChat

При старте в терминале появятся:
- строка QR‑кода
- URL для просмотра QR

Откройте WeChat на телефоне → **Сканировать** → наведите на QR.

После успешного логина:
- в логах появится сообщение `Logged in` с вашим именем,
- сессия сохраняется автоматически в локальном хранилище Wechaty (`.wechaty/`).

---

## 10) Скрытый веб‑интерфейс управления ботом

Чтобы управление не было видно клиенту, используется локальная веб‑страница.
В `.env` задайте:
```
CONTROL_PORT=8088
CONTROL_TOKEN=сложный_секрет
```

После запуска откройте в браузере **внутри WSL или Windows**:
```
http://localhost:8088/?token=сложный_секрет
```

**Возможности:**
- включить/остановить бота,
- привязать бота к конкретному чату,
- сбросить привязку.

Важно: бот отвечает только в **одном активном чате**. Чтобы выбрать чат, сначала дождитесь сообщения из нужного чата (он появится в списке), затем нажмите «Привязать».

---

## 11) Ограничения WeChat Web (puppet-wechat)

Официальные ограничения Web WeChat:
- Web WeChat не поддерживает создание комнат и приглашение пользователей.
- Work WeChat не поддерживается.
- Аккаунт должен уметь входить в https://wx.qq.com (иначе Web WeChat не доступен).

Официальная документация:
- https://wechaty.js.org/docs/puppet-providers/
- https://github.com/wechaty/puppet-wechat

---

## 12) Траблшутинг (puppet-wechat)

**1) Не скачивается Chromium (например, в Китае):**
```bash
export PUPPETEER_DOWNLOAD_HOST=https://registry.npmmirror.com/mirrors
```

**2) Ошибка “Could not find expected browser”:**
Укажите путь к установленному Chromium/Chrome:
```bash
export WECHATY_PUPPET_WECHAT_ENDPOINT=/usr/bin/chromium-browser
```

**3) Отключить stealth‑режим puppeteer:**
```bash
export WECHATY_PUPPET_WECHAT_PUPPETEER_STEALTHLESS=1
```

---

## 13) Типичные проблемы

**`npm install` падает на wechaty-puppet-wechat:**
- Убедитесь, что в `package.json` указана существующая версия пакета.
- Обновите `npm`, если требуется.

**Не видно QR‑кода:**
- Проверьте, что `WECHATY_PUPPET=wechaty-puppet-wechat`.
- Убедитесь, что терминал не фильтрует вывод.

**Бот не отвечает:**
- Проверьте, что бот привязан к нужному чату в скрытом интерфейсе.
- Убедитесь, что `CONTROL_TOKEN` верный.

---

## 14) Быстрый чек‑лист запуска

1. В WSL установлены Node.js 20+ и Git.
2. Репозиторий склонирован.
3. Создан `.env` и заполнены ключи.
4. `WECHATY_PUPPET=wechaty-puppet-wechat`.
5. `npm install` → `npm run build` → `npm run start`.
6. QR отсканирован.

Готово.
