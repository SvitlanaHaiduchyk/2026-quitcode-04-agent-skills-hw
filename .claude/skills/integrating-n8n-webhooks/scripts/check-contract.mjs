#!/usr/bin/env node
// Static check of a Next.js project against the team's Next.js <-> n8n contract
// (skill integrating-n8n-webhooks). Node only, no dependencies.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

const HELP = `check-contract.mjs - static check of Next.js code against the n8n webhook contract

Usage:
  node check-contract.mjs [--root <dir>] [--changed-since <git-ref>] [--json]

Options:
  --root <dir>             Project to check (default: current directory).
  --changed-since <ref>    Report only findings in files changed after <ref> (git diff <ref> in
                           --root, plus new untracked files); in files that already existed,
                           only findings on changed lines. Without it: the whole project.
  --json                   Machine-readable output.
  -h, --help               This help.

Checks (id - what FAILs):
  C1  Test webhook URL (/webhook-test/) in code or .env.example.
  C2  An N8N_* variable with the NEXT_PUBLIC_ prefix (would be bundled for the browser).
  C3  n8n called or an n8n webhook variable (N8N_*WEBHOOK*, N8N_*URL*) read outside lib/n8n/client.ts.
  C4  lib/n8n/client.ts missing while n8n is used, or its first statement is not import "server-only".
  C5  fetch() to n8n without signal: AbortSignal.timeout(...).
  C6  N8N_* variable that is not in the contract (allowed: N8N_WEBHOOK_BASE_URL, N8N_WEBHOOK_TOKEN,
      N8N_CALLBACK_SECRET).
  C7  fetch() to n8n without headers x-n8n-token and idempotency-key.
  C8  Webhook body is not an envelope: JSON.stringify(...) of something without version/event
      (e.g. the whole database row).
  C9  Server Action ("use server" file) calls n8n outside after() - the user waits for n8n.
  C10 Callback route (app/api/n8n/**, or any POST route handler that mentions n8n) parses JSON
      before the signature check (request.json(), or JSON.parse before timingSafeEqual) or does
      not read request.text().
  C11 Callback route is not verified with HMAC x-n8n-signature, compares it with ===/!==, or has
      no crypto.timingSafeEqual (helpers the route imports count).
  C12 Callback route ignores x-n8n-timestamp (replay window) or idempotency-key.
  C13 export const runtime = "edge" anywhere (node:crypto is required).
  C14 console.* in n8n-related code logs a body, secret, signature, token, FormData or a whole record.

Status per check: PASS, FAIL (with file:line), N/A (nothing to check, e.g. no callback route yet).
Exit code: 1 if any FAIL, 0 otherwise, 2 on usage error.
`;

// ---------------------------------------------------------------- args
const argv = process.argv.slice(2);
const opts = { root: process.cwd(), since: null, json: false };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "-h" || a === "--help") { process.stdout.write(HELP); process.exit(0); }
  else if (a === "--root") opts.root = argv[++i];
  else if (a === "--changed-since") opts.since = argv[++i];
  else if (a === "--json") opts.json = true;
  else { process.stderr.write(`Unknown argument: ${a}\n\n${HELP}`); process.exit(2); }
}
if (!opts.root || !existsSync(opts.root) || !statSync(opts.root).isDirectory()) {
  process.stderr.write(`--root: not a directory: ${opts.root}\n`); process.exit(2);
}
if (opts.since === undefined) { process.stderr.write("--changed-since needs a git ref\n"); process.exit(2); }
const ROOT = resolve(opts.root);

// ---------------------------------------------------------------- files
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", ".claude", ".agents", ".cursor", ".codex",
  "tools", "materials", "docs", "coverage", "dist", "out", ".vercel", ".github"]);
const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const ENV_EXAMPLES = /^\.env(\..+)?\.example$|^\.env\.example$/;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) { if (!SKIP_DIRS.has(entry.name)) out.push(...walk(join(dir, entry.name))); }
    else if (CODE_EXT.test(entry.name) || (dir === ROOT && ENV_EXAMPLES.test(entry.name))) out.push(join(dir, entry.name));
  }
  return out;
}
const rel = (abs) => relative(ROOT, abs).split(sep).join("/");
const files = walk(ROOT).map((abs) => {
  const text = readFileSync(abs, "utf8");
  return { path: rel(abs), text, lines: text.split(/\r?\n/), isEnv: ENV_EXAMPLES.test(rel(abs)) };
}).filter((f) => !/(^|\/)next-env\.d\.ts$/.test(f.path));
const code = files.filter((f) => !f.isEnv);

