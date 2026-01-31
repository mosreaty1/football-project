// ── Embed sources ──
const SOURCES = {
    hlsplayer:  url => "https://www.hlsplayer.net/?url=" + encodeURIComponent(url),
    bestm3u8:   url => "https://bestm3u8player.com/player.html?url=" + encodeURIComponent(url),
    anym3u8:    url => "https://anym3u8player.com/tv/p.php?url=" + encodeURIComponent(url),
    anym3u8vjs: url => "https://anym3u8player.com/tv/video-player.php?url=" + encodeURIComponent(url),
};

// ── Elements ──
const urlInput        = document.getElementById("urlInput");
const playBtn         = document.getElementById("playBtn");
const openTabBtn      = document.getElementById("openTabBtn");
const sourceSelect    = document.getElementById("sourceSelect");
const playerFrame     = document.getElementById("playerFrame");
const overlay         = document.getElementById("overlay");
const loadingOverlay  = document.getElementById("loadingOverlay");
const fallbackMsg     = document.getElementById("fallbackMsg");
const fallbackLink    = document.getElementById("fallbackLink");
const historySection  = document.getElementById("historySection");
const historyList     = document.getElementById("historyList");

let currentEmbedUrl = "";
let fallbackTimer   = null;

// ── Settings (safe localStorage) ──

function storageGet(key) {
    try { return localStorage.getItem(key); } catch { return null; }
}
function storageSet(key, val) {
    try { localStorage.setItem(key, val); } catch { /* ignore */ }
}

function loadSettings() {
    const raw = storageGet("m3u8player_settings");
    if (raw) {
        const s = JSON.parse(raw);
        if (s.source && SOURCES[s.source]) sourceSelect.value = s.source;
    }
}

function saveSettings() {
    storageSet("m3u8player_settings", JSON.stringify({ source: sourceSelect.value }));
}

// ── History ──

function loadHistory() {
    const raw = storageGet("m3u8player_history");
    return raw ? JSON.parse(raw) : [];
}

function addToHistory(url) {
    let h = loadHistory().filter(i => i !== url);
    h.unshift(url);
    if (h.length > 10) h.pop();
    storageSet("m3u8player_history", JSON.stringify(h));
    renderHistory();
}

function removeFromHistory(url) {
    const h = loadHistory().filter(i => i !== url);
    storageSet("m3u8player_history", JSON.stringify(h));
    renderHistory();
}

function renderHistory() {
    const h = loadHistory();
    if (!h.length) { historySection.hidden = true; return; }
    historySection.hidden = false;
    historyList.innerHTML = "";
    h.forEach(url => {
        const li  = document.createElement("li");
        const a   = document.createElement("a");
        a.textContent = url;
        a.title = url;
        a.addEventListener("click", () => { urlInput.value = url; play(url); });
        const btn = document.createElement("button");
        btn.textContent = "\u00d7";
        btn.title = "Remove";
        btn.addEventListener("click", () => removeFromHistory(url));
        li.appendChild(a);
        li.appendChild(btn);
        historyList.appendChild(li);
    });
}

// ── Player ──

function play(rawUrl) {
    const url = rawUrl.trim();
    if (!url) return;

    const source  = sourceSelect.value;
    const buildFn = SOURCES[source];
    if (!buildFn) return;

    // Hide overlays first (before anything that could fail)
    overlay.classList.add("hidden");
    loadingOverlay.classList.remove("hidden");
    fallbackMsg.hidden = true;

    // Build embed URL
    currentEmbedUrl = buildFn(url);

    // Set iframe src
    playerFrame.src = currentEmbedUrl;

    // Update fallback link & open-tab button
    fallbackLink.href = currentEmbedUrl;
    openTabBtn.hidden = false;

    // Show fallback message after 5s in case iframe is blocked
    clearTimeout(fallbackTimer);
    fallbackTimer = setTimeout(() => {
        fallbackMsg.hidden = false;
    }, 5000);

    // Save state
    addToHistory(url);
    saveSettings();
}

// When iframe loads (success or blocked content), hide loading spinner
playerFrame.addEventListener("load", () => {
    loadingOverlay.classList.add("hidden");
});

// ── Events ──

playBtn.addEventListener("click", () => play(urlInput.value));

urlInput.addEventListener("keydown", e => {
    if (e.key === "Enter") play(urlInput.value);
});

sourceSelect.addEventListener("change", () => {
    saveSettings();
    const url = urlInput.value.trim();
    if (url) play(url);
});

openTabBtn.addEventListener("click", () => {
    if (currentEmbedUrl) window.open(currentEmbedUrl, "_blank");
});

// ── Init ──
loadSettings();
renderHistory();
