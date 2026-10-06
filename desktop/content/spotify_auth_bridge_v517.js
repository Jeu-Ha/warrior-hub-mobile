(() => {
  'use strict';
  if (window.__warriorSpotifyAuthBridgeV517) return;
  window.__warriorSpotifyAuthBridgeV517 = true;
  const SOURCE='warrior-spotify-auth-v517';
  let lastSig='', lastAt=0;
  window.addEventListener('message',e=>{
    if(e.source!==window||!e.data||e.data.source!==SOURCE)return;
    const p=e.data.payload||{},token=String(p.token||'').trim();if(token.length<40)return;
    const sig=`${token.slice(0,10)}:${token.slice(-8)}|${String(p.operationName||'')}|${String(p.hash||'')}`;
    const t=Date.now();if(sig===lastSig&&t-lastAt<5000)return;lastSig=sig;lastAt=t;
    chrome.runtime.sendMessage({type:'SPOTIFY_CAPTURED_AUTH',auth:{token,clientToken:String(p.clientToken||''),operationName:String(p.operationName||''),hash:String(p.hash||''),pathfinder:!!p.pathfinder,at:Number(p.at)||t}}).then(r=>{if(r?.ok)window.postMessage({source:'warrior-spotify-auth-ready-v517',at:Date.now()},'*')}).catch(()=>{});
  });
})();
