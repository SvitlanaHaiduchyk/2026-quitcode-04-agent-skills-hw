# Рев'ю стороннього скіла: пакет `n8n-io/skills` (Task E1)

> Рев'ю — **без встановлення**. Файли пакета читали як дані: з неглибокого клону поза репозиторієм
> (`C:\Course\review-n8n-skills`); клон не відкривали як проєкт в агенті, нічого з нього не виконували
> (ні хуків, ні `npx`, ні плагіна). Кожен рядок — те, що перевірено, і як.

**Дата, інструмент, ОС:** 28.09.2026 · Claude Code (десктоп, Opus 5.5) · Windows 11 Pro + Git Bash · Node 24.20.0

## Що рев'юємо

| | |
|---|---|
| Репозиторій | https://github.com/n8n-io/skills |
| Тека в репозиторії → `name` | весь пакет — плагін `n8n-skills` 1.2.0: 14 скілів `skills/*-official/` (`name` = тека, напр. `skills/n8n-node-configuration-official` → `name: n8n-node-configuration-official`), `hooks/`, `.claude-plugin/`, `.codex-plugin/`, `.agents/plugins/`, `opencode/` |
| Версія | коміт `180b8415e3b73f78828cfa01e908e67f89f2a139` (`main`, 21.08.2026, «Merge pull request #39 … opencode-plugin»). Тегів у репозиторії **немає** (`gh api repos/n8n-io/skills/tags` → порожньо) — закріпити можна лише SHA |
| Навіщо нам | довідка про n8n для проєктів «Next.js поверх воркфлоу клієнта»; чи можна поставити поряд із нашим `integrating-n8n-webhooks` |

## 1. Подивитись, не встановлюючи

- Як дивились: `git clone --depth 1 https://github.com/n8n-io/skills.git ../review-n8n-skills` →
  `git -C ../review-n8n-skills rev-parse HEAD` = `180b8415…`; файли — через `find`, `cat`, `grep`, `awk`.
- Склад пакета (87 файлів):

  | Файл / тека | Розмір | Що це |
  |---|---|---|
  | `skills/*-official/` (14 тек) | 12–180 КБ кожна, разом ~760 КБ | `SKILL.md` + `references/*.md`; у двох — приклади `*.json` воркфлоу і `*.ts` |
  | `skills/using-n8n-skills-official/SKILL.md` | 23 КБ, 201 рядок | мета-скіл «always-on protocol», який хук вставляє в **кожну** сесію |
  | `hooks/hooks.json` + 9 `*.sh` | 51 КБ | SessionStart, 6 PreToolUse, 1 PostToolUse |
  | `.claude-plugin/plugin.json`, `marketplace.json` | < 1 КБ | плагін Claude Code: `userConfig.n8n_url`, **`mcpServers.n8n-mcp`** (`${n8n_url}/mcp-server/http`) |
  | `.codex-plugin/plugin.json`, `.agents/plugins/marketplace.json` | < 1 КБ | те саме для Codex (скіли + хуки) |
  | `opencode/plugin.ts`, `README.md` | 20 КБ | плагін OpenCode: запускає ті самі bash-хуки через `spawnSync`, вставляє мета-скіл у system prompt **кожного** виклику LLM |
  | `CLAUDE.md`, `README.md`, `CONTRIBUTING.md`, `LICENSE` | 8 + 8 КБ | інструкції для мейнтейнерів, опис, Apache-2.0 |

- Frontmatter усіх 14 `SKILL.md`: лише `name` і `description` (`awk '/^---$/{n++; next} n==1'` по кожному). Немає
  `license`, `metadata`, `allowed-tools`, `hooks`, `context` — але хуки й MCP підключає **плагін**, а не frontmatter.

## 2. Що скіл може виконати, завантажити чи змінити

| Перевірка | Результат | Як перевіряли |
|---|---|---|
| `scripts/` та інші виконувані файли | **Є**: 9 bash-скриптів у `hooks/` + `opencode/plugin.ts` (`spawnSync` цих скриптів, `rmSync` маркерів). У скілах — `*.ts` лише як приклади коду воркфлоу | `find . -type f ! -name "*.md"` |
| Що роблять хуки (прочитано повністю) | `session-start.sh`: читає мета-скіл і віддає його як `additionalContext`; створює `~/.cache/n8n-skills`; на `clear`/`compact` видаляє свої маркери в `$TMPDIR/n8n-skills-state`. PreToolUse (`_emit.sh` + обгортки): раз на сесію вставляє нагадування «invoke skill X via the Skill tool». Мережі немає: перевірки оновлень — `TODO(v0.2)` («Fetch latest commit SHA from github.com/n8n-io/skills») | `cat hooks/**/*.sh`, `grep -nE "curl\|wget\|http"` |
| Матчери хуків | `^mcp__.*__validate_workflow$` тощо — спрацьовують на інструмент із такою назвою **будь-якого** MCP-сервера, не лише `n8n-mcp` | `hooks/hooks.json` |
| `allowed-tools` | немає | frontmatter |
| Команди під час рендеру `` !`cmd` `` | немає (0 збігів) | `grep -rn '!\`' skills` |
| Хуки, MCP-сервери, `plugin.json`, вимога ключів | **Так, усе три.** Хуки SessionStart/PreToolUse/PostToolUse; MCP-сервер `n8n-mcp` (HTTP) на інстанс n8n користувача з OAuth-входом (`/mcp` → Authenticate); вимога n8n ≥ 2.2.0 з увімкненим Instance-level MCP. MCP дає агенту `create_workflow_from_code`, `update_workflow`, `execute_workflow`, `publish_workflow` — **запис у воркфлоу інстансу** | `plugin.json`, `README.md:11–63`, таблиця інструментів у мета-скілі |
| Інструкції агенту щось завантажити чи виконати | `README.md:99` `npx skills add n8n-io/skills` (для людини); `AGENT_TOOL_BINARY.md:142` «Use WebSearch or WebFetch if you need to» (довідка по API); `n8n-debugging-official/references/FETCHING_N8N_SOURCE.md` — читати код n8n на GitHub. Шкідливого «завантаж і виконай» немає | `grep -rnE "npx \|curl \|wget \|WebFetch"` |
| Посилання | github.com (11), docs.n8n.io (6), n8n.io, community.n8n.io, skills.sh, opencode.ai; решта — `api.example.com`, `acme…` у прикладах. «Прочитай інструкції звідси» немає | `grep -rhoE "https?://…" \| sort \| uniq -c` |
| Приховані інструкції | 0 файлів із символами нульової ширини; base64 (80+ символів) немає; HTML-коментарі — `<!-- TODO … -->` у README і `<!-- TEMPORARY: … -->` у мета-скілі (службові, описані в `CLAUDE.md:60`). **Але** явні інструкції, що змінюють пріоритети агента: мета-скіл — «If a skill contradicts what you "know", trust the skill», «Invoke the relevant skill before any n8n action», «err on the side of loading too many skills», «Prefer n8n credits when the user has no credential preference» (комерційна порада за замовчуванням) | `grep -rniE "ignore (all \|the )?previous\|system prompt\|<!--"`, node-скрипт із шаблону, читання мета-скіла |

## 3. Аудити

| Аудит | Результат | Дата аналізу |
|---|---|---|
| Gen (Agent Trust Hub) | Pass (`n8n-node-configuration-official`, `using-n8n-skills-official`) | дату на сторінках не показано |
| Socket | Pass (ті самі два скіли) | не показано |
| Snyk | Pass (ті самі два скіли) | не показано |

- Де взяли: skills.sh — https://skills.sh/n8n-io/skills (29 скілів: 14 `*-official` по 1,4–1,8K встановлень + 15
  старших без суфікса) і сторінки двох скілів вище.
