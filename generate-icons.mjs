import sharp from "sharp";
import { readFileSync } from "fs";

const svg = readFileSync("public/icon.svg");

const icons = [
  { name: "apple-touch-icon.png", size: 180 },
  { name: "icon-192.png", size: 192 },
  { name: "icon-512.png", size: 512 },
  { name: "icon-maskable-192.png", size: 192 },
  { name: "icon-maskable-512.png", size: 512 },
];

for (const icon of icons) {
  await sharp(svg)
    .resize(icon.size, icon.size)
    .png()
    .toFile(`public/${icon.name}`);
  console.log("✓", icon.name);
}
console.log("Iconos generados.");
