# A/B-перевірка скіла `integrating-n8n-webhooks` (Task D)

> **A — без скіла, B — зі скілом.** Числа й цитати — із сесій, журналів мока й сервера (27–28.09.2026).
> Результат прогону **B** перенесено в гілку `ws04/SvitlanaHaiduchyk` — останній розділ.

- **Інструмент і версія:** Claude Code (десктоп-застосунок, вкладка Code); CLI `claude` 2.1.252 — для `/context`
- **Модель і рівень міркування (effort), однакові в обох прогонах:** `claude-opus-5-5` (Opus 5.5), effort `medium`
  (метадані сесій: A — «n8n quote-request workflow integration», створена 20:31; B — та сама назва, створена 20:37)
- **Код:** BASE = `fdff42b` (коміт після Task C: три скіли, виправлення Task A, форма нотаток з Task B; ще без
  `/quotes` і змін у виклику n8n) · скіл `integrating-n8n-webhooks` для копії B — з `fdff42b` (на той момент HEAD = BASE)
- **Копії:** `C:\Course\leaddesk-ab-a` (без жодного скіла), `C:\Course\leaddesk-ab-b` (лише `integrating-n8n-webhooks`);
  у кожній — `git init`, один коміт `start` з тегом `base`, `npm install` (`package-lock.json` не змінився)
- **Що видалено з обох копій:** `tools/`, `materials/`, `docs/`, `README.md`, `.coderabbit.yaml`, `.github/` і
  `.claude/skills` (у B повернуто лише `integrating-n8n-webhooks`). Перевірено командами з кроку 1:
  `find … -name SKILL.md` → один рядок `leaddesk-ab-b/.claude/skills/integrating-n8n-webhooks/SKILL.md`;
  `ls -A … | grep …` → «no hints - ok»; `grep -rlE "x-n8n-token|timingSafeEqual|idempotency-key" ../leaddesk-ab-a`
  → «no contract - ok». Слово `n8n` у копії A є лише в старому коді з BASE (`.env.example`, `app/actions.ts`) —
  однаково в обох копіях. В обох лишився `skills-lock.json` із BASE (згадує лише скіл Vercel, не контракт n8n).
- **Особисті копії скіла** (`~/.claude/skills`, `~/.cursor/skills`, `~/.agents/skills`, `~/.codex/skills`): перевірено — немає
- **Запит:** `materials/ab-task.md` без змін, нова сесія на кожен прогін (запускав користувач)
- **Відповідь на уточнення, однакова в обох:** агенти не питали (в обох журналах — лише одне повідомлення користувача, сам запит)
- **Доступ поза текою копії:** користувач не повідомляв про запити на читання поза копією. Журнал сесії, доступний
  мені, показує назви інструментів без аргументів, тож повністю це не перевірено.
- **Мок, однаковий для обох** (з робочого репозиторію, термінал у теці копії):
  `node --env-file=.env.local ../2026-quitcode-04-agent-skills-hw/tools/mock-n8n.mjs --mode respond-202 --delay 5000`
  (без `--callback-url`: обидва застосунки передають `callbackUrl` у тілі). Застосунок — `npm run build && npm start`
  на `:3000`. У `.env.local` кожної копії — змінні агента зі значеннями для мока + `N8N_WEBHOOK_TOKEN` і
  `N8N_CALLBACK_SECRET` мока (секрети згенеровано `randomBytes(32)`; у A `N8N_CALLBACK_SECRET` = `N8N_QUOTE_CALLBACK_SECRET`).
- **Базова лінія `check-contract.mjs` на копії до прогону** (увесь код, без `--changed-since`): 2 PASS, 9 FAIL, 3 N/A
  (FAIL: C1, C3, C4, C5, C6, C7, C8, C9, C14 — старий виклик `lead-created` в `app/actions.ts` і `.env.example`;
  N/A: C10–C12, колбек-роуту ще немає). Однаково в обох копіях; в оцінку прогонів не йде.

## A — без скіла

- Які скіли бачив агент (окремий запуск `/context` у теці копії): жодного проєктного — у розділі Skills лише
  Built-in скіли Claude Code (14 рядків, ті самі, що в B)
