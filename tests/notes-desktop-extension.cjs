const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..'),ext=path.join(root,'desktop-notes'),files=new Map();let seq=0;
fs.mkdirSync(path.join(root,'test-output'),{recursive:true});
const api=`window.__sync={connectNotes,noteAll,noteGet,pagesFor,finishNoteInteraction,showNotebookActions,trashNotebook,get:()=>({activePage,drawCourse,drawDate,state:notesConnectionState}),change:fn=>{fn(activePage);activePageChanged=true},token:()=>authSet('tokens',{access_token:'fixture',expires_at:Date.now()+3600000})};\n`;
// Instrument only the QA copy; the delivered extension has no test hooks.
const app=path.join(ext,'notes/app.js');fs.writeFileSync(app,fs.readFileSync(app,'utf8').replace('boot().catch(',api+'boot().catch('));
const legacyState={courses:[{id:'calc',name:'Calculus II'}],study:{noteBooks:{calc:{'2026-10-05':{text:'Existing desktop text',pages:['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=']}}}}};
fs.writeFileSync(path.join(ext,'test-background.js'),`const fixture=${JSON.stringify(legacyState)};chrome.runtime.onMessage.addListener((m,s,reply)=>{if(m.type==='GET_STATE'){reply({state:fixture});return}if(m.type==='OPEN_STUDY_ROOM')reply({ok:true})});`);
fs.writeFileSync(path.join(ext,'test-launcher.html'),'<!doctype html><button data-open-warrior-notes>Notes</button><script src="notes-launcher.js"></script>');
async function cloudRoute(route){
  const req=route.request(),url=new URL(req.url()),pathname=decodeURIComponent(url.pathname.replace('/v1.0','')),method=req.method();
  const reply=(status,body)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  const entryReply=entry=>entry?route.fulfill({status:200,contentType:entry.type,body:entry.body}):reply(404,{});
  if(pathname.startsWith('/me/drive/items/'))return entryReply([...files.values()].find(f=>f.id===pathname.split('/')[4]));
  if(pathname.endsWith(':/content')){const key=pathname.slice('/me/drive/root:/'.length,-':/content'.length);if(method==='PUT'){files.set(key,{id:files.get(key)?.id||String(++seq),name:key.split('/').at(-1),key,body:req.postDataBuffer(),type:req.headers()['content-type']||'application/json'});return reply(200,{})}return entryReply(files.get(key))}
  if(pathname.endsWith(':/children')){const folder=pathname.slice('/me/drive/root:/'.length,-':/children'.length);return reply(200,{value:[...files.values()].filter(f=>f.key.slice(0,f.key.lastIndexOf('/'))===folder).map(f=>({id:f.id,name:f.name,size:f.body.length}))})}
  if(pathname.startsWith('/me/drive/root:'))return reply(200,{folder:{}});
  return reply(200,{});
}
const source=fs.readFileSync(path.join(root,'app.js'),'utf8');
const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';if(name.includes('..'))return res.writeHead(400).end();let content;try{content=fs.readFileSync(path.join(root,name))}catch{return res.writeHead(404).end()}if(name==='app.js')content=source.replace('boot().catch(',api+'boot().catch(');res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.html')?'text/html':'application/json');res.end(content)});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const context=await chromium.launchPersistentContext('',{channel:'chromium',headless:true,viewport:{width:1440,height:900},args:['--disable-extensions-except='+ext,'--load-extension='+ext]});
 let worker=context.serviceWorkers()[0];if(!worker)worker=await context.waitForEvent('serviceworker');const id=new URL(worker.url()).hostname,base=`chrome-extension://${id}`;
 await context.route('https://graph.microsoft.com/**',cloudRoute);
 const errors=[],p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
 await p.goto(base+'/notes/index.html#notes');await p.waitForFunction(()=>window.__sync&&__sync.get().state==='auth');
 assert.equal(await p.locator('.notebook-file').count(),1);const migrated=await p.evaluate(()=>__sync.noteAll('pages'));assert(migrated.some(x=>x.typedText==='Existing desktop text'&&x.images.length===1));
 await p.evaluate(()=>chrome.storage.local.set({warriorFastGraphTokensV1:{access_token:'fixture',expires_at:Date.now()+3600000}}));await p.waitForFunction(()=>__sync.get().state==='connected');
 await p.reload();await p.waitForFunction(()=>window.__sync&&__sync.get().state==='connected');assert.equal(await p.locator('.notebook-file').count(),1);assert.equal((await p.evaluate(()=>__sync.noteAll('pages'))).filter(x=>x.legacyDesktopSource).length,1);
 // Real extension launcher opens the bundled page and reuses its tab.
 const launcher=await context.newPage();await launcher.goto(base+'/test-launcher.html');await launcher.click('[data-open-warrior-notes]');await launcher.click('[data-open-warrior-notes]');await p.waitForTimeout(100);assert.equal(context.pages().filter(x=>x.url().startsWith(base+'/notes/index.html')).length,1);
 await p.click('.notebook-file');await p.waitForFunction(()=>__sync.get().activePage?.legacyDesktopSource);
 const download=p.waitForEvent('download');await p.click('#noteFileActionsBtn');await p.click('#exportNotebookPdfBtn');const pdf=await download;const pdfPath=path.join(root,'test-output/desktop-migrated-notes.pdf');await pdf.saveAs(pdfPath);assert(fs.readFileSync(pdfPath).subarray(0,8).toString().startsWith('%PDF-1.4'));
 await p.click('#closeNoteActionsBtn');await p.click('#exitNotesBtn');
 // Long press provides edit, rename and recoverable delete inside the extension.
 const box=await p.locator('.notebook-file').boundingBox();await p.mouse.move(box.x+30,box.y+30);await p.mouse.down();await p.waitForTimeout(650);await p.mouse.up();await p.locator('#noteActionsDialog').waitFor({state:'visible'});assert(await p.locator('#editNotebookBtn').isVisible());assert(await p.locator('#deleteNotebookBtn').isVisible());await p.screenshot({path:path.join(root,'test-output/desktop-notes-options.png')});
 await p.click('#deleteNotebookBtn');assert.equal(await p.locator('.notebook-file').count(),0);await p.click('#toggleNotebookTrashBtn');await p.click('.notebook-options');await p.click('#restoreDeletedNotebookBtn');await p.click('#toggleNotebookTrashBtn');assert.equal(await p.locator('.notebook-file').count(),1);
 // A separate tablet browser imports the exact Notes files uploaded by the extension.
 const browser=await chromium.launch({headless:true}),tablet=await browser.newContext({viewport:{width:1024,height:768},hasTouch:true,serviceWorkers:'block'});await tablet.route('https://graph.microsoft.com/**',cloudRoute);const t=await tablet.newPage();t.on('pageerror',e=>errors.push(e.message));await t.addInitScript(()=>localStorage.setItem('warriorAutoAuthRetryAfter',String(Date.now()+86400000)));await t.goto(`http://127.0.0.1:${server.address().port}/#notes`);await t.waitForFunction(()=>window.__sync&&__sync.get().state==='auth');await t.evaluate(async()=>{await __sync.token();await __sync.connectNotes({forcePull:true})});await t.locator('.notebook-file').waitFor();await t.click('.notebook-file');await t.waitForFunction(()=>__sync.get().activePage?.legacyDesktopSource);assert.equal(await t.evaluate(()=>__sync.get().activePage.typedText),'Existing desktop text');
 await t.evaluate(async()=>{__sync.change(p=>{p.strokes.push({id:'tablet-ink',tool:'pen',color:'#11151d',width:4,points:[{x:100,y:100,p:.5},{x:500,y:400,p:.5}]})});await __sync.finishNoteInteraction();await __sync.connectNotes({forcePull:true})});
 await p.evaluate(()=>__sync.connectNotes({forcePull:true}));await p.click('.notebook-file');await p.waitForFunction(()=>__sync.get().activePage?.strokes.some(s=>s.id==='tablet-ink'));
 await p.evaluate(async()=>{__sync.change(p=>{p.strokes.push({id:'pc-ink',tool:'pen',color:'#11151d',width:4,points:[{x:100,y:700,p:.5},{x:500,y:800,p:.5}]})});await __sync.finishNoteInteraction();await __sync.connectNotes({forcePull:true})});await t.evaluate(()=>__sync.connectNotes({forcePull:true}));assert(await t.evaluate(()=>__sync.get().activePage.strokes.some(s=>s.id==='pc-ink')));
 await p.reload();await p.waitForFunction(()=>window.__sync&&__sync.get().state==='connected');await p.click('.notebook-file');await p.waitForFunction(()=>__sync.get().activePage?.strokes.some(s=>s.id==='pc-ink'));
 assert.deepEqual(await p.evaluate(()=>chrome.runtime.sendMessage({type:'GET_STATE'})).then(x=>x.state),legacyState);assert.deepEqual(errors,[]);
 console.log('PASS: actual Chrome extension, native token reuse, launcher tab reuse, old desktop notes recovery, PDF, long-press trash/restore, PC → tablet → PC ink, reload persistence, untouched original state');
 await browser.close();await context.close();server.close();
})().catch(e=>{console.error(e);server.close();process.exit(1)});
