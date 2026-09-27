# Режими відповіді вебхука й тестовий / production URL

## Режими вузла Webhook

| Режим | Що отримує Next.js | Коли використовуємо |
|---|---|---|
| Immediately | `200 {"message":"Workflow was started"}` одразу | Подія «до відома», результат не потрібен: `lead-created`, аналітика |
| When Last Node Finishes | Вихід останнього вузла після завершення воркфлоу | Швидкий запит довідки (секунди), коли результат потрібен у відповіді |
| Using Respond to Webhook | Те, що задає вузол Respond to Webhook | **Стандарт для довгих задач:** `202 {"job_id": …}` одразу, результат — колбеком |
| Streaming | Потік | Не використовуємо |

**Правило 100 секунд.** Усе, що може наблизитися до 100 с, — лише асинхронно (202 + колбек). На n8n
Cloud запит, на який вебхук не відповів за 100 с, завершується **524**; воркфлоу працює далі, а Next.js
про результат уже не дізнається. **Не певні, скільки триває воркфлоу, — він асинхронний.**

- Генерація документів (PDF кошторису, договору), листи, зовнішні API з чергами — асинхронні.
- Respond to Webhook спрацьовує один раз; наступні такі вузли ігноруються. Воркфлоу завершився, не
  дійшовши до нього, — n8n відповідає `200` зі стандартним повідомленням; помилка до нього — `500`.
- Тому для асинхронної події успіх виклику — саме `202`; `200` від такого вебхука — ознака, що воркфлоу
  налаштований не так (записати `failed`/попередження, не вважати, що колбек прийде).

## Тестовий і production URL

| | Тестовий | Production |
|---|---|---|
| Шлях | `/webhook-test/<path>` | `/webhook/<path>` |
| Працює | 120 с після «Listen for test event» (або запуску воркфлоу) в редакторі | Поки воркфлоу **опублікований** |
| Дані видно в редакторі | Так | Ні |

- У коді й `.env.example` — **лише** `/webhook`. Тестовий URL — тільки тимчасово у **власному**
  `.env.local`, коли дивитесь дані в редакторі n8n.
- Симптом тестового URL у коді: заявки «проходять» (форма показує успіх), але в журналі n8n / мока —
  `404`, бо слухач закритий. Код, який не дивиться на статус, цього не помітить.
- n8n 2.x: публікація фіксує версію воркфлоу; production-виклики йдуть у неї. Після змін — Publish знову.
- Self-hosted може змінити шляхи змінними `N8N_ENDPOINT_WEBHOOK` / `N8N_ENDPOINT_WEBHOOK_TEST` — тоді
  це записуємо в `docs/n8n-integrations.md` проєкту.

## Мок n8n (`scripts/mock-n8n.mjs`)

Копія `tools/mock-n8n.mjs`, без залежностей. Поводиться як Webhook + Respond to Webhook + HTTP Request
з підписом. Команди однакові в Git Bash і PowerShell:

```bash
node .claude/skills/integrating-n8n-webhooks/scripts/mock-n8n.mjs --help
node .claude/skills/integrating-n8n-webhooks/scripts/mock-n8n.mjs                     # :5678, Immediately
node .claude/skills/integrating-n8n-webhooks/scripts/mock-n8n.mjs --mode last-node    # 200 через 2 с
node .claude/skills/integrating-n8n-webhooks/scripts/mock-n8n.mjs --mode slow --cloud-timeout 5000   # 524
node --env-file=.env.local .claude/skills/integrating-n8n-webhooks/scripts/mock-n8n.mjs --mode respond-202 --delay 5000
#   з N8N_WEBHOOK_TOKEN — Header Auth (403 без токена), з N8N_CALLBACK_SECRET — підписаний колбек на callbackUrl
```

- `/webhook-test/<path>` мок приймає лише з `--listen` і лише 120 с — як n8n.
- Журнал мока: метод, шлях, статус, тривалість, **імена** заголовків, розмір і sha256 тіла,
  `auth=`, `idempotency=new|repeat|absent`. Тіл і значень не пише.
- Ознаки правильного виклику в журналі: `POST /webhook/<path> -> 202`, `auth=ok`, `idempotency=new`
  (а при повторі тієї ж операції — `repeat`); далі — рядок колбеку з кодом відповіді застосунку (`202`).
- Мок надсилає лише `data.status = "completed"`; `failed` обробляємо за контрактом, але мок його не шле.
