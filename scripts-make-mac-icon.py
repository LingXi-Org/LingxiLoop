"""Render the committed Electron icon from LingxiLoop's canonical SVG.

Kept for developers who previously invoked this helper directly. Product
artwork is never synthesized here; every derivative begins with
assets/lingxiloop-logo.svg.
"""

from pathlib import Path
import subprocess

source = Path("assets/lingxiloop-logo.svg")
target = Path("build/icon.png")
if not source.is_file():
    raise SystemExit(f"Missing canonical logo: {source}")
target.parent.mkdir(parents=True, exist_ok=True)
subprocess.run(
    ["magick", str(source), "-background", "none", "-resize", "1024x1024", str(target)],
    check=True,
)
print(f"Rendered {target} from {source}")
