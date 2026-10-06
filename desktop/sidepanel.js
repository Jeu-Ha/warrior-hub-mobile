let state=null,urls=null,currentTab='today',selectedDay=dayKey(new Date()),tickTimer=null,assignmentView='list',assignmentCalendarCursor=new Date(new Date().getFullYear(),new Date().getMonth(),1),assignmentCalendarSelectedKey=localDateKey(new Date()),lastTodayMinuteKey='';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const SIDE_SPOTIFY_PLAYER_STATE_KEY='warriorSpotifyPlayerStateV59',SIDE_SPOTIFY_PLAYER_COMMAND_KEY='warriorSpotifyPlayerCommandV59',SIDE_SPOTIFY_DSP_KEY='warriorSpotifyDspState',SIDE_SPOTIFY_STUDY_SESSION_KEY='warriorSpotifyStudySessionV52',DEBUG_ENABLED_KEY='warriorDebugEnabledV59';
const CALCULUS_BOOK_URL='https://archive.org/details/stewart-j.-clegg-d.-watson-s.-calculus.-early-transcendentals-9ed-2020/page/425/mode/2up';
const ETHICS_BOOK_URL=chrome.runtime.getURL('resources/being-good-simon-blackburn.pdf');
const CHEM2_LAB_URL='https://canvas.wayne.edu/courses/244636/modules/items/6576907';
const CHEM2_BOOK_URL=chrome.runtime.getURL('resources/general-chemistry-11e-ebbing-gammon.pdf');
function assignmentResource(a){
  const hay=`${a?.courseId||''} ${a?.courseName||''} ${a?.courseCode||''}`.toLowerCase();
  if(String(a?.courseId||'')==='243235'||/\bmat[_\s-]*2120\b|\bmat[_\s-]*2020\b|\bmath[_\s-]*1760\b|calculus/.test(hay))return{kind:'calculus',label:'Calculus book · resume last page',short:'📘 book',url:CALCULUS_BOOK_URL};
  if(/\bphi[_\s-]*1100\b|contemporary\s+moral\s+issues|moral\s+issues|\bethics\b/.test(hay))return{kind:'ethics',label:'Being Good PDF',short:'📗 PDF',url:ETHICS_BOOK_URL};
  if(String(a?.courseId||'')==='244636'||/general\s+chemistry\s+(ii|2)\s+laboratory|chem(?:istry)?\s*(ii|2).*\blab(?:oratory)?\b/.test(hay))return{kind:'chem2lab',label:'Chem 2 Lab · Canvas LabFlow',short:'🧪 Lab',url:CHEM2_LAB_URL};
  if(String(a?.courseId||'')==='244611'||((/\bchm[_\s-]*1140\b|\bchm[_\s-]*1145\b|general\s+chemistry\s+(ii|2)|general\s+chemistry\s+ii\s+for\s+engineers/.test(hay))&&!/\blab(?:oratory)?\b/.test(hay)))return{kind:'chem2book',label:'Gen Chem 2 · General Chemistry 11e',short:'📘 book',url:CHEM2_BOOK_URL};
  return null;
}
function assignmentResourceButton(a){const r=assignmentResource(a);return r?`<button class="mini-btn assignment-resource" data-resource-kind="${attr(r.kind||'')}" data-resource-url="${attr(r.url)}" title="${attr(r.label)}">${esc(r.short)}</button>`:''}
function manualSubmitted(a){return Boolean(state?.manualAssignmentStatus?.[String(a?.id||'')]?.submitted)}
function effectiveSubmitted(a){return Boolean(a?.submitted||a?.canvasSubmitted||manualSubmitted(a))}
function assignmentGradeInfo(a){
  const possibleRaw=a?.pointsPossible??a?.points??a?.points_possible;
  const possible=Number(possibleRaw);
  const scoreRaw=[a?.score,a?.pointsEarned,a?.earnedPoints,a?.submissionScore,a?.enteredScore].find(v=>v!==null&&v!==undefined&&v!=='');
  const score=scoreRaw===undefined?null:Number(scoreRaw);
  const rawGrade=[a?.grade,a?.submissionGrade,a?.letterGrade].find(v=>v!==null&&v!==undefined&&String(v).trim()!=='');
  const grade=rawGrade===undefined?'':String(rawGrade).trim();
  const excused=Boolean(a?.excused);
  const validScore=score!==null&&Number.isFinite(score)?score:null;
  const validPossible=Number.isFinite(possible)?possible:null;
  const percent=Number.isFinite(Number(a?.gradePercent))?Number(a.gradePercent):(validScore!==null&&validPossible>0?validScore/validPossible*100:null);
  if(!excused&&validScore===null&&!grade)return null;
  const num=v=>Number.isInteger(Number(v))?String(Number(v)):Number(v).toFixed(2).replace(/0+$/,'').replace(/\.$/,'');
  const scoreText=validScore!==null?(validPossible!==null?`${num(validScore)}/${num(validPossible)}`:num(validScore)):'';
  const pctText=percent!==null&&Number.isFinite(percent)?`${percent.toFixed(Number.isInteger(percent)?0:1)}%`:'';
  const cleanGrade=grade&&grade!==String(validScore)&&grade!==scoreText?grade:'';
  return {label:excused?'Excused':[scoreText,pctText,cleanGrade].filter(Boolean).join(' · ')||'Graded',percent};
}
function assignmentGradeBadge(a){const g=assignmentGradeInfo(a);return g?`<span class="badge grade-score">★ ${esc(g.label)}</span>`:''}
function assignmentHasGrade(a){return !!assignmentGradeInfo(a)}
function assignmentCheckButton(a){
  if((a.canvasSubmitted||a.submitted)&&!manualSubmitted(a))return `<button class="mini-btn assignment-check" disabled title="Canvas already shows this as submitted">✓ submitted</button>`;
  return manualSubmitted(a)
    ? `<button class="mini-btn assignment-check checked" data-id="${attr(a.id)}" data-submitted="false" title="Undo manual submitted check">↩ uncheck</button>`
    : `<button class="mini-btn assignment-check" data-id="${attr(a.id)}" data-submitted="true" title="Mark submitted in Warrior Hub">✓ submitted</button>`;
}
const sideSpotifyRemoteBootAt=Date.now();
let sideSpotifyPlayerState=null,sideSpotifyStudySession=null,sideSpotifyVolume=1,sideSpotifyActiveIsStudy=false,sideSpotifyVolumeTimer=null,sideSpotifyStudyTabId=null,sideSpotifyControlGraceUntil=0;
let sideSpotifyActiveCandidate=null,sideSpotifyActiveCandidateSince=0,sideSpotifyActiveCommitTimer=null,sideSpotifyPhaseSettleTimer=null;


