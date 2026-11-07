import type { ArtifactNode, ArtifactPage } from './artifact-document.js'
export type ArtifactMatrix = [number,number,number,number,number,number]
const multiply=(a:ArtifactMatrix,b:ArtifactMatrix):ArtifactMatrix=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]]
export function nodeMatrix(page: ArtifactPage,node:ArtifactNode):ArtifactMatrix {
  const chain:ArtifactNode[]=[];let current:ArtifactNode|undefined=node
  while(current){chain.unshift(current);current=current.parentId?page.nodes[current.parentId]:undefined}
  let matrix:ArtifactMatrix=[1,0,0,1,0,0]
  for(const n of chain){const r=n.rotation*Math.PI/180,c=Math.cos(r),s=Math.sin(r),x=n.flipX?-1:1,y=n.flipY?-1:1;const local:ArtifactMatrix=[c*x,s*x,-s*y,c*y,n.x+n.width/2-c*x*n.width/2+s*y*n.height/2,n.y+n.height/2-s*x*n.width/2-c*y*n.height/2];matrix=multiply(matrix,local)}
  return matrix
}
export function inverseVector(matrix:ArtifactMatrix,x:number,y:number) {
  const [a,b,c,d]=matrix,det=a*d-b*c
  return {x:(d*x-c*y)/det,y:(a*y-b*x)/det}
}
