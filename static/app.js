/* ============================================================
   pyMusicGPT – client-side application
   ============================================================ */

const API = "";          // same origin
const POLL_MS = 2000;    // how often to poll pending entries

// ---------- state ----------
let currentSessionId = null;
const pendingEntries = new Map();   // entryId -> { element, intervalId }

// ---------- DOM helpers ----------
const $ = id => document.getElementById(id);
const sessionList = $("sessionList");
const messages    = $("messages");
const emptyState  = $("emptyState");
const deckMount   = $("deckMount");   // lives inside emptyState, which is detached once a chat has tracks

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
          messages.innerHTML = "";
          messages.appendChild(emptyState);
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

// ---------- entries ----------
async function loadEntries(sessionId) {
  const entries = await apiFetch(`/api/sessions/${sessionId}/entries`);
  if (sessionId !== currentSessionId) return;   // user switched sessions meanwhile
  stopAllPolling();
  messages.innerHTML = "";
  if (entries.length === 0) {
    messages.appendChild(emptyState);
    return;
  }
  entries.forEach(e => addMessageToUI(e));
  entries.filter(e => e.status === "pending").forEach(e => startPolling(e.id));
  scrollToBottom();
}

function addMessageToUI(entry) {
  // Remove empty state if present
  emptyState.remove();

  const wrapper = document.createElement("div");
  wrapper.className = "message";
  wrapper.id = `entry-${entry.id}`;

  // User prompt bubble
  const prompt = document.createElement("div");
  prompt.className = "message-prompt";
  prompt.textContent = entry.prompt;
  wrapper.appendChild(prompt);

  // Response card
  const response = document.createElement("div");
  response.className = "message-response";
  wrapper.appendChild(response);

  messages.appendChild(wrapper);

  updateEntryUI(entry, response);
  return { wrapper, response };
}

function updateEntryUI(entry, responseEl) {
  responseEl.innerHTML = "";

  if (entry.status === "pending") {
    const badge = document.createElement("div");
    badge.className = "status-badge";
    badge.innerHTML = `<span class="spinner"></span> Generating…`;
    responseEl.appendChild(badge);

    const logArea = document.createElement("div");
    logArea.className = "entry-logs";
    logArea.style.fontSize = "0.8rem";
    logArea.style.marginTop = "5px";
    logArea.style.opacity = "0.7";
    logArea.textContent = "Waiting for server logs...";
    responseEl.appendChild(logArea);
  } else if (entry.status === "done" && entry.audio_file) {
    const row = document.createElement("div");
    row.className = "player-row";

    const audio = document.createElement("audio");
    audio.className = "audio-player";
    audio.controls = true;
    audio.loop = true;   // tracks are crossfaded server-side to loop seamlessly
    audio.src = `/api/entries/${entry.id}/audio`;

    const loopBtn = document.createElement("button");
    loopBtn.type = "button";
    loopBtn.className = "icon-btn loop-toggle";
    loopBtn.textContent = "🔁";
    const syncLoop = () => {
      loopBtn.setAttribute("aria-pressed", String(audio.loop));
      loopBtn.title = audio.loop ? "Looping — click to play once" : "Plays once — click to loop";
    };
    loopBtn.addEventListener("click", () => { audio.loop = !audio.loop; syncLoop(); });
    syncLoop();

    row.append(audio, loopBtn);
    responseEl.appendChild(row);

    const badge = document.createElement("div");
    badge.className = "status-badge";
    badge.textContent = "✅ Ready";
    responseEl.appendChild(badge);
  } else {
    const err = document.createElement("div");
    err.className = "error-text";
    err.textContent = "❌ Generation failed. Please try again.";
    responseEl.appendChild(err);
  }
}

function stopAllPolling() {
  pendingEntries.forEach(intervalId => clearInterval(intervalId));
  pendingEntries.clear();
}

function startPolling(entryId) {
  if (pendingEntries.has(entryId)) return;
  const el = document.querySelector(`#entry-${entryId} .message-response`);
  if (!el) return;

  const intervalId = setInterval(async () => {
    try {
      const entry = await apiFetch(`/api/entries/${entryId}`);
      updateEntryUI(entry, el);
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
  await loadSessions();
}

$("promptForm").addEventListener("submit", async e => {
  e.preventDefault();

  const prompt = $("promptInput").value.trim();
  const secs   = parseInt($("durationInput").value, 10) || 10;
  if (!prompt) return;

  $("sendBtn").disabled = true;

  try {
    await ensureSession(prompt);   // no chat selected → start one automatically
    $("promptInput").value = "";
    closeDeckPopover();

    const entry = await apiFetch(`/api/sessions/${currentSessionId}/generate`, {
      method: "POST",
      body: JSON.stringify({ prompt, duration_secs: secs, loop: true }),
    });

    const { response } = addMessageToUI(entry);
    scrollToBottom();
    startPolling(entry.id);
  } catch (err) {
    alert(`Error: ${err.message}`);
  } finally {
    $("sendBtn").disabled = false;
    $("promptInput").focus();
  }
});

// ---------- utils ----------
function scrollToBottom() {
  messages.scrollTop = messages.scrollHeight;
}

// ---------- idea deck ----------
const deck = new IdeaDeck({
  getUseTarget: () => $("promptInput"),
  onUse: idea => {
    closeDeckPopover();
    const input = $("promptInput");
    input.value = idea.prompt;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  },
});
deckMount.appendChild(deck.el);

function openDeckPopover() {
  $("deckPopoverBody").appendChild(deck.el);
  $("deckPopover").hidden = false;
  $("deckBtn").setAttribute("aria-expanded", "true");
}

function closeDeckPopover() {
  if ($("deckPopover").hidden) return;
  $("deckPopover").hidden = true;
  deckMount.appendChild(deck.el);   // home is the empty-chat screen (may be detached)
  $("deckBtn").setAttribute("aria-expanded", "false");
}

$("deckBtn").addEventListener("click", () => {
  if (emptyState.isConnected && $("deckPopover").hidden) {
    // Deck is already on screen (empty chat): just deal a card.
    deck.el.scrollIntoView({ behavior: "smooth", block: "center" });
    deck.draw();
  } else if ($("deckPopover").hidden) {
    openDeckPopover();
  } else {
    closeDeckPopover();
  }
});

document.querySelectorAll("[data-close-deck]").forEach(el =>
  el.addEventListener("click", closeDeckPopover));
document.addEventListener("keydown", e => {
  if (e.key === "Escape") closeDeckPopover();
});

// ---------- system metrics (coloured percentages) ----------
function setMetric(key, percent) {
  const el = $(`metric-${key}`);
  if (!el) return;
  const known = typeof percent === "number" && Number.isFinite(percent);
  const pct = known ? Math.max(0, Math.min(100, percent)) : 0;
  el.querySelector(".metric-value").textContent = known ? `${Math.round(pct)}%` : "n/a";
  el.dataset.level = !known ? "na" : pct >= 85 ? "hot" : pct >= 60 ? "warn" : "ok";
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

  updateMetrics();
  await loadSessions();
})();

