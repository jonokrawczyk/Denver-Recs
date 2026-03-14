# Denver Recs

A simple mobile-friendly app for sharing Denver recommendations with friends.

## Quick Start

1. Open `public/index.html` in a browser, or serve locally:
   ```bash
   npm install
   npm run dev
   ```
2. Visit `http://localhost:3000`

## Adding Recommendations

**Option A — Manual:** Add entries to `public/data.json` or use the "+" button in the app.

**Option B — Auto-tag with AI:** Add lines to `recs.txt` and run:
```bash
ANTHROPIC_API_KEY=your-key npm run tag
```
This uses Claude to auto-fill categories, vibes, neighborhood, coordinates, and descriptions.

## Deploy

Host the `public/` folder anywhere static — GitHub Pages, Netlify, Vercel, etc.
