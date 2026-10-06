(() => {
  if (window.__warriorChatgptHandoffLoadedV515) return;
  window.__warriorChatgptHandoffLoadedV515 = true;

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const visible = el => !!(el && el.isConnected && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
  const norm = v => String(v || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const textOf = el => String(el?.innerText || el?.textContent || el?.getAttribute?.('aria-label') || '').replace(/\s+/g, ' ').trim();
  const projectPath = path => /^\/g\/g-p-[^/]+(?:\/project)?(?:$|[/?#])/i.test(String(path || ''));
  const projectHref = href => {
    try { const u=new URL(href,location.origin); return u.origin==='https://chatgpt.com' && projectPath(u.pathname); }
    catch (_) { return false; }
  };
  const onProjectHome = () => projectPath(location.pathname) && !/\/c\//i.test(location.pathname);
  const onProjectChat = () => projectPath(location.pathname) && /\/c\//i.test(location.pathname);

  async function dbg(event,data={}) {
    try { await chrome.runtime.sendMessage({type:'DEBUG_LOG',source:'chatgpt-coach',event,data}); } catch (_) {}
  }
  async function setStatus(id,status,extra={}) {
    await dbg(status,{handoffId:id,...extra});
    try { await chrome.runtime.sendMessage({type:'CHATGPT_HANDOFF_STATUS',id,status,...extra}); } catch (_) {}
  }
  async function cacheProject(name,href=location.href) {
    try { await chrome.runtime.sendMessage({type:'CACHE_CHATGPT_PROJECT',projectName:name,href}); } catch (_) {}
  }

  function findComposer() {
    const selectors = [
      '#prompt-textarea',
      'textarea[data-testid="prompt-textarea"]',
      'textarea[placeholder*="Message" i]',
      'div[contenteditable="true"][data-lexical-editor="true"]',
      'div.ProseMirror[contenteditable="true"]',
      'form [contenteditable="true"][role="textbox"]',
      'form [contenteditable="true"]'
    ];
    for (const sel of selectors) {
      const el = [...document.querySelectorAll(sel)].find(visible);
      if (el) return el;
    }
    return null;
  }

  function setNativeValue(el,text) {
    if (!el) return false;
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto,'value');
    if (desc?.set) desc.set.call(el,text); else el.value=text;
    el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:text}));
    el.dispatchEvent(new Event('change',{bubbles:true}));
    el.focus();
    try { el.setSelectionRange(text.length,text.length); } catch (_) {}
    return String(el.value||'').trim().length>0;
  }

  function setContentEditable(el,text) {
    el.focus();
    try {
      const sel=window.getSelection(),range=document.createRange();
      range.selectNodeContents(el); sel.removeAllRanges(); sel.addRange(range);
      if(document.execCommand('insertText',false,text)){
        el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:text}));
        return (el.innerText||el.textContent||'').trim().length>0;
      }
    } catch (_) {}
    try {
      el.replaceChildren();
      for(const line of String(text).split('\n')){
        const p=document.createElement('p');
        if(line)p.textContent=line; else p.appendChild(document.createElement('br'));
        el.appendChild(p);
      }
      el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:text}));
      el.dispatchEvent(new Event('change',{bubbles:true}));
      el.focus();
      const sel=window.getSelection(),range=document.createRange();
      range.selectNodeContents(el); range.collapse(false); sel.removeAllRanges(); sel.addRange(range);
      return (el.innerText||el.textContent||'').trim().length>0;
    } catch (_) { return false; }
  }
  function insertPrompt(el,text){
    if(el instanceof HTMLTextAreaElement||el instanceof HTMLInputElement)return setNativeValue(el,text);
    if(el?.isContentEditable)return setContentEditable(el,text);
    return false;
  }

  function projectLinkNear(el,wanted) {
    let p=el;
    for(let i=0;i<7&&p;i++,p=p.parentElement){
      if(p.matches?.('a[href]')&&projectHref(p.getAttribute('href')))return p;
      const links=[...p.querySelectorAll?.('a[href]')||[]].filter(a=>visible(a)&&projectHref(a.getAttribute('href')));
      const exact=links.find(a=>norm(textOf(a))===wanted||norm(textOf(a)).includes(wanted));
      if(exact)return exact;
      const r=p.getBoundingClientRect?.();
      if(r&&(r.height>220||r.width>1400))break;
    }
    return null;
  }

  function findProjectTarget(name) {
    const wanted=norm(name);
    const anchors=[...document.querySelectorAll('a[href]')].filter(a=>projectHref(a.getAttribute('href'))&&visible(a));
    const exact=anchors.find(a=>norm(textOf(a))===wanted);
    if(exact)return exact;
    const contains=anchors.find(a=>norm(textOf(a)).includes(wanted));
    if(contains)return contains;

    const textNodes=[...document.querySelectorAll('a[href] *,button *,[role="button"] *,div,span')]
      .filter(visible)
      .filter(el=>norm(textOf(el))===wanted);
    for(const el of textNodes){
      const a=projectLinkNear(el,wanted);
      if(a)return a;
    }
    return null;
  }

  function findProjectClickable(name) {
    const linked=findProjectTarget(name);
    if(linked)return linked;
    const wanted=norm(name);
    const modal=findCreateProjectModal();
    const nodes=[...document.querySelectorAll('span,p,h1,h2,h3,h4,div,[role="cell"],[role="gridcell"]')]
      .filter(visible)
      .filter(el=>norm(textOf(el))===wanted)
      .filter(el=>!modal||!modal.contains(el));
    for(const el of nodes){
      // Never treat the Projects search UI or the create-project dialog as a project row.
      if(el.closest('label')?.querySelector?.('input'))continue;
      if(el.closest('form')?.querySelector?.('input[type="search"]'))continue;
      const linkedNear=projectLinkNear(el,wanted);
      if(linkedNear)return linkedNear;
      let p=el;
      for(let i=0;i<6&&p;i++,p=p.parentElement){
        if(modal&&modal.contains(p))break;
        const input=p.querySelector?.('input,textarea');
        if(input&&/search|пошук|поиск/i.test(`${input.placeholder||''} ${input.getAttribute?.('aria-label')||''}`))break;
        if(p.matches?.('button,[role="button"],[role="row"],tr,[tabindex]')&&visible(p))return p;
        const r=p.getBoundingClientRect?.();
        const cursor=window.getComputedStyle?.(p)?.cursor;
        if(r&&cursor==='pointer'&&r.height>24&&r.height<180&&r.width>80&&r.width<1200&&visible(p))return p;
        if(r&&(r.height>220||r.width>1400))break;
      }
    }
    return null;
  }

  async function openProjectTarget(target,name,handoffId) {
    if(!target)return false;
    const anchor=target.matches?.('a[href]')?target:target.closest?.('a[href]');
    if(anchor&&projectHref(anchor.getAttribute('href'))){
      await cacheProject(name,anchor.href);
      await setStatus(handoffId,'opening-project',{projectName:name});
      location.assign(anchor.href);
      return true;
    }
    const before=location.href;
    await dbg('project-row-click',{projectName:name,tag:target.tagName||'',role:target.getAttribute?.('role')||''});
    target.click();
    const end=Date.now()+7000;
    while(Date.now()<end){
      if(location.href!==before&&(onProjectHome()||onProjectChat())){
        await cacheProject(name,location.href);
        return true;
      }
      if(onProjectHome()||onProjectChat()){
        await cacheProject(name,location.href);
        return true;
      }
      await sleep(150);
    }
    return false;
  }

  function explicitNoProjectResults() {
    if(!/^\/projects(?:\/|$)/i.test(location.pathname))return false;
    const modal=findCreateProjectModal();
    const phrases=[
      'No projects','No projects found','No results','No results found',
      'Немає проєктів','Немає проектів','Проєктів не знайдено','Проектів не знайдено','Нічого не знайдено',
      'Нет проектов','Проекты не найдены','Ничего не найдено'
    ].map(norm);
    return [...document.querySelectorAll('div,span,p,h2,h3')].filter(visible).some(el=>{
      if(modal&&modal.contains(el))return false;
      const t=norm(textOf(el));
      return phrases.some(p=>t===p||t.startsWith(p+' '));
    });
  }

  const CREATE_GUARD_KEY='warriorCoachProjectCreateGuardV515';
  async function creationAlreadyAttempted(name){
    try{
      const got=await chrome.storage.local.get(CREATE_GUARD_KEY);
      return !!got?.[CREATE_GUARD_KEY]?.[norm(name)];
    }catch(_){return true}
  }
  async function markCreationAttempt(name,handoffId){
    try{
      const got=await chrome.storage.local.get(CREATE_GUARD_KEY);
      const map={...(got?.[CREATE_GUARD_KEY]||{})};
      map[norm(name)]={at:Date.now(),handoffId:String(handoffId||'')};
      await chrome.storage.local.set({[CREATE_GUARD_KEY]:map});
    }catch(_){}
  }

  function findByText(patterns,root=document) {
    const pats=patterns.map(norm);
    const els=[...root.querySelectorAll('button,a,[role="button"],[role="menuitem"]')].filter(visible);
    return els.find(el=>pats.some(p=>norm(textOf(el))===p)) ||
           els.find(el=>pats.some(p=>norm(textOf(el)).includes(p))) || null;
  }

  function findProjectsSearchInput() {
    if(!/^\/projects(?:\/|$)/i.test(location.pathname))return null;
    const modal=findCreateProjectModal();
    const candidates=[...document.querySelectorAll('input')].filter(visible).filter(el=>!modal||!modal.contains(el));
    let best=null,bestScore=-1;
    for(const el of candidates){
      const meta=norm(`${el.type||''} ${el.placeholder||''} ${el.getAttribute('aria-label')||''} ${el.name||''}`);
      let score=0;
      if(el.type==='search')score+=6;
      if(/search|пошук|поиск/.test(meta))score+=6;
      const r=el.getBoundingClientRect();
      if(r.top<180&&r.width>180)score+=2;
      if(score>bestScore){best=el;bestScore=score}
    }
    return bestScore>=2?best:null;
  }

  function findCreateProjectModal() {
    const titles=['Create project','Створити проект','Створити проєкт','Создать проект'];
    const titleEls=[...document.querySelectorAll('h1,h2,h3,[role="heading"],div,span')]
      .filter(visible)
      .filter(el=>titles.some(t=>norm(textOf(el))===norm(t)));
    const candidates=[];
    for(const title of titleEls){
      let p=title;
      for(let i=0;i<9&&p;i++,p=p.parentElement){
        if(!visible(p))continue;
        const inputs=[...p.querySelectorAll('input,textarea')].filter(visible);
        const buttons=[...p.querySelectorAll('button,[role="button"]')].filter(visible);
        if(inputs.length&&buttons.some(b=>/create project|створити проект|створити проєкт|создать проект|^create$|^створити$|^создать$/i.test(norm(textOf(b))))){
          const r=p.getBoundingClientRect();
          candidates.push({el:p,area:Math.max(1,r.width*r.height)});
          break;
        }
      }
    }
    candidates.sort((a,b)=>a.area-b.area);
    return candidates[0]?.el||null;
  }

  function projectNameInput(modal) {
    if(!modal)return null;
    const labels=[...modal.querySelectorAll('label,[data-slot="label"],div,span,p')].filter(visible);
    const label=labels.find(el=>/^(project name|назва проєкту|назва проекту|имя проекта|название проекта)$/i.test(norm(textOf(el))));
    if(label){
      if(label.htmlFor){
        const byId=modal.querySelector(`#${CSS.escape(label.htmlFor)}`);
        if(byId&&visible(byId))return byId;
      }
      let p=label;
      for(let i=0;i<4&&p;i++,p=p.parentElement){
        const input=[...p.querySelectorAll('input[type="text"],input:not([type]),textarea')].find(visible);
        if(input)return input;
      }
    }
    const inputs=[...modal.querySelectorAll('input[type="text"],input:not([type]),textarea')].filter(visible);
    return inputs.find(el=>!/search|пошук|поиск/i.test(`${el.placeholder||''} ${el.getAttribute('aria-label')||''} ${el.name||''}`))||null;
  }

  function createProjectButton(modal) {
    if(!modal)return null;
    const buttons=[...modal.querySelectorAll('button,[role="button"]')].filter(visible);
    const exact=['Create project','Створити проект','Створити проєкт','Создать проект'];
    return buttons.find(b=>exact.some(x=>norm(textOf(b))===norm(x))) ||
           buttons.find(b=>['Create','Створити','Создать'].some(x=>norm(textOf(b))===norm(x))) || null;
  }

  async function waitForProjectLink(name,ms=3500) {
    const end=Date.now()+ms;
    while(Date.now()<end){
      const link=findProjectTarget(name);
      if(link)return link;
      await sleep(200);
    }
    return null;
  }

  function projectMainRoot(){
    return document.querySelector('main,[role="main"]') || document.body;
  }

  function findFreshProjectChatControl(){
    const root=projectMainRoot();
    const exact=[
      'Chat','New chat','Start chat','Start a chat','New conversation',
      'Новий чат','Почати чат','Почати новий чат','Новий діалог',
      'Новый чат','Начать чат','Новый диалог'
    ].map(norm);
    const candidates=[...root.querySelectorAll('button,a[href],[role="button"],[role="tab"]')].filter(visible).filter(el=>!el.closest('aside,nav'));
    const score=el=>{
      const t=norm(textOf(el));
      let n=exact.includes(t)?20:0;
      if(/new chat|start(?: a)? chat|new conversation|новий чат|почати.*чат|новый чат|начать.*чат/.test(t))n+=14;
      const aria=norm(el.getAttribute?.('aria-label')||'');
      if(exact.includes(aria))n+=18;
      if(/new chat|start(?: a)? chat|new conversation|новий чат|почати.*чат|новый чат|начать.*чат/.test(aria))n+=14;
      const test=norm(el.getAttribute?.('data-testid')||'');
      if(/new.?chat|project.?chat|start.?chat/.test(test))n+=24;
      const href=String(el.getAttribute?.('href')||'');
      if(href&&projectHref(href))n+=6;
      const r=el.getBoundingClientRect();
      if(r.top>0&&r.top<700)n+=2;
      return n;
    };
    return candidates.map(el=>({el,n:score(el)})).filter(x=>x.n>0).sort((a,b)=>b.n-a.n)[0]?.el||null;
  }

  function currentProjectBaseHref(){
    try{
      const u=new URL(location.href);
      const m=u.pathname.match(/^(\/g\/g-p-[^/]+(?:\/project)?)/i);
      return m?`${u.origin}${m[1]}`:'';
    }catch(_){return ''}
  }

  async function ensureFreshProjectChat(handoff){
    const name=handoff.projectName||'Studying';
    const key=`warriorCoachFreshChat:${handoff.id}`;
    const alreadyStarted=sessionStorage.getItem(key);
    if(onProjectChat()){
      if(alreadyStarted)return {ready:true};
      const base=handoff.projectHref&&projectHref(handoff.projectHref)?handoff.projectHref:currentProjectBaseHref();
      if(base){
        sessionStorage.setItem(key,'returning-to-project-home');
        await setStatus(handoff.id,'starting-new-chat',{projectName:name});
        location.assign(base);
        return {ready:false};
      }
      return {ready:false,fatal:true};
    }
    if(!onProjectHome())return {ready:false};
    await cacheProject(name,location.href);

    // If the Project landing page already has a composer, it is a blank Project chat:
    // the first send creates the new conversation in Studying.
    const existingComposer=findComposer();
    if(existingComposer){
      sessionStorage.setItem(key,String(Date.now()));
      await setStatus(handoff.id,'new-chat-ready',{projectName:name});
      return {ready:true};
    }

    const control=findFreshProjectChatControl();
    if(control){
      sessionStorage.setItem(key,String(Date.now()));
      await setStatus(handoff.id,'starting-new-chat',{projectName:name});
      await dbg('project-new-chat-click',{projectName:name,tag:control.tagName||'',text:textOf(control).slice(0,80),aria:String(control.getAttribute?.('aria-label')||'').slice(0,80)});
      control.click();
      const deadline=Date.now()+7000;
      while(Date.now()<deadline){
        if(onProjectChat())return {ready:true};
        if(projectPath(location.pathname)&&findComposer())return {ready:true};
        if(!projectPath(location.pathname))break;
        await sleep(150);
      }
    }

    // Never send from a generic/global ChatGPT composer. The route must still belong
    // to the Studying project before the Coach prompt can be inserted.
    if(projectPath(location.pathname)&&findComposer())return {ready:true};
    await setStatus(handoff.id,'project-chat-not-ready',{projectName:name,detail:'Studying opened, but a fresh project chat/composer was not confirmed.'});
    return {ready:false,fatal:true};
  }

  async function enterStudyingProject(handoff) {
    const name=handoff.projectName||'Studying';
    if(onProjectHome()){
      await cacheProject(name,location.href);
      return {ready:true};
    }

    if(handoff.projectHref&&projectHref(handoff.projectHref)){
      await setStatus(handoff.id,'opening-known-project',{projectName:name});
      location.assign(handoff.projectHref);
      return {ready:false};
    }

    await setStatus(handoff.id,'searching-project',{projectName:name});

    let target=findProjectClickable(name);
    if(target){
      const opened=await openProjectTarget(target,name,handoff.id);
      if(opened)return {ready:false};
    }

    const search=findProjectsSearchInput();
    if(search){
      if(norm(search.value)!==norm(name))setNativeValue(search,name);
      await dbg('project-search-filled',{projectName:name});
      const end=Date.now()+5000;
      while(Date.now()<end){
        target=findProjectClickable(name);
        if(target){
          const opened=await openProjectTarget(target,name,handoff.id);
          if(opened)return {ready:false};
        }
        await sleep(200);
      }
    }

    const createAttemptKey=`warriorCoachCreate:${handoff.id}`;
    if(sessionStorage.getItem(createAttemptKey))return {ready:false,waiting:true};

    // Safety rule: "not found by selector" is NOT proof that the project is missing.
    // Auto-create only when ChatGPT explicitly renders a no-results/no-projects state,
    // and only once per project name for this browser profile.
    if(!explicitNoProjectResults()){
      await setStatus(handoff.id,'project-existing-not-resolved',{projectName:name,detail:'Studying was not resolved safely; automatic creation suppressed to prevent duplicates.'});
      await dbg('project-create-suppressed',{projectName:name,reason:'no-explicit-empty-state'});
      return {ready:false,fatal:true};
    }
    if(await creationAlreadyAttempted(name)){
      await setStatus(handoff.id,'project-create-locked',{projectName:name,detail:'Automatic creation already attempted once; refusing to create another duplicate.'});
      await dbg('project-create-suppressed',{projectName:name,reason:'persistent-create-guard'});
      return {ready:false,fatal:true};
    }

    let modal=findCreateProjectModal();
    if(!modal){
      const newProject=findByText(['New project','Create project','Новий проєкт','Новий проект','Створити проєкт','Створити проект','Новый проект','Создать проект']);
      if(!newProject){
        await setStatus(handoff.id,'project-control-not-found',{projectName:name});
        return {ready:false,fatal:true};
      }
      newProject.click();
      await dbg('create-project-open-click',{projectName:name});
      const end=Date.now()+6000;
      while(Date.now()<end&&!modal){modal=findCreateProjectModal();if(!modal)await sleep(120)}
    }
    if(!modal){
      await setStatus(handoff.id,'project-name-input-not-found',{projectName:name,detail:'Create dialog not detected'});
      return {ready:false,fatal:true};
    }

    const input=projectNameInput(modal);
    if(!input){
      await setStatus(handoff.id,'project-name-input-not-found',{projectName:name,detail:'Modal found but project-name input was not found'});
      return {ready:false,fatal:true};
    }

    sessionStorage.setItem(createAttemptKey,String(Date.now()));
    await markCreationAttempt(name,handoff.id);
    if(norm(input.value)!==norm(name))setNativeValue(input,name);
    await dbg('project-name-filled',{projectName:name,actualValue:String(input.value||'')});

    let create=createProjectButton(modal);
    const enableDeadline=Date.now()+2500;
    while(create&&(create.disabled||create.getAttribute('aria-disabled')==='true')&&Date.now()<enableDeadline){
      await sleep(100); create=createProjectButton(modal);
    }
    if(!create||create.disabled||create.getAttribute('aria-disabled')==='true'){
      await setStatus(handoff.id,'project-name-input-not-found',{projectName:name,detail:'Create button stayed disabled'});
      return {ready:false,fatal:true};
    }

    create.click();
    await setStatus(handoff.id,'creating-project',{projectName:name});

    const deadline=Date.now()+30000;
    while(Date.now()<deadline){
      if(onProjectHome()){
        await cacheProject(name,location.href);
        return {ready:true};
      }
      const created=findProjectTarget(name);
      if(created){
        await cacheProject(name,created.href);
        location.assign(created.href);
        return {ready:false};
      }
      await sleep(250);
    }
    await setStatus(handoff.id,'project-create-timeout',{projectName:name});
    return {ready:false,fatal:true};
  }

  function findSendButton(){
    const selectors=[
      'button[data-testid="send-button"]',
      'button[aria-label*="Send" i]',
      'button[aria-label*="Надісл" i]',
      'button[aria-label*="Отправ" i]'
    ];
    for(const sel of selectors){
      const b=[...document.querySelectorAll(sel)].find(x=>visible(x)&&!x.disabled&&x.getAttribute('aria-disabled')!=='true');
      if(b)return b;
    }
    return null;
  }
  function composerText(composer){return String(composer?.value ?? composer?.innerText ?? composer?.textContent ?? '').trim()}
  async function waitSent(composer,timeout=6500){
    const start=Date.now();
    while(Date.now()-start<timeout){
      if(onProjectChat()||(!composerText(composer)&&projectPath(location.pathname)&&Date.now()-start>350))return true;
      await sleep(140);
    }
    return false;
  }
  async function sendPrompt(composer){
    for(let i=0;i<30;i++){
      const b=findSendButton();
      if(b){b.click();if(await waitSent(composer))return true;break}
      await sleep(120);
    }
    try{
      composer.focus();
      composer.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true,cancelable:true}));
      composer.dispatchEvent(new KeyboardEvent('keyup',{key:'Enter',code:'Enter',bubbles:true,cancelable:true}));
      return await waitSent(composer,4500);
    }catch(_){return false}
  }

  async function run(){
    const deadline=Date.now()+10*60*1000;
    while(Date.now()<deadline){
      let res=null;
      try{res=await chrome.runtime.sendMessage({type:'GET_CHATGPT_HANDOFF'})}catch(_){}
      const handoff=res?.handoff;
      if(!handoff?.prompt){await sleep(600);continue}

      if(!onProjectHome()&&!onProjectChat()){
        const result=await enterStudyingProject(handoff);
        if(result?.fatal)return;
        if(!result?.ready){await sleep(500);continue}
      }else{
        await cacheProject(handoff.projectName||'Studying',location.href);
      }

      const fresh=await ensureFreshProjectChat(handoff);
      if(fresh?.fatal)return;
      if(!fresh?.ready){await sleep(400);continue}

      let composer=null,composerDeadline=Date.now()+45000;
      while(!composer&&Date.now()<composerDeadline){composer=findComposer();if(!composer)await sleep(250)}
      if(!composer){await setStatus(handoff.id,'composer-not-found');return}

      if(insertPrompt(composer,handoff.prompt)){
        composer.scrollIntoView({block:'center',behavior:'smooth'});
        await setStatus(handoff.id,'prompt-inserted',{projectName:handoff.projectName||'Studying'});
        if(handoff.autoSend!==false){
          const sent=await sendPrompt(composer);
          if(!sent){await setStatus(handoff.id,'send-failed');return}
        }
        try{await chrome.runtime.sendMessage({type:'CHATGPT_HANDOFF_CONSUMED',id:handoff.id})}catch(_){}
        return;
      }
      await sleep(500);
    }
  }
  run();
})();
