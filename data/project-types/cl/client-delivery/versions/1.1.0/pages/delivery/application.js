// App-owned composition; platform components come from the Gezel host.
(function(){
'use strict';
var config={
  "title": "At the delivery board",
  "description": "Log a milestone, record a client approval, or ask what is waiting before the weekly update.",
  "load": "loadBoard",
  "placeholder": "What moved this week?",
  "tabs": [
    {
      "id": "home",
      "label": "Home",
      "sections": [
        ".tiles",
        "#waiting-section",
        "#projects-section"
      ],
      "actions": [
        "set_milestone_status",
        "add_milestone",
        "add_project"
      ]
    },
    {
      "id": "milestones",
      "label": "Milestones",
      "sections": [
        "#milestones-section"
      ],
      "actions": [
        "add_milestone",
        "set_milestone_status"
      ]
    },
    {
      "id": "updates",
      "label": "Updates",
      "sections": [
        "#report-section"
      ]
    }
  ],
  "filter": {
    "container": "#milestones-section .table-wrap",
    "selector": "tbody tr",
    "label": "Find a milestone",
    "placeholder": "Milestone, project or owner"
  },
  "actions": [
    {
      "tool": "add_project",
      "pageTool": "page_add_project",
      "title": "Add a client project",
      "fields": [
        {
          "name": "title",
          "label": "Project",
          "required": true,
          "placeholder": "Website redesign"
        },
        {
          "name": "client",
          "label": "Client",
          "required": true,
          "placeholder": "Juniper Press"
        },
        {
          "name": "contact",
          "label": "Approves for the client"
        },
        {
          "name": "lead",
          "label": "Our lead"
        },
        {
          "name": "dueAt",
          "label": "Due",
          "type": "date"
        },
        {
          "name": "status",
          "label": "Status",
          "required": true,
          "options": [
            "active",
            "proposed",
            "on-hold"
          ]
        }
      ],
      "submitLabel": "Add project"
    },
    {
      "tool": "add_milestone",
      "pageTool": "page_add_milestone",
      "title": "Add a milestone",
      "fields": [
        {
          "name": "project",
          "label": "Project",
          "required": true,
          "options": [],
          "records": {
            "path": "projects.json",
            "list": "records",
            "labelFields": [
              "fields.title"
            ],
            "where": {
              "field": "status",
              "not": [
                "done"
              ]
            }
          }
        },
        {
          "name": "title",
          "label": "Milestone",
          "required": true,
          "placeholder": "Homepage design"
        },
        {
          "name": "dueAt",
          "label": "Due",
          "type": "date",
          "required": true
        },
        {
          "name": "owner",
          "label": "Owner"
        }
      ],
      "description": "A step the client sees and approves."
    },
    {
      "tool": "set_milestone_status",
      "pageTool": "page_set_milestone_status",
      "title": "Update a milestone",
      "submitLabel": "Update",
      "fields": [
        {
          "name": "id",
          "label": "Milestone",
          "required": true,
          "options": [],
          "records": {
            "path": "milestones.json",
            "list": "records",
            "labelFields": [
              "fields.title",
              "fields.dueAt"
            ],
            "where": {
              "field": "status",
              "not": [
                "approved"
              ]
            }
          }
        },
        {
          "name": "status",
          "label": "Now",
          "required": true,
          "options": [
            {
              "value": "in-progress",
              "label": "In progress"
            },
            {
              "value": "waiting",
              "label": "Sent to the client"
            },
            {
              "value": "approved",
              "label": "Approved"
            }
          ]
        },
        {
          "name": "note",
          "label": "Client feedback or note",
          "placeholder": "Bigger prices on the menu"
        }
      ],
      "description": "Record that it is underway, out with the client, or approved."
    }
  ]
};
// Shared app composition v2 (the Gezel app UX guide). On hosts with page components version 2,
// actions are keys that open dialogs, settings are inline forms, and config.tabs groups the page into
// Home, noun and Settings tabs. Older hosts keep the expandable forms and an "On this page" list.
function boot(){
var api=window.gezel,kit=api&&api.ui.components,main=document.querySelector('main');if(!api||!main)return;
var handles=[],stops=[],stopped=false,forms=[],revision=0,byTool={};
// An action's key is its id when two forms share one tool, otherwise its tool.
function keyOf(action){return action.id||action.tool;}
(config.actions||[]).forEach(function(action){byTool[keyOf(action)]=action;});
var problem=document.createElement('p');problem.className='app-problem';problem.hidden=true;problem.setAttribute('role','status');main.prepend(problem);
function error(e){problem.hidden=false;problem.textContent='Could not refresh this view. '+(e.message||'Try again.');}
if(!kit||!kit.appLayout){problem.hidden=false;problem.textContent='Update Gezel to use the fullscreen conversation and page controls.';return;}
var layout=kit.appLayout(main,{title:config.title,description:config.description,chat:config.chat===false?false:{lockRecipient:!config.crew,showAddress:!!config.crew,showThreads:false,placeholder:config.placeholder||'Talk with your companion…',attachments:!!config.attachments,dictation:!!config.dictation}});handles.push(layout);
var modern=kit.version>=2&&typeof kit.tabs==='function';
document.documentElement.toggleAttribute('data-app-legacy',!modern);
function valueAt(object,path){return path.split('.').reduce(function(value,key){return value==null?undefined:value[key];},object);}
// People read dates, not ISO strings: "2026-11-12" becomes "Thu, Nov 12" in choice labels.
function shown(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return value;var date=new Date(value+'T12:00:00');return isFinite(date)?date.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'}):value;}
// A choice list may leave out finished records: {field:'status', not:['done']} or {field, in:[...]}.
function included(record,where){if(!where)return true;var value=valueAt(record,where.field);if(where.in&&where.in.indexOf(value)<0)return false;if(where.not&&where.not.indexOf(value)>=0)return false;return true;}
function mountForm(mount,action,options){
  var fields=action.fields.map(function(f){return Object.assign({},f);});
  var form={action:action,fields:fields,last:'',inline:!!options&&options.presentation==='inline'};
  form.handle=kit.actionForm(mount,Object.assign({title:action.title,description:action.description,buttonLabel:action.buttonLabel,successMessage:action.successMessage,tool:action.pageTool,fields:fields,mapInput:action.mapInput,submitLabel:action.submitLabel||'Save',onSaved:async function(){window.dispatchEvent(new Event('gezel-app-data-changed'));if(form.inline)setTimeout(function(){void refreshCurrent(form);},0);}},options||{}));
  handles.push(form.handle);forms.push(form);return form;
}
function recordPaths(){return Array.from(new Set(forms.flatMap(function(form){return form.fields.filter(function(f){return f.records;}).map(function(f){return f.records.path;});})));}
async function refreshChoices(){var current=++revision;try{var paths=recordPaths();var docs=await Promise.all(paths.map(function(path){return api.data.read(path);}));if(stopped||revision!==current)return;forms.forEach(function(form){form.fields.forEach(function(field){if(!field.records)return;var spec=field.records,doc=docs[paths.indexOf(spec.path)],records=(valueAt(doc,spec.list)||[]).filter(function(record){return included(record,spec.where);});field.options=records.map(function(record){return {value:record.id,label:spec.labelFields.map(function(path){return shown(valueAt(record,path));}).filter(Boolean).join(' · ')};});});var next=JSON.stringify(form.fields);if(next!==form.last){form.last=next;form.handle.update({fields:form.fields});}});}catch(e){error(e);}}
// A settings form shows what is saved now: action.current = {path, fields: {formField: 'data.path'}}. A form being edited is left alone.
// The form just saved refreshes after its save settles (it ignores resets while busy), even though focus is still on its Save key.
async function refreshCurrent(saved){try{await Promise.all(forms.filter(function(form){return form.inline&&form.action.current&&form.handle.reset&&(!saved||form===saved);}).map(async function(form){var spec=form.action.current,doc=await api.data.read(spec.path);if(stopped||form!==saved&&form.handle.element.matches(':focus-within'))return;var values={};Object.keys(spec.fields).forEach(function(name){var value=valueAt(doc,spec.fields[name]);if(value!==undefined&&value!==null)values[name]=value;});form.handle.reset(values);}));}catch(e){error(e);}}
function headerEnd(){var heading=main.querySelector('h1'),sub=heading&&heading.nextElementSibling&&heading.nextElementSibling.tagName==='P'?heading.nextElementSibling:null;return config.headerEnd?main.querySelector(config.headerEnd):sub||heading;}
function insertAfterHeader(node){var anchor=headerEnd();if(anchor)anchor.after(node);else main.prepend(node);}
// Keys for the given tools, the first (or the named one) drawn as the view's one primary.
function actionBar(tools,primary){var row=document.createElement('div');row.className='app-actionbar';tools=(tools||[]).filter(function(tool){return byTool[tool];});if(primary===undefined)primary=tools[0];tools.forEach(function(tool){var mount=document.createElement('div');row.append(mount);mountForm(mount,byTool[tool],{presentation:'dialog',primary:tool===primary});});row.hidden=!tools.length;return row;}
if(!modern)buildLegacy();else if(config.tabs)buildTabs();else insertAfterHeader(actionBar(config.bar||(config.actions||[]).filter(function(action){return !action.rowOnly;}).map(keyOf),config.primary));
if(modern)buildRowDialogs();
void refreshChoices();void refreshCurrent();
// Pages announce their own edits; a demo's watches fire only for the sample conversation, so listen as well.
function dataChanged(){void refreshChoices();void refreshCurrent();}
window.addEventListener('gezel-app-data-changed',dataChanged);stops.push(function(){window.removeEventListener('gezel-app-data-changed',dataChanged);});
recordPaths().forEach(function(path){stops.push(api.data.watch(path,refreshChoices));});
Array.from(new Set(forms.filter(function(form){return form.inline&&form.action.current;}).map(function(form){return form.action.current.path;}))).forEach(function(path){stops.push(api.data.watch(path,function(){void refreshCurrent();}));});
// config.filter: {container, selector, label, placeholder?, minItems?}, or the older [container, selector, label].
var filter=Array.isArray(config.filter)?{container:config.filter[0],selector:config.filter[1],label:config.filter[2]}:config.filter;
if(filter&&kit.collectionFilter){var container=document.querySelector(filter.container);if(container){var search=document.createElement('div');search.className='app-search';container.before(search);handles.push(kit.collectionFilter(search,{container:container,selector:filter.selector,label:filter.label,placeholder:filter.placeholder,minItems:filter.minItems===undefined?8:filter.minItems}));}}
function buildTabs(){
  var bar=document.createElement('div'),last=bar,specs=[];bar.className='app-tabs';insertAfterHeader(bar);
  config.tabs.forEach(function(tab){
    var panel=document.createElement('div');panel.className='app-panel';panel.id='app-panel-'+tab.id;last.after(panel);last=panel;
    if((tab.actions||[]).length)panel.append(actionBar(tab.actions,tab.primary));
    var settings=(tab.settings||[]).filter(function(tool){return byTool[tool];});
    if(settings.length){var box=document.createElement('div');box.className='app-settings';panel.append(box);settings.forEach(function(tool){var mount=document.createElement('div');box.append(mount);mountForm(mount,byTool[tool],{presentation:'inline',clearOnSave:false,submitLabel:byTool[tool].submitLabel||'Save changes'});});}
    (tab.sections||[]).forEach(function(selector){main.querySelectorAll(selector).forEach(function(node){if(!node.closest('.app-panel'))panel.append(node);});});
    specs.push({id:tab.id,label:tab.label,panel:panel,count:tab.badge});
  });
  var tabs=kit.tabs(bar,{label:config.tabsLabel||'App sections',tabs:specs.map(function(spec){return {id:spec.id,label:spec.label,panel:spec.panel};})});handles.push(tabs);
  // A tab's badge mirrors a count the page already shows (tab.badge is that element's selector), so the two never disagree.
  var shown='';
  function badges(){var next=specs.map(function(spec){var node=spec.count?document.querySelector(spec.count):null,text=node?node.textContent.trim():'';return {id:spec.id,label:spec.label,panel:spec.panel,badge:/^[1-9][0-9]*$/.test(text)?text:''};}),key=next.map(function(tab){return tab.badge;}).join('|');if(key!==shown){shown=key;tabs.update({tabs:next});}}
  if(specs.some(function(spec){return spec.count;})){var observer=new MutationObserver(badges);observer.observe(main,{subtree:true,childList:true,characterData:true});stops.push(function(){observer.disconnect();});badges();}
  window.appTabs={select:function(id){tabs.select(id);}};
}
// Any action can open from a record: <button data-app-action="tool" data-app-values='{"id":"…"}'>. These dialogs sit
// outside the tab panels, so a hidden tab never hides one.
function buildRowDialogs(){
  var box=document.createElement('div'),openers={};box.className='app-dialogs';main.append(box);
  (config.actions||[]).forEach(function(action){var mount=document.createElement('div');box.append(mount);openers[keyOf(action)]=mountForm(mount,action,{presentation:'dialog',trigger:false});});
  main.addEventListener('click',function(event){var target=event.target.closest&&event.target.closest('[data-app-action]');var form=target&&openers[target.getAttribute('data-app-action')];if(!form)return;event.preventDefault();var values={};try{values=JSON.parse(target.getAttribute('data-app-values')||'{}');}catch(_){}form.handle.open(values);});
}
function buildLegacy(){
  var actions=document.createElement('div');actions.className='app-actions';actions.hidden=!(config.actions||[]).length;
  var anchor=main.querySelector('h1');if(anchor){var after=anchor.nextElementSibling;after?after.after(actions):anchor.after(actions);}else main.prepend(actions);
  (config.actions||[]).forEach(function(action){var mount=document.createElement('div');actions.append(mount);mountForm(mount,action);});
  var skip='dialog,[role=dialog]'+(config.navExclude?','+config.navExclude:'');
  var headings=Array.from(main.querySelectorAll('h2')).filter(function(h){return h.textContent.trim()&&!h.closest(skip);});
  if(headings.length>1&&headings.length<10){var nav=document.createElement('nav');nav.className='app-section-nav';nav.setAttribute('aria-label','On this page');headings.forEach(function(h,index){if(!h.id)h.id='app-section-'+index;var id=h.id,label=Array.from(h.childNodes).filter(function(n){return n.nodeType===3;}).map(function(n){return n.data;}).join('').trim()||h.textContent.trim(),link=document.createElement('a');link.href='#'+id;link.textContent=label;link.onclick=function(event){var target=document.getElementById(id);if(target){event.preventDefault();target.scrollIntoView({block:'start'});}};nav.append(link);});actions.before(nav);}
}
window.addEventListener('pagehide',function(){stopped=true;revision++;stops.forEach(function(stop){stop();});handles.reverse().forEach(function(handle){handle.destroy();});},{once:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