- Чому не з CLI: пакет не встановлювали навіть «щоб подивитись» (`--list` не запускали: CLI клонує репозиторій і
  показує лише скіли, а не хуки / MCP).
- До чого прив'язаний аудит: до пари «репозиторій + назва скіла», **не** до коміту (тегів немає). І головне —
  skills.sh аудитує **тексти окремих скілів**: хуки, `plugin.json` із MCP-сервером і `opencode/plugin.ts` лежать поза
  теками скілів і в ці аудити не входять. «Pass» не покриває те, що в пакеті найризикованіше.

## 4. Ліцензія й походження

- Ліцензія: Apache-2.0 — файл `LICENSE` у корені, `package.json` і `plugin.json` (`"license": "Apache-2.0"`). У
  frontmatter скілів ліцензії немає.
- Видавець і активність: організація `n8n-io` (автор у `plugin.json` — «n8n», https://n8n.io); репозиторій створено
  20.04.2026, 507 зірок, 67 форків (`gh api repos/n8n-io/skills`); останній коміт `main` — 21.08.2026. Пакет активно
  змінюється (мета-скіл прямо попереджає про «drift» між версіями MCP), а тегів немає.

## 5. Чи правдивий зміст для нашого стеку

Звіряли з запискою команди (`materials/n8n-webhooks-brief.md`, розділ 11 «Відомі пастки») і з тим, що ми бачили
самі на моку (`tools/mock-n8n.mjs` відтворює поведінку коду n8n).

| Порада пакета (файл) | Що каже пакет | Що кажуть записка / код n8n / наш мок | Висновок |
|---|---|---|---|
| Header Auth (`n8n-node-configuration-official/references/WEBHOOK_NODES.md:13`) | «Use `parameters.authentication` (`'basicAuth'` or `'headerAuth'`)… n8n rejects mismatched callers with **401** before the workflow runs» | Записка §8, §11: код n8n (`Webhook/utils.ts`) для Header Auth повертає **403** «Authorization data is wrong!»; 401 — для Basic Auth і JWT. У Task D мок на запит без токена відповів `POST /webhook/quote-request -> 403 … auth=missing` | **Хибно для Header Auth.** Та сама помилка, що записка вже називає, — досі в цій версії. Код, що чекає 401, не розпізнає неправильний токен |
| Секрет Crypto (`n8n-credentials-and-security-official/references/CUSTOM_CREDENTIALS.md:21`) | «the Crypto node's `secret` field **doesn't bind to a credential**, so the signing key has nowhere clean to live» → радить тримати ключ у `httpCustomAuth` | Записка §8.6, §11: для **Crypto v2** Hmac Secret береться з **Crypto credential** (документація й код) | **Застаріло.** Порада веде до обхідного шляху, коли є штатний credential |
| Режими відповіді (`WEBHOOK_NODES.md:17–26`) | `onReceived` — 200 одразу; `lastNode` — синхронно; `responseNode` — через Respond to Webhook | Записка §3 — те саме | **Правдиво.** Але немає обмеження n8n Cloud **100 с → 524** (записка §3) і тестового URL `/webhook-test/` на 120 с (§4) — саме тих граблів, на які ми наступили в Task C/D |
| HMAC у Code (`n8n-code-nodes-official/references/JAVASCRIPT_PATTERNS.md:128–140`) | `createHmac('sha256', item.secret).update(JSON.stringify(item.payload))` | Записка §5, §8.5: підписуємо `` `${ts}.${raw}` `` — **той самий рядок**, що відправляємо (Raw body), з часовою міткою проти replay | **Для нашого контракту не підходить:** без timestamp і з повторною серіалізацією. Сам пакет (`n8n-code-nodes-official/SKILL.md:151`) радить Crypto-вузол замість Code — це збігається з нашим «код для вузла Code — поза межами» |
| Текст відповіді Immediately | не згадано (`grep -rniE "got started\|was started"` — 0) | Записка §11: текст не парсимо | нейтрально |

## 6. Закріплення версії й коміт

- Команда встановлення: **не встановлювали** (вердикт нижче). Якщо колись знадобиться окремий текст як довідка —
  лише копія однієї теки скіла з конкретного SHA (`git archive 180b8415… skills/<тека>`), без `hooks/`, `plugin.json`
  і MCP; плагін (`/plugin install n8n-skills@n8n-io`) — ні.
- Де лягли файли; справжні файли чи посилання: — (нічого не встановлено; клон поза репозиторієм, `C:\Course\review-n8n-skills`)
- Що потрапило в git: лише цей файл рев'ю.
- Як оновлювати: тегів немає → кожне оновлення — новий SHA `main`, `git diff <старий>..<новий>` по всьому пакету
  (включно з `hooks/`, `plugin.json`, `opencode/`), повторне рев'ю за цим чеклістом.

## Вердикт

**Не встановлювати** (як плагін — у жодному проєкті агенції; окремі тексти — лише як довідка, звіряючи з запискою).
Ризик не в шкідливому коді — хуки прочитано повністю, мережі й виконання чужих команд у них немає, — а в тому, що
приносить плагін: MCP-сервер із правом створювати, змінювати, запускати й публікувати воркфлоу на інстансі (у нас
воркфлоу — власність клієнта, ми їх не змінюємо), хуки й 23 КБ мета-скіла в **кожній** сесії з інструкцією «довіряй
скілу більше, ніж тому, що знаєш» і комерційним дефолтом «n8n credits». Зміст місцями розходиться з нашим контрактом
(401 замість 403, застаріле про Crypto credential, підпис без timestamp), тож поряд з `integrating-n8n-webhooks` він
давав би агенту суперечливі вказівки. Тегів немає, а аудити skills.sh не покривають хуки й MCP.
