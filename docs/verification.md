# Перевірка (Task A–C, бонус E3)

> Сюди — лише те, що справді сталося: цитати, числа, імена файлів, SHA комітів.
> Прогони A/B і фіча «запит на кошторис» — в окремому звіті `docs/ab-validation.md` (Task D).

- **Інструмент і версія, модель:** Claude Code (десктоп-застосунок, вкладка Code) · Opus 5.5; CLI `claude` 2.1.252 — для перевірки `/context`
- **ОС і термінал, Node:** Windows 11 Pro 10.0.26200 · Git Bash · Node 24.20.0

## Скіли видно у свіжій сесії

- Як перевіряли: `MSYS_NO_PATHCONV=1 claude -p "/context"` з кореня репозиторію, після коміту скіла (`a074d2f`).
  Розділ Skills у виводі: `| vercel-react-best-practices | Project | ~120 |`, решта — `Built-in`.

| Skill | Звідки (Project / Personal / вбудований) | Примітка |
|---|---|---|
| `vercel-react-best-practices` | Project | `.claude/skills/vercel-react-best-practices/`, 75 файлів, закріплено тегом `agent-skills-063bee9…` |
| `building-client-form` | | Task B |
| `integrating-n8n-webhooks` | | Task C |

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

- Запит у свіжій сесії (скіл не названо):
  > <запит>
- Чи спрацював скіл і як це видно: <виклик `Skill` з `building-client-form` / читання `SKILL.md` / ні>
- Якщо не з першого разу — що змінили в `description`, і результат другої спроби: <…>
- Що зроблено (файли): <…>
- Пункти Verify зі скіла — результат кожного: <…>

## Task C — `integrating-n8n-webhooks`

Тут скіл лише пакують. Застосовує його агент у прогоні **B** (Task D) — доказ спрацювання, журнал
мока й час відповіді форми — у `docs/ab-validation.md`.

- Що лишили в `SKILL.md`, а що винесли в `references/` (і чому): <…>
- Правила зупинки — перелік: <…>
- SHA коміту зі скілом (BASE для Task D): <…>
- Що скіл змінив у собі після прогонів (коміти й чому): <… або «нічого»>

**`check-contract.mjs` на коді `main`** (id + PASS/FAIL, код виходу):

```
<вивід>
```

**За бажанням: що скрипт побачив на навмисно поганому коді** (яку перевірку ламали, що вона
сказала). До рубрики це не входить, але бали знімає скрипт, який завжди PASS:

```
<вивід>
```

**`check-contract.mjs` на фінальному коді** (після перенесення прогону B — 0 FAIL):

```
<вивід>
```

**Додатково (за бажанням):** матриця колбеків (`send-signed-callback.mjs`): випадок → очікуваний код → отриманий код.

## Task E3 (бонус) — ті самі скіли в Cursor

- Версія Cursor, модель: <…>
- Які скіли Cursor побачив: <…>
- Ті самі запити, що в Task B, і запит із `materials/ab-task.md`: спрацювали скіли чи ні: <…>
- Чим поведінка відрізнялась від Claude Code: <…>
