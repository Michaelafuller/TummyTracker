import { existsSync, readFileSync, writeFileSync } from 'fs';
import { Resvg } from '@resvg/resvg-js';

function rasterize(svgPath, outputPath, width, height, options = {}) {
  // Defensive: skip rather than throw if a tab-icon source ever goes missing,
  // so one bad path doesn't stop the rest of this script from running.
  if (!existsSync(svgPath)) {
    console.warn(`  – skipped (missing source): ${svgPath}`);
    return;
  }
  const svg = readFileSync(svgPath, 'utf8');
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    ...options,
  });
  const pngData = resvg.render();
  writeFileSync(outputPath, pngData.asPng());
  console.log(`  ✓ ${outputPath} (${width}×${height ?? width})`);
}

// The app icon, Android adaptive-icon layers, splash icon, and notification
// icon are hand-exported raster PNGs the owner committed directly (65e7014,
// 4b14f21, c0b26b5) — there's no vector source for them anymore, and this
// script must never overwrite them (HANDOFF.md #16 §6). It only generates the
// tab icons below.
console.log('Generating tab icons…');

// Tab icons — white silhouettes, template-rendered by NativeTabs
const tabIconSizes = [
  { scale: '', size: 24 },
  { scale: '@2x', size: 48 },
  { scale: '@3x', size: 72 },
];
for (const { scale, size } of tabIconSizes) {
  rasterize(`assets/icons/tab-insights.svg`, `assets/images/tabIcons/insights${scale}.png`, size);
  rasterize(`assets/icons/tab-settings.svg`, `assets/images/tabIcons/settings${scale}.png`, size);
  rasterize(`assets/icons/tab-meds.svg`, `assets/images/tabIcons/meds${scale}.png`, size);
}

console.log('Done.');
