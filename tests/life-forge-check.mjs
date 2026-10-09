import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const names=['forgeStudyContext','forgeStartPhone','forgeClosePhone','timerRemaining','renderTimer','toggleTimer','resetTimer','merge'];
const funcs=names.map(name=>{const s=source.split('\n').find(l=>l.startsWith('function '+name+'('));assert(s,name);return s;}).join('\n');
let now=Date.now()-7200000,id=0;
class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
const values={},ctx=vm.createContext({Date:Clock,crypto:{randomUUID:()=>String(++id)},structuredClone,window:{LifeForgeSourceBridge:{notify(){}}},timer:{running:false,remainingMs:3000000,endAt:0},state:{study:{}},TIMER_KEY:'timer',forgeStudyContextKey:'subject',loadJson:(key,fallback)=>values[key]??fallback,saveJson:(key,value)=>values[key]=structuredClone(value),markClock(){},saveLocalCloud(){},schedulePush(){},remoteIsFresh:()=>false,$:()=>null,getPath:(o,p)=>p.split('.').reduce((x,k)=>x?.[k],o),setPath:(o,p,v)=>{let keys=p.split('.'),last=keys.pop(),r=o;for(const k of keys)r=r[k]||(r[k]={});r[last]=v;},trackedPaths:()=>['study.lifeForgeSegments'],mergeNoteBooks:()=>({})});
vm.runInContext(funcs,ctx);values.subject={courseName:'MAT 2120',topic:'Integration'};
ctx.toggleTimer();now+=5000;ctx.toggleTimer();assert.equal(ctx.state.study.lifeForgeSegments.length,1);assert.equal(Date.parse(ctx.state.study.lifeForgeSegments[0].endedAt)-Date.parse(ctx.state.study.lifeForgeSegments[0].startedAt),5000);assert.equal(ctx.state.study.lifeForgeSegments[0].topic,'Integration');
now+=100000;ctx.toggleTimer();now+=10000;ctx.toggleTimer();assert.equal(ctx.state.study.lifeForgeSegments.length,2);assert.notEqual(ctx.state.study.lifeForgeSegments[0].id,ctx.state.study.lifeForgeSegments[1].id);
ctx.toggleTimer();const end=ctx.timer.endAt;now=end+60000;ctx.remoteIsFresh=()=>true;ctx.remoteLive={study:{running:true}};ctx.remoteTime=String;ctx.remoteRemaining=()=>1000;ctx.renderTimer();assert.equal(Date.parse(ctx.state.study.lifeForgeSegments.at(-1).endedAt),end,'Expiry is capped even when desktop live UI has priority');assert.equal(ctx.timer.phase,'break');assert.equal(ctx.timer.running,false);
const a=ctx.state.study.lifeForgeSegments[0],b=ctx.state.study.lifeForgeSegments[1];const merged=ctx.merge({study:{lifeForgeSegments:[a]}},{study:{lifeForgeSegments:[a,b]}},{'study.lifeForgeSegments':20},{'study.lifeForgeSegments':10},0);assert.equal(merged.state.study.lifeForgeSegments.length,2,'Sessions union survives lower remote clock');
// Actual helper refuses unrelated origins/windows before reading private source data.
let listener,readCount=0,receiver={closed:false,postMessage(...args){messages.push(args)}},messages=[],button;
const node=()=>({style:{},append(){},addEventListener(type,fn){if(type==='click')button=fn;}});
const bridge=vm.createContext({window:{addEventListener(_,fn){listener=fn},open:()=>receiver},document:{createElement:node,body:node()},Date,encodeURIComponent});
vm.runInContext(readFileSync(new URL('../life-forge-client.js',import.meta.url),'utf8'),bridge);
bridge.window.LifeForgeSourceBridge.attach({kind:'warrior-hub',getSnapshot:()=>{readCount++;return {payload:{sessions:[]}};}});button();
listener({origin:'https://attacker.test',source:receiver,data:{source:'warrior-hub',type:'LIFE_FORGE_SOURCE_PULL',nonce:'x'}});listener({origin:'https://life-forge.sassycocoa.chatgpt.site',source:{},data:{source:'warrior-hub',type:'LIFE_FORGE_SOURCE_PULL',nonce:'x'}});assert.equal(readCount,0);
listener({origin:'https://life-forge.sassycocoa.chatgpt.site',source:receiver,data:{source:'warrior-hub',type:'LIFE_FORGE_SOURCE_PULL',nonce:'correct'}});await Promise.resolve();assert.equal(readCount,1);assert.equal(messages[0][0].nonce,'correct');assert.equal(messages[0][1],'https://life-forge.sassycocoa.chatgpt.site');
console.log('Passed phone pause/resume and exact timer expiry, local/desktop coexistence, OneDrive session union, and source bridge origin/window/nonce checks.');
