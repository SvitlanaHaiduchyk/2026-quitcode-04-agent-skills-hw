# Рев'ю стороннього скіла: `vercel-react-best-practices`

> Рев'ю робили **до** встановлення. Файли скіла читали як дані: нічого з них не виконували, теку
> скіла не відкривали як проєкт в агенті.

**Дата, інструмент, ОС:** 27.09.2026 · Claude Code (десктоп, Opus 5.5) · Windows 11 Pro + Git Bash · Node 24.20.0

## Що рев'юємо

| | |
|---|---|
| Репозиторій | https://github.com/vercel-labs/agent-skills |
| Тека в репозиторії → `name` | `skills/react-best-practices` → `name: vercel-react-best-practices` |
| Версія | тег `agent-skills-063bee94c3f4df8453406c830b0a7df0f2860278` (коміт `063bee94c3f4df8453406c830b0a7df0f2860278`, 2026-08-28) |
| Навіщо нам | клієнт скаржиться на повільний дашборд (>2 с) і форму, яка «думає»; експерта з продуктивності React у команді немає |

## 1. Подивитись, не встановлюючи

- Як дивились: `DISABLE_TELEMETRY=1 npx skills@1.7.0 add "vercel-labs/agent-skills#agent-skills-063bee9…" --list`
  (показує 9 скілів репозиторію, серед них `vercel-react-best-practices`) + неглибокий клон тега поза
  репозиторієм: `git clone --depth 1 --branch agent-skills-063bee9… … ../review-agent-skills`.
- Склад скіла (76 файлів у клоні, ~238 КБ):

  | Файл / тека | Розмір | Що це |
  |---|---|---|
  | `SKILL.md` | 7,4 КБ | frontmatter + індекс 70 правил за 8 категоріями (`async-`, `bundle-`, `server-`, `client-`, `rerender-`, `rendering-`, `js-`, `advanced-`) |
  | `AGENTS.md` | 112 КБ | усі правила, зібрані в один документ |
  | `README.md` | 3,5 КБ | опис для людей: як додавати правила |
  | `rules/*.md` | 72 файли, ~115 КБ | по одному правилу на файл (+ `_sections.md`, `_template.md`) |
  | `metadata.json` | 0,9 КБ | версія, автор, список посилань; CLI його не копіює |

- Frontmatter `SKILL.md`: `name`, `description`, `license: MIT`, `metadata` (`author: vercel`, `version: "1.0.0"`).
  Полів `allowed-tools`, `hooks`, `context` немає.

## 2. Що скіл може виконати, завантажити чи змінити

| Перевірка | Результат | Як перевіряли |
|---|---|---|
| `scripts/` та інші виконувані файли (`.sh`, `.mjs`, `.py`…) | немає; єдиний не-markdown файл — `metadata.json` (дані) | `find "$S" -type f ! -name "*.md"` |
| `allowed-tools` — попередній дозвіл на інструменти | немає | `awk '/^---$/{n++; next} n==1' "$S/SKILL.md"` |
| Команди під час рендеру `` !`cmd` `` | немає (0 збігів) | `grep -rn '!\`' "$S"` |
| Хуки, MCP-сервери, `plugin.json`, вимога API-ключів | немає | `find "$S" -name "*hooks*.json" -o -name "*mcp*.json" -o -name "plugin.json" -o -name "settings*.json"` — порожньо |
| Інструкції агенту щось завантажити чи виконати (`npx`, `curl`, «завантаж правила з URL») | 2 збіги, обидва — приклад у правилі `rendering-svg-precision`: `npx svgo --precision=1 --multipass icon.svg` (порада розробнику оптимізувати SVG, не інструкція агенту). `curl`/`wget`/`WebFetch` — немає | `grep -rnE "npx \|curl \|wget \|Invoke-WebRequest\|WebFetch" "$S"` |
| Посилання: куди ведуть, чи є «прочитай інструкції звідси» | 34 унікальні URL: react.dev, nextjs.org, vercel.com (блог/документація), MDN, webpack, vite, esbuild, npm, GitHub (`isaacs/node-lru-cache`, `shuding/better-all`), gist, jsfiddle, `*.example.com` у прикладах. Жодне не подане як «завантаж і виконай» чи «прочитай інструкції звідси» — це довідкові посилання | `grep -rhoE "https?://…" "$S" \| sort -u` |
| Приховані інструкції: HTML-коментарі, «ignore previous…», невидимі символи, base64 | немає: 0 збігів на `ignore previous`/`system prompt`/`<!--`; 0 файлів із символами нульової ширини; довгих base64-рядків (60+ символів) немає | `grep -rniE …`, node-скрипт із шаблону, `grep -rnE "[A-Za-z0-9+/]{60,}"` |

## 3. Аудити

| Аудит | Результат | Дата аналізу |
|---|---|---|
| Gen (Agent Trust Hub) | Pass · SAFE; відзначено лише «indirect prompt injection surface» — скіл обробляє код користувача (стандартний ризик для скілів, що працюють із кодом) | 14.09.2026 |
| Socket | Pass · істотних проблем не знайдено (malicious behavior, security concerns, obfuscation, suspicious patterns — чисто) | 14.09.2026 |
| Snyk | Pass · LOW · «No issues detected» | 14.09.2026 |

- Де взяли: skills.sh — https://skills.sh/vercel-labs/agent-skills/vercel-react-best-practices і сторінки
  `/security/agent-trust-hub`, `/security/socket`, `/security/snyk` (747,5K встановлень, 31,6K зірок, First Seen 19.01.2026).
