# Перевірка (Task A–C, бонус E3)

> Сюди — лише те, що справді сталося: цитати, числа, імена файлів, SHA комітів.
> Прогони A/B і фіча «запит на кошторис» — в окремому звіті `docs/ab-validation.md` (Task D).

- **Інструмент і версія, модель:** Claude Code (десктоп-застосунок, вкладка Code) · Opus 5.5; CLI `claude` 2.1.252 — для перевірки `/context`
- **ОС і термінал, Node:** Windows 11 Pro 10.0.26200 · Git Bash · Node 24.20.0

## Скіли видно у свіжій сесії

- Як перевіряли: `MSYS_NO_PATHCONV=1 claude -p "/context"` з кореня репозиторію — після коміту скіла Vercel (`a074d2f`) і ще раз після BASE (`fdff42b`): `| building-client-form | Project | ~300 |`, `| integrating-n8n-webhooks | Project | ~320 |`, `| vercel-react-best-practices | Project | ~120 |`.
  Розділ Skills у виводі: `| vercel-react-best-practices | Project | ~120 |`, решта — `Built-in`.

| Skill | Звідки (Project / Personal / вбудований) | Примітка |
|---|---|---|
| `vercel-react-best-practices` | Project | `.claude/skills/vercel-react-best-practices/`, 75 файлів, закріплено тегом `agent-skills-063bee9…` |
| `building-client-form` | Project | `.claude/skills/building-client-form/`; у свіжій сесії завантажений з цієї теки (див. Task B) |
| `integrating-n8n-webhooks` | Project | `.claude/skills/integrating-n8n-webhooks/`; спрацювання перевіряється в прогоні B (Task D) |

- Особисті скіли, які теж видно (`~/.claude/skills/`…), і чи можуть вони вплинути на перевірки: немає —
  `~/.claude/skills/` не існує; у `/context` крім Project видно лише Built-in скіли Claude Code.

## Task A — виправлення за скілом Vercel

Рев'ю зроблено за правилами скіла (`rules/*.md`) у поточній сесії агента. Окрему свіжу сесію
`claude -p` з запитом із walkthrough запустити не вдалось: CLI на цій машині не залогінений
(`Not logged in · Please run /login`). Знахідки:

| файл:рядок (на `main`) | id правила | що не так | виправлення для Next.js 16 | статус |
|---|---|---|---|---|
| `app/dashboard/page.tsx:16-18` | `async-parallel` | `getLeads` → `getLeadStats` → `getSourceBreakdown` послідовно (400 + 1200 + 400 мс) | `Promise.all` | ✅ `47651a3` |
| `lib/data.ts:18`, виклики в `layout.tsx:7`, `page.tsx:15`, `dashboard-header.tsx:6`, `leads/[id]/page.tsx:14` | `server-cache-react` | `getWorkspace({ slug })` — inline-об'єкт, `React.cache` ніколи не влучає; `getCurrentUser` без `cache` — 3 виклики на сторінку | аргумент-рядок; `cache()` для `getCurrentUser` | ✅ `c1d293c` |
| `app/dashboard/page.tsx:32` → `components/leads-table.tsx:12` | `server-serialization` | у Client Component іде весь `Lead` (з `internalNotes`, `rawPayload`, `ipAddress`, `userAgent`), таблиця використовує 5 полів | передавати `Pick<Lead, …>` | ✅ `54fee2d` |
| `components/leads-toolbar.tsx:4`, `sources-chart.tsx:3` | `bundle-dynamic-imports` / `bundle-conditional` | `exceljs` і `recharts` у клієнтському бандлі одразу, хоча потрібні лише після кліку | `await import("exceljs")` у `handleExport`; `next/dynamic` для `SourcesChart` | не робили |
| `components/lead-search.tsx:21`, `leads-toolbar.tsx:26` | `client-swr-dedup` | `/api/leads` тягнеться окремо з клієнта, хоча ті ж ліди вже є на сервері | передати рядки для пошуку пропсом або дедуплікувати запит | не робили |
| `components/lead-search.tsx:43-45` | `rerender-derived-state-no-effect` | `filtered` — похідний стан через `useEffect` + `setState` | обчислювати під час рендеру (з `useDeferredValue` замість debounce) | не робили |
| `app/actions.ts:63` | `server-after-nonblocking` | `logAudit` (250 мс) блокує відповідь форми | `after(() => logAudit(…))` з `next/server` | не робили — форму й виклик n8n чіпаємо в Task D |

