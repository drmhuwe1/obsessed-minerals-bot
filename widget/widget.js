/* Website chatbot widget. Add once per page:
   <script src="https://YOUR-BOT-ADDRESS/widget.js" defer></script>
   Optional: data-mount="element-id" to show the chat inside a page section (embedded display). */
(function () {
  "use strict";
  /* Turns one chatbot reply into simple pieces a page can draw:
   plain words, bold words, and real clickable links.
   Shared by the chat window visitors see and the preview inside ChatMike,
   so the same reply looks the same in both places. */
var ANSWER_LINK = /\[([^\]\n]*)\]\s*\(\s*([^)\s]+)\s*\)/g;

function answerHref(href) {
  var h = String(href == null ? "" : href).trim().replace(/^<\s*|\s*>$/g, "");
  return /^(https?:|tel:|mailto:)/i.test(h) ? h : null;
}

function answerLabel(label, href) {
  var l = String(label == null ? "" : label).trim();
  if (!l || /^(https?:|mailto:|tel:)/i.test(l)) return String(href == null ? "" : href).trim();
  return l;
}

function answerBold(src) {
  var out = [], rest = String(src);
  while (rest) {
    var m = /\*\*([^*\n]+)\*\*/.exec(rest);
    if (!m) { out.push({ t: "text", v: rest }); break; }
    if (m.index > 0) out.push({ t: "text", v: rest.slice(0, m.index) });
    out.push({ t: "bold", v: m[1] });
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
}

function answerInline(src) {
  var out = [], last = 0, m;
  ANSWER_LINK.lastIndex = 0;
  while ((m = ANSWER_LINK.exec(src))) {
    if (m.index > last) out = out.concat(answerBold(src.slice(last, m.index)));
    var href = answerHref(m[2]);
    if (!href) out = out.concat(answerBold(m[0]));
    else out.push({ t: "link", v: answerLabel(m[1], m[2]), href: href });
    last = ANSWER_LINK.lastIndex;
  }
  if (last < src.length) out = out.concat(answerBold(src.slice(last)));
  return out;
}

/* Returns one entry per line; each line is a list of pieces:
   { t: "text", v } | { t: "bold", v } | { t: "link", v, href } */
function formatAnswer(text) {
  var lines = String(text == null ? "" : text).replace(/\r\n?/g, "\n").split("\n");
  var out = [];
  for (var i = 0; i < lines.length; i++) {
    var raw = lines[i].replace(/\s+$/, "");
    if (raw.trim() === "" && (out.length === 0 || i === lines.length - 1)) continue;
    if (raw.trim() === "") { out.push([]); continue; }
    var isItem = /^\s*(?:[-*•]|\d+[.)])\s+/.test(raw);
    var body = raw.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim();
    var tokens = isItem ? [{ t: "text", v: "\u2022 " }] : [];
    out.push(tokens.concat(answerInline(body)));
  }
  return out;
}

