"""Build deterministic public packages without local test data or machine paths."""
import json
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

root = Path(__file__).resolve().parent.parent
source = root / "src"
manifest = json.loads((source / "manifest.json").read_text())
if manifest.get("experiment_apis"):
    maximum = manifest.get("browser_specific_settings", {}).get("gecko", {}).get("strict_max_version")
    if not maximum or maximum == "*":
        raise ValueError("Thunderbird Experiment APIs require a finite strict_max_version before packaging")
for locale in ("en",):
    messages = json.loads((source / "_locales" / locale / "messages.json").read_text())
    assert "extensionDescription" in messages and "actionTitle" in messages
dist = root / "dist"
dist.mkdir(exist_ok=True)


def write_archive(output, paths, relative_to):
    with ZipFile(output, "w", ZIP_DEFLATED) as archive:
        for path in sorted(paths):
            if path.is_symlink():
                raise ValueError(f"Refusing to package a symlink: {path.name}")
            info = ZipInfo(path.relative_to(relative_to).as_posix(), (2026, 1, 1, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, path.read_bytes())
    print(output)


extension_files = [path for path in source.rglob("*") if path.is_file()]
write_archive(dist / f"image-resizer-{manifest['version']}.xpi", extension_files, source)

# Explicitly include only distributable source and documentation. In particular,
# test-results/, emails, screenshots, Git metadata and local profiles stay local.
source_files = extension_files + [root / name for name in ("README.md", "PRIVACY.md", "package.json", ".gitignore")]
source_files += list((root / "scripts").glob("*.py"))
source_files += list((root / "tests").glob("*.test.js"))
source_files += list((root / "distribution").glob("*.md"))
write_archive(dist / f"image-resizer-{manifest['version']}-source.zip", source_files, root)
