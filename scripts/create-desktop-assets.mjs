import { execFile } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const execFileAsync = promisify(execFile);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildDir = path.join(rootDir, "build");
const iconsetDir = path.join(buildDir, "icon.iconset");

const iconSvg = String.raw`
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="120" x2="900" y1="80" y2="940" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#f8fbef"/>
      <stop offset="0.35" stop-color="#bfe0d6"/>
      <stop offset="0.68" stop-color="#83c7e8"/>
      <stop offset="1" stop-color="#edbd76"/>
    </linearGradient>
    <linearGradient id="glass" x1="150" x2="850" y1="130" y2="880" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.92"/>
      <stop offset="0.45" stop-color="#ffffff" stop-opacity="0.42"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0.18"/>
    </linearGradient>
    <linearGradient id="screen" x1="260" x2="770" y1="260" y2="690" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#0e171d"/>
      <stop offset="0.55" stop-color="#123443"/>
      <stop offset="1" stop-color="#0f1d21"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="42" stdDeviation="48" flood-color="#26313a" flood-opacity="0.32"/>
    </filter>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="18"/>
    </filter>
  </defs>
  <rect width="1024" height="1024" rx="232" fill="#eef4ed"/>
  <rect x="58" y="58" width="908" height="908" rx="214" fill="url(#bg)" filter="url(#shadow)"/>
  <circle cx="250" cy="224" r="122" fill="#ffffff" opacity="0.34" filter="url(#soft)"/>
  <circle cx="805" cy="772" r="160" fill="#f8e2aa" opacity="0.35" filter="url(#soft)"/>
  <rect x="112" y="112" width="800" height="800" rx="176" fill="url(#glass)" stroke="#ffffff" stroke-opacity="0.82" stroke-width="14"/>
  <rect x="214" y="260" width="596" height="424" rx="118" fill="url(#screen)" stroke="#ffffff" stroke-opacity="0.5" stroke-width="10"/>
  <path d="M244 509 C292 421 345 421 393 509 C441 597 494 597 542 509 C590 421 643 421 691 509 C723 568 760 588 804 568" fill="none" stroke="#92d9f6" stroke-width="38" stroke-linecap="round" opacity="0.9"/>
  <path d="M252 612 H772" stroke="#edbd76" stroke-width="22" stroke-linecap="round" opacity="0.82"/>
  <path d="M322 412 V345 M420 380 V310 M518 410 V278 M616 380 V310 M714 412 V345" stroke="#ffffff" stroke-width="30" stroke-linecap="round" opacity="0.88"/>
  <text x="512" y="805" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="120" font-weight="900" fill="#111318" letter-spacing="-4">TWiST</text>
  <text x="512" y="858" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="42" font-weight="800" fill="#38515a" letter-spacing="10">GLASS</text>
</svg>`;

const dmgBackgroundSvg = String.raw`
<svg xmlns="http://www.w3.org/2000/svg" width="660" height="420" viewBox="0 0 660 420">
  <defs>
    <linearGradient id="bg" x1="0" x2="660" y1="0" y2="420" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#fbfbf4"/>
      <stop offset="0.55" stop-color="#e7efec"/>
      <stop offset="1" stop-color="#f7ead9"/>
    </linearGradient>
    <linearGradient id="line" x1="138" x2="520" y1="212" y2="212" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#69b7e7"/>
      <stop offset="0.5" stop-color="#9fcfb3"/>
      <stop offset="1" stop-color="#edbd76"/>
    </linearGradient>
    <filter id="blur">
      <feGaussianBlur stdDeviation="30"/>
    </filter>
  </defs>
  <rect width="660" height="420" fill="url(#bg)"/>
  <circle cx="118" cy="84" r="110" fill="#9fcfb3" opacity="0.24" filter="url(#blur)"/>
  <circle cx="558" cy="326" r="150" fill="#69b7e7" opacity="0.18" filter="url(#blur)"/>
  <rect x="34" y="34" width="592" height="352" rx="28" fill="#ffffff" opacity="0.34" stroke="#ffffff" stroke-width="2"/>
  <text x="330" y="78" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="26" font-weight="900" fill="#111318">TWiST Glass Sidebar</text>
  <text x="330" y="108" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="13" font-weight="750" fill="#68727d" letter-spacing="1.5">DRAG THE APP INTO APPLICATIONS</text>
  <path d="M218 212 H442" stroke="url(#line)" stroke-width="8" stroke-linecap="round"/>
  <path d="M420 186 L452 212 L420 238" fill="none" stroke="#38515a" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="104" y="156" width="118" height="118" rx="34" fill="#ffffff" opacity="0.44" stroke="#ffffff" stroke-width="2"/>
  <rect x="438" y="156" width="118" height="118" rx="34" fill="#ffffff" opacity="0.44" stroke="#ffffff" stroke-width="2"/>
  <text x="330" y="344" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="14" font-weight="800" fill="#31434d">Realtime podcast intelligence. Local keys. Open source.</text>
</svg>`;

const iconSizes = [
  ["icon_16x16.png", 16],
  ["icon_16x16@2x.png", 32],
  ["icon_32x32.png", 32],
  ["icon_32x32@2x.png", 64],
  ["icon_128x128.png", 128],
  ["icon_128x128@2x.png", 256],
  ["icon_256x256.png", 256],
  ["icon_256x256@2x.png", 512],
  ["icon_512x512.png", 512],
  ["icon_512x512@2x.png", 1024],
];

await mkdir(buildDir, { recursive: true });
await rm(iconsetDir, { recursive: true, force: true });
await mkdir(iconsetDir, { recursive: true });

const iconPng = await sharp(Buffer.from(iconSvg)).png().toBuffer();
await sharp(iconPng).toFile(path.join(buildDir, "icon.png"));

await Promise.all(
  iconSizes.map(([name, size]) =>
    sharp(iconPng)
      .resize(size, size, { fit: "cover" })
      .png()
      .toFile(path.join(iconsetDir, name))
  )
);

await execFileAsync("iconutil", [
  "-c",
  "icns",
  iconsetDir,
  "-o",
  path.join(buildDir, "icon.icns"),
]);

await sharp(Buffer.from(dmgBackgroundSvg))
  .png()
  .toFile(path.join(buildDir, "dmg-background.png"));

await rm(iconsetDir, { recursive: true, force: true });

console.log("Created build/icon.icns and build/dmg-background.png");
