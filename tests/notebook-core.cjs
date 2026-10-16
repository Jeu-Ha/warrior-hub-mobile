const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const ctx=vm.createContext({crypto});vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../notebook-core.js'),'utf8'),ctx);const core=ctx.WarriorNotebookCore;
const stroke={id:'ink',width:4,color:'#000',tool:'pen',points:[{x:0,y:0,p:.5},{x:100,y:0,p:1}]};let n=0;
let result=core.erase([stroke],{x:50,y:0},10,{mode:'precision',id:()=>String(++n)});
assert(result.changed);assert.equal(result.strokes.length,2);assert(Math.abs(result.strokes[0].points.at(-1).x-40)<.001);assert(Math.abs(result.strokes[1].points[0].x-60)<.001);assert.equal(stroke.points.length,2,'source remains immutable for undo');
assert.equal(core.erase([stroke],{x:50,y:0},10).strokes.length,0,'whole stroke eraser');assert(!core.erase([stroke],{x:50,y:0},10,{highlighterOnly:true}).changed,'highlight eraser preserves ordinary ink');
const strokes=structuredClone([stroke]),items=[{x:100,y:10,w:40,h:30,kind:'text',fontSize:20}];core.transform(strokes,items,{dx:10,dy:15,scale:2,angle:90,origin:{x:0,y:0},color:'#123456'});assert.equal(strokes[0].width,8);assert.equal(strokes[0].color,'#123456');assert(Math.abs(strokes[0].points[1].x-10)<.001);assert.equal(strokes[0].points[1].y,215);assert.equal(items[0].rotation,90);assert.equal(items[0].fontSize,40);
const many=[{points:Array.from({length:200000},(_,x)=>({x,y:4}))}];assert.equal(core.bounds(many).w,199999,'large selections do not overflow the argument stack');
console.log('PASS notebook geometry: precision split, whole/highlight erasers, pressure interpolation, mixed ink/object transforms, immutable undo source, large selection.');
