"""Compare official e2e screenshot pairs without normalizing, resizing or masking pixels."""
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageChops

parser=argparse.ArgumentParser()
parser.add_argument('manifest',type=Path,help='JSON array of {name,upstream,product} screenshot paths')
parser.add_argument('--output',type=Path,required=True)
args=parser.parse_args()
args.output.mkdir(parents=True,exist_ok=True)
results=[]
for pair in json.loads(args.manifest.read_text()):
    left,right=Path(pair['upstream']),Path(pair['product'])
    a,b=Image.open(left).convert('RGBA'),Image.open(right).convert('RGBA')
    result={'name':pair['name'],'upstream':str(left),'product':str(right),'upstreamSha256':hashlib.sha256(left.read_bytes()).hexdigest(),'productSha256':hashlib.sha256(right.read_bytes()).hexdigest(),'upstreamSize':a.size,'productSize':b.size}
    if a.size != b.size:
        result.update(passed=False,reason='Image sizes differ')
    else:
        rgba_delta=ImageChops.difference(a,b)
        delta=rgba_delta.convert('RGB')
        channels=rgba_delta.split()
        maximum=channels[0]
        for channel in channels[1:]:
            maximum=ImageChops.lighter(maximum,channel)
        total=a.width*a.height
        changed=total-maximum.histogram()[0]
        histogram=delta.histogram()
        delta.save(args.output/(pair['name']+'-diff.png'))
        result.update(passed=changed==0,changedPixels=changed,totalPixels=total,changedFraction=changed/total,maxChannelDelta=maximum.getextrema()[1],meanChannelDelta=sum((index%256)*count for index,count in enumerate(histogram))/(total*3))
    results.append(result)
report={'policy':'exact RGBA equality; no resizing, masks, or threshold','passed':bool(results) and all(x['passed'] for x in results),'pairs':results}
(args.output/'diff-report.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'passed':report['passed'],'pairs':len(results),'report':str(args.output/'diff-report.json')}))
raise SystemExit(0 if report['passed'] else 1)
