// Run with the bundled Node runtime (Node 20+) and Playwright.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const root=path.resolve(__dirname,'..');fs.mkdirSync(path.join(root,'test-output'),{recursive:true});
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+decodeURIComponent(url.pathname.replace(/\/$/,'/index.html')));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return}
  if(process.env.NOTES_DESKTOP&&url.pathname==='/notes/desktop.js'){res.setHeader('Content-Type','text/javascript');res.end('window.WarriorNotesDesktop={loadState:async()=>({}),getTokens:async()=>null,accessToken:async()=>null,onAuthChange:()=>{},back:async()=>{},clearTokens:async()=>{}}');return}
  try{let data=fs.readFileSync(file);if(file.endsWith('/app.js')||file.endsWith('\\app.js'))data=data.toString().replace('boot().catch(e=>',`window.__notesTest={snapshot:()=>({ready:notesBootReady,strokes:activePage?.strokes?.length||0,points:liveStroke?.points.length||0,drawing,inkPointerId,zoom:notebookZoom,touches:noteTouchPoints.size,tool:drawTool,fingerDraw}),pages:()=>noteAll('pages'),save:()=>finishNoteInteraction(),flush:flushDrawingCloud,restore:()=>restoreCloudNotes({background:true}),cloud:fn=>{accessToken=async()=>'fixture';graph=fn},zoom:setNotebookZoom,connection:setNotesConnection,holdEnsure:()=>{const original=pagesFor;window.__releaseEnsure=null;pagesFor=async(...args)=>{const rows=await original(...args);await new Promise(r=>window.__releaseEnsure=r);return rows};window.__pendingEnsure=ensurePages({preserveEditing:true}).finally(()=>pagesFor=original)}};\nboot().catch(e=>`);
    const ext=path.extname(file);res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png'})[ext]||'application/octet-stream');res.end(data);
  }catch{res.writeHead(404).end()}
});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
  const browser=await (process.env.NOTES_WEBKIT?webkit:chromium).launch({headless:true,...(process.env.NOTES_WEBKIT?{}:(process.env.NOTES_CHROME_CHANNEL?{channel:process.env.NOTES_CHROME_CHANNEL}:{}))});
  try{
    const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block'}),page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(String(e)));
    await context.addInitScript(()=>localStorage.setItem('warriorAutoAuthRetryAfter',String(Date.now()+86400000)));
    await page.goto(`http://127.0.0.1:${port}/#notes`);
    await page.waitForFunction(()=>window.__notesTest?.snapshot().ready);
    await page.locator('#newNotebookBtn').click();await page.locator('#newNotebookName').fill('Palm regression');await page.locator('#newNotebookForm button[type=submit]').click();
    await page.waitForSelector('#notesEditor:not([hidden]) canvas');
    const gap=await page.evaluate(()=>document.querySelector('#infinitePaper').getBoundingClientRect().top-document.querySelector('#drawingViewport').getBoundingClientRect().top);assert(gap<=21&&gap>=0);
    const snap=()=>page.evaluate(()=>window.__notesTest.snapshot());
    const fire=(selector,type,pointerType,id,x=80,y=280)=>page.evaluate(({selector,type,pointerType,id,x,y})=>{
      const el=document.querySelector(selector);el.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerType,pointerId:id,clientX:x,clientY:y,width:id===1?50:8,height:id===1?50:8,pressure:.5,button:0,buttons:type==='pointerup'?0:1}));
    },{selector,type,pointerType,id,x,y});
    const canvas='#infinitePaper canvas';
    assert.equal((await snap()).fingerDraw,false);
    await fire(canvas,'pointerdown','touch',1);await fire(canvas,'pointermove','touch',1,120,340);
    assert.equal((await snap()).strokes,0);assert.equal((await snap()).touches,1);
    await fire(canvas,'pointerup','touch',1);
    await fire(canvas,'pointerdown','pen',2);await fire(canvas,'pointermove','pen',2,130,350);
    assert.equal((await snap()).drawing,true);assert.equal((await snap()).strokes,1);
    await fire(canvas,'pointerdown','touch',3);await fire(canvas,'pointerdown','touch',4);await fire(canvas,'pointermove','touch',4,190,400);
    await fire('#undoDrawBtn','click','touch',5);await fire('#deleteItemBtn','click','touch',5);await fire('[data-tool=eraser]','click','touch',5);
    assert.equal((await snap()).strokes,1);assert.equal((await snap()).tool,'pen');assert.equal((await snap()).zoom,1);
    await fire(canvas,'pointerup','pen',2);await fire(canvas,'pointerup','touch',1);await fire(canvas,'pointerup','touch',3);await fire(canvas,'pointerup','touch',4);
    assert.equal((await snap()).drawing,false);assert.equal((await snap()).inkPointerId,null);
    // Immediately after lifting the pen, normal fingers can pan and pinch.
    await fire(canvas,'pointerdown','touch',20,80,350);
    await fire(canvas,'pointermove','touch',20,80,300);
    assert(await page.locator('#drawingViewport').evaluate(el=>el.scrollTop)>0);
    await fire(canvas,'pointerdown','touch',21,180,300);
    await fire(canvas,'pointermove','touch',21,280,300);
    assert((await snap()).zoom>1);assert.equal((await snap()).strokes,1);
    await fire(canvas,'pointerup','touch',20);await fire(canvas,'pointerup','touch',21);
    await page.locator('#zoomResetBtn').click();
    await page.evaluate(()=>window.__notesTest.save());
    assert.equal(await page.evaluate(async()=>(await window.__notesTest.pages()).filter(p=>p.notebookTitle==='Palm regression').reduce((n,p)=>n+(p.strokes?.length||0),0)),1);
    await page.waitForTimeout(750);await fire('[data-tool=hand]','click','touch',6);
    assert.equal((await snap()).tool,'hand');
    await fire(canvas,'pointerdown','touch',7);assert.equal((await snap()).touches,1);
    await fire(canvas,'pointerup','touch',7);
    await page.locator('[data-tool=pen]').click();await fire('#fingerDrawBtn','click','touch',8);
    assert.equal((await snap()).fingerDraw,true);
    await fire(canvas,'pointerdown','touch',9);assert.equal((await snap()).strokes,2);
    await fire(canvas,'pointerdown','pen',10);assert.equal((await snap()).fingerDraw,false);assert.equal((await snap()).strokes,2);
    await fire(canvas,'pointerup','touch',9);assert.equal((await snap()).drawing,true);
    await fire(canvas,'pointercancel','pen',10);assert.equal((await snap()).drawing,false);
    await page.evaluate(()=>window.__notesTest.save());await page.reload();await page.waitForFunction(()=>window.__notesTest?.snapshot().ready);
    await page.locator('[data-notebook-key]').filter({hasText:'Palm regression'}).click();await page.waitForSelector('#notesEditor:not([hidden]) canvas');
    assert.equal((await snap()).strokes,2);assert.equal((await snap()).fingerDraw,false);
    // Native touch lists cover Safari's touch path, including broad finger contacts.
    const native=await page.evaluate(()=>{
      const vp=document.querySelector('#drawingViewport'),r=vp.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+120,before=vp.scrollTop;
      const t=(id,x,y)=>({identifier:id,clientX:x,clientY:y,radiusX:25,radiusY:25,touchType:'direct'});
      const fire=(type,touches,changed=touches)=>{const e=new Event(type,{bubbles:true,cancelable:true});Object.defineProperties(e,{touches:{value:touches},changedTouches:{value:changed}});vp.dispatchEvent(e)};
      fire('touchstart',[t(100,x,y)]);fire('touchmove',[t(100,x,y-70)]);const panned=vp.scrollTop>before;
      fire('touchstart',[t(100,x,y-70),t(101,x+100,y-70)]);fire('touchmove',[t(100,x,y-70),t(101,x+180,y-70)]);const zoomed=document.querySelector('#zoomResetBtn').textContent;
      fire('touchend',[],[t(100,x,y-70),t(101,x+180,y-70)]);return {panned,zoomed};
    });assert(native.panned);assert.notEqual(native.zoomed,'100%');
    await page.locator('#zoomResetBtn').click();
    if(!process.env.NOTES_WEBKIT){
      // Trusted browser input exercises actual pointer capture, unlike dispatchEvent.
      const cdp=await context.newCDPSession(page),r=await page.locator('#drawingViewport').boundingBox();
      const point=(id,x,y)=>({id,x,y,radiusX:25,radiusY:25,force:.5});
      const x=r.x+r.width/2,y=r.y+150,before=await page.locator('#drawingViewport').evaluate(e=>e.scrollTop);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(1,x,y)]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(1,x,y-65)]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      assert(await page.locator('#drawingViewport').evaluate(e=>e.scrollTop)>before);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(1,x-60,y),point(2,x+60,y)]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(1,x-25,y),point(2,x+25,y)]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      assert((await snap()).zoom<1);assert.equal((await snap()).strokes,2);await cdp.detach();
    }
    await page.locator('#zoomResetBtn').tap();assert.equal((await snap()).zoom,1);
    // Zooming out leaves horizontal AND vertical room to move the paper.
    await page.locator('#zoomOutBtn').click();
    assert(await page.locator('#drawingViewport').evaluate(e=>e.scrollWidth>e.clientWidth&&e.scrollHeight>e.clientHeight));
    await page.locator('#zoomResetBtn').click();
    // A cloud save/restore requested mid-stroke must never finish or replace it.
    await fire(canvas,'pointerdown','pen',110);await fire(canvas,'pointermove','pen',110,140,350);
    const live=await page.evaluate(async()=>{
      const canvas=document.querySelector('#infinitePaper canvas'),before=canvas.getBoundingClientRect(),id=__notesTest.snapshot().inkPointerId;
      const flush=await __notesTest.flush(),restore=await __notesTest.restore();__notesTest.connection('syncing');const after=canvas.getBoundingClientRect();
      return {flush,restore,id,same:canvas===document.querySelector('#infinitePaper canvas'),before:[before.x,before.y,before.width,before.height],after:[after.x,after.y,after.width,after.height]};
    });assert.equal(live.flush,false);assert(live.restore.deferred);assert(live.same);assert.deepEqual(live.after,live.before);assert.equal((await snap()).inkPointerId,live.id);
    await fire(canvas,'pointermove','pen',110,180,380);assert((await snap()).points>2);await fire(canvas,'pointerup','pen',110);
    // A cloud refresh waiting for IndexedDB must discard its stale UI replacement.
    await page.waitForTimeout(1250);await page.evaluate(()=>__notesTest.holdEnsure());await page.waitForFunction(()=>typeof __releaseEnsure==='function');
    await fire(canvas,'pointerdown','pen',111);await page.evaluate(async()=>{__releaseEnsure();await __pendingEnsure});assert((await snap()).drawing);
    await fire(canvas,'pointermove','pen',111,190,390);await fire(canvas,'pointerup','pen',111);await page.evaluate(()=>__notesTest.save());
    await page.waitForTimeout(1250);
    await page.evaluate(()=>{
      window.__releaseBackup=null;
      __notesTest.cloud(async(url,opts={})=>{if(opts.method==='PUT'&&!window.__releaseBackup)await new Promise(r=>window.__releaseBackup=r);return new Response('{}',{status:200})});
      window.__pendingBackup=__notesTest.flush();
    });
    await page.waitForFunction(()=>typeof __releaseBackup==='function');
    await fire(canvas,'pointerdown','pen',112);await fire(canvas,'pointermove','pen',112,180,370);
    const duringUpload=await page.evaluate(async()=>{
      const c=document.querySelector('#infinitePaper canvas');__releaseBackup();await __pendingBackup;
      return {same:c===document.querySelector('#infinitePaper canvas'),drawing:__notesTest.snapshot().drawing};
    });assert(duringUpload.same&&duringUpload.drawing);
    await fire(canvas,'pointermove','pen',112,210,400);assert((await snap()).points>2);
    await fire(canvas,'pointerup','pen',112);await page.evaluate(()=>__notesTest.save());
    // The user's 66% -> 118% -> 87% zoom sequence must never clone paper or ink.
    await page.locator('#zoomResetBtn').click();await page.evaluate(()=>__notesTest.zoom(1));await page.waitForTimeout(170);
    const beforeZoom=await page.evaluate(async()=>({ink:JSON.stringify((await __notesTest.pages()).map(p=>[p.key,p.strokes])),bitmap:document.querySelector('#infinitePaper canvas').toDataURL(),pages:(await __notesTest.pages()).length}));
    for(const scale of [.66,1.18,.87,1]){await page.evaluate(scale=>__notesTest.zoom(scale),scale);await page.waitForTimeout(170)}
    const afterZoom=await page.evaluate(async()=>({ink:JSON.stringify((await __notesTest.pages()).map(p=>[p.key,p.strokes])),bitmap:document.querySelector('#infinitePaper canvas').toDataURL(),pages:(await __notesTest.pages()).length,keys:[...document.querySelectorAll('#infinitePaper canvas')].map(c=>c.dataset.pageKey)}));
    assert.equal(afterZoom.ink,beforeZoom.ink);assert.equal(afterZoom.bitmap,beforeZoom.bitmap);assert.equal(afterZoom.pages,beforeZoom.pages);assert.equal(new Set(afterZoom.keys).size,afterZoom.keys.length);
    assert.equal(await page.evaluate(()=>window.getSelection().toString()),'');
    assert.deepEqual(errors,[]);
    await page.screenshot({path:path.join(root,'test-output/notes-input-verified.png'),fullPage:true});
    console.log('PASS: native/trusted finger input, zoom out, free pan, selection protection, mid-stroke cloud deferral, IndexedDB refresh race, persistence and reload.');
  }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
