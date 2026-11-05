import type { ArtifactNode } from './artifact-document.js'

/** Document-unit geometry shared by the live canvas, thumbnails and exports.
 * Keeping the viewBox in document units preserves circular corner radii and
 * stroke widths on non-square shapes. */
export function artifactShapeGeometry(shape: ArtifactNode['shape'], width: number, height: number, radius = 0): {
  tag: 'rect' | 'ellipse' | 'polygon'; attributes: Record<string, number | string>
} {
  if (shape === 'ellipse') return {tag:'ellipse',attributes:{cx:width/2,cy:height/2,rx:width/2,ry:height/2}}
  let points: number[][] | undefined
  if (shape === 'triangle') points=[[.5,0],[1,1],[0,1]]
  if (shape === 'diamond') points=[[.5,0],[1,.5],[.5,1],[0,.5]]
  // Preserve the pre-existing native arrow silhouette for saved documents.
  if (shape === 'arrow') points=[[0,.3],[.65,.3],[.65,0],[1,.5],[.65,1],[.65,.7],[0,.7]]
  if (shape === 'arrow-right') points=[[0,.3],[.6,.3],[.6,.1],[1,.5],[.6,.9],[.6,.7],[0,.7]]
  if (shape === 'arrow-left') points=[[1,.3],[.4,.3],[.4,.1],[0,.5],[.4,.9],[.4,.7],[1,.7]]
  if (shape === 'arrow-up') points=[[.3,1],[.3,.4],[.1,.4],[.5,0],[.9,.4],[.7,.4],[.7,1]]
  if (shape === 'arrow-down') points=[[.3,0],[.3,.6],[.1,.6],[.5,1],[.9,.6],[.7,.6],[.7,0]]
  if (points) return {tag:'polygon',attributes:{points:points.map(([x,y])=>`${x*width},${y*height}`).join(' ')}}
  return {tag:'rect',attributes:{x:0,y:0,width,height,rx:Math.min(radius,width/2,height/2)}}
}