/* The same reply as ordinary words, for reading aloud. */
function answerPlain(text) {
  return formatAnswer(text).map(function (line) {
    return line.map(function (token) { return token.v; }).join("");
  }).join("\n");
}


  var script = document.currentScript;
  if (!script || window.__chatbotWidgetLoaded) return;
  window.__chatbotWidgetLoaded = true;
  var BASE = new URL(".", script.src).href.replace(/\/$/, "");
  var HIDE_KEY = "chatbot-hidden:" + BASE;
  var SESSION = Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
  var ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>';

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function safeHref(h) { return typeof h === "string" && /^(https?:|tel:|mailto:)/i.test(h) ? h : null; }
  /* Draws a reply as ordinary words, bold words and real clickable links. */
  function renderAnswer(node, text) {
    if (typeof formatAnswer !== "function") { node.textContent = text; return; }
    formatAnswer(text).forEach(function (tokens) {
      var line = el("div", "cb-line");
      if (!tokens.length) line.textContent = "\u00a0";
      tokens.forEach(function (token) {
        if (token.t === "bold") line.appendChild(el("strong", null, token.v));
        else if (token.t === "link") {
          var href = safeHref(token.href);
          if (!href) { line.appendChild(document.createTextNode(token.v)); return; }
          var a = el("a", "cb-link", token.v);
          a.href = href; a.target = "_blank"; a.rel = "noopener noreferrer";
          line.appendChild(a);
        } else line.appendChild(document.createTextNode(token.v));
      });
      node.appendChild(line);
    });
  }
  function color(c) { return /^#[0-9a-fA-F]{6}$/.test(c || "") ? c : "#888888"; }
  function mascot(kind, d) {
    var m = el("span", "cb-mascot cb-" + String(kind || "mascot_bot").replace("mascot_", ""));
    m.style.setProperty("--cb-mascot-main", color(d.mascot_primary_color || d.primary_color));
    m.style.setProperty("--cb-mascot-accent", color(d.mascot_accent_color || d.accent_color));
    m.setAttribute("aria-hidden", "true");
    m.appendChild(el("span", "cb-mascot-face"));
    return m;
  }
  function onPage(d) {
    if (!d || d.page_scope !== "chosen") return true;
    var here = location.pathname.replace(/\/$/, "") || "/";
    return (d.chosen_pages || []).some(function (p) {
      try { var path = new URL(p, location.origin).pathname.replace(/\/$/, "") || "/"; return path === here; } catch (e) { return false; }
    });
  }

  fetch(BASE + "/widget-config.json").then(function (r) { return r.json(); }).then(function (cfg) {
    var d = cfg.design || { badge_label: "Chat with us", primary_color: "#1f4fd1", accent_color: "#14b8a6", badge_style: "circle", badge_shape: "current", badge_content: "auto", badge_position: "bottom_right", display_mode: "floating", page_scope: "all", chosen_pages: [], entry_motion: "none", interaction_motion: "none", welcome_motion: "none", working_indicator: false, opening_tasks: [], voice_mode: "off", size: "medium", image_fit: "cover", image_scale: 100, image_position_x: 50, image_position_y: 50, image_border: false, allow_minimize: true, minimize_mode: "keep_button", dock_side: "right", dock_style: "picture_text", dock_label: "Chat", allow_drag: false };
    if (!onPage(d)) return;
    var primary = color(d.primary_color), accent = color(d.accent_color);
    var mountId = script.getAttribute("data-mount");
    var embedded = d.display_mode === "embedded";
    var host = el("div");
    host.setAttribute("data-chatbot", "");
    if (embedded) {
      var target = (mountId && document.getElementById(mountId)) || document.querySelector("[data-chatbot-embed]");
      if (!target) { console.warn("Chatbot: add <div data-chatbot-embed></div> where the chat should appear."); return; }
      target.appendChild(host);
    } else {
      var initialMinimizeMode = d.minimize_mode || "hide_completely";
      if (d.allow_minimize && initialMinimizeMode === "hide_completely" && sessionStorage.getItem(HIDE_KEY) === "1") return;
      document.body.appendChild(host);
    }
    var root = host.attachShadow({ mode: "open" });
    var css = el("link"); css.rel = "stylesheet"; css.href = BASE + "/widget.css";
    root.appendChild(css);
    var wrap = el("div", "cb-root " + (d.badge_position === "bottom_left" ? "cb-left" : "cb-right") + (embedded ? " cb-embedded" : ""));
    root.appendChild(wrap);

    // ---------- chat panel ----------
    var panel = el("div", "cb-panel");
    panel.setAttribute("role", embedded ? "region" : "dialog");
    panel.setAttribute("aria-label", cfg.client_name + " chat");
    var head = el("div", "cb-head"); head.style.background = primary;
    head.appendChild(el("span", null, cfg.client_name));
    var log = el("div", "cb-log"); log.setAttribute("aria-live", "polite"); log.setAttribute("role", "log");
    var form = el("form", "cb-form");
    var lbl = el("label", "cb-sr", "Your message"); lbl.htmlFor = "cb-in";
    var input = el("input", "cb-input"); input.id = "cb-in"; input.maxLength = 1000; input.autocomplete = "off"; input.placeholder = "Type your question…";
    var voiceMode = d.voice_mode || "off";
    var Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    var canListen = voiceMode === "type_and_voice" && !!Recognition;
    var canSpeak = voiceMode !== "off" && !!window.speechSynthesis;
    var mic = null, speak = null, speakOn = false;
    if (canListen) { mic = el("button", "cb-voice", "Mic"); mic.type = "button"; mic.setAttribute("aria-label", "Speak your message"); }
    if (canSpeak) { speak = el("button", "cb-voice", "Read replies: off"); speak.type = "button"; speak.setAttribute("aria-pressed", "false"); }
    var send = el("button", "cb-btn", "Send"); send.type = "submit"; send.style.background = primary;
    form.appendChild(lbl); form.appendChild(input); if (mic) form.appendChild(mic); form.appendChild(send);
    if (speak) { panel.appendChild(head); panel.appendChild(log); panel.appendChild(speak); }
    else { panel.appendChild(head); panel.appendChild(log); }
    panel.appendChild(form);
    if (cfg.credit) panel.appendChild(el("div", "cb-credit", "Chatbot by Michael jo Tech"));

    function add(text, who) {
      var m = el("div", "cb-msg " + (who === "user" ? "cb-user" : "cb-bot"));
      if (who === "user") { m.style.background = primary; m.textContent = text; }
      else renderAnswer(m, text);
      log.appendChild(m); log.scrollTop = log.scrollHeight;
      if (who !== "user" && speakOn && canSpeak && text) { window.speechSynthesis.cancel(); var utterance = new SpeechSynthesisUtterance(typeof answerPlain === "function" ? answerPlain(text) : text); window.speechSynthesis.speak(utterance); }
      return m;
    }
    if (speak) speak.addEventListener("click", function () { speakOn = !speakOn; speak.textContent = "Read replies: " + (speakOn ? "on" : "off"); speak.setAttribute("aria-pressed", String(speakOn)); if (!speakOn) window.speechSynthesis.cancel(); });
    if (mic) mic.addEventListener("click", function () {
      var rec = new Recognition(); rec.lang = document.documentElement.lang || "en-US"; rec.interimResults = false;
      mic.disabled = true; mic.textContent = "Listening…";
      rec.onresult = function (e) { input.value = e.results[0][0].transcript; input.focus(); };
      rec.onerror = function () { input.focus(); };
      rec.onend = function () { mic.disabled = false; mic.textContent = "Mic"; };
      rec.start();
    });
    function leadForm(box) {
      var f = el("form", "cb-lead");
      var n = el("input"); n.type = "text"; n.placeholder = "Your name"; n.maxLength = 120; n.setAttribute("aria-label", "Your name"); n.required = true;
      var c = el("input"); c.type = "text"; c.placeholder = "Phone or email"; c.maxLength = 200; c.setAttribute("aria-label", "Phone or email"); c.required = true;
      var t = el("input"); t.type = "text"; t.placeholder = "What is it about? (no health details)"; t.maxLength = 200; t.setAttribute("aria-label", "Topic");
      var cl = el("label"); var cb = el("input"); cb.type = "checkbox"; cl.appendChild(cb); cl.appendChild(document.createTextNode(" I agree to be contacted about my request."));
      var b = el("button", "cb-btn", "Send details"); b.type = "submit"; b.style.background = primary;
      var st = el("div"); st.setAttribute("role", "status");
      [n, c, t, cl, b, st].forEach(function (x) { f.appendChild(x); });
      f.addEventListener("submit", function (e) {
        e.preventDefault();
        if (!cb.checked) { st.textContent = "Please tick the box to agree first."; return; }
        b.disabled = true;
        fetch(BASE + "/lead", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: n.value, contact: c.value, topic: t.value, consent: true }) })
          .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
          .then(function (x) { st.textContent = x.ok ? "Thanks — the office will contact you." : (x.j.message || "Couldn't send."); b.disabled = x.ok; })
          .catch(function () { st.textContent = "Couldn't send. Please try again."; b.disabled = false; });
      });
      box.appendChild(f);
    }
    function reply(j) {
      var m = add(j.text || j.message || "Sorry, something went wrong.", "bot");
      if (j.citations && j.citations.length) {
        var s = el("div", "cb-src", "Source: ");
        j.citations.forEach(function (c, i) {
          if (i) s.appendChild(document.createTextNode(", "));
          var href = safeHref(c.source_url);
          if (href) { var a = el("a", null, c.title); a.href = href; a.target = "_blank"; a.rel = "noopener noreferrer"; s.appendChild(a); }
          else s.appendChild(document.createTextNode(c.title));
        });
        m.appendChild(s);
      }
      if (j.actions && j.actions.length) {
        var box = el("div", "cb-actions");
        j.actions.forEach(function (a) {
          if (a.kind === "lead_form") {
            if (!cfg.lead_form) return;
            var lb = el("button", "cb-btn", a.label); lb.type = "button"; lb.style.background = accent;
            lb.addEventListener("click", function () { lb.remove(); leadForm(m); });
            box.appendChild(lb);
          } else {
            var href = safeHref(a.href); if (!href) return;
            var l = el("a", "cb-btn", a.label); l.href = href; l.style.background = accent;
            if (/^https?:/i.test(href)) { l.target = "_blank"; l.rel = "noopener noreferrer"; }
            box.appendChild(l);
          }
        });
        m.appendChild(box);
      }
      log.scrollTop = log.scrollHeight;
    }
    var turns = [];
    var working = null;
    function ask(text) {
      input.value = text;
      if (form.requestSubmit) form.requestSubmit(); else send.click();
    }
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var text = input.value.trim(); if (!text) return;
      input.value = ""; add(text, "user"); send.disabled = true;
      if (mic) mic.disabled = true;
      if (d.working_indicator) { working = add("Working…", "bot"); working.classList.add("cb-working"); }
      if (badge) badge.classList.add("cb-thinking");
      var past = turns.slice(-8); turns.push({ role: "visitor", text: text });
      fetch(BASE + "/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: text, history: past, session: SESSION }) })
        .then(function (r) { return r.json(); }).then(function (j) { if (j && j.text) turns.push({ role: "bot", text: String(j.text).slice(0, 800) }); reply(j); })
        .catch(function () { add("Sorry, the chat isn't available right now. Please contact the office directly.", "bot"); })
        .finally(function () { if (working) { working.remove(); working = null; } if (badge) { badge.classList.remove("cb-thinking"); badge.classList.add("cb-responding"); setTimeout(function () { badge.classList.remove("cb-responding"); }, 500); } send.disabled = false; if (mic) mic.disabled = false; input.focus(); });
    });
    add("Hi! How can I help?", "bot");
    if (Array.isArray(d.opening_tasks) && d.opening_tasks.length) {
      var openActions = el("div", "cb-opening");
      d.opening_tasks.forEach(function (a) {
        var href = safeHref(a.href);
        if (a.kind === "link" && href) { var l = el("a", "cb-task", a.label); l.href = href; if (/^https?:/i.test(href)) { l.target = "_blank"; l.rel = "noopener noreferrer"; } openActions.appendChild(l); }
        else { var b = el("button", "cb-task", a.label); b.type = "button"; b.addEventListener("click", function () { if (a.kind === "lead_form") { b.remove(); leadForm(openActions); } else ask(a.prompt || a.label); }); openActions.appendChild(b); }
      });
      log.appendChild(openActions);
    }

    if (embedded) { wrap.appendChild(panel); return; }

    // ---------- floating badge (mirrors the saved design exactly) ----------
    var dim = { small: 48, medium: 60, large: 72 }[d.size] || 60;
    var shape = d.badge_shape && d.badge_shape !== "current" ? d.badge_shape : d.badge_style;
    var pill = shape === "pill";
    var badgeWrap = el("div", "cb-badge-wrap" + (d.allow_drag ? " cb-drag" : ""));
    if (d.entry_motion !== "none") badgeWrap.style.animation = (d.entry_motion === "slide_left" ? "cb-in-left" : "cb-in-right") + " .6s ease-out";
    var anchor = el("div", "cb-anchor"); anchor.style.width = pill ? "auto" : dim + "px";
    var badge = el("button", "cb-badge cb-shape-" + shape + " cb-motion-" + (d.interaction_motion || "none") + " cb-welcome-" + (d.welcome_motion || "none")); badge.type = "button";
    badge.setAttribute("aria-label", "Open chat: " + (d.badge_label || "Chat with us"));
    badge.setAttribute("aria-expanded", "false");
    badge.style.cssText += ";width:" + (pill ? "auto" : dim + "px") + ";min-width:" + dim + "px;height:" + dim + "px;padding:" + (pill ? "0 14px" : "0") +
      ";border-radius:" + (shape === "rounded" ? 14 : shape === "circle" || shape === "pill" ? 999 : 0) + "px;background:" + (shape === "cutout" ? "transparent" : primary) + ";border:3px solid " + (shape === "cutout" || (cfg.badge_image && (!d.badge_content || d.badge_content === "auto") && d.image_border === false) ? "transparent" : accent);
    if (d.badge_content && d.badge_content !== "auto") {
      badge.appendChild(mascot(d.badge_content, d));
    } else if (cfg.badge_image) {
      var img = el("img"); img.src = BASE + "/" + cfg.badge_image; img.alt = ""; img.draggable = false;
      var pos = d.image_position_x + "% " + d.image_position_y + "%";
      img.style.objectFit = d.image_fit; img.style.objectPosition = pos;
      img.style.transform = "scale(" + d.image_scale / 100 + ")"; img.style.transformOrigin = pos;
      badge.appendChild(img);
    } else {
      badge.insertAdjacentHTML("beforeend", ICON);
      if (pill) badge.appendChild(el("span", "cb-pill-label", d.badge_label || "Chat with us"));
    }
    anchor.appendChild(badge);
    if (cfg.badge_image && (!d.badge_content || d.badge_content === "auto")) {
      var sym = el("span", "cb-symbol"); sym.style.background = accent; sym.insertAdjacentHTML("beforeend", ICON);
      anchor.appendChild(sym);
    }
    badgeWrap.appendChild(anchor);
    var label = null;
    if (!pill) {
      label = el("button", "cb-label", d.badge_label || "Chat with us"); label.type = "button"; label.style.background = primary; label.tabIndex = -1;
      badgeWrap.appendChild(label);
    }
    wrap.appendChild(badgeWrap);

    var open = false;
    var minimizeMode = d.minimize_mode || "hide_completely";
    var tucked = false;
    if (minimizeMode === "side_tab") {
      // Side-tab designs let visitors slide the closed chat button to the page edge and pull it back.
      var tuck = el("button", "cb-hide cb-tuck", d.dock_side === "left" ? "\u2039" : "\u203A"); tuck.type = "button";
      tuck.setAttribute("aria-label", "Slide chat button to the side"); tuck.title = "Slide to the side";
      tuck.addEventListener("click", function (e) { e.stopPropagation(); tucked = true; badgeWrap.hidden = true; badgeWrap.style.display = "none"; wrap.appendChild(makeDock()); dock.focus(); });
      badgeWrap.appendChild(tuck);
    }
    var dock = null;
    function makeDock() {
      if (dock) return dock;
      dock = el("button", "cb-dock cb-dock-" + (d.dock_side === "left" ? "left" : "right"));
      dock.type = "button"; dock.setAttribute("aria-label", "Reopen chat"); dock.style.background = primary;
      var dockStyle = d.dock_style || "picture_text";
      if (dockStyle === "strip") { dock.className += " cb-dock-strip"; dock.title = String(d.dock_label || "Chat"); }
      else if (dockStyle !== "text") {
        var art = el("span", "cb-dock-art");
        if (dockStyle === "icon") art.insertAdjacentHTML("beforeend", ICON);
        else if (d.badge_content && d.badge_content !== "auto") art.appendChild(mascot(d.badge_content, d));
        else if (cfg.badge_image) { var dockImg = el("img"); dockImg.src = BASE + "/" + cfg.badge_image; dockImg.alt = ""; art.appendChild(dockImg); }
        else art.insertAdjacentHTML("beforeend", ICON);
        dock.appendChild(art);
      }
      if (dockStyle !== "picture" && dockStyle !== "strip") dock.appendChild(el("span", null, String(d.dock_label || "Chat").slice(0, 20)));
      dock.addEventListener("click", function () { dock.remove(); dock = null; badgeWrap.hidden = false; badgeWrap.style.display = ""; if (tucked) { tucked = false; badge.focus(); } else toggle(true); });
      return dock;
    }
    function minimize() {
      if (!open) return;
      open = false; panel.remove(); badge.setAttribute("aria-expanded", "false");
      if (minimizeMode === "side_tab") { badgeWrap.hidden = true; badgeWrap.style.display = "none"; wrap.appendChild(makeDock()); dock.focus(); }
      else { badge.focus(); }
    }
    function hideAssistant() { sessionStorage.setItem(HIDE_KEY, "1"); host.remove(); }
    function toggle(forceOpen) {
      open = forceOpen === true ? true : !open;
      badge.setAttribute("aria-expanded", String(open));
      if (open) {
        wrap.appendChild(panel); input.focus();
        var head2 = head.querySelector(".cb-close");
        if (!head2) {
          var close = el("button", "cb-close", minimizeMode === "hide_completely" ? "×" : "−"); close.type = "button";
          close.setAttribute("aria-label", minimizeMode === "hide_completely" ? "Hide assistant" : "Minimize chat");
          close.title = minimizeMode === "hide_completely" ? "Hide assistant" : "Minimize chat";
          close.addEventListener("click", minimizeMode === "hide_completely" ? hideAssistant : minimize);
          if (d.allow_minimize || minimizeMode !== "hide_completely") head.appendChild(close);
        }
      } else panel.remove();
    }
    panel.addEventListener("keydown", function (e) { if (e.key === "Escape" && open) { toggle(); badge.focus(); } });

    // Drag anywhere (only when the saved design allows it). A short press without movement still opens the chat.
    var drag = null, moved = false;
    badgeWrap.addEventListener("pointerdown", function (e) {
      moved = false;
      if (!d.allow_drag) return;
      // Never capture presses on the slide-away arrow, otherwise its click is retargeted and opens the chat.
      if (e.target && e.target.closest && e.target.closest(".cb-hide")) return;
      var r = wrap.getBoundingClientRect();
      drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, left: r.left, top: r.top };
      badgeWrap.setPointerCapture(e.pointerId);
    });
    badgeWrap.addEventListener("pointermove", function (e) {
      if (!drag || drag.id !== e.pointerId) return;
      var dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (!moved && Math.abs(dx) + Math.abs(dy) < 5) return;
      moved = true;
      var r = wrap.getBoundingClientRect();
      var left = Math.max(0, Math.min(window.innerWidth - r.width, drag.left + dx));
      var top = Math.max(40, Math.min(window.innerHeight - r.height, drag.top + dy));
      badgeWrap.style.animation = "none";
      wrap.style.left = left + "px"; wrap.style.top = top + "px"; wrap.style.right = "auto"; wrap.style.bottom = "auto";
    });
    function endDrag() { drag = null; }
    badgeWrap.addEventListener("pointerup", endDrag);
    badgeWrap.addEventListener("pointercancel", endDrag);
    // Pointer capture during drag retargets clicks to the wrapper, so handle clicks there.
    badgeWrap.addEventListener("click", function (e) {
      if (e.target && e.target.closest && e.target.closest(".cb-hide")) return;
      if (moved) { moved = false; return; }
      toggle();
    });
  }).catch(function () { /* backend unreachable: show nothing rather than a broken badge */ });
})();
