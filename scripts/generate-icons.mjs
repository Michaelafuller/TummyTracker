import { readFileSync, writeFileSync } from 'fs';
import { Resvg } from '@resvg/resvg-js';

function rasterize(svgPath, outputPath, width, height) {
  const svg = readFileSync(svgPath, 'utf8');
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
  });
  const pngData = resvg.render();
  writeFileSync(outputPath, pngData.asPng());
  console.log(`  ✓ ${outputPath} (${width}×${height ?? width})`);
}

console.log('Generating app icons…');

// Main app icon
rasterize('assets/icons/icon.svg', 'assets/images/icon.png', 1024);

// Android adaptive icon layers
rasterize('assets/icons/icon.svg', 'assets/images/android-icon-foreground.png', 1024);
rasterize('assets/icons/icon-monochrome.svg', 'assets/images/android-icon-monochrome.png', 1024);

// Background is a solid colour — write a minimal SVG inline
const bgSvg = '<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><rect width="1024" height="1024" fill="#0D1C20"/></svg>';
writeFileSync('assets/icons/_bg.svg', bgSvg);
rasterize('assets/icons/_bg.svg', 'assets/images/android-icon-background.png', 1024);

// Splash icon (centred on transparent — use the monochrome style at 200px)
rasterize('assets/icons/icon-monochrome.svg', 'assets/images/splash-icon.png', 200);

// Notification icon: white silhouette, 96×96 (Android requirement)
rasterize('assets/icons/icon-monochrome.svg', 'assets/images/notification-icon.png', 96);

// Tab icons — white silhouettes, template-rendered by NativeTabs
const tabIconSizes = [
  { scale: '', size: 24 },
  { scale: '@2x', size: 48 },
  { scale: '@3x', size: 72 },
];
for (const { scale, size } of tabIconSizes) {
  rasterize(`assets/icons/tab-insights.svg`, `assets/images/tabIcons/insights${scale}.png`, size);
  rasterize(`assets/icons/tab-settings.svg`, `assets/images/tabIcons/settings${scale}.png`, size);
}

console.log('Done.');
