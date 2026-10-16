/* Mozilla PDF.js is bundled locally; opening homework does not require a CDN. */
(() => {
 let engine;
 async function render(file,{page,onProgress,signal}={}){
  engine=engine||await import('./vendor/pdf-engine.js?v=5.6.205');
  engine.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf-worker.js?v=5.6.205',location.href).href;
  const task=engine.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,useWorkerFetch:false,useSystemFonts:true});
  task.onPassword=()=>{task.destroy();};
  let doc,count=0;
  try{
   doc=await task.promise;
   for(let index=1;index<=doc.numPages;index++){
    if(signal?.aborted)break;onProgress?.(index,doc.numPages);
    const source=await doc.getPage(index),initial=source.getViewport({scale:1}),viewport=source.getViewport({scale:Math.min(2,1800/initial.width,2400/initial.height)}),canvas=document.createElement('canvas');
    canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
    await source.render({canvasContext:canvas.getContext('2d'),viewport,background:'white'}).promise;
    if(signal?.aborted){canvas.width=canvas.height=1;break}
    const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Could not render PDF page')),'image/png'));
    await page(blob,{index,total:doc.numPages,width:canvas.width,height:canvas.height});count++;source.cleanup();canvas.width=canvas.height=1;
    await new Promise(resolve=>setTimeout(resolve,0));
   }
   return count;
  }finally{if(doc)await doc.destroy();else await task.destroy()}
 }
 globalThis.WarriorPDFImport={render};
})();
