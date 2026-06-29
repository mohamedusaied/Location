const sessionsEl = document.getElementById("sessions");
const serverTimeEl = document.getElementById("serverTime");
const deleteAllBtn = document.getElementById("deleteAllBtn");

const STALE_SECONDS = 45;

function getEffectiveStatus(session, serverTimeIso) {
  const rawStatus = session.status || "unknown";

  const updatedAtMs = Date.parse(session.updated_at || "");
  const serverMs = Date.parse(serverTimeIso || "");

  if (Number.isNaN(updatedAtMs) || Number.isNaN(serverMs)) {
    return {
      label: rawStatus,
      cssClass: "status-unknown",
    };
  }

  const ageSeconds = Math.max(0, Math.floor((serverMs - updatedAtMs) / 1000));

  if (rawStatus === "live" && ageSeconds > STALE_SECONDS) {
    return {
      label: `stopped (no recent update ${ageSeconds}s)` ,
      cssClass: "status-stale",
    };
  }

  if (rawStatus === "live") {
    return {
      label: `live (${ageSeconds}s ago)`,
      cssClass: "status-live",
    };
  }

  if (rawStatus.startsWith("error:")) {
    return {
      label: rawStatus,
      cssClass: "status-error",
    };
  }

  if (rawStatus === "stopped_by_user") {
    return {
      label: "stopped by user",
      cssClass: "status-stale",
    };
  }

  return {
    label: rawStatus,
    cssClass: "status-unknown",
  };
}

function renderSession(id, session, serverTimeIso) {
  const div = document.createElement("div");
  div.className = "session";

  const statusInfo = getEffectiveStatus(session, serverTimeIso);

  const c = session.coords;
  const coordPair = c ? `${c.latitude.toFixed(6)},${c.longitude.toFixed(6)}` : "";
  const googleLink = c
    ? `https://www.google.com/maps?q=${encodeURIComponent(coordPair)}`
    : "";
  const appleLink = c
    ? `https://maps.apple.com/?q=${encodeURIComponent(coordPair)}`
    : "";
  const osmLink = c
    ? `https://www.openstreetmap.org/?mlat=${encodeURIComponent(
        c.latitude.toFixed(6)
      )}&mlon=${encodeURIComponent(c.longitude.toFixed(6))}#map=17/${encodeURIComponent(
        c.latitude.toFixed(6)
      )}/${encodeURIComponent(c.longitude.toFixed(6))}`
    : "";
  const locationText = c
    ? `Lat ${c.latitude.toFixed(6)}, Lng ${c.longitude.toFixed(6)} (±${Math.round(c.accuracy)}m)`
    : "No location yet";
  const mapLinks = c
    ? `<p class="kv"><strong>Trace:</strong> <a href="${googleLink}" target="_blank" rel="noopener noreferrer">Google Maps</a> | <a href="${appleLink}" target="_blank" rel="noopener noreferrer">Apple Maps</a> | <a href="${osmLink}" target="_blank" rel="noopener noreferrer">OpenStreetMap</a></p>
       <p class="kv"><strong>Coordinates:</strong> ${coordPair}</p>`
    : "";

  div.innerHTML = `
    <h3>${id}</h3>
    <p class="kv"><strong>Status:</strong> <span class="status-pill ${statusInfo.cssClass}">${statusInfo.label}</span></p>
    <p class="kv"><strong>Updated:</strong> ${session.updated_at}</p>
    <p class="kv"><strong>Location:</strong> ${locationText}</p>
    ${mapLinks}
    <p class="kv"><strong>History points:</strong> ${session.history.length}</p>
    <div class="record-actions">
      <button class="danger-btn delete-session-btn" data-session-id="${id}">Delete</button>
    </div>
  `;

  return div;
}

async function postJSON(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });

  let payload = {};
  try {
    payload = await res.json();
  } catch (_) {
    // ignore parse issues
  }

  if (!res.ok) {
    throw new Error(payload.error || `HTTP ${res.status}`);
  }

  return payload;
}

async function deleteSession(sessionId) {
  if (!sessionId) {
    return;
  }

  const yes = window.confirm(`Delete record for ${sessionId}?`);
  if (!yes) {
    return;
  }

  try {
    await postJSON("/api/delete_session", { session_id: sessionId });
    refresh();
  } catch (err) {
    window.alert(`Delete failed: ${err.message}`);
  }
}

async function deleteAllRecords() {
  const yes = window.confirm("Delete all records from monitor?");
  if (!yes) {
    return;
  }

  try {
    await postJSON("/api/delete_all", {});
    refresh();
  } catch (err) {
    window.alert(`Delete all failed: ${err.message}`);
  }
}

async function refresh() {
  try {
    const res = await fetch("/api/sessions");
    const data = await res.json();

    serverTimeEl.textContent = `Server time (UTC): ${data.server_time}`;
    sessionsEl.innerHTML = "";

    const ids = Object.keys(data.sessions);
    if (!ids.length) {
      sessionsEl.innerHTML = "<p class='muted'>No sessions yet.</p>";
      return;
    }

    ids.sort().forEach((id) => {
      sessionsEl.appendChild(renderSession(id, data.sessions[id], data.server_time));
    });

    const deleteButtons = document.querySelectorAll(".delete-session-btn");
    deleteButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        deleteSession(btn.getAttribute("data-session-id") || "");
      });
    });
  } catch (err) {
    sessionsEl.innerHTML = `<p class='muted'>Failed loading data: ${err.message}</p>`;
  }
}

if (deleteAllBtn) {
  deleteAllBtn.addEventListener("click", deleteAllRecords);
}

refresh();
setInterval(refresh, 3000);
