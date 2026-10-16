/* Geometry shared by screen ink and persisted notebook edits. */
(() => {
 'use strict';
 function bounds(strokes,items=[]){let x=Infinity,y=Infinity,r=-Infinity,b=-Infinity;const add=p=>{x=Math.min(x,p.x);y=Math.min(y,p.y);r=Math.max(r,p.x);b=Math.max(b,p.y)};for(const s of strokes)for(const p of s.points||[])add(p);for(const i of items){add(i);add({x:i.x+i.w,y:i.y+i.h})}return Number.isFinite(x)?{x,y,w:r-x,h:b-y}:null}
 function transform(strokes,items,{dx=0,dy=0,scale=1,angle=0,origin,color}={}){
  const box=bounds(strokes,items);if(!box)return;const o=origin||{x:box.x+box.w/2,y:box.y+box.h/2},a=angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
  const point=p=>{const x=(p.x-o.x)*scale,y=(p.y-o.y)*scale;return{...p,x:o.x+x*c-y*s+dx,y:o.y+x*s+y*c+dy}};
  for(const st of strokes){st.points=st.points.map(point);st.width=(Number(st.width)||4)*scale;if(color)st.color=color}
  for(const it of items){const center=point({x:it.x+it.w/2,y:it.y+it.h/2});it.w*=scale;it.h*=scale;it.x=center.x-it.w/2;it.y=center.y-it.h/2;it.rotation=(Number(it.rotation)||0)+angle;if(it.kind==='text'){it.fontSize=(it.fontSize||38)*scale;if(color)it.color=color}}
 }
 const strokeBoxes=new WeakMap();
 function erase(strokes,p,r,{mode='stroke',highlighterOnly=false,id=()=>crypto.randomUUID()}={}){
  let changed=false;const out=[],inside=q=>(q.x-p.x)**2+(q.y-p.y)**2<=r*r;
  for(const st of strokes){
   if(highlighterOnly&&st.tool!=='highlighter'){out.push(st);continue}
   const pts=st.points||[];let cached=strokeBoxes.get(st);if(!cached||cached.points!==pts||cached.length!==pts.length){cached={points:pts,length:pts.length,box:bounds([st])};strokeBoxes.set(st,cached)}const box=cached.box;if(box&&(p.x+r<box.x||p.x-r>box.x+box.w||p.y+r<box.y||p.y-r>box.y+box.h)){out.push(st);continue}const pieces=[];let run=[],hit=false;
   const flush=()=>{if(run.length)pieces.push(run);run=[]};
   if(pts.length===1){if(inside(pts[0]))hit=true;else run.push(pts[0])}
   for(let i=1;i<pts.length;i++){
    const a=pts[i-1],b=pts[i],vx=b.x-a.x,vy=b.y-a.y,ax=a.x-p.x,ay=a.y-p.y,A=vx*vx+vy*vy,B=2*(ax*vx+ay*vy),C=ax*ax+ay*ay-r*r,D=B*B-4*A*C,ts=[0,1];
    if(A>0&&D>0){for(const t of [(-B-Math.sqrt(D))/(2*A),(-B+Math.sqrt(D))/(2*A)])if(t>0&&t<1)ts.push(t)}ts.sort((a,b)=>a-b);
    const at=t=>({x:a.x+vx*t,y:a.y+vy*t,p:(a.p||.5)+((b.p||.5)-(a.p||.5))*t});
    for(let k=1;k<ts.length;k++){const l=ts[k-1],h=ts[k];if(inside(at((l+h)/2))){hit=true;flush()}else{const start=at(l),end=at(h);if(!run.length)run.push(start);run.push(end)}}
   }
   flush();if(!hit){out.push(st);continue}changed=true;
   if(mode==='precision')for(const points of pieces)out.push({...st,id:id(),points});
  }return{strokes:changed?out:strokes,changed};
 }
 globalThis.WarriorNotebookCore={bounds,transform,erase};
})();
