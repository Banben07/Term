import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const svg = join(here, '../build/icon-mac.svg');
const iconset = join(here, '../build/icon.iconset');
const icns = join(here, '../build/icon.icns');

const sizes = [
  [16, 'icon_16x16.png'],
  [32, 'icon_16x16@2x.png'],
  [32, 'icon_32x32.png'],
  [64, 'icon_32x32@2x.png'],
  [128, 'icon_128x128.png'],
  [256, 'icon_128x128@2x.png'],
  [256, 'icon_256x256.png'],
  [512, 'icon_256x256@2x.png'],
  [512, 'icon_512x512.png'],
  [1024, 'icon_512x512@2x.png'],
];

function run(cmd, args) {
  const result = spawnSync(cmd, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || `${cmd} failed\n`);
    process.exit(result.status ?? 1);
  }
}

rmSync(iconset, { recursive: true, force: true });
mkdirSync(iconset, { recursive: true });

for (const [size, name] of sizes) {
  run('rsvg-convert', ['-w', String(size), '-h', String(size), svg, '-o', join(iconset, name)]);
}

run('iconutil', ['-c', 'icns', iconset, '-o', icns]);
rmSync(iconset, { recursive: true, force: true });
console.log(`wrote ${icns}`);
