export const PRESETS = Object.freeze({
  original: { edge: null, quality: null },
  small: { edge: 320, quality: 0.8 },
  medium: { edge: 640, quality: 0.85 },
  large: { edge: 1280, quality: 0.9 },
});

export function fitDimensions(width, height, edge) {
  if (![width, height, edge].every(n => Number.isFinite(n) && n > 0)) {
    throw new Error("Invalid image dimensions");
  }
  const scale = Math.min(1, edge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function isImage(file, name = file.name) {
  return file.type.startsWith("image/") || /\.(jpe?g|png|webp|gif|avif|heic|heif|tiff?|bmp|svg|ico|apng)$/i.test(name);
}

// Inspect the bytes, not just the extension. Animated formats are never flattened.
export function rasterType(bytes) {
  const ascii = (start, length) => String.fromCharCode(...bytes.subarray(start, start + length));
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 137 && ascii(1, 3) === "PNG" &&
      bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let offset = 8; offset + 12 <= bytes.length;) {
      const length = view.getUint32(offset);
      if (offset + length + 12 > bytes.length) return null;
      const kind = ascii(offset + 4, 4);
      if (kind === "acTL") return null;
      if (kind === "IEND") return "image/png";
      offset += length + 12;
    }
    return null;
  }
  if (bytes.length >= 21 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
    if (ascii(12, 4) === "VP8X" && (bytes[20] & 2)) return null;
    return "image/webp";
  }
  return null;
}

function encode(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Image encoding failed")), type, quality);
  });
}

export async function createVariants(file, name = file.name, isCancelled = () => false) {
  const unchanged = Object.fromEntries(Object.keys(PRESETS).map(key => [key, file]));
  const type = rasterType(new Uint8Array(await file.arrayBuffer()));
  if (!type || isCancelled()) return { files: unchanged, unchanged: true };
  let bitmap;
  try {
    // The browser applies EXIF orientation before calculating the target dimensions.
    bitmap = await createImageBitmap(new Blob([file], { type }), { imageOrientation: "from-image" });
    const files = { original: file };
    const originalDimensions = { width: bitmap.width, height: bitmap.height };
    const dimensions = { original: originalDimensions };
    for (const [key, preset] of Object.entries(PRESETS)) {
      if (key === "original") continue;
      if (isCancelled()) return { files: unchanged, unchanged: true };
      const size = fitDimensions(bitmap.width, bitmap.height, preset.edge);
      if (size.width === bitmap.width && size.height === bitmap.height) {
        files[key] = file;
        dimensions[key] = originalDimensions;
        continue;
      }
      const canvas = document.createElement("canvas");
      canvas.width = size.width;
      canvas.height = size.height;
      try {
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas unavailable");
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.drawImage(bitmap, 0, 0, size.width, size.height);
        const blob = await encode(canvas, type, preset.quality);
        // Never attach a larger file, or bytes whose format disagrees with the filename.
        files[key] = blob.type === type && blob.size < file.size
          ? new File([blob], name, { type, lastModified: file.lastModified })
          : file;
        dimensions[key] = files[key] === file ? originalDimensions : size;
      } finally {
        canvas.width = canvas.height = 0;
      }
    }
    return { files, dimensions, unchanged: Object.values(files).every(value => value === file) };
  } catch (error) {
    console.warn("Image Resize: keeping an image that could not be decoded or resized", error);
    return { files: unchanged, unchanged: true, failed: true };
  } finally {
    bitmap?.close();
  }
}