**Як міряли (для всіх виправлень — один і той самий скрипт):** продакшн-збірка
(`npm run build && npm start -- -p 3001` — порт 3000 зайнятий іншим, не моїм процесом LeadDesk, тож
усі заміри на `:3001`); cookie `leaddesk_session=demo-u_olena`; 1 прогрівальний `curl`, потім 3 прогони
`curl -w "TTFB %{time_starttransfer}s, total %{time_total}s"`; `curl … | wc -c` для HTML і для
`-H "RSC: 1"`; лічильники `db:<запит>` — різниця в журналі `npm start` до і після одного `curl`.

| Правило (id) | Коміт | Файли | Що змінилось | Було (`main`) | Стало | Як міряли |
|---|---|---|---|---|---|---|
| `async-parallel` | `47651a3` | `app/dashboard/page.tsx` | три незалежні запити дашборда — через `Promise.all` | TTFB 2,283 / 2,318 / 2,315 с | TTFB 1,480 / 1,503 / 1,463 с | `curl`, 3 прогони |
| `server-cache-react` | `c1d293c` | `lib/data.ts`, `app/dashboard/layout.tsx`, `app/dashboard/page.tsx`, `app/dashboard/leads/[id]/page.tsx`, `components/dashboard-header.tsx` | `getWorkspace(slug)` замість `getWorkspace({ slug })`; `getCurrentUser = cache(…)` | `db:getUserBySession` 3, `db:getWorkspace` 3 за запит; TTFB ~1,48 с | 1 і 1; TTFB 1,476 / 1,471 / 1,481 с | лічильники `db:` в журналі сервера |
| `server-serialization` | `54fee2d` | `app/dashboard/page.tsx`, `components/leads-table.tsx` | у `LeadsTable` — лише `id, fullName, company, status, createdAt` | HTML 424 592 Б, RSC 315 197 Б; `internalNotes` у HTML — 172 збіги | HTML 111 377 Б, RSC 31 257 Б; `internalNotes`/`rawPayload`/`ipAddress` — 0 | `curl … \| wc -c`, `grep -o '<поле>' \| wc -l` |

- Чому обрали для заміру саме це виправлення: `async-parallel` — найпряміший зв'язок зі скаргою
  «дашборд відкривається понад 2 секунди»; затримки «бази» відомі (`lib/db.ts`: 400 + 1200 + 400 мс),
  тож очікуване покращення ~0,8 с легко перевірити, і воно збіглося. Для двох інших числа теж зняли — тим
  самим скриптом.
- Друге і третє виправлення — що і чому, як переконались, що не зламали:
  - `server-cache-react`: `React.cache` порівнює аргументи через `Object.is`, тому `getWorkspace({ slug })`
    з новим об'єктом при кожному виклику кешу не мав. Тепер кожен запит до «бази» — один раз на рендер.
    Перевірили: `/dashboard` → 200, сторінка ліда → 200, без cookie `/dashboard` → 307 на `/login`
    (`redirect` усередині `cache` працює).
  - `server-serialization`: таблиця отримує 5 полів замість 30; серед них більше немає внутрішніх нотаток,
    сирого payload та IP клієнтів — це ще й питання безпеки даних. У HTML — ті самі 172 рядки `<tr>`, код
    сортування не змінювався (лише тип пропса).
- Порада скіла, яку звірили з документацією Next.js 16 і **не** застосували — і чому:
  `bundle-barrel-imports` радить додавати пакети в `experimental.optimizePackageImports`; у Next.js 16.3.5
  `recharts` уже є в списку за замовчуванням (`optimizePackageImports.md`), тож це нічого не дасть. Деталі —
  `docs/skill-review.md`, розділ 5.
- Якщо виміряне виправлення не змінило чисел — чому: `async-parallel` змінило (−0,83 с). `server-cache-react`
  **не** змінило TTFB (1,48 → 1,48 с), хоча прибрало 4 зайві запити: layout, `DashboardHeader` і page
  рендеряться паралельно (`06-fetching-data.md`: «layouts and pages are rendered in parallel»), тож дублікати
  `getUserBySession`/`getWorkspace` по 100 мс ішли одночасно й не додавали часу. Виграш — у навантаженні на
  БД, а не в затримці.
- `npm run lint`, `npm run build` після виправлень: після кожного з трьох комітів — `eslint` без
  помилок, `✓ Compiled successfully`.

