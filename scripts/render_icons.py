"""Export the editable SVG as PNG icons. Requires the rsvg-convert command."""
from pathlib import Path
import shutil
import subprocess

root = Path(__file__).resolve().parent.parent
renderer = shutil.which("rsvg-convert")
if not renderer:
    raise SystemExit("Install librsvg's rsvg-convert to regenerate PNG icons.")
icons = root / "src" / "icons"
for size in (16, 32, 48, 64, 128, 256):
    output = icons / f"image-resizer-{size}.png"
    subprocess.run([
        renderer, "--width", str(size), "--height", str(size),
        "--output", str(output), str(icons / "image-resizer.svg"),
    ], check=True)
    print(output.name)
