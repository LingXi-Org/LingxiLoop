"""Inspect a completed native export with ZIP/XML, Pillow, Poppler and LibreOffice.

Usage: python3 scripts/native-export-inspect.py <export-output-directory>
Only the generated pptx-render/fifty-pages.pdf is replaced on each run.
"""
import hashlib, io, json, os, pathlib, re, shutil, subprocess, sys, tempfile, zipfile
import xml.etree.ElementTree as ET
from PIL import Image
root = pathlib.Path(sys.argv[1]); pptx = root / 'fifty-pages.pptx'; pdf = root / 'fifty-pages.pdf'
expected_notes = json.loads((root/'report.json').read_text())['fixture'].get('speakerNotes', 50)
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
ns = {'p':'http://schemas.openxmlformats.org/presentationml/2006/main', 'a':'http://schemas.openxmlformats.org/drawingml/2006/main', 'r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
samples=[]
with zipfile.ZipFile(pptx) as z:
 slides=[name for name in z.namelist() if re.fullmatch(r'ppt/slides/slide[0-9]+\.xml',name)]
 notes=[name for name in z.namelist() if re.fullmatch(r'ppt/notesSlides/notesSlide[0-9]+\.xml',name)]
 assert len(slides)==50 and len(notes)==50
 for n in range(1,51):
  page=ET.fromstring(z.read(f'ppt/slides/slide{n}.xml')); texts=''.join(page.itertext())
  assert f'验收页面 {n}' in texts
  shapes=page.findall('.//p:sp',ns); tables=page.findall('.//a:tbl',ns); pics=page.findall('.//p:pic',ns)
  assert len(shapes)==3 and len(tables)==1 and len(pics)==(3 if n==25 else 2)
  note_tree=ET.fromstring(z.read(f'ppt/notesSlides/notesSlide{n}.xml'))
  note_bodies=[shape for shape in note_tree.findall('.//p:sp',ns) if any(item.attrib.get('type')=='body' for item in shape.findall('.//p:ph',ns))]
  note=''.join(text.text or '' for shape in note_bodies for text in shape.findall('.//a:t',ns))
  assert note==(f'第 {n} 页讲者备注，保存和导出后必须保留。' if expected_notes else ''), (n,note)
  relations={v.attrib['Id']:v.attrib['Target'] for v in ET.fromstring(z.read(f'ppt/slides/_rels/slide{n}.xml.rels'))}
  inspected=[]
  for index,pic in enumerate(pics):
   target=relations[pic.find('.//a:blip',ns).attrib['{'+ns['r']+'}embed']]
   imagepath=os.path.normpath('ppt/slides/'+target)
   image=Image.open(io.BytesIO(z.read(imagepath))).convert('RGBA');bounds=image.getchannel('A').getbbox()
   assert bounds is not None
   if index==0:assert bounds==(0,0,*image.size)
   if n in [1,25,50]:inspected.append({'size':list(image.size),'visibleBounds':list(bounds)})
  if n in [1,25,50]:samples.append({'page':n,'nativeShapes':len(shapes),'nativeTables':len(tables),'pictures':len(pics),'notesPreserved':True,'picturesInspected':inspected})
def pdf_info(path):
 info=subprocess.check_output(['pdfinfo',str(path)],text=True)
 pages=int(re.search(r'^Pages:\s+(\d+)',info,re.M).group(1));assert pages==50
 text=subprocess.check_output(['pdftotext','-layout',str(path),'-'],text=True).split('\f')
 checked=[]
 for n in [1,25,50]:
  assert f'验收页面{n}' in re.sub(r'\s+', '', text[n-1]),(path,n,text[n-1][:200])
  checked.append(n)
 return {'pages':pages,'chineseTextPages':checked}
pdfdata=pdf_info(pdf)
inspection={'slides':50,'notes':expected_notes,'noteParts':len(notes),'speakerNotes':expected_notes,'allPagesNativeObjects':True,'all50FormulaImagesVisible':True,'all50PhotoImagesUncropped':True,'isolatedBlockPage':25,'samples':samples,'pdfPages':pdfdata['pages'],'pdfChineseTextPages':pdfdata['chineseTextPages'],'inputPptxSha256':sha(pptx)}
(root/'pptx-inspection.json').write_text(json.dumps(inspection,indent=2)+'\n')
render=root/'pptx-render';render.mkdir(exist_ok=True)
converted=render/'fifty-pages.pdf';converted.unlink(missing_ok=True)
with tempfile.TemporaryDirectory(prefix='lingxi-native-lo-') as profile:
 subprocess.run([shutil.which('soffice') or '/opt/codex/runtimes/codex-primary-runtime/dependencies/bin/override/soffice','--headless',f'-env:UserInstallation={pathlib.Path(profile).as_uri()}','--convert-to','pdf','--outdir',str(render),str(pptx)],check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
result=pdf_info(converted)
for n in [1,25,50]:subprocess.run(['pdftoppm','-f',str(n),'-l',str(n),'-singlefile','-scale-to','1440','-png',str(converted),str(render/f'page-{n}')],check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
libreoffice={'renderer':'LibreOffice headless → PDF / Poppler','pages':result['pages'],'rendered':[1,25,50],'chineseTextPages':result['chineseTextPages'],'inputPptxSha256':sha(pptx),'pdfBytes':converted.stat().st_size,'pdfSha256':sha(converted)}
(root/'independent-inspection.json').write_text(json.dumps({'inspection':inspection,'libreOffice':libreoffice},indent=2)+'\n')
print(json.dumps({'root':str(root),'inspection':inspection,'libreOffice':libreoffice}))