## Task B — `building-client-form`

- Скіл: `.claude/skills/building-client-form/SKILL.md` — коміт `a762ce2` (v0.1.0), виправлення `0890b82` (v0.2.0).
  Самоперевірка: `name` = тека; `description` — 877 символів (≤ 1024); `SKILL.md` — 141 рядок (< 500).
- Запит у свіжій сесії (нова сесія Claude Code у десктоп-застосунку, «Форма додавання нотатки на
  сторінці ліда»; скіл не названо):
  > На сторінці ліда в дашборді (/dashboard/leads/[id]) додай форму «Додати нотатку»: одне текстове
  > поле до 500 символів; нотатка дописується до внутрішніх нотаток ліда.
- Чи спрацював скіл і як це видно: **так, з першої спроби.** У журналі тієї сесії першою дією після
  запиту йде `(called Skill)`, а наступним повідомленням — `Base directory for this skill:
  C:\Course\2026-quitcode-04-agent-skills-hw\.claude\skills\building-client-form` і повний текст `SKILL.md`.
  Далі агент ішов за патерном: сесія → права → валідація в дії, `after()` для аудиту, в кінці —
  окремий пункт «Потребує вашого рішення: хто може додавати нотатки» (правило зупинки про ролі).
- Якщо не з першого разу — що змінили в `description`: `description` не змінювали. Але Verify знайшов
  дефект **у самому патерні скіла**: v0.1.0 радив `useActionState(addNote.bind(null, leadId), …)`.
  Відправка такої форми без JS (multipart POST з прихованими `$ACTION_REF_1`, `$ACTION_1:0`,
  `$ACTION_1:1 = ["lead_0001",{"status":"idle"}]`) у Next.js 16.3.5 / React 19.2.8 не відповідає, а
  процес `next start` іде в 100% CPU (3,12 с CPU за 3 с) і перестає відповідати на **всі** запити.
  Перевірка: мінімальний роут з `useActionState(ping.bind(null, id))` зависає так само і на статичній,
  і на динамічній сторінці; той самий роут з `<input type="hidden" name="id">` без `.bind` — `200` за
  0,03 с, сервер живий; публічна форма `/` (без `.bind`) без JS теж працює. Тобто причина — прив'язаний
  аргумент, а не код агента. У v0.2.0 (`0890b82`) скіл передає id ресурсу прихованим полем, явно
  забороняє `.bind` для форм і додає до Verify «сервер і далі відповідає». Код агента виправлено так
  само (коміт `75eee83`). Повторний прогін у новій сесії з v0.2.0 не робили.
- Що зроблено (файли, коміт `75eee83`): `lib/note-form.ts` (парсер: trim, порожня, > 500), `app/dashboard/actions.ts`
  (`addNote`: `getCurrentUser` → лід у робочому просторі користувача → парсер → `db.appendLeadNote` →
  `after(logAudit)` → `revalidatePath`; повертає лише `{ status, … }`), `components/note-form.tsx`
  (`useActionState`, `label`, `aria-invalid`, `aria-describedby`, `role="alert"` / `role="status"`, `pending`),
  `lib/db.ts` (`appendLeadNote`), `app/dashboard/leads/[id]/page.tsx` (форма + `whitespace-pre-line` для нотаток).
- Пункти Verify зі скіла — результат кожного (продакшн-збірка на `:3001`; запити без JS — `curl` із тими
  самими прихованими полями, які сервер рендерить у форму, тобто рівно те, що відправляє браузер без JS):

  | Пункт Verify | Результат |
  |---|---|
  | `npm run lint`, `npm run build` | ✅ без помилок |
  | Порожня відправка | ✅ без JS: `200`, «Напишіть текст нотатки», `aria-invalid="true"`, `aria-describedby="note-error note-hint"`, `role="alert"` «Перевірте поля: 1». З JS (браузер): те саме без перезавантаження |
  | > 500 символів (600) | ✅ «Нотатка задовга: максимум 500 символів», `aria-invalid="true"`; введене повертається (обрізане до 500) |
  | Без JS — валідна нотатка | ✅ `200`, `role="status"` «Нотатку додано.», нотатка є на сторінці; сервер після всіх перевірок відповідає `200`. На v0.1.0 (`.bind`) — ❌ сервер зависав (див. вище) |
  | З JS — валідна нотатка | ✅ «Нотатку додано.», нотатка на сторінці, поле очищене, без перезавантаження |
  | Дія без сесії | ✅ без cookie — `307 → /login` (`proxy.ts`); з вигаданою cookie `demo-u_nobody` (proxy пропускає) — `303 → /login` від самої дії; нотатки не з'явились |
  | Чужий лід (підмінене приховане `leadId`) | ✅ Olena (Studio Nova) → `lead_0182` (Brightline): «Немає доступу до цього ліда», у Marta нотатки немає |
  | Журнал сервера | ✅ 0 збігів тексту нотаток, імен, email, `FormData`; видно лише лічильники `db:appendLeadNote: 1`, `db:insertAuditEntry: 1`; аудит (250 мс) — в `after()` |

