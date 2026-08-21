# Windows laptop setup

The backend, the database, and every chore photo live on this machine. Nothing
household-specific is stored in GitHub.

## 1. Install prerequisites

- Node.js 22 LTS or newer (the laptop runs 24) — https://nodejs.org (installer adds `node` and `npm` to PATH)
- Git for Windows
- PostgreSQL 16+ (the laptop runs 17) — install as a Windows service so it starts at boot

Verify:

```powershell
node -v
npm -v
git --version
psql --version
```

## 2. Clone and install

```powershell
cd C:\Projects
git clone <repo-url> chore-quest
cd chore-quest
npm install
```

## 3. Configure

```powershell
copy backend\.env.example backend\.env
copy frontend\.env.example frontend\.env.local
notepad backend\.env
```

Set `DATABASE_URL` and generate a session secret:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Never commit `.env`. `npm run preflight` fails if a tracked `.env` is detected.

## 4. Run

```powershell
npm run preflight
npm run dev
```

Frontend at http://localhost:5173, health check at http://localhost:4000/api/health.

## 5. Firewall

During development the backend binds to `127.0.0.1` only, so no inbound firewall
rule is needed. Phones on the house network reach it over https on the laptop's own
reserved address - there is no tunnel and nothing is published,
not through an opened router port.
