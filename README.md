# Obsessed Minerals chatbot — install guide

Package: version 5 · fingerprint 197be4fb1241fbc5 · VERIFIED READY package
Target platform: React website
Support contact: drmhuwe@huwechiropractic.com

## What is inside
- widget/  — the chat badge and window for the website (HTML/JS/CSS + badge image). Your backend serves these files.
- server/  — a small Node.js backend (no third-party packages). It holds the approved answers and private instructions; visitors never see them.
- server/.env.example — the settings you fill in on your hosting.
- server/test/ — automatic checks (npm test).

## Before you start (prerequisites)
1. A hosting account OWNED BY THE CLIENT that can run Node.js 18 or newer (planned: https://obsessedminerals.com).
2. An HTTPS address for the backend, e.g. https://obsessed-minerals-bot.onrender.com.
3. The exact website address(es) that will show the chat: https://obsessedminerals.com.
4. Optional AI answers: the client's own AI provider account and key (see step 4). Without it the bot answers only from approved content.

## Step 1 — Try it on your computer
    cd server
    npm test                      # runs the automatic checks
    ALLOWED_ORIGINS=http://localhost:8787 ENABLE_DEMO=true npm start
Open http://localhost:8787/demo.html — you should see the badge. Stop with Ctrl+C.

## Step 2 — Put the backend online
1. Upload the whole package folder to the client's hosting (or push it to a private Git repo the host deploys from).
2. Start command: `npm start` (working directory: server). No install step is needed — there are no dependencies.
3. Set these environment settings on the host (never in the website code):
   - ALLOWED_ORIGINS=https://obsessedminerals.com
   - PORT (usually provided by the host)
   - TRUST_PROXY=true if the host sits behind a proxy/load balancer
   - LEAD_STORAGE=none   (lead capture is off in this version)
4. Visit https://obsessed-minerals-bot.onrender.com/health — it must show "version": 5 and "origins_configured" of at least 1.

## Step 3 — Add the chat to the website (React website)
Add once, e.g. in your root layout component:

    useEffect(() => {
      const s = document.createElement("script");
      s.src = "https://obsessed-minerals-bot.onrender.com/widget.js"; s.defer = true;
      document.body.appendChild(s);
      return () => { s.remove(); document.querySelector("[data-chatbot]")?.remove(); };
    }, []);

For embedded display add <div data-chatbot-embed></div> where the chat should appear.

## Step 4 — AI answers (client pays their own AI provider)
Default: the bot answers only from approved content and needs NO key.
To turn on AI-assisted answers, set on the CLIENT's hosting:
   - CLIENT_AI_PROVIDER=openai   (openai or anthropic)
   - CLIENT_AI_MODEL=gpt-4o-mini   (exact spelling — gpt-4o-mini uses the letter "o", not a zero)
   - CLIENT_AI_API_KEY=(the client's own key — paste only into the host's secret settings)
Then run `npm run check-ai` on the host (or locally with the same settings). /health shows "ai": {"configured": true}.
Never put the key in the website, this README, email or chat.

## Leads (contact form)
Lead capture is not turned on in this version.

## Saved conversations and "needs a person" alerts
- The bot always counts chats that need a real person (visitor asked for someone, or the bot had no answer). The owner's monitor emails an alert when that number goes up.
- To also SAVE the conversations: set CHAT_LOG=file (and CHAT_LOG_FILE=/path/on/persistent/disk/conversations.jsonl if the host wipes files on restart). They stay on the client's hosting; only the owner's monitor (MONITOR_TOKEN) can read them.
- Tell visitors chats may be saved (for example in the website privacy policy) before switching this on.

## REST API (for apps)
POST https://obsessed-minerals-bot.onrender.com/chat   body {"message": "text up to 1000 chars"}
  → {"text", "outcome": answered|no_match|health_refusal|unsafe_refusal|feature|error, "citations":[{"id","title","source_url"}], "actions":[{"kind","label","href?"}], "version"}
POST https://obsessed-minerals-bot.onrender.com/lead   body {"name","contact","topic?","consent": true}
GET  https://obsessed-minerals-bot.onrender.com/health
Browser calls must come from an allowed origin. Apps without an origin send header X-App-Token (APP_CLIENT_TOKEN).
Errors: 400 bad input · 403 origin not allowed · 413 too large · 429 too many (wait 60 s) · 503 not configured.

## Custom domain (no vendor address)
Point a subdomain such as chat.client-site.com at the host (CNAME record at the domain registrar, as the host instructs), enable HTTPS on the host, then use that address in the script tag. (Requested for this client.)

## Installation check
1. https://obsessed-minerals-bot.onrender.com/health shows version 5.
2. Open the client website: badge appears, opens, answers a known question with a source.
3. Ask something unknown: it says it doesn't have approved information.
4. Tell the owner the website page address so the installation can be verified.

## Roll back or remove
- Remove: delete the script tag (and the embed div). The badge disappears immediately.
- Roll back: redeploy the previous package folder on the host; /health will show the older version.
- Off switch: set BOT_DISABLED=true and restart — chats get a polite "unavailable" message.
- Emergency off: set ALLOWED_ORIGINS to empty — the backend refuses all chats.
