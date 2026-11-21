# 3D Player Passport (archived prototype)

Three.js idea for the profile Tennis section, archived on 21 Nov 2026. Not wired into the app; do not merge.

Review page: https://claude.ai/artifact/E3iNgxsMLqiRjGbZn9RSMq

- `src/pages.js`: every page painted on canvas (cover maps, photo page, court stamps, favourite-shot visa, match stamps, endpapers)
- `src/passport.js`: Three.js scene: bending leaves, drag/swipe to turn, tap to zoom, phone one-page mode, reduced motion, flat fallback
- `src/shots-core.js`: stop-motion shot frames
- `src/review.js` + `site/`: the review page

Build the review page: `npm i three esbuild @fontsource/poppins @fontsource/space-mono @fontsource/caveat`, then
`npx esbuild src/review.js --bundle --format=esm --minify --outfile=site/passport-review.js` and serve `site/`.
