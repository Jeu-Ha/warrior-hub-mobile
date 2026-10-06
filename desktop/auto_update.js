(() => {
  'use strict';
  const RELEASE_BASE='https://raw.githubusercontent.com/Jeu-Ha/warrior-hub-mobile/desktop-release/desktop/';
  const AUTO_KEY='warriorAutoUpdateEnabledV1';
  let busy=false,enabled=true;
  const status=(text,state='')=>{const el=document.getElementById('cloudUpdateStatus');if(el){el.textContent=text;el.dataset.state=state}};
  const pauseForWork=async()=>{const got=await chrome.storage.local.get(['warriorSpotifyPlayerStateV59','warriorSpotifyStudySessionV52','warriorState']);const player=got.warriorSpotifyPlayerStateV59||{},session=got.warriorSpotifyStudySessionV52||{},study=got.warriorState?.study||{};const live=Date.now()-Number(session.at||player.at||0)<15000;return(live&&player.playing===true)||study.running===true||(await chrome.tabs.query({})).some(tab=>String(tab.url||'').startsWith(chrome.runtime.getURL('notes/index.html')))};
  function compare(a,b){const A=String(a).split('.').map(Number),B=String(b).split('.').map(Number);for(let i=0;i<Math.max(A.length,B.length);i++){const difference=(A[i]||0)-(B[i]||0);if(difference)return Math.sign(difference)}return 0}
  async function fetchManifest(){const response=await fetch(RELEASE_BASE+'release.json',{cache:'no-store'});if(!response.ok)throw new Error(`Update server (${response.status})`);const manifest=await response.json();if(manifest.app!=='Warrior Hub'||!/^\d+\.\d+\.\d+$/.test(manifest.version)||!Array.isArray(manifest.files)||!manifest.files.includes('manifest.json'))throw new Error('Invalid update package');return manifest}
  async function checkLocked({force=false}={}) {
    if(busy||(!enabled&&!force))return;busy=true;
    try {
      const manifest=await fetchManifest(),current=chrome.runtime.getManifest().version;
      if(compare(manifest.version,current)<=0){status(`Auto update ready · v${current}`,'ok');return}
      const target=await window.WarriorCloudUpdate.linkedSource({request:false,choose:false});
      if(!target){status(`v${manifest.version} ready · enable automatic updates once`,'available');return}
      if(!force&&await pauseForWork()){status(`v${manifest.version} ready · installs after your session`,'deferred');return}
      status(`Downloading v${manifest.version}…`,'busy');const staged=[];
      for(const file of manifest.files){if(typeof file!=='string'||!/^[-A-Za-z0-9_./]+$/.test(file)||file.startsWith('/')||file.split('/').some(part=>part==='..'||!part)||!/^\w[\w./-]*\.(?:js|css|html|json)$/.test(file))throw new Error('Invalid update file path');const expected=manifest.hashes?.[file];if(!/^[a-f0-9]{64}$/.test(expected||''))throw new Error('Missing update checksum');const response=await fetch(RELEASE_BASE+file,{cache:'no-store'});if(!response.ok)throw new Error(`Cannot download ${file}`);const data=await response.arrayBuffer(),hash=await crypto.subtle.digest('SHA-256',data),actual=Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join('');if(actual!==expected)throw new Error(`Update checksum mismatch: ${file}`);staged.push({path:file,data})}
      const packageManifest=JSON.parse(new TextDecoder().decode(staged.find(x=>x.path==='manifest.json').data));if(packageManifest.name!=='Warrior Hub'||packageManifest.version!==manifest.version)throw new Error('Update manifest mismatch');
      await window.WarriorCloudUpdate.installStaged(staged,{target,version:manifest.version});
    } catch(error){status(`Auto update: ${String(error.message||error).slice(0,140)}`,'error')}
    finally{busy=false}
  }
  async function check(options={}){if(navigator.locks?.request)return navigator.locks.request('warrior-extension-auto-update',{ifAvailable:true},lock=>lock?checkLocked(options):undefined);return checkLocked(options)}
  async function enable(){const button=document.getElementById('enableAutoUpdateBtn');if(button)button.disabled=true;try{await window.WarriorCloudUpdate.prepareSourceFolderFromGesture();enabled=true;await chrome.storage.local.set({[AUTO_KEY]:true});status('Automatic updates enabled','ok');if(button)button.textContent='Reconnect update folder';await check({force:false})}catch(error){status(`Auto update: ${String(error.message||error).slice(0,140)}`,'error')}finally{if(button)button.disabled=false}}
  async function init(){enabled=(await chrome.storage.local.get(AUTO_KEY))[AUTO_KEY]!==false;document.getElementById('enableAutoUpdateBtn')?.addEventListener('click',enable);await window.WarriorCloudUpdate.warmSourceHandle();const linked=await window.WarriorCloudUpdate.linkedSource({request:false,choose:false});const button=document.getElementById('enableAutoUpdateBtn');if(button&&linked)button.textContent='Reconnect update folder';await check();setInterval(()=>check(),60000);window.addEventListener('focus',()=>check());}
  window.WarriorAutoUpdate={check,enable};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>init().catch(error=>status(String(error.message||error),'error')),{once:true});else init().catch(error=>status(String(error.message||error),'error'));
})();
