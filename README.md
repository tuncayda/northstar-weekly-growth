# Northstar

A private weekly growth tracker for reflecting on 13 personal leadership skills, rating each one from 1–10, and seeing individual and overall trends over time.

## What it does

- Guides you through one reflection at a time
- Saves one review per calendar week
- Shows overall progress, strengths, and opportunities
- Tracks a separate trend for every skill
- Stores optional notes alongside ratings
- Exports and imports a portable JSON backup
- Works on desktop and mobile

## Run locally

Requires Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Quality checks

```bash
npm run lint
npm run build
```

## Data and privacy

Northstar stores reviews in the current browser using `localStorage`; it has no account or server database. Use the avatar button in the app to export a backup before clearing browser data or moving to another device.
