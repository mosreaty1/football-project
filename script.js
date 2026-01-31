const DEFAULT_PROXY = "https://corsproxy.io/?";

const video = document.getElementById("videoPlayer");
const urlInput = document.getElementById("urlInput");
const playBtn = document.getElementById("playBtn");
const proxyToggle = document.getElementById("proxyToggle");
const proxyUrlInput = document.getElementById("proxyUrlInput");
const overlay = document.getElementById("overlay");
const errorMsg = document.getElementById("errorMsg");
const streamInfo = document.getElementById("streamInfo");
const streamDetails = document.getElementById("streamDetails");
const qualitySection = document.getElementById("qualitySection");
const qualityLevels = document.getElementById("qualityLevels");
const historySection = document.getElementById("historySection");
const historyList = document.getElementById("historyList");

let hls = null;

// ── Settings ──

function loadSettings() {
    const saved = localStorage.getItem("m3u8player_settings");
    if (saved) {
        const s = JSON.parse(saved);
        proxyToggle.checked = s.proxyEnabled !== false;
        proxyUrlInput.value = s.proxyUrl || "";
    }
}

function saveSettings() {
    localStorage.setItem("m3u8player_settings", JSON.stringify({
        proxyEnabled: proxyToggle.checked,
        proxyUrl: proxyUrlInput.value,
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
        a.addEventListener("click", () => { urlInput.value = url; startPlayback(url); });
        const btn = document.createElement("button");
        btn.textContent = "\u00d7";
        btn.title = "Remove";
        btn.addEventListener("click", () => removeFromHistory(url));
        li.appendChild(a);
        li.appendChild(btn);
        historyList.appendChild(li);
    });
}

// ── Proxy helpers ──

function getProxyBase() {
    if (!proxyToggle.checked) return "";
    return proxyUrlInput.value.trim() || DEFAULT_PROXY;
}

function buildProxiedUrl(originalUrl, proxyBase) {
    if (!proxyBase) return originalUrl;
    if (originalUrl.startsWith(proxyBase)) return originalUrl;
    return proxyBase + encodeURIComponent(originalUrl);
}

function extractOriginalUrl(proxiedUrl, proxyBase) {
    if (!proxyBase || !proxiedUrl.startsWith(proxyBase)) return proxiedUrl;
    return decodeURIComponent(proxiedUrl.slice(proxyBase.length));
}

function getBaseUrl(url) {
    const i = url.lastIndexOf("/");
    return i >= 0 ? url.substring(0, i + 1) : url;
}

function resolveUrl(relative, baseUrl) {
    if (relative.startsWith("http://") || relative.startsWith("https://")) return relative;
    try { return new URL(relative, baseUrl).href; } catch { return relative; }
}

// ── M3U8 rewriter ──
// Parses an M3U8 text, resolves all relative URLs against the ORIGINAL
// (non-proxied) base URL, then wraps each in the proxy.

function rewriteM3U8(text, originalManifestUrl, proxyBase) {
    if (!proxyBase) return text;
    const base = getBaseUrl(originalManifestUrl);

    return text.split("\n").map(line => {
        const trimmed = line.trim();

        // Rewrite URI="..." inside tags (#EXT-X-KEY, #EXT-X-MAP, #EXT-X-MEDIA, etc.)
        if (trimmed.startsWith("#")) {
            if (trimmed.includes('URI="')) {
                return line.replace(/URI="([^"]+)"/g, (_match, uri) => {
                    const abs = resolveUrl(uri, base);
                    return 'URI="' + buildProxiedUrl(abs, proxyBase) + '"';
                });
            }
            return line;
        }

        // Empty lines
        if (!trimmed) return line;

        // URL lines (segment files, variant playlists)
        const abs = resolveUrl(trimmed, base);
        return buildProxiedUrl(abs, proxyBase);
    }).join("\n");
}

// ── Custom HLS.js loader ──
// Wraps the default XHR loader. For every response that looks like an M3U8
// playlist, it rewrites internal URLs so HLS.js never sees broken relative
// paths pointing at the proxy host.

function createProxyLoader(proxyBase) {
    const Loader = Hls.DefaultConfig.loader;

    return class ProxyLoader extends Loader {
        load(context, config, callbacks) {
            const requestUrl = context.url;

            const origSuccess = callbacks.onSuccess;
            callbacks.onSuccess = (response, stats, ctx, networkDetails) => {
                if (typeof response.data === "string" &&
                    response.data.trimStart().startsWith("#EXTM3U")) {
                    const originalUrl = extractOriginalUrl(requestUrl, proxyBase);
                    response.data = rewriteM3U8(response.data, originalUrl, proxyBase);
                }
                origSuccess(response, stats, ctx, networkDetails);
            };

            super.load(context, config, callbacks);
        }
    };
}

