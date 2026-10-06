(() => {
  'use strict';

  const DB_NAME = 'warrior-hub-onedrive-v51';
  const STORE = 'handles';
  const HANDLE_KEY = 'warriorHubOneDriveDir';
  const META_KEY = 'warriorOneDriveMetaV51';
  const DEVICE_KEY = 'warriorOneDriveDeviceIdV51';
  const FILE_NAME = 'warrior-hub-sync.json'; // legacy read-only compatibility
  const DEVICE_DIR = 'warrior-hub-sync-devices';
  const LEGACY_SYNC_RE = /^warrior-hub-sync(?:-.+)?\.json$/i;
  const SCHEMA = 1;
  const LOCAL_STUDY = new Set(['phase','running','endAt','remainingMs','cycles','spotifyActive','notesSubjectKey','notesDayKey']);
  const sharePath = path => path !== 'sync' && !(path.startsWith('study.') && LOCAL_STUDY.has(path.slice(6)));
  function shareState(state){const out=clone(state);delete out.sync;if(out.study)for(const k of LOCAL_STUDY)delete out.study[k];return out;}
  const SYNC_DEBOUNCE_MS = 2500;
  const PULL_INTERVAL_MS = 60000;
  const DEBUG_ENABLED_KEY = 'warriorDebugEnabledV59';

  let dirHandle = null;
  let syncBusy = false;
  let syncQueued = false;
  let changeTimer = null;
  let pollTimer = null;
  let initialized = false;
  let lastStatus = { connected:false, state:'not-connected', text:'Not connected' };
  let warriorDebugEnabled=false;
  chrome.storage.local.get(DEBUG_ENABLED_KEY).then(g=>warriorDebugEnabled=!!g?.[DEBUG_ENABLED_KEY]).catch(()=>{});
  chrome.storage.onChanged.addListener((c,a)=>{if(a==='local'&&c[DEBUG_ENABLED_KEY])warriorDebugEnabled=!!c[DEBUG_ENABLED_KEY].newValue});

  function debug(event,data={}){if(!warriorDebugEnabled)return;try{chrome.runtime.sendMessage({type:'DEBUG_LOG',source:'onedrive-sync',event,data}).catch(()=>{})}catch(_){}}

  const clone = v => {
    try { return structuredClone(v); } catch (_) { return JSON.parse(JSON.stringify(v)); }
  };
  const json = v => JSON.stringify(v ?? null);
  const eq = (a,b) => json(a) === json(b);
  const now = () => Date.now();
  const makeId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);

  function trackedPaths(state={}) {
    const out = [];
    for (const key of Object.keys(state || {})) {
      if (key === 'sync') continue; // device-local Canvas/Mail capture status
      if (key === 'study' && state.study && typeof state.study === 'object' && !Array.isArray(state.study)) {
        for (const sk of Object.keys(state.study)) if(!LOCAL_STUDY.has(sk)) out.push(`study.${sk}`);
      } else if (key === 'settings' && state.settings && typeof state.settings === 'object' && !Array.isArray(state.settings)) {
        for (const sk of Object.keys(state.settings)) out.push(`settings.${sk}`);
      } else if (key === 'previewRead' && state.previewRead && typeof state.previewRead === 'object' && !Array.isArray(state.previewRead)) {
        for (const sk of Object.keys(state.previewRead)) out.push(`previewRead.${sk}`);
      } else {
        out.push(key);
      }
    }
    return out;
  }

  function getPath(obj,path){
    return String(path).split('.').reduce((v,k)=>v == null ? undefined : v[k], obj);
  }
  function setPath(obj,path,value){
    const parts=String(path).split('.'); let cur=obj;
    for(let i=0;i<parts.length-1;i++){
      const k=parts[i]; if(!cur[k] || typeof cur[k]!=='object' || Array.isArray(cur[k])) cur[k]={}; cur=cur[k];
    }
    cur[parts[parts.length-1]]=clone(value);
  }

  async function fingerprint(value){
    const text=json(value);
    try{
      const bytes=new TextEncoder().encode(text);
      const digest=await crypto.subtle.digest('SHA-256',bytes);
      return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
    }catch(_){ return text; }
  }

  async function fingerprintState(state){
    const result={};
    for(const path of trackedPaths(state)) result[path]=await fingerprint(getPath(state,path));
    return result;
  }

  async function openDb(){
    return await new Promise((resolve,reject)=>{
      const req=indexedDB.open(DB_NAME,1);
      req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE)};
      req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
    });
  }
  async function dbGet(key){
    const db=await openDb();
    try{return await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readonly'),req=tx.objectStore(STORE).get(key);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error)})}
    finally{db.close()}
  }
  async function dbSet(key,value){
    const db=await openDb();
    try{await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(value,key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}
    finally{db.close()}
  }
  async function dbDelete(key){
    const db=await openDb();
    try{await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}
    finally{db.close()}
  }

  async function storageGet(keys){ return await chrome.storage.local.get(keys).catch(()=>({})); }
  async function storageSet(v){ return await chrome.storage.local.set(v); }

  async function ensureDeviceId(){
    const got=await storageGet(DEVICE_KEY); let id=String(got?.[DEVICE_KEY]||'');
    if(!id){id=makeId(); await storageSet({[DEVICE_KEY]:id})}
    return id;
  }

  async function getMeta(){
    const got=await storageGet(META_KEY);
    return { clocks:{}, fingerprints:{}, lastSyncAt:0, lastCloudUpdatedAt:0, folderName:'', ...(got?.[META_KEY]||{}) };
  }
  async function putMeta(meta){ await storageSet({[META_KEY]:meta}); }

  function emit(status){
    lastStatus={...lastStatus,...status};debug('onedrive-status',{status:lastStatus});
    let banner=document.getElementById('onedriveProblem');
    if(!banner && document.getElementById('view-today')){banner=document.createElement('div');banner.id='onedriveProblem';banner.className='notice';banner.setAttribute('role','status');document.getElementById('view-today').prepend(banner);}
    if(banner){
      const needsAction=['permission','error'].includes(lastStatus.state);banner.hidden=!needsAction;
      if(needsAction){
        banner.replaceChildren();
        const msg=document.createElement('span');msg.textContent=lastStatus.text;banner.appendChild(msg);
        const btn=document.createElement('button');btn.type='button';btn.className='onedrive-banner-action';btn.textContent=lastStatus.connected?'Reconnect OneDrive':'Connect OneDrive';btn.addEventListener('click',()=>connect());banner.appendChild(btn);
      }else banner.textContent='';
    }
    renderUi();
    try{window.dispatchEvent(new CustomEvent('warrior-onedrive-status',{detail:clone(lastStatus)}))}catch(_){}
  }

  function renderUi(){
    const status=document.getElementById('onedriveStatus');
    const connect=document.getElementById('onedriveConnectBtn');
    const sync=document.getElementById('onedriveSyncBtn');
    const disconnect=document.getElementById('onedriveDisconnectBtn');
    if(status){status.textContent=lastStatus.text||'OneDrive';status.dataset.state=lastStatus.state||''}
    if(connect){connect.textContent=lastStatus.connected?'Reconnect folder':'Connect OneDrive folder'}
    if(sync) sync.disabled=!lastStatus.connected||syncBusy;
    if(disconnect) disconnect.hidden=!lastStatus.connected;
  }

  async function permission(handle,{request=false}={}){
    if(!handle)return false;
    const opts={mode:'readwrite'};
    try{if((await handle.queryPermission(opts))==='granted')return true}catch(_){}
    if(request){try{return (await handle.requestPermission(opts))==='granted'}catch(_){}}
    return false;
  }

  async function loadHandle(){
    if(dirHandle)return dirHandle;
    try{dirHandle=await dbGet(HANDLE_KEY)}catch(_){dirHandle=null}
    return dirHandle;
  }

  async function parseCloudFile(fh,{quiet=false}={}){
    try{
      const f=await fh.getFile(); const text=await f.text();
      if(!text.trim())return null;
      const data=JSON.parse(text);
      if(!data || Number(data.schema)!==SCHEMA || !data.warriorState || typeof data.warriorState!=='object'){
        if(quiet)return null;
        throw new Error('Unsupported OneDrive sync file');
      }
      return data;
    }catch(e){
      if(quiet)return null;
      throw e;
    }
  }

  async function readNamedCloud(handle,name,{quiet=false}={}){
    try{return await parseCloudFile(await handle.getFileHandle(name,{create:false}),{quiet})}
    catch(e){if(e?.name==='NotFoundError')return null;if(quiet)return null;throw e}
  }

  function deviceFileName(deviceId){
    const safe=String(deviceId||'device').replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,96)||'device';
    return `device-${safe}.json`;
  }

  async function deviceDirectory(handle,{create=false}={}){
    try{return await handle.getDirectoryHandle(DEVICE_DIR,{create})}
    catch(e){if(!create&&e?.name==='NotFoundError')return null;throw e}
  }

  async function readDeviceCloud(handle,deviceId){
    const dir=await deviceDirectory(handle,{create:false});
    if(!dir)return null;
    return await readNamedCloud(dir,deviceFileName(deviceId),{quiet:true});
  }

  async function writeDeviceCloud(handle,deviceId,payload){
    const dir=await deviceDirectory(handle,{create:true});
    const fh=await dir.getFileHandle(deviceFileName(deviceId),{create:true});
    const writable=await fh.createWritable();
    await writable.write(JSON.stringify(payload,null,2));
    await writable.close();
  }

  async function listDeviceSnapshots(handle){
    const out=[];
    const dir=await deviceDirectory(handle,{create:false});
    if(!dir)return out;
    try{
      for await (const [name,entry] of dir.entries()){
        if(entry?.kind!=='file'||!/\.json$/i.test(name))continue;
        const data=await parseCloudFile(entry,{quiet:true});
        if(data)out.push({...data,__source:`${DEVICE_DIR}/${name}`});
      }
    }catch(e){debug('onedrive-device-list-error',{error:String(e?.message||e)})}
    return out;
  }

  async function listLegacySnapshots(handle,{includeConflicts=false}={}){
    const out=[];
    const canonical=await readNamedCloud(handle,FILE_NAME,{quiet:true});
    if(canonical)out.push({...canonical,__source:FILE_NAME});
    if(includeConflicts){
      try{
        for await (const [name,entry] of handle.entries()){
          if(entry?.kind!=='file'||name===FILE_NAME||!LEGACY_SYNC_RE.test(name))continue;
          const data=await parseCloudFile(entry,{quiet:true});
          if(data)out.push({...data,__source:name,__legacyConflict:true});
        }
      }catch(e){debug('onedrive-legacy-list-error',{error:String(e?.message||e)})}
    }
    return out;
  }

  async function readCloudSnapshots(handle,{recoverLegacyConflicts=false}={}){
    const all=[...(await listLegacySnapshots(handle,{includeConflicts:recoverLegacyConflicts})),...(await listDeviceSnapshots(handle))];
    const seen=new Set(),out=[];
    for(const snap of all){
      const key=`${String(snap.deviceId||'')}|${Number(snap.updatedAt||0)}|${JSON.stringify(snap.clocks||{}).length}|${JSON.stringify(snap.warriorState||{}).length}`;
      if(seen.has(key))continue;seen.add(key);out.push(snap);
    }
    out.sort((a,b)=>Number(a.updatedAt||0)-Number(b.updatedAt||0));
    return out;
  }

  function unionStrings(a,b){ return [...new Set([...(Array.isArray(a)?a:[]),...(Array.isArray(b)?b:[])].map(String))]; }
  function unionObject(a,b){ return {...(a&&typeof a==='object'?a:{}),...(b&&typeof b==='object'?b:{})}; }

  function mergeAssignmentStatus(local,cloud){
    const out={...(local&&typeof local==='object'&&!Array.isArray(local)?local:{})};
    const remote=cloud&&typeof cloud==='object'&&!Array.isArray(cloud)?cloud:{};
    for(const [id,entry] of Object.entries(remote)){
      const le=out[id];
      const lt=Date.parse(le?.updatedAt||0)||0;
      const rt=Date.parse(entry?.updatedAt||0)||0;
      if(!le||rt>lt)out[id]=clone(entry);
    }
    return out;
  }

  function mergeNoteBooks(local,cloud){
    const out=clone(local&&typeof local==='object'?local:{}), remote=cloud&&typeof cloud==='object'?cloud:{};
    for(const [course,days] of Object.entries(remote)){
      if(!days||typeof days!=='object'||Array.isArray(days))continue;
      if(!out[course]||typeof out[course]!=='object'||Array.isArray(out[course]))out[course]={};
      for(const [day,entry] of Object.entries(days)){
        if(!entry||typeof entry!=='object')continue;
        const le=out[course][day];
        if(!le||typeof le!=='object'){out[course][day]=clone(entry);continue;}
        const lt=Date.parse(le.updatedAt||0)||0, rt=Date.parse(entry.updatedAt||0)||0;
        const newer=rt>lt?entry:le, older=rt>lt?le:entry;
        const pageMap=new Map();
        for(const page of [...(Array.isArray(older.pages)?older.pages:[]),...(Array.isArray(newer.pages)?newer.pages:[])]){
          const key=typeof page==='string'?`s:${page}`:`o:${JSON.stringify(page)}`;
          if(!pageMap.has(key))pageMap.set(key,clone(page));
        }
        const mergedUpdated=Math.max(lt,rt);out[course][day]={...clone(older),...clone(newer),text:String(newer.text??older.text??''),pages:[...pageMap.values()],updatedAt:mergedUpdated?new Date(mergedUpdated).toISOString():(newer.updatedAt||older.updatedAt||null)};
      }
    }
    return out;
  }


  function mergeManualAssignmentStatus(local,cloud){
    const out={...(local&&typeof local==='object'?clone(local):{})};
    for(const [id,remote] of Object.entries(cloud&&typeof cloud==='object'?cloud:{})){
      const here=out[id];
      if(!here){out[id]=clone(remote);continue;}
      const lt=Date.parse(here?.updatedAt||0)||0,rt=Date.parse(remote?.updatedAt||0)||0;
      if(rt>lt)out[id]=clone(remote);
    }
    return out;
  }

  function mergeTodos(local,cloud){
    const map=new Map();
    for(const raw of [...(Array.isArray(local)?local:[]),...(Array.isArray(cloud)?cloud:[])]){
      if(!raw||typeof raw!=='object')continue;
      const id=String(raw.id||'').trim();if(!id)continue;
      const prev=map.get(id);
      const ts=Date.parse(raw.updatedAt||raw.createdAt||0)||0;
      const pts=prev?(Date.parse(prev.updatedAt||prev.createdAt||0)||0):-1;
      if(!prev||ts>=pts)map.set(id,clone(raw));
    }
    return [...map.values()];
  }

  function mergeSpecial(path,local,cloud){
    if(path==='hiddenAssignments'||path==='previewRead.announcements'||path==='previewRead.mail') return unionStrings(local,cloud);
    if(path==='notified'||path==='notifiedMail') return unionObject(local,cloud);
    if(path==='manualAssignmentStatus') return mergeManualAssignmentStatus(local,cloud);
    if(path==='study.noteBooks') return mergeNoteBooks(local,cloud);
    if(path==='todos') return mergeTodos(local,cloud);
    return undefined;
  }

  function looksLikeFreshInstall(state={}){
    const emptyArray=k=>!Array.isArray(state[k])||state[k].length===0;
    const study=state.study||{},settings=state.settings||{},preview=state.previewRead||{};
    return ['assignments','announcements','courses','schedule','mail','hiddenAssignments'].every(emptyArray)
      && (!Array.isArray(preview.announcements)||preview.announcements.length===0)
      && (!Array.isArray(preview.mail)||preview.mail.length===0)
      && !Object.keys(state.notified||{}).length && !Object.keys(state.notifiedMail||{}).length
      && !String(study.notes||'').trim() && !String(study.focusText||'').trim() && !String(study.focusAssignmentId||'').trim()
      && !Object.keys(study.notesByCourse||{}).length && !Object.keys(study.noteBooks||{}).length
      && Number(study.cycles||0)===0 && study.running!==true
      && (settings.notifyDueSoon===undefined||settings.notifyDueSoon===true)
      && (settings.dueSoonHours===undefined||Number(settings.dueSoonHours)===24)
      && (settings.refreshMinutes===undefined||Number(settings.refreshMinutes)===10);
  }

  async function prepareLocalMeta(local,meta,{stampChanges=true}={}){
    const fps=await fingerprintState(local);
    const clocks={...(meta.clocks||{})};
    const old=meta.fingerprints||{};
    const stamp=now();
    for(const path of Object.keys(fps)){
      if(old[path]!==fps[path] && stampChanges) clocks[path]=stamp;
    }
    return {...meta,clocks,fingerprints:fps};
  }

  async function mergeState(local,cloudState,localMeta,cloudClocks={},cloudUpdatedAt=0){
    const result=clone(local||{});
    const paths=new Set([...trackedPaths(local||{}),...trackedPaths(cloudState||{}),...Object.keys(localMeta.clocks||{}),...Object.keys(cloudClocks||{})]);
    const clocks={...(cloudClocks||{}),...(localMeta.clocks||{})};
    for(const path of paths){
      if(!sharePath(path))continue;
      const lv=getPath(local,path),cv=getPath(cloudState,path);
      if(typeof cv==='undefined')continue;
      if(typeof lv==='undefined'){setPath(result,path,cv);clocks[path]=Number(cloudClocks[path]||cloudUpdatedAt||0);continue}
      const special=mergeSpecial(path,lv,cv);
      if(typeof special!=='undefined'){
        setPath(result,path,special);
        clocks[path]=Math.max(Number(localMeta.clocks?.[path]||0),Number(cloudClocks?.[path]||0),Number(cloudUpdatedAt||0));
        continue;
      }
      const lc=Number(localMeta.clocks?.[path]||0),cc=Number(cloudClocks?.[path]||0);
      if(cc>lc)setPath(result,path,cv);
      else if(cc===lc && !eq(lv,cv) && Number(cloudUpdatedAt||0)>Number(localMeta.lastSyncAt||0))setPath(result,path,cv);
      clocks[path]=Math.max(lc,cc);
    }
    // Keep this device's scraper/login status local.
    if(local?.sync)result.sync=clone(local.sync);
    return {state:result,clocks};
  }

  async function syncNow(options={}){
    if(navigator.locks)return navigator.locks.request('warrior-onedrive-sync',()=>syncLocked(options));
    return syncLocked(options);
  }
  async function syncLocked({userGesture=false,reason='manual'}={}){
    debug('onedrive-sync-start',{userGesture,reason});
    if(syncBusy){syncQueued=true;return {ok:false,busy:true}}
    syncBusy=true;renderUi();
    try{
      const handle=await loadHandle();
      if(!handle){emit({connected:false,state:'not-connected',text:'OneDrive: not connected'});return {ok:false,reason:'not-connected'}}
      const allowed=await permission(handle,{request:userGesture});
      if(!allowed){emit({connected:true,state:'permission',text:'OneDrive: click Reconnect folder to grant access'});return {ok:false,reason:'permission'}}

      emit({connected:true,state:'syncing',text:'OneDrive: syncing…'});
      const got=await storageGet('warriorState');
      const local=got?.warriorState||{};
      const baseMeta=await getMeta();
      const deviceId=await ensureDeviceId();
      // v5.17.2 stops all automatic writes to the shared legacy file. Every device owns
      // one unique shard instead, so two PCs can never ask OneDrive to edit the same file.
      // On the first sharded sync we also rescue the old OneDrive conflict copies.
      const recoverLegacyConflicts=!baseMeta.shardedRecoveryComplete;
      const snapshots=await readCloudSnapshots(handle,{recoverLegacyConflicts});
      const firstSync=!Number(baseMeta.lastSyncAt||0)&&!Object.keys(baseMeta.fingerprints||{}).length;
      const stampLocal=!(firstSync&&snapshots.length&&looksLikeFreshInstall(local));
      let meta=await prepareLocalMeta(local,baseMeta,{stampChanges:stampLocal});
      let merged=local, clocks={...(meta.clocks||{})};
      for(const cloud of snapshots){
        const r=await mergeState(merged,cloud.warriorState||{},{...meta,clocks},cloud.clocks||{},Number(cloud.updatedAt||0));
        merged=r.state;clocks=r.clocks;
      }

      const latest=(await storageGet('warriorState')).warriorState||{};
      if(!eq(local,latest)){syncQueued=true;return {ok:false,busy:true};}
      if(!eq(local,merged)) await storageSet({warriorState:merged});
      const checkedAt=now();
      const fingerprints=await fingerprintState(merged);
      for(const path of Object.keys(fingerprints)) if(!Number(clocks[path]))clocks[path]=checkedAt;
      const shared=shareState(merged);
      for(const k of Object.keys(clocks))if(!sharePath(k))delete clocks[k];
      const ownCloud=await readDeviceCloud(handle,deviceId);
      const cloudNeedsWrite=!ownCloud||!eq(ownCloud.warriorState||{},shared)||!eq(ownCloud.clocks||{},clocks);
      const cloudUpdatedAt=cloudNeedsWrite?checkedAt:Number(ownCloud?.updatedAt||Math.max(checkedAt,...snapshots.map(x=>Number(x.updatedAt||0))));
      let writeVerified=false;
      const ownFile=`${DEVICE_DIR}/${deviceFileName(deviceId)}`;
      if(cloudNeedsWrite){
        const payload={schema:SCHEMA,app:'Warrior Hub',syncMode:'device-shard-v1',version:chrome.runtime.getManifest().version,updatedAt:cloudUpdatedAt,deviceId,clocks,warriorState:shared};
        await writeDeviceCloud(handle,deviceId,payload);
        const verify=await readDeviceCloud(handle,deviceId);
        if(!verify||Number(verify.updatedAt)!==Number(payload.updatedAt)||String(verify.deviceId||'')!==String(payload.deviceId||''))throw new Error('OneDrive device shard write could not be verified');
        writeVerified=true;
      }
      meta={...meta,clocks,fingerprints,lastSyncAt:checkedAt,lastCloudUpdatedAt:cloudUpdatedAt,folderName:String(handle.name||meta.folderName||'OneDrive'),lastReason:reason,lastWriteVerifiedAt:writeVerified?checkedAt:Number(meta.lastWriteVerifiedAt||0),shardedRecoveryComplete:true,shardedSync:true};
      await putMeta(meta);
      emit({connected:true,state:'ok',text:`OneDrive: conflict-safe sync · ${meta.folderName}/${ownFile}${writeVerified?' · write verified':''}`,folderName:meta.folderName,lastSyncAt:checkedAt,fileName:ownFile,writeVerified});
      debug('onedrive-sync-success',{reason,writeVerified,folderName:meta.folderName,lastSyncAt:checkedAt,cloudUpdatedAt,cloudNeedsWrite,snapshotCount:snapshots.length,recoveredLegacyConflicts:snapshots.filter(x=>x.__legacyConflict).length,ownFile});return {ok:true,state:merged};
    }catch(e){
      console.warn('[Warrior Hub OneDrive]',e);
      emit({connected:!!dirHandle,state:'error',text:`OneDrive: ${String(e?.message||'sync error').slice(0,90)}`});
      debug('onedrive-sync-error',{reason,error:String(e?.message||e)});return {ok:false,error:String(e?.message||e)};
    }finally{
      syncBusy=false;renderUi();
      if(syncQueued){syncQueued=false;setTimeout(()=>syncNow({reason:'queued'}),120)}
    }
  }

  async function connect(){
    if(typeof window.showDirectoryPicker!=='function'){
      emit({connected:false,state:'unsupported',text:'OneDrive: this Chrome build cannot select a folder'});return {ok:false};
    }
    try{
      const saved=await loadHandle();
      if(saved && await permission(saved,{request:true}))return await syncNow({userGesture:true,reason:'reconnect'});
      const handle=await window.showDirectoryPicker({id:'warrior-hub-onedrive',mode:'readwrite'});
      dirHandle=handle;await dbSet(HANDLE_KEY,handle);
      const meta=await getMeta();meta.folderName=String(handle.name||'OneDrive');await putMeta(meta);
      emit({connected:true,state:'ready',text:`OneDrive: ${meta.folderName} connected`,folderName:meta.folderName});
      return await syncNow({userGesture:true,reason:'connect'});
    }catch(e){
      if(e?.name!=='AbortError')emit({connected:false,state:'error',text:`OneDrive: ${String(e?.message||'connection error').slice(0,90)}`});
      debug('onedrive-sync-error',{reason,error:String(e?.message||e)});return {ok:false,error:String(e?.message||e)};
    }
  }

  async function disconnect(){
    await dbDelete(HANDLE_KEY).catch(()=>{});dirHandle=null;
    const meta=await getMeta();await putMeta({...meta,folderName:'',lastSyncAt:0});
    emit({connected:false,state:'not-connected',text:'OneDrive: not connected'});
    return {ok:true};
  }

  function queueSync(reason='local-change'){
    clearTimeout(changeTimer);
    changeTimer=setTimeout(()=>syncNow({reason}),SYNC_DEBOUNCE_MS);
  }

  async function init(){
    if(initialized)return;initialized=true;
    await ensureDeviceId();
    const handle=await loadHandle();
    if(handle){
      const meta=await getMeta();
      const allowed=await permission(handle,{request:false});
      emit({connected:true,state:allowed?'ready':'permission',text:allowed?`OneDrive: ${meta.folderName||handle.name||'folder'} connected`:'OneDrive: reconnect once to restore folder access',folderName:meta.folderName||handle.name||''});
      if(allowed)setTimeout(()=>syncNow({reason:'startup'}),250);
    }else emit({connected:false,state:'not-connected',text:'OneDrive: not connected'});

    chrome.storage.onChanged.addListener((changes,area)=>{
      if(area!=='local'||!changes.warriorState||syncBusy)return;
      if(eq(shareState(changes.warriorState.oldValue||{}),shareState(changes.warriorState.newValue||{})))return;
      queueSync('local-change');
    });
    const queuePullIfStale=reason=>{if(lastStatus.connected&&Date.now()-Number(lastStatus.lastSyncAt||0)>15000)queueSync(reason)};
    window.addEventListener('online',()=>queuePullIfStale('online'));
    window.addEventListener('focus',()=>queuePullIfStale('focus'));
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)queuePullIfStale('visible')});
    pollTimer=setInterval(()=>{if(lastStatus.connected&&!syncBusy)syncNow({reason:'poll'})},PULL_INTERVAL_MS);
    renderUi();
  }

  async function getDirectoryHandle({request=false}={}){const h=await loadHandle();if(!h)return null;return await permission(h,{request})?h:null;}
  window.WarriorOneDriveSync={init,connect,disconnect,syncNow,getStatus:()=>clone(lastStatus),getDirectoryHandle};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>init().catch(()=>{}),{once:true});
  else init().catch(()=>{});
})();
