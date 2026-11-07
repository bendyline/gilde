(function(){
if(window.gezel || window.__gezelDemoBootstrap)return;
window.__gezelDemoBootstrap=1;
/* gezel-page-demo-stub v1 */
/*
 * The canonical demo stub for Gezel type pages. MIT License.
 *
 * Paste this file's bytes verbatim into a <script> block ahead of the
 * page's own code, then call makeDemoGezel({ page, tools, data }) with the
 * page's demo handlers. Served by Gezel, the real window.gezel is already
 * injected and the stub steps aside; opened as a raw file (the live demos
 * on gezelgilde.com), it installs a window.gezel whose tools and data are
 * the page-supplied handler maps — one code path in every mode. `tools`
 * and `data` map a tool name / declared read path to a function; data
 * handlers back read() and list(), and url() returns the handler's value
 * or passes a data: URI through. See docs/page-authoring.md.
 */
(function () {
  'use strict';
  window.makeDemoGezel = function (opts) {
    if (window.gezel) return window.gezel;
    var page = (opts && opts.page) || {};
    var tools = (opts && opts.tools) || {};
    var data = (opts && opts.data) || {};
    var themeListeners = [];
    var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    var ui = {
      theme: { mode: media && media.matches ? 'dark' : 'light' },
      onTheme: function (cb) {
        themeListeners.push(cb);
        return function () {
          var at = themeListeners.indexOf(cb);
          if (at >= 0) themeListeners.splice(at, 1);
        };
      },
    };
    if (media && media.addEventListener) {
      media.addEventListener('change', function (ev) {
        ui.theme = { mode: ev.matches ? 'dark' : 'light' };
        themeListeners.slice().forEach(function (cb) { cb(ui.theme); });
      });
    }
    function fail(code, message) {
      var err = new Error(message);
      err.code = code;
      return Promise.reject(err);
    }
    function run(map, key, arg) {
      if (!Object.prototype.hasOwnProperty.call(map, key)) return null;
      return Promise.resolve().then(function () { return map[key](arg); });
    }
    window.gezel = {
      page: {
        api: 1,
        projectId: 'demo',
        source: 'type',
        entry: page.entry || 'index.html',
        typeName: page.typeName || 'demo',
        params: page.params || {},
        mode: 'demo',
      },
      tools: {
        list: function () { return Promise.resolve(Object.keys(tools)); },
        invoke: function (name, input) {
          var call = run(tools, name, input || {});
          if (!call) return fail('not-allowed', "The demo does not handle the tool '" + name + "'.");
          return call.then(function (output) { return { output: output }; });
        },
      },
      data: {
        read: function (path, o) {
          return run(data, path, o || {}) || fail('not-allowed', "The demo has no data for '" + path + "'.");
        },
        list: function (path, o) {
          return run(data, path, o || {}) || Promise.resolve([]);
        },
        watch: function () { return function () {}; },
        url: function (path) {
          if (Object.prototype.hasOwnProperty.call(data, path)) return String(data[path]({}));
          return typeof path === 'string' && path.indexOf('data:') === 0 ? path : '';
        },
      },
      ui: ui,
      refresh: function () {},
    };
    return window.gezel;
  };
})();

(function(){
if(window.installGezelComponents)return;
window.installGezelComponents=function(api,transport){
  if(api.ui.components)return api.ui.components;
  transport=transport||{};
  var demo=api.page.mode==='demo', demoFiles=[], urls=new Map();
  var demoTargets=transport.demoTargets||[];
  var originalUrl=api.data.url.bind(api.data);
  if(demo)api.data.url=function(path,opts){return urls.get(path)||originalUrl(path,opts);};
  api.data.importTargets=demo?async function(){return demoTargets.map(function(t){return Object.assign({},t,{writable:true});});}:(transport.targets||async function(){throw new Error('Add files requires a newer Gezel desktop app.');});
  api.data.importFiles=async function(files,opts){
    opts=opts||{}; files=Array.from(files);
    if(files.length>100)throw new Error('Choose at most 100 files at a time.');
    var targets=await api.data.importTargets(), target=targets.find(function(t){return t.id===opts.target;});
    if(!target||!target.writable)throw new Error(target&&target.reason||'This import destination is unavailable.');
    var results=[];
    for(var i=0;i<files.length;i++){
      var file=files[i], result;
      try{
        if(opts.signal&&opts.signal.aborted)throw new Error('Import cancelled.');
        if(!(file instanceof Blob)||typeof file.name!=='string')throw new Error('Choose a file.');
        if(!/^(?!\.)(?!.*[. ]$)(?!(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$))[^<>:"/\\|?*\x00-\x1f]{1,180}$/i.test(file.name))throw new Error('Unsupported filename.');
        var ext=(file.name.match(/\.[^.]+$/)||[''])[0].toLowerCase();
        if(target.accept&&!target.accept.includes(ext))throw new Error('This file type is not accepted here.');
        if(file.size>Math.min(target.maxFileBytes||268435456,268435456))throw new Error('File exceeds the import size limit.');
        if(opts.onProgress)opts.onProgress({completed:i,total:files.length,name:file.name});
        var saved;
        if(demo){
          var name=file.name, base=target.path==='.'?'':target.path.replace(/\/$/,'')+'/';
          var occupied=(transport.existingPaths||[]).concat(demoFiles.map(function(f){return f.path;}));
          for(var n=1;occupied.includes(base+name);n++)name=file.name.slice(0,file.name.length-ext.length)+' ('+n+')'+ext;
          saved={source:'workspace',path:base+name,name:name,size:file.size,mtime:1700000000000};
          demoFiles.push(saved);urls.set(saved.path,URL.createObjectURL(file));
        }else saved=await transport.file(file,target.id,opts.signal);
        result={ok:true,name:file.name,file:saved};
      }catch(error){result={ok:false,name:file.name||'File',error:error.message||String(error)};}
      results.push(result);
      if(opts.onProgress)opts.onProgress({completed:i+1,total:files.length,name:file.name});
    }
    return results;
  };
  var css=" :host{display:block;color:var(--gezel-component-text,#302b25);font:400 15px/1.45 var(--font-ui,system-ui,sans-serif);--surface:var(--gezel-component-surface,#fffcf6);--line:var(--gezel-component-border,#cfc7bc);--muted:var(--gezel-component-muted,#655d53);--accent:var(--gezel-component-accent,#805128)}\n  :host([data-theme=\"dark\"]){--surface:var(--gezel-component-surface,#26292b);--line:var(--gezel-component-border,#555b5d);--muted:var(--gezel-component-muted,#b7b5af);--accent:var(--gezel-component-accent,#e0b78b);color:var(--gezel-component-text,#f0ece5)}\n  :host([hidden]){display:none!important}*{box-sizing:border-box}button,input{font:inherit;color:inherit}button{cursor:pointer}button:disabled{cursor:default;opacity:.6}button:focus-visible{outline:3px solid var(--accent);outline-offset:3px}button{border:1px solid var(--line);border-radius:6px;background:var(--surface);padding:9px 14px}p{margin:6px 0}small{color:var(--muted)}[hidden]{display:none!important}.error{color:inherit;font-weight:600}\n  .card{width:100%;padding:0;display:flex;flex-direction:column;text-align:left;overflow:hidden;min-width:0}.preview{background:color-mix(in srgb,var(--line) 30%,transparent);height:150px;display:grid;place-items:center;font-size:20px;color:var(--muted);flex-shrink:0}.preview img{width:100%;height:100%;object-fit:cover;min-height:0}.info{padding:12px;min-width:0}.name{font-weight:600;overflow-wrap:anywhere}.meta{color:var(--muted);font-size:13px;overflow-wrap:anywhere}.row{flex-direction:row;align-items:center}.row .preview{width:64px;height:64px;font-size:14px}.row .info{padding:8px 12px}.adder{border:1px dashed var(--line);border-radius:6px;padding:16px;background:var(--surface)}.adder.drag{outline:3px solid var(--accent);outline-offset:2px}.actions{display:flex;gap:8px;flex-wrap:wrap}.results{padding-left:20px;max-height:160px;overflow:auto;font-size:13px}progress{width:100%;accent-color:var(--accent)}";
  function el(tag,text){var e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;}
  function setup(target,tag,styles){
    var mount=typeof target==='string'?document.querySelector(target):target;
    if(!mount)throw new Error('Component mount element not found.');
    if(!customElements.get(tag))customElements.define(tag,class extends HTMLElement{
      connectedCallback(){if(this.connect)this.connect();}
      disconnectedCallback(){if(this.disconnect)this.disconnect();}
    });
    var host=el(tag),root=host.attachShadow({mode:'open'}),style=el('style',styles===undefined?css:styles),unsubscribe;
    root.append(style);
    host.connect=function(){host.setAttribute('data-theme',api.ui.theme.mode);unsubscribe=api.ui.onTheme(function(t){host.setAttribute('data-theme',t.mode);});};
    host.disconnect=function(){if(unsubscribe)unsubscribe();unsubscribe=null;};
    mount.append(host);
    return {host:host,root:root};
  }
  function size(bytes){return bytes===undefined?'':bytes<1024?bytes+' B':bytes<1048576?(bytes/1024).toFixed(1)+' KB':(bytes/1048576).toFixed(1)+' MB';}
  function fileCard(target,options){
    var s=setup(target,'gezel-file-card'),opts=options,button=el('button'),preview=el('span'),info=el('span'),name=el('span'),meta=el('span'),status=el('p');
    button.type='button';preview.className='preview';info.className='info';name.className='name';meta.className='meta';name.style.display=meta.style.display='block';status.setAttribute('role','status');status.hidden=true;
    info.append(name,meta);button.append(preview,info);s.root.append(button,status);
    function render(){
      var f=opts.file,filename=f.name||f.path.split('/').pop(),ext=(filename.split('.').pop()||'file').toUpperCase();
      button.className='card'+(opts.variant==='row'?' row':'');name.textContent=filename;button.setAttribute('aria-label','Open '+filename);
      meta.textContent=[f.path.includes('/')?f.path.slice(0,f.path.lastIndexOf('/')):'',size(f.size),f.mtime?new Date(f.mtime).toLocaleDateString(): ''].filter(Boolean).join(' · ');
      preview.replaceChildren(el('span',ext));status.hidden=true;
      if(opts.thumbnail!==false&&/\.(png|jpe?g|gif|webp|avif|bmp|svg|ico)$/i.test(f.path)){
        try{var img=el('img');img.alt='';img.loading='lazy';img.src=typeof opts.thumbnail==='string'?opts.thumbnail:api.data.url(f.path,{source:f.source||'workspace'});img.onerror=function(){preview.replaceChildren(el('span',ext));};preview.replaceChildren(img);}catch(_){}
      }
    }
    button.onclick=async function(){try{if(opts.onActivate)await opts.onActivate(opts.file);else{if(typeof api.data.open!=='function')throw new Error('Open this file in Gezel to use its viewer.');await api.data.open(opts.file.path,{source:opts.file.source||'workspace'});}}catch(e){status.textContent=e.message||String(e);status.hidden=false;}};
    render();
    return {element:s.host,update:function(next){opts=Object.assign({},opts,next);render();},destroy:function(){s.host.remove();s.host.disconnect();}};
  }
  function fileAdder(target,options){
    var s=setup(target,'gezel-file-adder'),opts=options,box=el('div'),actions=el('div'),pick=el('button','Add files'),cancel=el('button','Cancel'),input=el('input'),description=el('p'),status=el('p'),progress=el('progress'),results=el('ul'),controller=null,destroyed=false,writable=false;
    box.className='adder';actions.className='actions';results.className='results';pick.type=cancel.type='button';input.type='file';input.multiple=true;input.hidden=true;pick.disabled=true;cancel.hidden=progress.hidden=results.hidden=true;status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    actions.append(pick,cancel,input);box.append(actions,description,status,progress,results);s.root.append(box);
    async function refresh(){
      try{var targets=await api.data.importTargets(),t=targets.find(function(t){return t.id===opts.target;});if(destroyed)return;writable=!!(t&&t.writable);pick.disabled=!writable||!!controller;input.accept=t&&t.accept?t.accept.join(','):'';description.textContent=t?'Drop files here or use Add files. Destination: '+(t.path==='.'?'workspace folder':t.path)+(demo?' · Demo only — files stay in this tab.':' · Originals are kept; duplicate names get a number.'):'No import destination is configured.';status.textContent=writable?'':t&&t.reason||'This import destination is unavailable.';}catch(e){if(!destroyed){writable=false;pick.disabled=true;description.textContent='Add files';status.textContent=e.message||String(e);}}
    }
    async function add(files){
      if(!writable||controller||!files.length)return;
      controller=new AbortController();var own=controller;pick.disabled=true;cancel.hidden=false;cancel.disabled=false;progress.hidden=false;progress.value=0;progress.max=files.length;results.replaceChildren();results.hidden=true;box.setAttribute('aria-busy','true');
      try{
        var outcome=await api.data.importFiles(files,{target:opts.target,signal:own.signal,onProgress:function(p){if(!destroyed){progress.value=p.completed;status.textContent='Adding '+p.name+' ('+p.completed+'/'+p.total+')';}}});
        if(destroyed)return;
        outcome.forEach(function(r){results.append(el('li',r.ok?'Added '+r.file.path:r.name+': '+r.error));});results.hidden=false;
        var added=outcome.filter(function(r){return r.ok;}).map(function(r){return r.file;});
        status.textContent=added.length+' of '+outcome.length+' files added'+(demo?' to this demo.':'.');
        if(added.length&&opts.onAdded)await opts.onAdded(added);
      }catch(e){if(!destroyed)status.textContent=e.message||String(e);}
      finally{controller=null;if(!destroyed){cancel.hidden=progress.hidden=true;pick.disabled=!writable;box.removeAttribute('aria-busy');}}
    }
    pick.onclick=function(){input.click();};input.onchange=function(){var files=Array.from(input.files||[]);input.value='';void add(files);};
    cancel.onclick=function(){if(controller)controller.abort();cancel.disabled=true;};
    box.ondragover=function(e){e.preventDefault();if(writable&&!controller){e.dataTransfer.dropEffect='copy';box.classList.add('drag');}};
    box.ondragleave=function(){box.classList.remove('drag');};
    box.ondrop=function(e){e.preventDefault();box.classList.remove('drag');void add(Array.from(e.dataTransfer.files||[]));};
    var disconnect=s.host.disconnect;s.host.disconnect=function(){disconnect();if(controller)controller.abort();};
    void refresh();
    return {element:s.host,refresh:refresh,update:function(next){opts=Object.assign({},opts,next);void refresh();},destroy:function(){destroyed=true;s.host.remove();s.host.disconnect();}};
  }
  function chat(target,options){
    var s=setup(target,'gezel-chat'),opts=Object.assign({},options),stopped=false,frame=0,last='',remote=null;
    s.host.style.height='100%';s.host.style.minHeight='0';
    var status=el('p','Opening chat…');status.setAttribute('role','status');s.root.append(status);
    var ready=transport.chat?transport.chat(opts,s.root):Promise.reject(new Error(demo?'Chat is available in Gezel. This demo does not send messages.':'Chat is unavailable in this host. Open this app in Gezel.'));
    function position(){
      frame=0;
      if(stopped||!s.host.isConnected)return;
      var r=s.host.getBoundingClientRect(),x=r.left,y=r.top,right=r.right,bottom=r.bottom;
      for(var p=s.host.parentElement;p;p=p.parentElement){
        var style=getComputedStyle(p),box=p.getBoundingClientRect();
        if(style.overflowX!=='visible'){x=Math.max(x,box.left);right=Math.min(right,box.right);}
        if(style.overflowY!=='visible'){y=Math.max(y,box.top);bottom=Math.min(bottom,box.bottom);}
      }
      x=Math.max(0,x);y=Math.max(0,y);right=Math.min(innerWidth,right);bottom=Math.min(innerHeight,bottom);
      var rect={x:x,y:y,width:Math.max(0,right-x),height:Math.max(0,bottom-y)};
      if(!s.host.getClientRects().length||getComputedStyle(s.host).visibility==='hidden')rect.width=rect.height=0;
      var next=JSON.stringify(rect);if(remote&&next!==last){last=next;remote.position(rect);}
    }
    function schedule(){if(!stopped&&!frame)frame=requestAnimationFrame(position);}
    var resize=new ResizeObserver(schedule),mutation=new MutationObserver(schedule);
    resize.observe(s.host);
    mutation.observe(document.documentElement,{subtree:true,childList:true,attributes:true});
    window.addEventListener('resize',schedule);
    document.addEventListener('scroll',schedule,true);
    ready=ready.then(function(handle){
      remote=handle;
      if(stopped){remote.destroy();return;}
      status.hidden=true;remote.update(opts);position();
    });
    ready.catch(function(error){if(!stopped)status.textContent=error.message||String(error);});
    var disconnect=s.host.disconnect;
    function destroy(){if(stopped)return;stopped=true;cancelAnimationFrame(frame);resize.disconnect();mutation.disconnect();window.removeEventListener('resize',schedule);window.removeEventListener('pagehide',destroy);document.removeEventListener('scroll',schedule,true);if(remote)remote.destroy();disconnect();s.host.remove();}
    window.addEventListener('pagehide',destroy);
    s.host.disconnect=destroy;
    return {element:s.host,ready:ready,update:function(next){if(stopped)return;opts=Object.assign({},opts,next);if(remote)remote.update(opts);},destroy:destroy};
  }

  // minItems hides the search box until the collection is long enough to need one; a typed query keeps it.
  function collectionFilter(target,options){
    var opts=options,s=setup(target,'gezel-collection-filter'),label=el('label'),caption=el('span',opts.label||'Search'),input=el('input'),status=el('p'),stopped=false;
    var container=typeof opts.container==='string'?document.querySelector(opts.container):opts.container;
    if(!container)throw new Error('Search collection not found.');
    input.type='search';input.placeholder=opts.placeholder||'';input.setAttribute('aria-label',opts.label||'Search');input.style.cssText='width:100%;min-height:44px;box-sizing:border-box;padding:10px;border:1px solid var(--line);border-radius:6px;background:var(--surface);color:inherit;font:inherit';caption.style.cssText='display:block;font-size:14px;margin-bottom:6px';status.style.cssText='font-size:13px;color:var(--muted)';status.setAttribute('role','status');status.setAttribute('aria-live','polite');label.append(caption,input);s.root.append(label,status);
    function normalize(value){return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
    function filter(){if(stopped)return;var query=normalize(input.value.trim()),items=Array.from(container.querySelectorAll(opts.selector)),found=0;items.forEach(function(item){var matches=!query||normalize(item.textContent).includes(query);item.hidden=!matches;if(matches)found++;});s.host.hidden=!query&&opts.minItems>0&&items.length<opts.minItems;status.textContent=query?found+' of '+items.length+' matches':'';}
    input.oninput=filter;var observer=new MutationObserver(filter);observer.observe(container,{subtree:true,childList:true,characterData:true});filter();
    return {element:s.host,update:function(next){opts=Object.assign({},opts,next);filter();},destroy:function(){stopped=true;observer.disconnect();container.querySelectorAll(opts.selector).forEach(function(item){item.hidden=false;});s.host.remove();s.host.disconnect();}};
  }
  function appLayout(target,options){
    var content=typeof target==='string'?document.querySelector(target):target;
    if(!content||!content.parentElement)throw new Error('Application content not found.');
    var parent=content.parentElement,next=content.nextSibling,oldSlot=content.getAttribute('slot'),oldMaxWidth=content.style.maxWidth,oldMargin=content.style.margin,opts=options||{},stopped=false,conversation=null,collapsed=false;
    // Layout wraps authored content: its fonts, colors, and custom properties must
    // inherit from the page, not the component theme. Theme only our own furniture.
    var furnitureCss=css.replace(':host{','.companion,.toolbar{').replace(':host([data-theme="dark"]){',':host([data-theme="dark"]) .companion,:host([data-theme="dark"]) .toolbar{');
    var s=setup(parent,'gezel-app-layout',furnitureCss);parent.insertBefore(s.host,content);content.slot='content';s.host.append(content);
    var style=el('style',':host{display:block;max-width:1680px;margin:auto;--conversation-width:360px}.layout{display:block;min-width:0}.content{min-width:0}::slotted(main){min-width:0;box-sizing:border-box}.companion{display:none;min-width:0;margin:24px 24px 24px 0;padding:16px;border:1px solid var(--line);border-radius:10px;background:var(--surface);position:sticky;top:24px;height:calc(100dvh - 112px);max-height:960px;box-sizing:border-box}.intro{margin:0 0 12px}.intro h2{font:400 22px var(--font-heading,Georgia,serif);margin:0}.intro p{font-size:14px;color:var(--muted);margin:6px 0}.chat{flex:1;min-height:0}.toolbar{display:none;justify-content:flex-end;padding:12px 24px 0;gap:8px}.toolbar button{font-size:14px;min-height:36px}.toolbar[hidden]{display:none!important}.intro-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.intro-head button{flex-shrink:0;min-height:32px;padding:4px 10px;font-size:13px;color:var(--muted)}.unavailable{padding:20px 0;line-height:1.6}.expanded .toolbar{display:flex}.expanded.with-chat .layout{display:grid;grid-template-columns:minmax(0,1fr) var(--conversation-width);align-items:start}.expanded.with-chat .companion{display:flex;flex-direction:column}.expanded ::slotted(main){max-width:none;margin:0;padding:24px}.expanded:not(.with-chat) ::slotted(main){max-width:1280px;margin:auto}.companion[hidden]{display:none!important}@media(max-width:900px){.expanded.with-chat .layout{grid-template-columns:minmax(0,1fr)}.companion{position:relative;top:auto;margin:0 16px 24px;height:520px;max-height:80dvh}.expanded ::slotted(main){padding:16px}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto}}');
    var wrapper=el('div'),toolbar=el('div'),toggle=el('button'),layout=el('div'),work=el('div'),slot=el('slot'),aside=el('aside'),intro=el('div'),introHead=el('div'),heading=el('h2'),description=el('p'),chatRegion=el('div'),chatSlot=el('slot'),unavailable=el('p');
    toolbar.className='toolbar';toggle.type='button';layout.className='layout';work.className='content';slot.name='content';aside.className='companion';intro.className='intro';introHead.className='intro-head';chatRegion.className='chat';chatSlot.name='conversation';unavailable.className='unavailable';unavailable.setAttribute('role','status');
    var mount=el('div');mount.slot='conversation';mount.style.cssText='display:block;height:100%;min-height:0;min-width:0';s.host.append(mount);
    introHead.append(heading);intro.append(introHead,description);chatRegion.append(chatSlot);aside.append(intro,unavailable,chatRegion);work.append(slot);layout.append(work,aside);toolbar.append(toggle);wrapper.append(toolbar,layout);s.root.append(style,wrapper);
    // Host-drawn chat floats above the iframe and must step aside for a page dialog; an in-page demo conversation sits beneath it anyway.
    // A component's own modal lives in its shadow root, so it marks its host instead.
    function hasDialog(){if(demo&&transport.chat)return false;if(document.querySelector('[data-gezel-dialog-open]'))return true;return Array.from(document.querySelectorAll('dialog[open],[aria-modal="true"]')).some(function(dialog){return dialog.getClientRects().length>0;});}
    function render(){
      if(stopped)return;
      var full=!!(api.ui.layout&&api.ui.layout.fullscreen),enabled=opts.chat!==false,visible=full&&enabled&&!collapsed;
      content.style.maxWidth=full?'none':oldMaxWidth;content.style.margin=full?'0':oldMargin;
      wrapper.className=(full?'expanded':'')+(visible?' with-chat':'');toolbar.hidden=!enabled||visible;aside.hidden=!visible;
      heading.textContent=opts.title||'Your companion';description.textContent=opts.description||'';description.hidden=!opts.description;
      // While the conversation shows, its Hide key sits in the panel header instead of costing a row above the page.
      if(visible){toggle.textContent='Hide';toggle.setAttribute('aria-label','Hide conversation');if(toggle.parentNode!==introHead)introHead.append(toggle);}else{toggle.textContent='Show conversation';toggle.removeAttribute('aria-label');if(toggle.parentNode!==toolbar)toolbar.append(toggle);}toggle.setAttribute('aria-expanded',String(!collapsed));
      var supported=(api.page.mode==='embedded'||demo&&!!transport.chat)&&typeof chat==='function';
      unavailable.hidden=supported;unavailable.textContent='Open this app in Gezel to talk with your companion.'+(api.page.mode==='demo'?' This preview keeps your sample work in this page.':' Your project work stays in its existing files.');
      var visibility=hasDialog()?'hidden':'visible';if(mount.style.visibility!==visibility)mount.style.visibility=visibility;
      if(visible&&supported&&!conversation){
        conversation=chat(mount,Object.assign({lockRecipient:true,showAddress:false,showThreads:false},opts.chat||{}));
        conversation.ready.catch(function(error){if(!stopped){unavailable.hidden=false;unavailable.textContent='Conversation could not open. '+(error.message||'Restore the page to use the project chat.');}});
      }
    }
    toggle.onclick=function(){collapsed=!collapsed;render();};
    var stopLayout=api.ui.onLayout?api.ui.onLayout(render):function(){},dialogs=new MutationObserver(function(){var visibility=hasDialog()?'hidden':'visible';if(mount.style.visibility!==visibility)mount.style.visibility=visibility;});
    dialogs.observe(document.body,{subtree:true,attributes:true,attributeFilter:['open','hidden','aria-hidden','aria-modal','class','style','data-gezel-dialog-open']});
    function destroy(){if(stopped)return;stopped=true;stopLayout();dialogs.disconnect();if(conversation)conversation.destroy();window.removeEventListener('pagehide',destroy);content.style.maxWidth=oldMaxWidth;content.style.margin=oldMargin;if(s.host.parentElement){parent.insertBefore(content,next&&next.parentNode===parent?next:s.host);if(oldSlot===null)content.removeAttribute('slot');else content.slot=oldSlot;}s.host.remove();s.host.disconnect();}
    window.addEventListener('pagehide',destroy,{once:true});render();
    return {element:s.host,update:function(next){opts=Object.assign({},opts,next);if(conversation&&opts.chat!==false)conversation.update(opts.chat||{});render();},destroy:destroy};
  }
  // presentation: 'disclosure' (the original expando), 'dialog' (a key that opens a modal) or 'inline' (an always-open form, for settings).
  function actionForm(target,options){
    var opts=options,mode=opts.presentation==='dialog'||opts.presentation==='inline'?opts.presentation:'disclosure';
    var s=setup(target,'gezel-action-form'),description=el('p'),fields=el('div'),submit=el('button'),status=el('p'),busy=false,stopped=false,pendingUpdate=false,controls=[];
    var box=null,summary=null,heading=null,trigger=null,dialog=null,cancel=null,flash=null,flashTimer=0,returnFocus=null,pressed=null;
    var style=el('style',':host{--on-accent:#fffaf3}:host([data-theme="dark"]){--on-accent:#1f1a16}details{border:1px solid var(--line);border-radius:10px;padding:14px;background:var(--surface)}summary{cursor:pointer;font-weight:600;min-height:24px;list-style-position:inside}summary:focus-visible{outline:2px solid var(--accent);outline-offset:4px}.fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:12px;margin:16px 0}label{display:flex;flex-direction:column;gap:6px;font-size:14px}input,select,textarea{box-sizing:border-box;min-width:0;width:100%;font:inherit;color:inherit;background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:10px;min-height:44px}textarea{min-height:90px;resize:vertical}.description{color:var(--muted);font-size:14px}button{min-height:44px}button:disabled{cursor:wait;opacity:.65}output{display:block;margin-top:10px}'
      +'input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid var(--accent);outline-offset:1px}.primary{background:var(--accent);border-color:var(--accent);color:var(--on-accent);font-weight:600}:host([data-presentation="dialog"]){display:inline-block;position:relative;vertical-align:top}.trigger{font-weight:600;white-space:nowrap}.flash{position:absolute;left:0;top:calc(100% + 6px);z-index:2;margin:0;padding:4px 8px;border:1px solid var(--line);border-radius:4px;background:var(--surface);font-size:13px;white-space:nowrap;opacity:0;pointer-events:none;transition:opacity 160ms ease-out}.flash.show{opacity:1}.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}'
      +'dialog{box-sizing:border-box;width:min(560px,calc(100vw - 32px));max-height:calc(100dvh - 32px);padding:0;border:1px solid var(--line);border-radius:12px;background:var(--surface);color:inherit;box-shadow:0 18px 48px rgba(28,24,20,.24)}dialog::backdrop{background:rgba(28,24,20,.36)}:host([data-theme="dark"]) dialog::backdrop{background:rgba(0,0,0,.56)}dialog[open]{animation:gezel-dialog-in 150ms ease-out}@keyframes gezel-dialog-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}@media(prefers-reduced-motion:reduce){dialog[open]{animation:none}.flash{transition:none}}.sheet{box-sizing:border-box;max-height:calc(100dvh - 34px);overflow:auto;padding:20px 24px}dialog h2{margin:0;font:400 22px/1.25 var(--font-heading,Georgia,serif)}dialog .description{margin:6px 0 0}dialog .fields{grid-template-columns:minmax(0,1fr);margin:18px 0 8px}.buttons{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;margin-top:12px}'
      +'.inline{border:1px solid var(--line);border-radius:10px;padding:16px 18px;background:var(--surface)}.inline h3{margin:0;font:400 18px/1.3 var(--font-heading,Georgia,serif)}.inline .description{margin:4px 0 0}');
    fields.className='fields';description.className='description';submit.type='button';status.setAttribute('role','status');status.setAttribute('aria-live','polite');s.host.setAttribute('data-presentation',mode);
    if(mode==='dialog'){
      var sheet=el('div'),buttons=el('div');trigger=el('button');flash=el('p');dialog=el('dialog');heading=el('h2');cancel=el('button','Cancel');
      trigger.type='button';trigger.setAttribute('aria-haspopup','dialog');flash.className='flash';flash.setAttribute('role','status');flash.setAttribute('aria-live','polite');
      sheet.className='sheet';buttons.className='buttons';heading.id='title';dialog.setAttribute('aria-labelledby','title');cancel.type='button';submit.classList.add('primary');
      buttons.append(cancel,submit);sheet.append(heading,description,fields,status,buttons);dialog.append(sheet);box=sheet;s.root.append(style,trigger,flash,dialog);
      trigger.onclick=function(){open();};cancel.onclick=function(){close();};
      dialog.addEventListener('cancel',function(event){if(busy)event.preventDefault();});
      dialog.addEventListener('close',function(){s.host.removeAttribute('data-gezel-dialog-open');var back=returnFocus;returnFocus=null;if(back&&back.isConnected&&typeof back.focus==='function')back.focus();});
      // Close on a backdrop click only when the press also began there, so a text selection dragged outside keeps the form.
      dialog.addEventListener('mousedown',function(event){pressed=event.target;});
      dialog.addEventListener('click',function(event){if(event.target===dialog&&pressed===dialog)close();pressed=null;});
    }else if(mode==='inline'){
      box=el('section');heading=el('h3');heading.id='title';box.className='inline';box.setAttribute('aria-labelledby','title');submit.classList.add('primary');box.append(heading,description,fields,submit,status);s.root.append(style,box);
    }else{
      box=el('details');summary=el('summary');box.append(summary,description,fields,submit,status);s.root.append(style,box);
    }
    function render(){
      if(summary)summary.textContent=opts.title;if(heading)heading.textContent=opts.title;
      if(trigger){trigger.textContent=opts.buttonLabel||opts.title;trigger.className='trigger'+(opts.primary?' primary':'');trigger.hidden=opts.trigger===false;flash.classList.toggle('sr',opts.trigger===false);}
      description.textContent=opts.description||'';description.hidden=!opts.description;submit.textContent=opts.submitLabel||'Save';fields.replaceChildren();controls=[];
      (opts.fields||[]).forEach(function(field){
        var label=el('label'),caption=el('span',field.label+(field.required||mode==='inline'?'':' (optional)')),input=el(field.options?'select':field.multiline?'textarea':'input');
        if(field.options){if(!field.required){var blank=el('option','Choose…');blank.value='';input.append(blank);}field.options.forEach(function(value){var option=el('option',typeof value==='string'?value:value.label);option.value=typeof value==='string'?value:value.value;input.append(option);});}
        else if(!field.multiline)input.type=field.type||'text';
        input.name=field.name;input.required=!!field.required;input.setAttribute('aria-label',field.label);if(field.placeholder)input.placeholder=field.placeholder;if(field.min!==undefined)input.min=String(field.min);if(field.max!==undefined)input.max=String(field.max);if(field.type==='number')input.step=String(field.step||'any');if(field.value!==undefined)input.value=String(field.value);if(!field.options&&field.type!=='number'&&field.type!=='date')input.maxLength=field.maxLength||4000;
        label.append(caption,input);fields.append(label);controls.push({field:field,input:input,label:label});
      });
      visibility();
    }
    function visibility(){controls.forEach(function(control){var when=control.field.when,source=when&&controls.find(function(c){return c.field.name===when.field;}),visible=!when||!!source&&source.input.value===when.equals;control.label.hidden=!visible;control.input.required=visible&&!!control.field.required;});}
    function update(next){opts=Object.assign({},opts,next);if(busy){pendingUpdate=true;return;}var values={};controls.forEach(function(c){values[c.field.name]=c.input.value;});render();controls.forEach(function(c){var value=values[c.field.name];if(value!==undefined&&(!c.field.options||Array.from(c.input.options).some(function(option){return option.value===value;})))c.input.value=value;});visibility();}
    function initial(c){return c.field.value===undefined?(c.field.options&&c.field.required&&c.input.options.length?c.input.options[0].value:''):String(c.field.value);}
    function fill(values){controls.forEach(function(c){var given=values&&values[c.field.name],value=given===undefined||given===null?initial(c):String(given);if(c.field.options&&!Array.from(c.input.options).some(function(option){return option.value===value;}))value=initial(c);c.input.value=value;});visibility();}
    function reset(values){if(busy||stopped)return;fill(values);}
    function deepActive(){var active=document.activeElement;while(active&&active.shadowRoot&&active.shadowRoot.activeElement)active=active.shadowRoot.activeElement;return active;}
    function firstField(){var first=controls.find(function(c){return !c.label.hidden&&!c.input.disabled;});if(first)first.input.focus();}
    function open(values){
      if(stopped)return;if(values)reset(values);
      if(mode==='dialog'){if(!dialog.open){returnFocus=trigger&&!trigger.hidden?trigger:deepActive();if(!busy)status.textContent='';s.host.setAttribute('data-gezel-dialog-open','');try{dialog.showModal();}catch(_){dialog.setAttribute('open','');}}}
      else if(mode==='disclosure')box.open=true;
      firstField();
    }
    function close(){if(stopped||busy)return;if(mode==='dialog'){if(dialog.open)dialog.close();}else if(mode==='disclosure')box.open=false;}
    function announce(message){if(!flash)return;flash.textContent=message;flash.classList.add('show');clearTimeout(flashTimer);flashTimer=setTimeout(function(){flash.classList.remove('show');},4000);}
    async function save(){
      if(busy||stopped)return;var values={},saved=false,message='';
      for(var control of controls){if(control.label.hidden)continue;if(!control.input.reportValidity())return;var value=control.input.value.trim();if(control.field.required&&!value){control.input.setCustomValidity('Enter a value.');control.input.reportValidity();control.input.setCustomValidity('');return;}if(value!=='')values[control.field.name]=control.field.type==='number'?Number(value):value;}
      busy=true;submit.disabled=true;if(cancel)cancel.disabled=true;controls.forEach(function(c){c.input.disabled=true;});box.setAttribute('aria-busy','true');status.textContent='Saving…';
      try{var input=opts.mapInput?opts.mapInput(values):values;var result=await api.tools.invoke(opts.tool,input);if(stopped)return;message=opts.successMessage||'Saved.';status.textContent=message;if(opts.onSaved){try{await opts.onSaved(result);}catch(error){message='Saved, but the view could not refresh. '+(error.message||'Try refreshing the page.');status.textContent=message;}}if(opts.clearOnSave!==false)fill();saved=true;}
      catch(error){if(!stopped)status.textContent='Could not save. '+(error.message||'Try again.');}
      finally{busy=false;if(!stopped){if(pendingUpdate){pendingUpdate=false;update({});}submit.disabled=false;if(cancel)cancel.disabled=false;controls.forEach(function(c){c.input.disabled=false;});visibility();box.removeAttribute('aria-busy');if(saved&&mode==='dialog'){status.textContent='';close();announce(message);}}}
    }
    submit.onclick=save;fields.oninput=visibility;fields.onchange=visibility;fields.onkeydown=function(event){if(event.key==='Enter'&&event.target.tagName==='INPUT'){event.preventDefault();void save();}};
    render();if(mode==='disclosure')box.open=!!opts.open;
    return {element:s.host,update:update,open:open,close:close,reset:reset,destroy:function(){if(stopped)return;stopped=true;clearTimeout(flashTimer);returnFocus=null;if(dialog&&dialog.open)dialog.close();s.host.removeAttribute('data-gezel-dialog-open');s.host.remove();s.host.disconnect();}};
  }
  // Underline tabs for peer destinations. The panels stay page-owned light DOM; this only labels and shows/hides them.
  function tabs(target,options){
    var opts=options||{},s=setup(target,'gezel-tabs',css+':host{display:block}[role=tablist]{display:flex;gap:4px;border-bottom:1px solid var(--line);overflow-x:auto;scrollbar-width:none}[role=tablist]::-webkit-scrollbar{display:none}[role=tab]{flex:0 0 auto;display:inline-flex;align-items:center;gap:8px;min-height:44px;margin:0 0 -1px;padding:8px 14px;border:0;border-bottom:2px solid transparent;border-radius:6px 6px 0 0;background:transparent;color:var(--muted);font-weight:500;white-space:nowrap}[role=tab]:hover:not([aria-selected=true]){color:inherit;background:color-mix(in srgb,var(--line) 24%,transparent)}[role=tab][aria-selected=true]{color:inherit;border-bottom-color:var(--accent)}[role=tab]:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}.badge{min-width:12px;padding:1px 6px;border-radius:4px;background:color-mix(in srgb,var(--accent) 16%,transparent);color:inherit;font-size:12px;font-weight:600;line-height:1.5;text-align:center}');
    var list=el('div'),buttons=[],selected=null,stopped=false;list.setAttribute('role','tablist');s.root.append(list);
    function items(){return Array.isArray(opts.tabs)?opts.tabs:[];}
    function panelOf(tab){return typeof tab.panel==='string'?document.querySelector(tab.panel):tab.panel||null;}
    function remembered(){try{var match=/(?:^#|&)tab=([^&]+)/.exec(location.hash);return match?decodeURIComponent(match[1]):null;}catch(_){return null;}}
    // replaceState keeps the choice across a reload without adding history entries the host's back button would walk.
    function remember(id){if(opts.remember===false)return;try{history.replaceState(history.state,'','#tab='+encodeURIComponent(id));}catch(_){}}
    function apply(){
      var all=items();if(!all.some(function(tab){return tab.id===selected;}))selected=all.length?all[0].id:null;
      all.forEach(function(tab,index){var on=tab.id===selected,panel=panelOf(tab);buttons[index].setAttribute('aria-selected',String(on));buttons[index].tabIndex=on?0:-1;if(panel)panel.hidden=!on;});
    }
    // Patch in place when the same tabs come back with new labels or badges, so a count changing never drops keyboard focus.
    function render(){
      var all=items(),same=buttons.length===all.length&&all.every(function(tab,index){return buttons[index].getAttribute('data-tab')===tab.id;});
      list.setAttribute('aria-label',opts.label||'Sections');
      if(!same){list.replaceChildren();buttons=all.map(function(tab){var button=el('button'),badge=el('span');button.type='button';button.setAttribute('role','tab');button.setAttribute('data-tab',tab.id);badge.className='badge';button.append(el('span'),badge);button.onclick=function(){select(tab.id);};list.append(button);return button;});}
      all.forEach(function(tab,index){
        var button=buttons[index],count=tab.badge,badge=button.lastChild,panel=panelOf(tab);button.firstChild.textContent=tab.label;
        badge.textContent=count===undefined||count===null||count===''||count===0?'':String(count);badge.hidden=!badge.textContent;
        if(panel){panel.setAttribute('role','tabpanel');panel.setAttribute('aria-label',tab.label);}
      });
      apply();
    }
    function select(id){if(stopped||!items().some(function(tab){return tab.id===id;}))return;var changed=id!==selected;selected=id;apply();remember(id);if(changed&&opts.onChange)opts.onChange(id);}
    list.onkeydown=function(event){var index=buttons.indexOf(s.root.activeElement),count=buttons.length;if(index<0||!count)return;var next=event.key==='ArrowRight'?(index+1)%count:event.key==='ArrowLeft'?(index+count-1)%count:event.key==='Home'?0:event.key==='End'?count-1:-1;if(next<0)return;event.preventDefault();buttons[next].focus();select(items()[next].id);};
    var hashed=opts.remember===false?null:remembered();selected=items().some(function(tab){return tab.id===hashed;})?hashed:opts.selected||null;render();
    function release(panels){panels.forEach(function(panel){if(panel){panel.hidden=false;panel.removeAttribute('role');panel.removeAttribute('aria-label');}});}
    return {element:s.host,select:select,selected:function(){return selected;},
      update:function(next){var before=items().map(panelOf);opts=Object.assign({},opts,next);if(next&&next.selected)selected=next.selected;render();var after=items().map(panelOf);release(before.filter(function(panel){return after.indexOf(panel)<0;}));},
      destroy:function(){if(stopped)return;stopped=true;release(items().map(panelOf));s.host.remove();s.host.disconnect();}};
  }
  var components={version:2,fileCard:fileCard,fileAdder:fileAdder,chat:chat,appLayout:appLayout,actionForm:actionForm,collectionFilter:collectionFilter,tabs:tabs};
  if(demo)components.demo={files:function(){return demoFiles.slice();},reset:function(){urls.forEach(function(url){URL.revokeObjectURL(url);});urls.clear();demoFiles=[];}};
  api.ui.components=components;
  return components;
};
})();
function installPageLayout(api,hosted,whole){
  var subs=[],full=false,current;
  function refresh(){
    var next=Object.freeze({fullscreen:hosted?full:!!whole||!!document.fullscreenElement,width:window.innerWidth,height:window.innerHeight});
    if(current&&current.fullscreen===next.fullscreen&&current.width===next.width&&current.height===next.height)return;
    current=next;
    document.documentElement.setAttribute('data-gezel-fullscreen',String(next.fullscreen));
    subs.slice().forEach(function(cb){try{cb(next);}catch(_){}});
  }
  Object.defineProperty(api.ui,'layout',{get:function(){return current;}});
  api.ui.onLayout=function(cb){subs.push(cb);return function(){var i=subs.indexOf(cb);if(i>=0)subs.splice(i,1);};};
  window.addEventListener('resize',refresh);
  document.addEventListener('fullscreenchange',refresh);
  refresh();
  return function(value){if(value&&typeof value.fullscreen==='boolean'){full=value.fullscreen;refresh();}};
}
function installDemoConversation(api,script,config){
  script=script&&typeof script==='object'?script:{};
  var known=config&&config.companion||{},name=script.name||known.name||'',role=script.role||known.role||'',avatar=script.avatar||known.avatar||'';
  var label=name||role||'Your companion',css=".dc{display:flex;flex-direction:column;height:100%;min-height:0;gap:10px}.log{position:relative;flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:12px;padding:2px 4px 4px 2px;overscroll-behavior:contain}.msg{display:flex;flex-direction:column;gap:6px;min-width:0}.who{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--muted);user-select:none}.who b{font-weight:600;color:var(--gezel-component-text,inherit)}.avatar{width:28px;height:28px;flex:none;border-radius:50%;overflow:hidden;display:grid;place-items:center;background:color-mix(in srgb,var(--accent) 20%,var(--surface));color:var(--accent);font-weight:600;font-size:13px}.avatar img{width:100%;height:100%;object-fit:cover}.body{font:15px/1.5 var(--font-heading,Georgia,serif);overflow-wrap:anywhere;user-select:text}.body p{margin:0 0 8px}.body p:last-child,.body ul:last-child{margin-bottom:0}.body ul{margin:2px 0 8px;padding-left:20px}.body li{margin:2px 0}.you{align-self:flex-end;max-width:86%}.you .body{padding:8px 12px;border-radius:10px;background:color-mix(in srgb,var(--accent) 15%,transparent);border:1px solid color-mix(in srgb,var(--accent) 32%,transparent)}.step{display:flex;align-items:flex-start;gap:8px;font-size:13px;color:var(--muted);padding:6px 10px;border:1px solid var(--line);border-radius:6px;background:color-mix(in srgb,var(--line) 14%,transparent)}.step svg{flex:none;width:14px;height:14px;margin-top:2px}.step b{font-weight:600;color:var(--gezel-component-text,inherit)}.step.failed b{text-decoration:line-through}.step.running svg{opacity:.5}.typing{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--muted)}.dots{display:inline-flex;gap:3px}.dots i{width:5px;height:5px;border-radius:50%;background:currentColor;opacity:.35;animation:dc-dot 1.1s ease-in-out infinite}.dots i:nth-child(2){animation-delay:.18s}.dots i:nth-child(3){animation-delay:.36s}@keyframes dc-dot{40%{opacity:1}}.ideas{display:flex;flex-wrap:wrap;gap:6px}.ideas button{font-size:13px;line-height:1.3;padding:6px 10px;text-align:left;max-width:100%}.ideas button:hover:not(:disabled){border-color:var(--accent)}.composer{display:flex;gap:8px;align-items:flex-end}textarea{flex:1;min-width:0;min-height:44px;max-height:140px;resize:none;box-sizing:border-box;padding:10px;border:1px solid var(--line);border-radius:6px;background:var(--surface);color:inherit;font:15px/1.4 var(--font-ui,system-ui,sans-serif)}textarea::placeholder{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}textarea:focus-visible{outline:3px solid var(--accent);outline-offset:1px}.send{min-height:44px;background:var(--accent);border-color:var(--accent);color:var(--surface);font-weight:600}.note{margin:0;font-size:12px;color:var(--muted)}@media(max-width:900px){.ideas{flex-wrap:nowrap;overflow-x:auto;padding-bottom:2px;scrollbar-width:thin}.ideas button{flex:none;white-space:nowrap}}@media(prefers-reduced-motion:reduce){.dots i{animation:none;opacity:.7}}";
  var reduced=!!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);
  var log=[],views=[],ideas=Array.isArray(script.suggestions)?script.suggestions.slice():[],used={},busy=false,typing=false,tail=Promise.resolve(),etag=0,watchers=[];
  var invoke=api.tools.invoke.bind(api.tools),watch=api.data.watch.bind(api.data),read=api.data.read.bind(api.data);
  function el(tag,text){var e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;}
  // A live read or tool result is fresh JSON; sample handlers often hand back the very object their tools mutate.
  function copy(value){var proto=value&&typeof value==='object'?Object.getPrototypeOf(value):null;if(proto!==Object.prototype&&proto!==Array.prototype)return value;try{return JSON.parse(JSON.stringify(value));}catch(_){return value;}}
  api.data.read=function(path,opts){return read(path,opts).then(copy);};
  function pause(ms){return new Promise(function(done){setTimeout(done,reduced?0:ms);});}
  // The live host repaints watchers after a write; the demo does the same for the companion's writes.
  api.data.watch=function(path,cb,opts){var stop=watch(path,cb,opts),entry={path:String(path),cb:cb};watchers.push(entry);return function(){var i=watchers.indexOf(entry);if(i>=0)watchers.splice(i,1);stop();};};
  function changed(){etag++;watchers.slice().forEach(function(w){try{w.cb({path:w.path,etag:'demo-'+etag});}catch(_){}});window.dispatchEvent(new Event('gezel-app-data-changed'));}
  // A visitor watches the conversation, so point at what the companion's tool changed on the page.
  function texts(){var seen=new Map();document.querySelectorAll('body *').forEach(function(node){if(seen.size>4000||node.closest('[data-gezel-demo-banner],script,style,template'))return;var own=Array.from(node.childNodes).filter(function(c){return c.nodeType===3;}).map(function(c){return c.data;}).join('').trim();if(own)seen.set(node,own);});return seen;}
  function highlight(before){
    if(reduced)return;var old=new Set(before.values()),fresh=[];
    texts().forEach(function(text,node){if(!old.has(text)&&node.getClientRects().length)fresh.push(node);});
    if(!fresh.length||fresh.length>16)return;
    fresh.forEach(function(node){if(node.animate)node.animate([{backgroundColor:'rgba(176,114,76,.32)',boxShadow:'0 0 0 3px rgba(176,114,76,.32)'},{backgroundColor:'rgba(176,114,76,0)',boxShadow:'0 0 0 3px rgba(176,114,76,0)'}],{duration:1800,easing:'ease-out'});});
    // Only beside a sticky companion: stacked below the page, scrolling would carry the conversation away.
    var hidden=fresh.find(function(node){var box=node.getBoundingClientRect();return box.bottom<0||box.top>innerHeight;});
    if(innerWidth>900&&hidden&&!fresh.some(function(node){var box=node.getBoundingClientRect();return box.top>=0&&box.bottom<=innerHeight&&node.closest('main')&&node.offsetHeight>40;}))window.scrollBy({top:hidden.getBoundingClientRect().top-innerHeight/3,behavior:'smooth'});
  }
  // A page action may summon the companion, as a manifest reaction does in Gezel.
  api.tools.invoke=function(tool,input){return invoke(tool,input).then(function(result){var react=script.reactions&&script.reactions[tool];if(typeof react==='function')turn(null,function(ctx){return react(input||{},result.output,ctx);});return result;});};
  function emit(method,entry){views.forEach(function(view){view[method](entry);});}
  function add(entry){log.push(entry);emit('render',entry);return entry;}
  function setBusy(on){busy=on;views.forEach(function(view){view.sync();});}
  function setTyping(on){typing=on;views.forEach(function(view){view.sync();});}
  function speak(text){
    text=String(text==null?'':text).trim();if(!text)return Promise.resolve();
    var entry=add({kind:'gezel',text:reduced?text:''});
    if(reduced)return Promise.resolve();
    var words=text.split(/(\s+)/),shown=0,step=Math.max(1,Math.ceil(words.length/70));
    return new Promise(function(done){(function next(){shown=Math.min(words.length,shown+step);entry.text=words.slice(0,shown).join('');emit('render',entry);if(shown<words.length)setTimeout(next,22);else done();})();});
  }
  function context(){
    return {
      page:api.page,
      read:function(path,opts){return api.data.read(path,opts);},
      say:speak,
      suggest:function(next){suggest(next);views.forEach(function(view){view.sync();});},
      invoke:function(tool,input,summary){
        return Promise.resolve(api.tools.list()).catch(function(){return [];}).then(function(names){
          var target=names.indexOf(tool)<0&&names.indexOf('page_'+tool)>=0?'page_'+tool:tool;
          var entry=add({kind:'step',tool:String(tool).replace(/^page_/,''),summary:summary||'',state:'running'});
          var before=texts(),was;
          return watched().then(function(snapshot){was=snapshot;return pause(420);}).then(function(){return invoke(target,input||{});}).then(function(result){
            entry.state='done';emit('render',entry);
            // A read (a status or board tool) leaves the watched files as they were: nothing to repaint.
            return watched().then(function(now){if(!watchers.length||now!==was){changed();setTimeout(function(){highlight(before);},140);}return copy(result.output);});
          },function(error){entry.state='failed';entry.error=error&&error.message||String(error);emit('render',entry);throw error;});
        });
      },
    };
  }
  function watched(){var paths=Array.from(new Set(watchers.map(function(w){return w.path;})));return Promise.all(paths.map(function(path){return api.data.read(path).then(function(value){try{return JSON.stringify(value);}catch(_){return String(Math.random());}},function(){return '';});})).then(function(all){return all.join('\u0000');});}
  // Fresh suggestions may repeat wording used earlier in the conversation.
  function suggest(next){ideas=next.slice();used={};}
  function deliver(reply,asked){
    if(reply&&typeof reply==='object'&&!Array.isArray(reply)){if(Array.isArray(reply.suggestions))suggest(reply.suggestions);reply=reply.reply||reply.text||'';}
    if(Array.isArray(reply))return reply.reduce(function(chain,line){return chain.then(function(){return pause(260).then(function(){return speak(line);});});},Promise.resolve());
    if(!reply&&asked)reply='I can only follow a few sample requests in this preview'+(remaining().length?', like the ones below':'')+'. In Gezel I work on anything in this project, with the model you choose.';
    return speak(reply);
  }
  function turn(asked,produce){
    tail=tail.then(function(){
      setBusy(true);setTyping(true);
      return pause(asked?560+Math.min(700,asked.length*7):380).then(function(){return produce(context());})
        .then(function(reply){setTyping(false);return deliver(reply,asked);},function(error){setTyping(false);return speak('That did not work in this preview. '+(error&&error.message||'Try another request.'));})
        .then(function(){setBusy(false);});
    });
    return tail;
  }
  function remaining(){var left=ideas.filter(function(idea){return !used[idea];});return left;}
  function send(text){
    text=String(text||'').trim();if(!text||busy)return false;
    used[text]=1;add({kind:'you',text:text});
    turn(text,function(ctx){return typeof script.respond==='function'?script.respond(text,ctx):null;});
    return true;
  }
  function inline(target,text){text.split(/(\*\*[^*\n]+\*\*)/).forEach(function(part){if(/^\*\*[^*\n]+\*\*$/.test(part))target.append(el('strong',part.slice(2,-2)));else if(part)target.append(document.createTextNode(part));});}
  // Paragraphs, and runs of "- " lines as lists, so "Bring these:" may sit directly above its bullets.
  function rich(target,text){
    target.replaceChildren();
    text.split(/\n{2,}/).forEach(function(block){
      var node=null;
      block.split('\n').forEach(function(line){
        var bullet=/^\s*[-*]\s+/.test(line),kind=bullet?'UL':'P';
        if(!node||node.tagName!==kind){node=el(kind.toLowerCase());target.append(node);}else if(!bullet)node.append(el('br'));
        if(bullet){var item=el('li');inline(item,line.replace(/^\s*[-*]\s+/,''));node.append(item);}else inline(node,line);
      });
    });
  }
  function humanize(tool){var words=tool.replace(/[_-]+/g,' ').trim();return words.charAt(0).toUpperCase()+words.slice(1);}
  function mark(state){var ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),path=document.createElementNS(ns,'path');svg.setAttribute('viewBox','0 0 16 16');svg.setAttribute('aria-hidden','true');path.setAttribute('fill','none');path.setAttribute('stroke','currentColor');path.setAttribute('stroke-width','1.8');path.setAttribute('stroke-linecap','round');path.setAttribute('d',state==='failed'?'M4 4l8 8M12 4l-8 8':state==='running'?'M3 8h2M7 8h2M11 8h2':'M3 8.5l3.2 3L13 4.5');svg.append(path);return svg;}
  function face(){var badge=el('span');badge.className='avatar';if(avatar){var img=el('img');img.alt='';img.src=avatar;img.onerror=function(){badge.replaceChildren(label.charAt(0).toUpperCase());};badge.append(img);}else badge.textContent=label.charAt(0).toUpperCase();return badge;}
  function mount(opts,root){
    opts=Object.assign({},opts);
    var style=el('style',css),wrap=el('div'),list=el('div'),pending=el('div'),dots=el('span'),choices=el('div'),composer=el('div'),input=el('textarea'),button=el('button','Send'),note=el('p','Sample conversation. In Gezel, replies come from the model you choose.'),nodes=new Map();
    wrap.className='dc';list.className='log';list.setAttribute('role','log');list.setAttribute('aria-live','polite');list.setAttribute('aria-label','Conversation with '+label);list.tabIndex=0;
    pending.className='typing';dots.className='dots';dots.append(el('i'),el('i'),el('i'));pending.append(dots,el('span',label+' is working…'));pending.hidden=true;
    choices.className='ideas';choices.setAttribute('role','group');choices.setAttribute('aria-label','Try asking');
    composer.className='composer';input.rows=1;input.setAttribute('aria-label','Message '+label);button.type='button';button.className='send';note.className='note';
    composer.append(input,button);list.append(pending);wrap.append(list,choices,composer,note);root.append(style,wrap);
    function placeholder(){input.placeholder=opts.placeholder||'Message '+label+'…';}
    // Follow the conversation, but never past the start of a message taller than the view. Every new
    // entry answers the visitor's own send or page action, so it always comes into view; only a reply
    // still streaming respects a reader who has scrolled away.
    function follow(force){var near=force||list.scrollHeight-list.scrollTop-list.clientHeight<120;return function(anchor){if(!near)return;var end=list.scrollHeight-list.clientHeight;list.scrollTop=anchor?Math.min(end,anchor.offsetTop-8):end;};}
    function lastMessage(){for(var i=log.length-1;i>=0;i--)if(log[i].kind!=='step')return nodes.get(log[i]);return null;}
    function render(entry){
      var node=nodes.get(entry),fresh=!node,keep=follow(fresh);
      if(fresh){
        if(entry.kind==='step'){node=el('div');node.className='step';}
        else{node=el('div');node.className='msg '+(entry.kind==='you'?'you':'gezel');var before=log[log.indexOf(entry)-1];if(entry.kind==='gezel'&&!(before&&before.kind==='gezel')){var who=el('div');who.className='who';who.append(face(),el('b',name||role||label));if(name&&role)who.append(el('span',role));node.append(who);}var body=el('div');body.className='body';node.append(body);}
        nodes.set(entry,node);list.insertBefore(node,pending);
      }
      if(entry.kind==='step'){node.className='step '+entry.state;var text=el('span'),title=el('b',humanize(entry.tool));text.append(title);if(entry.summary)text.append(document.createTextNode(' · '+entry.summary));if(entry.state==='failed')text.append(document.createTextNode(' — '+entry.error));node.title=entry.tool;node.replaceChildren(mark(entry.state),text);}
      else{var target=node.querySelector('.body');if(entry.kind==='you')target.textContent=entry.text;else rich(target,entry.text);}
      keep(entry.kind==='step'?null:node);
    }
    function sync(){
      var keep=follow(typing);pending.hidden=!typing;button.disabled=busy;
      choices.replaceChildren();var left=remaining();choices.hidden=!left.length;
      left.forEach(function(idea){var key=el('button',idea);key.type='button';key.disabled=busy;key.onclick=function(){if(send(idea))list.focus({preventScroll:true});};choices.append(key);});
      keep(typing?null:lastMessage());
    }
    function grow(){input.style.height='auto';input.style.height=Math.min(140,input.scrollHeight)+'px';}
    function submit(){if(send(input.value)){input.value='';grow();}}
    button.onclick=submit;input.oninput=grow;
    input.onkeydown=function(event){if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();submit();}};
    var view={render:render,sync:sync};views.push(view);placeholder();
    if(!log.length){var hello=script.greeting||('Hello. I’m '+(name?name+(role?', your '+role.toLowerCase():''):role?'your '+role.toLowerCase():label.toLowerCase())+'. Ask me about this sample project.');log.push({kind:'gezel',text:String(hello)});}
    log.forEach(render);sync();
    return Promise.resolve({position:function(){},update:function(next){opts=Object.assign({},opts,next);placeholder();},destroy:function(){var i=views.indexOf(view);if(i>=0)views.splice(i,1);wrap.remove();style.remove();}});
  }
  return {mount:mount,send:send};
}
var make=window.makeDemoGezel;
window.makeDemoGezel=function(opts){
  if(window.gezel)return window.gezel;
  var node=document.getElementById('gezel-demo-config');
  var config=node?JSON.parse(node.textContent):{};
  var api=make(opts);
  installPageLayout(api,false,config.layout!=='pane');
  var conversation=installDemoConversation(api,opts&&opts.chat,config);
  window.installGezelComponents(api,{demoTargets:config.imports||[],existingPaths:opts&&opts.existingPaths||[],chat:conversation.mount});
  return api;
};
})();