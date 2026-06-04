# Setup Guide — Screening Room

## Repo structure

```
screening-room/
├── public/               ← everything Netlify serves
│   ├── index.html        ← the app
│   ├── manifest.json     ← PWA manifest (add to home screen)
│   ├── sw.js             ← service worker (PWA offline shell)
│   └── icons/            ← add icon-192.png + icon-512.png here
├── supabase/
│   └── functions/
│       └── refresh-catalog/
│           └── index.ts  ← daily TMDB refresh (server-side)
├── netlify.toml          ← Netlify config + redirect rules
├── .gitignore
└── SETUP.md              ← this file
```

---

## Step 1 — Push to GitHub (r7verma)

```bash
cd screening-room          # this folder
git init
git add .
git commit -m "initial scaffold"
git branch -M main
# Create repo on github.com first, then:
git remote add origin https://github.com/r7verma/screening-room.git
git push -u origin main
```

Add your flatmate as collaborator:
GitHub repo → Settings → Collaborators → Add people

---

## Step 2 — Connect Netlify to GitHub

1. netlify.com → your site (screening-room.netlify.app)
2. Site configuration → Build & deploy → Link repository
3. Pick GitHub → select `screening-room` repo
4. Build settings:
   - Build command: *(leave blank)*
   - Publish directory: `public`
5. Save → Deploy

Every push to `main` now auto-deploys. Done.

---

## Step 3 — Day-to-day workflow (both of you)

```bash
# Start a new feature
git checkout -b feature/dining-vertical

# Work, then commit
git add .
git commit -m "add dining vertical scaffold"
git push origin feature/dining-vertical

# Open Pull Request on GitHub → other person reviews → merge → auto-deploys
```

**Rule: never push directly to main.**

---

## Step 4 — Deploy the Edge Function (needs service role key from flatmate)

Install Supabase CLI:
```bash
npm install -g supabase
supabase login
supabase link --project-ref jxqtggajabevmpzpxhtk
```

Set env vars in Supabase dashboard → Settings → Edge Functions:
- `TMDB_KEY` = f55148eb9c5f84d935845bc4510abe6e
- `SUPABASE_SERVICE_ROLE_KEY` = (get from flatmate — Supabase → Settings → API → service_role)

Deploy:
```bash
supabase functions deploy refresh-catalog
```

Set cron schedule in Supabase dashboard → Edge Functions → refresh-catalog → Schedules:
```
0 3 * * *
```
(runs 3am UTC daily — one server-side refresh for all users)

---

## PWA icons needed

Add two PNG files to `public/icons/`:
- `icon-192.png` (192×192)
- `icon-512.png` (512×512)

Use any icon generator (e.g. realfavicongenerator.net) with your logo.
Once added, users on iOS/Android can tap "Add to Home Screen" and it installs like a native app.
