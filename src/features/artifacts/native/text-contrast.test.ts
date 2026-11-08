import assert from 'node:assert/strict'
import test from 'node:test'
import {parseContrastColor,textContrastRatio,textContrastMinimum,formatTextContrast} from './text-contrast'

test('固定来源的默认文字与背景产生12.7比1，大字和普通字采用不同门槛',()=>{
 const foreground=parseContrastColor('#18332b'),background=parseContrastColor('#faf8f4');assert.ok(foreground&&background)
 assert.equal(formatTextContrast(textContrastRatio(foreground,background)),'12.7')
 const gray=parseContrastColor('#888');assert.ok(gray)
 const ratio=textContrastRatio(gray,background);assert.equal(formatTextContrast(ratio),'3.3');assert.ok(ratio>=textContrastMinimum(48,700));assert.ok(ratio<textContrastMinimum(16,700))
 assert.equal(textContrastMinimum(24,400),3);assert.equal(textContrastMinimum(18.66,700),3);assert.equal(textContrastMinimum(18.65,700),4.5)
})
test('透明前景按实际背景合成，支持简写与百分比而不提前量化颜色',()=>{
 const foreground=parseContrastColor('rgba(24,51,43,.5)'),background=parseContrastColor('#faf8f4');assert.ok(foreground&&background)
 assert.equal(formatTextContrast(textContrastRatio(foreground,background)),'2.9')
 assert.deepEqual(parseContrastColor('#1234'),{r:17,g:34,b:51,a:68/255})
 assert.deepEqual(parseContrastColor('rgb(100% 0% 0% / 50%)'),{r:255,g:0,b:0,a:.5})
 assert.equal(parseContrastColor('var(--unknown)'),null)
})
test('比值按来源向下保留一位，十以上整数不带多余小数',()=>{
 assert.equal(formatTextContrast(3.399),'3.3');assert.equal(formatTextContrast(3),'3.0');assert.equal(formatTextContrast(12),'12');assert.equal(formatTextContrast(12.799),'12.7')
})
