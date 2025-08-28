# Tennessee • Gameday Hub (Unofficial) Fansite

Unofficial and Unaffiliated, Informational Hubspace for fans of Tennessee football: Website includes a  weekend guide, schedule, specials, maps, and tips.

## Local dev
Open `index.html` in a local server (VS Code Live Server, `python -m http.server`, etc.).
> Direct `file://` will block `fetch()` for JSON in some browsers—use a server.

## Update data
- Edit `data/schedule.json` (ISO dates with timezone offset recommended).
- Edit `data/specials.json` (cards shown in "Featured Specials").

## Deploy to GitHub Pages
1. Push this repo to GitHub.
2. Settings → Pages → Source: **Deploy from a branch** → Branch: `main` (/root).
3. Visit `https://<username>.github.io/<repo>/`

## Notes
- Unofficial/independent. No logos, mascots, or wordmarks used.
- Weather/events are placeholders; link to official sources for policies.