- Що зробив агент: сторінку `/quotes/new` з формою (компанія, email, опис, бюджет; помилки під полями), Server Action
  `requestQuote` (валідація → запис у пам'ять → `after(() => triggerQuoteWorkflow(quote))` → `redirect`), модуль
  `lib/n8n-quote.ts` (`fetch` на `N8N_QUOTE_WEBHOOK_URL` з `AbortSignal.timeout(10_000)`, тіло — плоский об'єкт
  з `email` і описом), колбек `POST /api/quotes/[id]/callback` з перевіркою `Authorization: Bearer <секрет>` через
  `timingSafeEqual` і `request.json()`, сторінку статусу `/quotes/[id]` з автооновленням кожні 5 с.
- Звідки агент узяв домовленості: скіла й записки не було; з журналу — читав код проєкту (6 викликів Bash на старті)
  і будував рішення із загальних знань: `after()`, таймаут 10 с, «Respond: Immediately» у n8n, Bearer-секрет.
  Контрактних речей (конверт, `x-n8n-token`, `idempotency-key`, HMAC-підпис, вікно часу, `/api/n8n/[event]`) немає —
  їх ніде в копії не описано. Для самоперевірки агент написав власний невеликий мок n8n (у діфі його немає — поза текою копії).
- Запитання агента: немає. Фінальна відповідь (скорочено): «Сторінка `/quotes/new`, Server Action, ендпоінт для n8n
  і сторінка статусу `/quotes/[id]` готові… Ендпоінт `POST /api/quotes/<id>/callback`… Запити без правильного
  секрету отримують 401… у вузлі Webhook поставити «Respond: Immediately»… HTTP Request на `callbackUrl` … із
  заголовком `Authorization: Bearer <той самий секрет>`».
- Змінені файли (`git diff --cached --stat base`): 9 файлів, +464 — `.env.example`, `app/api/quotes/[id]/callback/route.ts`,
  `app/quotes/[id]/page.tsx`, `app/quotes/actions.ts`, `app/quotes/new/page.tsx`, `components/auto-refresh.tsx`,
  `components/quote-form.tsx`, `lib/n8n-quote.ts`, `lib/quotes.ts`; діф: `docs/ab/a-without-skill.diff`
- Змінні середовища, які додав агент: `N8N_QUOTE_WEBHOOK_URL`, `APP_BASE_URL`, `N8N_QUOTE_CALLBACK_SECRET`
- `check-contract.mjs --root ../leaddesk-ab-a --changed-since base` — лише код прогону (скрипт після виправлення
  `8ebc86e`, див. «Що змінилось у скілі»), код виходу 1:
  ```
check-contract: C:Courseleaddesk-ab-a
scope: changed since base (9 changed file(s)); 11 finding(s) in unchanged code not shown
C1   PASS no test webhook URL (/webhook-test/) in code or .env.example
C2   PASS no NEXT_PUBLIC_ prefix on N8N_* variables
C3   FAIL n8n is called only from lib/n8n/client.ts
       lib/n8n-quote.ts:10  n8n webhook variable read outside lib/n8n/client.ts
       lib/n8n-quote.ts:19  fetch() to n8n outside lib/n8n/client.ts
C4   FAIL lib/n8n/client.ts exists and starts with import "server-only"
       lib/n8n-quote.ts:1  n8n is used but lib/n8n/client.ts does not exist
C5   PASS every fetch() to n8n has signal: AbortSignal.timeout(...)
C6   FAIL only contract N8N_* variables
       .env.example:10  N8N_QUOTE_WEBHOOK_URL is not in the contract (N8N_WEBHOOK_BASE_URL + event path, N8N_WEBHOOK_TOKEN, N8N_CALLBACK_SECRET)
       .env.example:14  N8N_QUOTE_CALLBACK_SECRET is not in the contract (N8N_WEBHOOK_BASE_URL + event path, N8N_WEBHOOK_TOKEN, N8N_CALLBACK_SECRET)
       lib/n8n-quote.ts:10  N8N_QUOTE_WEBHOOK_URL is not in the contract (N8N_WEBHOOK_BASE_URL + event path, N8N_WEBHOOK_TOKEN, N8N_CALLBACK_SECRET)
       lib/n8n-quote.ts:12  N8N_QUOTE_CALLBACK_SECRET is not in the contract (N8N_WEBHOOK_BASE_URL + event path, N8N_WEBHOOK_TOKEN, N8N_CALLBACK_SECRET)
       lib/n8n-quote.ts:13  N8N_QUOTE_WEBHOOK_URL is not in the contract (N8N_WEBHOOK_BASE_URL + event path, N8N_WEBHOOK_TOKEN, N8N_CALLBACK_SECRET)
       lib/n8n-quote.ts:13  N8N_QUOTE_CALLBACK_SECRET is not in the contract (N8N_WEBHOOK_BASE_URL + event path, N8N_WEBHOOK_TOKEN, N8N_CALLBACK_SECRET)
       lib/n8n-quote.ts:42  N8N_QUOTE_CALLBACK_SECRET is not in the contract (N8N_WEBHOOK_BASE_URL + event path, N8N_WEBHOOK_TOKEN, N8N_CALLBACK_SECRET)
       lib/n8n-quote.ts:44  N8N_QUOTE_CALLBACK_SECRET is not in the contract (N8N_WEBHOOK_BASE_URL + event path, N8N_WEBHOOK_TOKEN, N8N_CALLBACK_SECRET)
C7   FAIL fetch() to n8n sends x-n8n-token and idempotency-key
       lib/n8n-quote.ts:19  fetch() to n8n without header(s): x-n8n-token, idempotency-key
C8   FAIL webhook body is an envelope {version, event, data}
       lib/n8n-quote.ts:19  webhook body "JSON.stringify({" is not a {version, event, data} envelope (whole record sent?)
C9   PASS Server Actions call n8n only inside after()
C10  FAIL callback route reads raw text and parses JSON only after the signature check
       app/api/quotes/[id]/callback/route.ts:19  request.json() in the callback route - re-serialisation breaks the signature; use request.text()
       app/api/quotes/[id]/callback/route.ts:1  callback route does not read the raw body with request.text()
C11  FAIL callback signature compared with crypto.timingSafeEqual, not ===
       app/api/quotes/[id]/callback/route.ts:1  callback is not verified with the HMAC x-n8n-signature (a shared secret / bearer token is not the contract)
C12  FAIL callback route checks x-n8n-timestamp window and idempotency-key
       app/api/quotes/[id]/callback/route.ts:1  x-n8n-timestamp is not checked (replay window 300 s)
       app/api/quotes/[id]/callback/route.ts:1  idempotency-key is not used - n8n retries will be applied twice
C13  PASS no export const runtime = "edge"
C14  FAIL no bodies, secrets or personal data in logs of n8n code
       lib/n8n-quote.ts:37  console.error logs "error" - body, secret, record or whole error object (stack, URL); log ids, status, error.name

14 checks: 5 PASS, 9 FAIL, 0 N/A
exit=1
  ```
- Журнал мока (форма → колбек → `/quotes/<id>`):
  ```
[mock-n8n] … header auth: x-n8n-token required (N8N_WEBHOOK_TOKEN is set)
[mock-n8n] … callbacks: signed, sent to the request's callbackUrl after 5000 ms (async modes)
[mock-n8n] 2026-09-27T20:55:48.673Z POST /webhook/quote-request -> 403 in 2 ms auth=missing | headers: accept,accept-language,content-type,user-agent | body 331 B sha256=f31e281b…
  ```
  Колбека немає: воркфлоу не запустився (Header Auth → 403).
- Час від «Надіслати» до відповіді форми: **135 мс** (POST `/quotes/new`, Resource Timing у браузері), далі redirect на `/quotes/<id>`
- Що показала `/quotes/<id>`: «Помилка — Не вдалося підготувати кошторис.»
- Журнал сервера: `Failed to start quote workflow for q_1d45c48b-… Error: n8n responded 403` + стек (об'єкт помилки
  цілком, C14). Email, назв компаній, тіл, токенів немає (0 збігів).
- **Додатково, поза однаковим сценарієм** (щоб побачити колбек): мок без `N8N_WEBHOOK_TOKEN`, з тим самим секретом —
  `POST /webhook/quote-request -> 202 auth=none idempotency=absent`, потім
  `callback POST http://127.0.0.1:3000/api/quotes/q_38becfde-…/callback -> 401 in 40 ms (try 1/3)`: застосунок чекає
  `Authorization: Bearer`, а n8n за контрактом підписує HMAC → кошторис назавжди лишився «Готуємо кошторис».

## B — зі скілом

- Які скіли бачив агент (окремий запуск `/context`): `| integrating-n8n-webhooks | Project | ~320 |` + ті самі Built-in
- **Чи викликав агент скіл:** так — **першою ж дією** після запиту `(called Skill)`, далі в журналі
  «Base directory for this skill: C:\Course\leaddesk-ab-b\.claude\skills\integrating-n8n-webhooks» і текст `SKILL.md`.
  Далі — за його ж проміжним повідомленням «I'm reading the skill contract and the project» — читав контракт (Bash), запускав `scripts/check-contract.mjs`
  («Lint, build and contract check pass (14/14)»), мок зі скіла і `scripts/send-signed-callback.mjs` (13/13).
- Що зробив агент: `/quotes/new` + `requestQuote` (валідація → `db.insertQuote` зі статусом `queued`,
  `idempotencyKey`, `correlationId` → `after(callN8nWebhook(...))` → `{ status: "ok", id }`), `lib/n8n/client.ts` за
  шаблоном скіла (`server-only`, `x-n8n-token`, `idempotency-key`, `x-correlation-id`, конверт, таймаут 10 с,
  2 повтори), колбек `app/api/n8n/[event]/route.ts` у порядку скіла (404/415 → `text()` → 413 → вікно 300 с → HMAC +
  `timingSafeEqual` → застовпити ключ → `JSON.parse` → ключ = `jobId:event` → стан до відповіді → 202), `/quotes/[id]`
  з автооновленням, `docs/n8n-integrations.md` з налаштуваннями n8n словами. Email у n8n **не** передає.
- Запитання агента: немає. Фінальна відповідь (скорочено): «Готово… `check-contract.mjs` на моїх змінах дає 14/14 PASS…
  Усі 13 випадків тестових колбеків дали очікувані коди… Проблема в існуючому коді: виклик n8n у формі лідів
  (`app/actions.ts`) порушує контракт… Я його не чіпав, щоб не розширювати задачу, і створив окрему задачу-підказку».
  Питання до людини: підтвердити, що воркфлоу відповідає `202 {job_id}`; вписати відповідального в реєстр.
- Змінені файли (`git diff --cached --stat base`): 12 файлів, +642 — `.env.example`, `app/api/n8n/[event]/route.ts`,
  `app/quotes/[id]/page.tsx`, `app/quotes/actions.ts`, `app/quotes/new/page.tsx`, `components/quote-auto-refresh.tsx`,
  `components/quote-form.tsx`, `docs/n8n-integrations.md`, `lib/db.ts`, `lib/n8n/client.ts`, `lib/quote-form.ts`,
  `lib/types.ts`; діф: `docs/ab/b-with-skill.diff`
- Змінні середовища, які додав агент: `N8N_WEBHOOK_BASE_URL`, `N8N_WEBHOOK_TOKEN`, `N8N_CALLBACK_SECRET`, `APP_BASE_URL`
- `check-contract.mjs --root ../leaddesk-ab-b --changed-since base` — лише код прогону, код виходу 0:
  ```
check-contract: C:Courseleaddesk-ab-b
scope: changed since base (12 changed file(s)); 10 finding(s) in unchanged code not shown
C1   PASS no test webhook URL (/webhook-test/) in code or .env.example
C2   PASS no NEXT_PUBLIC_ prefix on N8N_* variables
C3   PASS n8n is called only from lib/n8n/client.ts
C4   PASS lib/n8n/client.ts exists and starts with import "server-only"
C5   PASS every fetch() to n8n has signal: AbortSignal.timeout(...)
C6   PASS only contract N8N_* variables
C7   PASS fetch() to n8n sends x-n8n-token and idempotency-key
C8   PASS webhook body is an envelope {version, event, data}
C9   PASS Server Actions call n8n only inside after()
C10  PASS callback route reads raw text and parses JSON only after the signature check
C11  PASS callback signature compared with crypto.timingSafeEqual, not ===
C12  PASS callback route checks x-n8n-timestamp window and idempotency-key
C13  PASS no export const runtime = "edge"
C14  PASS no bodies, secrets or personal data in logs of n8n code

14 checks: 14 PASS, 0 FAIL, 0 N/A
exit=0
  ```
- Журнал мока (форма → колбек → `/quotes/<id>`):
  ```
[mock-n8n] 2026-09-27T20:58:40.292Z POST /webhook/quote-request -> 202 in 2 ms auth=ok idempotency=new | headers: accept,accept-language,cache-control,content-type,idempotency-key,pragma,user-agent,x-correlation-id,x-n8n-token | body 308 B sha256=d3da3169…
[mock-n8n] 2026-09-27T20:58:40.319Z workflow a0259342-… running for 5000 ms, then callback event=quote-request.completed
[mock-n8n] 2026-09-27T20:58:45.489Z callback POST http://127.0.0.1:3000/api/n8n/quote-request -> 202 in 156 ms (try 1/3) event=quote-request.completed body 382 B sha256=21de9c81…
  ```
- Час від «Надіслати» до відповіді форми: **178 мс** (POST `/quotes/new`), далі перехід на `/quotes/<id>`
- Що показала `/quotes/<id>`: одразу «Запит прийнято», через ~5 с (автооновлення) — «Кошторис готовий» і «Завантажити PDF»
- Журнал сервера: лише `db:` лічильники й рядки
  `n8n.out event=quote-request attempt=1 status=202 ms=80 correlation=9f6227dd-…`,
  `n8n.callback event=quote-request.completed quote=q_12ad82e3-… status=202 bytes=382 correlation=9f6227dd-…`.
  Тіл, email, назв компаній, токенів, підписів немає (0 збігів).

## Порівняння

| Що дивимось | A — без скіла | B — зі скілом |
|---|---|---|
| Скіл викликано | — (скіла немає) | так, першою дією (`Skill`), потім `references/` і `scripts/` |
| `check-contract.mjs --changed-since base`: FAIL (id) | **9 FAIL**: C3, C4, C6, C7, C8, C10, C11, C12, C14 | **0 FAIL** (14 PASS) |
| URL вебхука: `/webhook/` чи `/webhook-test/` | `/webhook/quote-request` (окрема змінна на подію) | `/webhook/quote-request` (`N8N_WEBHOOK_BASE_URL` + подія) |
| `auth=` / `idempotency=` у журналі мока | `auth=missing` → 403; `idempotency` — заголовка немає | `auth=ok`, `idempotency=new` |
| Колбек дійшов; код відповіді застосунку | ні — воркфлоу не стартував (403); без Header Auth колбек → **401** (чекає Bearer, а не HMAC) | так, **202** |
| Час відповіді форми | 135 мс | 178 мс |
| Тіла чи персональні дані в журналі сервера | немає; але пише об'єкт помилки зі стеком (C14) | немає |
| Персональні дані в n8n | так — `email` клієнта в тілі вебхука | ні — `quoteId`, компанія, опис, бюджет |
| Змінених файлів | 9 (+464) | 12 (+642) |
| Запитання агента | немає | немає (питання до людини — в кінці відповіді) |

Обидва прогони правильно не чекають 40–90 с воркфлоу (`after()` + колбек) — це агент знає й без скіла. Різниця — у
контракті з n8n клієнта: без скіла інтеграція **не працює** проти воркфлоу, налаштованого за записою команди (403 на
старті, 401 на колбеку), зі скілом — працює з першого запуску.

## Що змінилось у скілі після прогонів

- `8ebc86e` — **`check-contract.mjs` бачив n8n-код лише під «контрактними» іменами.** Прогін A назвав змінну
  `N8N_QUOTE_WEBHOOK_URL`, клав виклик у `lib/n8n-quote.ts`, а колбек — у `app/api/quotes/[id]/callback`. Перша версія
  скрипта шукала лише `N8N_WEBHOOK_*` і `app/api/n8n/**`, тож на прогоні A показала `10 PASS, 1 FAIL (C6), 3 N/A` —
  PASS/N/A для коду, якого не бачила. Тепер: будь-яка змінна `N8N_*WEBHOOK*`/`N8N_*URL*`, будь-який POST-роут, що
  згадує n8n, хелпери, які роут імпортує, і модулі-виклики, які імпортує Server Action; C11 вимагає HMAC
  `x-n8n-signature` (Bearer-секрет — не контракт). Результат: A — `5 PASS, 9 FAIL`; B — як і було, 14/14; `main` —
  як і було, 9 FAIL. Урок: статична перевірка, яка «не бачить» порушення, дає PASS — потрібні N/A-діагностика й
  перевірка на коді, написаному не за шаблоном.

## Перенесення прогону B у гілку (фіча)

- Як переносили: `git apply --3way docs/ab/b-with-skill.diff` у корені робочого репозиторію; усі 12 файлів після
  цього побайтово збігаються з `../leaddesk-ab-b` (`diff -q --strip-trailing-cr`). Коміти: `b4a91e1` (діфи A/B),
  `438d5c2` (код прогону B без змін).
- Що довелось доробити руками після перенесення (і чому скіл цього не дав):
  - `325088d` — старий виклик `lead-created` у `submitLead` (`app/actions.ts`) переведено на `callN8nWebhook` в `after()`
    з конвертом і мінімальними даними (`leadId, company, source, budget`), з `.env.example` прибрано
    `N8N_WEBHOOK_URL=…/webhook-test/lead-created`. Агент B це помітив, але свідомо не чіпав — «щоб не розширювати
    задачу» — і лишив задачу-підказку: скіл каже, як писати нове, але не велить виправляти старе поза запитом.
  - `4b5b5a5` — рядок `lead-created` у `docs/n8n-integrations.md` (рядок `quote-request` агент B додав сам).
  - `.env.local` (не в git): ключі контракту з новими згенерованими секретами; старий `N8N_WEBHOOK_URL` прибрано.
- Ключі контракту в `.env.example`: `N8N_WEBHOOK_BASE_URL=http://127.0.0.1:5678/webhook`,
  `N8N_WEBHOOK_TOKEN=change-me-webhook-token`, `N8N_CALLBACK_SECRET=change-me-callback-secret`,
  `APP_BASE_URL=http://127.0.0.1:3000`; адрес `/webhook-test/` немає.
- `npm run lint`, `npm run build` на гілці: без помилок (`✓ Compiled successfully`, маршрути `/quotes/new`,
  `/quotes/[id]`, `/api/n8n/[event]`).
- `check-contract.mjs` на фінальному коді (увесь проєкт, без `--changed-since`), код виходу 0:
  ```
check-contract: C:Course6-quitcode-04-agent-skills-hw
C1   PASS no test webhook URL (/webhook-test/) in code or .env.example
C2   PASS no NEXT_PUBLIC_ prefix on N8N_* variables
C3   PASS n8n is called only from lib/n8n/client.ts
C4   PASS lib/n8n/client.ts exists and starts with import "server-only"
C5   PASS every fetch() to n8n has signal: AbortSignal.timeout(...)
C6   PASS only contract N8N_* variables
C7   PASS fetch() to n8n sends x-n8n-token and idempotency-key
C8   PASS webhook body is an envelope {version, event, data}
C9   PASS Server Actions call n8n only inside after()
C10  PASS callback route reads raw text and parses JSON only after the signature check
C11  PASS callback signature compared with crypto.timingSafeEqual, not ===
C12  PASS callback route checks x-n8n-timestamp window and idempotency-key
C13  PASS no export const runtime = "edge"
C14  PASS no bodies, secrets or personal data in logs of n8n code

14 checks: 14 PASS, 0 FAIL, 0 N/A
exit=0
  ```
- Сценарій «форма → колбек → `/quotes/<id>`» ще раз, уже на гілці (`npm start` +
  `node --env-file=.env.local tools/mock-n8n.mjs --mode respond-202 --delay 5000`): форма відповіла за **191 мс**;
  мок — `POST /webhook/quote-request -> 202 … auth=ok idempotency=new`, потім
  `callback POST http://127.0.0.1:3000/api/n8n/quote-request -> 202 in 180 ms (try 1/3)`; сторінка —
  «Запит прийнято» → «Кошторис готовий». Публічна форма ліда: `POST /webhook/lead-created -> 202 … auth=ok
  idempotency=new | … body 123 B` (було `POST /webhook-test/lead-created -> 404 … body 922 B`). Журнал сервера —
  лише `n8n.out` / `n8n.callback` з id і статусами, 0 збігів email / імен / опису.
- Рядок у `docs/n8n-integrations.md`: `quote-request` (додав агент B) і `lead-created` (`4b5b5a5`); власник — TODO.

## Висновок

Скіл змінив результат по суті: той самий агент, модель і effort без скіла зробив асинхронну, акуратну, але
**несумісну з n8n клієнта** інтеграцію (403 на запуску, 401 на колбеку, email у n8n, 9 FAIL контракту), а зі скілом —
робочу з першого разу (202 → підписаний колбек 202 → «Кошторис готовий», 0 FAIL), ще й перевірену скриптами самого
скіла. Без скіла агент узяв лише загальні знання (after(), таймаут, Bearer-секрет), контракту команди він вивести не
міг. Після прогону B руками довелось лише виправити старий виклик `lead-created` поза запитом. У скілі вже виправлено
`check-contract.mjs` (`8ebc86e`); варто ще додати в `SKILL.md` правило «бачиш старий код n8n поза контрактом —
виправ або явно зупинись і спитай», щоб він не лишався на людину.
