import type {ArtifactPage} from './artifact-document.js'

export type ArtifactPaper = 'Letter'|'A4'
export const artifactPaperPoints = {Letter:{width:612,height:792},A4:{width:595.28,height:841.89}} as const
const letterRegions = new Set(['BZ','CA','CL','CO','CR','GT','MX','NI','PA','PH','PR','SV','US','VE'])

export function localeArtifactPaper(languages:readonly string[]):ArtifactPaper {
  for(const language of languages){
    const region=/^(?:[a-z]{2,3})(?:[_-][a-z]{4})?[_-]([a-z]{2})(?=[_-]|$)/i.exec(language)?.[1]
    if(region)return letterRegions.has(region.toUpperCase())?'Letter':'A4'
  }
  return languages[0]?.toLowerCase()==='en'?'Letter':'A4'
}

export function inferArtifactPaper(page:Pick<ArtifactPage,'width'|'height'>):ArtifactPaper|undefined {
  for(const paper of ['Letter','A4'] as const)if(Math.abs(page.width-artifactPaperPoints[paper].width*96/72)<=artifactPaperPoints[paper].width*96/72*.005)return paper
  for(const paper of ['Letter','A4'] as const)if(page.width>0&&Math.abs(page.height/page.width-artifactPaperPoints[paper].height/artifactPaperPoints[paper].width)<=artifactPaperPoints[paper].height/artifactPaperPoints[paper].width*.01)return paper
  return undefined
}

export function artifactPrintPaper(page:Pick<ArtifactPage,'width'|'height'|'paper'>,languages:readonly string[]=typeof navigator==='undefined'?[]:navigator.languages?.length?navigator.languages:[navigator.language]):ArtifactPaper {
  return page.paper==='Letter'||page.paper==='A4'?page.paper:inferArtifactPaper(page)??localeArtifactPaper(languages)
}

/** 旧原生稿的增长/分页语义保持原样；显式打印设置只改变导出分页。 */
export function artifactPrintSheetHeight(page:Pick<ArtifactPage,'width'|'height'|'paper'|'print'|'sizing'>,languages?:readonly string[]):number {
  if(page.print==='fixed')return page.height
  if(page.print==='flow'){
    const paper=artifactPaperPoints[artifactPrintPaper(page,languages)]
    return Math.round(page.width*paper.height/paper.width)
  }
  return page.sizing==='flow'?page.paper==='A4'?page.width*1123/794:page.paper==='Letter'?page.width*1056/816:page.height:page.height
}

export function artifactPrintMode(page:Pick<ArtifactPage,'print'|'sizing'>):'fixed'|'flow' {return page.print??page.sizing??'fixed'}
