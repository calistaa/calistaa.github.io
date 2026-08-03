# CubeCam Solver

A mobile-friendly browser app that scans the six faces of a 3×3 Rubik's Cube, classifies sticker colours, validates the state, and generates solving moves.

## Run locally

```bash
npm install
npm run dev
```

Open the HTTPS URL shown by your hosting provider. Camera access generally requires HTTPS (localhost is permitted during development).

## Deploy

```bash
npm run build
```

Deploy the generated `dist` folder to Netlify, Vercel, GitHub Pages, Cloudflare Pages, or another static host.

## Scan orientation

The app uses cube.js facelet order: U, R, F, D, L, B.

- U: Back edge at the top
- R/F/L/B: Up edge at the top
- D: Front edge at the top

## Limitations

Colour recognition can be affected by glare, shadows, unusual sticker shades, and camera white balance. The manual correction screen is intentionally included.