const sideSpotifyThemeDefault={accent:'rgb(53,208,127)',accent2:'rgb(112,167,255)',accentSoft:'rgba(53,208,127,.14)',glow:'rgba(53,208,127,.28)',glow2:'rgba(112,167,255,.22)',soft:'rgba(53,208,127,.12)',soft2:'rgba(112,167,255,.10)',border:'rgba(53,208,127,.32)',cardBorder:'rgba(112,167,255,.24)',shadow:'rgba(0,0,0,.26)'};
const sideSpotifyThemeCache=new Map();
let sideSpotifyThemeKey='',sideSpotifyThemeAnimTimer=null,sideSpotifyThemeRaf=0;
function sideClamp(v,min,max){return Math.max(min,Math.min(max,Number(v)||0))}
function sideRgbCss(rgb){return `rgb(${rgb.map(v=>Math.round(sideClamp(v,0,255))).join(',')})`}
function sideRgbaCss(rgb,a){return `rgba(${rgb.map(v=>Math.round(sideClamp(v,0,255))).join(',')},${sideClamp(a,0,1).toFixed(3)})`}
function sideMixRgb(a,b,t){return a.map((v,i)=>Math.round(v*(1-t)+b[i]*t))}
function sideRgbToHsl(r,g,b){r/=255;g/=255;b/=255;const max=Math.max(r,g,b),min=Math.min(r,g,b),l=(max+min)/2;let h=0,s=0;if(max!==min){const d=max-min;s=l>.5?d/(2-max-min):d/(max+min);switch(max){case r:h=(g-b)/d+(g<b?6:0);break;case g:h=(b-r)/d+2;break;default:h=(r-g)/d+4;break;}h/=6;}return{h,s,l}}
function sideHue2rgb(p,q,t){if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p}
function sideHslToRgb(h,s,l){let r,g,b;if(s===0){r=g=b=l}else{const q=l<.5?l*(1+s):l+s-l*s,p=2*l-q;r=sideHue2rgb(p,q,h+1/3);g=sideHue2rgb(p,q,h);b=sideHue2rgb(p,q,h-1/3)}return[Math.round(r*255),Math.round(g*255),Math.round(b*255)]}
function sideHashTheme(seed){let hash=0;const str=String(seed||'warrior');for(let i=0;i<str.length;i++)hash=(hash*31+str.charCodeAt(i))>>>0;const h1=((hash%360)+360)%360/360,h2=(((hash>>9)%360)+40)%360/360;const a1=sideHslToRgb(h1,.72,.57),a2=sideHslToRgb(h2,.68,.62);return{accent:sideRgbCss(a1),accent2:sideRgbCss(a2),accentSoft:sideRgbaCss(a1,.14),glow:sideRgbaCss(a1,.30),glow2:sideRgbaCss(a2,.23),soft:sideRgbaCss(a1,.12),soft2:sideRgbaCss(a2,.10),border:sideRgbaCss(a1,.32),cardBorder:sideRgbaCss(a2,.24),shadow:sideRgbaCss(sideMixRgb(a1,[0,0,0],.78),.32)}}
function sideParseThemeRgb(value,fallback){const m=String(value||'').match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);return m?[Number(m[1]),Number(m[2]),Number(m[3])]:fallback.slice()}
function sideCurrentThemeRgb(name,fallback){try{return sideParseThemeRgb(getComputedStyle(document.documentElement).getPropertyValue(name),fallback)}catch(_){return fallback.slice()}}
function sideSetThemePalette(a1,a2){const root=document.documentElement,avg=sideMixRgb(a1,a2,.5);root.style.setProperty('--accent',sideRgbCss(a1));root.style.setProperty('--accentSoft',sideRgbaCss(a1,.16));root.style.setProperty('--blue',sideRgbCss(a2));root.style.setProperty('--track-accent',sideRgbCss(a1));root.style.setProperty('--track-accent-2',sideRgbCss(a2));root.style.setProperty('--track-glow',sideRgbaCss(a1,.40));root.style.setProperty('--track-glow-2',sideRgbaCss(a2,.32));root.style.setProperty('--track-soft',sideRgbaCss(a1,.16));root.style.setProperty('--track-soft-2',sideRgbaCss(a2,.13));root.style.setProperty('--track-border',sideRgbaCss(a1,.40));root.style.setProperty('--track-card-border',sideRgbaCss(a2,.30));root.style.setProperty('--track-shadow',sideRgbaCss(sideMixRgb(avg,[0,0,0],.76),.38));root.style.setProperty('--track-bg-a',sideRgbaCss(a1,.28));root.style.setProperty('--track-bg-b',sideRgbaCss(a2,.24));root.style.setProperty('--track-bg-c',sideRgbaCss(avg,.15))}
function sideEaseTheme(t){return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2}
function sideApplySpotifyTheme(theme,animated=true){const t={...sideSpotifyThemeDefault,...(theme||{})},body=document.body;if(!document.documentElement||!body)return;const target1=sideParseThemeRgb(t.accent,[53,208,127]),target2=sideParseThemeRgb(t.accent2,[112,167,255]);body.classList.add('track-theme-live');if(sideSpotifyThemeRaf)cancelAnimationFrame(sideSpotifyThemeRaf);clearTimeout(sideSpotifyThemeAnimTimer);if(!animated||matchMedia?.('(prefers-reduced-motion: reduce)')?.matches){sideSetThemePalette(target1,target2);return}const start1=sideCurrentThemeRgb('--track-accent',[53,208,127]),start2=sideCurrentThemeRgb('--track-accent-2',[112,167,255]),started=performance.now(),duration=1750;body.classList.add('track-theme-transitioning');const step=now=>{const p=Math.min(1,(now-started)/duration),e=sideEaseTheme(p),a1=sideMixRgb(start1,target1,e),a2=sideMixRgb(start2,target2,e);sideSetThemePalette(a1,a2);if(p<1)sideSpotifyThemeRaf=requestAnimationFrame(step);else{sideSpotifyThemeRaf=0;sideSpotifyThemeAnimTimer=setTimeout(()=>body.classList.remove('track-theme-transitioning'),260)}};sideSpotifyThemeRaf=requestAnimationFrame(step)}
function sideBuildThemeFromImageData(data,w,h){const samples=[];let sum=[0,0,0],count=0;for(let y=0;y<h;y+=2){for(let x=0;x<w;x+=2){const i=(y*w+x)*4,a=data[i+3];if(a<150)continue;const rgb=[data[i],data[i+1],data[i+2]];sum[0]+=rgb[0];sum[1]+=rgb[1];sum[2]+=rgb[2];count++;const hsl=sideRgbToHsl(rgb[0],rgb[1],rgb[2]);if(hsl.l<.08||hsl.l>.92)continue;const sat=hsl.s,lum=hsl.l,score=(.18+sat)*(1-Math.abs(lum-.54))*((rgb[0]+rgb[1]+rgb[2])>36?1:0);samples.push({rgb,hsl,score})}}
  if(!count)return sideSpotifyThemeDefault;const avg=count?sum.map(v=>Math.round(v/count)):[53,208,127];if(!samples.length)return sideHashTheme(avg.join(','));samples.sort((a,b)=>b.score-a.score);const primary=samples[0];let secondary=samples.find(s=>Math.abs(s.hsl.h-primary.hsl.h)>.11&&Math.abs(s.hsl.l-primary.hsl.l)>.05)||samples[Math.min(5,samples.length-1)]||primary;const accent=sideHslToRgb(primary.hsl.h,sideClamp(Math.max(primary.hsl.s,.58),0,1),sideClamp(primary.hsl.l<.38?.52:primary.hsl.l>.72?.62:primary.hsl.l,.44,.66));const accent2=sideHslToRgb(secondary.hsl.h,sideClamp(Math.max(secondary.hsl.s,.48),0,1),sideClamp(secondary.hsl.l<.33?.56:secondary.hsl.l>.76?.64:secondary.hsl.l,.48,.7));return{accent:sideRgbCss(accent),accent2:sideRgbCss(accent2),accentSoft:sideRgbaCss(accent,.14),glow:sideRgbaCss(accent,.28),glow2:sideRgbaCss(accent2,.22),soft:sideRgbaCss(accent,.12),soft2:sideRgbaCss(accent2,.10),border:sideRgbaCss(accent,.32),cardBorder:sideRgbaCss(accent2,.24),shadow:sideRgbaCss(sideMixRgb(avg,[0,0,0],.8),.34)}}
async function sideExtractSpotifyTheme(artwork,keyHint=''){const cacheKey=String(artwork||keyHint||'');if(sideSpotifyThemeCache.has(cacheKey))return sideSpotifyThemeCache.get(cacheKey);let theme=null;if(artwork){try{theme=await new Promise((resolve,reject)=>{const img=new Image();img.crossOrigin='anonymous';img.referrerPolicy='no-referrer';img.onload=()=>{try{const canvas=document.createElement('canvas');const size=30;canvas.width=size;canvas.height=size;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,size,size);const {data}=ctx.getImageData(0,0,size,size);resolve(sideBuildThemeFromImageData(data,size,size))}catch(err){reject(err)}};img.onerror=()=>reject(new Error('artwork-load-failed'));img.src=artwork;});}catch(_){theme=null}}
  if(!theme)theme=sideHashTheme(cacheKey||'warrior-theme');sideSpotifyThemeCache.set(cacheKey,theme);return theme}
async function sideUpdateSpotifyThemeFromState(playerState,animated=true){const artwork=String(playerState?.artwork||'').trim();const key=artwork||`${playerState?.trackId||''}|${playerState?.title||''}|${playerState?.artist||''}`.trim();if(!key){sideSpotifyThemeKey='';sideApplySpotifyTheme(sideSpotifyThemeDefault,false);document.body?.classList.remove('track-theme-live');return}if(key===sideSpotifyThemeKey)return;sideSpotifyThemeKey=key;const theme=await sideExtractSpotifyTheme(artwork,key).catch(()=>sideHashTheme(key));if(sideSpotifyThemeKey!==key)return;sideApplySpotifyTheme(theme,animated)}

