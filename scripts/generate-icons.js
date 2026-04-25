// Generates the PWA icons (commit the resulting PNGs to the repo).
// Usage: `npm run icons` or `node scripts/generate-icons.js`.
//
// We render an SVG with shape primitives only — no emoji/text rendering —
// so the result is identical regardless of which fonts are installed on the
// machine running the script (CI vs. local).

import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const BG = '#EDE0CA';
const SPINE = '#5C5043';
const PAGE = '#FAF6F0';
const RULE = '#D4CCBE';
const ACCENT = '#8A7040';

// 512x512 viewBox. Book occupies the central ~70% (safe for `maskable` purpose).
const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${BG}"/>
  <g transform="translate(256 256)">
    <!-- Subtle drop shadow for depth -->
    <g transform="translate(6 8)" opacity="0.18">
      <rect x="-178" y="-130" width="356" height="260" rx="12" fill="#3d362c"/>
    </g>
    <!-- Left page -->
    <path d="M -180 -126 L -10 -106 L -10 134 L -180 114 Z" fill="${PAGE}" stroke="${SPINE}" stroke-width="6" stroke-linejoin="round"/>
    <!-- Right page -->
    <path d="M 180 -126 L 10 -106 L 10 134 L 180 114 Z" fill="${PAGE}" stroke="${SPINE}" stroke-width="6" stroke-linejoin="round"/>
    <!-- Spine block -->
    <path d="M -10 -106 L 0 -118 L 10 -106 L 10 134 L 0 142 L -10 134 Z" fill="${SPINE}"/>
    <!-- Accent band on top of pages -->
    <rect x="-170" y="-118" width="160" height="14" rx="3" fill="${ACCENT}" opacity="0.35"/>
    <rect x="10" y="-118" width="160" height="14" rx="3" fill="${ACCENT}" opacity="0.35"/>
    <!-- Page rules (left) -->
    <line x1="-160" y1="-78" x2="-30" y2="-62" stroke="${RULE}" stroke-width="6" stroke-linecap="round"/>
    <line x1="-160" y1="-48" x2="-30" y2="-32" stroke="${RULE}" stroke-width="6" stroke-linecap="round"/>
    <line x1="-160" y1="-18" x2="-30" y2="-2" stroke="${RULE}" stroke-width="6" stroke-linecap="round"/>
    <line x1="-160" y1="12" x2="-30" y2="28" stroke="${RULE}" stroke-width="6" stroke-linecap="round"/>
    <line x1="-160" y1="42" x2="-30" y2="58" stroke="${RULE}" stroke-width="6" stroke-linecap="round"/>
    <line x1="-160" y1="72" x2="-30" y2="88" stroke="${RULE}" stroke-width="6" stroke-linecap="round"/>
    <!-- Page rules (right) -->
    <line x1="30" y1="-62" x2="160" y2="-78" stroke="${RULE}" stroke-width="6" stroke-linecap="round"/>
    <line x1="30" y1="-32" x2="160" y2="-48" stroke="${RULE}" stroke-width="6" stroke-linecap="round"/>
    <line x1="30" y1="-2" x2="160" y2="-18" stroke="${RULE}" stroke-width="6" stroke-linecap="round"/>
    <line x1="30" y1="28" x2="160" y2="12" stroke="${RULE}" stroke-width="6" stroke-linecap="round"/>
    <line x1="30" y1="58" x2="160" y2="42" stroke="${RULE}" stroke-width="6" stroke-linecap="round"/>
    <line x1="30" y1="88" x2="160" y2="72" stroke="${RULE}" stroke-width="6" stroke-linecap="round"/>
  </g>
</svg>`;

const targets = [
  { size: 192, out: 'public/icons/icon-192.png' },
  { size: 512, out: 'public/icons/icon-512.png' },
  { size: 180, out: 'public/apple-touch-icon.png' },
];

await mkdir(path.join(root, 'public', 'icons'), { recursive: true });

const svgBuffer = Buffer.from(svg);

for (const t of targets) {
  const outPath = path.join(root, t.out);
  await sharp(svgBuffer, { density: 384 })
    .resize(t.size, t.size, { fit: 'cover' })
    .flatten({ background: BG })
    .png({ compressionLevel: 9 })
    .toFile(outPath);
  console.log(`✓ wrote ${t.out} (${t.size}x${t.size})`);
}
