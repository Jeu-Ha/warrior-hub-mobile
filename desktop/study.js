let state=null,urls=null,mode='hint',tick=null,saveNoteTimer=null,activeDrawer=null;
let coachDraft='',coachDraftTimer=null,coachLaunchBusy=false;
let previousPhase=null,previousCycles=0,phaseFxTimer=null,boundaryWarpTimer=null,boundaryWarpScheduledEndAt=0,boundaryWarpStartedEndAt=0;
let spotifyPlaying=false,phaseCueUntil=0;
let manualSkipLock=false;
let cueCtx=null,cueNoiseBuffer=null,boundaryWhooshTimer=null,cueVariant=0;
let spotifyDspBoundaryEndAt=0,spotifyDspTelemetry=null,spotifyVolume=1,spotifyShuffleState=null,spotifyShuffleMode='warrior',spotifyShufflePending=false,spotifyShufflePendingTimer=null,spotifyPlayerState=null;
let spotifyOfficial={ready:false,playingURI:'',trackId:'',isPaused:true,isBuffering:false,duration:0,position:0,at:0};
let spotifyExplicitSeekUntil=0,spotifyRestartPending=null,spotifyRestartFallbackTimer=null;
let spotifyPendingTarget=null,spotifyDeferredNavigation=null,spotifyHostReady=false,spotifyCurrentIndex=-1,spotifyHistory=[],spotifyRecent=[],spotifyLastCommandSeq='',spotifyStateStorageAt=0,spotifyStateSemantic='',spotifyNaturalEndTrackId='';
let spotifyStartupPromise=null;
let spotifyProgressTrackId='',spotifyProgressLastPosition=0,spotifyProgressConfirmed=false,spotifyPendingProgressTimer=null;
let spotifyStudyHeartbeatTimer=null;
let spotifyQueueCatalog=[],spotifyQueuePlaylistId='',spotifyQueueLoading=false,spotifyQueueSearch='',spotifyQueueRenderRaf=0,spotifyQueueRowHeight=50,spotifyQueueMetaPending=new Set();
let spotifyNextPlan={forIndex:-2,shuffle:null,playlistId:'',queueSize:-1,index:-1};
const SPOTIFY_DSP_KEY='warriorSpotifyDspState',SPOTIFY_DSP_TELEMETRY_KEY='warriorSpotifyDspTelemetry',SPOTIFY_PLAYER_STATE_KEY='warriorSpotifyPlayerStateV59',SPOTIFY_PLAYER_COMMAND_KEY='warriorSpotifyPlayerCommandV59',SPOTIFY_OFFICIAL_KEY='warriorSpotifyOfficialStateV42',SPOTIFY_HOST_CONTROL_KEY='warriorSpotifyHostControlV42',SPOTIFY_STUDY_SESSION_KEY='warriorSpotifyStudySessionV52';
const SPOTIFY_HOST_CMD_SOURCE='warrior-spotify-host-v522-command',SPOTIFY_HOST_EVENT_SOURCE='warrior-spotify-host-v522-event',DEBUG_ENABLED_KEY='warriorDebugEnabledV59';
const spotifyStudySessionId=`study-${Date.now()}-${Math.random().toString(36).slice(2)}`;

let lastMiniDebugSig='';
let heartbeatDebugCounter=0,warriorDebugEnabled=false,spotifyOfficialStorageAt=0,spotifyOfficialSemantic='';
chrome.storage.local.get(DEBUG_ENABLED_KEY).then(g=>warriorDebugEnabled=!!g?.[DEBUG_ENABLED_KEY]).catch(()=>{});
function debugLog(event,data={}){if(!warriorDebugEnabled)return;try{chrome.runtime.sendMessage({type:'DEBUG_LOG',source:'study-room',event,data}).catch(()=>{})}catch(_){}}
window.addEventListener('error',e=>debugLog('window-error',{message:e.message,filename:e.filename,lineno:e.lineno,colno:e.colno,error:String(e.error?.stack||e.error||'')}));
window.addEventListener('unhandledrejection',e=>debugLog('unhandled-rejection',{reason:String(e.reason?.stack||e.reason||'')}));

chrome.storage.onChanged.addListener((changes,area)=>{
  if(area!=='local'||!changes.warriorChatgptHandoffStatus)return;
  const st=changes.warriorChatgptHandoffStatus.newValue;
  if(!st)return;
  const out=$('#aiAnswer');
  if(!out)return;
  const msg={
    'opening-known-project':'Opening Studying…',
    'waiting-for-project':'Looking for Studying project…',
    'searching-project':'Looking for Studying project…',
    'opening-project':'Opening Studying…',
    'creating-project':'Creating Studying project…',
    'starting-new-chat':'Starting a new chat in Studying…',
    'new-chat-ready':'New Studying chat ready…',
    'project-chat-not-ready':'Studying opened, but Warrior Hub could not confirm a fresh project chat.',
    'prompt-inserted':'Coach prompt inserted. Sending…',
    'sent':'Sent to ChatGPT ✓',
    'project-control-not-found':'Could not find the Projects controls in ChatGPT.',
    'project-name-input-not-found':'Could not find the project-name field in ChatGPT.',
    'project-create-timeout':'Creating Studying timed out. No duplicate project was created.',
    'project-existing-not-resolved':'Studying exists or the Projects list is ambiguous. Auto-create was blocked to prevent duplicates.',
    'project-create-locked':'Warrior Hub refused to create another Studying duplicate. Open the existing project once, then retry.',
    'composer-not-found':'Studying opened, but the chat composer was not found.',
    'send-failed':'Prompt was inserted, but auto-send failed.'
  }[String(st.status||'')];
  if(msg)out.textContent=msg;
});


const studySpotifyThemeDefault={accent:'rgb(117,240,169)',accent2:'rgb(143,190,255)',glow:'rgba(117,240,169,.28)',glow2:'rgba(143,190,255,.22)',soft:'rgba(117,240,169,.12)',soft2:'rgba(143,190,255,.10)',border:'rgba(117,240,169,.32)',cardBorder:'rgba(143,190,255,.24)',shadow:'rgba(0,0,0,.30)'};
const studySpotifyThemeCache=new Map();
let studySpotifyThemeKey='',studySpotifyThemeAnimTimer=null,studySpotifyThemeRaf=0;
function studyClamp(v,min,max){return Math.max(min,Math.min(max,Number(v)||0))}
function studyRgbCss(rgb){return `rgb(${rgb.map(v=>Math.round(studyClamp(v,0,255))).join(',')})`}
function studyRgbaCss(rgb,a){return `rgba(${rgb.map(v=>Math.round(studyClamp(v,0,255))).join(',')},${studyClamp(a,0,1).toFixed(3)})`}
function studyMixRgb(a,b,t){return a.map((v,i)=>Math.round(v*(1-t)+b[i]*t))}
function studyRgbToHsl(r,g,b){r/=255;g/=255;b/=255;const max=Math.max(r,g,b),min=Math.min(r,g,b),l=(max+min)/2;let h=0,s=0;if(max!==min){const d=max-min;s=l>.5?d/(2-max-min):d/(max+min);switch(max){case r:h=(g-b)/d+(g<b?6:0);break;case g:h=(b-r)/d+2;break;default:h=(r-g)/d+4;break;}h/=6;}return{h,s,l}}
function studyHue2rgb(p,q,t){if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p}
function studyHslToRgb(h,s,l){let r,g,b;if(s===0){r=g=b=l}else{const q=l<.5?l*(1+s):l+s-l*s,p=2*l-q;r=studyHue2rgb(p,q,h+1/3);g=studyHue2rgb(p,q,h);b=studyHue2rgb(p,q,h-1/3)}return[Math.round(r*255),Math.round(g*255),Math.round(b*255)]}
function studyHashTheme(seed){let hash=0;const str=String(seed||'warrior');for(let i=0;i<str.length;i++)hash=(hash*33+str.charCodeAt(i))>>>0;const h1=((hash%360)+360)%360/360,h2=(((hash>>9)%360)+55)%360/360;const a1=studyHslToRgb(h1,.72,.58),a2=studyHslToRgb(h2,.66,.64);return{accent:studyRgbCss(a1),accent2:studyRgbCss(a2),glow:studyRgbaCss(a1,.30),glow2:studyRgbaCss(a2,.24),soft:studyRgbaCss(a1,.12),soft2:studyRgbaCss(a2,.10),border:studyRgbaCss(a1,.32),cardBorder:studyRgbaCss(a2,.24),shadow:studyRgbaCss(studyMixRgb(a1,[0,0,0],.8),.34)}}
function studyParseThemeRgb(value,fallback){const m=String(value||'').match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);return m?[Number(m[1]),Number(m[2]),Number(m[3])]:fallback.slice()}
function studyCurrentThemeRgb(name,fallback){try{return studyParseThemeRgb(getComputedStyle(document.documentElement).getPropertyValue(name),fallback)}catch(_){return fallback.slice()}}
function studySetThemePalette(a1,a2){const root=document.documentElement,avg=studyMixRgb(a1,a2,.5);root.style.setProperty('--accent',studyRgbCss(a1));root.style.setProperty('--track-accent',studyRgbCss(a1));root.style.setProperty('--track-accent-2',studyRgbCss(a2));root.style.setProperty('--track-glow',studyRgbaCss(a1,.43));root.style.setProperty('--track-glow-2',studyRgbaCss(a2,.35));root.style.setProperty('--track-soft',studyRgbaCss(a1,.17));root.style.setProperty('--track-soft-2',studyRgbaCss(a2,.14));root.style.setProperty('--track-border',studyRgbaCss(a1,.42));root.style.setProperty('--track-card-border',studyRgbaCss(a2,.31));root.style.setProperty('--track-shadow',studyRgbaCss(studyMixRgb(avg,[0,0,0],.78),.40));root.style.setProperty('--track-bg-a',studyRgbaCss(a1,.31));root.style.setProperty('--track-bg-b',studyRgbaCss(a2,.27));root.style.setProperty('--track-bg-c',studyRgbaCss(avg,.18))}
function studyEaseTheme(t){return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2}
function studyApplySpotifyTheme(theme,animated=true){const t={...studySpotifyThemeDefault,...(theme||{})},body=document.body;if(!document.documentElement||!body)return;const target1=studyParseThemeRgb(t.accent,[117,240,169]),target2=studyParseThemeRgb(t.accent2,[143,190,255]);body.classList.add('track-theme-live');if(studySpotifyThemeRaf)cancelAnimationFrame(studySpotifyThemeRaf);clearTimeout(studySpotifyThemeAnimTimer);if(!animated||matchMedia?.('(prefers-reduced-motion: reduce)')?.matches){studySetThemePalette(target1,target2);return}const start1=studyCurrentThemeRgb('--track-accent',[117,240,169]),start2=studyCurrentThemeRgb('--track-accent-2',[143,190,255]),started=performance.now(),duration=1850;body.classList.add('track-theme-transitioning');const step=now=>{const p=Math.min(1,(now-started)/duration),e=studyEaseTheme(p),a1=studyMixRgb(start1,target1,e),a2=studyMixRgb(start2,target2,e);studySetThemePalette(a1,a2);if(p<1)studySpotifyThemeRaf=requestAnimationFrame(step);else{studySpotifyThemeRaf=0;studySpotifyThemeAnimTimer=setTimeout(()=>body.classList.remove('track-theme-transitioning'),280)}};studySpotifyThemeRaf=requestAnimationFrame(step)}
function studyBuildThemeFromImageData(data,w,h){const samples=[];let sum=[0,0,0],count=0;for(let y=0;y<h;y+=2){for(let x=0;x<w;x+=2){const i=(y*w+x)*4,a=data[i+3];if(a<150)continue;const rgb=[data[i],data[i+1],data[i+2]];sum[0]+=rgb[0];sum[1]+=rgb[1];sum[2]+=rgb[2];count++;const hsl=studyRgbToHsl(rgb[0],rgb[1],rgb[2]);if(hsl.l<.08||hsl.l>.92)continue;const score=(.18+hsl.s)*(1-Math.abs(hsl.l-.54))*((rgb[0]+rgb[1]+rgb[2])>36?1:0);samples.push({rgb,hsl,score})}}
  if(!count)return studySpotifyThemeDefault;const avg=count?sum.map(v=>Math.round(v/count)):[117,240,169];if(!samples.length)return studyHashTheme(avg.join(','));samples.sort((a,b)=>b.score-a.score);const primary=samples[0];let secondary=samples.find(s=>Math.abs(s.hsl.h-primary.hsl.h)>.11&&Math.abs(s.hsl.l-primary.hsl.l)>.05)||samples[Math.min(5,samples.length-1)]||primary;const accent=studyHslToRgb(primary.hsl.h,studyClamp(Math.max(primary.hsl.s,.58),0,1),studyClamp(primary.hsl.l<.38?.52:primary.hsl.l>.72?.62:primary.hsl.l,.45,.67));const accent2=studyHslToRgb(secondary.hsl.h,studyClamp(Math.max(secondary.hsl.s,.46),0,1),studyClamp(secondary.hsl.l<.34?.56:secondary.hsl.l>.76?.65:secondary.hsl.l,.49,.71));return{accent:studyRgbCss(accent),accent2:studyRgbCss(accent2),glow:studyRgbaCss(accent,.30),glow2:studyRgbaCss(accent2,.24),soft:studyRgbaCss(accent,.12),soft2:studyRgbaCss(accent2,.10),border:studyRgbaCss(accent,.32),cardBorder:studyRgbaCss(accent2,.24),shadow:studyRgbaCss(studyMixRgb(avg,[0,0,0],.82),.36)}}
async function studyExtractSpotifyTheme(artwork,keyHint=''){const cacheKey=String(artwork||keyHint||'');if(studySpotifyThemeCache.has(cacheKey))return studySpotifyThemeCache.get(cacheKey);let theme=null;if(artwork){try{theme=await new Promise((resolve,reject)=>{const img=new Image();img.crossOrigin='anonymous';img.referrerPolicy='no-referrer';img.onload=()=>{try{const canvas=document.createElement('canvas');const size=30;canvas.width=size;canvas.height=size;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,size,size);const {data}=ctx.getImageData(0,0,size,size);resolve(studyBuildThemeFromImageData(data,size,size))}catch(err){reject(err)}};img.onerror=()=>reject(new Error('artwork-load-failed'));img.src=artwork;});}catch(_){theme=null}}
  if(!theme)theme=studyHashTheme(cacheKey||'warrior-theme');studySpotifyThemeCache.set(cacheKey,theme);return theme}
async function studyUpdateSpotifyThemeFromState(playerState,animated=true){const artwork=String(playerState?.artwork||'').trim();const key=artwork||`${playerState?.trackId||''}|${playerState?.title||''}|${playerState?.artist||''}`.trim();if(!key){studySpotifyThemeKey='';studyApplySpotifyTheme(studySpotifyThemeDefault,false);document.body?.classList.remove('track-theme-live');return}if(key===studySpotifyThemeKey)return;studySpotifyThemeKey=key;const theme=await studyExtractSpotifyTheme(artwork,key).catch(()=>studyHashTheme(key));if(studySpotifyThemeKey!==key)return;studyApplySpotifyTheme(theme,animated)}

let breakStreamAudio=null,lastBreakStreamTitle='',breakAmbiencePlaying=false,breakAmbienceRotateTimer=null,breakAmbienceStartToken=0;
const breakStreamFadeTimers=new WeakMap();
const BREAK_STREAM_FILES=[
  {title:'File:Sound Effects - The sound of a small stream.ogg',label:'small stream'},
  {title:'File:Flowing-water-100019.ogg',label:'flowing water'},
  {title:'File:James River Rapids 1.ogg',label:'river rapids I'},
  {title:'File:James River Rapids 3.ogg',label:'river rapids III'},
  {title:'File:Sanna river rapids.ogg',label:'alpine rapids'},
  {title:'File:Forest lawn creek.ogg',label:'forest creek'},
  {title:'File:Hemlock stream.ogg',label:'hemlock stream'},
  {title:'File:Water wave.ogg',label:'gentle waves'},
  {title:'File:Ocean Waves on a Tropical Beach.ogg',label:'ocean wash'}
];
let breakStreamRecent=[];
const breakStreamUrlCache={};
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const DEFAULT_SPOTIFY='https://open.spotify.com/playlist/3pRLVP3hoPzbZtetvH1tro?si=7ad7fd89c1584d01';
const COMMONS_API='https://commons.wikimedia.org/w/api.php';
const NASA_SVS_API='https://svs.gsfc.nasa.gov/api';
const ARCHIVE_API='https://archive.org';
const MIXKIT_BASE='https://mixkit.co';
const VIDEO_POOL_KEY='warriorVideoPoolsV12_THROTTLED_4K';
const FOURK_CATEGORY='Category:Video display resolution 3840 x 2160';
const POOL_TARGET=240,MIN_SCENE_GOAL=100,VIDEO_MIN_WIDTH=3840,VIDEO_MIN_HEIGHT=2160,SCENE_ROTATE_MS=10*60*1000;
const OUTDOOR_THEMES={
  forest:{label:'Forest trails · 4K',mixkitSlugs:['forest','nature','woods','rainforest','tree'],seeds:['File:Aerial views of a forest in Belarus.webm','File:Mossy Tree CC0.webm','File:Forest For the Trees 4K.webm','File:Camino principal sendero Blanca Nieves - Bosque Panul - 10 octubre 2022.webm'],roots:['Category:Videos of forests','Category:Videos of trees','Category:Drone videos of forests'],fallback:['4K forest nature','UHD forest trail','4K woodland','4K rainforest','4K pine forest drone','4K jungle nature','4K forest canopy','4K mossy forest'],archiveTerms:['forest 4k','woodland 4k','rainforest 4k','nature forest 2160'],keywords:/forest|woodland|rainforest|jungle|woods|pine|grove|tree|canopy|trail/i,excludeCats:/deforestation|forestry|harvester|logging|fire damage|people|festival|road|traffic|promo|advert/i},
  mountains:{label:'Mountains · 4K',mixkitSlugs:['mountains','mountain','landscape','alps','snow'],seeds:['File:Flying the Rocky Mountains- Stunning FPV Drone Footage.webm','File:Piz Linard, aerial video.webm'],roots:['Category:Videos of mountains','Category:Drone videos of mountains','Category:Videos of glaciers'],fallback:['4K mountain landscape','UHD alpine','4K himalaya','4K mountain valley','4K mountain drone','4K glacier','4K snow mountain','4K mountain range'],archiveTerms:['mountain landscape 4k','alpine 4k','glacier 4k','mountain drone 2160'],keywords:/mountain|alpine|himalaya|peak|summit|ridge|glacier|volcano|canyon|range/i,excludeCats:/avalanche accident|rescue|road|traffic|ski competition|people|promo|advert/i},
  coast:{label:'Ocean & coast · 4K',mixkitSlugs:['ocean','beach','coast','sea','waves'],seeds:['File:Coast near Getxo 150145.webm','File:Beach Seaweed 1 2018-06-17.webm','File:Seaside Beach - October 2022 - Sarah Stierch 04.webm','File:Rialto Beach Waves 2022.webm'],roots:['Category:Videos of beaches','Category:Videos of coastlines','Category:Videos of waves'],fallback:['4K beach nature','4K coast drone','UHD ocean waves','4K seaside','4K coastal cliffs','4K island coast','4K shoreline','4K ocean coast'],archiveTerms:['ocean coast 4k','beach waves 4k','seaside 2160','coastal cliffs 4k'],keywords:/beach|coast|ocean|sea|shore|seaside|wave|cliff|bay|island|shoreline/i,excludeCats:/aircraft|airport|shipwreck|port|harbour traffic|boat race|people|festival|promo|advert/i},
  water:{label:'Waterfalls & rivers · 4K',mixkitSlugs:['waterfall','river','lake','water','stream'],seeds:['File:Hukou Waterfall, Oct 6 2023.webm','File:Rheinfall (Rhine Falls).webm'],roots:['Category:Videos of waterfalls','Category:Videos of rivers','Category:Videos of lakes'],fallback:['4K waterfall nature','4K river landscape','UHD stream nature','4K rapids','4K lake nature','4K creek','4K river gorge','4K mountain waterfall'],archiveTerms:['waterfall 4k','river nature 4k','stream 2160','lake nature 4k'],keywords:/waterfall|river|stream|rapids|creek|lake|cascade|falls|brook/i,excludeCats:/transport|dam|weir|fording|sewage|flood damage|boat|people|bridge traffic|promo|advert/i},
  night:{label:'Night sky · 4K',mixkitSlugs:['night-sky','starry-sky','stars','aurora-borealis','northern-lights'],seeds:['File:002 Northern lights in the night sky over Mývatn in Iceland Video by Giles Laurent.webm','File:2016-09 Aurora timelapse Saguenay.webm','File:Following the Milky Way over ALMA.webm'],roots:['Category:Videos of the night sky','Category:Videos of aurorae','Category:Time-lapse videos of astronomy'],fallback:['4K night sky stars','4K Milky Way timelapse','4K aurora borealis','4K star timelapse','4K moon nightscape','UHD night sky','2160p aurora','2160p stars timelapse','4K meteor shower','4K moonrise night'],archiveTerms:['night sky 4k','milky way timelapse 4k','aurora 4k','stars timelapse 2160'],keywords:/night|sky|milky way|aurora|constellation|nightscape|star|moon|meteor|astronom|observator/i,excludeCats:/rocket|spacecraft|astronaut|planetarium|conference|presentation|logo|promo|advert|municipality|tourism/i},
  space:{label:'Space · 4K',mixkitSlugs:['galaxy','black-hole','space','solar-system','universe','cosmos'],seeds:['File:NASA - Jupiter in 4k Ultra HD 3afEX8a2jPg.webm','File:Isolated Black Hole Visualization (SVS14620 - 1-Orbiting a bare black hole-4K).webm','File:Black Hole with Accretion Disk Visualization (SVS14619 - 1-Approaching a black hole-4K).webm'],roots:['Category:Videos of planets','Category:Videos of galaxies','Category:Videos of nebulae','Category:Videos of black holes'],fallback:['4K Jupiter NASA','4K Saturn planet','4K black hole NASA','4K galaxy NASA','4K nebula NASA','4K exoplanet','4K supernova NASA'],nasaTerms:['black hole','Jupiter','Saturn','Mars planet','exoplanet','galaxy','nebula','supernova','solar system','Sun 4K','deep space','James Webb'],keywords:/jupiter|saturn|mars|venus|mercury|neptune|uranus|planet|galaxy|nebula|black hole|supernova|stellar|star|cosmos|universe|accretion|exoplanet|solar system|sun/i,excludeCats:/night sky|aurora|milky way|astronaut interview|conference|presentation|mission patch|logo|promo|advert|launch event|press conference|weather|hurricane|climate|sea surface|temperature map|city map/i}
};
const LEGACY_THEME_MAP={library:'forest',rain:'water',dark:'mountains',static:'forest'};
let videoPools={},videoPoolBuilds={},currentVideoTheme='forest',currentVideoUrl='',videoLoadToken=0,backgroundRetryTimer=null,sceneRotationTimer=null,scenePerformanceTimer=null,sceneEnrichTimer=null;
let fourKMasterTitlesPromise=null,fourKMasterTitles=[];
let videoRecentByTheme={},videoRejectedUrlsByTheme={};
let currentNoteKey='general',currentNoteDay=todayKey(),notebookPageIndex=0,drawHistory=[],drawing=false,lastPoint=null,penWidth=3,eraser=false,notebookDirty=false;
init();