let lastRemoteDebugSig='',warriorDebugEnabled=false;
chrome.storage.local.get(DEBUG_ENABLED_KEY).then(g=>warriorDebugEnabled=!!g?.[DEBUG_ENABLED_KEY]).catch(()=>{});
function debugLog(event,data={}){if(!warriorDebugEnabled)return;try{chrome.runtime.sendMessage({type:'DEBUG_LOG',source:'sidepanel',event,data}).catch(()=>{})}catch(_){}}
window.addEventListener('error',e=>debugLog('window-error',{message:e.message,filename:e.filename,lineno:e.lineno,colno:e.colno,error:String(e.error?.stack||e.error||'')}));
window.addEventListener('unhandledrejection',e=>debugLog('unhandled-rejection',{reason:String(e.reason?.stack||e.reason||'')}));
async function clearDebugLog(){
  const b=$('#debugClearBtn'),status=$('#debugStatus');if(b)b.disabled=true;
  try{await chrome.runtime.sendMessage({type:'DEBUG_CLEAR'});warriorDebugEnabled=true;if(status)status.textContent='Logging test · reproduce the bug now';debugLog('clean-test-started',{at:Date.now()});}
  finally{if(b)b.disabled=false;}
}
function sideTimeout(promise,ms,label='operation'){
  return Promise.race([Promise.resolve(promise),new Promise((_,reject)=>setTimeout(()=>reject(new Error(`${label} timeout`)),ms))]);
}
function downloadDebugBundle(bundle, suffix=''){
  const text=JSON.stringify(bundle,null,2),blob=new Blob([text],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=`warrior-hub-debug-v${chrome.runtime.getManifest().version}${suffix}-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
async function buildEmergencyDebugBundle(reason='background export failed'){
  let all={},tabs=[],errors=[];
  try{all=await sideTimeout(chrome.storage.local.get(null),1800,'local storage')}catch(e){errors.push(`storage: ${e.message}`)}
  try{tabs=await sideTimeout(chrome.tabs.query({}),1500,'tabs')}catch(e){errors.push(`tabs: ${e.message}`)}
  const events=Array.isArray(all?.warriorDebugLogV59)?all.warriorDebugLogV59:[];
  const tech={};for(const [k,v] of Object.entries(all||{})){if(/^warriorSpotify/i.test(k)||/^warriorOneDrive/i.test(k)||k==='scheduleCaptureArmed')tech[k]=v;}
  return {format:'Warrior Hub EMERGENCY diagnostic bundle',schema:2,generatedAt:new Date().toISOString(),reason,errors,extension:{version:chrome.runtime.getManifest().version,name:chrome.runtime.getManifest().name},sidepanelSnapshot:{playerState:sideSpotifyPlayerState,studySession:sideSpotifyStudySession,studyTabId:sideSpotifyStudyTabId,activeIsStudy:sideSpotifyActiveIsStudy},technicalStorage:tech,tabs:(tabs||[]).filter(t=>/spotify|canvas|outlook|wayne|chrome-extension/i.test(String(t.url||''))).map(t=>({id:t.id,active:t.active,audible:t.audible,status:t.status,title:t.title,url:t.url})),events:events.slice(-3000)};
}
async function exportDebugLog(){
  const b=$('#debugExportBtn'),status=$('#debugStatus');if(b){b.disabled=true;b.textContent='Building log…'}
  try{
    debugLog('export-button-click',{playerState:sideSpotifyPlayerState,studySession:sideSpotifyStudySession,studyTabId:sideSpotifyStudyTabId,activeIsStudy:sideSpotifyActiveIsStudy});
    let r=null;
    try{r=await sideTimeout(chrome.runtime.sendMessage({type:'DEBUG_EXPORT',source:'sidepanel'}),5000,'background export')}catch(e){
      if(status)status.textContent='Background stuck — exporting emergency snapshot…';
      const emergency=await buildEmergencyDebugBundle(String(e?.message||e));downloadDebugBundle(emergency,'-EMERGENCY');
      if(status)status.textContent=`Emergency log exported · ${emergency.events?.length||0} events`;return;
    }
    if(!r?.ok||!r.bundle){const emergency=await buildEmergencyDebugBundle(r?.error||'No bundle returned');downloadDebugBundle(emergency,'-EMERGENCY');if(status)status.textContent='Emergency log exported';return;}
    downloadDebugBundle(r.bundle);
    warriorDebugEnabled=false;if(status)status.textContent=`Exported ${r.bundle.events?.length||0} events · diagnostics off`;
  }catch(e){
    try{const emergency=await buildEmergencyDebugBundle(String(e?.message||e));downloadDebugBundle(emergency,'-EMERGENCY');if(status)status.textContent='Emergency log exported';}
    catch(e2){if(status)status.textContent=`Export failed: ${String(e2?.message||e2).slice(0,70)}`;}
  }
  finally{if(b){b.disabled=false;b.textContent='Export debug log'}}
}

init();
async function init(){
  bindUi();
  debugLog('sidepanel-init',{version:chrome.runtime.getManifest().version,bootAt:sideSpotifyRemoteBootAt});
  const res=await chrome.runtime.sendMessage({type:'GET_STATE'});state=res.state;urls=res.urls;render();
  // v5.6: opening Warrior Hub refreshes any sources that are already open; it never
  // spawns surprise Canvas/Mail tabs. Their content scripts keep resyncing afterwards.
  chrome.runtime.sendMessage({type:'AUTO_SYNC_OPEN_SOURCES'}).catch(()=>{});
  await initSideSpotifyRemote();
  await syncSideSpotifyPhaseFx(null,true);
  tickTimer=setInterval(()=>{if(currentTab==='study')renderStudyMini();renderSideSpotifyRemote();const n=new Date(),mk=`${n.getFullYear()}-${n.getMonth()}-${n.getDate()}-${n.getHours()}-${n.getMinutes()}`;if(mk!==lastTodayMinuteKey){lastTodayMinuteKey=mk;if(currentTab==='today')renderToday();}},1000);
  chrome.storage.onChanged.addListener(async(changes,area)=>{
    if(area!=='local')return;
    if(changes[DEBUG_ENABLED_KEY])warriorDebugEnabled=!!changes[DEBUG_ENABLED_KEY].newValue;
    if(changes.warriorState){const prevState=state;state=changes.warriorState.newValue;render();syncSideSpotifyPhaseFx(prevState,false).catch(e=>debugLog('remote-phase-fx-error',{error:String(e?.message||e)}));}
    if(changes[SIDE_SPOTIFY_PLAYER_STATE_KEY]){sideSpotifyPlayerState=changes[SIDE_SPOTIFY_PLAYER_STATE_KEY].newValue||null;debugLog('remote-player-state-change',{state:sideSpotifyPlayerState});sideUpdateSpotifyThemeFromState(sideSpotifyPlayerState,true).catch(()=>{});renderSideSpotifyRemote();}
    if(changes[SIDE_SPOTIFY_STUDY_SESSION_KEY]){sideSpotifyStudySession=changes[SIDE_SPOTIFY_STUDY_SESSION_KEY].newValue||null;debugLog('remote-study-session-change',{session:sideSpotifyStudySession});renderSideSpotifyRemote();}
    if(changes[SIDE_SPOTIFY_DSP_KEY]){const v=Number(changes[SIDE_SPOTIFY_DSP_KEY].newValue?.userVolume);if(Number.isFinite(v)){sideSpotifyVolume=Math.max(0,Math.min(1,v));renderSideSpotifyVolume();}}
  });
}
function bindUi(){
  $$('.tab[data-tab]').forEach(b=>b.addEventListener('click',()=>setTab(b.dataset.tab)));$$('[data-go]').forEach(b=>b.addEventListener('click',()=>setTab(b.dataset.go)));$$('[data-open]').forEach(b=>b.addEventListener('click',()=>openUrlKey(b.dataset.open)));$('#syncBtn').addEventListener('click',syncAll);$('#syncMailBtn').addEventListener('click',syncMail);$('#openMailBtn').addEventListener('click',openWayneMail);$('#assignmentFilter').addEventListener('change',renderAssignments);$('#refreshScheduleBtn').addEventListener('click',refreshSchedule);$('#openStudyRoomBtn').addEventListener('click',()=>chrome.runtime.sendMessage({type:'OPEN_STUDY_ROOM'}));document.addEventListener('click',handleDynamicClick);
  $('#todoQuickAdd')?.addEventListener('click',openTodoComposer);
  $('#todoTopAdd')?.addEventListener('click',openTodoComposer);
  $('#assignmentListViewBtn')?.addEventListener('click',()=>{assignmentView='list';renderAssignments();});
  $('#assignmentCalendarViewBtn')?.addEventListener('click',()=>{assignmentView='calendar';renderAssignments();});
  $('#assignmentCalendarPrev')?.addEventListener('click',()=>{assignmentCalendarCursor=new Date(assignmentCalendarCursor.getFullYear(),assignmentCalendarCursor.getMonth()-1,1);renderAssignmentCalendar();});
  $('#assignmentCalendarNext')?.addEventListener('click',()=>{assignmentCalendarCursor=new Date(assignmentCalendarCursor.getFullYear(),assignmentCalendarCursor.getMonth()+1,1);renderAssignmentCalendar();});
  $('#assignmentCalendarToday')?.addEventListener('click',()=>{const n=new Date();assignmentCalendarCursor=new Date(n.getFullYear(),n.getMonth(),1);assignmentCalendarSelectedKey=localDateKey(n);renderAssignmentCalendar();});
  $('#sideSpotifyOpen')?.addEventListener('click',()=>chrome.runtime.sendMessage({type:'OPEN_STUDY_ROOM'}));
  $('#sideSpotifyToggle')?.addEventListener('click',async()=>{sideSpotifyControlGraceUntil=Date.now()+1000;await sendSideSpotifyCommand({action:sideSpotifyPlayerState?.playing===true?'pause':'resume'});});
  $('#sideSpotifyPrev')?.addEventListener('click',()=>{sideSpotifyControlGraceUntil=Date.now()+1200;const p=sideSpotifyCurrentPosition();sendSideSpotifyCommand({action:'previous',positionHint:p});});
  $('#sideSpotifyNext')?.addEventListener('click',()=>{sideSpotifyControlGraceUntil=Date.now()+1200;sendSideSpotifyCommand({action:'next'});});
  $('#sideSpotifyShuffle')?.addEventListener('click',()=>{const on=Boolean(sideSpotifyPlayerState?.shuffleOn);const btn=$('#sideSpotifyShuffle');if(btn){btn.classList.add('pending');btn.textContent=on?'🔀 … OFF':'🔀 … ON';}sendSideSpotifyCommand({action:'shuffleSet',value:!on});});
  $('#sideSpotifyProgress')?.addEventListener('click',e=>{const bar=e.currentTarget,r=bar.getBoundingClientRect();if(!r.width)return;const ratio=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));sendSideSpotifyCommand({action:'seekRatio',ratio});});
  $('#sideSpotifyVolume')?.addEventListener('input',e=>{sideSpotifyVolume=Math.max(0,Math.min(1,Number(e.target.value)/100));renderSideSpotifyVolume();clearTimeout(sideSpotifyVolumeTimer);sideSpotifyVolumeTimer=setTimeout(()=>setSideSpotifyVolume(sideSpotifyVolume),35);});
  $('#sideSpotifyVolume')?.addEventListener('change',()=>{
    // Persist only deliberate user volume changes. Focus/break FX never owns this value.
    chrome.runtime.sendMessage({type:'UPDATE_STUDY',patch:{spotifyVolume:sideSpotifyVolume}}).catch(()=>{});
  });
  $('#onedriveConnectBtn')?.addEventListener('click',()=>window.WarriorOneDriveSync?.connect?.());
  $('#onedriveSyncBtn')?.addEventListener('click',async()=>{
    const btn=$('#onedriveSyncBtn');
    if(btn)btn.disabled=true;
    try{
      // If an app update is already known, capture the unpacked extension folder
      // immediately from this click. Chrome's folder picker requires a live user
      // activation and can be blocked if we wait for OneDrive sync first.
      let updateTarget=null;
      if($('#cloudUpdateStatus')?.dataset.state==='available'){
        try{updateTarget=await window.WarriorCloudUpdate?.prepareSourceFolderFromGesture?.()}catch(e){
          const el=$('#cloudUpdateStatus');if(el){el.textContent=`App update: ${String(e?.message||e).slice(0,110)}`;el.dataset.state='error'}
          return;
        }
      }
      const r=await window.WarriorOneDriveSync?.syncNow?.({userGesture:true,reason:'manual'});
      if(r?.ok!==false){if(window.WarriorAutoUpdate)await window.WarriorAutoUpdate.check();else await window.WarriorCloudUpdate?.smartUpdate?.({userGesture:true,reason:'manual-sync',target:updateTarget})}
    }finally{if(btn)btn.disabled=false;}
  });
  $('#onedriveDisconnectBtn')?.addEventListener('click',()=>window.WarriorOneDriveSync?.disconnect?.());
  $('#debugClearBtn')?.addEventListener('click',clearDebugLog);
  $('#debugExportBtn')?.addEventListener('click',exportDebugLog);
}
function setTab(name){currentTab=name;$$('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));$$('.view').forEach(v=>v.classList.toggle('active',v.id===`view-${name}`));if(name==='assignments')renderAssignments();if(name==='announcements')renderAnnouncements();if(name==='mail')renderMail();if(name==='schedule')renderSchedule();if(name==='study')renderStudyMini()}
async function syncAll(){const b=$('#syncBtn');b.classList.add('syncing');b.disabled=true;b.querySelector('span').textContent='Syncing';try{const r=await chrome.runtime.sendMessage({type:'SYNC_ALL'});if(r.state)state=r.state}catch(e){}b.classList.remove('syncing');b.disabled=false;b.querySelector('span').textContent='Sync';render()}
async function syncMail(){const b=$('#syncMailBtn');b.disabled=true;b.textContent='Capturing…';try{const r=await chrome.runtime.sendMessage({type:'CAPTURE_ACTIVE_MAIL'});if(r.state)state=r.state}finally{b.disabled=false;b.textContent='Capture open Inbox';render()}}
async function openWayneMail(){const b=$('#openMailBtn');b.disabled=true;try{const r=await chrome.runtime.sendMessage({type:'OPEN_WAYNE_MAIL'});if(r.state)state=r.state}finally{b.disabled=false;render()}}
async function refreshSchedule(){
  const b=$('#refreshScheduleBtn');if(!b)return;
  b.disabled=true;b.textContent='Updating schedule…';
  try{
    const r=await chrome.runtime.sendMessage({type:'REFRESH_SCHEDULE'});
    if(r?.state)state=r.state;
    else{const fresh=await chrome.runtime.sendMessage({type:'GET_STATE'}).catch(()=>null);if(fresh?.state)state=fresh.state}
    renderSchedule();renderStatus();
    const status=String(r?.result?.status||'');
    if(status==='ok')b.textContent=`Updated ✓${r?.result?.count?` · ${r.result.count}`:''}`;
    else if(status==='needs-page')b.textContent='Finish in Registration…';
    else if(status==='error')b.textContent='Update failed';
    else b.textContent='Update schedule';
  }catch(e){
    debugLog('schedule-refresh-ui-error',{error:String(e?.message||e)});
    b.textContent='Update failed';
  }finally{
    setTimeout(()=>{b.disabled=false;b.textContent='Update schedule'},1400);
  }
}
function render(){const now=new Date();$('#todayLabel').textContent=new Intl.DateTimeFormat(undefined,{weekday:'long',month:'short',day:'numeric'}).format(now).toUpperCase();renderStatus();renderTodoTop();renderTodoManager();renderToday();renderAssignments();renderAnnouncements();renderMail();renderSchedule();renderStudyMini()}
function renderStatus(){const s=state.sync||{},scheduleSaved=(state.schedule||[]).length>0;const mailMap={ok:'synced',syncing:'syncing',login:'open inbox',ready:'ready',error:'error',never:'not synced'},canvasMap={ok:'full audit ✓',warning:'audit incomplete',syncing:'syncing',login:'login',error:'error',never:'not synced'};$('#statusStrip').innerHTML=[pill('Canvas',s.canvas?.status==='ok'?'ok':s.canvas?.status==='warning'?'warn':['login','error'].includes(s.canvas?.status)?'bad':'',canvasMap[s.canvas?.status]||'idle'),pill('Mail',s.mail?.status==='ok'?'ok':s.mail?.status==='error'?'bad':'',mailMap[s.mail?.status]||'idle'),pill('Schedule',scheduleSaved?'ok':'',scheduleSaved?'saved':'capture once')].join('')}
function pill(n,c,t){return `<span class="status-pill ${c}">${esc(n)} · ${esc(t)}</span>`}
function todoList(){return Array.isArray(state?.todos)?state.todos:[]}
function todoParents(){return todoList().filter(t=>!String(t.parentId||'')&&!t.completed).sort((a,b)=>String(a.dueDate||'9999-99-99').localeCompare(String(b.dueDate||'9999-99-99'))||(Date.parse(a.createdAt||0)||0)-(Date.parse(b.createdAt||0)||0))}
function todoSubs(id){return todoList().filter(t=>String(t.parentId||'')===String(id)&&!t.completed)}
function todoDateLabel(v){if(!v)return'';const d=parseLocalDateKey(v);if(!d)return'';return v===localDateKey(new Date())?'Today':new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric'}).format(d)}
function todoPeekRow(t){return `<div class="todo-peek-row" data-todo-row="${attr(t.id)}"><button class="todo-check" data-todo-check="${attr(t.id)}" title="Done">✓</button><div class="todo-peek-copy"><div class="todo-title">${esc(t.title)}</div>${t.dueDate?`<div class="todo-date">${esc(todoDateLabel(t.dueDate))}</div>`:''}</div></div>`}
function todoManageRow(t){const subs=todoSubs(t.id);return `<div class="todo-manage-row" data-todo-row="${attr(t.id)}"><button class="todo-check" data-todo-check="${attr(t.id)}" title="Done">✓</button><div class="todo-manage-copy"><div class="todo-title">${esc(t.title)}</div>${t.dueDate?`<div class="todo-date">${esc(todoDateLabel(t.dueDate))}</div>`:''}${subs.length?`<div class="todo-subtasks">${subs.map(st=>`<div class="todo-sub-row" data-todo-row="${attr(st.id)}"><button class="todo-check" data-todo-check="${attr(st.id)}" title="Done">✓</button><span class="todo-title">${esc(st.title)}</span></div>`).join('')}</div>`:''}</div><button class="todo-sub-add" data-todo-sub="${attr(t.id)}" title="Add subtask">＋</button></div>`}
function renderTodoTop(){const box=$('#todoQuickList'),top=$('#todoTop');if(!box||!top||!state)return;const rows=todoParents();top.hidden=!rows.length;if(!rows.length){box.innerHTML='';return}box.innerHTML=rows.map(todoPeekRow).join('');const c=$('#todoTopCount');if(c)c.textContent=rows.length>1?`${rows.length} tasks`:''}
function renderTodoManager(){const box=$('#todoManageList');if(!box||!state)return;const rows=todoParents();box.innerHTML=rows.length?rows.map(todoManageRow).join(''):''}
function closeTodoComposer(){document.getElementById('todoCreateLayer')?.remove()}
function openTodoComposer(){
  closeTodoComposer();
  const layer=document.createElement('div');
  layer.id='todoCreateLayer';
  layer.className='todo-create-layer';
  layer.innerHTML=`<section class="todo-create-card" role="dialog" aria-modal="true" aria-labelledby="todoCreateTitle">
    <div class="todo-create-head"><strong id="todoCreateTitle">New task</strong><button id="todoCreateClose" type="button" aria-label="Close">×</button></div>
    <input id="todoCreateText" maxlength="240" placeholder="What do you need to do?" autocomplete="off">
    <div class="todo-create-options"><button id="todoCreateDateToggle" type="button" class="text-btn">+ date</button><input id="todoCreateDate" type="date" aria-label="Optional date" hidden></div>
    <button id="todoCreateSave" class="primary wide" type="button">Add</button>
  </section>`;
  document.body.appendChild(layer);
  const text=layer.querySelector('#todoCreateText'),date=layer.querySelector('#todoCreateDate');
  layer.querySelector('#todoCreateClose')?.addEventListener('click',closeTodoComposer);
  layer.addEventListener('click',e=>{if(e.target===layer)closeTodoComposer()});
  layer.querySelector('#todoCreateDateToggle')?.addEventListener('click',()=>{date.hidden=!date.hidden;if(!date.hidden)setTimeout(()=>date.showPicker?.(),0)});
  layer.querySelector('#todoCreateSave')?.addEventListener('click',addQuickTodo);
  text?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();addQuickTodo()}else if(e.key==='Escape')closeTodoComposer()});
  setTimeout(()=>text?.focus(),0);
}
function todoFxNodes(id){const key=String(id||'');return $$('[data-todo-row]').filter(el=>String(el.dataset.todoRow||'')===key)}
function assignmentFxNodes(id){const key=String(id||'');return $$('[data-assignment-row]').filter(el=>String(el.dataset.assignmentRow||'')===key)}
function taskFxBurst(anchor,tone='done'){
  if(!anchor||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const r=anchor.getBoundingClientRect(),burst=document.createElement('div');burst.className=`task-fx-burst ${tone}`;burst.style.left=`${r.left+r.width/2}px`;burst.style.top=`${r.top+r.height/2}px`;
  const angles=[-88,-55,-24,8,40,72,112,148,190,226];burst.innerHTML=`<i class="task-fx-ring"></i>${angles.map((a,i)=>`<i class="task-fx-particle" style="--a:${a}deg;--d:${22+(i%4)*6}px;--delay:${(i%3)*18}ms"></i>`).join('')}`;
  document.body.appendChild(burst);setTimeout(()=>burst.remove(),760);
}
function taskFxEnterTodo(id){const nodes=todoFxNodes(id);nodes.forEach(n=>{n.classList.remove('task-fx-enter');void n.offsetWidth;n.classList.add('task-fx-enter');setTimeout(()=>n.classList.remove('task-fx-enter'),760)});const anchor=nodes[0]?.querySelector('[data-todo-check]')||nodes[0];if(anchor)taskFxBurst(anchor,'added')}
async function taskFxCompleteTodo(id,anchor){const nodes=todoFxNodes(id);taskFxBurst(anchor||nodes[0]?.querySelector('[data-todo-check]'),'done');nodes.forEach(n=>n.classList.add('task-fx-complete'));if(!matchMedia('(prefers-reduced-motion: reduce)').matches)await new Promise(r=>setTimeout(r,470))}
async function taskFxCompleteAssignment(id,anchor){const nodes=assignmentFxNodes(id);taskFxBurst(anchor||nodes[0]?.querySelector('.assignment-check'),'done');nodes.forEach(n=>n.classList.add('task-fx-complete','assignment-fx-complete'));if(!matchMedia('(prefers-reduced-motion: reduce)').matches)await new Promise(r=>setTimeout(r,470))}
async function addQuickTodo(){const i=$('#todoCreateText'),d=$('#todoCreateDate'),title=String(i?.value||'').trim();if(!title){i?.focus();return}const before=new Set(todoList().map(t=>String(t.id)));const r=await chrome.runtime.sendMessage({type:'ADD_TODO',title,dueDate:String(d?.value||'')});if(r?.state)state=r.state;const added=todoList().find(t=>!before.has(String(t.id)));closeTodoComposer();renderTodoTop();renderTodoManager();renderAssignmentCalendar();if(added)requestAnimationFrame(()=>taskFxEnterTodo(added.id))}
async function addSubTodo(parentId){const title=prompt('Subtask');if(!String(title||'').trim())return;const before=new Set(todoList().map(t=>String(t.id)));const r=await chrome.runtime.sendMessage({type:'ADD_TODO',title:String(title).trim(),parentId});if(r?.state)state=r.state;const added=todoList().find(t=>!before.has(String(t.id)));renderTodoTop();renderTodoManager();renderAssignmentCalendar();if(added)requestAnimationFrame(()=>taskFxEnterTodo(added.id))}
async function toggleTodo(id,anchor){await taskFxCompleteTodo(id,anchor);const r=await chrome.runtime.sendMessage({type:'SET_TODO_COMPLETED',id,completed:true});if(r?.state)state=r.state;renderTodoTop();renderTodoManager();renderAssignmentCalendar();renderStudyMini()}

function renderToday(){
  const nowDate=new Date(),today=dayKey(nowDate),nowMinutes=nowDate.getHours()*60+nowDate.getMinutes();
  const classes=classesForDay(today).sort(compareTime).filter(c=>timeToMinutes(c.endTime||c.startTime)>nowMinutes);
  const todaySection=$('#todayScheduleSection');if(todaySection)todaySection.hidden=!classes.length;
  $('#todayCount').textContent=classes.length?`${classes.length} class${classes.length===1?'':'es'} left`:'';
  $('#todayTimeline').innerHTML=classes.length?classes.map(classCard).join(''):'';
  const next=nextClass(classes);
  $('#nextClassCard').innerHTML=next?`<div class="next-card clickable" data-url="${attr(next.url)}"><div class="eyebrow">NEXT CLASS</div><div class="big">${esc(next.code||next.title||'Class')}</div><div class="meta">${esc(fmtTime(next.startTime))}${next.endTime?` – ${esc(fmtTime(next.endTime))}`:''}${next.location?` · ${esc(next.location)}`:''}</div></div>`:'';
  const now=Date.now(),soon=openAssignments().filter(a=>a.dueAt&&Date.parse(a.dueAt)>=now).slice(0,4);
  $('#dueSoon').innerHTML=soon.length?soon.map(assignmentCard).join(''):empty(state.sync?.canvas?.status==='error'?`Canvas sync error: ${state.sync.canvas.message}`:'Nothing urgent from Canvas.');
  const major=openAssignments().filter(isMajorSoon).sort((a,b)=>Date.parse(a.dueAt||'9999')-Date.parse(b.dueAt||'9999')).slice(0,5);
  const ms=$('#majorSection');if(ms){ms.hidden=!major.length;$('#majorCount').textContent=major.length?`${major.length} coming up`:'';$('#majorDeadlines').innerHTML=major.map(assignmentCard).join('')}
  const important=(state.mail||[]).filter(m=>m.important&&isMailUnread(m)).slice().sort(compareMailNewest).slice(0,3);
  $('#mailPreview').innerHTML=important.length?important.map(mailCard).join(''):empty(state.sync?.mail?.status==='login'?'Open Wayne Mail and finish sign-in; capture will happen automatically.':state.sync?.mail?.message||'No unread important mail.');
  const anns=(state.announcements||[]).filter(isAnnouncementUnread).slice().sort((a,b)=>Date.parse(b.postedAt||0)-Date.parse(a.postedAt||0)).slice(0,3);
  $('#announcementPreview').innerHTML=anns.length?anns.map(announcementCard).join(''):empty('No unread announcements.');
}
function renderAssignments(){
  if(!state)return;renderTodoManager();
  const listBtn=$('#assignmentListViewBtn'),calBtn=$('#assignmentCalendarViewBtn'),listPanel=$('#assignmentListPanel'),calPanel=$('#assignmentCalendarPanel');
  listBtn?.classList.toggle('active',assignmentView==='list');calBtn?.classList.toggle('active',assignmentView==='calendar');
  if(listPanel)listPanel.hidden=assignmentView!=='list';if(calPanel)calPanel.hidden=assignmentView!=='calendar';
  if(assignmentView==='calendar'){renderAssignmentCalendar();return;}
  const f=$('#assignmentFilter')?.value||'open',hidden=new Set((state.hiddenAssignments||[]).map(String)),now=Date.now(),week=now+7*86400000;
  let base=(state.assignments||[]).filter(a=>!hidden.has(String(a.id)));
  const overdue=a=>!isDone(a)&&a.dueAt&&Number.isFinite(Date.parse(a.dueAt))&&Date.parse(a.dueAt)<now;
  const future=a=>!isDone(a)&&(!a.dueAt||!Number.isFinite(Date.parse(a.dueAt))||Date.parse(a.dueAt)>=now);
  let html='';
  if(f==='open'){
    const active=base.filter(future).sort((a,b)=>Date.parse(a.dueAt||'9999')-Date.parse(b.dueAt||'9999'));
    const late=base.filter(overdue).sort((a,b)=>Date.parse(b.dueAt||0)-Date.parse(a.dueAt||0));
    if(active.length) html+=active.map(assignmentCard).join('');
    else html+=empty(state.sync?.canvas?.status==='error'?state.sync.canvas.message:'No current assignments.');
    if(late.length) html+=`<div class="assignment-section overdue-section"><div><span class="overdue-section-title">Overdue</span><span class="overdue-section-count">${late.length}</span></div><div class="overdue-section-note">Kept out of Study Room focus.</div></div>`+late.map(assignmentCard).join('');
  }else{
    let list=base;
    if(f==='week')list=list.filter(a=>!isDone(a)&&a.dueAt&&Date.parse(a.dueAt)>=now&&Date.parse(a.dueAt)<=week);
    if(f==='overdue')list=list.filter(overdue);
    if(f==='done')list=list.filter(isDone);
    if(f==='graded')list=list.filter(assignmentHasGrade);
    if(f==='all'){
      const current=list.filter(a=>!overdue(a)).sort((a,b)=>Date.parse(a.dueAt||'9999')-Date.parse(b.dueAt||'9999'));
      const late=list.filter(overdue).sort((a,b)=>Date.parse(b.dueAt||0)-Date.parse(a.dueAt||0));
      html=current.map(assignmentCard).join('');
      if(late.length)html+=`<div class="assignment-section overdue-section"><div><span class="overdue-section-title">Overdue</span><span class="overdue-section-count">${late.length}</span></div><div class="overdue-section-note">Old work — shown last.</div></div>`+late.map(assignmentCard).join('');
    }else{
      list.sort((a,b)=>Date.parse(a.dueAt||'9999')-Date.parse(b.dueAt||'9999'));
      html=list.map(assignmentCard).join('');
    }
    if(!html)html=empty(state.sync?.canvas?.status==='error'?state.sync.canvas.message:'No assignments in this view.');
  }
  $('#assignmentList').innerHTML=html;
}
function renderAssignmentCalendar(){
  if(!state)return;
  const y=assignmentCalendarCursor.getFullYear(),m=assignmentCalendarCursor.getMonth();
  const monthLabel=$('#assignmentCalendarMonth');if(monthLabel)monthLabel.textContent=new Intl.DateTimeFormat(undefined,{month:'long',year:'numeric'}).format(new Date(y,m,1));
  const hidden=new Set((state.hiddenAssignments||[]).map(String));
  const assignments=(state.assignments||[]).filter(a=>!hidden.has(String(a.id))&&a.dueAt&&Number.isFinite(Date.parse(a.dueAt)));
  const byDate=new Map();for(const a of assignments){const key=localDateKey(new Date(Date.parse(a.dueAt)));if(!byDate.has(key))byDate.set(key,[]);byDate.get(key).push({kind:'assignment',value:a})}
  for(const t of todoList().filter(t=>t.dueDate)){const key=String(t.dueDate);if(!byDate.has(key))byDate.set(key,[]);byDate.get(key).push({kind:'todo',value:t})}
  const first=new Date(y,m,1),start=new Date(y,m,1-first.getDay());
  const todayKey=localDateKey(new Date());let html='';
  for(let i=0;i<42;i++){
    const d=new Date(start);d.setDate(start.getDate()+i);const key=localDateKey(d),items=byDate.get(key)||[],outside=d.getMonth()!==m,selected=key===assignmentCalendarSelectedKey,today=key===todayKey;
    const dots=items.slice(0,4).map(it=>{if(it.kind==='todo')return `<span class="assignment-calendar-dot" style="--dot-color:#6ee7a2" title="${attr(it.value.title)}"></span>`;const imp=importanceInfo(it.value);return `<span class="assignment-calendar-dot" style="--dot-color:${imp.color}" title="${attr(it.value.title)}"></span>`}).join('');
    const hasGrade=items.some(it=>it.kind==='assignment'&&assignmentHasGrade(it.value));
    html+=`<button type="button" class="assignment-calendar-day${outside?' outside':''}${selected?' selected':''}${today?' today':''}" data-calendar-date="${attr(key)}" aria-label="${attr(new Intl.DateTimeFormat(undefined,{weekday:'long',month:'long',day:'numeric'}).format(d))}${items.length?` · ${items.length} assignment${items.length===1?'':'s'}`:''}"><span class="day-num">${d.getDate()}</span>${hasGrade?'<span class="calendar-grade-mark">★</span>':''}<span class="assignment-calendar-dots">${dots}</span>${items.length>4?`<span class="assignment-calendar-more">+${items.length-4}</span>`:''}</button>`;
  }
  const grid=$('#assignmentCalendarGrid');if(grid)grid.innerHTML=html;
  const selectedDate=parseLocalDateKey(assignmentCalendarSelectedKey)||new Date();
  const selected=byDate.get(assignmentCalendarSelectedKey)||[];
  const label=$('#assignmentCalendarSelectedLabel');if(label)label.textContent=new Intl.DateTimeFormat(undefined,{weekday:'short',month:'short',day:'numeric'}).format(selectedDate);
  const count=$('#assignmentCalendarSelectedCount');if(count)count.textContent=selected.length?`${selected.length} item${selected.length===1?'':'s'}`:'No items';
  const agenda=$('#assignmentCalendarAgenda');if(agenda)agenda.innerHTML=selected.length?selected.map(it=>it.kind==='todo'?calendarTodoCard(it.value):calendarAssignmentCard(it.value)).join(''):empty('Nothing due on this day.');
}
function calendarTodoCard(t){return `<div class="card todo-calendar-card${t.completed?' done':''}" data-todo-row="${attr(t.id)}"><div><div class="title todo-title">${esc(t.title)}</div><div class="meta">To-do${t.parentId?' · subtask':''}${t.completed?' · completed':''}</div></div>${t.completed?'':`<div class="assignment-actions"><button class="mini-btn todo-check" data-todo-check="${attr(t.id)}">✓ done</button></div>`}</div>`}
function calendarAssignmentCard(a){const imp=importanceInfo(a),d=new Date(Date.parse(a.dueAt)),time=new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit'}).format(d),done=isDone(a);return `<div class="card assignment clickable ${a.majorKind?'major-assignment':''}${assignmentHasGrade(a)?' graded-assignment':''}" style="--importance-color:${imp.color};--importance-soft:${imp.soft}" data-assignment-row="${attr(a.id)}" data-url="${attr(a.url)}"><div><div class="title">${esc(a.title)}</div><div class="meta">${esc(a.courseName||'Canvas')}</div><div class="calendar-assignment-time">${esc(time)}${effectiveSubmitted(a)?' · submitted':done?' · done':''}</div><div class="calendar-grade-line">${assignmentGradeBadge(a)}</div></div><div class="assignment-actions">${assignmentCheckButton(a)}${assignmentResourceButton(a)}<button class="mini-btn open-assignment" data-url="${attr(a.url)}">open ↗</button></div></div>`}
function localDateKey(value){const d=value instanceof Date?value:new Date(value);if(!Number.isFinite(d.getTime()))return'';return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function parseLocalDateKey(key){const m=String(key||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return null;return new Date(Number(m[1]),Number(m[2])-1,Number(m[3]))}
function renderAnnouncements(){const list=state.announcements||[];$('#announcementList').innerHTML=list.length?list.map(announcementCard).join(''):empty('No announcements yet. Press Sync.')}
function renderMail(){const list=(state.mail||[]).slice().sort((a,b)=>(b.important?1:0)-(a.important?1:0)||(b.unread?1:0)-(a.unread?1:0));$('#mailList').innerHTML=list.length?list.map(mailCard).join(''):empty(state.sync?.mail?.message||'Open Wayne Mail once, then press Capture open Inbox.')}
function renderSchedule(){const saved=(state.schedule||[]).length>0,m=state.scheduleMeta||{};$('#scheduleNotice').innerHTML=saved?`<div class="notice">Saved locally${m.term?` · term ${esc(m.term)}`:''}${m.capturedAt?` · ${esc(new Date(m.capturedAt).toLocaleDateString())}`:''}. Main Sync will not overwrite it.</div>`:`<div class="notice">Capture your registered schedule once. After that it stays saved until you press Update schedule.</div>`;const days=['Mon','Tue','Wed','Thu','Fri'];$('#weekdayTabs').innerHTML=days.map(d=>`<button data-day="${d}" class="${selectedDay===d?'active':''}">${d}</button>`).join('');$$('#weekdayTabs button').forEach(b=>b.addEventListener('click',()=>{selectedDay=b.dataset.day;renderSchedule()}));const list=classesForDay(selectedDay).sort(compareTime);$('#scheduleList').innerHTML=list.length?list.map(classCard).join(''):empty(`No saved classes on ${selectedDay}.`)}
function renderStudyMini(){if(!state)return;const s=state.study||{},remaining=s.running&&s.endAt?Math.max(0,Number(s.endAt)-Date.now()):Number(s.remainingMs||0),label=s.phase==='break'?'Break':'Focus',todo=todoParents()[0];$('#studyMini').innerHTML=`<div class="study-phase">${esc(label)} · cycle ${Number(s.cycles||0)+1}</div><div class="study-time">${fmtCountdown(remaining)}</div><div class="meta">${esc(todo?.title||'To-do clear')}</div><div class="study-controls"><button class="primary" id="studyToggle">${s.running?'Pause':'Start'}</button><button id="studySkip">Skip</button><button id="studyReset">Reset</button></div>`;$('#studyToggle')?.addEventListener('click',()=>studyAction(s.running?'pause':'start'));$('#studySkip')?.addEventListener('click',()=>studyAction('skip'));$('#studyReset')?.addEventListener('click',()=>studyAction('reset'))}
async function studyAction(action){if(action==='start'){try{window.__warriorSpotifyEngineExec?.({action:'resume',seq:`study-start-${Date.now()}-${Math.random()}`})}catch(_){}}const r=await chrome.runtime.sendMessage({type:'STUDY_ACTION',action});if(r.state)state=r.state;renderStudyMini()}

async function initSideSpotifyRemote(){
  const got=await chrome.storage.local.get([SIDE_SPOTIFY_PLAYER_STATE_KEY,SIDE_SPOTIFY_DSP_KEY,SIDE_SPOTIFY_STUDY_SESSION_KEY]).catch(()=>({}));
  sideSpotifyPlayerState=got?.[SIDE_SPOTIFY_PLAYER_STATE_KEY]||null;sideSpotifyStudySession=got?.[SIDE_SPOTIFY_STUDY_SESSION_KEY]||null; sideUpdateSpotifyThemeFromState(sideSpotifyPlayerState,false).catch(()=>{});
  const v=Number(got?.[SIDE_SPOTIFY_DSP_KEY]?.userVolume);if(Number.isFinite(v))sideSpotifyVolume=Math.max(0,Math.min(1,v));
  await refreshSideSpotifyTabContext();
  chrome.tabs.onActivated?.addListener(()=>refreshSideSpotifyTabContext());
  chrome.tabs.onUpdated?.addListener((tabId,changeInfo)=>{if(tabId===sideSpotifyStudyTabId||changeInfo.url)refreshSideSpotifyTabContext();});
  chrome.tabs.onRemoved?.addListener(()=>refreshSideSpotifyTabContext());
  chrome.windows?.onFocusChanged?.addListener(()=>refreshSideSpotifyTabContext());
  renderSideSpotifyVolume();renderSideSpotifyRemote();
}
async function refreshSideSpotifyTabContext(){
  const before={activeIsStudy:sideSpotifyActiveIsStudy,studyTabId:sideSpotifyStudyTabId};
  let detectedActiveIsStudy=false;
  try{
    const studyUrl=chrome.runtime.getURL('study.html');
    const [active]=await chrome.tabs.query({active:true,currentWindow:true});
    detectedActiveIsStudy=Boolean(String(active?.url||active?.pendingUrl||'').startsWith(studyUrl));
    const all=await chrome.tabs.query({});
    const studyTab=all.find(t=>String(t.url||t.pendingUrl||'').startsWith(studyUrl));
    sideSpotifyStudyTabId=studyTab?.id||null;
  }catch(_){detectedActiveIsStudy=false;sideSpotifyStudyTabId=null;}
  sideSpotifyActiveIsStudy=detectedActiveIsStudy;
  sideSpotifyActiveCandidate=null;sideSpotifyActiveCandidateSince=0;clearTimeout(sideSpotifyActiveCommitTimer);
  debugLog('remote-tab-context',{before,detectedActiveIsStudy,after:{activeIsStudy:sideSpotifyActiveIsStudy,studyTabId:sideSpotifyStudyTabId}});
  renderSideSpotifyRemote();
}
async function syncSideSpotifyPhaseFx(prevState=null,forceSteady=false){
  if(!state?.study)return;
  const phase=state.study.phase==='break'?'break':'work';
  const prevPhase=prevState?.study?.phase==='break'?'break':'work';
  const enabled=state.study.phaseFxEnabled!==false;
  const prevEnabled=prevState?.study?.phaseFxEnabled!==false;
  const phaseChanged=Boolean(prevState&&prevPhase!==phase);
  const enabledChanged=Boolean(prevState&&prevEnabled!==enabled);
  if(!forceSteady&&!phaseChanged&&!enabledChanged)return;
  const got=await chrome.storage.local.get(SIDE_SPOTIFY_DSP_KEY).catch(()=>({}));
  const prev=got?.[SIDE_SPOTIFY_DSP_KEY]||{};
  const userVolume=Number.isFinite(Number(prev.userVolume))?Math.max(0,Math.min(1,Number(prev.userVolume))):sideSpotifyVolume;
  const duration=phaseChanged?3:0.2;
  const payload={enabled,phase:enabled?phase:'work',mode:phaseChanged&&enabled?'settle':'steady',nextPhase:null,duration,userVolume,seq:`sidephase-${Date.now()}-${Math.random()}`};
  await chrome.storage.local.set({[SIDE_SPOTIFY_DSP_KEY]:payload}).catch(()=>{});
  clearTimeout(sideSpotifyPhaseSettleTimer);
  if(phaseChanged&&enabled){
    const dspSettleMs=duration*1000*(phase==='work'?2.4:1.45);
    sideSpotifyPhaseSettleTimer=setTimeout(async()=>{
      if(!state?.study||state.study.phase!==phase||state.study.phaseFxEnabled===false)return;
      const g=await chrome.storage.local.get(SIDE_SPOTIFY_DSP_KEY).catch(()=>({}));
      const cur=g?.[SIDE_SPOTIFY_DSP_KEY]||{};
      await chrome.storage.local.set({[SIDE_SPOTIFY_DSP_KEY]:{enabled:true,phase,mode:'steady',nextPhase:null,duration:.25,userVolume:Number.isFinite(Number(cur.userVolume))?Math.max(0,Math.min(1,Number(cur.userVolume))):sideSpotifyVolume,seq:`sidephase-steady-${Date.now()}-${Math.random()}`}}).catch(()=>{});
    },dspSettleMs+260);
  }
}
async function sendSideSpotifyCommand(partial={}){
  if(window.WarriorDesktopMusic?.remote())return window.WarriorDesktopMusic.send(partial);
  const cmd={...partial,seq:`side-${Date.now()}-${Math.random()}`};
  // Only Play/Resume needs to stay inside the user-gesture task for autoplay policy.
  // All other transport goes through Study Room exactly once so queue/history/state
  // bookkeeping and the engine cannot receive duplicate commands.
  if(['resume','play'].includes(String(cmd.action||''))){
    try{const ok=window.__warriorSpotifyEngineExec?.(cmd);if(ok===true)cmd.engineDirect=true}catch(e){debugLog('remote-engine-direct-error',{action:cmd.action,error:String(e?.message||e)})}
  }
  debugLog('remote-command',{cmd,currentState:sideSpotifyPlayerState});
  await chrome.storage.local.set({[SIDE_SPOTIFY_PLAYER_COMMAND_KEY]:cmd}).catch(e=>debugLog('remote-command-error',{error:String(e?.message||e),cmd}));
}
async function setSideSpotifyVolume(volume){
  const v=Math.max(0,Math.min(1,Number(volume)));const got=await chrome.storage.local.get(SIDE_SPOTIFY_DSP_KEY).catch(()=>({}));const prev=got?.[SIDE_SPOTIFY_DSP_KEY]||{};
  await chrome.storage.local.set({[SIDE_SPOTIFY_DSP_KEY]:{...prev,userVolume:v,controlOnly:'volume',seq:`sidevol-${Date.now()}-${Math.random()}`}}).catch(()=>{});
}
function paintVolumeRange(slider,pct){if(!slider)return;const p=Math.max(0,Math.min(100,Number(pct)||0));slider.style.setProperty('--range-pct',`${p}%`);slider.setAttribute('aria-valuenow',String(Math.round(p)));}
function renderSideSpotifyVolume(){const slider=$('#sideSpotifyVolume'),label=$('#sideSpotifyVolumeValue'),pct=Math.round(sideSpotifyVolume*100);if(slider&&document.activeElement!==slider)slider.value=String(pct);paintVolumeRange(slider,pct);if(label)label.textContent=`${pct}%`; }
function sideSpotifyTime(sec){const s=Math.max(0,Math.floor(Number(sec)||0)),m=Math.floor(s/60);return`${m}:${String(s%60).padStart(2,'0')}`}
function sideSpotifyCurrentPosition(){
  const t=sideSpotifyPlayerState||{},duration=Math.max(0,Number(t.duration)||0),base=Math.max(0,Number(t.position)||0),stamp=Number(t.at)||Date.now();
  const canEstimate=t.playing===true&&t.progressConfirmed===true;
  const pos=base+(canEstimate?Math.max(0,Date.now()-stamp)/1000:0);
  return duration?Math.min(duration,pos):pos;
}
function renderSideSpotifyRemote(){
  const box=$('#sideSpotifyRemote'),slot=$('#sideSpotifyRemoteSlot');if(!box||!slot)return;box.classList.add('side-spotify-remote-v527');box.hidden=false;box.style.height='auto';box.style.maxHeight='none';box.style.overflow='visible';const t=sideSpotifyPlayerState||{},session=sideSpotifyStudySession||{};
  // Study Room heartbeats every 5 s. Keep the remote alive from the session heartbeat,
  // not from Spotify playback_update freshness: Spotify may pause telemetry while a
  // new entity buffers even though Study Room itself is healthy.
  // v5.19.30 — visibility must NEVER oscillate on heartbeat/freshness timers.
  // Spotify can keep playing for minutes without publishing fresh metadata, and the
  // Study heartbeat is not guaranteed to land inside an arbitrary 15 s window.
  // Use freshness for diagnostics only; use stable identity + track presence for UI.
  const sessionFresh=Number(session.at||0)>=sideSpotifyRemoteBootAt-250&&Date.now()-Number(session.at||0)<15000;
  const stateFresh=Date.now()-Number(t.at||0)<15000;
  const playerSessionId=String(t.sessionId||'').trim(),studySessionId=String(session.sessionId||'').trim();
  const sessionCompatible=!playerSessionId||!studySessionId||playerSessionId===studySessionId;
  const hasTrack=Boolean(t.hasTrack||t.trackId||String(t.title||'').trim()||Number(t.duration)>1||Number(t.position)>0||t.playing===true);
  const show=Boolean(sideSpotifyStudyTabId)&&sessionCompatible&&hasTrack&&!sideSpotifyActiveIsStudy;
  slot.hidden=!show;box.hidden=false;
  const ds=JSON.stringify([show,sideSpotifyStudyTabId,sideSpotifyActiveIsStudy,sessionFresh,stateFresh,sessionCompatible,hasTrack,t.sessionId,session.sessionId,t.trackId,t.title,t.playing,t.shuffleOn]);if(ds!==lastRemoteDebugSig){lastRemoteDebugSig=ds;debugLog('remote-render-decision',{show,studyTabId:sideSpotifyStudyTabId,activeIsStudy:sideSpotifyActiveIsStudy,sessionFresh,stateFresh,sessionCompatible,hasTrack,playerSessionId:t.sessionId,studySessionId:session.sessionId,playerAt:t.at,sessionAt:session.at,trackId:t.trackId,title:t.title,playing:t.playing,shuffleOn:t.shuffleOn,state:t});}
  if(!show)return;
  const title=String(t.title||'').trim()||(t.trackId?'Spotify track':'Starting Spotify…'),artist=String(t.artist||'').trim()||(t.catalogError?'Metadata unavailable':'Spotify');const titleEl=$('#sideSpotifyTitle'),artistEl=$('#sideSpotifyArtist');if(titleEl){titleEl.textContent=title;titleEl.title=title}if(artistEl){artistEl.textContent=artist;artistEl.title=artist}
  const art=$('#sideSpotifyArt'),artwork=String(t.artwork||'').trim();if(art){art.textContent=artwork?'':'♫';art.style.backgroundImage=artwork?`url(${JSON.stringify(artwork).slice(1,-1)})`:'none';}sideUpdateSpotifyThemeFromState(t,false).catch(()=>{});
  const duration=Math.max(0,Number(t.duration)||0),base=Math.max(0,Number(t.position)||0),stamp=Number(t.at)||Date.now();
  const canEstimate=t.playing===true&&t.progressConfirmed===true;
  const rate=1;
  const pos=duration?Math.min(duration,base+(canEstimate?Math.max(0,Date.now()-stamp)/1000*rate:0)):base,pct=duration?Math.max(0,Math.min(100,pos/duration*100)):0;
  const fill=$('#sideSpotifyProgressFill');if(fill)fill.style.width=`${pct}%`;const progress=$('#sideSpotifyProgress');if(progress){progress.setAttribute('aria-valuemin','0');progress.setAttribute('aria-valuemax','100');progress.setAttribute('aria-valuenow',String(Math.round(pct)));progress.title=duration?`${sideSpotifyTime(pos)} / ${sideSpotifyTime(duration)} · click to seek`:'Waiting for Spotify timing…';}
  $('#sideSpotifyElapsed').textContent=sideSpotifyTime(pos);$('#sideSpotifyRemaining').textContent=`−${sideSpotifyTime(Math.max(0,duration-pos))}`;
  const toggle=$('#sideSpotifyToggle');if(toggle){const playing=t.playing===true;toggle.textContent=playing?'Ⅱ':'▶';toggle.title=playing?'Pause':'Play';toggle.setAttribute('aria-label',toggle.title);}
  const shuffle=$('#sideSpotifyShuffle');if(shuffle){const on=Boolean(t.shuffleOn);shuffle.classList.remove('pending','smart');shuffle.classList.toggle('on',on);shuffle.setAttribute('aria-pressed',String(on));shuffle.textContent=on?'🔀 ON':'🔀 OFF';shuffle.title=on?`Warrior Shuffle on${t.queueSize?` · ${t.queueSize} tracks known`:''}`:'Shuffle off';}
  renderSideSpotifyVolume();
}

function assignmentCard(a){const due=dueInfo(a.dueAt),done=isDone(a),imp=importanceInfo(a),major=Boolean(a.majorKind),details=importanceDetails(a);return `<div class="card assignment clickable ${major?'major-assignment':''}${assignmentHasGrade(a)?' graded-assignment':''}" style="--importance-color:${imp.color};--importance-soft:${imp.soft}" data-assignment-row="${attr(a.id)}" data-url="${attr(a.url)}"><div><div class="title">${esc(a.title)}</div><div class="meta">${esc(a.courseName||'Canvas')}</div><div style="margin-top:6px">${major?`<span class="badge major">🔥 ${esc(String(a.majorKind).toUpperCase())}</span>`:''}${assignmentGradeBadge(a)}${effectiveSubmitted(a)?'<span class="badge ok">submitted</span>':done?'<span class="badge ok">done</span>':''}${due?`<span class="badge ${due.cls}">${esc(due.text)}</span>`:'<span class="badge">no due date</span>'}</div><div class="importance-row"><span class="importance-chip"><span class="importance-dot"></span>${esc(imp.label)} importance</span>${details?`<span class="grade-impact">${esc(details)}</span>`:''}</div></div><div class="assignment-actions">${assignmentCheckButton(a)}${assignmentResourceButton(a)}<button class="mini-btn open-assignment" data-url="${attr(a.url)}">open ↗</button></div></div>`}

function importanceInfo(a){const score=Math.max(0,Math.min(100,Number(a.importanceScore??fallbackImportanceScore(a))||0)),hue=Math.round(120-(score*1.2)),label=a.importanceLabel||importanceLabelFromScore(score);return{score,label,color:`hsl(${hue} 82% 62%)`,soft:`hsla(${hue},82%,55%,.10)`}}
function fallbackImportanceScore(a){const t=String(a.title||'').toLowerCase();if(/\b(final|midterm|exam|test)\b/.test(t))return 92;if(/\b(project|capstone|presentation|paper|essay)\b/.test(t))return 84;if(/\bquiz\b/.test(t))return 44;const p=Number(a.points||0);if(p>=100)return 72;if(p>=50)return 58;if(p>=20)return 45;if(p>0)return 30;return 22}
function importanceLabelFromScore(s){if(s>=90)return'Critical';if(s>=75)return'Very high';if(s>=55)return'High';if(s>=35)return'Medium';return'Low'}
function importanceDetails(a){const bits=[];if(Number.isFinite(Number(a.points)))bits.push(`${fmtNum(a.points)} pts`);if(a.groupName&&Number.isFinite(Number(a.groupWeight)))bits.push(`${a.groupName} ${fmtNum(a.groupWeight)}%`);if(Number(a.estimatedGradeImpact)>0)bits.push(`≈${fmtNum(a.estimatedGradeImpact)}% of grade`);return bits.join(' · ')}
function fmtNum(v){const n=Number(v);if(!Number.isFinite(n))return'';return Number.isInteger(n)?String(n):n.toFixed(n<10?1:0)}
function isMajorSoon(a){if(isDone(a)||!a.dueAt)return false;const due=Date.parse(a.dueAt),d=due-Date.now();if(!Number.isFinite(d))return false;const majorByType=Boolean(a.majorKind),majorByWeight=Number(a.estimatedGradeImpact||0)>=7.5||Number(a.importanceScore||0)>=90;return (majorByType||majorByWeight)&&d>=-7*86400000&&d<=21*86400000}
function announcementCard(a){const unread=isAnnouncementUnread(a);return `<div class="card clickable" data-announcement-id="${attr(a.id)}" data-url="${attr(a.url)}"><div class="mail-head"><div class="title">${esc(a.title)}</div>${unread?'<span class="badge warn">unread</span>':''}</div><div class="meta">${esc(a.courseName||'')}${a.postedAt?` · ${esc(relativeDate(a.postedAt))}`:''}</div>${a.message?`<div class="announcement-text">${esc(a.message)}</div>`:''}</div>`}
function mailCard(m){const unread=isMailUnread(m);return `<div class="card mail-card clickable ${m.important?'important':''}" data-mail-id="${attr(m.id)}" data-url="${attr(m.url||urls?.outlook)}"><div class="mail-head"><div class="title">${m.important?'⚠️ ':''}${esc(m.subject||'Wayne Mail')}</div>${unread?'<span class="badge warn">unread</span>':''}</div><div class="meta">${esc(m.sender||'Wayne Mail')}${m.timeText?` · ${esc(m.timeText)}`:''}</div>${m.snippet?`<div class="announcement-text">${esc(m.snippet)}</div>`:''}</div>`}
function classCard(c){return `<div class="card clickable" data-url="${attr(c.url)}"><div class="row"><div class="time">${esc(fmtTime(c.startTime)||'—')}</div><div style="min-width:0"><div class="course">${esc(c.code||c.title||'Class')}</div>${c.title&&c.title!==c.code?`<div class="meta">${esc(c.title)}</div>`:''}<div class="meta">${c.endTime?`until ${esc(fmtTime(c.endTime))}`:''}${c.location?` · ${esc(c.location)}`:''}${c.instructor?` · ${esc(c.instructor)}`:''}</div></div></div></div>`}
async function handleDynamicClick(e){const tc=e.target.closest('[data-todo-check]');if(tc){e.preventDefault();e.stopPropagation();if(tc.dataset.fxBusy==='1')return;tc.dataset.fxBusy='1';try{await toggleTodo(tc.dataset.todoCheck,tc)}finally{delete tc.dataset.fxBusy}return}const ts=e.target.closest('[data-todo-sub]');if(ts){e.preventDefault();e.stopPropagation();await addSubTodo(ts.dataset.todoSub);return}const day=e.target.closest('[data-calendar-date]');if(day){e.preventDefault();assignmentCalendarSelectedKey=day.dataset.calendarDate;const d=parseLocalDateKey(assignmentCalendarSelectedKey);if(d)assignmentCalendarCursor=new Date(d.getFullYear(),d.getMonth(),1);renderAssignmentCalendar();return}const check=e.target.closest('.assignment-check[data-id]');if(check){e.preventDefault();e.stopPropagation();if(check.dataset.fxBusy==='1')return;check.dataset.fxBusy='1';const submitted=check.dataset.submitted!=='false';try{if(submitted)await taskFxCompleteAssignment(check.dataset.id,check);const r=await chrome.runtime.sendMessage({type:'TOGGLE_ASSIGNMENT_SUBMITTED',id:check.dataset.id,submitted});if(r?.state)state=r.state;renderAssignments();renderToday();renderStudyMini();if(!submitted){const nodes=assignmentFxNodes(check.dataset.id);nodes.forEach(n=>{n.classList.add('task-fx-enter');setTimeout(()=>n.classList.remove('task-fx-enter'),760)})}}finally{delete check.dataset.fxBusy}return}const resource=e.target.closest('.assignment-resource');if(resource){e.preventDefault();e.stopPropagation();const kind=String(resource.dataset.resourceKind||'').trim();const u=String(resource.dataset.resourceUrl||'').trim();if(kind==='calculus'||kind==='chem2lab'){await chrome.runtime.sendMessage({type:'OPEN_COURSE_RESOURCE',kind});}else if(u){if(u.startsWith('chrome-extension://'))await chrome.tabs.create({url:u,active:true});else await chrome.runtime.sendMessage({type:'OPEN_URL',url:u});}return}const hide=e.target.closest('.hide-assignment');if(hide){e.preventDefault();e.stopPropagation();const r=await chrome.runtime.sendMessage({type:'HIDE_ASSIGNMENT',id:hide.dataset.id});if(r.state)state=r.state;renderAssignments();renderToday();return}const open=e.target.closest('.open-assignment');if(open){e.preventDefault();e.stopPropagation();if(open.dataset.url)await chrome.runtime.sendMessage({type:'OPEN_URL',url:open.dataset.url});return}const card=e.target.closest('.clickable[data-url]');if(card){e.preventDefault();const annId=String(card.dataset.announcementId||'').trim(),mailId=String(card.dataset.mailId||'').trim();if(annId||mailId){const r=await chrome.runtime.sendMessage({type:'MARK_PREVIEW_READ',kind:mailId?'mail':'announcement',id:mailId||annId});if(r?.state)state=r.state;renderToday();if(currentTab==='announcements')renderAnnouncements();if(currentTab==='mail')renderMail()}const u=card.dataset.url;if(u)await chrome.runtime.sendMessage({type:'OPEN_URL',url:u})}}
function previewReadSet(kind){return new Set((state?.previewRead?.[kind]||[]).map(String))}
function isAnnouncementUnread(a){return a?.unread!==false&&!previewReadSet('announcements').has(String(a?.id??''))}
function isMailUnread(m){return m?.unread!==false&&!previewReadSet('mail').has(String(m?.id??''))}
function compareMailNewest(a,b){const ai=Number(a?.inboxIndex),bi=Number(b?.inboxIndex),af=Number.isFinite(ai),bf=Number.isFinite(bi);if(af&&bf)return ai-bi;if(af)return-1;if(bf)return 1;return 0}
function openAssignments(){const h=new Set((state.hiddenAssignments||[]).map(String)),now=Date.now();return(state.assignments||[]).filter(a=>!h.has(String(a.id))&&!isDone(a)&&(!a.dueAt||!Number.isFinite(Date.parse(a.dueAt))||Date.parse(a.dueAt)>=now)).sort((a,b)=>Date.parse(a.dueAt||'9999')-Date.parse(b.dueAt||'9999'))}function isDone(a){return Boolean(a.completed||a.submitted||a.canvasSubmitted||manualSubmitted(a))}function classesForDay(d){return(state.schedule||[]).filter(c=>(c.days||[]).includes(d))}function dayKey(d){return['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()]}function compareTime(a,b){return String(a.startTime||'99:99').localeCompare(String(b.startTime||'99:99'))}function nextClass(cs){const n=new Date().getHours()*60+new Date().getMinutes();return cs.find(c=>timeToMinutes(c.endTime||c.startTime)>=n)||null}function timeToMinutes(t){if(!t)return 9999;const[h,m]=t.split(':').map(Number);return h*60+m}function fmtTime(t){if(!t)return'';const[h,m]=t.split(':').map(Number),d=new Date();d.setHours(h,m,0,0);return new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit'}).format(d)}function fmtCountdown(ms){const total=Math.max(0,Math.ceil(ms/1000)),m=Math.floor(total/60),s=total%60;return`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`}
function dueInfo(iso){if(!iso)return null;const t=Date.parse(iso);if(!Number.isFinite(t))return null;const d=t-Date.now();if(d<0)return{text:`overdue ${relativeDuration(-d,false)}`,cls:'danger'};if(d<86400000)return{text:`due ${relativeDuration(d)}`,cls:'warn'};return{text:`due ${new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(t))}`,cls:''}}function relativeDuration(ms,f=true){const h=Math.max(1,Math.round(ms/3600000)),b=h<24?`${h}h`:`${Math.round(h/24)}d`;return f?`in ${b}`:b}function relativeDate(iso){const d=Math.max(0,Math.round((Date.now()-Date.parse(iso))/86400000));return d===0?'today':d===1?'yesterday':`${d}d ago`}function empty(t){return`<div class="empty">${esc(t)}</div>`}function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}function attr(v){return esc(v||'')}function openUrlKey(k){const u=urls?.[k];if(u)chrome.runtime.sendMessage({type:'OPEN_URL',url:u})}
