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
  messages.innerHTML = "";
  if (entries.length === 0) {
    messages.appendChild(emptyState);
    return;
  }
  entries.forEach(e => addMessageToUI(e));
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
  } else if (entry.status === "done" && entry.audio_file) {
    const audio = document.createElement("audio");
    audio.className = "audio-player";
    audio.controls = true;
    audio.src = `/api/entries/${entry.id}/audio`;
    responseEl.appendChild(audio);

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

function startPolling(entryId) {
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
$("promptForm").addEventListener("submit", async e => {
  e.preventDefault();
  if (!currentSessionId) {
    alert("Please create or select a chat first.");
    return;
  }

  const prompt = $("promptInput").value.trim();
  const secs   = parseInt($("durationInput").value, 10) || 10;

  $("promptInput").value = "";
  $("sendBtn").disabled = true;

  try {
    const entry = await apiFetch(`/api/sessions/${currentSessionId}/generate`, {
      method: "POST",
      body: JSON.stringify({ prompt, duration_secs: secs }),
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

// ---------- init ----------
(async () => {
  const savedTheme = localStorage.getItem("theme") || "dark";
  applyTheme(savedTheme);

  await loadSessions();

  // Resume polling for any pending entries after a page reload
  if (currentSessionId) {
    const entries = await apiFetch(`/api/sessions/${currentSessionId}/entries`);
    entries.filter(e => e.status === "pending").forEach(e => startPolling(e.id));
  }
})();
