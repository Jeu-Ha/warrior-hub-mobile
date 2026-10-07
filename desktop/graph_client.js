(() => {
'use strict';
const FAST_TOKEN_KEY='warriorFastGraphTokensV1', FAST_ACCOUNT_KEY='warriorFastGraphAccountV1', FAST_STATUS_KEY='warriorFastGraphStatusV1';
const CLIENT_ID='098158b9-35ee-497c-97c2-3490353cb745',AUTHORITY='https://login.microsoftonline.com/common/oauth2/v2.0',GRAPH='https://graph.microsoft.com/v1.0',GRAPH_SCOPES='offline_access User.Read Files.ReadWrite';
const now=()=>Date.now();let graphFoldersReady=false,fastModeActive=false;
const setFastStatus=v=>chrome.storage.local.set({[FAST_STATUS_KEY]:{at:now(),...v}});
async function loadTokens(){return (await chrome.storage.local.get(FAST_TOKEN_KEY).catch(()=>({})))?.[FAST_TOKEN_KEY]||null}
async function saveTokens(tok){const old=await loadTokens()||{},merged={...old,...tok,expires_at:now()+Math.max(60,Number(tok.expires_in||3600)-60)*1000};await chrome.storage.local.set({[FAST_TOKEN_KEY]:merged});return merged}
async function clearFastAuth(){graphFoldersReady=false;fastModeActive=false;await chrome.storage.local.remove([FAST_TOKEN_KEY,FAST_ACCOUNT_KEY]);await setFastStatus({connected:false,state:'off',text:'Fast phone sync: not connected'});void 0}
let graphAuthRefresh=null;
async function graphAccessToken(){if(graphAuthRefresh)return graphAuthRefresh;const refresh=async()=>{let t=await loadTokens();if(t?.access_token&&now()<Number(t.expires_at||0))return t.access_token;if(!t?.refresh_token)return null;const body=new URLSearchParams({client_id:CLIENT_ID,grant_type:'refresh_token',refresh_token:t.refresh_token,scope:GRAPH_SCOPES});const r=await fetch(`${AUTHORITY}/token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});const j=await r.json().catch(()=>({}));if(r.ok){t=await saveTokens(j);return t.access_token}if(j.error==='invalid_grant'||j.error==='interaction_required'){const latest=await loadTokens();if(latest?.refresh_token===t.refresh_token&&latest?.access_token===t.access_token)await chrome.storage.local.remove(FAST_TOKEN_KEY).catch(()=>{});return null}throw new Error(String(j.error_description||j.error||`Microsoft reconnect failed (${r.status})`))};graphAuthRefresh=navigator.locks?.request?navigator.locks.request('warrior-ms-graph-token-refresh',refresh):refresh();try{return await graphAuthRefresh}finally{graphAuthRefresh=null}}

async function graphFetch(path,opts={}){let token=await graphAccessToken();if(!token)throw new Error('fast-auth-required');const url=/^https?:/i.test(path)?path:`${GRAPH}${path}`;let r=await fetch(url,{...opts,signal:opts.signal||AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${token}`,...(opts.headers||{})}});if(r.status===401){const cur=await loadTokens();if(cur?.refresh_token){cur.expires_at=0;await chrome.storage.local.set({[FAST_TOKEN_KEY]:cur});token=await graphAccessToken();if(token)r=await fetch(url,{...opts,signal:opts.signal||AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${token}`,...(opts.headers||{})}})}}return r}

const encoded=parts=>parts.map(encodeURIComponent).join('/');
function directory(parts=['WARRIOR HUB']) {
  const base='/me/drive/root:/'+encoded(parts);
  const file=name=>{
    const path=base+'/'+encodeURIComponent(name);
    return {kind:'file',name,async getFile(){const r=await graphFetch(path+':/content',{cache:'no-store'});if(!r.ok){const e=new Error('OneDrive read ('+r.status+')');if(r.status===404)e.name='NotFoundError';throw e}const text=await r.text();return {text:async()=>text}},async createWritable(){let bytes;return {async write(value){bytes=value},async close(){const r=await graphFetch(path+':/content',{method:'PUT',headers:{'Content-Type':'application/json'},body:bytes});if(!r.ok)throw new Error('OneDrive write ('+r.status+')')},async abort(){}}}};
  };
  return {kind:'directory',name:parts.at(-1),queryPermission:async()=>'granted',
    async getFileHandle(name,{create=false}={}){if(!create){const r=await graphFetch(base+'/'+encodeURIComponent(name),{cache:'no-store'});if(!r.ok){const e=new Error('OneDrive file ('+r.status+')');if(r.status===404)e.name='NotFoundError';throw e}}return file(name)},
    async getDirectoryHandle(name,{create=false}={}){let r=await graphFetch(base+'/'+encodeURIComponent(name),{cache:'no-store'});if(r.status===404&&create){r=await graphFetch(base+':/children',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,folder:{},'@microsoft.graph.conflictBehavior':'fail'})})}if(!r.ok&&r.status!==409){const e=new Error('OneDrive directory ('+r.status+')');if(r.status===404)e.name='NotFoundError';throw e}return directory([...parts,name])},
    async *entries(){let next=base+':/children?$top=200&$select=id,name,folder';while(next){const r=await graphFetch(next,{cache:'no-store'});if(!r.ok)throw new Error('OneDrive list ('+r.status+')');const data=await r.json();for(const item of data.value||[])yield [item.name,item.folder?directory([...parts,item.name]):file(item.name)];next=data['@odata.nextLink']||''}},
    async removeEntry(name){const r=await graphFetch(base+'/'+encodeURIComponent(name),{method:'DELETE'});if(!r.ok&&r.status!==404)throw new Error('OneDrive delete ('+r.status+')')}
  };
}
async function root(){const d=directory();let r=await graphFetch('/me/drive/root:/WARRIOR%20HUB',{cache:'no-store'});if(r.status===404)r=await graphFetch('/me/drive/root/children',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'WARRIOR HUB',folder:{},'@microsoft.graph.conflictBehavior':'fail'})});if(!r.ok&&r.status!==409)throw new Error('OneDrive root ('+r.status+')');return d}
globalThis.WarriorGraphClient={accessToken:graphAccessToken,fetch:graphFetch,directory,root};
})();
