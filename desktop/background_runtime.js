// The original background.js remains local because it contains private push credentials.
// Filter only this module's messages from the legacy handler's catch-all reply.
const runtimeMessageTypes=new Set(['WARRIOR_RUNTIME_ENGINE_EVENT','WARRIOR_RUNTIME_PULSE','WARRIOR_RUNTIME_MUSIC_COMMAND','WARRIOR_RUNTIME_SYNC']);
const registerLegacyListener=chrome.runtime.onMessage.addListener.bind(chrome.runtime.onMessage);
chrome.runtime.onMessage.addListener=listener=>registerLegacyListener((message,sender,respond)=>runtimeMessageTypes.has(message?.type)?false:listener(message,sender,respond));
importScripts('background.js');
chrome.runtime.onMessage.addListener=registerLegacyListener;
importScripts('graph_client.js','onedrive_sync.js','desktop_music.js');
(() => {
  'use strict';
  const TARGET='warriorSpotifyRuntimeTargetV61',PLAYER='warriorSpotifyPlayerStateV59',QUEUE='warriorSpotifyQueueV61',PAUSED='warriorSpotifyExplicitPauseV61',RECEIPTS='warriorRuntimeMusicReceiptsV61';
  const url=chrome.runtime.getURL('spotify-engine.html');
  let creating=null,cycleBusy=false,lastCycle=0,endedTrack='',commandChain=Promise.resolve();
  async function ensureEngine(){
    if(creating)return creating;
    creating=(async()=>{const tabs=await chrome.tabs.query({url});let tab=tabs[0];
      if(!tab)tab=await chrome.tabs.create({url,active:false,pinned:true});
      await chrome.tabs.update(tab.id,{autoDiscardable:false});
      return true;
    })();try{return await creating}finally{creating=null}
  }
  // The legacy relay now targets the one permanent engine instead of a side panel.
  ensureSpotifyEngine=ensureEngine;
  async function relay(command){await ensureEngine();const response=await chrome.runtime.sendMessage({type:'SPOTIFY_ENGINE_EXEC',command});if(!response?.ok)throw new Error('Music engine is still loading; try again');return true}
  async function executeLocked(command){
    const got=await chrome.storage.local.get([PLAYER,QUEUE,RECEIPTS,TARGET,PAUSED]);const player=got[PLAYER]||{},tracks=got[QUEUE]?.tracks||[],seen=got[RECEIPTS]||[];
    if(command.seq&&seen.includes(command.seq))return {ok:true,duplicate:true};
    const action=String(command.action||'');let target=null;
    if(['next','previous'].includes(action)){
      if(!tracks.length)throw new Error('Open Study Room once to load the playlist');
      const current=tracks.findIndex(t=>String(t.id)===player.trackId);
      if(action==='previous'&&Math.max(Number(command.positionHint)||0,Number(player.position)||0)>3){await relay({action:'restart',seq:command.seq});}
      else {let index;
        if(action==='previous')index=Number.isInteger(player.previousPreview?.index)?player.previousPreview.index:(current-1+tracks.length)%tracks.length;
        else if(player.nextPreview?.trackId)index=tracks.findIndex(t=>String(t.id)===player.nextPreview.trackId);
        else index=player.shuffleOn&&tracks.length>1?(current+1+Math.floor(Math.random()*(tracks.length-1)))%tracks.length:(current+1)%tracks.length;
        if(index<0||index>=tracks.length)index=(current+1)%tracks.length;target={...tracks[index],index};
        await chrome.storage.local.set({[TARGET]:{trackId:String(target.id),until:Date.now()+12000},[PAUSED]:false,[PLAYER]:{...player,trackId:String(target.id),title:target.title||'',artist:target.artist||'',artwork:target.artwork||'',currentIndex:index,previousPreview:current>=0?{trackId:player.trackId,index:current}:null,nextPreview:null,playing:false,buffering:true,position:0,duration:0,at:Date.now()}});
        try{await relay({action:'load',uri:'spotify:track:'+target.id,autoplay:true,seq:command.seq})}
        catch(error){await chrome.storage.local.set({[TARGET]:got[TARGET]||null,[PAUSED]:!!got[PAUSED],[PLAYER]:player});throw error}
      }
    }else if(['shuffleSet','shuffleToggle'].includes(action)){
      const shuffleOn=action==='shuffleToggle'?!player.shuffleOn:!!command.value;
      let index=tracks.findIndex(t=>String(t.id)===player.trackId);if(tracks.length)index=shuffleOn&&tracks.length>1?(index+1+Math.floor(Math.random()*(tracks.length-1)))%tracks.length:(index+1)%tracks.length;
      await chrome.storage.local.set({[PLAYER]:{...player,shuffleOn,nextPreview:tracks[index]?{trackId:tracks[index].id,index}:null,at:Date.now()}});
    }else if(['pause','resume','play','restart','seek','seekRatio'].includes(action)){
      if(action==='pause'||action==='resume'||action==='play')await chrome.storage.local.set({[PAUSED]:action==='pause'});
      try{await relay(action==='seekRatio'?{action:'seek',seconds:(Number(player.duration)||0)*Math.max(0,Math.min(1,Number(command.ratio)||0)),seq:command.seq}:command)}
      catch(error){await chrome.storage.local.set({[PAUSED]:!!got[PAUSED]});throw error}
      if(action==='pause')await chrome.storage.local.set({[PLAYER]:{...player,playing:false,buffering:false,at:Date.now()}});
    }else throw new Error('Unsupported music command');
    if(command.seq)await chrome.storage.local.set({[RECEIPTS]:[...seen.slice(-199),command.seq]});return {ok:true};
  }
  function execute(command){const run=commandChain.then(()=>executeLocked(command));commandChain=run.catch(()=>{});return run}
  async function engineEvent(message){
    const type=message.eventType,payload={...(message.payload||{})};
    if(type==='playback_update'||type==='playback_started'){
      const id=String(payload.playingURI||'').match(/^spotify:track:([A-Za-z0-9]+)$/)?.[1];
      if(id){const got=await chrome.storage.local.get([PLAYER,QUEUE,PAUSED,TARGET]);if(got[TARGET]?.until>Date.now()&&got[TARGET].trackId!==id)return;
        const old=got[PLAYER]||{},tracks=got[QUEUE]?.tracks||[],index=tracks.findIndex(row=>row.id===id),row=tracks[index]||{};
        const position=Math.max(0,Number(payload.position)||0)/1000,duration=Math.max(0,Number(payload.duration)||0)/1000,playing=payload.isPaused===false;
        if(playing&&position<duration-.5)endedTrack='';
        const nextIndex=old.trackId===id&&old.nextPreview?.trackId?tracks.findIndex(row=>row.id===old.nextPreview.trackId):old.shuffleOn&&tracks.length>1?(index+1+Math.floor(Math.random()*(tracks.length-1)))%tracks.length:(index+1)%Math.max(1,tracks.length);
        const next={...old,trackId:id,title:row.title||old.title||'',artist:row.artist||old.artist||'',artwork:row.artwork||old.artwork||'',currentIndex:index,position,duration,playing,buffering:!!payload.isBuffering,progressConfirmed:position>.08,at:Date.now(),nextPreview:tracks[nextIndex]?{trackId:tracks[nextIndex].id,index:nextIndex}:old.nextPreview};
        await chrome.storage.local.set({[PLAYER]:next});
        if(type==='playback_update'&&!playing&&!payload.isBuffering&&!got[PAUSED]&&duration>2&&position>=duration-.35&&endedTrack!==id){
          endedTrack=id;payload.backgroundAdvanced=true;
          try{await execute({action:'next',seq:'natural-'+id+'-'+Number(old.at||0)})}catch(error){endedTrack='';payload.backgroundAdvanced=false;console.warn('Music advance',error.message)}
        }
      }
    }
    await chrome.runtime.sendMessage({type:'SPOTIFY_ENGINE_BROADCAST',eventType:type,payload}).catch(()=>{});
    cycle('engine').catch(()=>{});
  }
  async function cycle(reason='background'){
    if(cycleBusy||Date.now()-lastCycle<2500)return;
    cycleBusy=true;lastCycle=Date.now();
    try{await Promise.allSettled([WarriorDesktopMusic.cycle(),WarriorOneDriveSync.syncNow({reason})]);}
    finally{cycleBusy=false}
  }
  globalThis.WarriorBackgroundRuntime={execute,cycle,ensureEngine,engineEvent};
  chrome.runtime.onMessage.addListener((message,sender,respond)=>{
    if(!runtimeMessageTypes.has(message?.type))return false;
    const run=async()=>{
      if(message.type==='WARRIOR_RUNTIME_ENGINE_EVENT'){if(sender.tab?.url!==url)throw new Error('Unexpected music engine');await engineEvent(message);return {ok:true}}
      if(message.type==='WARRIOR_RUNTIME_MUSIC_COMMAND')return execute(message.command||{});
      await cycle(message.type==='WARRIOR_RUNTIME_SYNC'?'manual':'pulse');return {ok:true};
    };run().then(respond,error=>respond({ok:false,error:String(error.message||error)}));return true;
  });
  chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name==='warrior-cloud-v61')cycle('alarm').catch(()=>{})});
  chrome.storage.onChanged.addListener((changes,area)=>{
    if(area!=='local')return;
    const old=changes.warriorState?.oldValue,next=changes.warriorState?.newValue;
    if(changes.warriorFastGraphTokensV1||JSON.stringify(old?.todos)!==JSON.stringify(next?.todos)){
      WarriorOneDriveSync.syncNow({reason:'todo-change'}).catch(()=>{});WarriorDesktopMusic.cycle().catch(()=>{});
    }
    const cmd=changes.warriorSpotifyPlayerCommandV59?.newValue;if(cmd?.action==='pause')chrome.storage.local.set({[PAUSED]:true}).catch(()=>{});else if(['play','resume','next','previous','playIndex'].includes(cmd?.action))chrome.storage.local.set({[PAUSED]:false}).catch(()=>{});
  });
  const boot=async()=>{await chrome.alarms.create('warrior-cloud-v61',{periodInMinutes:.5});await cycle('startup')};
  chrome.runtime.onStartup.addListener(()=>boot().catch(()=>{}));chrome.runtime.onInstalled.addListener(()=>boot().catch(()=>{}));boot().catch(()=>{});
})();
