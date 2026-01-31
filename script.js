// ── Embed sources ──
// Third-party M3U8 player services that handle HTTP streams natively.
// The iframe loads THEIR page, so no mixed-content issues from GitHub Pages.

const SOURCES = {
    anym3u8: url => "https://anym3u8player.com/tv/p.php?url=" + encodeURIComponent(url),
    hlsplayer: url => "https://www.hlsplayer.net/?url=" + encodeURIComponent(url),
    bestm3u8: url => "https://bestm3u8player.com/player.html?url=" + encodeURIComponent(url),
};

// ── Elements ──

const urlInput = document.getElementById("urlInput");
const playBtn = document.getElementById("playBtn");
const sourceSelect = document.getElementById("sourceSelect");
const playerFrame = document.getElementById("playerFrame");
const overlay = document.getElementById("overlay");
const historySection = document.getElementById("historySection");
const historyList = document.getElementById("historyList");

// ── Settings ──

function loadSettings() {
    const saved = localStorage.getItem("m3u8player_settings");
    if (saved) {
        const s = JSON.parse(saved);
        if (s.source && SOURCES[s.source]) sourceSelect.value = s.source;
    }
}

function saveSettings() {
    localStorage.setItem("m3u8player_settings", JSON.stringify({
        source: sourceSelect.value,
    }));
}

// ── History ──

function loadHistory() {
    const saved = localStorage.getItem("m3u8player_history");
    return saved ? JSON.parse(saved) : [];
}

function saveHistory(h) {
    localStorage.setItem("m3u8player_history", JSON.stringify(h));
}

function addToHistory(url) {
    let h = loadHistory().filter(i => i !== url);
    h.unshift(url);
    if (h.length > 10) h.pop();
    saveHistory(h);
    renderHistory();
}

function removeFromHistory(url) {
    saveHistory(loadHistory().filter(i => i !== url));
    renderHistory();
}

function renderHistory() {
    const h = loadHistory();
    if (!h.length) { historySection.hidden = true; return; }
    historySection.hidden = false;
    historyList.innerHTML = "";
    h.forEach(url => {
        const li = document.createElement("li");
        const a = document.createElement("a");
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

    const source = sourceSelect.value;
    const buildUrl = SOURCES[source];
    if (!buildUrl) return;

    addToHistory(url);
    saveSettings();

    playerFrame.src = buildUrl(url);
    overlay.classList.add("hidden");
}

// ── Events ──

playBtn.addEventListener("click", () => play(urlInput.value));
urlInput.addEventListener("keydown", e => { if (e.key === "Enter") play(urlInput.value); });
sourceSelect.addEventListener("change", () => {
    saveSettings();
    // Re-play current URL with new source if already playing
    const url = urlInput.value.trim();
    if (url && playerFrame.src) play(url);
});

// ── Init ──
loadSettings();
renderHistory();
