# Live Location Share (Consent-Based)

This project gives you:

- A public page users open to share their live location (with browser permission prompt)
- An admin page where you see all sessions and live updates

## 1) Run server (no package install required)

```bash
cd location_site
python3 app.py
```

Server runs on: `http://localhost:5050`

## 3) Use it

- Share page (send to users): `http://localhost:5050/`
- Admin monitor (you open this): `http://localhost:5050/admin`

Ask each user to enter a unique Session ID before clicking **Start Sharing**.

## 4) Share publicly (internet link)

Because `localhost` is only your machine, expose it with a tunnel such as Cloudflare Tunnel or ngrok.

Example with ngrok:

```bash
ngrok http 5050
```

Then send the generated `https://...` URL to users.

## Notes

- This demo stores data in memory only. Restarting server clears sessions.
- For production, add authentication, TLS hardening, and persistent storage.
- Users must explicitly allow location permission in their browser.