async function init(){
  bind();
  debugLog('study-init',{version:chrome.runtime.getManifest().version,sessionId:spotifyStudySessionId,href:location.href});
  window.addEventListener('message',handleSpotifyIframeMessage);
  chrome.runtime.onMessage.addListener(message=>{if(message?.type==='SPOTIFY_ENGINE_BROADCAST')handleSpotifyHostEvent(String(message.eventType||''),message.payload||{});if(message?.type==='STUDY_SPOTIFY_COMMAND')handleSpotifyCommand(message.command||{}).catch(e=>debugLog('spotify-command-direct-error',{error:String(e?.message||e),command:message.command||{}}))});
  const r=await chrome.runtime.sendMessage({type:'GET_STATE'});
  state=r.state;urls=r.urls;
  const coachSaved=await chrome.storage.local.get(['warriorCoachDraft',SPOTIFY_PLAYER_STATE_KEY]);
  coachDraft=String(coachSaved.warriorCoachDraft||'');
  const savedSpotifyState=coachSaved?.[SPOTIFY_PLAYER_STATE_KEY]||null;
  // A new Study Room session must never paint a track from an older session before
  // the live engine reports what is actually playing.
  spotifyPlayerState=null;
  if(savedSpotifyState){spotifyShuffleState=!!savedSpotifyState.shuffleOn;spotifyShuffleMode='warrior';spotifyPlaying=false;}
  studyApplySpotifyTheme(studySpotifyThemeDefault,false);
  await loadVideoPoolCache();
  initFullCanvas();
  previousPhase=state.study?.phase||'work'; previousCycles=Number(state.study?.cycles||0);
  // The core timer must come up even if an optional tool UI is changed or fails.
  // v5.19.1/2 removed the old Focus DOM but stale references could abort init here,
  // leaving the timer frozen and preventing the outdoor video from starting.
  if(tick)clearInterval(tick);
  tick=setInterval(()=>{try{renderTimer()}catch(e){debugLog('timer-render-error',{error:String(e?.message||e)})}try{renderSpotifyMiniCustom()}catch(_){}},500);
  try{renderAll()}catch(e){
    debugLog('render-all-error',{error:String(e?.stack||e)});
    try{renderTimer();renderFocusLine();renderStudyTodos();renderPresets();renderCustomPomodoro();applyPhaseVisualState()}catch(_){}
    const theme=LEGACY_THEME_MAP[state.study?.videoTheme]||state.study?.videoTheme||'forest';
    setVideoTheme(theme,false).catch(err=>debugLog('background-init-error',{error:String(err?.message||err)}));
  }
  initSpotifyPlaybackMonitor();
  chrome.runtime.sendMessage({type:'SPOTIFY_ENGINE_INIT'}).catch(e=>debugLog('spotify-engine-init-error',{error:String(e?.message||e)}));
  publishSpotifyStudyHeartbeat();
  spotifyStudyHeartbeatTimer=setInterval(publishSpotifyStudyHeartbeat,5000);
  setMusicFxStatus('Spotify FX · Spotify-audio fade + tone',true);
  await pushSpotifyDsp({mode:'steady',phase:state.study?.phase||'work',duration:.15});
  scheduleBoundaryWarp();
  window.addEventListener('resize',()=>positionSpotifyPlayer(false));
  document.addEventListener('visibilitychange',syncBackgroundVideoVisibility);
  syncBackgroundVideoVisibility();
  chrome.storage.onChanged.addListener((changes,area)=>{
    if(area==='local'&&changes[DEBUG_ENABLED_KEY])warriorDebugEnabled=!!changes[DEBUG_ENABLED_KEY].newValue;
    if(area==='local'&&changes[SPOTIFY_HOST_CONTROL_KEY])handleSpotifyHostControl(changes[SPOTIFY_HOST_CONTROL_KEY].newValue||{});
    if(area==='local'&&changes[SPOTIFY_PLAYER_COMMAND_KEY])handleSpotifyCommand(changes[SPOTIFY_PLAYER_COMMAND_KEY].newValue||{}).catch(e=>debugLog('spotify-command-error',{error:String(e?.message||e)}));
    if(area==='local'&&changes[SPOTIFY_DSP_TELEMETRY_KEY]){
      spotifyDspTelemetry=changes[SPOTIFY_DSP_TELEMETRY_KEY].newValue||null;
      const c=Number(spotifyDspTelemetry?.connected||0),phase=String(spotifyDspTelemetry?.phase||state?.study?.phase||'work');
      if(c>0)setMusicFxStatus(`Spotify FX · ${phase==='break'?'break fade + lower tone':'focus clean'} · ${c} media`,true);
    }
    if(area==='local'&&changes[SPOTIFY_PLAYER_STATE_KEY]){
      spotifyPlayerState=changes[SPOTIFY_PLAYER_STATE_KEY].newValue||null;debugLog('player-state-change',{state:spotifyPlayerState});studyUpdateSpotifyThemeFromState(spotifyPlayerState,true).catch(()=>{});
      spotifyShuffleState=typeof spotifyPlayerState?.shuffleOn==='boolean'?spotifyPlayerState.shuffleOn:spotifyShuffleState;
      if(Number.isInteger(Number(spotifyPlayerState?.currentIndex))&&Number(spotifyPlayerState.currentIndex)>=0)spotifyCurrentIndex=Number(spotifyPlayerState.currentIndex);
      spotifyShuffleMode='warrior';spotifyShufflePending=false;spotifyPlaying=spotifyPlayerState?.playing===true;
      if(spotifyShufflePendingTimer){clearTimeout(spotifyShufflePendingTimer);spotifyShufflePendingTimer=null}
      renderSpotifyControls();renderSpotifyMiniCustom();positionSpotifyPlayer(true);scheduleSpotifyQueueRender();
    }
    if(area!=='local'||!changes.warriorState)return;
    const oldStudy=state?.study||{};
    const nextState=changes.warriorState.newValue;
    const nextStudy=nextState?.study||{};
    const phaseChanged=(oldStudy.phase||'work')!==(nextStudy.phase||'work');
    const cycleChanged=Number(oldStudy.cycles||0)!==Number(nextStudy.cycles||0);
    state=nextState;
    // Keep the Study Room controls synced to actual user volume changes from the side panel,
    // without tying volume to phase transitions.
    const syncedVolume=Number(nextStudy.spotifyVolume);
    if(Number.isFinite(syncedVolume)){
      const v=Math.max(0,Math.min(1,syncedVolume));
      if(Math.abs(v-spotifyVolume)>0.0001){spotifyVolume=v;renderSpotifyControls();renderSpotifyMiniCustom();}
    }
    renderTimer();renderFocusLine();renderStudyTodos();renderPresets();renderCustomPomodoro();applyPhaseVisualState();
    if(phaseChanged&&(oldStudy.running||nextStudy.running||cycleChanged))handlePhaseTransition(nextStudy.phase||'work',oldStudy.phase||'work');
    scheduleBoundaryWarp();
    previousPhase=nextStudy.phase||'work';previousCycles=Number(nextStudy.cycles||0);
  });
}

function bind(){
  $('#closeBtn').addEventListener('click',()=>window.close());
  $('#openCanvasBtn').addEventListener('click',()=>openUrl(urls?.canvas));
  $('#startPauseBtn').addEventListener('click',async()=>{
    requestSpotifyPlay();
    await ensureCueAudio();
    await studyAction(state.study?.running?'pause':'start');
    scheduleBoundaryWarp();
  });
  $('#skipBtn').addEventListener('click',async()=>{
    await ensureCueAudio();
    await skipWithTransitionWarp();
  });
  $('#resetBtn').addEventListener('click',async()=>{
    cancelBoundaryWarp();
    await pushSpotifyDsp({mode:'steady',phase:'work',duration:.25});
    await studyAction('reset');
    scheduleBoundaryWarp();
  });
  $$('.preset[data-preset]').forEach(b=>b.addEventListener('click',()=>setPreset(b)));
  $('#customPomodoroToggle').addEventListener('click',()=>toggleCustomPomodoro());
  $('#applyCustomPomodoro').addEventListener('click',applyCustomPomodoro);
  $('#customWorkMinutes').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();applyCustomPomodoro();}});
  $('#customBreakMinutes').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();applyCustomPomodoro();}});
  $('#autoAdvance').addEventListener('change',()=>updateStudy({autoAdvance:$('#autoAdvance').checked}));
  $('#studyTodoList')?.addEventListener('click',async e=>{const c=e.target.closest('[data-todo-check]');if(c){if(c.dataset.fxBusy==='1')return;c.dataset.fxBusy='1';try{await setStudyTodoDone(c.dataset.todoCheck,c)}finally{delete c.dataset.fxBusy}return}});
  $('#studyTodoQuickAdd')?.addEventListener('click',toggleStudyTodoComposer);
  $('#studyTodoSave')?.addEventListener('click',addStudyTodo);
  $('#studyTodoInput')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();addStudyTodo()}else if(e.key==='Escape'){toggleStudyTodoComposer(false)}});
  $('#phaseFxEnabled').addEventListener('change',async()=>{
    const enabled=$('#phaseFxEnabled').checked;
    await updateStudy({phaseFxEnabled:enabled});
    if(!enabled){cancelBoundaryWarp();await pushSpotifyDsp({enabled:false,mode:'steady',phase:'work',duration:.2})}
    else{await pushSpotifyDsp({enabled:true,mode:'steady',phase:state.study?.phase||'work',duration:.35});scheduleBoundaryWarp()}
  });

  $$('[data-drawer]').forEach(b=>b.addEventListener('click',()=>openDrawer(b.dataset.drawer)));
  $('#drawerClose').addEventListener('click',()=>openDrawer(null));
  $('#drawer').addEventListener('transitionend',e=>{if(e.propertyName==='transform'||e.propertyName==='opacity')positionSpotifyPlayer(true)});
  $('#noteSubject').addEventListener('change',()=>switchNoteSubject($('#noteSubject').value));
  $('#notes').addEventListener('input',queueTextNoteSave);
  $('#newTodayNote').addEventListener('click',()=>switchNoteDay(todayKey()));
  $('#openNotebookBtn').addEventListener('click',()=>window.WarriorNotesLauncher.open());
  $('#noteDayList').addEventListener('click',e=>{const b=e.target.closest('[data-note-day]');if(b)switchNoteDay(b.dataset.noteDay)});

  $$('.mode').forEach(b=>b.addEventListener('click',()=>{$$('.mode').forEach(x=>x.classList.remove('active'));b.classList.add('active');mode=b.dataset.mode}));
  $('#aiQuestion').addEventListener('input',queueCoachDraftSave);
  $('#chatgptBtn').addEventListener('click',()=>useChatGPT(false,true));

  $$('.theme').forEach(b=>b.addEventListener('click',()=>setVideoTheme(b.dataset.video,true)));
  $('#nextFootageBtn').addEventListener('click',()=>playNextThemeVideo(true));
  $('#testPhaseFxBtn').addEventListener('click',previewMusicBoundaryWarp);
  $('#spotifyMiniIcon').addEventListener('click',()=>openDrawer(activeDrawer==='spotify'?null:'spotify'));
  $('#spotifyMiniPrev')?.addEventListener('click',()=>{const p=spotifyUiCurrentPosition();sendSpotifyControl({action:'previous',positionHint:p});});
  $('#spotifyMiniNext')?.addEventListener('click',()=>sendSpotifyControl({action:'next'}));
  $('#spotifyMiniToggle')?.addEventListener('click',()=>sendSpotifyControl({action:spotifyPlayerState?.playing===true?'pause':'resume'}));
  $('#spotifyPanelPrev')?.addEventListener('click',()=>{const p=spotifyUiCurrentPosition();sendSpotifyControl({action:'previous',positionHint:p});});
  $('#spotifyPanelNext')?.addEventListener('click',()=>sendSpotifyControl({action:'next'}));
  $('#spotifyPanelToggle')?.addEventListener('click',()=>sendSpotifyControl({action:spotifyPlayerState?.playing===true?'pause':'resume'}));
  $('#spotifyPanelProgress')?.addEventListener('click',e=>{const r=e.currentTarget.getBoundingClientRect();if(!r.width)return;const ratio=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));sendSpotifyControl({action:'seekRatio',ratio});});
  $('#spotifyMiniShuffle')?.addEventListener('click',()=>sendSpotifyControl({action:'shuffleSet',value:!Boolean(spotifyPlayerState?.shuffleOn)}));
  $('#spotifyMiniProgress')?.addEventListener('click',e=>{const r=e.currentTarget.getBoundingClientRect();if(!r.width)return;const ratio=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));sendSpotifyControl({action:'seekRatio',ratio});});
  $('#spotifyMiniVolume')?.addEventListener('input',e=>{spotifyVolume=Math.max(0,Math.min(1,Number(e.target.value||100)/100));renderSpotifyControls();renderSpotifyMiniCustom();sendSpotifyDspVolume(spotifyVolume).catch(()=>{});});
  $('#spotifyMiniVolume')?.addEventListener('change',()=>updateStudy({spotifyVolume}).catch(()=>{}));
  $('#loadSpotifyBtn').addEventListener('click',loadSpotifyFromInput);
  $('#spotifyUrl').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();loadSpotifyFromInput();}});
  $('#spotifyQueueSearch')?.addEventListener('input',e=>{spotifyQueueSearch=String(e.target.value||'');const vp=$('#spotifyQueueViewport');if(vp)vp.scrollTop=0;scheduleSpotifyQueueRender()});
  $('#spotifyQueueViewport')?.addEventListener('scroll',scheduleSpotifyQueueRender,{passive:true});
  $('#spotifyQueueViewport')?.addEventListener('click',e=>{const b=e.target.closest('[data-spotify-index]');if(!b)return;const index=Number(b.dataset.spotifyIndex);if(Number.isInteger(index)&&index>=0)sendSpotifyControl({action:'playIndex',index}).catch(()=>{})});
  $('#spotifyQueueRefresh')?.addEventListener('click',()=>loadSpotifyFullQueue(true).catch(e=>debugLog('spotify-full-queue-refresh-error',{error:String(e?.message||e)})));
  $('#spotifyShuffleBtn').addEventListener('click',()=>{
    if(spotifyShufflePending)return;
    const desired=!Boolean(spotifyPlayerState?.shuffleOn??spotifyShuffleState);
    spotifyShuffleState=desired;spotifyShuffleMode='warrior';spotifyShufflePending=true;renderSpotifyControls();renderSpotifyMiniCustom();
    sendSpotifyControl({action:'shuffleSet',value:desired}).catch(()=>{});
    if(spotifyShufflePendingTimer)clearTimeout(spotifyShufflePendingTimer);
    spotifyShufflePendingTimer=setTimeout(()=>{spotifyShufflePending=false;renderSpotifyControls();renderSpotifyMiniCustom()},1800);
  });
  $('#spotifyVolume').addEventListener('input',()=>{
    spotifyVolume=Math.max(0,Math.min(1,Number($('#spotifyVolume').value||100)/100));
    renderSpotifyControls();
    sendSpotifyDspVolume(spotifyVolume).catch(()=>{});
  });
  $('#spotifyVolume').addEventListener('change',()=>updateStudy({spotifyVolume}).catch(()=>{}));
  installFirstInteractionSpotifyPlay();

  $('#closeNotebookBtn').addEventListener('click',closeNotebook);
  $('#savePageBtn').addEventListener('click',()=>saveNotebookPage(true));
  $('#addPageBtn').addEventListener('click',addNotebookPage);
  $('#deletePageBtn').addEventListener('click',deleteNotebookPage);
  $('#prevPageBtn').addEventListener('click',()=>moveNotebookPage(-1));
  $('#nextPageBtn').addEventListener('click',()=>moveNotebookPage(1));
  $$('.pen').forEach(b=>b.addEventListener('click',()=>{eraser=false;$('#eraserBtn').classList.remove('active');penWidth=Number(b.dataset.pen)||3;$$('.pen').forEach(x=>x.classList.toggle('active',x===b))}));
  $('#eraserBtn').addEventListener('click',()=>{eraser=!eraser;$('#eraserBtn').classList.toggle('active',eraser)});
  $('#undoFullDraw').addEventListener('click',undoNotebook);
  $('#clearFullDraw').addEventListener('click',clearNotebookPage);
  window.addEventListener('beforeunload',()=>{if(notebookDirty)saveNotebookPage(false);chrome.storage.local.set({warriorCoachDraft:$('#aiQuestion')?.value||coachDraft}).catch(()=>{});clearInterval(spotifyStudyHeartbeatTimer);chrome.storage.local.get(SPOTIFY_STUDY_SESSION_KEY).then(g=>{if(g?.[SPOTIFY_STUDY_SESSION_KEY]?.sessionId===spotifyStudySessionId)chrome.storage.local.remove(SPOTIFY_STUDY_SESSION_KEY)}).catch(()=>{});stopBreakStreamAmbience(0)});
}

function publishSpotifyStudyHeartbeat(){
  const hb={sessionId:spotifyStudySessionId,at:Date.now()};
  if((heartbeatDebugCounter++%5)===0)debugLog('study-heartbeat',{heartbeat:hb});
  chrome.storage.local.set({[SPOTIFY_STUDY_SESSION_KEY]:hb}).catch(e=>debugLog('study-heartbeat-error',{error:String(e?.message||e)}));
}

function renderAll(){
  const s=state.study||{};
  $('#autoAdvance').checked=s.autoAdvance!==false;
  $('#phaseFxEnabled').checked=s.phaseFxEnabled!==false;
  const legacyFocus=$('#customFocus');if(legacyFocus)legacyFocus.value=s.focusText||'';
  $('#aiQuestion').value=coachDraft;
  $('#aiAnswer').textContent='Your draft is saved locally. One click opens ChatGPT and inserts the full Coach prompt automatically.';
  if($('#assignmentSelect'))populateAssignments();populateSubjects();renderTimer();renderFocusLine();renderStudyTodos();renderPresets();renderCustomPomodoro();applyPhaseVisualState();
  currentNoteKey=s.notesSubjectKey||subjectForCurrentAssignment()||'general';
  if(![...$('#noteSubject').options].some(o=>o.value===currentNoteKey))currentNoteKey='general';
  $('#noteSubject').value=currentNoteKey;
  const storedDay=s.notesDayKey||todayKey();
  currentNoteDay=storedDay;
  loadCurrentNote();
  spotifyVolume=Number.isFinite(Number(s.spotifyVolume))?Math.max(0,Math.min(1,Number(s.spotifyVolume))):1;
  const spotify=s.spotifyUrl||DEFAULT_SPOTIFY;$('#spotifyUrl').value=spotify;renderSpotify(spotify);renderSpotifyControls();renderSpotifyMiniCustom();sendSpotifyDspVolume(spotifyVolume).catch(()=>{});
  setMusicFxStatus('Spotify FX · Spotify-audio fade + tone',true);
  setVideoTheme(LEGACY_THEME_MAP[s.videoTheme]||s.videoTheme||'forest',false).catch(e=>debugLog('background-init-error',{error:String(e?.message||e)}));
}

function populateAssignments(){
  const select=$('#assignmentSelect');if(!select)return;
  const now=Date.now();
  const current=state.study?.focusAssignmentId||'';
  const open=(state.assignments||[]).filter(a=>{
    if(a.completed||a.submitted||state.manualAssignmentStatus?.[String(a.id)]?.submitted)return false;
    if(!a.dueAt)return true;
    const due=Date.parse(a.dueAt);
    return !Number.isFinite(due)||due>=now;
  }).sort((a,b)=>Date.parse(a.dueAt||'9999')-Date.parse(b.dueAt||'9999'));
  select.innerHTML='<option value="">No assignment selected</option>'+open.map(a=>`<option value="${attr(a.id)}">${esc(prettyCourseLabel(a.courseName,a.courseCode))} — ${esc(a.title)}</option>`).join('');
  const valid=open.some(a=>String(a.id)===String(current));
  select.value=valid?current:'';
  if(current&&!valid){
    state.study={...(state.study||{}),focusAssignmentId:''};
    chrome.runtime.sendMessage({type:'UPDATE_STUDY',patch:{focusAssignmentId:''}}).catch(()=>{});
  }
}

