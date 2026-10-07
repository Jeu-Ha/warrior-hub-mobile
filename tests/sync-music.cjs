const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto').webcrypto,path=require('node:path');
const root=path.resolve(process.env.WARRIOR_EXTENSION_ROOT||path.join(__dirname,'../v61'));
const files=new Map(),folders=new Set(['WARRIOR HUB']);
const counters={writes:0};
function event(){const listeners=[];return {listeners,addListener:f=>listeners.push(f),removeListener:f=>{const i=listeners.indexOf(f);if(i>=0)listeners.splice(i,1)}}}
function response(status,value){return {ok:status>=200&&status<300,status,json:async()=>structuredClone(value),text:async()=>typeof value==='string'?value:JSON.stringify(value)}}
async function fetchGraph(input,options={}){
 const url=new URL(input),method=options.method||'GET';let raw=url.pathname.replace('/v1.0',''),key;
 if(raw.startsWith('/me/drive/items/')){key=decodeURIComponent(raw.slice(16).replace(/\/content$/,''));}
 else if(raw.startsWith('/me/drive/root:/'))key=decodeURIComponent(raw.slice(16).replace(/:\/(content|children)$/,''));
 else if(raw==='/me/drive/root/children')key='';else throw new Error('unexpected path '+raw);
 if(method==='POST'){const data=JSON.parse(options.body);folders.add([key,data.name].filter(Boolean).join('/'));return response(201,data)}
 if(method==='PUT'){files.set(key,JSON.parse(options.body));counters.writes++;return response(200,files.get(key))}
 if(method==='DELETE'){files.delete(key);return response(204,{})}
 if(raw.endsWith('/children')){const prefix=key+'/';let entries=[...folders].filter(x=>x.startsWith(prefix)&&!x.slice(prefix.length).includes('/')).map(x=>({id:x,name:x.slice(prefix.length),folder:{}}));entries.push(...[...files.keys()].filter(x=>x.startsWith(prefix)&&!x.slice(prefix.length).includes('/')).map(x=>({id:x,name:x.slice(prefix.length)})));
 // Exercise pagination: a command for this PC must remain reachable past unrelated files.
 const offset=Number(url.searchParams.get('offset')||0),size=80;return response(200,{value:entries.slice(offset,offset+size),...(entries.length>offset+size?{'@odata.nextLink':input.replace(/([?&])offset=\d+(&|$)/,'$1')+(url.search?'&':'?')+'offset='+(offset+size)}:{})});}
 if(raw.endsWith('/content'))return files.has(key)?response(200,files.get(key)):response(404,{});
 return folders.has(key)||files.has(key)?response(200,{name:key.split('/').at(-1)}):response(404,{});
}
function pc(id,{runtime=false}={}){
 const data={warriorState:{todos:[],study:{phase:'work',running:false,notes:'',noteBooks:{}},settings:{}},warriorFastGraphTokensV1:{access_token:'fake',expires_at:Date.now()+999999},warriorOneDriveDeviceIdV51:id};
 const changed=event(),messages=event(),alarms=event(),tabs=[],loads=[];let failRelay=false;
 const storage={async get(keys){if(typeof keys==='string')keys=[keys];return Object.fromEntries(keys.map(k=>[k,structuredClone(data[k])]))},async set(values){const changes={};for(const [key,value]of Object.entries(values)){const oldValue=data[key];data[key]=structuredClone(value);if(JSON.stringify(oldValue)!==JSON.stringify(value))changes[key]={oldValue,newValue:structuredClone(value)}}for(const fn of changed.listeners)fn(changes,'local')},async remove(keys){for(const k of [].concat(keys))delete data[k]}};
 const chrome={storage:{local:storage,onChanged:changed},runtime:{getURL:f=>'chrome-extension://test/'+f,getManifest:()=>({version:'5.19.61'}),onMessage:messages,onStartup:event(),onInstalled:event(),async sendMessage(message){if(message.type==='SPOTIFY_ENGINE_PING')return {ok:true};if(message.type==='SPOTIFY_ENGINE_EXEC'){if(failRelay){failRelay=false;return {ok:false}}loads.push(message.command);return{ok:true}}return new Promise(resolve=>{let waiting=false,done=false;const respond=x=>{if(!done){done=true;resolve(x)}};for(const fn of messages.listeners)waiting=fn(message,{tab:{url:'chrome-extension://test/spotify-engine.html'}},respond)===true||waiting;if(!waiting&&!done)resolve({ok:true})})}},tabs:{async query({url}={}){return tabs.filter(x=>!url||x.url===url)},async create(opts){const tab={id:tabs.length+1,...opts};tabs.push(tab);return tab},async update(id,opts){Object.assign(tabs.find(x=>x.id===id),opts)}},alarms:{onAlarm:alarms,async create(){}}};
 const lockMap=new Map();const navigator={locks:{async request(key,arg,fn){if(typeof arg==='function'){fn=arg;arg={}}if(arg?.ifAvailable&&lockMap.has(key))return fn(null);const prev=lockMap.get(key)||Promise.resolve();let release;const tail=new Promise(r=>release=r);lockMap.set(key,tail);await prev;try{return await fn({name:key})}finally{release();if(lockMap.get(key)===tail)lockMap.delete(key)}}}};
 const ctx=vm.createContext({chrome,navigator,crypto,structuredClone,fetch:fetchGraph,URL,URLSearchParams,TextEncoder,AbortSignal,console,setTimeout:()=>0,clearTimeout(){},Date});
 const run=file=>vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx,{filename:file});
 ctx.importScripts=(...names)=>{for(const name of names){if(name==='background.js'){vm.runInContext("function ensureSpotifyEngine(){return false};chrome.runtime.onMessage.addListener((message,sender,respond)=>{respond({ok:false,error:'Unknown message'});return true})",ctx)}else run(name)}};
 if(runtime)run('background_runtime.js');else {run('graph_client.js');run('onedrive_sync.js');}
 return{ctx,data,storage,tabs,loads,messages,alarms,run,failNextRelay:()=>{failRelay=true}};
}
(async()=>{
 const a=pc('a'),b=pc('b');
 a.data.warriorState.todos=[{id:'one',title:'Calc',updatedAt:'2026-10-07T16:00:00Z'}];
 assert.equal((await a.ctx.WarriorOneDriveSync.syncNow()).ok,true);
 assert.equal((await b.ctx.WarriorOneDriveSync.syncNow()).ok,true);assert.equal(b.data.warriorState.todos[0].title,'Calc');
 a.data.warriorState.todos.push({id:'two',title:'Chem',updatedAt:'2026-10-07T17:00:00Z'});
 b.data.warriorState.todos[0]={...b.data.warriorState.todos[0],completed:true,updatedAt:'2026-10-07T18:00:00Z'};
 await a.ctx.WarriorOneDriveSync.syncNow();await b.ctx.WarriorOneDriveSync.syncNow();await a.ctx.WarriorOneDriveSync.syncNow();
 assert.equal(a.data.warriorState.todos.length,2);assert.equal(a.data.warriorState.todos.find(x=>x.id==='one').completed,true);
 assert.equal(a.data.warriorState.study.running,false);
 const before=counters.writes;await a.ctx.WarriorOneDriveSync.syncNow();assert.equal(counters.writes,before,'unchanged state does not cause another write');
 console.log('PASS: two PCs merge concurrent additions/completion through Graph without folder permission');
 const source=pc('source',{runtime:true});await new Promise(r=>setTimeout(r,50));
 const P='warriorSpotifyPlayerStateV59',Q='warriorSpotifyQueueV61';
 source.data[Q]={tracks:[{id:'AAA',title:'A'},{id:'BBB',title:'B'},{id:'CCC',title:'C'}]};source.data[P]={trackId:'AAA',title:'A',playing:true,position:12,duration:20,at:Date.now(),nextPreview:{trackId:'BBB',index:1},currentIndex:0,shuffleOn:false};
 source.tabs.push({id:1,url:'chrome-extension://test/spotify-engine.html'});
 const runtime=source.ctx.WarriorBackgroundRuntime;
 source.failNextRelay();await assert.rejects(runtime.execute({action:'next',seq:'retry-1'}));assert.equal(source.data[P].trackId,'AAA','failed delivery restores the target for retry');await runtime.execute({action:'next',seq:'retry-1'});assert.equal(source.loads.at(-1).uri,'spotify:track:BBB');source.loads.length=0;source.data[P]={...source.data[P],trackId:'AAA',nextPreview:{trackId:'BBB',index:1}};
 const cmd={action:'next',seq:'pc-1'};assert.equal((await runtime.execute(cmd)).ok,true);assert.equal((await runtime.execute(cmd)).duplicate,true);
 assert.equal(source.loads.filter(x=>x.action==='load').length,1);assert.equal(source.loads[0].uri,'spotify:track:BBB');
 await runtime.engineEvent({eventType:'playback_update',payload:{playingURI:'spotify:track:AAA',position:20000,duration:20000,isPaused:true}});assert.equal(source.loads.length,1,'old playback update cannot switch twice');
 await runtime.engineEvent({eventType:'playback_update',payload:{playingURI:'spotify:track:BBB',position:1000,duration:20000,isPaused:false}});
 await runtime.engineEvent({eventType:'playback_update',payload:{playingURI:'spotify:track:BBB',position:20000,duration:20000,isPaused:true}});
 assert.equal(source.loads.filter(x=>x.action==='load').length,2);assert.equal(source.loads.at(-1).uri,'spotify:track:CCC');
 await runtime.engineEvent({eventType:'playback_update',payload:{playingURI:'spotify:track:CCC',position:19000,duration:20000,isPaused:false}});
 await runtime.execute({action:'pause',seq:'pause'});const afterPause=source.loads.length;
 await runtime.engineEvent({eventType:'playback_update',payload:{playingURI:'spotify:track:CCC',position:20000,duration:20000,isPaused:true}});assert.equal(source.loads.length,afterPause);
 console.log('PASS: background end advances once; explicit pause stays paused; command replay does not skip twice');
 // Cloud command delivery across PCs, including pagination and receipt deduplication.
 source.data.warriorSpotifyExplicitPauseV61=false;source.data.warriorSpotifyRuntimeTargetV61=null;source.data[P]={...source.data[P],trackId:'AAA',playing:true,nextPreview:{trackId:'BBB',index:1},at:Date.now()};
 folders.add('WARRIOR HUB/warrior-desktop-music-commands');for(let i=0;i<100;i++)files.set('WARRIOR HUB/warrior-desktop-music-commands/cmd-other-'+i+'.json',{});
 const key='WARRIOR HUB/warrior-desktop-music-commands/cmd-source-1.json';files.set(key,{targetDeviceId:'source',at:Date.now(),action:'next',seq:'cloud-1'});
 await new Promise(r=>setTimeout(r,30));await source.ctx.WarriorDesktopMusic.cycle();assert(!files.has(key));const count=source.loads.length;
 files.set(key,{targetDeviceId:'source',at:Date.now(),action:'next',seq:'cloud-1'});await source.ctx.WarriorDesktopMusic.cycle();assert.equal(source.loads.length,count);assert(!files.has(key));
 const controller=pc('controller');controller.run('desktop_music.js');await controller.ctx.WarriorDesktopMusic.cycle();assert.equal(controller.ctx.WarriorDesktopMusic.remote().deviceId,'source');await controller.ctx.WarriorDesktopMusic.send({action:'pause'});await source.ctx.WarriorDesktopMusic.cycle();assert.equal(source.data[P].playing,false);
 assert.equal(source.tabs.filter(x=>x.url==='chrome-extension://test/spotify-engine.html').length,1);
 console.log('PASS: PC discovers source and controls it; commands after 100 unrelated files arrive and replay only once; one engine tab');
})().catch(error=>{console.error(error);process.exitCode=1});
