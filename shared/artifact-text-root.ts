import type {ArtifactNode,ArtifactRichText} from './artifact-document.js'

/** 单个标题块本身就是来源文字元素；避免外层div与内层标题具有不同字重。 */
export function artifactTextHeading(node:ArtifactNode):ArtifactRichText|undefined{
 const blocks=node.type==='text'&&node.richText?.type==='doc'?node.richText.content:undefined
 return blocks?.length===1&&blocks[0].type==='heading'?blocks[0]:undefined
}
export function artifactTextRootTag(node:ArtifactNode):'div'|'h1'|'h2'|'h3'|'h4'|'h5'|'h6'{
 const heading=artifactTextHeading(node)
 return heading?`h${heading.attrs?.level??2}` as 'h1'|'h2'|'h3'|'h4'|'h5'|'h6':'div'
}
