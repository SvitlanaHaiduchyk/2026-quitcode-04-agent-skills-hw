#!/usr/bin/env node
// Callback matrix against a running Next.js callback route (skill integrating-n8n-webhooks).
// Sends signed / broken callbacks like n8n would and compares the status codes with the contract.
// Node only, no dependencies. Never prints the secret or bodies.
import { createHmac, randomUUID } from "node:crypto";

const HELP = `send-signed-callback.mjs - callback matrix against /api/n8n/<event>

Usage:
  node --env-file=.env.local send-signed-callback.mjs --url <callback url> [--job-id <id>]
       [--request-key <idempotency-key of the original request>] [--only <case,...>] [--list]

Options:
  --url <url>            Callback endpoint, e.g. http://127.0.0.1:3000/api/n8n/quote-request
                         (the last path segment is the event).
  --job-id <id>          data.jobId to use (default: random UUID). Use the job_id your app saved
                         from the 202 response so the "valid" case can find the record.
  --request-key <key>    data.requestIdempotencyKey (the key your app sent to n8n).
  --only <a,b>           Run only these cases.  --list  Show the cases.
  -h, --help             This help.

Environment: N8N_CALLBACK_SECRET (required; same value as in the app). Pass it with --env-file,
never as a flag.

Exit code: 1 if any case got an unexpected status, 0 otherwise, 2 on usage error.
Note: "valid" and "duplicate" change data in the app (they complete the job).
`;

const argv = process.argv.slice(2);
const opts = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "-h" || a === "--help") { process.stdout.write(HELP); process.exit(0); }
  else if (a === "--list") opts.list = true;
  else if (["--url", "--job-id", "--request-key", "--only"].includes(a)) opts[a.slice(2)] = argv[++i];
  else { process.stderr.write(`Unknown argument: ${a}\n\n${HELP}`); process.exit(2); }
}

const CASES = [
  ["unknown-event", 404, "path event the app does not know"],
  ["wrong-content-type", 415, "content-type text/plain"],
  ["too-large", 413, "body > 64 KB (signed)"],
  ["stale-timestamp", 401, "x-n8n-timestamp 10 minutes old (signed with it)"],
  ["future-timestamp", 401, "x-n8n-timestamp 10 minutes ahead"],
  ["bad-signature", 401, "signature of a different body"],
  ["short-signature", 401, "truncated signature (length differs - must not crash timingSafeEqual)"],
  ["no-signature", 401, "no x-n8n-signature header"],
  ["reformatted-body", 401, "body pretty-printed after signing (re-serialisation)"],
  ["key-mismatch", 400, "signed body, idempotency-key that does not match data.jobId:event"],
  ["bad-shape", 400, "signed body without data.jobId"],
  ["valid", 202, "correct signed callback"],
  ["duplicate", 200, "the same callback again (same idempotency-key) -> {\"duplicate\":true}"],
];

if (opts.list) { for (const [n, s, d] of CASES) console.log(`${n.padEnd(20)} ${s}  ${d}`); process.exit(0); }
if (!opts.url || !/^https?:\/\//.test(opts.url)) { process.stderr.write(`--url is required\n\n${HELP}`); process.exit(2); }
const secret = process.env.N8N_CALLBACK_SECRET;
if (!secret) { process.stderr.write("N8N_CALLBACK_SECRET is not set (use node --env-file=.env.local ...)\n"); process.exit(2); }

const url = new URL(opts.url);
const event = url.pathname.split("/").filter(Boolean).pop();
const jobId = opts["job-id"] ?? randomUUID();
const correlationId = randomUUID();
const bodyEvent = `${event}.completed`;
const key = `${jobId}:${bodyEvent}`;
const now = () => Math.floor(Date.now() / 1000);
const sign = (ts, raw) => `sha256=${createHmac("sha256", secret).update(`${ts}.${raw}`).digest("hex")}`;

function body(extra = {}) {
  return JSON.stringify({
    version: 1,
    event: bodyEvent,
    data: {
      jobId,
      status: "completed",
      correlationId,
      requestIdempotencyKey: opts["request-key"] ?? randomUUID(),
      result: { documentUrl: `https://files.example.test/n8n/${jobId}.pdf` },
      completedAt: new Date().toISOString(),
      ...extra,
    },
  });
}
const validRaw = body();

function request(name) {
  const ts = String(now());
  const base = { "content-type": "application/json", "x-n8n-timestamp": ts, "x-n8n-signature": sign(ts, validRaw), "idempotency-key": key, "x-correlation-id": correlationId };
  switch (name) {
    case "unknown-event": return { target: new URL(`../no-such-event-${Date.now()}`, url.href.endsWith("/") ? url : `${url}/`), headers: base, raw: validRaw };
    case "wrong-content-type": return { headers: { ...base, "content-type": "text/plain" }, raw: validRaw };
    case "too-large": { const raw = body({ padding: "x".repeat(70 * 1024) }); return { headers: { ...base, "x-n8n-signature": sign(ts, raw) }, raw }; }
    case "stale-timestamp": { const t = String(now() - 600); return { headers: { ...base, "x-n8n-timestamp": t, "x-n8n-signature": sign(t, validRaw) }, raw: validRaw }; }
    case "future-timestamp": { const t = String(now() + 600); return { headers: { ...base, "x-n8n-timestamp": t, "x-n8n-signature": sign(t, validRaw) }, raw: validRaw }; }
    case "bad-signature": return { headers: { ...base, "x-n8n-signature": sign(ts, body({ status: "failed" })) }, raw: validRaw };
    case "short-signature": return { headers: { ...base, "x-n8n-signature": base["x-n8n-signature"].slice(0, 20) }, raw: validRaw };
    case "no-signature": { const h = { ...base }; delete h["x-n8n-signature"]; return { headers: h, raw: validRaw }; }
    case "reformatted-body": return { headers: base, raw: JSON.stringify(JSON.parse(validRaw), null, 2) };
    case "key-mismatch": return { headers: { ...base, "idempotency-key": `${randomUUID()}:${bodyEvent}` }, raw: validRaw };
    case "bad-shape": { const raw = JSON.stringify({ version: 1, event: bodyEvent, data: { status: "completed" } }); return { headers: { ...base, "x-n8n-signature": sign(ts, raw), "idempotency-key": `undefined:${bodyEvent}` }, raw }; }
    case "valid": case "duplicate": return { headers: base, raw: validRaw };
    default: throw new Error(name);
  }
}

const only = opts.only ? new Set(opts.only.split(",")) : null;
let bad = 0;
console.log(`callback matrix -> ${url.origin}${url.pathname} (event ${event}, jobId ${jobId})`);
for (const [name, expected, description] of CASES) {
  if (only && !only.has(name)) continue;
  const { target = url, headers, raw } = request(name);
  let status, note = "";
  try {
    const res = await fetch(target, { method: "POST", headers, body: raw, signal: AbortSignal.timeout(10_000) });
    status = res.status;
    const text = await res.text();
    if (name === "duplicate" && status === 200 && !/"duplicate"\s*:\s*true/.test(text)) { note = ' (no {"duplicate":true} in body)'; status = `${status}*`; }
  } catch (error) {
    status = error.name === "TimeoutError" ? "timeout" : "network-error";
  }
  const ok = String(status) === String(expected);
  if (!ok) bad++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name.padEnd(20)} expected ${expected}, got ${status}${note}  - ${description}`);
}
console.log(bad ? `\n${bad} case(s) with unexpected status` : "\nall cases as expected");
process.exit(bad ? 1 : 0);
