/** Browser-only, read-only measurement shared by reference and native probes. */
export function measureFontPopup(input){
 const popup=input.closest('.native-font-popup,[role=menu]'),measure=element=>{const css=getComputedStyle(element);return{rect:element.getBoundingClientRect().toJSON(),fontSize:css.fontSize,lineHeight:css.lineHeight,padding:css.padding,borderRadius:css.borderRadius,boxShadow:css.boxShadow,background:css.backgroundColor,color:css.color,boxSizing:css.boxSizing,flex:css.flex,minWidth:css.minWidth,maxWidth:css.maxWidth,width:css.width,height:css.height,margin:css.margin,transform:css.transform}}
 if(!popup)throw Error('未找到字体弹窗')
 return{popup:measure(popup),search:measure(input),searchBox:measure(input.parentElement),options:[...popup.querySelectorAll('[role=option],[role=menuitemradio]')].map(element=>({text:element.textContent,...measure(element)}))}
}

export function measureTextChrome(section){
 const measure=element=>{const style=getComputedStyle(element);return{tag:element.tagName,label:element.getAttribute('aria-label'),role:element.getAttribute('role'),text:element.tagName==='INPUT'?undefined:element.textContent.slice(0,70),rect:element.getBoundingClientRect().toJSON(),fontSize:style.fontSize,lineHeight:style.lineHeight,fontWeight:style.fontWeight,color:style.color,background:style.backgroundColor,padding:style.padding,margin:style.margin,borderRadius:style.borderRadius,borderTop:style.borderTop,boxShadow:style.boxShadow,display:style.display}}
 return{section:measure(section),header:measure(section.firstElementChild),body:measure(section.lastElementChild),controls:[...section.querySelectorAll('input,select,button,summary,[role=radio]')].filter(element=>element.checkVisibility()).map(measure),icons:[...section.querySelectorAll('[data-cds=Icon],svg')].filter(element=>element.checkVisibility()).map(measure),labels:[...section.querySelectorAll('[data-property-row]>div>span:first-child,.native-field>span:first-child,.native-property-pair>span:first-child')].filter(element=>element.checkVisibility()).map(measure)}
}

export function compareTextChrome(reference,native){
 const names=[['添加文本属性','Add to Text'],['文本样式','Text style: Heading 1'],['字体','Font: Arial'],['字重','Weight: Bold'],['字号','Size'],['行高','Line height'],['字距','Letter spacing'],['颜色','Color: #18332B']]
 const compare=(label,actual,expected)=>{
  if(!actual||!expected)throw Error(`缺少文字控件：${label}`)
  const geometry=Object.fromEntries(['x','y','width','height'].map(key=>[key,(actual.rect[key]-(key==='x'?native.section.rect.x:key==='y'?native.section.rect.y:0))-(expected.rect[key]-(key==='x'?reference.section.rect.x:key==='y'?reference.section.rect.y:0))]))
  return{label,geometry,absolute:{x:actual.rect.x-expected.rect.x,y:actual.rect.y-expected.rect.y},fontSize:actual.fontSize===expected.fontSize,lineHeight:actual.lineHeight===expected.lineHeight,sourceFont:{size:expected.fontSize,line:expected.lineHeight},nativeFont:{size:actual.fontSize,line:actual.lineHeight}}
 }
 const controls=names.map(([label,source])=>compare(label,native.controls.find(control=>control.label===label),reference.controls.find(control=>control.label===source)))
 const sourceRadios=reference.controls.filter(control=>control.tag==='SPAN'),nativeRadios=native.controls.filter(control=>control.tag==='SPAN')
 for(let index=0;index<4;index++)controls.push(compare(`文本对齐${index+1}`,nativeRadios[index],sourceRadios[index]))
 return{section:{width:native.section.rect.width-reference.section.rect.width,height:native.section.rect.height-reference.section.rect.height},header:{height:native.header.rect.height-reference.header.rect.height},controls,geometryPassed:controls.every(control=>Object.values(control.geometry).every(value=>Math.abs(value)<=1)),fontsPassed:controls.every(control=>control.fontSize&&(control.label==='文本样式'||control.lineHeight)),nativeSelectLineHeightUnmatched:!controls.find(control=>control.label==='文本样式').lineHeight,wholeVisualQualified:false}
}
