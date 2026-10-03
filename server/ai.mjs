// Client-owned AI adapter. The key lives ONLY in this server's environment (CLIENT_AI_API_KEY)
// on the client's own hosting account. It is never sent to the browser.
const PROVIDERS = {
  openai: {
    url: "https://api.openai.com/v1/responses",
    headers: (key) => ({ authorization: `Bearer ${key}` }),
    body: (model, system, user, web) => ({ model, instructions: system, input: user, max_output_tokens: 600, ...(web ? { tools: [{ type: "web_search" }] } : {}) }),
    text: (j) =>
      typeof j.output_text === "string"
        ? j.output_text
        : (j.output || []).flatMap((o) => o.content || []).map((c) => c.text || "").join(""),
  },
  anthropic: {
    url: "https://api.anthropic.com/v1/messages",
    headers: (key) => ({ "x-api-key": key, "anthropic-version": "2023-06-01" }),
    body: (model, system, user, web) => ({ model, system, max_tokens: 600, messages: [{ role: "user", content: user }], ...(web ? { tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }] } : {}) }),
    text: (j) => (j.content || []).map((c) => c.text || "").join(""),
  },
};

export function aiStatus(env) {
  const provider = PROVIDERS[env.CLIENT_AI_PROVIDER] ? env.CLIENT_AI_PROVIDER : null;
  const model = env.CLIENT_AI_MODEL || null;
  return { configured: !!(provider && model && env.CLIENT_AI_API_KEY), provider, model };
}

export async function callAi(env, system, user, web = false) {
  const s = aiStatus(env);
  if (!s.configured) throw new Error("AI is not configured (CLIENT_AI_PROVIDER, CLIENT_AI_MODEL, CLIENT_AI_API_KEY).");
  const p = PROVIDERS[s.provider];
  const r = await fetch(p.url, {
    method: "POST",
    headers: { "content-type": "application/json", ...p.headers(env.CLIENT_AI_API_KEY) },
    body: JSON.stringify(p.body(s.model, system, user, web)),
    signal: AbortSignal.timeout(web ? 45_000 : 20_000),
  });
  if (!r.ok) throw new Error(`AI provider answered ${r.status}.`);
  const text = p.text(await r.json()).trim();
  if (!text) throw new Error("AI provider returned no text.");
  return text;
}
