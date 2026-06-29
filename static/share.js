const sessionInput = document.getElementById("sessionId");
const startBtn = document.getElementById("startBtn");
const statusEl = document.getElementById("status");
const lastLocationEl = document.getElementById("lastLocation");

let watchId = null;
let hasSentInitialStatus = false;
let retryTimer = null;
let retryCount = 0;

const QUICK_GEO_OPTIONS = {
  // Fast first attempt using cached/network location if available.
  enableHighAccuracy: false,
  maximumAge: 120000,
  timeout: 7000,
};

const RELIABLE_GEO_OPTIONS = {
  // Fallback attempt for difficult signal conditions.
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 20000,
};

function generateSessionId() {
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `visitor-${stamp}-${rand}`;
}

function setStatus(text) {
  statusEl.textContent = text;
}

function scheduleAutoRetry(sessionId, message, delayMs, useReliableMode) {
  retryCount += 1;
  setStatus(`${message} (auto retry ${retryCount})`);

  if (retryTimer !== null) {
    clearTimeout(retryTimer);
  }

  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (useReliableMode) {
      startReliableMode(sessionId);
    } else {
      startQuickMode(sessionId);
    }
  }, delayMs);
}

async function postJSON(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (data.error) {
        message = data.error;
      }
    } catch (_) {
      // ignore JSON parse errors
    }
    throw new Error(message);
  }

  return res.json();
}

function getSessionId() {
  return (sessionInput.value || "").trim();
}

async function beginSharing() {
  const sessionId = getSessionId();
  if (!sessionId) {
    setStatus("Session ID not set.");
    return;
  }

  if (!navigator.geolocation) {
    setStatus("Geolocation is not supported on this browser.");
    try {
      await postJSON("/api/status", { session_id: sessionId, status: "error:geolocation_not_supported" });
    } catch (_) {
      // ignore
    }
    return;
  }

  // Do not block geolocation on API setup calls; start GPS immediately.
  postJSON("/api/session", { session_id: sessionId }).catch(() => {
    // ignore startup errors; first /api/location can still create session.
  });
  postJSON("/api/status", { session_id: sessionId, status: "requesting_permission" }).catch(() => {
    // ignore startup errors
  });

  setStatus("Acquiring location...");
  hasSentInitialStatus = false;
  retryCount = 0;

  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  if (retryTimer !== null) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }

  startQuickMode(sessionId);
  startBtn.disabled = true;
}

function startQuickMode(sessionId) {
  watchId = navigator.geolocation.watchPosition(
    async (pos) => {
      const payload = {
        session_id: sessionId,
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      };

      try {
        if (!hasSentInitialStatus) {
          hasSentInitialStatus = true;
          postJSON("/api/status", { session_id: sessionId, status: "live" }).catch(() => {
            // ignore status write failure
          });
        }
        await postJSON("/api/location", payload);
        setStatus("Live location shared successfully.");
        lastLocationEl.textContent = `Lat: ${payload.latitude.toFixed(6)}, Lng: ${payload.longitude.toFixed(6)}, Accuracy: ${Math.round(payload.accuracy)}m`;
      } catch (err) {
        setStatus(`Failed sending location: ${err.message}`);
      }
    },
    async (error) => {
      let reason = "Unknown";
      if (error.code === 1) reason = "Permission denied";
      if (error.code === 2) reason = "Position unavailable";
      if (error.code === 3) reason = "Timeout";
      setStatus(`Geolocation issue: ${reason}`);
      try {
        await postJSON("/api/status", { session_id: sessionId, status: `error:${reason}` });
      } catch (_) {
        // ignore
      }

      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }

      if (reason === "Timeout" || reason === "Position unavailable") {
        scheduleAutoRetry(sessionId, "Retrying with stronger GPS mode...", 1000, true);
        return;
      }

      if (reason === "Permission denied") {
        // Keep polling in quick mode so sharing resumes automatically once user allows location.
        scheduleAutoRetry(sessionId, "Waiting for permission to be enabled...", 4000, false);
        return;
      }

      startBtn.disabled = false;
    },
    QUICK_GEO_OPTIONS
  );
}

function startReliableMode(sessionId) {
  if (!navigator.geolocation) {
    startBtn.disabled = false;
    return;
  }

  watchId = navigator.geolocation.watchPosition(
    async (pos) => {
      const payload = {
        session_id: sessionId,
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      };

      try {
        if (!hasSentInitialStatus) {
          hasSentInitialStatus = true;
          postJSON("/api/status", { session_id: sessionId, status: "live" }).catch(() => {
            // ignore status write failure
          });
        }
        await postJSON("/api/location", payload);
        setStatus("Live location shared successfully.");
        lastLocationEl.textContent = `Lat: ${payload.latitude.toFixed(6)}, Lng: ${payload.longitude.toFixed(6)}, Accuracy: ${Math.round(payload.accuracy)}m`;
      } catch (err) {
        setStatus(`Failed sending location: ${err.message}`);
      }
    },
    async (error) => {
      let reason = "Unknown";
      if (error.code === 1) reason = "Permission denied";
      if (error.code === 2) reason = "Position unavailable";
      if (error.code === 3) reason = "Timeout";
      setStatus(`Geolocation error: ${reason}`);
      try {
        await postJSON("/api/status", { session_id: sessionId, status: `error:${reason}` });
      } catch (_) {
        // ignore
      }

      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }

      if (reason === "Timeout" || reason === "Position unavailable") {
        scheduleAutoRetry(sessionId, "Retrying GPS fix...", 2000, true);
        return;
      }

      if (reason === "Permission denied") {
        scheduleAutoRetry(sessionId, "Permission still denied. Waiting and retrying...", 5000, false);
        return;
      }

      startBtn.disabled = false;
    },
    RELIABLE_GEO_OPTIONS
  );
}

startBtn.addEventListener("click", beginSharing);

// Auto-generate session ID and start location sharing when page loads.
if (!sessionInput.value.trim()) {
  sessionInput.value = generateSessionId();
}
setStatus("Preparing location sharing...");
beginSharing();
