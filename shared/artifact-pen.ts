export interface PenPoint {x:number;y:number}
export interface PenGeometry {x:number;y:number;w:number;h:number;d:string}
const MAX_COORDINATE=8000,MAX_PATH=24000
const distance=(a:PenPoint,b:PenPoint)=>Math.sqrt((a.x-b.x)**2+(a.y-b.y)**2)
const unit=(x:number,y:number):PenPoint=>{const length=Math.sqrt(x*x+y*y);return length>0?{x:x/length,y:y/length}:{x:0,y:0}}
const lerp=(a:PenPoint,b:PenPoint,t:number):PenPoint=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t})
const round=(value:number)=>Math.round(value*10)/10

/** Least-squares cubic fitting with chord parameters and Newton refinement.
 * Geometry follows the pinned Design oracle; no upstream runtime is imported. */
function fit(points:PenPoint[],tolerance:number):number[]|null {
  const p=points.filter((point,index)=>!index||point.x!==points[index-1].x||point.y!==points[index-1].y).map(point=>({...point}))
  if(p.length<2)return null
  if(p.length===2)return[p[0].x,p[0].y,p[1].x,p[1].y]
  const output=[p[0].x,p[0].y],errorSquared=tolerance*tolerance
  const tangent=(first:number,last:number)=>{
    const step=last>first?1:-1;let next=first+step
    while(next!==last&&distance(p[first],p[next])<4*tolerance)next+=step
    return unit(p[next].x-p[first].x,p[next].y-p[first].y)
  }
  function segment(first:number,last:number,left:PenPoint,right:PenPoint){
    const start=p[first],end=p[last]
    if(last-first===1){
      const length=distance(start,end),direction=unit(end.x-start.x,end.y-start.y),a=length/3*Math.max(.05,left.x*direction.x+left.y*direction.y),b=length/3*Math.max(.05,-(right.x*direction.x+right.y*direction.y))
      output.push(start.x+left.x*a,start.y+left.y*a,end.x+right.x*b,end.y+right.y*b,end.x,end.y);return
    }
    const parameters=[0]
    for(let i=first+1;i<=last;i++)parameters.push(parameters.at(-1)!+distance(p[i],p[i-1]))
    const total=parameters.at(-1)!
    for(let i=1;i<parameters.length;i++)parameters[i]=total>0?parameters[i]/total:0
    let split=(first+last)>>1,previousError=4*errorSquared
    for(let iteration=0;iteration<=4;iteration++){
      let c00=0,c01=0,c11=0,x0=0,x1=0
      for(let i=first;i<=last;i++){
        const t=parameters[i-first],v=1-t,b1=3*v*v*t,b2=3*v*t*t,base0=v*v*v+b1,base1=b2+t*t*t,ax=left.x*b1,ay=left.y*b1,bx=right.x*b2,by=right.y*b2,dx=p[i].x-start.x*base0-end.x*base1,dy=p[i].y-start.y*base0-end.y*base1
        c00+=ax*ax+ay*ay;c01+=ax*bx+ay*by;c11+=bx*bx+by*by;x0+=ax*dx+ay*dy;x1+=bx*dx+by*dy
      }
      const determinant=c00*c11-c01*c01
      let a=0,b=0
      if(Math.abs(determinant)>1e-12){a=(x0*c11-x1*c01)/determinant;b=(c00*x1-c01*x0)/determinant}
      else if(Math.abs(c00+c01)>1e-12)a=b=x0/(c00+c01)
      const dx=end.x-start.x,dy=end.y-start.y,chord=Math.sqrt(dx*dx+dy*dy)
      if(a<1e-6*chord||b<1e-6*chord||a*(left.x*dx+left.y*dy)-b*(right.x*dx+right.y*dy)>chord*chord)a=b=chord/3
      const c1={x:start.x+left.x*a,y:start.y+left.y*a},c2={x:end.x+right.x*b,y:end.y+right.y*b}
      let maximum=0,worst=(first+last)>>1,monotonic=true
      for(let i=first+1;i<last;i++){
        const t=parameters[i-first],v=1-t,b1=3*v*v*t,b2=3*v*t*t,qx=v*v*v*start.x+b1*c1.x+b2*c2.x+t*t*t*end.x-p[i].x,qy=v*v*v*start.y+b1*c1.y+b2*c2.y+t*t*t*end.y-p[i].y,error=qx*qx+qy*qy
        if(error>=maximum){maximum=error;worst=i}
        const vx=3*(v*v*(c1.x-start.x)+2*v*t*(c2.x-c1.x)+t*t*(end.x-c2.x)),vy=3*(v*v*(c1.y-start.y)+2*v*t*(c2.y-c1.y)+t*t*(end.y-c2.y)),ax=6*(v*(c2.x-2*c1.x+start.x)+t*(end.x-2*c2.x+c1.x)),ay=6*(v*(c2.y-2*c1.y+start.y)+t*(end.y-2*c2.y+c1.y)),denominator=vx*vx+vy*vy+qx*ax+qy*ay,next=Math.abs(denominator)>1e-9?t-(qx*vx+qy*vy)/denominator:t
        if(next<=parameters[i-first-1]||next>=1)monotonic=false
        parameters[i-first]=next
      }
      if(maximum<errorSquared){output.push(c1.x,c1.y,c2.x,c2.y,end.x,end.y);return}
      split=worst
      if(maximum>=previousError||!monotonic)break
      previousError=maximum
    }
    const before=tangent(split,first),after=tangent(split,last),middle=unit(before.x-after.x,before.y-after.y)
    segment(first,split,left,middle);segment(split,last,{x:-middle.x,y:-middle.y},right)
  }
  function smooth(first:number,last:number){
    let previous={...p[first]}
    for(let i=first+1;i<last;i++){
      const original={...p[i]}
      if(distance(p[i],p[i+1])<4*tolerance&&distance(original,previous)<4*tolerance)p[i]={x:(previous.x+2*original.x+p[i+1].x)/4,y:(previous.y+2*original.y+p[i+1].y)/4}
      previous=original
    }
    segment(first,last,tangent(first,last),tangent(last,first))
  }
  let first=0
  const corner=(index:number)=>{
    if(index<=first||index+1>=p.length||distance(p[index],p[index-1])>16*tolerance||distance(p[index],p[index+1])>16*tolerance)return 1
    let before=index-1,after=index+1
    while(before>first&&distance(p[index],p[before])<4*tolerance)before--
    while(after<p.length-1&&distance(p[index],p[after])<4*tolerance)after++
    const left=unit(p[index].x-p[before].x,p[index].y-p[before].y),right=unit(p[after].x-p[index].x,p[after].y-p[index].y)
    return left.x*right.x+left.y*right.y
  }
  for(let i=1;i+1<p.length;i++){const angle=corner(i);if(angle<.5&&angle<=corner(i+1)){smooth(first,i);first=i}}
  smooth(first,p.length-1)
  return output
}

