const DEFAULT_PROXY = "https://corsproxy.io/?url=";

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

// Load saved settings
function loadSettings() {
    const saved = localStorage.getItem("m3u8player_settings");
    if (saved) {
        const settings = JSON.parse(saved);
        proxyToggle.checked = settings.proxyEnabled !== false;
        proxyUrlInput.value = settings.proxyUrl || "";
    }
}

function saveSettings() {
    localStorage.setItem("m3u8player_settings", JSON.stringify({
        proxyEnabled: proxyToggle.checked,
        proxyUrl: proxyUrlInput.value,
    }));
}

// History
function loadHistory() {
    const saved = localStorage.getItem("m3u8player_history");
    return saved ? JSON.parse(saved) : [];
}

function saveHistory(history) {
    localStorage.setItem("m3u8player_history", JSON.stringify(history));
}

function addToHistory(url) {
    let history = loadHistory();
    history = history.filter(item => item !== url);
    history.unshift(url);
    if (history.length > 10) history.pop();
    saveHistory(history);
    renderHistory();
}

function removeFromHistory(url) {
    let history = loadHistory();
    history = history.filter(item => item !== url);
    saveHistory(history);
    renderHistory();
}

function renderHistory() {
    const history = loadHistory();
    if (history.length === 0) {
        historySection.hidden = true;
        return;
    }
    historySection.hidden = false;
    historyList.innerHTML = "";
    history.forEach(url => {
        const li = document.createElement("li");

        const a = document.createElement("a");
        a.textContent = url;
        a.title = url;
        a.addEventListener("click", () => {
            urlInput.value = url;
            startPlayback(url);
        });

        const removeBtn = document.createElement("button");
        removeBtn.textContent = "\u00d7";
        removeBtn.title = "Remove";
        removeBtn.addEventListener("click", () => removeFromHistory(url));

        li.appendChild(a);
        li.appendChild(removeBtn);
        historyList.appendChild(li);
    });
}

// Proxy
function getProxyUrl() {
    if (!proxyToggle.checked) return "";
    return proxyUrlInput.value.trim() || DEFAULT_PROXY;
}

function applyProxy(url) {
    const proxy = getProxyUrl();
    if (!proxy) return url;
    return proxy + encodeURIComponent(url);
}

// Error display
function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.hidden = false;
}

function hideError() {
    errorMsg.hidden = true;
}

// Stream info display
function updateStreamInfo() {
    if (!hls) return;

    const level = hls.levels[hls.currentLevel] || hls.levels[hls.loadLevel];
    if (!level) return;

    const lines = [];
    if (level.width && level.height) {
        lines.push(`<span>Resolution:</span> ${level.width}x${level.height}`);
    }
    if (level.bitrate) {
        lines.push(`<span>Bitrate:</span> ${(level.bitrate / 1000).toFixed(0)} kbps`);
    }
    if (level.codecSet) {
        lines.push(`<span>Codecs:</span> ${level.codecSet}`);
    }
    if (hls.levels.length > 0) {
        lines.push(`<span>Qualities:</span> ${hls.levels.length}`);
    }

    if (lines.length > 0) {
        streamInfo.hidden = false;
        streamDetails.innerHTML = lines.join("<br>");
    }
}

function renderQualityLevels() {
    if (!hls || hls.levels.length <= 1) {
        qualitySection.hidden = true;
        return;
    }

    qualitySection.hidden = false;
    qualityLevels.innerHTML = "";

    // Auto button
    const autoBtn = document.createElement("button");
    autoBtn.className = "quality-btn" + (hls.currentLevel === -1 ? " active" : "");
    autoBtn.textContent = "Auto";
    autoBtn.addEventListener("click", () => {
        hls.currentLevel = -1;
        updateQualityButtons();
    });
    qualityLevels.appendChild(autoBtn);

    hls.levels.forEach((level, index) => {
        const btn = document.createElement("button");
        const label = level.height ? `${level.height}p` : `Level ${index}`;
        btn.className = "quality-btn" + (hls.currentLevel === index ? " active" : "");
        btn.textContent = label;
        btn.addEventListener("click", () => {
            hls.currentLevel = index;
            updateQualityButtons();
        });
        qualityLevels.appendChild(btn);
    });
}

function updateQualityButtons() {
    const buttons = qualityLevels.querySelectorAll(".quality-btn");
    buttons.forEach((btn, i) => {
        if (i === 0) {
            btn.classList.toggle("active", hls.currentLevel === -1);
        } else {
            btn.classList.toggle("active", hls.currentLevel === i - 1);
        }
    });
}

// Playback
function destroyPlayer() {
    if (hls) {
        hls.destroy();
        hls = null;
    }
    video.removeAttribute("src");
    video.load();
    overlay.classList.remove("hidden");
    streamInfo.hidden = true;
    qualitySection.hidden = true;
}

function startPlayback(originalUrl) {
    hideError();
    destroyPlayer();

    const url = originalUrl.trim();
    if (!url) {
        showError("Please enter a valid M3U8 URL.");
        return;
    }

    addToHistory(url);
    saveSettings();

    const proxiedUrl = applyProxy(url);

    if (Hls.isSupported()) {
        hls = new Hls({
            xhrSetup: function(xhr, requestUrl) {
                // If the request URL is a relative or absolute segment URL
                // from the manifest, we also need to proxy it
                const proxy = getProxyUrl();
                if (proxy && !requestUrl.startsWith(proxy)) {
                    // Check if it's already a full URL or relative
                    let finalUrl = requestUrl;
                    if (requestUrl.startsWith("http://") || requestUrl.startsWith("https://")) {
                        finalUrl = proxy + encodeURIComponent(requestUrl);
                    }
                    xhr.open("GET", finalUrl, true);
                }
            },
            enableWorker: true,
            lowLatencyMode: false,
        });

        hls.loadSource(proxiedUrl);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, function() {
            overlay.classList.add("hidden");
            video.play().catch(() => {});
            renderQualityLevels();
            updateStreamInfo();
        });

        hls.on(Hls.Events.LEVEL_SWITCHED, function() {
            updateStreamInfo();
            updateQualityButtons();
        });

        hls.on(Hls.Events.ERROR, function(event, data) {
            if (data.fatal) {
                switch (data.type) {
                    case Hls.ErrorTypes.NETWORK_ERROR:
                        showError(
                            "Network error: Could not load the stream. " +
                            "If using HTTP links on HTTPS, make sure the proxy is enabled."
                        );
                        hls.startLoad();
                        break;
                    case Hls.ErrorTypes.MEDIA_ERROR:
                        showError("Media error: Trying to recover...");
                        hls.recoverMediaError();
                        break;
                    default:
                        showError("Fatal error: " + data.details);
                        destroyPlayer();
                        break;
                }
            }
        });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        // Safari native HLS support
        video.src = proxiedUrl;
        video.addEventListener("loadedmetadata", function() {
            overlay.classList.add("hidden");
            video.play().catch(() => {});
        });
        video.addEventListener("error", function() {
            showError("Error loading stream. Check URL and proxy settings.");
        });
    } else {
        showError("Your browser does not support HLS playback.");
    }
}

// Event listeners
playBtn.addEventListener("click", () => {
    startPlayback(urlInput.value);
});

urlInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        startPlayback(urlInput.value);
    }
});

proxyToggle.addEventListener("change", saveSettings);
proxyUrlInput.addEventListener("input", saveSettings);

// Init
loadSettings();
renderHistory();
