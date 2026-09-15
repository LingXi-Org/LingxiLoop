# Learning vine

`learning-vine.webp` is a transparent, seamless render of the main vine supplied in `D:\Downloads\tree\index.html`. Its original seeded geometry, moss, ferns, flowers, lighting and palette are preserved. `vine-profile.json` samples the same moss surface so avatars and stones follow it.

The asset is 2400 × 400, displayed at 1200 × 200. It was baked once with the original `buildNearRoot` / `assembleRoot` functions (190,000 blades) and Three.js r147, an orthographic camera spanning ±7.2 × ±1.2, ACES exposure 1.30 and WebP quality 0.90. The running dashboard loads neither Three.js nor a WebGL scene and uses no animation loop.
