export interface CanvasPoint {x:number;y:number}
export interface CanvasMapping extends CanvasPoint {scale:number}
/** Camera position is the world point at the viewport's top-left corner. */
export function worldCamera(scroll:CanvasPoint,mapping:CanvasMapping):CanvasPoint {
  return{x:(scroll.x-mapping.x)/mapping.scale,y:(scroll.y-mapping.y)/mapping.scale}
}
export function cameraScroll(camera:CanvasPoint,mapping:CanvasMapping):CanvasPoint {
  return{x:camera.x*mapping.scale+mapping.x,y:camera.y*mapping.scale+mapping.y}
}