/** Split at coordinate extrema so normalized control boxes stay within limits. */
function splitExtrema(curve:number[]):number[]{
  if(curve.length===4)return[...curve]
  const out=curve.slice(0,2)
  for(let i=2;i+5<curve.length;i+=6){
    let start={x:out.at(-2)!,y:out.at(-1)!},c1={x:curve[i],y:curve[i+1]},c2={x:curve[i+2],y:curve[i+3]}
    const end={x:curve[i+4],y:curve[i+5]},cuts:number[]=[]
    for(const axis of ['x','y'] as const){
      const a=start[axis],b=c1[axis],c=c2[axis],d=end[axis]
      if(Math.min(b,c)>=Math.min(a,d)-.05&&Math.max(b,c)<=Math.max(a,d)+.05)continue
      const quadratic=-a+3*b-3*c+d,linear=2*(a-2*b+c),constant=b-a,discriminant=linear*linear-4*quadratic*constant
      const roots=Math.abs(quadratic)<1e-9?Math.abs(linear)<1e-9?[]:[-constant/linear]:discriminant<0?[]:[(-linear+Math.sqrt(discriminant))/(2*quadratic),(-linear-Math.sqrt(discriminant))/(2*quadratic)]
      cuts.push(...roots.filter(t=>t>.001&&t<1-.001))
    }
    cuts.sort((a,b)=>a-b);let previous=0
    for(const absolute of cuts){
      const t=(absolute-previous)/(1-previous)
      if(t<=.001||t>=1-.001)continue
      const a=lerp(start,c1,t),b=lerp(c1,c2,t),c=lerp(c2,end,t),left=lerp(a,b,t),right=lerp(b,c,t),point=lerp(left,right,t)
      if((point.x-start.x)**2+(point.y-start.y)**2<.25||(point.x-end.x)**2+(point.y-end.y)**2<.25)continue
      out.push(a.x,a.y,left.x,left.y,point.x,point.y);start=point;c1=right;c2=c;previous=absolute
    }
    out.push(c1.x,c1.y,c2.x,c2.y,end.x,end.y)
  }
  return out
}
function normalize(curve:number[]):PenGeometry {
  let x=Infinity,y=Infinity,right=-Infinity,bottom=-Infinity
  for(let i=0;i+1<curve.length;i+=2){x=Math.min(x,curve[i]);y=Math.min(y,curve[i+1]);right=Math.max(right,curve[i]);bottom=Math.max(bottom,curve[i+1])}
  const numbers=curve.map((value,i)=>round(value-(i%2?y:x))),label=(value:number)=>Object.is(value,-0)?'0':String(value)
  let d=`M${label(numbers[0])} ${label(numbers[1])}`
  if(numbers.length===4)d+=` L${label(numbers[2])} ${label(numbers[3])}`
  else for(let i=2;i<numbers.length;i++)d+=((i-2)%6===0?' C':' ')+label(numbers[i])
  return{x,y,w:round(right-x),h:round(bottom-y),d}
}
export function fitCanvasPen(points:PenPoint[],tolerance:number,preview=false):PenGeometry|null {
  if(points.length<2)return null
  const origin={x:Math.min(...points.map(p=>Math.floor(p.x))),y:Math.min(...points.map(p=>Math.floor(p.y)))},local=points.map(p=>({x:p.x-origin.x,y:p.y-origin.y})),largest=Math.max(1,...local.flatMap(p=>[p.x,p.y])),scale=Math.min(1,MAX_COORDINATE/largest)
  for(let error=tolerance;error>0&&Number.isFinite(error)&&error<=16*tolerance;error*=2){
    const curve=fit(local.map(p=>({x:p.x*scale,y:p.y*scale})),error*scale)
    if(!curve||curve.length<=4||preview&&curve.length*2>MAX_PATH)break
    const flattened=splitExtrema(curve)
    if(flattened.length*2>MAX_PATH)continue
    let bounds=normalize(flattened)
    if(preview){if(bounds.d.length>MAX_PATH)break;return{x:round(origin.x+bounds.x),y:round(origin.y+bounds.y),w:Math.max(2,bounds.w),h:Math.max(2,bounds.h),d:bounds.d}}
    const shrink=Math.max(bounds.w,bounds.h)/(MAX_COORDINATE-.5)
    if(shrink>1)bounds=normalize(flattened.map(value=>value/shrink))
    if(bounds.d.length>MAX_PATH)continue
    return{x:round(origin.x+bounds.x),y:round(origin.y+bounds.y),w:Math.max(2,bounds.w),h:Math.max(2,bounds.h),d:bounds.d}
  }
  const stride=Math.max(1,Math.ceil(points.length/1500)),sample=local.filter((_,i)=>i%stride===0||i===local.length-1).map(p=>({x:Math.round(p.x*scale),y:Math.round(p.y*scale)}))
  return{x:origin.x,y:origin.y,w:Math.max(2,...sample.map(p=>p.x)),h:Math.max(2,...sample.map(p=>p.y)),d:sample.map((p,i)=>`${i?' L':'M'}${p.x} ${p.y}`).join('')}
}