## Task C — `integrating-n8n-webhooks`

Тут скіл лише пакують. Застосовує його агент у прогоні **B** (Task D) — доказ спрацювання, журнал
мока й час відповіді форми — у `docs/ab-validation.md`.

- Що лишили в `SKILL.md`, а що винесли в `references/` (і чому): у `SKILL.md` (117 рядків, `description`
  945 символів) — лише те, що агент робить: змінні, 5 кроків виклику, виклик з `after()`, вибір режиму,
  порядок обробки колбеку одним абзацом, журнали, чекліст із 9 пунктів, правила зупинки, Verify.
  У `references/` — «чому» й деталі, які потрібні лише під час конкретного кроку: `contract.md` (таблиці
  змінних / заголовків, конверт, повтори, реєстр інтеграцій), `response-modes.md` (режими, правило 100 с,
  тестовий vs production URL, як читати журнал мока), `callback.md` (заголовки, тіло, 10 кроків і чому
  саме так), `code-templates.md` (шаблони `lib/n8n/client.ts`, виклику з `after()` і колбек-роуту),
  `logging-and-limits.md` (журнали, ліміти, пастки документації), `n8n-setup.md` (налаштування воркфлоу
  словами). Посилання з `SKILL.md` — прямі, один рівень. Правила Vercel не переписані — лише
  `server-auth-actions` і `server-after-nonblocking` за id.
- Шаблони з `code-templates.md` перевірені, а не «на око»: у тимчасовій копії проєкту поза репозиторієм
  (видалена після перевірки) блоки коду витягнуто з markdown як є → `next build` без помилок типів;
  з моком (`--mode respond-202`, токен і секрет): `POST /webhook/quote-request -> 202 auth=ok
  idempotency=new`, повтор з тим самим ключем — `idempotency=repeat`, колбек мока → роут — `202`;
  `--mode slow --cloud-timeout 300` → 3 спроби (524, 524, 524), неправильний токен → 1 спроба (403).
  Матриця `send-signed-callback.mjs` на шаблонному роуті — 13/13 очікуваних кодів (див. нижче).
- Правила зупинки — перелік: тестовий URL будь-куди, крім власного `.env.local`; секрет / токен у
  клієнтському коді, `NEXT_PUBLIC_*`, query string, журналі чи git; синхронне очікування довгого або
  невідомого за тривалістю воркфлоу; персональні дані в n8n понад мінімум; невідомі шлях / режим /
  формат колбеку воркфлоу клієнта; зміна воркфлоу, імпорт / експорт JSON, код для вузла Code; бажання
  «обійти» FAIL `check-contract.mjs`; нова залежність (`server-only` ставити не треба).
- SHA коміту зі скілом (BASE для Task D): **`fdff42b`** (`fdff42b6cee541b3347a559a24188d3f5d7f0653`) —
  «skills: add integrating-n8n-webhooks (contract, references, scripts)». У ньому — виправлення Task A,
  три скіли й форма нотаток з Task B; `/quotes` і переробленого виклику n8n ще немає.
- Що скіл змінив у собі після прогонів (коміти й чому): `8ebc86e` — `check-contract.mjs` бачив n8n-код лише під
  «контрактними» іменами (`N8N_WEBHOOK_*`, `app/api/n8n/**`); прогін A (`N8N_QUOTE_WEBHOOK_URL`, `lib/n8n-quote.ts`,
  `app/api/quotes/[id]/callback`) отримав від нього `10 PASS / 1 FAIL` за код, якого скрипт не бачив. Тепер — будь-які
  n8n-змінні, POST-роути, що згадують n8n, імпортовані хелпери; C11 вимагає HMAC. A: `5 PASS / 9 FAIL`, B: 14/14,
  `main`: 9 FAIL. `SKILL.md` і `references/` не змінювались. Деталі — `docs/ab-validation.md`.