// ── Error / info display ──

function showError(msg) { errorMsg.textContent = msg; errorMsg.hidden = false; }
function hideError() { errorMsg.hidden = true; }

function updateStreamInfo() {
    if (!hls) return;
    const level = hls.levels[hls.currentLevel] || hls.levels[hls.loadLevel];
    if (!level) return;
    const lines = [];
    if (level.width && level.height) lines.push(`<span>Resolution:</span> ${level.width}x${level.height}`);
    if (level.bitrate) lines.push(`<span>Bitrate:</span> ${(level.bitrate / 1000).toFixed(0)} kbps`);
    if (level.codecSet) lines.push(`<span>Codecs:</span> ${level.codecSet}`);
    if (hls.levels.length > 0) lines.push(`<span>Qualities:</span> ${hls.levels.length}`);
    if (lines.length) { streamInfo.hidden = false; streamDetails.innerHTML = lines.join("<br>"); }
}

function renderQualityLevels() {
    if (!hls || hls.levels.length <= 1) { qualitySection.hidden = true; return; }
    qualitySection.hidden = false;
    qualityLevels.innerHTML = "";

    const autoBtn = document.createElement("button");
    autoBtn.className = "quality-btn" + (hls.currentLevel === -1 ? " active" : "");
    autoBtn.textContent = "Auto";
    autoBtn.addEventListener("click", () => { hls.currentLevel = -1; updateQualityButtons(); });
    qualityLevels.appendChild(autoBtn);

    hls.levels.forEach((level, idx) => {
        const btn = document.createElement("button");
        btn.className = "quality-btn" + (hls.currentLevel === idx ? " active" : "");
        btn.textContent = level.height ? `${level.height}p` : `Level ${idx}`;
        btn.addEventListener("click", () => { hls.currentLevel = idx; updateQualityButtons(); });
        qualityLevels.appendChild(btn);
    });
}

function updateQualityButtons() {
    qualityLevels.querySelectorAll(".quality-btn").forEach((btn, i) => {
        if (i === 0) btn.classList.toggle("active", hls.currentLevel === -1);
        else btn.classList.toggle("active", hls.currentLevel === i - 1);
    });
}

// ── Player ──

function destroyPlayer() {
    if (hls) { hls.destroy(); hls = null; }
    video.removeAttribute("src");
    video.load();
    overlay.classList.remove("hidden");
    streamInfo.hidden = true;
    qualitySection.hidden = true;
}

function startPlayback(rawUrl) {
    hideError();
    destroyPlayer();

    const url = rawUrl.trim();
    if (!url) { showError("Please enter a valid M3U8 URL."); return; }

    addToHistory(url);
    saveSettings();

    const proxyBase = getProxyBase();
    const sourceUrl = buildProxiedUrl(url, proxyBase);

    if (Hls.isSupported()) {
        const hlsConfig = { enableWorker: true, lowLatencyMode: false };

        // When proxy is active, use the custom loader that rewrites M3U8 URLs
        if (proxyBase) {
            hlsConfig.loader = createProxyLoader(proxyBase);
        }

        hls = new Hls(hlsConfig);
        hls.loadSource(sourceUrl);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
            overlay.classList.add("hidden");
            video.play().catch(() => {});
            renderQualityLevels();
            updateStreamInfo();
        });

        hls.on(Hls.Events.LEVEL_SWITCHED, () => {
            updateStreamInfo();
            updateQualityButtons();
        });

        hls.on(Hls.Events.ERROR, (_event, data) => {
            if (data.fatal) {
                if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                    showError("Network error: could not load the stream. Check the URL and proxy settings.");
                    hls.startLoad();
                } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                    showError("Media error: trying to recover...");
                    hls.recoverMediaError();
                } else {
                    showError("Fatal playback error: " + data.details);
                    destroyPlayer();
                }
            }
        });

    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        // Safari native HLS
        video.src = sourceUrl;
        video.addEventListener("loadedmetadata", () => {
            overlay.classList.add("hidden");
            video.play().catch(() => {});
        });
        video.addEventListener("error", () => {
            showError("Error loading stream. Check URL and proxy settings.");
        });
    } else {
        showError("Your browser does not support HLS playback.");
    }
}

// ── Events ──

playBtn.addEventListener("click", () => startPlayback(urlInput.value));
urlInput.addEventListener("keydown", e => { if (e.key === "Enter") startPlayback(urlInput.value); });
proxyToggle.addEventListener("change", saveSettings);
proxyUrlInput.addEventListener("input", saveSettings);

// ── Init ──
loadSettings();
renderHistory();
