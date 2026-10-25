"""Record exact vendored snapshots and original-to-adapted source diffs."""
from pathlib import Path
import difflib
import hashlib

root = Path(__file__).resolve().parent
repo = root.parent.parent
upstream = root / 'upstream'
checksums = []
for source in sorted(upstream.rglob('*')):
    if source.is_file():
        checksums.append(f'{hashlib.sha256(source.read_bytes()).hexdigest()}  {source.relative_to(root)}')
(root / 'upstream-sha256.txt').write_text('\n'.join(checksums) + '\n')
patches = []
for name in ['file-list-view.tsx', 'file-manager-toolbar.tsx', 'file-actions.tsx', 'data.ts']:
    source = upstream / 'src/app/(main)/dashboard/file-manager/_components' / name
    local = repo / 'src/features/course-materials' / name
    patches.extend(difflib.unified_diff(source.read_text().splitlines(keepends=True), local.read_text().splitlines(keepends=True),
        fromfile=f'upstream/{source.relative_to(upstream)}', tofile=str(local.relative_to(repo))))
(root / 'adaptations.diff').write_text(''.join(patches))
