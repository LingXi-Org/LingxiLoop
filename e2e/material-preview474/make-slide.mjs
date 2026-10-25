import { readFile, writeFile } from 'node:fs/promises'
import JSZip from 'jszip'

// Preserve the valid existing OOXML package and add only disposable slide content.
const archive = await JSZip.loadAsync(await readFile(new URL('../fixtures/course-materials/triangle.pptx', import.meta.url)))
const slide = archive.file('ppt/slides/slide1.xml')
if (!slide) throw new Error('Existing PPTX fixture has no first slide')
const content = `
<p:sp><p:nvSpPr><p:cNvPr id="2" name="Synthetic Triangle title"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
<p:spPr><a:xfrm><a:off x="914400" y="457200"/><a:ext cx="7315200" cy="914400"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>
<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="3200" b="1"><a:solidFill><a:srgbClr val="0F172A"/></a:solidFill><a:latin typeface="Arial"/></a:rPr><a:t>Triangle has three sides</a:t></a:r><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp>
<p:sp><p:nvSpPr><p:cNvPr id="3" name="Synthetic blue triangle"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
<p:spPr><a:xfrm><a:off x="2743200" y="1828800"/><a:ext cx="3657600" cy="2743200"/></a:xfrm><a:prstGeom prst="triangle"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="2563EB"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr></p:sp>`
archive.file('ppt/slides/slide1.xml', (await slide.async('string')).replace('</p:spTree>', `${content}</p:spTree>`))
await writeFile(new URL('./synthetic-slide.pptx', import.meta.url), await archive.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }))
