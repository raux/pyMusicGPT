/* ============================================================
   pyMusicGPT – client-side application
   The chat is a card table: the deck (Ideas / Build) is docked on top
   and every generation appears below it as a "played card".
   ============================================================ */

const API = "";          // same origin
const POLL_MS = 2000;    // how often to poll pending entries

// ---------- state ----------
let currentSessionId = null;
const pendingEntries = new Map();   // entryId -> intervalId
let pendingMeta = null;             // card / hand last placed in the prompt box

// ---------- DOM helpers ----------
const $ = id => document.getElementById(id);
const sessionList = $("sessionList");
const messages    = $("messages");
const playedGrid  = $("playedGrid");
const playedHead  = $("playedHead");
const playedEmpty = $("playedEmpty");
const promptInput = $("promptInput");

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

// ---------- theme ----------
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  $("themeToggle").textContent = theme === "dark" ? "☀️" : "🌙";
}

$("themeToggle").addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  localStorage.setItem("theme", next);
  applyTheme(next);
});

// ---------- sidebar toggle ----------
$("sidebarToggle").addEventListener("click", () => {
  document.querySelector(".sidebar").classList.toggle("hidden");
});

// ---------- API helpers ----------
async function apiFetch(path, options = {}) {
  const res = await fetch(API + path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(`${res.status} ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ---------- card metadata (which card / hand a track came from) ----------
// Stored in the browser only, keyed by entry id; unknown tracks show as Custom.
const META_KEY = "pmg-card-meta";

function loadMetaMap() {
  try { return JSON.parse(localStorage.getItem(META_KEY)) || {}; } catch { return {}; }
}

function getCardMeta(entryId) {
  return loadMetaMap()[entryId] || null;
}

function saveCardMeta(entryId, meta) {
  if (!meta) return;
  const map = loadMetaMap();
  map[entryId] = meta;
  try { localStorage.setItem(META_KEY, JSON.stringify(map)); } catch { /* storage full/blocked */ }
}

// ---------- sessions ----------
async function loadSessions() {
  const sessions = await apiFetch("/api/sessions");
  renderSessions(sessions);
}

function renderSessions(sessions) {
  sessionList.innerHTML = "";
  sessions.forEach(s => {
    const item = document.createElement("div");
    item.className = "session-item" + (s.id === currentSessionId ? " active" : "");
    item.dataset.id = s.id;

    const name = document.createElement("span");
    name.className = "session-name";
    name.textContent = s.name;
    name.title = s.name;

    const del = document.createElement("button");
    del.className = "session-delete";
    del.textContent = "✕";
    del.title = "Delete session";
    del.addEventListener("click", async e => {
      e.stopPropagation();
      if (confirm(`Delete "${s.name}"?`)) {
        await apiFetch(`/api/sessions/${s.id}`, { method: "DELETE" });
        if (currentSessionId === s.id) {
          stopAllPolling();
          currentSessionId = null;
          clearPlayed();
          $("sessionTitle").textContent = "Select or create a chat";
        }
        await loadSessions();
      }
    });

    item.appendChild(name);
    item.appendChild(del);
    item.addEventListener("click", () => selectSession(s.id, s.name));

    sessionList.appendChild(item);
  });
}

async function selectSession(id, name) {
  currentSessionId = id;
  $("sessionTitle").textContent = name;
  await loadSessions();   // refresh to update active state
  await loadEntries(id);
}

$("newChatBtn").addEventListener("click", async () => {
  const session = await apiFetch("/api/sessions", {
    method: "POST",
    body: JSON.stringify({ name: `Chat ${new Date().toLocaleTimeString()}` }),
  });
  await loadSessions();
  await selectSession(session.id, session.name);
});

// ---------- played cards (generated tracks) ----------
function syncPlayedEmpty() {
  const hasCards = playedGrid.children.length > 0;
  playedEmpty.hidden = hasCards;
  playedHead.hidden = !hasCards;
}

function clearPlayed() {
  playedGrid.replaceChildren();
  syncPlayedEmpty();
}

async function loadEntries(sessionId) {
  const entries = await apiFetch(`/api/sessions/${sessionId}/entries`);
  if (sessionId !== currentSessionId) return;   // user switched sessions meanwhile
  stopAllPolling();
  playedGrid.replaceChildren();
  entries.forEach(e => addPlayedCard(e));
  entries.filter(e => e.status === "pending").forEach(e => startPolling(e.id));
  syncPlayedEmpty();
  if (entries.length) scrollToBottom();
}

function addPlayedCard(entry, meta = getCardMeta(entry.id)) {
  const { TYPES, SLOTS } = window.Cards;
  const type = meta && TYPES[meta.type] ? meta.type : "custom";
  const isBuild = meta && meta.kind === "build";

  const card = el("article", `played-card type-${type}`);
  card.id = `entry-${entry.id}`;
  card.setAttribute("aria-label", `${meta ? meta.title : "Custom prompt"}: ${entry.prompt}`);
  card.appendChild(window.Cards.artElement(type));

  const body = el("div", "card-body");
  const kicker = type === "custom" && !isBuild
    ? "CUSTOM"
    : `${isBuild ? "🧩 BUILD · " : ""}${TYPES[type].label.toUpperCase()}`;
  body.append(el("div", "card-type", kicker), el("div", "card-title", meta ? meta.title : "Custom prompt"));

  if (isBuild && meta.parts) {
    const badges = el("div", "part-badges");
    SLOTS.filter(s => s.key !== "style" && meta.parts[s.key]).forEach(s => {
      badges.appendChild(el("span", `part-badge type-${s.key}`, `${s.icon} ${meta.parts[s.key]}`));
    });
    if (badges.children.length) body.appendChild(badges);
  }

  const prompt = el("div", "card-prompt", entry.prompt);
  prompt.title = entry.prompt;
  const response = el("div", "played-response");
  body.append(prompt, response);
  card.appendChild(body);

  playedGrid.appendChild(card);
  syncPlayedEmpty();
  updateEntryUI(entry, response);
  return card;
}

function updateEntryUI(entry, responseEl) {
  const card = responseEl.closest(".played-card");
  responseEl.replaceChildren();
  if (card) {
    card.classList.toggle("is-pending", entry.status === "pending");
    card.classList.toggle("is-error", entry.status === "error");
    const oldLoop = card.querySelector(".card-loop");
    if (oldLoop) oldLoop.remove();
  }

  if (entry.status === "pending") {
    const badge = el("div", "status-badge");
    badge.append(el("span", "spinner"), document.createTextNode(" Generating…"));
    responseEl.appendChild(badge);
  } else if (entry.status === "done" && entry.audio_file) {
    const audio = el("audio", "audio-player");
    audio.controls = true;
    audio.loop = true;   // tracks are crossfaded server-side to loop seamlessly
    audio.preload = "metadata";
    audio.src = `/api/entries/${entry.id}/audio`;
    responseEl.appendChild(audio);

    if (card) {
      // The card art animates while its track is playing.
      audio.addEventListener("play", () => card.classList.add("is-playing"));
      ["pause", "ended"].forEach(ev =>
        audio.addEventListener(ev, () => card.classList.remove("is-playing")));

      const loopBtn = el("button", "icon-btn loop-toggle card-loop", "🔁");
      loopBtn.type = "button";
      const syncLoop = () => {
        loopBtn.setAttribute("aria-pressed", String(audio.loop));
        loopBtn.title = audio.loop ? "Looping — click to play once" : "Plays once — click to loop";
        loopBtn.setAttribute("aria-label", loopBtn.title);
      };
      loopBtn.addEventListener("click", () => { audio.loop = !audio.loop; syncLoop(); });
      syncLoop();
      card.appendChild(loopBtn);
    }
  } else {
    responseEl.appendChild(el("div", "error-text", "❌ Generation failed — please try again."));
  }
}

function stopAllPolling() {
  pendingEntries.forEach(intervalId => clearInterval(intervalId));
  pendingEntries.clear();
}

function startPolling(entryId) {
  if (pendingEntries.has(entryId)) return;
  const responseEl = document.querySelector(`#entry-${entryId} .played-response`);
  if (!responseEl) return;

  const intervalId = setInterval(async () => {
    try {
      const entry = await apiFetch(`/api/entries/${entryId}`);
      updateEntryUI(entry, responseEl);
      if (entry.status !== "pending") {
        clearInterval(intervalId);
        pendingEntries.delete(entryId);
      }
    } catch (e) {
      clearInterval(intervalId);
      pendingEntries.delete(entryId);
    }
  }, POLL_MS);

  pendingEntries.set(entryId, intervalId);
}

// ---------- generate ----------
async function ensureSession(prompt) {
  if (currentSessionId) return;
  const name = prompt.length > 32 ? `${prompt.slice(0, 32).trim()}…` : prompt;
  const session = await apiFetch("/api/sessions", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  currentSessionId = session.id;
  $("sessionTitle").textContent = session.name;
  clearPlayed();
  await loadSessions();
}

promptInput.addEventListener("input", () => {
  if (!promptInput.value.trim()) pendingMeta = null;   // cleared → next prompt is Custom
});

$("promptForm").addEventListener("submit", async e => {
  e.preventDefault();

  const prompt = promptInput.value.trim();
  const secs   = parseInt($("durationInput").value, 10) || 10;
  if (!prompt) return;

  $("sendBtn").disabled = true;

  try {
    await ensureSession(prompt);   // no chat selected → start one automatically
    const meta = pendingMeta;
    pendingMeta = null;
    promptInput.value = "";

    const entry = await apiFetch(`/api/sessions/${currentSessionId}/generate`, {
      method: "POST",
      body: JSON.stringify({ prompt, duration_secs: secs, loop: true }),
    });
    saveCardMeta(entry.id, meta);
    addPlayedCard(entry, meta);
    scrollToBottom();
    startPolling(entry.id);
  } catch (err) {
    alert(`Error: ${err.message}`);
  } finally {
    $("sendBtn").disabled = false;
    promptInput.focus();
  }
});

// ---------- utils ----------
function scrollToBottom() {
  messages.scrollTo({ top: messages.scrollHeight, behavior: "smooth" });
}

// ---------- docked deck (Ideas / Build) ----------
function usePrompt(prompt, meta) {
  promptInput.value = prompt;
  pendingMeta = meta;
  promptInput.focus();
  promptInput.setSelectionRange(prompt.length, prompt.length);
}

const ideaDeck = new IdeaDeck({
  getUseTarget: () => promptInput,
  onUse: idea => usePrompt(idea.prompt, { kind: "idea", type: idea.type, title: idea.title }),
});
const buildTable = new BuildTable({
  onUse: ({ prompt, meta }) => usePrompt(prompt, meta),
});
$("dockIdeas").appendChild(ideaDeck.el);
$("dockBuild").appendChild(buildTable.el);

const TABS = { ideas: $("tabIdeas"), build: $("tabBuild") };
let activeTab = "ideas";

function setTab(name, focus = false) {
  if (!TABS[name]) name = "ideas";
  activeTab = name;
  Object.entries(TABS).forEach(([key, tab]) => {
    const selected = key === name;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
    $(tab.getAttribute("aria-controls")).hidden = !selected;
  });
  if (focus) TABS[name].focus();
  localStorage.setItem("pmg-deck-tab", name);
}

Object.values(TABS).forEach(tab => {
  tab.addEventListener("click", () => setTab(tab.dataset.tab));
  tab.addEventListener("keydown", e => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      setTab(activeTab === "ideas" ? "build" : "ideas", true);
    }
  });
});

function setDockCollapsed(collapsed) {
  $("deckDock").classList.toggle("collapsed", collapsed);
  $("dockBody").hidden = collapsed;
  $("dockToggle").textContent = collapsed ? "▸ Show deck" : "▾ Hide";
  $("dockToggle").setAttribute("aria-expanded", String(!collapsed));
  localStorage.setItem("pmg-deck-collapsed", collapsed ? "1" : "0");
}

$("dockToggle").addEventListener("click", () =>
  setDockCollapsed(!$("deckDock").classList.contains("collapsed")));

$("deckBtn").addEventListener("click", () => {
  setDockCollapsed(false);
  messages.scrollTo({ top: 0, behavior: "smooth" });
  if (activeTab === "build") buildTable.dealAll();
  else ideaDeck.draw();
});

// ---------- system metrics (coloured percentages) ----------
function setMetric(key, percent) {
  const metric = $(`metric-${key}`);
  if (!metric) return;
  const known = typeof percent === "number" && Number.isFinite(percent);
  const pct = known ? Math.max(0, Math.min(100, percent)) : 0;
  metric.querySelector(".metric-value").textContent = known ? `${Math.round(pct)}%` : "n/a";
  metric.dataset.level = !known ? "na" : pct >= 85 ? "hot" : pct >= 60 ? "warn" : "ok";
}

async function updateMetrics() {
  try {
    const m = await apiFetch("/api/system/metrics");
    setMetric("cpu", m.cpu?.percent);
    setMetric("gpu", m.gpu?.percent);
    setMetric("ram", m.ram?.percent);
  } catch (e) {
    console.error("Failed to fetch metrics", e);
  }
}
setInterval(updateMetrics, 2000);

// ---------- init ----------
(async () => {
  const savedTheme = localStorage.getItem("theme") || "dark";
  applyTheme(savedTheme);
  setTab(localStorage.getItem("pmg-deck-tab") || "ideas");
  setDockCollapsed(localStorage.getItem("pmg-deck-collapsed") === "1");
  syncPlayedEmpty();

  updateMetrics();
  await loadSessions();
})();
