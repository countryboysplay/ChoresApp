# Previewing the UI on a phone

The Stage 2 screens run entirely on mock data, so the frontend can be reviewed on
a phone with no backend and no database.

## Option A — GitHub Pages (no laptop needed after setup)

Best option: it gives a URL that works from anywhere, and it is the same pipeline
production will use later.

1. Create a repository named `ChoresApp` on GitHub. Make it **public** — GitHub
   Pages on project sites requires a paid plan for private repos.
2. Push this project to it. This part needs a computer with Git once:
   ```bash
   git init
   git add .
   git commit -m "chore: stage 2 design system and static screens"
   git branch -M main
   git remote add origin https://github.com/<account>/ChoresApp.git
   git push -u origin main
   ```
3. In the repository: **Settings → Pages → Build and deployment → Source →
   GitHub Actions**.
4. The `Deploy frontend preview` workflow runs on every push to `main`. When it
   finishes, the site is at:
   ```
   https://<account>.github.io/ChoresApp/
   ```
5. Open that on the phone. Add to Home Screen to see it without browser chrome —
   Safari: Share → Add to Home Screen. Chrome: menu → Add to Home screen.

After this, every change pushed to `main` republishes automatically. Reviewing a
new screen is just reopening the link.

## Option B — dev server over the house wifi

Works while the Windows laptop is on and the phone is on the same network.

```powershell
npm run dev -w frontend
ipconfig    # find the laptop's IPv4 address, e.g. 192.168.1.42
```

Open `http://192.168.1.42:5173` on the phone. The dev server already listens on
the LAN, so no config change is needed.

If the phone cannot reach it, allow Node.js through Windows Defender Firewall on
private networks. Do not open a router port — remote access is handled properly
in Stage 16.

## Option C — desktop browser device toolbar

Fastest sanity check without a phone: open the dev server, press F12, toggle the
device toolbar, and pick a 390 × 844 viewport.

## What works without a backend

Everything in Stage 2: splash, hero select, PIN pad, all child screens, all
parent screens, sheets, and the completion flow. The only screen that needs the
API is `#/health`, which is a diagnostics page and will show "not connected"
until the backend is running.
