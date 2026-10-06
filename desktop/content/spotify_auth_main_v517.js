(() => {
  'use strict';
  if (window.__warriorSpotifyAuthMainV517) return;
  window.__warriorSpotifyAuthMainV517 = true;

  const SOURCE = 'warrior-spotify-auth-v517';
  const PATHFINDER_RE = /https:\/\/api-partner\.spotify\.com\/pathfinder\//i;
  const SPOTIFY_RE = /https:\/\/[^/]*spotify\.com\//i;
  const XHR_META = Symbol('warriorSpotifyAuthMeta');
  let lastSig = '', lastAt = 0;

  const clean = v => String(v ?? '').trim();
  function headersObject(input) {
    const out = {};
    try {
      const h = new Headers(input || {});
      h.forEach((v, k) => { out[String(k).toLowerCase()] = String(v); });
    } catch (_) {
      if (input && typeof input === 'object') {
        try { for (const [k,v] of Object.entries(input)) out[String(k).toLowerCase()] = String(v); } catch (_) {}
      }
    }
    return out;
  }
  function mergeHeaders(a,b){ return {...headersObject(a),...headersObject(b)}; }
  function stripBearer(v){ const m=clean(v).match(/^Bearer\s+(.+)$/i); return m?clean(m[1]):''; }
  function safeUrl(v){ try{return new URL(String(v),location.href)}catch(_){return null} }
  function parsePayload(url, body) {
    let operationName='', hash='';
    const u=safeUrl(url);
    if(u){
      operationName=clean(u.searchParams.get('operationName'));
      const ext=u.searchParams.get('extensions');
      if(ext){try{hash=clean(JSON.parse(ext)?.persistedQuery?.sha256Hash)}catch(_){}}
    }
    let raw=body;
    try{
      if(raw instanceof URLSearchParams) raw=raw.toString();
      if(typeof raw==='string'&&raw){
        let j=null;
        try{j=JSON.parse(raw)}catch(_){
          try{const p=new URLSearchParams(raw);const b=p.get('body')||p.get('payload');if(b)j=JSON.parse(b);operationName=operationName||clean(p.get('operationName'));const ext=p.get('extensions');if(ext&&!hash)hash=clean(JSON.parse(ext)?.persistedQuery?.sha256Hash)}catch(__){}
        }
        if(j){operationName=clean(j.operationName)||operationName;hash=clean(j?.extensions?.persistedQuery?.sha256Hash)||hash;}
      }
    }catch(_){}
    return {operationName,hash};
  }
  function emit(url,headers,body,reason='network'){
    try{
      const u=clean(url); if(!SPOTIFY_RE.test(u)) return;
      const h=headers||{};
      const token=stripBearer(h.authorization||h.Authorization);
      if(token.length<40) return;
      const clientToken=clean(h['client-token']||h['Client-Token']);
      const q=PATHFINDER_RE.test(u)?parsePayload(u,body):{operationName:'',hash:''};
      const sig=`${token.slice(0,12)}:${token.slice(-10)}|${clientToken.slice(0,8)}|${q.operationName}|${q.hash}`;
      const t=Date.now(); if(sig===lastSig&&t-lastAt<5000)return;lastSig=sig;lastAt=t;
      window.postMessage({source:SOURCE,payload:{token,clientToken,operationName:q.operationName,hash:q.hash,pathfinder:PATHFINDER_RE.test(u),reason,at:t}},'*');
    }catch(_){}
  }

  try {
    const nativeFetch=window.fetch;
    if(typeof nativeFetch==='function'){
      window.fetch=function(input,init){
        try{
          const url=typeof input==='string'||input instanceof URL?String(input):clean(input?.url);
          const hs=mergeHeaders(input?.headers,init?.headers);
          const body=init?.body;
          emit(url,hs,body,'fetch');
          if(!body&&input instanceof Request){
            try{input.clone().text().then(t=>emit(url,hs,t,'fetch-clone')).catch(()=>{})}catch(_){}
          }
        }catch(_){}
        return nativeFetch.apply(this,arguments);
      };
    }
  } catch (_) {}

  try {
    const proto=XMLHttpRequest.prototype;
    const nativeOpen=proto.open,nativeSet=proto.setRequestHeader,nativeSend=proto.send;
    proto.open=function(method,url){
      try{this[XHR_META]={url:clean(url),headers:{}}}catch(_){}
      return nativeOpen.apply(this,arguments);
    };
    proto.setRequestHeader=function(name,value){
      try{const m=this[XHR_META]||(this[XHR_META]={url:'',headers:{}});m.headers[String(name).toLowerCase()]=String(value)}catch(_){}
      return nativeSet.apply(this,arguments);
    };
    proto.send=function(body){
      try{const m=this[XHR_META]||{};emit(m.url,m.headers||{},body,'xhr')}catch(_){}
      return nativeSend.apply(this,arguments);
    };
  } catch (_) {}
})();
