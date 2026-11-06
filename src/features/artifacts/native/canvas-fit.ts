interface Box {x:number;y:number;width:number;height:number}
/** Fit the same authored world bounds as the reference: artboard headers belong
 * to the fit, while visibility overscan and paint overflow do not. */
export function designFitBounds(boards:readonly Box[],annotations:readonly Box[]){
  if(!boards.length&&!annotations.length)return undefined
  const all=[...boards,...annotations],left=Math.min(...all.map(p=>p.x)),top=Math.min(...boards.map(p=>p.y-40),...annotations.map(p=>p.y)),right=Math.max(...all.map(p=>p.x+p.width)),bottom=Math.max(...all.map(p=>p.y+p.height))
  return{left,top,right,bottom}
}
export function fitDesignCamera(boards:readonly Box[],annotations:readonly Box[],width:number,height:number){
  const bounds=designFitBounds(boards,annotations);if(!bounds)return undefined
  const {left,top,right,bottom}=bounds
  const w=right-left,h=bottom-top,scale=Math.min(2,Math.max(.01,Math.min((width-96)/w,(height-54-96)/h)))
  return{x:left-(width/scale-w)/2,y:top-54/scale-((height-54)/scale-h)/2,scale}
}
