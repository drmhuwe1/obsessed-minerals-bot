// Chatbot backend. Plain Node.js (18+), no third-party dependencies.
// Serves the website widget and answers visitors using the exact approved bot version in ./bot/.
import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { appendFile } from "node:fs/promises";
import { timingSafeEqual, createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as eng from "./engine.mjs";
import { aiStatus, callAi } from "./ai.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
// Works whether the files were uploaded with their folders or all in one flat list (common with GitHub drag-and-drop).
function findFile(...candidates) {
  for (const p of candidates) if (existsSync(p)) return p;
  return candidates[0];
}
const BUNDLE = JSON.parse(readFileSync(findFile(join(HERE, "bot", "config.private.json"), join(HERE, "config.private.json")), "utf8"));
const CFG = BUNDLE.config;
const CHUNKS = eng.chunk(CFG.knowledge);
const MAX_BODY = 32 * 1024;
// Lead topics must not carry health details (default). Broad on purpose.
// Visitor asks for a real person.
const HUMAN_RE = /\b(human|real person|live person|a person|someone|staff|representative|receptionist|operator|call me|call back|talk to (?:the )?(?:doctor|office))\b/i;
export function needsPerson(message, outcome) {
  return outcome === "no_match" || outcome === "error" || (HUMAN_RE.test(message) && /\b(talk|speak|chat|connect|call|reach|contact|need|want)\b/i.test(message));
}
const LEAD_HEALTH_RE = /\b(pain|ache|aching|hurt|injur\w*|symptom\w*|diagnos\w*|condition|sciatica|disc|herniat\w*|numb\w*|tingl\w*|medicat\w*|prescri\w*|pregnan\w*|surgery|x-?rays?|mri|headaches?|migraines?|arthritis|fracture\w*|sprain\w*|strain|spasm\w*|inflam\w*|swollen|swelling|dizz\w*)\b/i;

function staticFile(rel, type) {
  const base = rel.split("/").pop();
  const p = findFile(join(ROOT, rel), join(HERE, rel), join(HERE, "widget", base), join(HERE, base));
  return existsSync(p) ? { body: readFileSync(p), type } : null;
}

export function publicWidgetConfig() {
  const d = CFG.design;
  return {
    client_name: CFG.client_name,
    version: BUNDLE.version,
    design: d ? { ...d, image: undefined } : null,
    badge_image: d && d.image ? `assets/badge.${d.image.ext}` : null,
    lead_form: CFG.features.some((f) => f.key === "lead_capture" && f.mode === "built_in"),
    credit: BUNDLE.credit === true,
  };
}

export function createHandler(env = process.env) {
  const origins = new Set(
    String(env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean),
  );
  const limit = Math.max(1, Math.min(600, Number(env.RATE_LIMIT_PER_MIN || 20)));
  const appToken = env.APP_CLIENT_TOKEN || "";
  const leadStorage = env.LEAD_STORAGE || "none";
  const hits = new Map();
  const disabled = env.BOT_DISABLED === "true";
  const monitorToken = env.MONITOR_TOKEN || "";
  const startedAt = new Date().toISOString();
  // Aggregate counts only — no visitor messages or personal details. Reset when the server restarts.
  const counts = { chats: 0, answered: 0, unknown: 0, refused: 0, errors: 0, leads: 0, rate_limited: 0, disabled_refusals: 0, server_errors: 0, needs_person: 0 };
  // Optional conversation log (CHAT_LOG=file). Stays on the client's own hosting; only the owner's monitor can read it.
  const chatLog = env.CHAT_LOG === "file" ? (env.CHAT_LOG_FILE || join(ROOT, "conversations.jsonl")) : "";
  const ai = aiStatus(env);
  const mode = CFG.answer_mode === "ai_assisted" && ai.configured ? "ai_assisted" : "approved_only";
  const assets = {
    "/widget.js": staticFile("widget/widget.js", "text/javascript; charset=utf-8"),
    "/widget.css": staticFile("widget/widget.css", "text/css; charset=utf-8"),
  };
  if (CFG.design && CFG.design.image) {
    const rel = `widget/assets/badge.${CFG.design.image.ext}`;
    assets[`/assets/badge.${CFG.design.image.ext}`] = staticFile(rel, CFG.design.image.mime);
  }
  if (env.ENABLE_DEMO === "true") assets["/demo.html"] = staticFile("widget/demo.html", "text/html; charset=utf-8");

  function ipOf(req) {
    if (env.TRUST_PROXY === "true") {
      const f = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
      if (f) return f;
    }
    return req.socket.remoteAddress || "unknown";
  }
  function limited(key) {
    const now = Date.now();
    const arr = (hits.get(key) || []).filter((t) => now - t < 60_000);
    arr.push(now);
    hits.set(key, arr);
    if (hits.size > 10_000) hits.clear();
    return arr.length > limit;
  }
  function send(res, status, obj, extra = {}) {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", ...extra });
    res.end(JSON.stringify(obj));
  }
  function tokenOk(given) {
    if (!appToken || !given) return false;
    const a = createHash("sha256").update(String(given)).digest();
    const b = createHash("sha256").update(appToken).digest();
    return timingSafeEqual(a, b);
  }
  /** Returns CORS headers to add, or an error response descriptor. */
  function gate(req) {
    if (origins.size === 0) return { error: [503, { error: "not_configured", message: "This chatbot isn't set up yet (no allowed websites)." }] };
    const origin = req.headers.origin;
    if (origin) {
      if (!origins.has(origin)) return { error: [403, { error: "origin_not_allowed", message: "This website isn't allowed to use this chatbot." }] };
      return { headers: { "access-control-allow-origin": origin, vary: "Origin" } };
    }
    if (tokenOk(req.headers["x-app-token"])) return { headers: {} };
    return { error: [403, { error: "origin_required", message: "Requests must come from an allowed website or app." }] };
  }
  async function readJson(req) {
    const ct = String(req.headers["content-type"] || "");
    if (!ct.includes("application/json")) throw Object.assign(new Error("Send JSON."), { status: 415 });
    let size = 0;
    const parts = [];
    for await (const c of req) {
      size += c.length;
      if (size > MAX_BODY) throw Object.assign(new Error("Message too large."), { status: 413 });
      parts.push(c);
    }
    try {
      return JSON.parse(Buffer.concat(parts).toString("utf8"));
    } catch {
      throw Object.assign(new Error("Invalid JSON."), { status: 400 });
    }
  }
  function visitorReply(r) {
    return {
      text: r.text,
      outcome: r.outcome,
      citations: r.citations.map((c) => ({ id: c.id, title: c.title, source_url: c.source_url })),
      actions: r.actions.filter((a) => !a.href || /^(https?:|tel:|mailto:)/i.test(a.href)),
    };
  }
  async function answer(message, history) {
    if (mode === "approved_only") return eng.answerDeterministic(CFG, message, history);
    try {
      return await eng.answerWithAi(CFG, CHUNKS, message, (user) => callAi(env, BUNDLE.system_prompt, user, !!CFG.web_search), history);
    } catch (e) {
      console.error(JSON.stringify({ evt: "ai_error", msg: e instanceof Error ? e.message : "error" }));
      return { ...eng.unknownReply(CFG), outcome: "error" };
    }
  }

  function monitorOk(req) {
    const m = /^Bearer ([^\s]+)$/.exec(String(req.headers.authorization || ""));
    if (!monitorToken || !m) return 404;
    const a = createHash("sha256").update(m[1]).digest();
    const b = createHash("sha256").update(monitorToken).digest();
    return timingSafeEqual(a, b) ? 200 : 401;
  }

  return async function handler(req, res) {
    const url = new URL(req.url || "/", "http://local");
    const path = url.pathname;
    try {
      if (req.method === "GET" && path === "/status") {
        const st = monitorOk(req);
        if (st !== 200) return send(res, st, { error: st === 404 ? "not_found" : "unauthorized" });
        return send(res, 200, { ok: true, version: BUNDLE.version, config_hash: BUNDLE.config_hash, disabled, mode, started_at: startedAt, uptime_s: Math.round(process.uptime()), counts, chat_log: !!chatLog });
      }
      if (req.method === "GET" && path === "/conversations") {
        const st = monitorOk(req);
        if (st !== 200) return send(res, st, { error: st === 404 ? "not_found" : "unauthorized" });
        if (!chatLog) return send(res, 200, { enabled: false, items: [] });
        let lines = [];
        try { lines = (await readFile(chatLog, "utf8")).split("\n").filter(Boolean).slice(-200); } catch { lines = []; }
        const items = [];
        for (const l of lines) { try { items.push(JSON.parse(l)); } catch { /* skip broken line */ } }
        return send(res, 200, { enabled: true, items: items.reverse() });
      }
      if (req.method === "GET" && path === "/health") {
        return send(res, 200, { disabled,
          ok: true, version: BUNDLE.version, config_hash: BUNDLE.config_hash, mode,
          ai: { configured: ai.configured, provider: ai.provider, model: ai.model, requested: CFG.answer_mode === "ai_assisted" },
          origins_configured: origins.size, lead_storage: leadStorage,
        }, { "access-control-allow-origin": "*" });
      }
      if (req.method === "GET" && path === "/widget-config.json") {
        return send(res, 200, publicWidgetConfig(), { "access-control-allow-origin": "*", "cache-control": "public, max-age=300" });
      }
      if (req.method === "GET" && assets[path]) {
        const a = assets[path];
        res.writeHead(200, { "content-type": a.type, "cache-control": "public, max-age=300", "cross-origin-resource-policy": "cross-origin", "access-control-allow-origin": "*", "x-content-type-options": "nosniff" });
        return res.end(a.body);
      }
      if (req.method === "OPTIONS" && (path === "/chat" || path === "/lead")) {
        const g = gate(req);
        if (g.error) return send(res, g.error[0], g.error[1]);
        res.writeHead(204, { ...g.headers, "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type, x-app-token", "access-control-max-age": "600" });
        return res.end();
      }
      if (req.method === "POST" && (path === "/chat" || path === "/lead")) {
        const g = gate(req);
        if (g.error) return send(res, g.error[0], g.error[1]);
        if (disabled) { counts.disabled_refusals++; return send(res, 503, { error: "chat_unavailable", message: "Chat is unavailable right now. Please contact the office directly." }, g.headers); }
        if (limited(`${ipOf(req)}|${path}`)) { counts.rate_limited++; return send(res, 429, { error: "rate_limited", message: "Too many messages. Please wait a minute." }, { ...g.headers, "retry-after": "60" }); }
        const body = await readJson(req);
        if (path === "/chat") {
          const message = typeof body.message === "string" ? body.message.trim() : "";
          if (!message || message.length > 1000) return send(res, 400, { error: "bad_message", message: "Please type a message under 1,000 characters." }, g.headers);
          const r = await answer(message, eng.cleanHistory(body.history));
          counts.chats++;
          if (r.outcome === "answered" || r.outcome === "feature") counts.answered++;
          else if (r.outcome === "no_match") counts.unknown++;
          else if (r.outcome === "unsafe_refusal" || r.outcome === "health_refusal") counts.refused++;
          else if (r.outcome === "error") counts.errors++;
          const person = needsPerson(message, r.outcome);
          if (person) counts.needs_person++;
          if (chatLog) {
            const session = typeof body.session === "string" ? body.session.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 40) : "";
            const entry = { at: new Date().toISOString(), version: BUNDLE.version, session, message: message.slice(0, 1000), reply: String(r.text || "").slice(0, 2000), outcome: r.outcome, needs_person: person };
            appendFile(chatLog, JSON.stringify(entry) + "\n", { mode: 0o600 }).catch(() => { counts.server_errors++; });
          }
          return send(res, 200, { ...visitorReply(r), version: BUNDLE.version }, g.headers);
        }
        // /lead
        if (!publicWidgetConfig().lead_form) return send(res, 404, { error: "lead_off", message: "Contact form isn't turned on." }, g.headers);
        if (body.consent !== true) return send(res, 400, { error: "consent_required", message: "Please agree to be contacted first." }, g.headers);
        const name = typeof body.name === "string" ? body.name.trim() : "";
        const contact = typeof body.contact === "string" ? body.contact.trim() : "";
        const topic = typeof body.topic === "string" ? body.topic.trim() : "";
        if (!name || name.length > 120 || contact.length < 3 || contact.length > 200 || topic.length > 200)
          return send(res, 400, { error: "bad_lead", message: "Please check your name and contact details." }, g.headers);
        if (env.LEAD_ALLOW_HEALTH_TOPIC !== "true" && (eng.HEALTH_RE.test(topic) || LEAD_HEALTH_RE.test(topic)))
          return send(res, 400, { error: "health_detail", message: "Please don't include health details here. The office will ask when they contact you." }, g.headers);
        const lead = { at: new Date().toISOString(), version: BUNDLE.version, name, contact, topic: topic || null, consent: true };
        if (leadStorage === "file") {
          await appendFile(env.LEADS_FILE || join(ROOT, "leads.jsonl"), JSON.stringify(lead) + "\n", { mode: 0o600 });
        } else if (leadStorage === "webhook" && /^https:\/\//.test(env.LEAD_WEBHOOK_URL || "")) {
          const r = await fetch(env.LEAD_WEBHOOK_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(lead), signal: AbortSignal.timeout(10_000) });
          if (!r.ok) throw Object.assign(new Error("Lead webhook failed."), { status: 502 });
        } else {
          return send(res, 501, { error: "lead_storage_not_set", message: "Contact form isn't connected yet. Please call or email the office." }, g.headers);
        }
        counts.leads++;
        return send(res, 200, { ok: true }, g.headers);
      }
      return send(res, 404, { error: "not_found" });
    } catch (e) {
      const status = e && typeof e.status === "number" ? e.status : 500;
      if (status === 500) counts.server_errors++;
      if (status === 500) console.error(JSON.stringify({ evt: "server_error", msg: e instanceof Error ? e.message : "error" }));
      return send(res, status, { error: "error", message: status === 500 ? "Something went wrong. Please try again." : e.message });
    }
  };
}

export function start(env = process.env) {
  const server = http.createServer(createHandler(env));
  server.requestTimeout = 30_000;
  server.listen(Number(env.PORT || 8787), () => {
    const a = server.address();
    console.log(`Chatbot backend v${BUNDLE.version} listening on port ${typeof a === "object" && a ? a.port : env.PORT}`);
  });
  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) start();
