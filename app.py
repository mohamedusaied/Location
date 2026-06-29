from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
import json
import os
from urllib.parse import urlsplit

BASE_DIR = Path(__file__).resolve().parent
TEMPLATES_DIR = BASE_DIR / "templates"
STATIC_DIR = BASE_DIR / "static"

# In-memory session store. For production, replace with a real DB.
sessions = {}


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def ensure_session(session_id, user_agent, ip, status="waiting_for_location"):
    if session_id not in sessions:
        sessions[session_id] = {
            "created_at": now_iso(),
            "updated_at": now_iso(),
            "status": status,
            "coords": None,
            "history": [],
            "meta": {
                "user_agent": user_agent,
                "ip": ip,
            },
        }


class Handler(BaseHTTPRequestHandler):
    def _send_bytes(self, code, content, content_type="text/plain; charset=utf-8"):
        data = content if isinstance(content, bytes) else content.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _send_json(self, code, payload):
        self._send_bytes(code, json.dumps(payload), "application/json; charset=utf-8")

    def _read_json(self):
        length = int(self.headers.get("Content-Length", "0") or 0)
        raw = self.rfile.read(length) if length > 0 else b"{}"
        try:
            data = json.loads(raw.decode("utf-8"))
            return data if isinstance(data, dict) else {}
        except json.JSONDecodeError:
            return {}

    def _serve_file(self, path, content_type):
        if not path.exists() or not path.is_file():
            self._send_bytes(404, "Not Found")
            return
        self._send_bytes(200, path.read_bytes(), content_type)

    def _clean_path(self):
        # Ignore query string so URLs like '/?fbclid=...' still resolve.
        return urlsplit(self.path).path

    def do_GET(self):
        path = self._clean_path()

        if path == "/":
            self._serve_file(TEMPLATES_DIR / "share.html", "text/html; charset=utf-8")
            return

        if path == "/admin":
            self._serve_file(TEMPLATES_DIR / "admin.html", "text/html; charset=utf-8")
            return

        if path == "/static/styles.css":
            self._serve_file(STATIC_DIR / "styles.css", "text/css; charset=utf-8")
            return

        if path == "/static/share.js":
            self._serve_file(STATIC_DIR / "share.js", "application/javascript; charset=utf-8")
            return

        if path == "/static/admin.js":
            self._serve_file(STATIC_DIR / "admin.js", "application/javascript; charset=utf-8")
            return

        if path == "/api/sessions":
            self._send_json(200, {"sessions": sessions, "server_time": now_iso()})
            return

        self._send_bytes(404, "Not Found")

    def do_POST(self):
        path = self._clean_path()
        data = self._read_json()
        session_id = (data.get("session_id") or "").strip()
        user_agent = self.headers.get("User-Agent", "")
        ip = self.client_address[0] if self.client_address else ""

        if path == "/api/delete_session":
            if not session_id:
                self._send_json(400, {"error": "session_id is required"})
                return

            if session_id not in sessions:
                self._send_json(404, {"error": "session_id not found"})
                return

            del sessions[session_id]
            self._send_json(200, {"ok": True, "deleted": session_id})
            return

        if path == "/api/delete_all":
            deleted_count = len(sessions)
            sessions.clear()
            self._send_json(200, {"ok": True, "deleted_count": deleted_count})
            return

        if path == "/api/session":
            if not session_id:
                self._send_json(400, {"error": "session_id is required"})
                return
            ensure_session(session_id, user_agent, ip)
            self._send_json(200, {"ok": True, "session_id": session_id})
            return

        if path == "/api/location":
            if not session_id:
                self._send_json(400, {"error": "session_id is required"})
                return

            ensure_session(session_id, user_agent, ip, status="created_implicitly")

            try:
                latitude = float(data.get("latitude"))
                longitude = float(data.get("longitude"))
                accuracy = float(data.get("accuracy", 0.0))
            except (TypeError, ValueError):
                self._send_json(400, {"error": "latitude, longitude must be numeric"})
                return

            sample = {
                "timestamp": now_iso(),
                "latitude": latitude,
                "longitude": longitude,
                "accuracy": accuracy,
            }

            sessions[session_id]["coords"] = sample
            sessions[session_id]["status"] = "live"
            sessions[session_id]["updated_at"] = now_iso()
            sessions[session_id]["history"].append(sample)
            sessions[session_id]["history"] = sessions[session_id]["history"][-500:]

            self._send_json(200, {"ok": True})
            return

        if path == "/api/status":
            status = (data.get("status") or "").strip()
            if not session_id or not status:
                self._send_json(400, {"error": "session_id and status are required"})
                return

            ensure_session(session_id, user_agent, ip, status=status)
            sessions[session_id]["status"] = status
            sessions[session_id]["updated_at"] = now_iso()
            self._send_json(200, {"ok": True})
            return

        self._send_bytes(404, "Not Found")


def run_server(host="0.0.0.0", port=5050):
    httpd = HTTPServer((host, port), Handler)
    print(f"Server running on http://{host}:{port}")
    httpd.serve_forever()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5050"))
    run_server(host="0.0.0.0", port=port)
