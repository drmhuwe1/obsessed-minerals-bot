// Connection test for the client's own AI account: `npm run check-ai`.
// Prints only success/failure — never the key.
import { aiStatus, callAi } from "./ai.mjs";

const s = aiStatus(process.env);
if (!s.configured) {
  console.log("AI not configured. Set CLIENT_AI_PROVIDER, CLIENT_AI_MODEL and CLIENT_AI_API_KEY on your hosting. The bot still works in approved-answers-only mode.");
  process.exit(2);
}
try {
  const t = await callAi(process.env, "Reply with the single word: ready", "Connection test");
  console.log(`AI connection OK (${s.provider} / ${s.model}). Reply: ${t.slice(0, 40)}`);
} catch (e) {
  console.log(`AI connection FAILED (${s.provider} / ${s.model}): ${e instanceof Error ? e.message : "error"}`);
  process.exit(1);
}
