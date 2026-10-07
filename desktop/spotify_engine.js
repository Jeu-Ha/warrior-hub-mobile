(() => {
  'use strict';
  const CMD_SOURCE='warrior-spotify-host-v522-command';
  const EVENT_SOURCE='warrior-spotify-host-v522-event';
  const frame=document.getElementById('spotifyEngineFrame');
  let hostReady=false;
  let controllerCreated=false;
  let frameLoaded=false;
  const pending=[];
  const seenSeq=new Set();
  function rawPost(command={}){try{frame?.contentWindow?.postMessage({source:CMD_SOURCE,command},'https://open.spotify.com');return true}catch(_){return false}}
  function queueCommand(command={}){
    const seq=String(command?.seq||'');if(seq&&seenSeq.has(seq))return true;if(seq)seenSeq.add(seq);
    if(command?.action==='status'){const i=pending.findIndex(x=>x?.action==='status');if(i>=0)pending.splice(i,1)}
    pending.push(command);if(pending.length>40)pending.splice(0,pending.length-40);return true;
  }
  function flushPending(){if(!hostReady||!frameLoaded)return;const batch=pending.splice(0);for(const cmd of batch)rawPost(cmd);rawPost({action:'status',seq:`engine-flush-${Date.now()}`});}
  function post(command={}){if(!frameLoaded||!hostReady){queueCommand(command);return true}return rawPost(command)}
  // Side-panel controls can call this in the same user-gesture task. This is more
  // reliable than bouncing Play through storage/background first.
  window.__warriorSpotifyEngineExec=command=>post(command||{});
  window.__warriorSpotifyEngineStatus=()=>({hostReady,controllerCreated,frameLoaded,pending:pending.length});
  window.addEventListener('message',e=>{
    if(!e.data||e.data.source!==EVENT_SOURCE)return;if(e.source!==frame?.contentWindow)return;if(e.origin&&e.origin!=='https://open.spotify.com')return;
    const type=String(e.data.type||'');if(type==='controller_created'){controllerCreated=true}if(type==='ready'){hostReady=true;setTimeout(flushPending,0)}
    chrome.runtime.sendMessage({type:'WARRIOR_RUNTIME_ENGINE_EVENT',eventType:type,payload:e.data.payload||{}}).catch(()=>{});
  });
  chrome.runtime.onMessage.addListener((msg,_sender,sendResponse)=>{
    if(msg?.type==='SPOTIFY_ENGINE_EXEC'){const ok=post(msg.command||{});sendResponse?.({ok,queued:!hostReady||!frameLoaded});return false;}
    if(msg?.type==='SPOTIFY_ENGINE_PING'){sendResponse?.({ok:true,hostReady,controllerCreated,frameLoaded,pending:pending.length});return false;}
  });
  setInterval(()=>chrome.runtime.sendMessage({type:'WARRIOR_RUNTIME_PULSE'}).catch(()=>{}),3000);
  frame?.addEventListener('load',()=>{frameLoaded=true;setTimeout(()=>{if(hostReady)flushPending();else queueCommand({action:'status',seq:`engine-load-${Date.now()}`});},650);});
})();
