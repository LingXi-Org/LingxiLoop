#!/usr/bin/env python3
"""Conservative screenshot diagnostic. Pillow 12.3.0; no masks or antialias
exclusions. A raw pass implies the requested pixel gate; a raw failure alone
does not separate antialiasing from geometry/content differences."""
import argparse
import json
from pathlib import Path
from PIL import Image, ImageChops

parser = argparse.ArgumentParser()
parser.add_argument('--reference', required=True, type=Path)
parser.add_argument('--candidate', required=True, type=Path)
parser.add_argument('--output', required=True, type=Path)
parser.add_argument('--kind', choices=['both','design','slides'], default='both')
parser.add_argument('--state', default='default')
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)
results = []
for kind in ['design','slides'] if args.kind == 'both' else [args.kind]:
    for width in [1920, 1440, 768, 390]:
        for theme in ['light', 'dark']:
            name = f'{kind}-{width}-{theme}.png'
            reference = Image.open(args.reference / name).convert('RGB')
            candidate = Image.open(args.candidate / name).convert('RGB')
            if reference.size != candidate.size:
                raise ValueError(f'Container mismatch: {name}')
            difference = ImageChops.difference(reference, candidate)
            pixels = list(difference.get_flattened_data())
            count = sum(any(pixel) for pixel in pixels)
            ratio = count / len(pixels)
            Image.blend(reference, candidate, .5).save(args.output / f'{name[:-4]}-overlay.png')
            difference.save(args.output / f'{name[:-4]}-diff.png')
            results.append({'image': name, 'width': reference.width, 'height': reference.height,
                            'differentPixels': count, 'rawDifferentRatio': ratio,
                            'conservativePixelPass': ratio <= .005})
report = {'kind': 'matched-synthetic-fixture-raw-pixel-diagnostic', 'state': args.state,
          'masks': [], 'antialiasExclusions': False, 'qualified': False,
          'scope': 'Only the specified matched state; control geometry and complete interaction states remain separate gates.',
          'results': results}
(args.output / 'raw-pixel-results.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'images': len(results), 'rawPasses': sum(row['conservativePixelPass'] for row in results),
                  'qualified': False, 'output': str(args.output)}))