- Чому CLI не показав блок: команди запускали з `DISABLE_TELEMETRY=1`, тож CLI не завантажує аудити;
  крім того, запуск ішов з агентської сесії, де CLI сам вмикає `--yes`. Тому аудити прочитали на
  skills.sh **до** встановлення.
- До чого прив'язаний аудит: **не до нашого тега.** Сторінки аудитів прив'язані до пари
  «репозиторій + назва скіла»; Socket посилається на хеш вмісту `@ca7b0c0c…2506212`, а не на
  коміт `063bee9`. Аналіз датований 14.09.2026, а наш тег — 28.08.2026, тобто аудитували, найімовірніше,
  новіший стан `main`. Тому аудит — додатковий сигнал, а не заміна власного рев'ю (розділ 2).

## 4. Ліцензія й походження

- Ліцензія: MIT — заявлена у frontmatter `SKILL.md` (`license: MIT`) і в розділі «License» у
  `README.md` репозиторію. Окремого файлу `LICENSE` у корені клону тега немає.
- Видавець і активність: організація `vercel-labs` (Vercel); автор у `metadata` — `vercel` /
  «Vercel Engineering». Останній коміт тега — 28.08.2026 (Aurora Scharff). На skills.sh — 747,5K
  встановлень, 31,6K зірок; у репозиторії 9 скілів.

## 5. Чи правдивий зміст для нашого стеку

Next.js 16.3.5, React 19.2. Звіряли з `node_modules/next/dist/docs/`.

| Порада скіла (id) | Що каже скіл | Що каже документація нашої версії | Висновок |
|---|---|---|---|
| `async-parallel` | незалежні `await` підряд — водоспад; запускати разом через `Promise.all()` | `01-getting-started/06-fetching-data.md` → «Parallel data fetching»: layout і page рендеряться паралельно, але «within any component» послідовні `await` блокують один одного; приклад — ініціювати запити, потім `Promise.all` | **Правдиво, застосовано** у `app/dashboard/page.tsx`: TTFB 2,30 → 1,48 с |
| `server-cache-react` | `React.cache()` для дедуплікації в межах запиту; ключ порівнюється через `Object.is`, тож inline-об'єкт в аргументі ніколи не дає cache hit | `02-guides/caching-without-cache-components.md` → «Deduplicating requests»: якщо дані йдуть не через `fetch`, а з БД напряму — обгорнути доступ у React `cache` «to deduplicate requests within a single render pass». `'use cache'` потребує `cacheComponents`, якого в нашому `next.config.ts` немає, — тож саме `React.cache` | **Правдиво, застосовано**: `getWorkspace({ slug })` → `getWorkspace(slug)`, `getCurrentUser` у `cache()`; `db:getUserBySession`/`db:getWorkspace` 3 → 1 за запит. TTFB не змінився — layout, header і page і так чекали паралельно |
| `server-serialization` | через межу RSC серіалізуються всі поля об'єкта; передавати в Client Component лише ті, що він використовує | `02-guides/data-security.md`: data access layer має повертати «safe, minimal Data Transfer Objects», «only return the data relevant for this query and not everything» | **Правдиво, застосовано** до `LeadsTable`: HTML 424 592 → 111 377 Б; `internalNotes`/`rawPayload`/`ipAddress` більше не доходять до браузера |
| `bundle-barrel-imports` | імпортувати напряму або додати пакети в `experimental.optimizePackageImports` | `03-api-reference/05-config/01-next-config-js/optimizePackageImports.md`: `recharts` і `lodash-es` **вже** в списку, що оптимізується за замовчуванням; `lodash` (CommonJS) — ні | **Для нашої версії здебільшого не потрібно**: додавати `recharts` у конфіг — зайве. Для `lodash` доречніше прямий імпорт `lodash/debounce`, а не конфіг. Не застосовували |

## 6. Закріплення версії й коміт

- Команда встановлення:
  ```bash
  DISABLE_TELEMETRY=1 npx skills@1.7.0 add "vercel-labs/agent-skills#agent-skills-063bee94c3f4df8453406c830b0a7df0f2860278" \
    --skill vercel-react-best-practices -a claude-code --copy
  ```
- Де лягли файли; справжні файли чи посилання: `.claude/skills/vercel-react-best-practices/`, справжні
  файли (`--copy`), 75 штук. Теки `.agents/` немає. `diff -r` з клоном тега: відрізняється лише
  відсутній `metadata.json`.
- Що потрапило в git: `.claude/skills/vercel-react-best-practices/` (75 файлів) і `skills-lock.json`
  (`ref: agent-skills-063bee9…`, `computedHash: 6b526d01…`).
- Як оновлювати: та сама команда з новим тегом → `git diff .claude/skills/vercel-react-best-practices skills-lock.json`
  → рев'ю змін за цим чеклістом (розділи 2–5) → окремий коміт.

## Вердикт

**Встановити з умовами.** Ризик низький: у скілі лише markdown-документація — немає скриптів,
`allowed-tools`, хуків, MCP, команд під час рендеру чи прихованих інструкцій; єдиний `npx` —
приклад для розробника. Умови: версія закріплена тегом і копією файлів у git; кожну пораду перед
застосуванням звіряємо з документацією Next.js 16.3.5 у `node_modules/next/dist/docs/`; оновлення —
лише через повторне рев'ю diff.