function prettyCourseLabel(name='',code=''){
  const clean=v=>String(v||'').trim().replace(/\s+/g,' ');
  const friendly=clean(name),raw=clean(code);
  // Canvas course names are the same human-readable labels shown on assignment cards.
  // Prefer them unless Canvas only gave us an internal-looking identifier.
  if(friendly && !/^[A-Z]{2,6}[ _-]\d{3,4}(?:[ _-](?:20)?\d{4,6})?[ _-]\d{3}$/i.test(friendly.replace(/_/g,' '))) return friendly;
  const source=raw||friendly;
  if(!source) return 'Canvas course';
  const normalized=source.replace(/_/g,' ').replace(/\s+/g,' ').trim();
  // MAT_2020_202609_510 -> MAT 2020 - Sec 510
  // BE_1200_2509_005     -> BE 1200 - Sec 005
  const m=normalized.match(/^([A-Za-z]{2,8})\s+(\d{3,4})\s+(?:\d{4,6})\s+(\d{3})$/);
  if(m) return `${m[1].toUpperCase()} ${m[2]} - Sec ${m[3]}`;
  return normalized;
}

function populateSubjects(){
  const seen=new Set(),opts=[{key:'general',label:'General'}];
  const assignments=state.assignments||[];
  for(const c of state.courses||[]){
    const key=String(c.id||c.course_id||c.code||c.name||'').trim();
    if(!key||seen.has(key))continue;
    seen.add(key);
    // If an assignment from this course has the exact friendly context name,
    // use that first so Notes matches the labels already shown on assignment cards.
    const sample=assignments.find(a=>String(a.courseId||'')===String(c.id||c.course_id||''));
    opts.push({key,label:prettyCourseLabel(sample?.courseName||c.name||c.course_name,c.code||c.course_code)});
  }
  for(const a of assignments){
    const key=String(a.courseId||a.courseCode||a.courseName||'').trim();
    if(!key||seen.has(key))continue;
    seen.add(key);
    opts.push({key,label:prettyCourseLabel(a.courseName,a.courseCode)});
  }
  $('#noteSubject').innerHTML=opts.map(o=>`<option value="${attr(o.key)}">${esc(o.label)}</option>`).join('');
}
async function onAssignmentChange(){const select=$('#assignmentSelect');if(!select)return;const id=select.value;await updateStudy({focusAssignmentId:id});renderFocusLine();const key=subjectForAssignment(id);if(key){currentNoteKey=key;$('#noteSubject').value=key;await updateStudy({notesSubjectKey:key});currentNoteDay=todayKey();loadCurrentNote()}}
function subjectForCurrentAssignment(){return subjectForAssignment(state.study?.focusAssignmentId||'')}
function subjectForAssignment(id){const a=(state.assignments||[]).find(x=>String(x.id)===String(id));return a?String(a.courseId||a.courseCode||a.courseName||''):''}