// ---------------------------------------------------------------- helpers
const lineOf = (text, index) => text.slice(0, index).split("\n").length;
function* matches(re, text) { const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g"); let m; while ((m = g.exec(text))) yield m; }

/** Text of the balanced (...) call starting at the "(" at openIdx. Skips strings/comments roughly. */
function callSpan(text, openIdx) {
  let depth = 0, i = openIdx, quote = null;
  for (; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (quote) { if (c === "\\") { i++; continue; } if (c === quote) quote = null; continue; }
    if (c === "/" && n === "/") { i = text.indexOf("\n", i); if (i < 0) break; continue; }
    if (c === "/" && n === "*") { i = text.indexOf("*/", i + 2) + 1; if (i <= 0) break; continue; }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "(") depth++;
    else if (c === ")" && --depth === 0) return { start: openIdx, end: i, text: text.slice(openIdx, i + 1) };
  }
  return { start: openIdx, end: text.length, text: text.slice(openIdx) };
}

const CLIENT_PATH = /^(src\/)?lib\/n8n\/client\.(ts|js|mjs)$/;
const CALLBACK_ROUTE = /^(src\/)?app\/api\/n8n\/.*route\.(ts|js|mjs)$/;
// An n8n webhook address / token variable under ANY name (N8N_WEBHOOK_BASE_URL, N8N_WEBHOOK_URL,
// N8N_QUOTE_WEBHOOK_URL, N8N_URL...): process.env.X, process.env["X"], or "X" passed to an env() helper.
const N8N_WEBHOOK_ENV = /process\.env(\.|\[\s*["'])N8N_\w*(WEBHOOK|URL)\w*|["'`]N8N_\w*(WEBHOOK|URL)\w*["'`]/;
const usesN8nWebhook = (f) => CLIENT_PATH.test(f.path) || N8N_WEBHOOK_ENV.test(f.text) ||
  (/["'`][^"'`]*\/webhook(-test)?\/[^"'`]*["'`]/.test(f.text) && /fetch\s*\(/.test(f.text));
const importsN8nClient = (f) => /from\s+["'](@\/|\.{1,2}\/)+(src\/)?lib\/n8n\/client["']|from\s+["'][^"']*\/n8n\/client["']/.test(f.text);

/** Project files imported by f (one level): "@/x" and relative imports. */
const byPath = new Map(code.map((f) => [f.path, f]));
function localImports(f) {
  const out = [];
  for (const m of f.text.matchAll(/(?:import|export)\s[^;]*?from\s*["']([^"']+)["']/g)) {
    let spec = m[1];
    if (spec.startsWith("@/")) spec = spec.slice(2);
    else if (spec.startsWith(".")) spec = relative(ROOT, resolve(ROOT, f.path, "..", spec)).split(sep).join("/");
    else continue;
    for (const cand of [spec, ...[".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.js"].map((e) => spec + e)]) {
      if (byPath.has(cand)) { out.push(byPath.get(cand)); break; }
    }
  }
  return out;
}
/** Callback routes: app/api/n8n/**, or any route handler with POST that mentions n8n / N8N_. */
const isCallbackRoute = (f) => CALLBACK_ROUTE.test(f.path) ||
  (/(^|\/)app\/.*route\.(ts|js|mjs)$/.test(f.path) && /export\s+(async\s+)?(function|const)\s+POST/.test(f.text) &&
    (/n8n/i.test(f.path) || /n8n|N8N_/i.test(f.text) || localImports(f).some((g) => /N8N_/.test(g.text))));

/** fetch( calls that go to n8n: in files reading an n8n webhook variable / hitting /webhook/ paths. */
function n8nFetches() {
  const out = [];
  for (const f of code) {
    if (!usesN8nWebhook(f) || isCallbackRoute(f)) continue;
    for (const m of matches(/\bfetch\s*\(/, f.text)) {
      const span = callSpan(f.text, m.index + m[0].length - 1);
      out.push({ f, line: lineOf(f.text, m.index), span });
    }
  }
  return out;
}

// ---------------------------------------------------------------- checks
const results = [];
function check(id, title, fn) {
  const r = { id, title, status: "PASS", findings: [], examined: 0 };
  fn({
    examine: (n = 1) => { r.examined += n; },
    fail: (file, line, message, fileLevel = false) => r.findings.push({ file, line, message, fileLevel }),
  });
  if (r.findings.length) r.status = "FAIL";
  else if (r.examined === 0) r.status = "N/A";
  results.push(r);
}

check("C1", "no test webhook URL (/webhook-test/) in code or .env.example", ({ examine, fail }) => {
  for (const f of files) {
    examine();
    f.lines.forEach((l, i) => { if (/\/webhook-test\//.test(l) && !/^\s*(#|\/\/)/.test(l)) fail(f.path, i + 1, "test URL /webhook-test/ - production code uses /webhook/"); });
  }
});

check("C2", "no NEXT_PUBLIC_ prefix on N8N_* variables", ({ examine, fail }) => {
  for (const f of files) {
    examine();
    f.lines.forEach((l, i) => { if (/NEXT_PUBLIC_N8N_\w*/.test(l)) fail(f.path, i + 1, `${l.match(/NEXT_PUBLIC_N8N_\w*/)[0]} would be bundled for the browser`); });
  }
});

check("C3", "n8n is called only from lib/n8n/client.ts", ({ examine, fail }) => {
  for (const f of code) {
    if (CLIENT_PATH.test(f.path)) continue;
    examine();
    f.lines.forEach((l, i) => { if (N8N_WEBHOOK_ENV.test(l)) fail(f.path, i + 1, "n8n webhook variable read outside lib/n8n/client.ts"); });
  }
  for (const { f, line } of n8nFetches()) if (!CLIENT_PATH.test(f.path)) fail(f.path, line, "fetch() to n8n outside lib/n8n/client.ts");
});

check("C4", 'lib/n8n/client.ts exists and starts with import "server-only"', ({ examine, fail }) => {
  const client = code.find((f) => CLIENT_PATH.test(f.path));
  const users = code.filter((f) => usesN8nWebhook(f) || importsN8nClient(f));
  if (!client) {
    if (users.length) { examine(); for (const u of users) fail(u.path, 1, "n8n is used but lib/n8n/client.ts does not exist", true); }
    return;
  }
  examine();
  const first = client.lines.findIndex((l) => l.trim() && !/^\s*(\/\/|\/\*|\*)/.test(l));
  if (first < 0 || !/^\s*import\s+["']server-only["'];?\s*$/.test(client.lines[first])) {
    fail(client.path, first + 1, 'first statement must be import "server-only"');
  }
});

check("C5", "every fetch() to n8n has signal: AbortSignal.timeout(...)", ({ examine, fail }) => {
  for (const { f, line, span } of n8nFetches()) {
    examine();
    if (!/signal\s*:\s*AbortSignal\.timeout\s*\(/.test(span.text)) {
      // allow signal passed via a variable defined with AbortSignal.timeout in the same file
      const viaVar = span.text.match(/signal\s*:\s*(\w+)/) || (/[{,]\s*signal\s*[,}]/.test(span.text) ? [null, "signal"] : null);
      const ok = viaVar && new RegExp(`\\b${viaVar[1]}\\s*=\\s*AbortSignal\\.timeout\\s*\\(`).test(f.text);
      if (!ok) fail(f.path, line, "fetch() to n8n without AbortSignal.timeout - a hung n8n hangs the request");
    }
  }
});

check("C6", "only contract N8N_* variables", ({ examine, fail }) => {
  const allowed = new Set(["N8N_WEBHOOK_BASE_URL", "N8N_WEBHOOK_TOKEN", "N8N_CALLBACK_SECRET"]);
  for (const f of files) {
    examine();
    f.lines.forEach((l, i) => {
      if (f.isEnv && /^\s*#/.test(l)) return;
      for (const m of matches(/\b(?<!NEXT_PUBLIC_)N8N_[A-Z0-9_]+/, l)) {
        if (!allowed.has(m[0]) && !/^N8N_(PAYLOAD_SIZE_MAX|ENDPOINT_WEBHOOK(_TEST)?|PROXY_HOPS)$/.test(m[0])) {
          fail(f.path, i + 1, `${m[0]} is not in the contract (N8N_WEBHOOK_BASE_URL + event path, N8N_WEBHOOK_TOKEN, N8N_CALLBACK_SECRET)`);
        }
      }
    });
  }
});

check("C7", "fetch() to n8n sends x-n8n-token and idempotency-key", ({ examine, fail }) => {
  for (const { f, line, span } of n8nFetches()) {
    examine();
    const missing = ["x-n8n-token", "idempotency-key"].filter((h) => !new RegExp(`["']${h}["']`, "i").test(span.text) && !new RegExp(`["']${h}["']\\s*:`, "i").test(f.text));
    if (missing.length) fail(f.path, line, `fetch() to n8n without header(s): ${missing.join(", ")}`);
  }
});

check("C8", "webhook body is an envelope {version, event, data}", ({ examine, fail }) => {
  for (const { f, line, span } of n8nFetches()) {
    const bodyM = span.text.match(/\bbody\s*:\s*([^,\n}]+)|[{,]\s*body\s*[,}\n]/);
    if (!bodyM) continue;
    examine();
    const expr = (bodyM[1] ?? "body").trim();
    let ok;
    const inline = expr.match(/^JSON\.stringify\s*\(\s*\{/);
    if (inline) ok = /\bversion\b/.test(span.text) && /\bevent\b/.test(span.text);
    else {
      // JSON.stringify(x) or a variable: find how x / the variable is built in the file
      const name = (expr.match(/^JSON\.stringify\s*\(\s*([\w.]+)\s*\)/) ?? [null, expr])[1];
      const def = new RegExp(`\\b(const|let)\\s+${name.split(".")[0]}\\b[^=]*=([\\s\\S]{0,400})`).exec(f.text)
        ?? new RegExp(`\\b${name.split(".")[0]}\\s*:\\s*N8nEnvelope`).exec(f.text);
      const typed = new RegExp(`\\b${name.split(".")[0]}\\s*:\\s*\\w*Envelope`).test(f.text);
      ok = typed || /envelope/i.test(name) ||
        Boolean(def && ((/\bversion\s*:/.test(def[0]) && /\bevent\s*[:,]/.test(def[0])) || /Envelope|JSON\.stringify\s*\(\s*\w*envelope/i.test(def[0])));
    }
    if (!ok) fail(f.path, line, `webhook body "${expr}" is not a {version, event, data} envelope (whole record sent?)`);
  }
});

check("C9", "Server Actions call n8n only inside after()", ({ examine, fail }) => {
  for (const f of code) {
    if (!/^\s*["']use server["']/m.test(f.text)) continue;
    // names imported from lib/n8n/client or from any project module that calls n8n (e.g. lib/n8n-quote.ts)
    const callerSpecs = new Set(localImports(f).filter((g) => usesN8nWebhook(g)).map((g) => g.path.replace(/\.(ts|tsx|js|mjs)$/, "")));
    const imported = [...f.text.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g)]
      .filter((m) => /n8n\/client$/.test(m[2]) || [...callerSpecs].some((p) => m[2].endsWith(p.replace(/^(src\/)?/, "")) || m[2].endsWith(p.split("/").pop())))
      .flatMap((m) => m[1].split(",").map((s) => s.trim().split(/\s+as\s+/).pop()).filter(Boolean));
    const callRes = [];
    for (const name of imported) if (!/Url$|^type\s/.test(name)) callRes.push(new RegExp(`\\b${name}\\s*\\(`));
    if (usesN8nWebhook(f)) callRes.push(/\bfetch\s*\(/);
    if (!callRes.length) continue;
    const afterSpans = [...matches(/\bafter\s*\(/, f.text)].map((m) => callSpan(f.text, m.index + m[0].length - 1));
    for (const re of callRes) {
      for (const m of matches(re, f.text)) {
        if (/import|function\s*$/.test(f.text.slice(Math.max(0, m.index - 20), m.index))) continue;
        examine();
        if (!afterSpans.some((s) => m.index > s.start && m.index < s.end)) {
          fail(f.path, lineOf(f.text, m.index), `n8n call in a Server Action outside after() - the user waits for n8n (server-after-nonblocking)`);
        }
      }
    }
  }
});

const routes = code.filter(isCallbackRoute);
// route text + helpers it imports (signature / idempotency code often lives in lib/)
const withImports = (f) => [f.text, ...localImports(f).map((g) => g.text)].join("\n");

check("C10", "callback route reads raw text and parses JSON only after the signature check", ({ examine, fail }) => {
  for (const f of routes) {
    examine();
    f.lines.forEach((l, i) => { if (/\.json\s*\(\s*\)/.test(l) && !/Response\.json|NextResponse\.json/.test(l)) fail(f.path, i + 1, "request.json() in the callback route - re-serialisation breaks the signature; use request.text()"); });
    if (!/\.text\s*\(\s*\)/.test(withImports(f))) fail(f.path, 1, "callback route does not read the raw body with request.text()", true);
    const tse = f.text.search(/timingSafeEqual\s*\(/);
    for (const m of matches(/JSON\.parse\s*\(/, f.text)) {
      // a JSON.parse inside a helper defined before POST is fine only if called after verification: compare call order in POST body
      const post = f.text.search(/export\s+(async\s+)?function\s+POST|export\s+const\s+POST/);
      const verifyCall = post >= 0 ? f.text.slice(post).search(/timingSafeEqual\s*\(|\b\w*(verify|signature|Signature)\w*\s*\(/) : -1;
      const parseInPost = post >= 0 && m.index > post;
      const parseBeforeVerify = parseInPost ? (verifyCall < 0 || m.index - post < verifyCall) : (tse < 0);
      if (parseBeforeVerify) fail(f.path, lineOf(f.text, m.index), "JSON.parse before the signature is verified");
    }
  }
});

check("C11", "callback signature compared with crypto.timingSafeEqual, not ===", ({ examine, fail }) => {
  for (const f of routes) {
    examine();
    const all = withImports(f);
    if (!/createHmac\s*\(/.test(all) || !/["']x-n8n-signature["']/i.test(all)) {
      fail(f.path, 1, "callback is not verified with the HMAC x-n8n-signature (a shared secret / bearer token is not the contract)", true);
    }
    if (!/timingSafeEqual\s*\(/.test(all)) fail(f.path, 1, "no crypto.timingSafeEqual in the callback route", true);
    f.lines.forEach((l, i) => {
      if (/(sig|signature|hmac|digest|expected)\w*\s*[!=]==?|[!=]==?\s*\w*(sig|signature|hmac|digest|expected)/i.test(l) && !/length|typeof|null|undefined/.test(l)) {
        fail(f.path, i + 1, "signature compared with ===/!== - use lengths + crypto.timingSafeEqual");
      }
    });
  }
});

check("C12", "callback route checks x-n8n-timestamp window and idempotency-key", ({ examine, fail }) => {
  for (const f of routes) {
    examine();
    const all = withImports(f);
    if (!/["']x-n8n-timestamp["']/i.test(all)) fail(f.path, 1, "x-n8n-timestamp is not checked (replay window 300 s)", true);
    else if (!/\b300\b|MAX_SKEW|SKEW|WINDOW/i.test(all)) fail(f.path, 1, "no 300 s time window found for x-n8n-timestamp", true);
    if (!/["']idempotency-key["']/i.test(all)) fail(f.path, 1, "idempotency-key is not used - n8n retries will be applied twice", true);
  }
});

check("C13", 'no export const runtime = "edge"', ({ examine, fail }) => {
  for (const f of code) {
    examine();
    f.lines.forEach((l, i) => { if (/export\s+const\s+runtime\s*=\s*["']edge["']/.test(l)) fail(f.path, i + 1, 'runtime "edge" - node:crypto is required and edge is deprecated in Next.js 16'); });
  }
});

check("C14", "no bodies, secrets or personal data in logs of n8n code", ({ examine, fail }) => {
  const n8nFiles = code.filter((f) => usesN8nWebhook(f) || importsN8nClient(f) || isCallbackRoute(f) || /N8N_\w*SECRET/.test(f.text));
  const BAD = /\b(raw|rawBody|body|payload|envelope|formData|email|phone|fullName|token|secret|signature|headers|lead|quote|record|req|request|data|error|err|e)\b/;
  for (const f of n8nFiles) {
    for (const m of matches(/\bconsole\.(log|info|warn|error|debug)\s*\(/, f.text)) {
      examine();
      const args = callSpan(f.text, m.index + m[0].length - 1).text.slice(1, -1);
      // allowed: ids, lengths, statuses, names, codes, hashes; strip string literals except ${...} parts
      const exprs = args.replace(/`([^`]*)`/g, (_, t) => [...t.matchAll(/\$\{([^}]*)\}/g)].map((x) => x[1]).join(" , "))
        .replace(/"[^"]*"|'[^']*'/g, "")
        .replace(/\b[\w.]+\.(id|length|status|name|code|attempts|jobId|event|correlationId|message)\b/g, "")
        .replace(/\b\w*(Id|Ms|ms|attempt|status|event|correlation\w*)\b/g, "");
      if (BAD.test(exprs)) {
        const what = exprs.replace(/[\s,]+/g, " ").trim().slice(0, 60);
        fail(f.path, lineOf(f.text, m.index), `console.${m[1]} logs "${what}" - body, secret, record or whole error object (stack, URL); log ids, status, error.name`);
      }
    }
  }
});

// ---------------------------------------------------------------- --changed-since
let scopeNote = "";
if (opts.since) {
  const git = (...a) => execFileSync("git", ["-C", ROOT, ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  let top, diff, untracked;
  try {
    top = resolve(git("rev-parse", "--show-toplevel").trim());
    diff = git("diff", "-U0", "--no-color", "--no-ext-diff", opts.since, "--", ".");
    untracked = git("ls-files", "--others", "--exclude-standard").split("\n").filter(Boolean);
  } catch (error) {
    process.stderr.write(`--changed-since: git failed in ${ROOT}: ${String(error.stderr || error.message).trim()}\n`); process.exit(2);
  }
  const toRoot = (p) => relative(ROOT, join(top, p)).split(sep).join("/");
  const changed = new Map(); // path -> Set(lines) | "all"
  let current = null;
  for (const line of diff.split("\n")) {
    const f = line.match(/^\+\+\+ (?:b\/)?(.+)$/);
    if (f) { current = f[1] === "/dev/null" ? null : toRoot(f[1]); if (current && !changed.has(current)) changed.set(current, new Set()); continue; }
    const h = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
    if (h && current) { const start = +h[1], n = h[2] === undefined ? 1 : +h[2]; for (let k = 0; k < n; k++) changed.get(current).add(start + k); }
  }
  // untracked files are relative to cwd of git (ROOT) already
  for (const p of untracked) changed.set(p.split(sep).join("/"), "all");
  let hidden = 0;
  for (const r of results) {
    const before = r.findings.length;
    r.findings = r.findings.filter((x) => { const c = changed.get(x.file); return c === "all" || (c instanceof Set && c.size > 0 && (x.fileLevel || c.has(x.line))); });
    hidden += before - r.findings.length;
    if (r.findings.length) r.status = "FAIL";
    else if (r.status === "FAIL") r.status = "PASS";
  }
  scopeNote = `scope: changed since ${opts.since} (${changed.size} changed file(s)); ${hidden} finding(s) in unchanged code not shown`;
}

// de-duplicate identical findings
for (const r of results) {
  const seen = new Set();
  r.findings = r.findings.filter((x) => { const k = `${x.file}:${x.line}:${x.message}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

// ---------------------------------------------------------------- output
const fails = results.filter((r) => r.status === "FAIL").length;
if (opts.json) {
  process.stdout.write(JSON.stringify({ root: ROOT, since: opts.since, results, fails }, null, 2) + "\n");
} else {
  const out = [`check-contract: ${ROOT}`];
  if (scopeNote) out.push(scopeNote);
  for (const r of results) {
    out.push(`${r.id.padEnd(4)} ${r.status.padEnd(4)} ${r.title}`);
    for (const x of r.findings) out.push(`       ${x.file}:${x.line}  ${x.message}`);
  }
  const pass = results.filter((r) => r.status === "PASS").length;
  const na = results.filter((r) => r.status === "N/A").length;
  out.push(`\n${results.length} checks: ${pass} PASS, ${fails} FAIL, ${na} N/A`);
  process.stdout.write(out.join("\n") + "\n");
}
process.exit(fails ? 1 : 0);
