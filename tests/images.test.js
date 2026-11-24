import test from "node:test";
import assert from "node:assert/strict";
import { fitDimensions, rasterType, isImage } from "../src/images.js";

test("preserves proportions for landscape, portrait and very narrow images", () => {
  assert.deepEqual(fitDimensions(4032, 3024, 640), { width: 640, height: 480 });
  assert.deepEqual(fitDimensions(3024, 4032, 320), { width: 240, height: 320 });
  assert.deepEqual(fitDimensions(1, 9999, 320), { width: 1, height: 320 });
  assert.deepEqual(fitDimensions(250, 200, 1280), { width: 250, height: 200 });
  assert.throws(() => fitDimensions(0, 400, 320));
});

test("recognizes image attachments with a missing MIME type or unusual extension", () => {
  assert.equal(isImage(new File([], "PHOTO.JPG")), true);
  assert.equal(isImage(new File([], "photo", { type: "image/png" })), true);
  assert.equal(isImage(new File([], "animation.gif")), true);
  assert.equal(isImage(new File([], "notes.txt")), false);
});

test("uses signatures and refuses animated PNG and WebP", () => {
  assert.equal(rasterType(new Uint8Array([255, 216, 255])), "image/jpeg");
  assert.equal(rasterType(new TextEncoder().encode("Not a JPEG")), null);
  const png = (...chunks) => new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, ...chunks.flatMap(chunk => [0, 0, 0, 0, ...new TextEncoder().encode(chunk), 0, 0, 0, 0])]);
  assert.equal(rasterType(png("IHDR", "IDAT", "IEND")), "image/png");
  assert.equal(rasterType(png("IHDR", "acTL", "IDAT", "IEND")), null);
  assert.equal(rasterType(png("IHDR").slice(0, 15)), null);
  const webp = new Uint8Array(30);
  webp.set(new TextEncoder().encode("RIFF"), 0);
  webp.set(new TextEncoder().encode("WEBPVP8X"), 8);
  assert.equal(rasterType(webp), "image/webp");
  webp[20] = 2;
  assert.equal(rasterType(webp), null);
});