function renderTimer(){
  if(!state)return;
  const s=state.study||{},remaining=s.running&&s.endAt?Math.max(0,Number(s.endAt)-Date.now()):Number(s.remainingMs||0);
  $('#timerText').textContent=fmt(remaining);
  $('#phaseLabel').textContent=s.phase==='break'?'BREAK':'FOCUS';
  $('#startPauseBtn').textContent=s.running?'Pause':'Start';
  $('#cycleText').textContent=`${Number(s.cycles||0)} completed cycle${Number(s.cycles||0)===1?'':'s'}`;
  renderFocusLine();
  maybeStartUpcomingMusicWarp(s,remaining);
}
function todoItems(){return Array.isArray(state?.todos)?state.todos:[]}
function todoParents(){return todoItems().filter(t=>!String(t.parentId||'')&&!t.completed).sort((a,b)=>String(a.dueDate||'9999-99-99').localeCompare(String(b.dueDate||'9999-99-99')))}
function todoSubs(id){return todoItems().filter(t=>String(t.parentId||'')===String(id)&&!t.completed)}
function todoDayLabel(v){if(!v)return'';if(v===todayKey())return'Today';const d=parseDay(v);return Number.isFinite(+d)?new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric'}).format(d):''}
function renderFocusLine(){if(!state)return;const t=todoParents()[0];$('#focusLine').textContent=t?t.title:'To-do clear.'}
function renderStudyTodos(){const box=$('#studyTodoList');if(!box||!state)return;const parents=todoParents();box.innerHTML=parents.length?parents.map(t=>{const subs=todoSubs(t.id);return `<div class="todo-study-row" data-todo-row="${attr(t.id)}"><button class="todo-study-check" data-todo-check="${attr(t.id)}">✓</button><div><div class="todo-study-title">${esc(t.title)}</div>${t.dueDate?`<div class="todo-study-date">${esc(todoDayLabel(t.dueDate))}</div>`:''}${subs.length?`<div class="todo-study-subs">${subs.map(st=>`<div class="todo-study-row" data-todo-row="${attr(st.id)}"><button class="todo-study-check" data-todo-check="${attr(st.id)}">✓</button><div class="todo-study-title">${esc(st.title)}</div></div>`).join('')}</div>`:''}</div></div>`}).join(''):`<div class="tiny">Nothing pending.</div>`}
function studyTodoFxNodes(id){const key=String(id||'');return $$('[data-todo-row]').filter(el=>String(el.dataset.todoRow||'')===key)}
function studyTaskFxBurst(anchor,tone='done'){if(!anchor||matchMedia('(prefers-reduced-motion: reduce)').matches)return;const r=anchor.getBoundingClientRect(),burst=document.createElement('div');burst.className=`task-fx-burst ${tone}`;burst.style.left=`${r.left+r.width/2}px`;burst.style.top=`${r.top+r.height/2}px`;const angles=[-88,-55,-24,8,40,72,112,148,190,226];burst.innerHTML=`<i class="task-fx-ring"></i>${angles.map((a,i)=>`<i class="task-fx-particle" style="--a:${a}deg;--d:${22+(i%4)*6}px;--delay:${(i%3)*18}ms"></i>`).join('')}`;document.body.appendChild(burst);setTimeout(()=>burst.remove(),760)}
function studyTaskFxEnter(id){const nodes=studyTodoFxNodes(id);nodes.forEach(n=>{n.classList.remove('task-fx-enter');void n.offsetWidth;n.classList.add('task-fx-enter');setTimeout(()=>n.classList.remove('task-fx-enter'),760)});const anchor=nodes[0]?.querySelector('[data-todo-check]')||nodes[0];if(anchor)studyTaskFxBurst(anchor,'added')}
async function studyTaskFxComplete(id,anchor){const nodes=studyTodoFxNodes(id);studyTaskFxBurst(anchor||nodes[0]?.querySelector('[data-todo-check]'),'done');nodes.forEach(n=>n.classList.add('task-fx-complete'));if(!matchMedia('(prefers-reduced-motion: reduce)').matches)await new Promise(r=>setTimeout(r,470))}
function toggleStudyTodoComposer(force){const box=$('#studyTodoComposer'),btn=$('#studyTodoQuickAdd');if(!box)return;const open=force===undefined?box.hidden:Boolean(force);box.hidden=!open;btn?.classList.toggle('active',open);if(open)setTimeout(()=>$('#studyTodoInput')?.focus(),0)}
async function addStudyTodo(){const i=$('#studyTodoInput'),d=$('#studyTodoDate'),title=String(i?.value||'').trim();if(!title){i?.focus();return}const before=new Set(todoItems().map(t=>String(t.id)));const r=await chrome.runtime.sendMessage({type:'ADD_TODO',title,dueDate:String(d?.value||'')});if(r?.state)state=r.state;const added=todoItems().find(t=>!before.has(String(t.id)));if(i)i.value='';if(d)d.value='';toggleStudyTodoComposer(false);renderStudyTodos();renderFocusLine();if(added)requestAnimationFrame(()=>studyTaskFxEnter(added.id))}
async function addStudySubTodo(parentId){const title=prompt('Subtask');if(!String(title||'').trim())return;const before=new Set(todoItems().map(t=>String(t.id)));const r=await chrome.runtime.sendMessage({type:'ADD_TODO',title:String(title).trim(),parentId});if(r?.state)state=r.state;const added=todoItems().find(t=>!before.has(String(t.id)));renderStudyTodos();if(added)requestAnimationFrame(()=>studyTaskFxEnter(added.id))}
async function setStudyTodoDone(id,anchor){await studyTaskFxComplete(id,anchor);const r=await chrome.runtime.sendMessage({type:'SET_TODO_COMPLETED',id,completed:true});if(r?.state)state=r.state;renderStudyTodos();renderFocusLine()}
function renderPresets(){
  const s=state.study||{};let matched=false;
  $$('.preset[data-preset]').forEach(b=>{const[w,br]=b.dataset.preset.split(',').map(Number),on=w===Number(s.workMinutes)&&br===Number(s.breakMinutes);b.classList.toggle('active',on);if(on)matched=true});
  $('#customPomodoroToggle')?.classList.toggle('active',!matched);
}
function renderCustomPomodoro(){const s=state.study||{};if(document.activeElement!==$('#customWorkMinutes'))$('#customWorkMinutes').value=Number(s.workMinutes||50);if(document.activeElement!==$('#customBreakMinutes'))$('#customBreakMinutes').value=Number(s.breakMinutes||10)}
function toggleCustomPomodoro(force){const box=$('#customPomodoro'),open=force===undefined?!box.classList.contains('open'):Boolean(force);box.classList.toggle('open',open);box.setAttribute('aria-hidden',open?'false':'true');if(open)setTimeout(()=>$('#customWorkMinutes')?.focus(),60)}
function clampNum(v,min,max,fallback){const n=Math.round(Number(v));return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback}
async function applyCustomPomodoro(){
  const w=clampNum($('#customWorkMinutes').value,1,240,50),br=clampNum($('#customBreakMinutes').value,1,120,10);
  $('#customWorkMinutes').value=w;$('#customBreakMinutes').value=br;
  await updateStudy({workMinutes:w,breakMinutes:br,phase:'work',running:false,endAt:null,remainingMs:w*60000});
  await chrome.runtime.sendMessage({type:'STUDY_ACTION',action:'reset'});
  const r=await chrome.runtime.sendMessage({type:'GET_STATE'});state=r.state;renderPresets();renderCustomPomodoro();renderTimer();toggleCustomPomodoro(false);
}
async function studyAction(action){const r=await chrome.runtime.sendMessage({type:'STUDY_ACTION',action});if(r.state)state=r.state;renderTimer();scheduleBoundaryWarp();return r}
async function setPreset(btn){const[w,br]=btn.dataset.preset.split(',').map(Number);await updateStudy({workMinutes:w,breakMinutes:br,phase:'work',running:false,endAt:null,remainingMs:w*60000});await chrome.runtime.sendMessage({type:'STUDY_ACTION',action:'reset'});const r=await chrome.runtime.sendMessage({type:'GET_STATE'});state=r.state;renderPresets();renderCustomPomodoro();renderTimer()}
async function updateStudy(patch){const r=await chrome.runtime.sendMessage({type:'UPDATE_STUDY',patch});if(r.state)state=r.state;return r}
function openSelectedAssignment(){const select=$('#assignmentSelect');if(!select)return;const id=select.value,now=Date.now(),a=(state.assignments||[]).find(x=>String(x.id)===String(id)&&!x.completed&&!x.submitted&&(!x.dueAt||!Number.isFinite(Date.parse(x.dueAt))||Date.parse(x.dueAt)>=now));if(a?.url)openUrl(a.url)}
function openUrl(url){if(url)chrome.runtime.sendMessage({type:'OPEN_URL',url})}

function openDrawer(name){
  activeDrawer=name;
  $('#drawer').classList.toggle('open',Boolean(name));
  $('#drawer').setAttribute('aria-hidden',name?'false':'true');
  $$('[data-drawer]').forEach(b=>b.classList.toggle('active',b.dataset.drawer===name));
  $$('.drawer-page').forEach(p=>p.classList.toggle('active',p.dataset.page===name));
  if(name){
    $('#drawerTitle').textContent=({focus:'Todo',notes:'Notes',ai:'ChatGPT Coach',spotify:'Spotify',atmosphere:'Outdoors'})[name]||name;
    if(name==='notes')loadCurrentNote();
    if(name==='spotify')loadSpotifyFullQueue(false).catch(e=>debugLog('spotify-full-queue-open-error',{error:String(e?.message||e)}));
  }
  requestAnimationFrame(()=>requestAnimationFrame(()=>positionSpotifyPlayer(true)));
  // The drawer itself slides for ~280 ms. On the first click its slot is still off-screen,
  // so position again after the slide settles instead of requiring a second Spotify click.
  setTimeout(()=>{if(activeDrawer===name)positionSpotifyPlayer(true)},330);
}

function notebookStore(){return structuredClone(state.study?.noteBooks||{})}
function subjectBook(key=currentNoteKey){return notebookStore()[key]||{}}
function dayRecord(key=currentNoteKey,day=currentNoteDay){return subjectBook(key)[day]||{text:'',pages:[],updatedAt:null}}
function subjectLabel(key=currentNoteKey){const opt=[...$('#noteSubject').options].find(o=>o.value===key);return opt?.textContent||'General'}
async function switchNoteSubject(key){currentNoteKey=key||'general';currentNoteDay=todayKey();await updateStudy({notesSubjectKey:currentNoteKey,notesDayKey:currentNoteDay});loadCurrentNote()}
async function switchNoteDay(day){currentNoteDay=day||todayKey();await updateStudy({notesDayKey:currentNoteDay});loadCurrentNote()}
function loadCurrentNote(){const rec=dayRecord();$('#notes').value=rec.text||'';$('#noteState').textContent='Saved locally';$('#currentNoteDayLabel').textContent=formatDay(currentNoteDay);$('#pageCountBadge').textContent=`${(rec.pages||[]).length} page${(rec.pages||[]).length===1?'':'s'}`;renderNoteDays()}
function renderNoteDays(){const book=subjectBook(),days=[...new Set([todayKey(),...Object.keys(book)])].sort().reverse();$('#noteDayList').innerHTML=days.map(day=>{const rec=book[day]||{},pages=(rec.pages||[]).length,words=String(rec.text||'').trim()?String(rec.text).trim().split(/\s+/).length:0;return `<button data-note-day="${attr(day)}" class="${day===currentNoteDay?'active':''}"><span class="day-main">${esc(shortDay(day))}</span><span class="day-meta">${words} words · ${pages} page${pages===1?'':'s'}</span></button>`}).join('')}
function queueTextNoteSave(){clearTimeout(saveNoteTimer);$('#noteState').textContent='Saving…';saveNoteTimer=setTimeout(saveTextNote,280)}
async function saveTextNote(){const store=notebookStore(),book={...(store[currentNoteKey]||{})},prev=book[currentNoteDay]||{text:'',pages:[]};book[currentNoteDay]={...prev,text:$('#notes').value,pages:Array.isArray(prev.pages)?prev.pages:[],updatedAt:new Date().toISOString()};store[currentNoteKey]=book;await updateStudy({noteBooks:store,notesSubjectKey:currentNoteKey,notesDayKey:currentNoteDay});$('#noteState').textContent='Saved locally';renderNoteDays()}

function initFullCanvas(){const c=$('#fullNoteCanvas'),ctx=c.getContext('2d');ctx.lineCap='round';ctx.lineJoin='round';c.addEventListener('pointerdown',e=>{drawing=true;c.setPointerCapture(e.pointerId);drawHistory.push(c.toDataURL('image/webp',.78));if(drawHistory.length>25)drawHistory.shift();lastPoint=canvasPoint(c,e);notebookDirty=true});c.addEventListener('pointermove',e=>{if(!drawing)return;const p=canvasPoint(c,e);ctx.globalCompositeOperation=eraser?'destination-out':'source-over';ctx.strokeStyle='#161a21';ctx.lineWidth=eraser?34:penWidth;ctx.beginPath();ctx.moveTo(lastPoint.x,lastPoint.y);ctx.lineTo(p.x,p.y);ctx.stroke();lastPoint=p});const end=()=>{if(!drawing)return;drawing=false;lastPoint=null;ctx.globalCompositeOperation='source-over';scheduleNotebookSave()};c.addEventListener('pointerup',end);c.addEventListener('pointercancel',end);clearCanvas(c)}
function canvasPoint(c,e){const r=c.getBoundingClientRect();return{x:(e.clientX-r.left)*c.width/r.width,y:(e.clientY-r.top)*c.height/r.height}}
function clearCanvas(c){const ctx=c.getContext('2d');ctx.save();ctx.globalCompositeOperation='source-over';ctx.clearRect(0,0,c.width,c.height);ctx.fillStyle='#faf9f4';ctx.fillRect(0,0,c.width,c.height);ctx.restore()}
function openNotebook(){notebookPageIndex=0;drawHistory=[];$('#notebookModal').classList.add('open');$('#notebookModal').setAttribute('aria-hidden','false');renderNotebookPage()}
async function closeNotebook(){if(notebookDirty)await saveNotebookPage(false);$('#notebookModal').classList.remove('open');$('#notebookModal').setAttribute('aria-hidden','true');loadCurrentNote()}
function currentPages(){const p=dayRecord().pages;return Array.isArray(p)?p:[]}
function renderNotebookPage(){const pages=currentPages();if(!pages.length)notebookPageIndex=0;else notebookPageIndex=Math.max(0,Math.min(notebookPageIndex,pages.length-1));$('#notebookTitle').textContent=`${subjectLabel()} · ${formatDay(currentNoteDay)}`;$('#notebookPageLabel').textContent=`Page ${pages.length?notebookPageIndex+1:1} / ${Math.max(1,pages.length)}`;$('#prevPageBtn').disabled=notebookPageIndex<=0;$('#nextPageBtn').disabled=!pages.length||notebookPageIndex>=pages.length-1;$('#deletePageBtn').disabled=!pages.length;drawHistory=[];const c=$('#fullNoteCanvas');clearCanvas(c);const src=pages[notebookPageIndex];if(src){const img=new Image();img.onload=()=>{clearCanvas(c);c.getContext('2d').drawImage(img,0,0,c.width,c.height)};img.src=src}notebookDirty=false;$('#notebookSaveState').textContent='Saved locally';$('#notebookSaveState').classList.remove('notebook-save-flash')}
function scheduleNotebookSave(){notebookDirty=true;$('#notebookSaveState').textContent='Unsaved changes';clearTimeout(saveNoteTimer);saveNoteTimer=setTimeout(()=>saveNotebookPage(false),450)}
async function saveNotebookPage(flash=true){const c=$('#fullNoteCanvas'),store=notebookStore(),book={...(store[currentNoteKey]||{})},prev=book[currentNoteDay]||{text:'',pages:[]},pages=[...(Array.isArray(prev.pages)?prev.pages:[])];const encoded=c.toDataURL('image/webp',.78);if(!pages.length)pages.push(encoded);else pages[notebookPageIndex]=encoded;book[currentNoteDay]={...prev,pages,updatedAt:new Date().toISOString()};store[currentNoteKey]=book;await updateStudy({noteBooks:store,notesSubjectKey:currentNoteKey,notesDayKey:currentNoteDay});notebookDirty=false;$('#notebookPageLabel').textContent=`Page ${notebookPageIndex+1} / ${pages.length}`;$('#notebookSaveState').textContent=flash?'Saved ✓':'Saved locally';$('#notebookSaveState').classList.toggle('notebook-save-flash',flash);if(flash)setTimeout(()=>$('#notebookSaveState').classList.remove('notebook-save-flash'),1000);renderNoteDays()}
async function addNotebookPage(){if(notebookDirty)await saveNotebookPage(false);const store=notebookStore(),book={...(store[currentNoteKey]||{})},prev=book[currentNoteDay]||{text:'',pages:[]},pages=[...(Array.isArray(prev.pages)?prev.pages:[])];const blank=blankPageData();pages.push(blank);book[currentNoteDay]={...prev,pages,updatedAt:new Date().toISOString()};store[currentNoteKey]=book;await updateStudy({noteBooks:store});notebookPageIndex=pages.length-1;renderNotebookPage();renderNoteDays()}
async function deleteNotebookPage(){const pages=currentPages();if(!pages.length)return;const store=notebookStore(),book={...(store[currentNoteKey]||{})},prev=book[currentNoteDay]||{text:'',pages:[]},next=[...pages];next.splice(notebookPageIndex,1);book[currentNoteDay]={...prev,pages:next,updatedAt:new Date().toISOString()};store[currentNoteKey]=book;await updateStudy({noteBooks:store});notebookPageIndex=Math.max(0,notebookPageIndex-1);renderNotebookPage();renderNoteDays()}
async function moveNotebookPage(delta){if(notebookDirty)await saveNotebookPage(false);const pages=currentPages();if(!pages.length)return;notebookPageIndex=Math.max(0,Math.min(pages.length-1,notebookPageIndex+delta));renderNotebookPage()}
function blankPageData(){const c=document.createElement('canvas');c.width=1600;c.height=1000;clearCanvas(c);return c.toDataURL('image/webp',.78)}
function undoNotebook(){const src=drawHistory.pop();if(!src)return;const c=$('#fullNoteCanvas'),img=new Image();img.onload=()=>{clearCanvas(c);c.getContext('2d').drawImage(img,0,0,c.width,c.height);scheduleNotebookSave()};img.src=src}
function clearNotebookPage(){drawHistory.push($('#fullNoteCanvas').toDataURL('image/webp',.78));clearCanvas($('#fullNoteCanvas'));scheduleNotebookSave()}

function buildChatGPTPrompt(){
  const q=$('#aiQuestion').value.trim();
  const selectedAssignmentId=$('#assignmentSelect')?.value||state.study?.focusAssignmentId||'';
  const a=(state.assignments||[]).find(x=>String(x.id)===String(selectedAssignmentId));
  const prefix=mode==='hint'
    ? 'Act as my tutor. Give me a small hint and the next step. Do not give the final answer unless I explicitly ask for it.'
    : mode==='quiz'
      ? 'Act as my tutor. Quiz me on this problem one question at a time. Wait for my answer before moving on.'
      : 'Act as my tutor. Explain this clearly and step-by-step, showing the necessary reasoning and calculations.';
  const details=[];
  if(a){
    details.push(`Course: ${a.courseCode||a.courseName||'Canvas course'}`);
    details.push(`Assignment: ${a.title||''}`);
    if(a.dueAt) details.push(`Due: ${new Date(a.dueAt).toLocaleString()}`);
    if(Number.isFinite(Number(a.pointsPossible))) details.push(`Points: ${a.pointsPossible}`);
    if(Number.isFinite(Number(a.estimatedGradeWeight))) details.push(`Approx. final-grade weight: ${Number(a.estimatedGradeWeight).toFixed(2)}%`);
    if(a.importanceLabel) details.push(`Warrior Hub importance: ${a.importanceLabel}`);
    const desc=String(a.description||a.body||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
    if(desc) details.push(`Canvas assignment description: ${desc.slice(0,4500)}`);
  }
  if(q) details.push(`My question/problem: ${q}`);
  else details.push('Help me get started on this assignment based on the context above.');
  return [prefix,'',...details].join('\n').trim();
}
function queueCoachDraftSave(){
  coachDraft=$('#aiQuestion').value;
  clearTimeout(coachDraftTimer);
  coachDraftTimer=setTimeout(()=>chrome.storage.local.set({warriorCoachDraft:coachDraft}).catch(()=>{}),220);
}
async function useChatGPT(silent=false,open=true){
  const prompt=buildChatGPTPrompt();
  coachDraft=$('#aiQuestion').value;
  await chrome.storage.local.set({warriorCoachDraft:coachDraft}).catch(()=>{});
  if(!open)return prompt;
  if(coachLaunchBusy){
    if(!silent)$('#aiAnswer').textContent='ChatGPT is already opening…';
    return prompt;
  }
  coachLaunchBusy=true;
  const btn=$('#chatgptBtn');
  if(btn)btn.disabled=true;
  if(!silent)$('#aiAnswer').textContent='Opening ChatGPT → Studying…';
  try{
    const requestId=`coach-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const res=await chrome.runtime.sendMessage({type:'OPEN_CHATGPT_WITH_PROMPT',prompt,projectName:'Studying',autoSend:true,requestId});
    if(!res?.ok)throw new Error(res?.error||'Could not open ChatGPT');
    if(!silent)$('#aiAnswer').textContent=res.reused
      ? 'ChatGPT is already opening this Coach request…'
      : 'ChatGPT opened. Warrior Hub is placing this chat in Studying…';
  }catch(err){
    if(!silent)$('#aiAnswer').textContent='Could not hand the prompt to ChatGPT automatically. Try again after reloading the extension.';
  }finally{
    setTimeout(()=>{coachLaunchBusy=false;if(btn)btn.disabled=false},2600);
  }
  return prompt;
}


function applyPhaseVisualState(){
  if(!state)return;
  const phase=state.study?.phase==='break'?'break':'work';
  document.body.classList.toggle('phase-break',phase==='break');
  document.body.classList.toggle('phase-focus',phase==='work');
  const video=$('#localBackground');
  if(video&&Math.abs(Number(video.playbackRate||1)-1)>0.001)video.playbackRate=1.0;
}
async function handlePhaseTransition(nextPhase,previous){
  if(!state)return;
  applyPhaseVisualState();
  const label=$('#phaseTransitionLabel'),spotify=$('#spotifyMini');
  if(label)label.textContent=nextPhase==='break'?'BREATHE':'FOCUS';
  document.body.classList.remove('phase-transition');void document.body.offsetWidth;document.body.classList.add('phase-transition');
  spotify?.classList.remove('phase-deep','phase-bright');spotify?.classList.add(nextPhase==='break'?'phase-deep':'phase-bright');
  clearTimeout(phaseFxTimer);phaseFxTimer=setTimeout(()=>{document.body.classList.remove('phase-transition');spotify?.classList.remove('phase-deep','phase-bright');clearSpotifyVisualState()},1900);

  // Clear phase language: airy whoosh at the edge, then a soft arrival cue.
  playPhaseArrivalCue(nextPhase).catch(()=>{});
  if(nextPhase==='break')startBreakStreamAmbience().catch(()=>{}); else stopBreakStreamAmbience(2800);

  // Spotify audio is owned by the side-panel engine. The side panel now owns the
  // phase settle command so the break mix cannot vanish when Study Room is hidden
  // or race a newly-created Spotify media frame. Study Room still owns the boundary cue.

  boundaryWarpStartedEndAt=0;
  scheduleBoundaryWarp();
}

function cancelBoundaryWarp(){
  clearTimeout(boundaryWarpTimer);boundaryWarpTimer=null;
  clearTimeout(boundaryWhooshTimer);boundaryWhooshTimer=null;
  boundaryWarpScheduledEndAt=0;boundaryWarpStartedEndAt=0;
}

function scheduleBoundaryWarp(){
  clearTimeout(boundaryWarpTimer);boundaryWarpTimer=null;
  clearTimeout(boundaryWhooshTimer);boundaryWhooshTimer=null;
  if(!state?.study?.running||!state.study.endAt||state.study.phaseFxEnabled===false)return;
  const endAt=Number(state.study.endAt);
  if(!Number.isFinite(endAt)||endAt<=Date.now())return;
  boundaryWarpScheduledEndAt=endAt;
  const nextPhase=state.study.phase==='break'?'work':'break';
  const warpDelay=endAt-Date.now()-3000;
  const fireWarp=()=>{
    if(!state?.study?.running||Number(state.study.endAt)!==endAt||state.study.phaseFxEnabled===false)return;
    if(spotifyDspBoundaryEndAt===endAt)return;
    spotifyDspBoundaryEndAt=endAt;
    document.body.classList.add('music-boundary-warp');
    pushSpotifyDsp({mode:'boundary',phase:state.study.phase||'work',nextPhase,duration:3}).catch(()=>{});
  };
  if(warpDelay<=60) fireWarp();
  else boundaryWarpTimer=setTimeout(()=>{boundaryWarpTimer=null;fireWarp()},warpDelay);

  const whooshDelay=endAt-Date.now()-720;
  if(whooshDelay<=60){
    if(endAt-Date.now()>80)boundaryWhooshTimer=setTimeout(()=>playAirWhoosh().catch(()=>{}),Math.max(0,endAt-Date.now()-120));
  }else{
    boundaryWhooshTimer=setTimeout(()=>{
      boundaryWhooshTimer=null;
      if(!state?.study?.running||Number(state.study.endAt)!==endAt||state.study.phaseFxEnabled===false)return;
      playAirWhoosh().catch(()=>{});
    },whooshDelay);
  }
}

function maybeStartUpcomingMusicWarp(){
  // Boundary scheduling is handled by scheduleBoundaryWarp(); kept for timer compatibility.
}

async function pushSpotifyDsp(partial={}){
  const enabled=partial.enabled!==undefined?partial.enabled:(state?.study?.phaseFxEnabled!==false);
  const phase=partial.phase||(state?.study?.phase==='break'?'break':'work');
  const payload={
    enabled,
    phase:phase==='break'?'break':'work',
    mode:partial.mode||'steady',
    nextPhase:partial.nextPhase==='break'?'break':partial.nextPhase==='work'?'work':null,
    duration:Number(partial.duration||0.8),
    seq:Date.now()+Math.random(),
  };
  // User volume is a user-owned setting. Phase/FX commands must never overwrite it.
  // Only an explicit volume command may include userVolume.
  if(partial.userVolume!=null&&Number.isFinite(Number(partial.userVolume)))
    payload.userVolume=Math.max(0,Math.min(1,Number(partial.userVolume)));
  await chrome.storage.local.set({[SPOTIFY_DSP_KEY]:payload});
  if(payload.mode==='boundary')setMusicFxStatus('Spotify FX · transition fade + tone drift',true);
  else if(payload.phase==='break'&&payload.enabled)setMusicFxStatus('Spotify FX · break · warm filtered mix',true);
  else if(payload.enabled)setMusicFxStatus('Spotify FX · focus · clean',true);
  else setMusicFxStatus('Spotify FX · bypassed',false);
}

async function resolveCommonsAudioUrl(title){
  if(breakStreamUrlCache[title])return breakStreamUrlCache[title];
  const q=new URLSearchParams({action:'query',format:'json',origin:'*',titles:title,prop:'imageinfo',iiprop:'url|mime'});
  const r=await fetch(`${COMMONS_API}?${q.toString()}`);
  if(!r.ok)throw new Error('Commons audio lookup failed');
  const data=await r.json(),page=Object.values(data?.query?.pages||{})[0],info=page?.imageinfo?.[0];
  const url=normalizeCommonsUrl(info?.url||'');
  if(!url)throw new Error('No stream audio URL');
  breakStreamUrlCache[title]=url;return url;
}
function fadeHtmlAudio(audio,target,duration=2000,after=null){
  if(!audio)return;
  const prev=breakStreamFadeTimers.get(audio);if(prev)clearInterval(prev);
  const start=Number(audio.volume||0),to=Math.max(0,Math.min(1,target)),beg=performance.now(),d=Math.max(80,duration);
  const timer=setInterval(()=>{
    const t=Math.min(1,(performance.now()-beg)/d),e=t*t*(3-2*t);
    try{audio.volume=start+(to-start)*e}catch{}
    if(t>=1){clearInterval(timer);breakStreamFadeTimers.delete(audio);if(after)after()}
  },45);
  breakStreamFadeTimers.set(audio,timer);
}
function chooseBreakStream(extraBlocked=[]){
  const blocked=new Set([...breakStreamRecent.slice(-5),...(extraBlocked||[])]);
  let choices=BREAK_STREAM_FILES.filter(x=>!blocked.has(x.title));if(!choices.length)choices=BREAK_STREAM_FILES.filter(x=>!(extraBlocked||[]).includes(x.title));if(!choices.length)choices=[...BREAK_STREAM_FILES];
  const pick=choices[Math.floor(Math.random()*choices.length)];
  if(pick){breakStreamRecent.push(pick.title);if(breakStreamRecent.length>9)breakStreamRecent.shift()}return pick;
}

function scheduleBreakAmbienceRotation(){
  if(breakAmbienceRotateTimer)clearTimeout(breakAmbienceRotateTimer);
  const delay=120000+Math.floor(Math.random()*90000);
  breakAmbienceRotateTimer=setTimeout(()=>{if(state?.study?.phase==='break')startBreakStreamAmbience(true,true).catch(()=>{})},delay);
}
async function startBreakStreamAmbience(force=false,rotate=false){
  if(breakAmbienceRotateTimer){clearTimeout(breakAmbienceRotateTimer);breakAmbienceRotateTimer=null}
  const token=++breakAmbienceStartToken,old=breakStreamAudio,tried=[];
  for(let attempt=0;attempt<BREAK_STREAM_FILES.length;attempt++){
    if(state?.study?.phase!=='break')return false;
    const pick=chooseBreakStream(tried);if(!pick)break;tried.push(pick.title);lastBreakStreamTitle=pick.title;
    let a=null;
    try{
      const url=await resolveCommonsAudioUrl(pick.title);
      if(token!==breakAmbienceStartToken||state?.study?.phase!=='break')return false;
      a=new Audio(url);a.loop=true;a.preload='auto';a.volume=0;a.playbackRate=1;
      a.addEventListener('loadedmetadata',()=>{try{if(Number.isFinite(a.duration)&&a.duration>30)a.currentTime=Math.min(a.duration-4,Math.random()*Math.max(1,a.duration-8))}catch{}},{once:true});
      await a.play();
      if(token!==breakAmbienceStartToken||state?.study?.phase!=='break'){try{a.pause();a.src=''}catch{};return false}
      // Only retire the old recording AFTER the replacement is audibly playing.
      // A failed Commons file can no longer create a silent break gap.
      if(old&&old!==a)fadeHtmlAudio(old,0,rotate?2600:1200,()=>{try{old.pause();old.src=''}catch{}});
      breakStreamAudio=a;breakAmbiencePlaying=true;phaseCueUntil=Math.max(phaseCueUntil,Date.now()+700);
      const level=.022+Math.random()*.006;fadeHtmlAudio(a,level,rotate?3000:3600);
      const label=$('#breakAmbienceState');if(label)label.textContent=`Water ambience · ${pick.label}`;
      scheduleBreakAmbienceRotation();return true;
    }catch(err){
      try{if(a){a.pause();a.src=''}}catch{}
      debugLog('break-water-source-failed',{title:pick.title,attempt,error:String(err?.message||err)});
    }
  }
  breakAmbiencePlaying=Boolean(old&&!old.paused);
  if(old){breakStreamAudio=old;fadeHtmlAudio(old,.024,900);}
  const label=$('#breakAmbienceState');if(label)label.textContent='Water ambience · retrying another recording…';
  if(state?.study?.phase==='break')breakAmbienceRotateTimer=setTimeout(()=>startBreakStreamAmbience(true,true).catch(()=>{}),1800);
  return false;
}
function stopBreakStreamAmbience(duration=2200){
  if(breakAmbienceRotateTimer){clearTimeout(breakAmbienceRotateTimer);breakAmbienceRotateTimer=null}
  const a=breakStreamAudio;breakStreamAudio=null;breakAmbiencePlaying=false;
  const label=$('#breakAmbienceState');if(label)label.textContent='Water ambience · rotating natural recordings';
  if(!a)return;
  if(duration<=0){const t=breakStreamFadeTimers.get(a);if(t)clearInterval(t);breakStreamFadeTimers.delete(a);try{a.pause();a.src=''}catch{};return}
  fadeHtmlAudio(a,0,duration,()=>{try{a.pause();a.src=''}catch{}});
}

async function ensureCueAudio(){
  try{
    const Ctx=window.AudioContext||window.webkitAudioContext;
    if(!Ctx)return null;
    if(!cueCtx)cueCtx=new Ctx({latencyHint:'interactive'});
    if(cueCtx.state==='suspended')await cueCtx.resume();
    if(!cueNoiseBuffer){
      const len=Math.max(1,Math.floor(cueCtx.sampleRate*1.2));
      cueNoiseBuffer=cueCtx.createBuffer(1,len,cueCtx.sampleRate);
      const data=cueNoiseBuffer.getChannelData(0);
      let smooth=0;
      for(let i=0;i<len;i++){
        const white=Math.random()*2-1;
        smooth=smooth*.72+white*.28;
        data[i]=smooth;
      }
    }
    return cueCtx;
  }catch{return null}
}

async function playAirWhoosh(){
  phaseCueUntil=Math.max(phaseCueUntil,Date.now()+1100);
  const ctx=await ensureCueAudio();if(!ctx||!cueNoiseBuffer)return;
  const now=ctx.currentTime;
  const src=ctx.createBufferSource();src.buffer=cueNoiseBuffer;
  const hp=ctx.createBiquadFilter();hp.type='highpass';hp.frequency.setValueAtTime(180,now);hp.frequency.exponentialRampToValueAtTime(900,now+.58);
  const bp=ctx.createBiquadFilter();bp.type='bandpass';bp.Q.value=.62;bp.frequency.setValueAtTime(720,now);bp.frequency.exponentialRampToValueAtTime(4200,now+.62);
  const g=ctx.createGain();g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime(.16,now+.32);g.gain.exponentialRampToValueAtTime(.0001,now+.82);
  let out=g;
  if(ctx.createStereoPanner){const pan=ctx.createStereoPanner();pan.pan.setValueAtTime(-.55,now);pan.pan.linearRampToValueAtTime(.55,now+.75);g.connect(pan);out=pan}
  src.connect(hp);hp.connect(bp);bp.connect(g);out.connect(ctx.destination);
  src.start(now);src.stop(now+.9);
}

function bellVoice(ctx,freq,start,dur,level=.07,detune=0){
  const o1=ctx.createOscillator(),o2=ctx.createOscillator(),g=ctx.createGain();
  const hp=ctx.createBiquadFilter();hp.type='highpass';hp.frequency.value=180;
  o1.type='sine';o2.type='sine';o1.frequency.value=freq;o2.frequency.value=freq*2.01;o2.detune.value=detune;
  g.gain.setValueAtTime(.0001,start);g.gain.exponentialRampToValueAtTime(level,start+.018);g.gain.exponentialRampToValueAtTime(.0001,start+dur);
  o1.connect(g);o2.connect(g);g.connect(hp);hp.connect(ctx.destination);
  o1.start(start);o2.start(start);o1.stop(start+dur+.05);o2.stop(start+dur+.05);
}

async function playZenBreakCue(){
  const ctx=await ensureCueAudio();if(!ctx)return;
  const variants=[
    [523.25,783.99], // C5 + G5
    [587.33,880.00], // D5 + A5
    [659.25,987.77]  // E5 + B5
  ];
  const pair=variants[cueVariant++%variants.length],now=ctx.currentTime+.025;
  bellVoice(ctx,pair[0],now,2.35,.075,-3);
  bellVoice(ctx,pair[1],now+.16,2.05,.052,3);
  bellVoice(ctx,pair[0]*2,now+.34,1.4,.025,0);
}

async function playFocusArrivalCue(){
  const ctx=await ensureCueAudio();if(!ctx)return;
  const variants=[[659.25,987.77],[698.46,1046.5],[783.99,1174.66]];
  const pair=variants[cueVariant++%variants.length],now=ctx.currentTime+.02;
  bellVoice(ctx,pair[0],now,1.15,.045,-2);
  bellVoice(ctx,pair[1],now+.12,1.35,.055,2);
}

async function playPhaseArrivalCue(nextPhase){
  phaseCueUntil=Math.max(phaseCueUntil,Date.now()+2700);
  if(state?.study?.phaseFxEnabled===false)return;
  if(nextPhase==='break')await playZenBreakCue();
  else await playFocusArrivalCue();
}

async function previewMusicBoundaryWarp(){
  await ensureCueAudio();
  setMusicFxStatus('preview · 3s drift → break mix → return',true);
  await pushSpotifyDsp({mode:'boundary',phase:'work',nextPhase:'break',duration:3});
  setTimeout(()=>playAirWhoosh().catch(()=>{}),2250);
  setTimeout(()=>{
    playPhaseArrivalCue('break').catch(()=>{});
    startBreakStreamAmbience(true).catch(()=>{});
    pushSpotifyDsp({mode:'settle',phase:'break',duration:3}).catch(()=>{});
  },3000);
  setTimeout(()=>{
    stopBreakStreamAmbience(1600);
    pushSpotifyDsp({mode:'boundary',phase:'break',nextPhase:'work',duration:2.2}).catch(()=>{});
  },7600);
  setTimeout(()=>pushSpotifyDsp({mode:'settle',phase:'work',duration:2.4}).catch(()=>{}),9800);
}

async function skipWithTransitionWarp(){
  if(manualSkipLock)return;
  manualSkipLock=true;
  try{
    await ensureCueAudio();
    const next=state?.study?.phase==='break'?'work':'break';
    if(state?.study?.phaseFxEnabled!==false){
      await pushSpotifyDsp({mode:'boundary',phase:state.study?.phase||'work',nextPhase:next,duration:1.6});
      await playAirWhoosh();
    }
    await studyAction('skip');
  }finally{manualSkipLock=false}
}

async function loadVideoPoolCache(){
  try{const got=await chrome.storage.local.get(VIDEO_POOL_KEY);videoPools=got[VIDEO_POOL_KEY]||{}}catch{videoPools={}}
}
async function saveVideoPoolCache(){try{await chrome.storage.local.set({[VIDEO_POOL_KEY]:videoPools})}catch{}}
function normalizeCommonsUrl(url){url=String(url||'');return url.startsWith('//')?'https:'+url:url}
function badVideoTitle(title,theme=''){const s=String(title||'');const common=/advertis|promotional|commercial|sponsor|billboard|watermark|logo|wikipedia|browser|screen ?record|tutorial|presentation|conference|lecture|interview|diagram|news report|television|software|computer|gameplay|demonstration|experiment|trailer|music video|concert|festival|parade|protest|wedding|crowd|tourist|traffic|highway|motorway|train|bus|car |aircraft|airport|ship |boat /i;if(common.test(s))return true;if(theme!=='space'&&/animation|simulation|visuali[sz]ation|render/i.test(s))return true;return false}
function categoryAllowed(theme,title){const cfg=OUTDOOR_THEMES[theme]||OUTDOOR_THEMES.forest;return !cfg.excludeCats?.test(String(title||''))}
async function categoryMembers(category,cmcontinue=null,filesOnly=false){
  const p=new URLSearchParams({action:'query',format:'json',origin:'*',list:'categorymembers',cmtitle:category,cmnamespace:filesOnly?'6':'6|14',cmtype:filesOnly?'file':'file|subcat',cmlimit:'500'});
  if(cmcontinue)p.set('cmcontinue',cmcontinue);
  const r=await fetch(`${COMMONS_API}?${p}`,{cache:'no-store'});if(!r.ok)throw new Error(`Commons ${r.status}`);
  const d=await r.json();return{items:d?.query?.categorymembers||[],next:d?.continue?.cmcontinue||null};
}
async function collectFourKMasterTitles(){
  if(fourKMasterTitles.length>=4000)return fourKMasterTitles;
  if(fourKMasterTitlesPromise)return fourKMasterTitlesPromise;
  fourKMasterTitlesPromise=(async()=>{
    const titles=[];let cont=null,pages=0;
    do{
      const res=await categoryMembers(FOURK_CATEGORY,cont,true);pages++;
      for(const item of res.items){if(item?.ns===6&&item?.title)titles.push(item.title)}
      cont=res.next;
      if(currentVideoTheme&&$('#backgroundState'))$('#backgroundState').textContent=`Indexing Commons 4K catalog · ${titles.length} titles`;
    }while(cont&&pages<14&&titles.length<7000);
    fourKMasterTitles=[...new Set(titles)];
    debugLog('background-4k-master-index',{count:fourKMasterTitles.length,pages});
    return fourKMasterTitles;
  })().finally(()=>{fourKMasterTitlesPromise=null});
  return fourKMasterTitlesPromise;
}
async function collectCategoryFileTitles(theme){
  const cfg=OUTDOOR_THEMES[theme]||OUTDOOR_THEMES.forest,queue=cfg.roots.map(x=>({name:x,depth:0})),seenCats=new Set(),titles=new Set();
  while(queue.length&&titles.size<6000){
    const cur=queue.shift();if(seenCats.has(cur.name)||!categoryAllowed(theme,cur.name))continue;seenCats.add(cur.name);
    let cont=null,pages=0;
    do{
      pages++;let res;try{res=await categoryMembers(cur.name,cont)}catch{break}
      for(const item of res.items){
        if(item.ns===6&&!badVideoTitle(item.title,theme))titles.add(item.title);
        else if(item.ns===14&&cur.depth<3&&categoryAllowed(theme,item.title))queue.push({name:item.title,depth:cur.depth+1});
        if(titles.size>=6000)break;
      }
      cont=res.next;
    }while(cont&&pages<12&&titles.size<6000)
  }
  return [...titles];
}
async function searchCommonsTitles(term,offset){
  const p=new URLSearchParams({action:'query',format:'json',origin:'*',generator:'search',gsrnamespace:'6',gsrlimit:'50',gsrsearch:`incategory:"Video display resolution 3840 x 2160" ${term} -logo -watermark -advertisement -presentation -promo -sponsor`});
  if(offset!==null&&offset!==undefined)p.set('gsroffset',String(offset));
  const r=await fetch(`${COMMONS_API}?${p}`,{cache:'no-store'});if(!r.ok)throw new Error(`Commons ${r.status}`);
  const d=await r.json();return{titles:Object.values(d?.query?.pages||{}).map(x=>x.title).filter(Boolean),next:d?.continue?.gsroffset??null};
}
function cleanCategoryName(title){return String(title||'').replace(/^Category:/i,'').trim()}
function looksLikePromotionalTitle(title='',theme=''){
  const t=String(title||'').replace(/^File:/i,'').replace(/\.[a-z0-9]+$/i,' ').replace(/[_-]+/g,' ');
  const upper=(t.match(/\b[A-Z][A-Z0-9&]{3,}\b/g)||[]).filter(x=>x.length>=4);
  return /\b(presents?|official|promo|promotional|advert|advertisement|sponsor|sponsored|subscribe|follow us|tourism|municipality|gmina|county|city of|travel guide|resort|hotel|revisuals|tigercat|aero mark|gmina|presentation|opening titles?|credits?)\b/i.test(t)
    || /\b(4k\s*intro|stock footage|demo reel)\b/i.test(t)
    || (theme!=='space'&&upper.length>=2);
}
function pickDerivative(vi){
  const original={src:normalizeCommonsUrl(vi?.url),width:Number(vi?.width||0),height:Number(vi?.height||0),size:Number(vi?.size||0),duration:Number(vi?.duration||0),type:String(vi?.mime||'')};
  const playable=x=>/webm|mp4/i.test(String(x?.type||''))||/\.(?:webm|mp4)(?:\?|$)/i.test(String(x?.src||''));
  // Keep actual playback close to UHD. 5K/8K files still count as "4K+" but cost a lot more to decode.
  const smooth4k=x=>x.width>=VIDEO_MIN_WIDTH&&x.height>=VIDEO_MIN_HEIGHT&&x.width<=4096&&x.height<=2304&&x.width/x.height>=1.35&&x.width/x.height<=2.50;
  const ds=(vi?.derivatives||[]).map(d=>({
    src:normalizeCommonsUrl(d.src||d.url),width:Number(d.width||0),height:Number(d.height||0),
    type:String(d.type||d.mime||''),key:String(d.transcodekey||''),size:Number(d.size||0),bandwidth:Number(d.bandwidth||0)
  })).filter(d=>/^https:\/\/upload\.wikimedia\.org\//.test(d.src)&&smooth4k(d)&&playable(d));
  // Hardware-friendly MP4/H.264 first when Commons exposes it, then closest-to-3840 lightweight transcode.
  const codecScore=d=>/mp4|h\.264|h264|avc/i.test(`${d.type} ${d.key}`)?0:/vp9/i.test(`${d.type} ${d.key}`)?1:2;
  ds.sort((a,b)=>codecScore(a)-codecScore(b)||Math.abs(a.width-3840)-Math.abs(b.width-3840)||(a.bandwidth||1e15)-(b.bandwidth||1e15)||(a.size||1e15)-(b.size||1e15));
  if(ds[0])return{url:ds[0].src,width:ds[0].width,height:ds[0].height,quality:'smooth 4K transcode'};
  // Originals are allowed only when they are true UHD-ish and their average bitrate is sane.
  const bitrateMbps=original.duration>0&&original.size>0?(original.size*8/original.duration/1e6):Infinity;
  if(/^https:\/\/upload\.wikimedia\.org\//.test(original.src)&&smooth4k(original)&&playable(original)&&bitrateMbps<=24)
    return{url:original.src,width:original.width,height:original.height,quality:`4K original · ${bitrateMbps.toFixed(1)} Mbps`};
  return null;
}
function videoMatchesTheme(theme,title,categories=[],trustedTheme=false){
  const cfg=OUTDOOR_THEMES[theme]||OUTDOOR_THEMES.forest;
  const hay=`${String(title||'')} ${(categories||[]).join(' ')}`.toLowerCase();
  if(badVideoTitle(title,theme)||looksLikePromotionalTitle(title,theme))return false;
  if(/\b(logo|watermark|intro|outro|presentation|conference|lecture|speech|tutorial|commercial|advert|promo|ui|interface|screenshot|screen recording|subscribe|channel)\b/i.test(hay))return false;
  if(/\b(person|people|portrait|selfie|man|woman|wedding|festival|concert|crowd|car|truck|excavator|tractor|construction)\b/i.test(hay))return false;
  if(cfg.excludeCats&&cfg.excludeCats.test(hay))return false;
  if(theme==='space'&&/(night sky|aurora|milky way|nightscape|star trail|weather|hurricane|storm|climate|sea surface|temperature|satellite map|earth observation|los angeles|geographic map|map of)/.test(hay))return false;
  if(theme==='night'&&/black hole|accretion|nebula|galaxy|exoplanet|solar system|jupiter|saturn|mars|venus|neptune|uranus/.test(hay))return false;
  return trustedTheme?true:(cfg.keywords?cfg.keywords.test(hay):true);
}
async function fetchVideoDetails(titles,theme,requireKeyword=false,trustedTheme=false){
  const cfg=OUTDOOR_THEMES[theme]||OUTDOOR_THEMES.forest,items=[];
  for(let i=0;i<titles.length;i+=40){
    const batch=titles.slice(i,i+40);if(!batch.length)continue;
    const p=new URLSearchParams({action:'query',format:'json',origin:'*',prop:'videoinfo|categories|imageinfo',cllimit:'max',viprop:'url|mime|size|duration|derivatives',iiprop:'extmetadata',titles:batch.join('|')});
    let d;try{const r=await fetch(`${COMMONS_API}?${p}`,{cache:'no-store'});if(!r.ok)continue;d=await r.json()}catch{continue}
    for(const page of Object.values(d?.query?.pages||{})){
      const title=String(page?.title||'').replace(/^File:/,'');
      const categories=(page?.categories||[]).map(x=>cleanCategoryName(x?.title)).filter(Boolean),meta=page?.imageinfo?.[0]?.extmetadata||{},metaText=[meta.ImageDescription?.value,meta.Credit?.value,meta.Artist?.value,meta.Attribution?.value,meta.Categories?.value].filter(Boolean).join(' ').replace(/<[^>]+>/g,' ');
      if(badVideoTitle(title,theme)||(requireKeyword&&!cfg.keywords.test(`${title} ${categories.join(' ')}`)))continue;
      if(!videoMatchesTheme(theme,`${title} ${metaText}`,categories,trustedTheme))continue;
      const vi=page?.videoinfo?.[0];if(Number(vi?.duration||0)<6)continue;const picked=pickDerivative(vi);if(!picked?.url)continue;
      items.push({url:picked.url,width:picked.width,height:picked.height,quality:picked.quality||'4K',source:`https://commons.wikimedia.org/wiki/${encodeURIComponent(String(page.title||'').replace(/ /g,'_'))}`,title,categories});
    }
  }
  return items;
}
function safeUrlPath(path=''){return String(path||'').split('/').map(s=>encodeURIComponent(s)).join('/')}
function mixkitThemeAllowed(theme,text=''){
  const s=String(text||'').replace(/\s+/g,' ').toLowerCase();
  if(!s)return false;
  if(/\b(office|workspace|cowork|business|meeting|person|people|woman|man|girl|boy|couple|family|crowd|concert|festival|tourist|tourists|cyclist|skiers?|city traffic|highway|road trip|car |truck|factory|industrial|construction|crane|port|container|warehouse|shipyard|advert|promo|logo|brand|presentation)\b/i.test(s))return false;
  if(theme==='forest')return /\b(forest|woods|woodland|rainforest|tree|trees|jungle|moss|canopy|pine)\b/i.test(s);
  if(theme==='mountains')return /\b(mountain|mountains|alps|alpine|peak|peaks|ridge|valley|glacier|snowy|canyon)\b/i.test(s);
  if(theme==='coast')return /\b(ocean|sea|beach|coast|coastal|shore|shoreline|waves?|cliff|bay|island)\b/i.test(s);
  if(theme==='water')return /\b(waterfall|river|stream|creek|lake|rapids|cascade|falls)\b/i.test(s);
  if(theme==='night')return /\b(night sky|starry|stars?|milky way|aurora|northern lights|meteor|moon|nightscape)\b/i.test(s)&&!/\b(city|street|traffic|night life|party)\b/i.test(s);
  if(theme==='space')return /\b(galaxy|galaxies|nebula|nebulae|black hole|worm ?hole|planet|planets|jupiter|saturn|mars|venus|neptune|uranus|cosmos|universe|supernova|solar system|deep space|stars in space|cosmic)\b/i.test(s)&&!/\b(office space|room space|workspace|aurora|night sky|city|weather|satellite map|earth observation)\b/i.test(s);
  return false;
}
function mixkitPageUrl(slug,page=1){return `${MIXKIT_BASE}/free-stock-video/${encodeURIComponent(slug)}/?resolution=4k&page=${Math.max(1,Number(page)||1)}`}
function decodeHtmlUrl(s=''){return String(s||'').replace(/\\u002F/gi,'/').replace(/\\\//g,'/').replace(/&amp;/g,'&').replace(/&#x2F;/gi,'/').replace(/&#47;/g,'/')}
async function probeVideo4K(url,timeoutMs=6500){
  return new Promise(resolve=>{
    const v=document.createElement('video');let done=false;
    const finish=value=>{if(done)return;done=true;clearTimeout(timer);try{v.pause();v.removeAttribute('src');v.load();v.remove()}catch{}resolve(value)};
    const timer=setTimeout(()=>finish(null),timeoutMs);
    v.preload='metadata';v.muted=true;v.playsInline=true;
    v.onloadedmetadata=()=>{const w=Number(v.videoWidth||0),h=Number(v.videoHeight||0),duration=Number(v.duration||0),aspect=h?w/h:0;finish(w>=VIDEO_MIN_WIDTH&&h>=VIDEO_MIN_HEIGHT&&w<=4096&&h<=2304&&duration>=6&&aspect>=1.35&&aspect<=2.5?{width:w,height:h,duration}:null)};
    v.onerror=()=>finish(null);v.src=url;
  });
}
async function mixkitDetailCandidate(theme,detailUrl){
  let html='';try{const r=await fetch(detailUrl,{cache:'no-store'});if(!r.ok)return null;html=await r.text()}catch{return null}
  const doc=new DOMParser().parseFromString(html,'text/html'),plain=String(doc.body?.textContent||'').replace(/\s+/g,' '),title=String(doc.querySelector('h1')?.textContent||'').trim();
  const desc=String(doc.querySelector('meta[name="description"]')?.content||doc.querySelector('meta[property="og:description"]')?.content||'').trim();
  if(!mixkitThemeAllowed(theme,`${title} ${desc}`))return null;
  // Do not hot-link premium-only 4K assets. We only accept pages that advertise a free 4K download,
  // or public 4K sources whose actual metadata independently verifies 3840x2160+.
  const premiumOnly=/Premium Download\s*-\s*4K Version/i.test(plain)&&!/Free Download\s*-\s*(?:4K|2160)/i.test(plain);
  const candidates=[];
  for(const el of doc.querySelectorAll('video[src],video source[src],a[href]')){
    const raw=el.getAttribute('src')||el.getAttribute('href')||'';if(!/\.(?:mp4|webm)(?:\?|$)/i.test(raw))continue;
    try{const u=new URL(raw,detailUrl).href;if(/^https:\/\/assets\.mixkit\.co\//.test(u))candidates.push(u)}catch{}
  }
  const normalizedHtml=decodeHtmlUrl(html);
  for(const m of normalizedHtml.matchAll(/https:\/\/assets\.mixkit\.co\/[^"'<>\s]+?\.(?:mp4|webm)(?:\?[^"'<>\s]*)?/gi)){
    const u=m[0];if(/^https:\/\/assets\.mixkit\.co\//.test(u))candidates.push(u)
  }
  const unique=[...new Set(candidates)].sort((a,b)=>(/4k|2160|large/i.test(b)?1:0)-(/4k|2160|large/i.test(a)?1:0));
  for(const url of unique.slice(0,4)){
    const meta=await probeVideo4K(url);if(!meta)continue;
    if(premiumOnly&&!/free|preview/i.test(url))continue;
    return{url,width:meta.width,height:meta.height,duration:meta.duration,quality:`Mixkit ${meta.width}×${meta.height}`,source:detailUrl,title:title||'Mixkit 4K footage',provider:'Mixkit'};
  }
  return null;
}
async function mixkitListingDetails(theme,slug,page=1){
  const url=mixkitPageUrl(slug,page);let html='';try{const r=await fetch(url,{cache:'no-store'});if(!r.ok)return[];html=await r.text()}catch{return[]}
  const doc=new DOMParser().parseFromString(html,'text/html'),out=[];
  for(const a of doc.querySelectorAll('a[href]')){
    const href=String(a.getAttribute('href')||'');if(!/^\/free-stock-video\/[a-z0-9-]+-\d+\/?$/i.test(href))continue;
    const txt=String(a.textContent||a.getAttribute('title')||'').replace(/\s+/g,' ').trim();
    if(!mixkitThemeAllowed(theme,txt))continue;
    try{out.push(new URL(href,MIXKIT_BASE).href)}catch{}
  }
  return[...new Set(out)];
}
async function fetchMixkitThemeBatch(theme,{pages=2,maxItems=24}={}){
  const cfg=OUTDOOR_THEMES[theme]||OUTDOOR_THEMES.forest,out=[],seen=new Set();
  for(const slug of cfg.mixkitSlugs||[]){
    for(let page=1;page<=pages&&out.length<maxItems;page++){
      const details=await mixkitListingDetails(theme,slug,page);
      for(let i=0;i<details.length&&out.length<maxItems;i+=3){
        const batch=await Promise.all(details.slice(i,i+3).map(u=>mixkitDetailCandidate(theme,u).catch(()=>null)));
        for(const item of batch.filter(Boolean)){if(!seen.has(item.url)){seen.add(item.url);out.push(item);if(out.length>=maxItems)break}}
      }
    }
    if(out.length>=maxItems)break;
  }
  return out;
}
function nasaPageLooksScenic(page={}){
  const hay=`${page.title||''} ${page.description||''}`.toLowerCase();
  if(/interview|press conference|news conference|talk|lecture|podcast|5 things|explainer|mission update|launch coverage|logo|promo/.test(hay))return false;
  if(/weather|hurricane|climate|sea surface|temperature|emissions|city|los angeles|map of/.test(hay))return false;
  return /black hole|jupiter|saturn|mars|venus|mercury|neptune|uranus|planet|galaxy|nebula|supernova|star|solar|sun|exoplanet|cosmos|universe|accretion|deep space|webb/.test(hay);
}
function nasaMoviesFromPage(page={}){
  if(!nasaPageLooksScenic(page))return[];
  const found=[];
  const walk=o=>{
    if(!o)return;
    if(Array.isArray(o)){for(const x of o)walk(x);return}
    if(typeof o!=='object')return;
    const media=o.media&&typeof o.media==='object'?o.media:o.instance&&typeof o.instance==='object'?o.instance:o;
    if(String(media.media_type||'').toLowerCase()==='movie'){
      const url=String(media.url||''),w=Number(media.width||0),h=Number(media.height||0),file=String(media.filename||url);
      const aspect=h?w/h:0;
      if(/^https:\/\/svs\.gsfc\.nasa\.gov\//.test(url)&&/\.(?:webm|mp4)(?:\?|$)/i.test(url)&&w>=2160&&h>=2160&&Math.max(w,h)>=3840&&aspect>=0.95&&aspect<=2.6&&!/prores|caption|vertical|9x16|portrait|60p|60fps|_60(?:\b|_)/i.test(file)){
        found.push({url,width:w,height:h,quality:`NASA ${w}×${h}`,source:String(page.url||`https://svs.gsfc.nasa.gov/${page.id||''}/`),title:String(page.title||file),provider:'NASA SVS',file});
      }
    }
    for(const [k,v] of Object.entries(o)){if(k!=='media'&&k!=='instance')walk(v)}
  };
  walk(page.main_video);walk(page.media_groups);
  const seen=new Set(),dedup=[];
  found.sort((a,b)=>(/\.mp4(?:\?|$)/i.test(a.file)?-1:0)-(/\.mp4(?:\?|$)/i.test(b.file)?-1:0)||Math.abs((a.width/a.height)-16/9)-Math.abs((b.width/b.height)-16/9));
  for(const x of found){
    const stem=String(x.file||'').toLowerCase().replace(/\.(webm|mp4).*$/,'').replace(/(?:_youtube)?_(?:4k|2160p?|3840x2160|30p|60p|24p)/g,'').replace(/[^a-z0-9]+/g,'');
    if(seen.has(stem))continue;seen.add(stem);dedup.push(x);if(dedup.length>=5)break;
  }
  return dedup;
}
async function nasaSvsSearch(term,limit=36){
  const p=new URLSearchParams({search:term,limit:String(limit)}),r=await fetch(`${NASA_SVS_API}/search/?${p}`,{cache:'no-store'});if(!r.ok)throw new Error(`NASA SVS search ${r.status}`);return r.json();
}
async function nasaSvsPage(id){const r=await fetch(`${NASA_SVS_API}/${encodeURIComponent(id)}/`,{cache:'no-store'});if(!r.ok)throw new Error(`NASA SVS page ${r.status}`);return r.json()}
async function fetchNasaSpaceBatch(term,limit=36,maxPages=18){
  const sr=await nasaSvsSearch(term,limit),results=(sr?.results||[]).filter(x=>x?.id&&nasaPageLooksScenic(x));
  for(let i=results.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[results[i],results[j]]=[results[j],results[i]]}
  const out=[];
  for(let i=0;i<Math.min(results.length,maxPages);i+=4){
    const pages=await Promise.all(results.slice(i,i+4).map(x=>nasaSvsPage(x.id).catch(()=>null)));
    for(const page of pages.filter(Boolean))out.push(...nasaMoviesFromPage(page));
    if(out.length>=24)break;
  }
  return out;
}
async function archiveSearch(term,rows=24,page=1){
  const q=`mediatype:movies AND (${term}) AND (title:4k OR title:2160 OR description:4k OR description:2160)`;
  const p=new URLSearchParams({q,fl:'identifier,title,description',rows:String(rows),page:String(page),output:'json',sort:'downloads desc'});
  const r=await fetch(`${ARCHIVE_API}/advancedsearch.php?${p}`,{cache:'no-store'});if(!r.ok)throw new Error(`Archive search ${r.status}`);return r.json();
}
async function archiveMetadata(identifier){const r=await fetch(`${ARCHIVE_API}/metadata/${encodeURIComponent(identifier)}`,{cache:'no-store'});if(!r.ok)throw new Error(`Archive metadata ${r.status}`);return r.json()}
function archiveMoviesFromItem(theme,item={}){
  const cfg=OUTDOOR_THEMES[theme]||OUTDOOR_THEMES.forest,title=String(item?.metadata?.title||item?.metadata?.identifier||''),id=String(item?.metadata?.identifier||'');
  if(!id||badVideoTitle(title,theme)||!cfg.keywords?.test(`${title} ${item?.metadata?.description||''}`))return[];
  const choices=(item.files||[]).map(f=>({f,w:Number(f.width||0),h:Number(f.height||0),len:Number(f.length||0),size:Number(f.size||0)}))
    .filter(x=>x.w>=VIDEO_MIN_WIDTH&&x.h>=VIDEO_MIN_HEIGHT&&x.len>=6&&/\.(?:mp4|webm)$/i.test(String(x.f?.name||''))&&!badVideoTitle(String(x.f?.name||''),theme));
  choices.sort((a,b)=>(/webm$/i.test(a.f.name)?-1:0)-(/webm$/i.test(b.f.name)?-1:0)||a.size-b.size);
  const out=[];for(const x of choices.slice(0,2))out.push({url:`https://archive.org/download/${encodeURIComponent(id)}/${safeUrlPath(x.f.name)}`,width:x.w,height:x.h,quality:`Archive ${x.w}×${x.h}`,source:`https://archive.org/details/${encodeURIComponent(id)}`,title:`${title} — ${x.f.name}`,provider:'Internet Archive'});return out;
}
async function fetchArchiveThemeBatch(theme,term,rows=24){
  const sr=await archiveSearch(term,rows,1),docs=sr?.response?.docs||[],out=[];
  for(let i=0;i<docs.length;i+=4){const metas=await Promise.all(docs.slice(i,i+4).map(d=>archiveMetadata(d.identifier).catch(()=>null)));for(const m of metas.filter(Boolean))out.push(...archiveMoviesFromItem(theme,m));if(out.length>=24)break}return out;
}
async function fillThemeFromFourKMaster(theme,pool,seen){
  const cfg=OUTDOOR_THEMES[theme]||OUTDOOR_THEMES.forest;
  const master=await collectFourKMasterTitles();
  // Titles with an obvious theme word first; then a randomized full 4K scan so files
  // whose useful signal only lives in Commons categories/metadata are still found.
  const preferred=master.filter(t=>cfg.keywords?.test(String(t||''))&&!badVideoTitle(t,theme));
  const rest=master.filter(t=>!preferred.includes(t));
  for(let i=rest.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[rest[i],rest[j]]=[rest[j],rest[i]]}
  const ordered=[...preferred,...rest];
  let scanned=0;
  for(let i=0;i<ordered.length&&pool.length<POOL_TARGET;i+=40){
    const batch=ordered.slice(i,i+40).filter(t=>!seen.has(`title:${t}`));
    for(const t of batch)seen.add(`title:${t}`);
    if(!batch.length)continue;
    let found=[];try{found=await fetchVideoDetails(batch,theme,false)}catch(e){debugLog('background-4k-master-batch-error',{theme,error:String(e?.message||e)});continue}
    scanned+=batch.length;
    for(const x of found){if(x?.url&&!seen.has(x.url)){seen.add(x.url);pool.push(x);if(pool.length>=POOL_TARGET)break}}
    videoPools[theme]={items:pool.slice(0,POOL_TARGET),updatedAt:Date.now(),curated:true,quality:'4K+'};await saveVideoPoolCache();
    if(theme===currentVideoTheme&&$('#backgroundState'))$('#backgroundState').textContent=`${cfg.label} · ${pool.length}/${MIN_SCENE_GOAL} verified 4K${pool.length>=MIN_SCENE_GOAL?' ✓':''}`;
    if(pool.length>=MIN_SCENE_GOAL&&scanned>=240)break;
  }
  debugLog('background-4k-master-scan',{theme,scanned,accepted:pool.length});
  return pool;
}
function scheduleThemeEnrichment(theme,delay=28000){
  clearTimeout(sceneEnrichTimer);
  sceneEnrichTimer=setTimeout(()=>{
    sceneEnrichTimer=null;
    if(theme!==currentVideoTheme||document.hidden||videoPoolBuilds[theme])return;
    enrichThemePool(theme).catch(e=>debugLog('background-enrich-error',{theme,error:String(e?.message||e)}));
  },Math.max(8000,Number(delay)||28000));
}
async function enrichThemePool(theme){
  if(videoPoolBuilds[theme])return videoPoolBuilds[theme];
  const cfg=OUTDOOR_THEMES[theme]||OUTDOOR_THEMES.forest;
  videoPoolBuilds[theme]=(async()=>{
    const existing=Array.isArray(videoPools?.[theme]?.items)?videoPools[theme].items:[];
    const seen=new Set(existing.map(x=>x?.url).filter(Boolean)),pool=[...existing];
    const passGoal=Math.min(POOL_TARGET,existing.length+6);
    const add=async list=>{
      for(const x of list||[]){if(x?.url&&!seen.has(x.url)){seen.add(x.url);pool.push(x);if(pool.length>=passGoal)break}}
      videoPools[theme]={items:pool.slice(0,POOL_TARGET),updatedAt:Date.now(),curated:true,quality:'4K+',multiSource:true};await saveVideoPoolCache();
      if(theme===currentVideoTheme&&$('#backgroundState'))$('#backgroundState').textContent=`${cfg.label} · ${pool.length} clips${pool.length<MIN_SCENE_GOAL?` · growing quietly`:' ✓'}`;
    };
    try{
      const need=Math.max(1,passGoal-pool.length);
      try{await add(await fetchMixkitThemeBatch(theme,{pages:1,maxItems:Math.min(need,6)}))}catch(e){debugLog('background-mixkit-error',{theme,error:String(e?.message||e)})}
      if(theme==='space'&&pool.length<passGoal){
        for(const term of (cfg.nasaTerms||[]).slice(0,2)){
          if(pool.length>=passGoal)break;
          try{await add(await fetchNasaSpaceBatch(term,8,2))}catch(e){debugLog('background-nasa-svs-error',{term,error:String(e?.message||e)})}
        }
      }
      if(pool.length<passGoal&&cfg.seeds?.length)try{await add(await fetchVideoDetails(cfg.seeds.slice(0,6),theme,false))}catch(_){ }
      if(pool.length<passGoal){
        for(const term of (cfg.fallback||[]).slice(0,2)){
          if(pool.length>=passGoal)break;
          try{const r=await searchCommonsTitles(term,null);await add(await fetchVideoDetails(r.titles.slice(0,20),theme,false))}catch(_){ }
        }
      }
      videoPools[theme]={items:pool.slice(0,POOL_TARGET),updatedAt:Date.now(),curated:true,quality:'4K+',multiSource:true};await saveVideoPoolCache();
      debugLog('background-4k-pool-pass',{theme,before:existing.length,after:pool.length,passGoal,target:POOL_TARGET,sources:[...new Set(pool.map(x=>x.provider||'Wikimedia Commons'))]});
      return videoPools[theme].items;
    }finally{
      delete videoPoolBuilds[theme];
      if(theme===currentVideoTheme&&pool.length<POOL_TARGET)scheduleThemeEnrichment(theme,90000);
    }
  })();
  return videoPoolBuilds[theme];
}
async function primeThemePool(theme){
  const cfg=OUTDOOR_THEMES[theme]||OUTDOOR_THEMES.forest;
  let first=[];
  try{first=await fetchMixkitThemeBatch(theme,{pages:2,maxItems:12})}catch{}
  if(!first.length&&theme==='space'){
    for(const term of ['black hole','Jupiter','nebula']){try{first=await fetchNasaSpaceBatch(term,14,5)}catch{}if(first.length)break}
  }
  if(!first.length&&cfg.seeds?.length)try{first=await fetchVideoDetails(cfg.seeds,theme,false)}catch{}
  if(first.length){videoPools[theme]={items:first.slice(0,POOL_TARGET),updatedAt:Date.now(),curated:true,quality:'4K+',multiSource:true};await saveVideoPoolCache()}
  return first.slice(0,POOL_TARGET);
}
async function ensureThemePool(theme){
  const cfg=OUTDOOR_THEMES[theme]||OUTDOOR_THEMES.forest;
  let existing=Array.isArray(videoPools?.[theme]?.items)?videoPools[theme].items:[];
  if(existing.length){if(existing.length<POOL_TARGET&&!videoPoolBuilds[theme])scheduleThemeEnrichment(theme,30000);return existing.slice(0,POOL_TARGET)}
  if($('#backgroundState'))$('#backgroundState').textContent=`${cfg.label} · finding first clean 4K clip…`;
  if($('#backgroundHelp'))$('#backgroundHelp').textContent='Playback starts as soon as one verified 4K clip is available; the bank keeps growing in the background.';
  existing=await primeThemePool(theme);
  if(existing.length<POOL_TARGET&&!videoPoolBuilds[theme])scheduleThemeEnrichment(theme,30000);
  return existing;
}
function chooseNextVideo(theme,pool){
  if(!pool.length)return null;if(pool.length===1)return pool[0];
  const recent=Array.isArray(videoRecentByTheme[theme])?videoRecentByTheme[theme]:[];
  const rejected=new Set(Array.isArray(videoRejectedUrlsByTheme[theme])?videoRejectedUrlsByTheme[theme]:[]);
  let candidates=pool.filter(x=>x?.url&&x.url!==currentVideoUrl&&!recent.includes(x.url)&&!rejected.has(x.url));
  if(!candidates.length)candidates=pool.filter(x=>x?.url&&x.url!==currentVideoUrl&&!rejected.has(x.url));
  if(!candidates.length)candidates=pool.filter(x=>x?.url&&!rejected.has(x.url));
  const c=candidates[Math.floor(Math.random()*candidates.length)]||pool[Math.floor(Math.random()*pool.length)]||null;
  if(c?.url){const next=[...recent.filter(x=>x!==c.url),c.url];while(next.length>14)next.shift();videoRecentByTheme[theme]=next}
  return c
}
async function warmAllSceneBanks(){ /* disabled: build only the active scene bank */ }
function scheduleSceneRotation(delay=SCENE_ROTATE_MS){
  clearTimeout(sceneRotationTimer);
  sceneRotationTimer=setTimeout(()=>{
    if(document.hidden){scheduleSceneRotation(60000);return}
    playNextThemeVideo(false).catch(()=>scheduleSceneRotation(60000));
  },Math.max(1000,Number(delay)||SCENE_ROTATE_MS));
}
async function setVideoTheme(theme,save=true){
  theme=LEGACY_THEME_MAP[theme]||theme;if(!OUTDOOR_THEMES[theme])theme='forest';currentVideoTheme=theme;document.body.dataset.scene=(theme==='night'||theme==='space')?'space':theme;const token=++videoLoadToken;
  $$('.theme').forEach(b=>b.classList.toggle('active',b.dataset.video===theme));if(save)await updateStudy({videoTheme:theme});
  clearTimeout(backgroundRetryTimer);
  let pool=[];
  try{pool=await ensureThemePool(theme)}catch(e){debugLog('background-pool-error',{theme,error:String(e?.message||e)});}
  if(token!==videoLoadToken||theme!==currentVideoTheme)return;
  if(pool.length){await playVideoFromPool(theme,pool,false);return}
  const video=$('#localBackground');video?.classList.remove('active');
  const cfg=OUTDOOR_THEMES[theme]||OUTDOOR_THEMES.forest;
  if($('#backgroundState'))$('#backgroundState').textContent=`${cfg.label} · reconnecting footage…`;
  // Keep the CSS scene visible, then retry quietly. A network hiccup must not blank the room.
  backgroundRetryTimer=setTimeout(()=>{if(theme===currentVideoTheme&&!document.hidden)setVideoTheme(theme,false).catch(()=>{})},5000);
}
function stopScenePerformanceMonitor(){if(scenePerformanceTimer){clearInterval(scenePerformanceTimer);scenePerformanceTimer=null}}
function startScenePerformanceMonitor(video,theme,item){
  stopScenePerformanceMonitor();
  if(!video||typeof video.getVideoPlaybackQuality!=='function')return;
  const initial=video.getVideoPlaybackQuality();
  let lastTotal=Number(initial?.totalVideoFrames||0),lastDropped=Number(initial?.droppedVideoFrames||0),badWindows=0,checks=0;
  scenePerformanceTimer=setInterval(()=>{
    if(document.hidden||video!==$('#localBackground')||video.paused||video.readyState<2)return;
    const q=video.getVideoPlaybackQuality(),total=Number(q?.totalVideoFrames||0),dropped=Number(q?.droppedVideoFrames||0);
    const dt=Math.max(0,total-lastTotal),dd=Math.max(0,dropped-lastDropped);lastTotal=total;lastDropped=dropped;checks++;
    if(dt<24)return;
    const ratio=dd/dt;
    if(ratio>=0.045&&dd>=3)badWindows++;else badWindows=Math.max(0,badWindows-1);
    if(badWindows>=1&&checks>=1){
      stopScenePerformanceMonitor();
      const prev=Array.isArray(videoRejectedUrlsByTheme[theme])?videoRejectedUrlsByTheme[theme]:[];
      videoRejectedUrlsByTheme[theme]=[...prev.filter(x=>x!==item.url),item.url].slice(-30);
      debugLog('background-heavy-4k-skipped',{theme,url:item.url,dropped:dd,total:dt,ratio:Number(ratio.toFixed(3)),provider:item.provider||'Wikimedia Commons'});
      if(theme===currentVideoTheme)playNextThemeVideo(false).catch(()=>{});
    }
  },4000);
}
async function playVideoFromPool(theme,pool,manual){
  const cfg=OUTDOOR_THEMES[theme]||OUTDOOR_THEMES.forest,video=$('#localBackground'),item=chooseNextVideo(theme,pool||[]);
  if(!item){video.classList.remove('active');$('#backgroundState').textContent=`${cfg.label} · no curated clips`;$('#backgroundHelp').textContent='No suitable landscape video was found yet. Check internet access or try another scene.';return}
  stopScenePerformanceMonitor();currentVideoUrl=item.url;video.classList.remove('active');video.pause();video.onerror=null;video.oncanplay=null;video.onplaying=null;video.onended=null;
  video.src=item.url;video.muted=true;video.loop=true;video.playsInline=true;video.preload='auto';video.playbackRate=1.0;video.defaultPlaybackRate=1.0;try{video.disablePictureInPicture=true}catch{}video.load();
  const poolSize=(videoPools?.[theme]?.items||pool||[]).length;
  let activated=false;const activate=()=>{if(!activated){activated=true;startScenePerformanceMonitor(video,theme,item)}const provider=item.provider||'Wikimedia Commons';video.classList.add('active');$('#backgroundState').textContent=`${cfg.label} · ${poolSize} clips · ${provider}`;$('#backgroundHelp').innerHTML=`Smooth UHD playback · auto-randomizes every 10 min. ${item.width||''}${item.width?'×':''}${item.height||''} · ${provider} · <a href="${item.source}" target="_blank" rel="noreferrer">source ↗</a>`;scheduleSceneRotation()};
  const fail=()=>{
    if(item?.url){const prev=Array.isArray(videoRejectedUrlsByTheme[theme])?videoRejectedUrlsByTheme[theme]:[];const next=[...prev.filter(x=>x!==item.url),item.url];while(next.length>20)next.shift();videoRejectedUrlsByTheme[theme]=next}
    video.classList.remove('active');$('#backgroundState').textContent=`${cfg.label} · skipping clip`;setTimeout(()=>{if(theme===currentVideoTheme)playNextThemeVideo(false)},450)};
  video.oncanplay=activate;video.onplaying=activate;video.onerror=fail;video.onended=null;
  if(document.hidden){$('#backgroundState').textContent=`${cfg.label} · paused while hidden`;return}
  try{await video.play();activate()}catch{try{await new Promise(r=>setTimeout(r,700));if(document.hidden)return;await video.play();activate()}catch{fail()}}
}
function syncBackgroundVideoVisibility(){
  const video=$('#localBackground');if(!video)return;
  if(document.hidden){if(!video.paused)video.pause();return}
  if(video.src&&video.paused&&!video.ended){video.playbackRate=1.0;video.play().catch(()=>{});if(!sceneRotationTimer)scheduleSceneRotation()}
  else if(!video.src){setVideoTheme(currentVideoTheme||'forest',false).catch(()=>{})}
}
async function playNextThemeVideo(manual=true){const theme=currentVideoTheme||'forest',pool=await ensureThemePool(theme);await playVideoFromPool(theme,pool,manual)}

function paintSpotifyVolumeRange(slider,pct){if(!slider)return;const p=Math.max(0,Math.min(100,Number(pct)||0));slider.style.setProperty('--range-pct',`${p}%`);slider.setAttribute('aria-valuenow',String(Math.round(p)));}
function renderSpotifyControls(){
  const slider=$('#spotifyVolume');if(slider){const p=Math.round(spotifyVolume*100);slider.value=String(p);paintSpotifyVolumeRange(slider,p)}
  const val=$('#spotifyVolumeValue');if(val)val.textContent=`${Math.round(spotifyVolume*100)}%`;
  const shuffle=$('#spotifyShuffleBtn');
  if(shuffle){
    const on=Boolean(spotifyPlayerState?.shuffleOn??spotifyShuffleState);
    const scanning=Boolean(spotifyPlayerState?.scanningQueue);
    spotifyShuffleState=on;spotifyShuffleMode='warrior';spotifyShuffleAvailable=true;
    shuffle.classList.toggle('active',on);shuffle.classList.remove('unknown');shuffle.classList.toggle('pending',spotifyShufflePending||scanning);
    shuffle.setAttribute('aria-pressed',on?'true':'false');
    const queue=Number(spotifyPlayerState?.queueSize||0);
    shuffle.textContent=on?(scanning?'🔀 Shuffle · BUILDING…':`🔀 Shuffle · ON${queue?` · ${queue}`:''}`):'🔀 Shuffle · OFF';
    shuffle.title=on?'Warrior Hub owns the random order. Spotify native shuffle is kept off to avoid queue conflicts.':'Turn on Warrior-managed shuffle.';
  }
  const status=$('#spotifyUiState');if(status){const q=Number(spotifyPlayerState?.queueSize||0),complete=spotifyPlayerState?.catalogComplete===true,err=String(spotifyPlayerState?.catalogError||'');status.textContent=err?'Playlist catalog unavailable':q?(complete?`${q} tracks ready`:`${q} tracks loaded`):'Loading playlist…'}
}
function spotifyUiTime(sec){const s=Math.max(0,Math.floor(Number(sec)||0)),m=Math.floor(s/60);return`${m}:${String(s%60).padStart(2,'0')}`}
function renderSpotifyMiniCustom(){
  const t=spotifyPlayerState||{};const art=$('#spotifyMiniTrackArt'),title=$('#spotifyMiniTitle'),artist=$('#spotifyMiniArtist');
  const artwork=String(t.artwork||'').trim();if(art){art.textContent=artwork?'':'♫';art.style.backgroundImage=artwork?`url(${JSON.stringify(artwork).slice(1,-1)})`:'none';}studyUpdateSpotifyThemeFromState(t,false).catch(()=>{});
  if(title){const txt=String(t.title||'').trim()||(t.trackId?'Spotify track':'Starting Spotify…');title.textContent=txt;title.title=txt}if(artist){const txt=String(t.artist||'').trim()||(t.catalogError?'Metadata unavailable':'Spotify');artist.textContent=txt;artist.title=txt}
  const duration=Math.max(0,Number(t.duration)||0),base=Math.max(0,Number(t.position)||0),stamp=Number(t.at)||Date.now(),pos=duration?Math.min(duration,base+(t.playing?Math.max(0,Date.now()-stamp)/1000:0)):base;
  const pct=duration?Math.max(0,Math.min(100,pos/duration*100)):0;const fill=$('#spotifyMiniProgressFill');if(fill)fill.style.width=`${pct}%`;
  const elapsed=$('#spotifyMiniElapsed'),remaining=$('#spotifyMiniRemaining');if(elapsed)elapsed.textContent=spotifyUiTime(pos);if(remaining)remaining.textContent=`−${spotifyUiTime(Math.max(0,duration-pos))}`;
  const toggle=$('#spotifyMiniToggle');if(toggle){toggle.textContent=t.playing?'Ⅱ':'▶';toggle.title=t.playing?'Pause':'Play';toggle.setAttribute('aria-label',toggle.title);}
  const shuffle=$('#spotifyMiniShuffle');if(shuffle){const on=Boolean(t.shuffleOn);shuffle.classList.toggle('active',on);shuffle.setAttribute('aria-pressed',String(on));shuffle.textContent=on?'🔀 ON':'🔀';shuffle.title=on?'Shuffle on':'Shuffle off';}
  const miniVol=$('#spotifyMiniVolume'),miniVolValue=$('#spotifyMiniVolumeValue'),vp=Math.round(spotifyVolume*100);if(miniVol&&document.activeElement!==miniVol)miniVol.value=String(vp);paintSpotifyVolumeRange(miniVol,vp);if(miniVolValue)miniVolValue.textContent=`${vp}%`;
  const pArt=$('#spotifyPanelArt'),pTitle=$('#spotifyPanelTitle'),pArtist=$('#spotifyPanelArtist'),pFill=$('#spotifyPanelProgressFill'),pElapsed=$('#spotifyPanelElapsed'),pRemaining=$('#spotifyPanelRemaining'),pToggle=$('#spotifyPanelToggle');
  if(pArt){pArt.textContent=artwork?'':'♫';pArt.style.backgroundImage=artwork?`url(${JSON.stringify(artwork).slice(1,-1)})`:'none'}
  if(pTitle){const txt=String(t.title||'').trim()||(t.trackId?'Spotify track':'Starting Spotify…');pTitle.textContent=txt;pTitle.title=txt}
  if(pArtist){const txt=String(t.artist||'').trim()||(t.catalogError?'Metadata unavailable':'Spotify');pArtist.textContent=txt;pArtist.title=txt}
  if(pFill)pFill.style.width=`${pct}%`;if(pElapsed)pElapsed.textContent=spotifyUiTime(pos);if(pRemaining)pRemaining.textContent=`−${spotifyUiTime(Math.max(0,duration-pos))}`;
  if(pToggle){pToggle.textContent=t.playing?'Ⅱ':'▶';pToggle.title=t.playing?'Pause':'Play';pToggle.setAttribute('aria-label',pToggle.title)}
}
function spotifyFrameWindow(){return $('#spotifyFrame')?.contentWindow||null}
function spotifyHostPost(action,extra={}){
  const command={action,...extra,seq:extra.seq||`engine-${Date.now()}-${Math.random()}`};
  debugLog('spotify-host-command',{command,engine:'sidepanel'});
  chrome.runtime.sendMessage({type:'SPOTIFY_ENGINE_COMMAND',command}).then(r=>{if(r?.ok===false)debugLog('spotify-engine-command-rejected',{command})}).catch(e=>debugLog('spotify-engine-command-error',{command,error:String(e?.message||e)}));
  return true
}
function spotifyTrackIdFromUri(uri){const m=String(uri||'').match(/spotify:track:([A-Za-z0-9]+)/i)||String(uri||'').match(/\/track\/([A-Za-z0-9]+)/i);return m?m[1]:''}
function spotifyCatalogRow(index){return Number.isInteger(Number(index))?spotifyQueueCatalog[Number(index)]||null:null}
function spotifyIndexForTrack(trackId){const id=String(trackId||'').trim();if(!id)return-1;return spotifyQueueCatalog.findIndex(t=>String(t?.id||'')===id)}
function spotifyUiMeta(index,trackId=''){
  const row=spotifyCatalogRow(index)||(trackId?spotifyQueueCatalog.find(t=>String(t?.id||'')===String(trackId)):null);
  return{title:String(row?.title||'').trim(),artist:String(row?.artist||'').trim(),artwork:String(row?.artwork||'').trim()}
}
function estimatedSpotifyPosition(s=spotifyPlayerState){
  if(!s)return 0;const base=Math.max(0,Number(s.position)||0),dur=Math.max(0,Number(s.duration)||0);
  // Never invent progress for a fresh entity. Spotify sometimes says isPaused:false
  // while its media is still stuck at 0:00; extrapolating that state created the
  // visible 3-second climb -> snap-to-zero loop in the mini-player.
  if(s.playing!==true||s.progressConfirmed!==true||!s.at)return dur?Math.min(dur,base):base;
  const rate=1;
  const pos=base+Math.max(0,Date.now()-Number(s.at))/1000*rate;return dur?Math.min(dur,pos):pos
}
function makeSpotifyState(patch={},reason='state'){
  const prev=spotifyPlayerState||{};
  const trackId=String(patch.trackId??prev.trackId??'').trim();
  let index=Number.isInteger(Number(patch.currentIndex))?Number(patch.currentIndex):Number.isInteger(Number(spotifyCurrentIndex))?Number(spotifyCurrentIndex):spotifyIndexForTrack(trackId);
  if(index<0&&trackId)index=spotifyIndexForTrack(trackId);if(index>=0)spotifyCurrentIndex=index;
  const meta=spotifyUiMeta(index,trackId);
  return{
    schema:5,sessionId:spotifyStudySessionId,playerReady:spotifyHostReady,
    playing:patch.playing!==undefined?!!patch.playing:!!prev.playing,
    progressConfirmed:patch.progressConfirmed!==undefined?!!patch.progressConfirmed:!!prev.progressConfirmed,
    paused:patch.playing!==undefined?!patch.playing:(patch.paused!==undefined?!!patch.paused:!!prev.paused),buffering:patch.buffering!==undefined?!!patch.buffering:!!prev.buffering,
    hasTrack:Boolean(trackId||meta.title||prev.hasTrack),trackId,
    trackKey:trackId?`track:${trackId}`:'',title:String(patch.title!==undefined?patch.title:(meta.title||prev.title||'')),artist:String(patch.artist!==undefined?patch.artist:(meta.artist||prev.artist||'')),album:'',artwork:String(patch.artwork!==undefined?patch.artwork:(meta.artwork||prev.artwork||'')),
    position:Math.max(0,Number(patch.position??prev.position)||0),duration:Math.max(0,Number(patch.duration??prev.duration)||0),
    shuffleOn:Boolean(spotifyShuffleState??prev.shuffleOn??true),shuffleMode:(spotifyShuffleState??prev.shuffleOn??true)?'full-catalog':'off',nativeShuffleAvailable:false,nativeShuffleOn:false,
    queueSize:spotifyQueueCatalog.length,catalogTotalCount:spotifyQueueCatalog.length,catalogComplete:spotifyQueueCatalog.length>0,catalogSource:'warrior-parent-catalog-v522',catalogPartnerPages:0,catalogFallbackReason:'',
    currentIndex:index,historySize:spotifyHistory.length,mountedRows:0,trackMode:true,playlistId:spotifyQueuePlaylistId||spotifyPlaylistIdFromUrl(state?.study?.spotifyUrl||DEFAULT_SPOTIFY),catalogError:'',
    nextPreview:spotifyPreviewForIndex(spotifyEnsureNextPlan()),previousPreview:spotifyPreviousPreview(),reason,at:Date.now()
  }
}
let spotifySavedQueueSignature='';
async function publishSpotifyPlayerState(patch={},reason='state',force=false){
  const queueSignature=spotifyQueuePlaylistId+':'+spotifyQueueCatalog.map(row=>row.id).join(',');
  if(spotifyQueueCatalog.length&&queueSignature!==spotifySavedQueueSignature){spotifySavedQueueSignature=queueSignature;await chrome.storage.local.set({warriorSpotifyQueueV61:{playlistId:spotifyQueuePlaylistId,tracks:spotifyQueueCatalog}});}
  const next=makeSpotifyState(patch,reason);spotifyPlayerState=next;spotifyPlaying=next.playing===true;
  renderSpotifyControls();renderSpotifyMiniCustom();positionSpotifyPlayer(true);scheduleSpotifyQueueRender();
  const semantic=JSON.stringify([next.sessionId,next.playerReady,next.playing,next.buffering,next.progressConfirmed,next.trackId,next.title,next.artist,next.artwork,Math.round(next.duration*10),next.shuffleOn,next.queueSize,next.currentIndex,next.nextPreview?.trackId||'',next.previousPreview?.trackId||'',reason]);
  const changed=semantic!==spotifyStateSemantic;if(changed)spotifyStateSemantic=semantic;
  if(force||changed||Date.now()-spotifyStateStorageAt>1800){spotifyStateStorageAt=Date.now();try{await chrome.storage.local.set({[SPOTIFY_PLAYER_STATE_KEY]:next})}catch(e){debugLog('spotify-state-store-error',{error:String(e?.message||e)})}}
  if(changed)debugLog('spotify-state',{reason,state:next});return next
}
async function publishSpotifyOfficial(patch={}){
  spotifyOfficial={...spotifyOfficial,...patch,sessionId:spotifyStudySessionId,at:Date.now()};
  const semantic=JSON.stringify([spotifyOfficial.ready,spotifyOfficial.isPaused,Math.round(Number(spotifyOfficial.duration||0)*10),spotifyOfficial.playingURI,spotifyOfficial.trackId]);
  const urgent=semantic!==spotifyOfficialSemantic;if(urgent)spotifyOfficialSemantic=semantic;
  if(urgent||Date.now()-spotifyOfficialStorageAt>2200){spotifyOfficialStorageAt=Date.now();try{await chrome.storage.local.set({[SPOTIFY_OFFICIAL_KEY]:spotifyOfficial})}catch(_){} }
}
function spotifyComputeNextIndex(){
  const n=spotifyQueueCatalog.length;if(!n)return-1;
  const current=Number.isInteger(spotifyCurrentIndex)?spotifyCurrentIndex:-1;
  if(spotifyShuffleState===false){return current>=0?(current+1)%n:0}
  const banned=new Set([current,...spotifyRecent.slice(-18)]);let pool=[];for(let i=0;i<n;i++)if(!banned.has(i))pool.push(i);
  if(!pool.length){pool=Array.from({length:n},(_,i)=>i).filter(i=>i!==current)}
  return pool.length?pool[Math.floor(Math.random()*pool.length)]:Math.max(0,current)
}
function spotifyEnsureNextPlan(){
  const n=spotifyQueueCatalog.length;if(!n)return-1;const current=Number.isInteger(spotifyCurrentIndex)?spotifyCurrentIndex:-1,shuffle=spotifyShuffleState!==false;
  const valid=spotifyNextPlan.forIndex===current&&spotifyNextPlan.shuffle===shuffle&&spotifyNextPlan.playlistId===spotifyQueuePlaylistId&&spotifyNextPlan.queueSize===n&&Number.isInteger(spotifyNextPlan.index)&&spotifyNextPlan.index>=0&&spotifyNextPlan.index<n&&spotifyNextPlan.index!==current;
  if(valid)return spotifyNextPlan.index;const index=spotifyComputeNextIndex();spotifyNextPlan={forIndex:current,shuffle,playlistId:spotifyQueuePlaylistId,queueSize:n,index};return index
}
function spotifyChooseNextIndex(){return spotifyEnsureNextPlan()}
function spotifyPreviewForIndex(index){const row=spotifyCatalogRow(index);return row?.id?{trackId:String(row.id),title:String(row.title||''),artist:String(row.artist||''),artwork:String(row.artwork||''),index:Number(index)}:null}
function spotifyPreviousPreview(){const n=spotifyQueueCatalog.length;if(!n)return null;let index=-1;for(let i=spotifyHistory.length-1;i>=0;i--){const x=spotifyHistory[i];if(Number.isInteger(x)&&x>=0&&x<n&&x!==spotifyCurrentIndex){index=x;break}}if(index<0)index=spotifyCurrentIndex>0?spotifyCurrentIndex-1:n-1;return spotifyPreviewForIndex(index)}
function spotifyRememberIndex(index){
  if(Number.isInteger(spotifyCurrentIndex)&&spotifyCurrentIndex>=0&&spotifyCurrentIndex!==index){spotifyHistory.push(spotifyCurrentIndex);if(spotifyHistory.length>80)spotifyHistory.shift()}
  spotifyCurrentIndex=index;spotifyRecent.push(index);if(spotifyRecent.length>24)spotifyRecent.shift()
}
function queueSpotifyNavigation(action,positionHint=0){
  spotifyDeferredNavigation={action:String(action||''),positionHint:Math.max(0,Number(positionHint)||0),at:Date.now()};
  debugLog('spotify-navigation-coalesced',{action:spotifyDeferredNavigation.action,pendingTrackId:spotifyPendingTarget?.trackId||''});
  return true
}
function flushSpotifyDeferredNavigation(source='pending-finished'){
  if(spotifyPendingTarget||!spotifyDeferredNavigation)return false;
  const nav=spotifyDeferredNavigation;spotifyDeferredNavigation=null;
  debugLog('spotify-navigation-drain',{source,action:nav.action,ageMs:Date.now()-Number(nav.at||0)});
  setTimeout(()=>{
    if(spotifyPendingTarget){spotifyDeferredNavigation=nav;return}
    if(nav.action==='next')spotifyNext('coalesced-next').catch(e=>debugLog('spotify-navigation-drain-error',{action:nav.action,error:String(e?.message||e)}));
    else if(nav.action==='previous')spotifyPrevious('coalesced-previous',nav.positionHint).catch(e=>debugLog('spotify-navigation-drain-error',{action:nav.action,error:String(e?.message||e)}));
  },90);
  return true
}
async function playSpotifyIndex(index,reason='select',autoplay=true,{recordHistory=true}={}){
  if(!spotifyQueueCatalog.length)await loadSpotifyFullQueue(false);const n=spotifyQueueCatalog.length;if(!n)return false;
  index=Math.max(0,Math.min(n-1,Number(index)||0));const row=spotifyQueueCatalog[index];if(!row?.id)return false;
  if(recordHistory)spotifyRememberIndex(index);else{spotifyCurrentIndex=index;spotifyRecent.push(index);if(spotifyRecent.length>24)spotifyRecent.shift()}
  const trackId=String(row.id);
  if(spotifyPendingProgressTimer){clearTimeout(spotifyPendingProgressTimer);spotifyPendingProgressTimer=null}
  spotifyProgressTrackId=trackId;spotifyProgressLastPosition=0;spotifyProgressConfirmed=false;
  spotifyPendingTarget={trackId,index,reason,autoplay:autoplay!==false,startedAt:Date.now()};
  spotifyPendingProgressTimer=setTimeout(()=>{
    if(!spotifyPendingTarget||spotifyPendingTarget.trackId!==trackId)return;
    if(spotifyProgressConfirmed)return;
    debugLog('spotify-progress-stalled-release',{trackId,index,reason,hostReady:spotifyHostReady,official:spotifyOfficial,dsp:spotifyDspTelemetry});
    spotifyPendingTarget=null;spotifyPendingProgressTimer=null;
    publishSpotifyPlayerState({trackId,currentIndex:index,position:0,playing:false,buffering:false,progressConfirmed:false},`${reason}-stalled-released`,true).catch(()=>{});
    spotifyHostPost('status');
    flushSpotifyDeferredNavigation('stalled-released');
  },6500);
  // Target metadata is immediate, but time never advances until Spotify confirms real playback.
  // This prevents the old "seconds move but there is no sound" failure mode.
  await publishSpotifyPlayerState({trackId,currentIndex:index,title:row.title||`Track ${index+1}`,artist:row.artist||'',artwork:row.artwork||'',position:0,duration:0,playing:false,buffering:true,progressConfirmed:false},`${reason}-target`,true);
  const ok=spotifyHostPost('load',{uri:`spotify:track:${trackId}`,autoplay:autoplay!==false});
  if(!ok){spotifyPendingTarget=null;if(spotifyPendingProgressTimer){clearTimeout(spotifyPendingProgressTimer);spotifyPendingProgressTimer=null}await publishSpotifyPlayerState({playing:false,buffering:false},`${reason}-host-missing`,true);debugLog('spotify-load-host-missing',{trackId,index,reason});flushSpotifyDeferredNavigation('host-missing')}
  return ok
}
async function spotifyNext(reason='next'){
  if(!spotifyQueueCatalog.length)await loadSpotifyFullQueue(false);const index=spotifyChooseNextIndex();if(index<0)return false;return playSpotifyIndex(index,reason,true,{recordHistory:true})
}
function spotifyUiCurrentPosition(){
  const officialTrack=spotifyTrackIdFromUri(spotifyOfficial?.playingURI)||String(spotifyOfficial?.trackId||'');
  const stateTrack=String(spotifyPlayerState?.trackId||'');
  const officialPos=(officialTrack&&stateTrack&&officialTrack!==stateTrack)?0:Math.max(0,Number(spotifyOfficial?.position)||0);
  return Math.max(officialPos,estimatedSpotifyPosition(spotifyPlayerState));
}
async function restartSpotifyCurrentTrack(reason='restart-current'){
  const trackId=String(spotifyPlayerState?.trackId||spotifyTrackIdFromUri(spotifyOfficial?.playingURI)||'').trim();
  if(!trackId)return false;
  clearTimeout(spotifyRestartFallbackTimer);
  const wasPlaying=spotifyPlayerState?.playing===true||spotifyOfficial?.isPaused===false;
  spotifyExplicitSeekUntil=Date.now()+2600;spotifyProgressTrackId=trackId;spotifyProgressLastPosition=0;spotifyProgressConfirmed=false;
  spotifyRestartPending={trackId,requestedAt:Date.now(),until:Date.now()+2600,wasPlaying};
  const ok=spotifyHostPost('restart');
  debugLog('spotify-restart-current',{trackId,reason,ok,method:'controller.restart'});
  await publishSpotifyOfficial({trackId,position:0}).catch(()=>{});
  await publishSpotifyPlayerState({trackId,position:0,playing:wasPlaying,buffering:false,progressConfirmed:false},reason,true);
  // Rare embed builds can ignore restart(). If no near-zero playback update confirms it,
  // reload the same entity at startAt=0 without touching queue/history.
  spotifyRestartFallbackTimer=setTimeout(()=>{
    if(!spotifyRestartPending||spotifyRestartPending.trackId!==trackId)return;
    debugLog('spotify-restart-fallback-load',{trackId,ageMs:Date.now()-spotifyRestartPending.requestedAt});
    spotifyRestartPending.until=Date.now()+2600;
    spotifyHostPost('load',{uri:`spotify:track:${trackId}`,autoplay:wasPlaying});
  },1400);
  return ok;
}
async function spotifyPrevious(reason='previous',positionHint=0){
  if(!spotifyQueueCatalog.length)await loadSpotifyFullQueue(false);
  const position=Math.max(Math.max(0,Number(positionHint)||0),spotifyUiCurrentPosition());
  if(position>3&&spotifyPlayerState?.trackId){
    debugLog('spotify-previous-restart-threshold',{trackId:spotifyPlayerState.trackId,position,positionHint});
    return restartSpotifyCurrentTrack(`${reason}-restart-current`);
  }
  let index=-1;
  while(spotifyHistory.length&&index<0){const x=spotifyHistory.pop();if(Number.isInteger(x)&&x>=0&&x<spotifyQueueCatalog.length&&x!==spotifyCurrentIndex)index=x}
  if(index<0&&spotifyQueueCatalog.length)index=spotifyCurrentIndex>0?spotifyCurrentIndex-1:spotifyQueueCatalog.length-1;
  return index>=0?playSpotifyIndex(index,reason,true,{recordHistory:false}):false
}
async function ensureSpotifyStarted(reason='startup'){
  const runtime=await chrome.storage.local.get(['warriorDesktopMusicRemoteV1','warriorSpotifyExplicitPauseV61']);
  if(runtime.warriorSpotifyExplicitPauseV61)return true;
  const remote=runtime.warriorDesktopMusicRemoteV1?.remote;
  if(remote&&Date.now()-Number(remote.at)<90000)return true;
  if(spotifyPendingTarget)return true;
  if(spotifyPlayerState?.playing===true&&spotifyPlayerState?.progressConfirmed===true)return true;
  if(spotifyStartupPromise)return spotifyStartupPromise;
  spotifyStartupPromise=(async()=>{
    if(!spotifyQueueCatalog.length)await loadSpotifyFullQueue(false);
    // Multiple ready/status/catalog callbacks can all wake after the same async catalog load.
    // Re-check after await so only the first caller is allowed to create/resume a target.
    if(spotifyPendingTarget)return true;
    if(spotifyPlayerState?.playing===true&&spotifyPlayerState?.progressConfirmed===true)return true;
    const currentId=spotifyTrackIdFromUri(spotifyOfficial?.playingURI)||String(spotifyOfficial?.trackId||spotifyPlayerState?.trackId||'');
    const currentIndex=spotifyIndexForTrack(currentId);
    if(currentId&&currentIndex>=0){
      spotifyCurrentIndex=currentIndex;
      if(spotifyOfficial?.isPaused===false&&spotifyUiCurrentPosition()>.08)return true;
      debugLog('spotify-start-resume',{reason,currentId,hostReady:spotifyHostReady,engine:'sidepanel'});
      return spotifyHostPost('resume')
    }
    if(!spotifyQueueCatalog.length)return false;
    const index=spotifyChooseNextIndex();
    debugLog('spotify-start-exact-track',{reason,index,hostReady:spotifyHostReady});
    return playSpotifyIndex(index<0?0:index,reason,true,{recordHistory:false})
  })();
  try{return await spotifyStartupPromise}finally{spotifyStartupPromise=null}
}
function handleSpotifyHostPlayback(payload={},started=false){
  // The worker already published the new target; do not overwrite it with the ended track.
  if(payload.backgroundAdvanced)return;
  const uri=String(payload.playingURI||''),trackId=spotifyTrackIdFromUri(uri);if(!trackId)return;
  const pending=spotifyPendingTarget;
  if(pending&&trackId!==pending.trackId){debugLog('spotify-host-stale-event',{trackId,expected:pending.trackId,started});return}
  let index=spotifyIndexForTrack(trackId);if(index<0)index=spotifyCurrentIndex;else spotifyCurrentIndex=index;
  const duration=Math.max(0,Number(payload.duration)||0)/1000,rawPosition=Math.max(0,Number(payload.position)||0)/1000;
  const isPaused=payload.isPaused===undefined?!started:Boolean(payload.isPaused),controllerPlaying=started||!isPaused;

  if(spotifyRestartPending&&spotifyRestartPending.trackId===trackId){
    const restartAge=Date.now()-spotifyRestartPending.requestedAt;
    const confirmed=started||rawPosition<=0.45;
    if(confirmed){
      debugLog('spotify-restart-confirmed',{trackId,rawPosition,restartAge,started});
      spotifyRestartPending=null;clearTimeout(spotifyRestartFallbackTimer);spotifyRestartFallbackTimer=null;
      spotifyProgressTrackId=trackId;spotifyProgressLastPosition=rawPosition;spotifyProgressConfirmed=rawPosition>.10;
    }else if(Date.now()<spotifyRestartPending.until){
      debugLog('spotify-restart-stale-update-ignored',{trackId,rawPosition,restartAge});
      return;
    }else{
      debugLog('spotify-restart-timeout',{trackId,rawPosition,restartAge});
      spotifyRestartPending=null;clearTimeout(spotifyRestartFallbackTimer);spotifyRestartFallbackTimer=null;
    }
  }

  if(spotifyProgressTrackId!==trackId){spotifyProgressTrackId=trackId;spotifyProgressLastPosition=rawPosition;spotifyProgressConfirmed=rawPosition>.10}
  else if(rawPosition>spotifyProgressLastPosition+.045||rawPosition>.12){spotifyProgressConfirmed=true;spotifyProgressLastPosition=Math.max(spotifyProgressLastPosition,rawPosition)}
  else if(!spotifyProgressConfirmed){spotifyProgressLastPosition=Math.max(spotifyProgressLastPosition,rawPosition)}

  // Ignore a lone bogus 0:00 report after real progress on the same entity. This is
  // not a seek command and was the second half of the visible reset loop.
  let position=rawPosition;
  if(!pending&&Date.now()>spotifyExplicitSeekUntil&&spotifyProgressConfirmed&&spotifyProgressLastPosition>.65&&rawPosition<.08&&spotifyPlayerState?.trackId===trackId){
    position=Math.max(Number(spotifyPlayerState?.position)||0,spotifyProgressLastPosition);
    debugLog('spotify-zero-regression-ignored',{trackId,rawPosition,kept:position});
  }else if(rawPosition>=spotifyProgressLastPosition-.15){spotifyProgressLastPosition=Math.max(spotifyProgressLastPosition,rawPosition)}

  const realPlaying=controllerPlaying&&spotifyProgressConfirmed;
  if(pending&&trackId===pending.trackId&&realPlaying){
    debugLog('spotify-load-confirmed',{trackId,index,reason:pending.reason,latencyMs:Date.now()-pending.startedAt,position});
    spotifyPendingTarget=null;spotifyNaturalEndTrackId='';
    if(spotifyPendingProgressTimer){clearTimeout(spotifyPendingProgressTimer);spotifyPendingProgressTimer=null}
    flushSpotifyDeferredNavigation('load-confirmed');
  }
  publishSpotifyOfficial({ready:true,playingURI:uri,trackId,isPaused:!controllerPlaying,isBuffering:Boolean(payload.isBuffering),duration,position:rawPosition}).catch(()=>{});
  const stillPending=Boolean(spotifyPendingTarget&&spotifyPendingTarget.trackId===trackId);
  const buffering=Boolean(payload.isBuffering)||stillPending||(controllerPlaying&&!spotifyProgressConfirmed);
  publishSpotifyPlayerState({trackId,currentIndex:index,position,duration,playing:realPlaying,buffering,progressConfirmed:spotifyProgressConfirmed},started?'playback-started':'playback-update',realPlaying||spotifyProgressConfirmed).catch(()=>{});
  if(!payload.backgroundManaged&&!payload.backgroundAdvanced&&!stillPending&&!controllerPlaying&&duration>2&&position>=duration-.35&&spotifyNaturalEndTrackId!==trackId){
    spotifyNaturalEndTrackId=trackId;debugLog('spotify-natural-end',{trackId,position,duration});spotifyNext('natural-end').catch(e=>debugLog('spotify-natural-end-error',{error:String(e?.message||e)}));
  }
}
function handleSpotifyHostEvent(type,payload={}){
  type=String(type||'');debugLog('spotify-host-event',{type,payload,engine:'sidepanel'});
  if(type==='ready'){
    spotifyHostReady=true;publishSpotifyOfficial({ready:true}).catch(()=>{});
    loadSpotifyFullQueue(false).then(()=>ensureSpotifyStarted('engine-ready')).catch(e=>debugLog('spotify-catalog-init-error',{error:String(e?.message||e)}));return
  }
  if(type==='status'){
    if(payload.ready){
      spotifyHostReady=true;publishSpotifyOfficial({ready:true}).catch(()=>{});
      if(payload.lastUpdate)handleSpotifyHostPlayback(payload.lastUpdate,false);
      loadSpotifyFullQueue(false).then(()=>ensureSpotifyStarted('engine-status')).catch(()=>{});
    }
    return
  }
  if(type==='controller_created'){spotifyHostReady=true;spotifyHostPost('status');return}
  if(type==='playback_started'){handleSpotifyHostPlayback(payload,true);return}
  if(type==='playback_update'){handleSpotifyHostPlayback(payload,false);return}
  if(type==='loading'||type==='start_sent'||type==='play_sent'||type==='resume_sent'){return}
  if(type==='not_ready'){setTimeout(()=>spotifyHostPost('status'),500);return}
  if(type==='api_slow'||type==='api_error'||type==='command_error'){
    debugLog(`spotify-host-${type}`,payload);if(type==='api_error'){const st=$('#spotifyUiState');if(st)st.textContent='Spotify engine failed to initialize · reload Study Room'}return
  }
}
function handleSpotifyIframeMessage(e){
  const frame=$('#spotifyFrame');if(!frame||e.source!==frame.contentWindow)return;if(e.origin&&e.origin!=='https://open.spotify.com')return;
  const d=e.data;if(!d||d.source!==SPOTIFY_HOST_EVENT_SOURCE)return;handleSpotifyHostEvent(String(d.type||''),d.payload||{});
}
function handleSpotifyHostControl(cmd={}){const action=String(cmd.action||'');if(!action)return false;sendSpotifyControl(cmd).catch(()=>{});return true}
async function handleSpotifyCommand(cmd={}){
  const seq=String(cmd.seq||'');if(seq&&seq===spotifyLastCommandSeq)return;if(seq)spotifyLastCommandSeq=seq;const action=String(cmd.action||'');if(!action)return;
  debugLog('spotify-command',{action,cmd,currentIndex:spotifyCurrentIndex,shuffle:spotifyShuffleState});
  if(['next','previous','playIndex'].includes(action))await chrome.storage.local.set({warriorSpotifyExplicitPauseV61:false});
  if(action==='next'){if(spotifyPendingTarget){queueSpotifyNavigation('next');return}await spotifyNext('command-next');return}
  if(action==='previous'){if(spotifyPendingTarget){queueSpotifyNavigation('previous',cmd.positionHint);return}await spotifyPrevious('command-previous',cmd.positionHint);return}
  if(action==='restart'){await restartSpotifyCurrentTrack('command-restart');return}
  if(action==='playIndex'){spotifyDeferredNavigation=null;await playSpotifyIndex(Number(cmd.index),'queue-select',true,{recordHistory:true});return}
  if(action==='pause'){await chrome.storage.local.set({warriorSpotifyExplicitPauseV61:true});spotifyHostPost('pause');await publishSpotifyPlayerState({playing:false},'pause-command',true);return}
  if(['next','previous','playIndex'].includes(action))await chrome.storage.local.set({warriorSpotifyExplicitPauseV61:false});
  if(action==='resume'||action==='play'){
    await chrome.storage.local.set({warriorSpotifyExplicitPauseV61:false});
    if(!spotifyPlayerState?.trackId){await ensureSpotifyStarted('resume-start')}
    else if(cmd.engineDirect!==true)spotifyHostPost('resume');
    return
  }
  if(action==='toggle'){if(spotifyPlayerState?.playing===true)await handleSpotifyCommand({action:'pause'});else await handleSpotifyCommand({action:'resume'});return}
  if(action==='seek'){const seconds=Math.max(0,Number(cmd.seconds)||0);spotifyExplicitSeekUntil=Date.now()+2200;spotifyProgressLastPosition=seconds;spotifyProgressConfirmed=seconds>0.03;spotifyHostPost('seek',{seconds});await publishSpotifyPlayerState({position:seconds,progressConfirmed:seconds>0.03},'seek-command',true);return}
  if(action==='seekRatio'){const dur=Math.max(0,Number(spotifyPlayerState?.duration)||0),ratio=Math.max(0,Math.min(1,Number(cmd.ratio)||0));if(dur>0){spotifyExplicitSeekUntil=Date.now()+1800;spotifyProgressLastPosition=dur*ratio;spotifyProgressConfirmed=ratio>0.03;spotifyHostPost('seek',{seconds:dur*ratio})}return}
  if(action==='shuffleSet'||action==='shuffleToggle'){
    spotifyShuffleState=action==='shuffleToggle'?!Boolean(spotifyShuffleState):!!cmd.value;spotifyShufflePending=false;if(spotifyShufflePendingTimer){clearTimeout(spotifyShufflePendingTimer);spotifyShufflePendingTimer=null}
    await publishSpotifyPlayerState({shuffleOn:spotifyShuffleState},'shuffle',true);return
  }
  if(action==='scanQueue'){await loadSpotifyFullQueue(true);return}
}
async function sendSpotifyControl(partial={}){
  if(window.WarriorDesktopMusic?.remote())return window.WarriorDesktopMusic.send(partial);
  let cmd={...partial};if(!cmd.action){if(cmd.next)cmd={action:'next'};else if(cmd.previous)cmd={action:'previous'};else if(cmd.play)cmd={action:'resume'};else if(cmd.pause)cmd={action:'pause'};else if(cmd.shuffleSet!==undefined)cmd={action:'shuffleSet',value:!!cmd.shuffleSet};else if(cmd.queryState)cmd={action:'scanQueue'}}
  const full={...cmd,seq:`study-${Date.now()}-${Math.random()}`};await handleSpotifyCommand(full);await chrome.storage.local.set({[SPOTIFY_PLAYER_COMMAND_KEY]:full}).catch(()=>{});
}
async function sendSpotifyDspVolume(volume){
  const v=Math.max(0,Math.min(1,Number(volume)));const got=await chrome.storage.local.get(SPOTIFY_DSP_KEY).catch(()=>({}));const prev=got?.[SPOTIFY_DSP_KEY]||{};
  await chrome.storage.local.set({[SPOTIFY_DSP_KEY]:{...prev,userVolume:v,controlOnly:'volume',seq:Date.now()+Math.random()}})
}
function requestSpotifyPlay(){ensureSpotifyStarted('interaction').catch(()=>{});return true}
function installFirstInteractionSpotifyPlay(){
  let lastTry=0;const cleanup=()=>{document.removeEventListener('pointerdown',fire,true);document.removeEventListener('keydown',fire,true)};
  const fire=()=>{
    if(spotifyPlaying){cleanup();return}
    const now=Date.now();if(now-lastTry<350)return;lastTry=now;requestSpotifyPlay();
    setTimeout(()=>{if(spotifyPlaying)cleanup()},900);
  };
  document.addEventListener('pointerdown',fire,true);document.addEventListener('keydown',fire,true)
}
function clearSpotifyVisualState(){
  const wrap=$('#spotifyMini'),frame=$('#spotifyFrame');wrap?.classList.remove('phase-deep','phase-bright');if(wrap){wrap.style.filter='none';wrap.style.backdropFilter='none';wrap.style.transform='none'}if(frame){frame.style.filter='none';frame.style.transform='none'}
}
function spotifyEmbedUrl(raw){try{const u=new URL(String(raw||'').trim());if(u.hostname!=='open.spotify.com')return null;const parts=u.pathname.split('/').filter(Boolean),type=parts[0],id=parts[1];if(!['playlist','album','artist','track','episode','show'].includes(type)||!id)return null;const q=new URLSearchParams({utm_source:'generator',theme:'0'});for(const k of ['si','pt','dlsi']){const v=u.searchParams.get(k);if(v)q.set(k,v)}return `https://open.spotify.com/embed/${type}/${encodeURIComponent(id)}?${q.toString()}`}catch{return null}}
function spotifyPlaylistIdFromUrl(raw){try{const u=new URL(String(raw||'').trim());if(u.hostname!=='open.spotify.com')return'';const p=u.pathname.split('/').filter(Boolean);return p[0]==='playlist'?String(p[1]||'').trim():''}catch{return''}}
function wireSpotifyFrameLoad(){
  const f=$('#spotifyFrame');if(!f)return;f.onload=()=>{debugLog('spotify-host-frame-loaded',{src:f.src});setTimeout(()=>spotifyHostPost('status'),700);sendSpotifyDspVolume(spotifyVolume).catch(()=>{});requestAnimationFrame(()=>positionSpotifyPlayer(false))}
}

async function loadSpotifyFullQueue(force=false){
  const playlistId=spotifyPlaylistIdFromUrl(state?.study?.spotifyUrl||$('#spotifyUrl')?.value||DEFAULT_SPOTIFY);
  if(!playlistId){spotifyQueueCatalog=[];spotifyQueuePlaylistId='';renderSpotifyQueue();return}
  if(spotifyQueueLoading)return;if(!force&&spotifyQueuePlaylistId===playlistId&&spotifyQueueCatalog.length)return;
  spotifyQueueLoading=true;const count=$('#spotifyQueueCount');if(count)count.textContent='Loading full playlist…';
  try{
    const r=await chrome.runtime.sendMessage({type:'GET_SPOTIFY_PLAYLIST_CATALOG',playlistId,force});
    if(!r?.ok||!Array.isArray(r?.catalog?.tracks))throw new Error(r?.error||'Spotify catalog unavailable');
    spotifyQueuePlaylistId=playlistId;spotifyQueueCatalog=r.catalog.tracks.map((t,i)=>({...t,index:i}));
    const total=Number(r.catalog.totalCount)||spotifyQueueCatalog.length;
    if(count)count.textContent=r.catalog.complete===true?`${spotifyQueueCatalog.length} / ${total} tracks`:`${spotifyQueueCatalog.length} tracks · partial`;
    const status=$('#spotifyUiState');if(status){status.textContent=r.catalog.complete===true?`${spotifyQueueCatalog.length} tracks ready`:`${spotifyQueueCatalog.length} tracks loaded`}
    debugLog('spotify-full-queue-loaded',{playlistId,count:spotifyQueueCatalog.length,totalCount:total,complete:r.catalog.complete,source:r.catalog.source,partnerPages:r.catalog.partnerPages,fallbackReason:r.catalog.fallbackReason});
  }catch(e){spotifyQueueCatalog=[];if(count)count.textContent='Full queue unavailable';debugLog('spotify-full-queue-error',{playlistId,error:String(e?.message||e)})}
  finally{spotifyQueueLoading=false;renderSpotifyQueue()}
  if(spotifyQueueCatalog.length){
    const currentId=String(spotifyPlayerState?.trackId||spotifyTrackIdFromUri(spotifyOfficial?.playingURI)||'');
    const hit=spotifyIndexForTrack(currentId);if(hit>=0)spotifyCurrentIndex=hit;
    if(spotifyHostReady&&!spotifyPendingTarget)ensureSpotifyStarted('catalog-ready').catch(e=>debugLog('spotify-start-error',{error:String(e?.message||e)}));
  }
}
function filteredSpotifyQueue(){const q=String(spotifyQueueSearch||'').trim().toLowerCase();if(!q)return spotifyQueueCatalog;return spotifyQueueCatalog.filter(t=>`${t.title||''} ${t.artist||''}`.toLowerCase().includes(q))}
function renderSpotifyQueue(){
  const vp=$('#spotifyQueueViewport'),inner=$('#spotifyQueueList');if(!vp||!inner)return;
  const list=filteredSpotifyQueue();const h=spotifyQueueRowHeight,totalH=list.length*h,top=Math.max(0,vp.scrollTop||0),vh=Math.max(220,vp.clientHeight||260),start=Math.max(0,Math.floor(top/h)-5),end=Math.min(list.length,Math.ceil((top+vh)/h)+6);
  inner.style.height=`${totalH}px`;const cur=Number(spotifyPlayerState?.currentIndex);
  const visible=list.slice(start,end);
  inner.innerHTML=visible.map((t,j)=>{const idx=Number(t.index),y=(start+j)*h,active=idx===cur?' active':'';return `<button class="spotify-queue-row${active}" data-spotify-index="${idx}" style="transform:translateY(${y}px)"><span class="spotify-queue-num">${idx+1}</span><span class="spotify-queue-text"><strong>${esc(t.title||`Track ${idx+1}`)}</strong><small>${esc(t.artist||'')}</small></span></button>`}).join('');
  hydrateSpotifyQueueTracks(visible).catch(()=>{});
}
async function hydrateSpotifyQueueTracks(rows){
  const targets=(Array.isArray(rows)?rows:[]).filter(t=>t?.id&&(!t.title||!t.artist||!t.artwork)&&!spotifyQueueMetaPending.has(t.id)).slice(0,8);
  if(!targets.length)return;
  await Promise.all(targets.map(async t=>{
    spotifyQueueMetaPending.add(t.id);
    try{
      const r=await chrome.runtime.sendMessage({type:'GET_SPOTIFY_TRACK_META',trackId:t.id});
      if(!r?.ok||!r.meta)return;
      const row=spotifyQueueCatalog.find(x=>x.index===t.index);if(!row)return;
      if(r.meta.title)row.title=String(r.meta.title);if(r.meta.artist)row.artist=String(r.meta.artist);if(r.meta.artwork)row.artwork=String(r.meta.artwork);
    }finally{spotifyQueueMetaPending.delete(t.id)}
  }));
  scheduleSpotifyQueueRender();
}
function scheduleSpotifyQueueRender(){if(spotifyQueueRenderRaf)return;spotifyQueueRenderRaf=requestAnimationFrame(()=>{spotifyQueueRenderRaf=0;renderSpotifyQueue()})}
async function loadSpotifyFromInput(){const raw=$('#spotifyUrl').value.trim(),embed=spotifyEmbedUrl(raw);if(!embed){$('#spotifyUrl').value=DEFAULT_SPOTIFY;return}await updateStudy({spotifyUrl:raw,spotifyActive:true});spotifyQueueCatalog=[];spotifyQueuePlaylistId='';spotifyQueueMetaPending.clear();spotifyQueueSearch='';const q=$('#spotifyQueueSearch');if(q)q.value='';renderSpotify(raw);openDrawer('spotify');await loadSpotifyFullQueue(true)}
function renderSpotify(raw){
  spotifyPendingTarget=null;const f=$('#spotifyFrame'),embed=spotifyEmbedUrl(raw)||spotifyEmbedUrl(DEFAULT_SPOTIFY);
  debugLog('render-spotify-v524',{raw,embed,engine:'sidepanel'});
  if(f&&f.getAttribute('src')!=='about:blank')f.src='about:blank';
  spotifyHostReady=false;spotifyOfficial={...spotifyOfficial,ready:false,at:Date.now()};
  chrome.runtime.sendMessage({type:'SPOTIFY_ENGINE_INIT'}).catch(()=>{});
  setTimeout(()=>spotifyHostPost('status'),350);
  loadSpotifyFullQueue(false).catch(e=>debugLog('spotify-catalog-init-error',{error:String(e?.message||e)}));
  requestAnimationFrame(()=>positionSpotifyPlayer(false));
}
async function restoreDefaultSpotify(){$('#spotifyUrl').value=DEFAULT_SPOTIFY;await updateStudy({spotifyUrl:DEFAULT_SPOTIFY,spotifyActive:true});spotifyQueueCatalog=[];spotifyQueuePlaylistId='';spotifyQueueMetaPending.clear();renderSpotify(DEFAULT_SPOTIFY);if(activeDrawer==='spotify')await loadSpotifyFullQueue(true)}
async function initSpotifyPlaybackMonitor(){
  // v5.9: playback state comes from Spotify iframe updates/player state. Avoid a permanent tabs.get() poll.
  const st=$('#spotifyPlaybackState');if(st)st.textContent=spotifyPlayerState?.playing===true?'playing':'paused';
}
function setSpotifyRect(rect){
  const el=$('#spotifyMini');if(!el||!rect)return;el.style.display='block';el.style.visibility='visible';el.style.opacity='1';el.style.pointerEvents='auto';el.style.left=`${Math.round(rect.left)}px`;el.style.top=`${Math.round(rect.top)}px`;el.style.right='auto';el.style.bottom='auto';el.style.width=`${Math.round(rect.width)}px`;el.style.height=`${Math.round(rect.height)}px`;
}
function miniSpotifyRect(){const mobile=window.innerWidth<700,w=mobile?Math.max(300,window.innerWidth-20):Math.min(440,window.innerWidth-36),h=214,left=mobile?10:18,top=window.innerHeight-h-(mobile?76:18);return{left,top,width:w,height:h}}
function positionSpotifyPlayer(animated=true){
  const el=$('#spotifyMini');if(!el)return;
  const trackMode=spotifyPlayerState?.trackMode===true;el.classList.toggle('spotify-track-mode',trackMode);$('#spotifyPlayerSlot')?.classList.toggle('spotify-track-mode',trackMode);$('#drawer')?.classList.toggle('spotify-track-drawer',activeDrawer==='spotify'&&trackMode);
  if(activeDrawer==='spotify'){
    const slot=$('#spotifyPlayerSlot');const r=slot?.getBoundingClientRect();if(!r||r.width<20)return;
    el.classList.remove('spotify-hidden','spotify-docked');el.classList.add('spotify-panel');setSpotifyRect(r);return;
  }
  el.classList.remove('spotify-panel');
  const playerFresh=spotifyPlayerState&&Date.now()-Number(spotifyPlayerState.at||0)<30000;
  const stateHasTrack=Boolean(spotifyPlayerState&&(spotifyPlayerState.hasTrack||spotifyPlayerState.trackId||String(spotifyPlayerState.title||'').trim()||Number(spotifyPlayerState.duration)>1||Number(spotifyPlayerState.position)>0||spotifyPlayerState.playing===true));
  const officialHasTrack=Boolean(spotifyOfficial&&(Number(spotifyOfficial.duration)>1||Number(spotifyOfficial.position)>0||spotifyOfficial.isPaused===false));
  const handoffActive=Boolean(spotifyPendingTarget);
  const playerMounted=Boolean(state?.study?.spotifyActive||$('#spotifyFrame')?.src);
  const hasCurrentTrack=Boolean(stateHasTrack||officialHasTrack||handoffActive||playerMounted);
  const miniSig=JSON.stringify([activeDrawer,playerFresh,hasCurrentTrack,handoffActive,spotifyPlayerState?.sessionId,spotifyPlayerState?.trackId,spotifyPlayerState?.title,spotifyPlayerState?.playing,spotifyPlayerState?.at]);if(miniSig!==lastMiniDebugSig){lastMiniDebugSig=miniSig;debugLog('mini-render-decision',{activeDrawer,playerFresh,stateHasTrack,officialHasTrack,handoffActive,hasCurrentTrack,now:Date.now(),state:spotifyPlayerState,official:spotifyOfficial});}
  // v5.6: pausing is still an active player state. Keep the custom mini visible
  // until the Study session/player itself goes away; never treat pause as stop.
  if(hasCurrentTrack){el.classList.remove('spotify-hidden');el.classList.add('spotify-docked');setSpotifyRect(miniSpotifyRect());renderSpotifyMiniCustom();return}
  el.classList.remove('spotify-docked');el.classList.add('spotify-hidden');el.style.visibility='hidden';el.style.pointerEvents='none';
}


function setMusicFxStatus(text,online=false){
  const el=$('#musicFxStatus');if(!el)return;
  el.textContent=text;el.classList.toggle('online',online);el.classList.toggle('offline',!online);
}
function todayKey(){const d=new Date(),p=n=>String(n).padStart(2,'0');return`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`}
function parseDay(key){const[y,m,d]=String(key).split('-').map(Number);return new Date(y,m-1,d)}
function formatDay(key){const d=parseDay(key);if(key===todayKey())return`Today · ${new Intl.DateTimeFormat(undefined,{month:'long',day:'numeric',year:'numeric'}).format(d)}`;return new Intl.DateTimeFormat(undefined,{weekday:'short',month:'long',day:'numeric',year:'numeric'}).format(d)}
function shortDay(key){if(key===todayKey())return'Today';return new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric'}).format(parseDay(key))}
function fmt(ms){const t=Math.max(0,Math.ceil(ms/1000)),m=Math.floor(t/60),s=t%60;return`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`}
function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt',"'":'&#39;','"':'&quot;'}[c]))}
function attr(v){return esc(v||'')}
