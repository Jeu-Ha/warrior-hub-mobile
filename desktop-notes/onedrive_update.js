(() => {
  'use strict';
  const CLOUD_DIR='warrior-hub-update';
  const PAYLOAD_DIR='payload';
  const CLOUD_META='update.json';
  const LOCAL_DB='warrior-hub-device-update-v516';
  const LOCAL_STORE='handles';
  const LOCAL_KEY='extensionSourceFolder';
  let busy=false,lastInfo=null,cachedSourceHandle=null,cachedSourcePermission=false;
  const $=id=>document.getElementById(id);
  const clone=v=>{try{return structuredClone(v)}catch(_){return JSON.parse(JSON.stringify(v))}};
  async function sha256Hex(data){const buf=data instanceof ArrayBuffer?data:data?.buffer instanceof ArrayBuffer?data.buffer:data;const hash=await crypto.subtle.digest('SHA-256',buf);return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('')}

  function setStatus(text,state=''){
    const el=$('cloudUpdateStatus');if(el){el.textContent=text;el.dataset.state=state}

  }
  function versionParts(v){return String(v||'0').split(/[.-]/).map(x=>Number.parseInt(x,10)||0)}
  function compareVersions(a,b){const A=versionParts(a),B=versionParts(b);for(let i=0;i<Math.max(A.length,B.length);i++){const d=(A[i]||0)-(B[i]||0);if(d)return d>0?1:-1}return 0}

  async function openDb(){return await new Promise((res,rej)=>{const r=indexedDB.open(LOCAL_DB,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(LOCAL_STORE))r.result.createObjectStore(LOCAL_STORE)};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
  async function dbGet(k){const db=await openDb();try{return await new Promise((res,rej)=>{const r=db.transaction(LOCAL_STORE,'readonly').objectStore(LOCAL_STORE).get(k);r.onsuccess=()=>res(r.result||null);r.onerror=()=>rej(r.error)})}finally{db.close()}}
  async function dbSet(k,v){const db=await openDb();try{await new Promise((res,rej)=>{const tx=db.transaction(LOCAL_STORE,'readwrite');tx.objectStore(LOCAL_STORE).put(v,k);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}finally{db.close()}if(k===LOCAL_KEY)cachedSourceHandle=v}
  async function permission(handle,{request=false}={}){if(!handle)return false;const o={mode:'readwrite'};try{if(await handle.queryPermission(o)==='granted')return true}catch(_){}if(request)try{return await handle.requestPermission(o)==='granted'}catch(_){}return false}

  async function oneDriveHandle(request=true){let h=await window.WarriorOneDriveSync?.getDirectoryHandle?.({request});if(h)return h;if(request){await window.WarriorOneDriveSync?.connect?.();h=await window.WarriorOneDriveSync?.getDirectoryHandle?.({request:true})}return h||null}
  async function cloudDirs(create=false){const root=await oneDriveHandle(create);if(!root)throw new Error('Connect OneDrive first');const update=await root.getDirectoryHandle(CLOUD_DIR,{create});const payload=create?await update.getDirectoryHandle(PAYLOAD_DIR,{create:true}):await update.getDirectoryHandle(PAYLOAD_DIR,{create:false});return{root,update,payload}}
  async function readJson(dir,name){try{const fh=await dir.getFileHandle(name,{create:false}),f=await fh.getFile();return JSON.parse(await f.text())}catch(e){if(e?.name==='NotFoundError')return null;throw e}}
  async function writeFile(dir,name,data){const fh=await dir.getFileHandle(name,{create:true}),w=await fh.createWritable();await w.write(data);await w.close()}
  async function childDir(root,parts,create){let d=root;for(const part of parts)d=await d.getDirectoryHandle(part,{create});return d}
  async function writePath(root,path,data){const parts=String(path).split('/').filter(Boolean),name=parts.pop();const dir=await childDir(root,parts,true);await writeFile(dir,name,data)}
  async function readPath(root,path){const parts=String(path).split('/').filter(Boolean),name=parts.pop();const dir=await childDir(root,parts,false),fh=await dir.getFileHandle(name,{create:false});return await (await fh.getFile()).arrayBuffer()}

  async function packageManifest(){const r=await fetch(chrome.runtime.getURL('update-manifest.json'),{cache:'no-store'});if(!r.ok)throw new Error('This build has no update manifest');const m=await r.json();if(!Array.isArray(m.files)||!m.files.length)throw new Error('Update manifest is empty');return m}
  async function getCloudInfo(){try{const {update}=await cloudDirs(false),meta=await readJson(update,CLOUD_META);return meta&&meta.version?meta:null}catch(e){if(e?.name==='NotFoundError')return null;throw e}}

  async function publish(){const m=await packageManifest(),{update,payload}=await cloudDirs(true);setStatus(`Publishing v${m.version} to OneDrive…`,'busy');let done=0;const hashes={...m.hashes};for(const path of m.files){const r=await fetch(chrome.runtime.getURL(path),{cache:'no-store'});if(!r.ok)throw new Error(`Cannot read ${path}`);const data=await r.arrayBuffer();const actual=await sha256Hex(data);const expected=String(m.hashes?.[path]||'').toLowerCase();if(path!=='update-manifest.json'&&expected&&actual!==expected)throw new Error(`Source integrity check failed for ${path}`);hashes[path]=actual;await writePath(payload,path,data);done++;if(done%5===0||done===m.files.length)setStatus(`Publishing v${m.version} · ${done}/${m.files.length}`,'busy')}
    // update.json is the commit marker and is written only after every payload file.
    const meta={schema:2,app:'Warrior Hub update',version:m.version,publishedAt:Date.now(),files:m.files,hashes,sourceDevice:await deviceLabel()};await writeFile(update,CLOUD_META,JSON.stringify(meta,null,2));lastInfo=meta;setStatus(`OneDrive has v${m.version} · verified package ready`,'ok');return meta}

  async function deviceLabel(){try{const p=await chrome.runtime.getPlatformInfo();return `${p.os||'device'}-${p.arch||''}`}catch(_){return'device'}}
  async function validateSourceFolder(h){let manifest;try{manifest=JSON.parse(await (await (await h.getFileHandle('manifest.json')).getFile()).text())}catch(_){throw new Error('Choose the unpacked Warrior Hub folder that contains manifest.json')}if(!/Warrior Hub/i.test(String(manifest?.name||'')))throw new Error('That folder does not look like Warrior Hub');await dbSet(LOCAL_KEY,h);cachedSourcePermission=true;return h}
  async function warmSourceHandle(){try{const h=await dbGet(LOCAL_KEY);cachedSourceHandle=h||null;if(h){try{cachedSourcePermission=(await h.queryPermission({mode:'readwrite'}))==='granted'}catch(_){cachedSourcePermission=false}}}catch(_){cachedSourceHandle=null;cachedSourcePermission=false}}
  async function prepareSourceFolderFromGesture(){const o={mode:'readwrite'};let h=cachedSourceHandle;if(h&&cachedSourcePermission)return h;if(h){try{const requestPromise=h.requestPermission(o);if(await requestPromise==='granted'){cachedSourcePermission=true;return h}}catch(_){}cachedSourceHandle=null;cachedSourcePermission=false}if(typeof window.showDirectoryPicker!=='function')throw new Error('Folder picker is unavailable in this Chrome build');const pickerPromise=window.showDirectoryPicker({id:'warrior-hub-source-v516',mode:'readwrite'});h=await pickerPromise;return await validateSourceFolder(h)}
  async function linkedSource({request=false,choose=false}={}){let h=cachedSourceHandle||await dbGet(LOCAL_KEY);if(h&&await permission(h,{request})){cachedSourceHandle=h;cachedSourcePermission=true;return h}if(!choose)return null;if(typeof window.showDirectoryPicker!=='function')throw new Error('Folder picker is unavailable in this Chrome build');h=await window.showDirectoryPicker({id:'warrior-hub-source-v516',mode:'readwrite'});if(!await permission(h,{request:true}))throw new Error('Write access to the extension folder was not granted');return await validateSourceFolder(h)}

  async function apply(meta,{target=null}={}){if(!meta?.files?.length)throw new Error('Cloud update package is incomplete');const {payload}=await cloudDirs(false);target=target||await linkedSource({request:true,choose:true});const files=[...meta.files].sort((a,b)=>(a==='manifest.json'?1:0)-(b==='manifest.json'?1:0));
    // Preflight the entire package before touching the unpacked extension folder. This
    // prevents a half-installed build if OneDrive has not hydrated one of the files yet.
    setStatus(`Verifying v${meta.version} package…`,'busy');const staged=[];let checked=0;for(const path of files){const data=await readPath(payload,path);const expected=String(meta.hashes?.[path]||'').toLowerCase();if(expected){const actual=await sha256Hex(data);if(actual!==expected)throw new Error(`OneDrive payload verification failed for ${path}`)}staged.push({path,data});checked++;if(checked%5===0||checked===files.length)setStatus(`Verifying v${meta.version} · ${checked}/${files.length}`,'busy')}
    setStatus(`Installing v${meta.version}…`,'busy');let done=0;for(const item of staged){await writePath(target,item.path,item.data);done++;if(done%5===0||done===staged.length)setStatus(`Installing v${meta.version} · ${done}/${staged.length}`,'busy')}
    const mf=JSON.parse(await (await (await target.getFileHandle('manifest.json')).getFile()).text());if(String(mf.version)!==String(meta.version))throw new Error('Update copied, but manifest verification failed');setStatus(`Installed v${meta.version} · reloading…`,'ok');setTimeout(()=>chrome.runtime.reload(),450);return true}

  async function smartUpdate(opts={}){if(busy)return {ok:false,busy:true};busy=true;setStatus('Checking app version in OneDrive…','busy');try{const current=chrome.runtime.getManifest().version;let cloud=await getCloudInfo();if(!cloud){await publish();return {ok:true,action:'published',version:current}}const cmp=compareVersions(current,cloud.version);if(cmp>0){await publish();return {ok:true,action:'published',version:current}}if(cmp<0){await apply(cloud,{target:opts.target||null});return {ok:true,action:'installed',version:cloud.version}}setStatus(`App up to date · v${current}`,'ok');return {ok:true,action:'none',version:current}}catch(e){console.warn('[Warrior Hub update]',e);setStatus(`App update: ${String(e?.message||e).slice(0,110)}`,'error');return {ok:false,error:String(e?.message||e)}}finally{busy=false}}

  async function check({autoPublish=true}={}){try{const current=chrome.runtime.getManifest().version,cloud=await getCloudInfo();lastInfo=cloud;if(!cloud){if(autoPublish){await smartUpdate({reason:'auto-publish-empty'});return}setStatus(`No shared app version yet · local v${current}`,'');return}const cmp=compareVersions(current,cloud.version);if(cmp<0)setStatus(`App update ready · v${cloud.version} · press Sync now`,'available');else if(cmp>0){if(autoPublish){await smartUpdate({reason:'auto-publish-newer-local'});return}setStatus(`Local v${current} is newer than OneDrive`,'');}else setStatus(`App up to date · v${current}`,'ok')}catch(_){setStatus(`App update · local v${chrome.runtime.getManifest().version}`,'')}}

  function init(){warmSourceHandle();window.addEventListener('warrior-onedrive-status',e=>{if(e.detail?.connected)setTimeout(()=>check({autoPublish:true}),250)});setTimeout(()=>check({autoPublish:true}),900)}
  window.WarriorCloudUpdate={smartUpdate,check,publish,apply,getCloudInfo,prepareSourceFolderFromGesture,linkSource:()=>linkedSource({request:true,choose:true})};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