**Знахідка з розділу 0 («журнал мока й повідомлення форми не сходяться»)**, відтворено на коді гілки
(`.env.example` → `N8N_WEBHOOK_URL=…/webhook-test/lead-created`, мок без `--listen`): форма показала
«Дякуємо! Заявку отримано.», а мок записав
`POST /webhook-test/lead-created -> 404 in 5 ms | headers: accept,accept-language,content-type,user-agent | body 922 B`.
Тобто заявка в n8n не дійшла (тестовий URL закритий), `submitLead` не дивиться на статус, без
`x-n8n-token` / `idempotency-key`, а 922 байти — це весь рядок ліда з IP, user agent і `rawPayload`.
Саме це ловлять C1, C3–C9 нижче; виправляється в Task D разом із фічею.

**`check-contract.mjs` на коді `main`** (`git archive main` → `../leaddesk-main`), код виходу 1:

```
check-contract: C:Courseeaddesk-main   (git archive main)
C1   FAIL no test webhook URL (/webhook-test/) in code or .env.example
       .env.example:6  test URL /webhook-test/ - production code uses /webhook/
C2   PASS no NEXT_PUBLIC_ prefix on N8N_* variables
C3   FAIL n8n is called only from lib/n8n/client.ts
       app/actions.ts:54  N8N_WEBHOOK_* read outside lib/n8n/client.ts
       app/actions.ts:54  fetch() to n8n outside lib/n8n/client.ts
C4   FAIL lib/n8n/client.ts exists and starts with import "server-only"
       app/actions.ts:1  n8n is used but lib/n8n/client.ts does not exist
C5   FAIL every fetch() to n8n has signal: AbortSignal.timeout(...)
       app/actions.ts:54  fetch() to n8n without AbortSignal.timeout - a hung n8n hangs the request
C6   FAIL only contract N8N_* variables
       .env.example:6  N8N_WEBHOOK_URL is not in the contract (N8N_WEBHOOK_BASE_URL + event path, N8N_WEBHOOK_TOKEN, N8N_CALLBACK_SECRET)
       app/actions.ts:54  N8N_WEBHOOK_URL is not in the contract (N8N_WEBHOOK_BASE_URL + event path, N8N_WEBHOOK_TOKEN, N8N_CALLBACK_SECRET)
C7   FAIL fetch() to n8n sends x-n8n-token and idempotency-key
       app/actions.ts:54  fetch() to n8n without header(s): x-n8n-token, idempotency-key
C8   FAIL webhook body is an envelope {version, event, data}
       app/actions.ts:54  webhook body "JSON.stringify(lead)" is not a {version, event, data} envelope (whole record sent?)
C9   FAIL Server Actions call n8n only inside after()
       app/actions.ts:54  n8n call in a Server Action outside after() - the user waits for n8n (server-after-nonblocking)
C10  N/A  callback route reads raw text and parses JSON only after the signature check
C11  N/A  callback signature compared with crypto.timingSafeEqual, not ===
C12  N/A  callback route checks x-n8n-timestamp window and idempotency-key
C13  PASS no export const runtime = "edge"
C14  FAIL no bodies, secrets or personal data in logs of n8n code
       app/actions.ts:60  console.error logs "error" - body, secret, record or whole error object (stack, URL); log ids, status, error.name

14 checks: 2 PASS, 9 FAIL, 3 N/A
exit=1
```

На робочій гілці (BASE `fdff42b`) — ті самі 9 FAIL у тих самих рядках: виправлення Task A і B n8n не
торкались.

**Що скрипт побачив на навмисно поганому коді.** Тимчасова тека поза репозиторієм з одним роутом
`app/api/n8n/[event]/route.ts`: `export const runtime = "edge"`, `await request.json()`, HMAC від
`JSON.stringify(body)`, `signature !== \`sha256=${expected}\``, `console.warn(..., signature, body)`.
Код виходу 1:

```
check-contract: <тимчасова тека bad-route: app/api/n8n/[event]/route.ts з request.json(), !==, runtime "edge">
C1   PASS no test webhook URL (/webhook-test/) in code or .env.example
C2   PASS no NEXT_PUBLIC_ prefix on N8N_* variables
C3   PASS n8n is called only from lib/n8n/client.ts
C4   N/A  lib/n8n/client.ts exists and starts with import "server-only"
C5   N/A  every fetch() to n8n has signal: AbortSignal.timeout(...)
C6   PASS only contract N8N_* variables
C7   N/A  fetch() to n8n sends x-n8n-token and idempotency-key
C8   N/A  webhook body is an envelope {version, event, data}
C9   N/A  Server Actions call n8n only inside after()
C10  FAIL callback route reads raw text and parses JSON only after the signature check
       app/api/n8n/[event]/route.ts:5  request.json() in the callback route - re-serialisation breaks the signature; use request.text()
       app/api/n8n/[event]/route.ts:1  callback route does not read the raw body with request.text()
C11  FAIL callback signature compared with crypto.timingSafeEqual, not ===
       app/api/n8n/[event]/route.ts:1  no crypto.timingSafeEqual in the callback route
       app/api/n8n/[event]/route.ts:8  signature compared with ===/!== - use lengths + crypto.timingSafeEqual
C12  FAIL callback route checks x-n8n-timestamp window and idempotency-key
       app/api/n8n/[event]/route.ts:1  x-n8n-timestamp is not checked (replay window 300 s)
       app/api/n8n/[event]/route.ts:1  idempotency-key is not used - n8n retries will be applied twice
C13  FAIL no export const runtime = "edge"
       app/api/n8n/[event]/route.ts:2  runtime "edge" - node:crypto is required and edge is deprecated in Next.js 16
C14  FAIL no bodies, secrets or personal data in logs of n8n code
       app/api/n8n/[event]/route.ts:9  console.warn logs "signature body" - body, secret, record or whole error object (stack, URL); log ids, status, error.name

14 checks: 4 PASS, 5 FAIL, 5 N/A
```

Другий поганий варіант — `request.text()` є, `timingSafeEqual` є, але `JSON.parse(raw)` **до** перевірки
підпису: `C10 FAIL app/api/n8n/[event]/route.ts:5 JSON.parse before the signature is verified`, код виходу 1.

**`--changed-since`** перевірено на тимчасовому git-репозиторії з кодом `main` (тег `base`): після
додавання шаблонних `lib/n8n/client.ts` і колбек-роуту та переведення `submitLead` на `after()` —
`scope: changed since base (4 changed file(s)); 2 finding(s) in unchanged code not shown` і
`14 PASS, 0 FAIL` (2 приховані — старий `.env.example`); прибрав `AbortSignal.timeout` у новому
клієнті — `C5 FAIL lib/n8n/client.ts:40`; додав синхронний `await callN8nWebhook(...)` у дію —
`C9 FAIL app/actions.ts:56`. Під час цих перевірок знайшов і виправив у скрипті два хибні результати:
C8 вважав `JSON.stringify(lead)` конвертом (у `rawPayload` ліда є поле `version`), а C5/C7/C8 давали N/A
на клієнті, що читає змінні через `env("N8N_WEBHOOK_BASE_URL")`.

**`check-contract.mjs` на фінальному коді** (після перенесення прогону B — 0 FAIL):

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

**Додатково:** матриця колбеків (`send-signed-callback.mjs`) на шаблонному колбек-роуті з
`code-templates.md` (тимчасова копія, `next start`):

| Випадок | Очікуваний | Отриманий |
|---|---|---|
| unknown-event (шлях `/api/n8n/no-such-event-…`) | 404 | 404 |
| wrong-content-type (`text/plain`) | 415 | 415 |
| too-large (> 64 КБ, підписане) | 413 | 413 |
| stale-timestamp (−600 с, підписане з ним) | 401 | 401 |
| future-timestamp (+600 с) | 401 | 401 |
| bad-signature (підпис іншого тіла) | 401 | 401 |
| short-signature (інша довжина — `timingSafeEqual` не падає) | 401 | 401 |
| no-signature | 401 | 401 |
| reformatted-body (тіло переформатоване після підпису) | 401 | 401 |
| key-mismatch (ключ ≠ `data.jobId:event`) | 400 | 400 |
| bad-shape (без `data.jobId`) | 400 | 400 |
| valid | 202 | 202 |
| duplicate (той самий `idempotency-key`) | 200 `{"duplicate":true}` | 200 `{"duplicate":true}` |

## Task E3 (бонус) — ті самі скіли в Cursor

- Версія Cursor, модель: <…>
- Які скіли Cursor побачив: <…>
- Ті самі запити, що в Task B, і запит із `materials/ab-task.md`: спрацювали скіли чи ні: <…>
- Чим поведінка відрізнялась від Claude Code: <…>
