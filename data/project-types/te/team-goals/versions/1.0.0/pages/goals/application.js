// App-owned composition; platform components come from the Gezel host.
(function(){
'use strict';
var config={
  "title": "At the goals board",
  "description": "Record what moved, log a check-in, or capture what a meeting agreed.",
  "load": "loadGoals",
  "filter": [
    "#goals-section .goal-list",
    ".goal",
    "Find a goal"
  ],
  "placeholder": "Tell your planner what moved this week…",
  "actions": [
    {
      "tool": "add_goal",
      "pageTool": "page_add_goal",
      "title": "Add a goal",
      "fields": [
        {
          "name": "title",
          "label": "Goal",
          "required": true,
          "placeholder": "Win four new retainer clients"
        },
        {
          "name": "owner",
          "label": "Owner"
        },
        {
          "name": "dueAt",
          "label": "Due",
          "type": "date",
          "required": true
        }
      ]
    },
    {
      "tool": "add_key_result",
      "pageTool": "page_add_key_result",
      "title": "Add a key result",
      "fields": [
        {
          "name": "goal",
          "label": "Goal",
          "required": true,
          "options": [],
          "records": {
            "path": "goals.json",
            "list": "records",
            "labelFields": [
              "fields.title"
            ],
            "where": {
              "field": "status",
              "in": [
                "active"
              ]
            }
          }
        },
        {
          "name": "title",
          "label": "Key result",
          "required": true,
          "placeholder": "New retainer clients"
        },
        {
          "name": "current",
          "label": "Where it is now",
          "type": "number",
          "required": true
        },
        {
          "name": "target",
          "label": "Target",
          "type": "number",
          "required": true
        },
        {
          "name": "unit",
          "label": "Counted in",
          "placeholder": "clients, %, $"
        }
      ]
    },
    {
      "tool": "update_key_result",
      "pageTool": "page_update_key_result",
      "title": "Record progress",
      "submitLabel": "Record",
      "fields": [
        {
          "name": "keyResult",
          "label": "Key result",
          "required": true,
          "options": [],
          "records": {
            "path": "keyresults.json",
            "list": "records",
            "labelFields": [
              "fields.title",
              "fields.goal"
            ],
            "where": {
              "field": "status",
              "not": [
                "closed"
              ]
            }
          }
        },
        {
          "name": "how",
          "label": "How it changed",
          "required": true,
          "options": [
            "by an amount",
            "to a new total"
          ]
        },
        {
          "name": "change",
          "label": "Moved by",
          "type": "number",
          "required": true,
          "placeholder": "2, or -1",
          "when": {
            "field": "how",
            "equals": "by an amount"
          }
        },
        {
          "name": "value",
          "label": "New total",
          "type": "number",
          "required": true,
          "when": {
            "field": "how",
            "equals": "to a new total"
          }
        },
        {
          "name": "note",
          "label": "What happened",
          "placeholder": "Alder Co signed"
        }
      ]
    },
    {
      "tool": "log_checkin",
      "pageTool": "page_log_checkin",
      "title": "Log a check-in",
      "submitLabel": "Log",
      "fields": [
        {
          "name": "goal",
          "label": "Goal",
          "required": true,
          "options": [],
          "records": {
            "path": "goals.json",
            "list": "records",
            "labelFields": [
              "fields.title"
            ],
            "where": {
              "field": "status",
              "in": [
                "active"
              ]
            }
          }
        },
        {
          "name": "who",
          "label": "Who"
        },
        {
          "name": "confidence",
          "label": "Confidence",
          "required": true,
          "options": [
            "on-track",
            "at-risk",
            "off-track"
          ]
        },
        {
          "name": "note",
          "label": "What they said",
          "placeholder": "Two proposals out; Alder looks likely"
        }
      ]
    },
    {
      "tool": "add_action",
      "pageTool": "page_add_action",
      "title": "Add a meeting action",
      "fields": [
        {
          "name": "title",
          "label": "Action",
          "required": true,
          "placeholder": "Send Alder Co the proposal"
        },
        {
          "name": "owner",
          "label": "Owner",
          "required": true
        },
        {
          "name": "dueAt",
          "label": "Due",
          "type": "date"
        },
        {
          "name": "goal",
          "label": "For goal",
          "options": [],
          "records": {
            "path": "goals.json",
            "list": "records",
            "labelFields": [
              "fields.title"
            ],
            "where": {
              "field": "status",
              "in": [
                "active"
              ]
            }
          }
        }
      ]
    }
  ]
};
function boot(){
var api=window.gezel,kit=api&&api.ui.components,main=document.querySelector('main');if(!api||!main)return;
var handles=[],stops=[],stopped=false;
var problem=document.createElement('p');problem.className='app-problem';problem.hidden=true;problem.setAttribute('role','status');main.prepend(problem);
function error(e){problem.hidden=false;problem.textContent='Could not refresh this view. '+(e.message||'Try again.');}
if(!kit||!kit.appLayout){problem.hidden=false;problem.textContent='Update Gezel to use the fullscreen conversation and page controls.';return;}
var layout=kit.appLayout(main,{title:config.title,description:config.description,chat:config.chat===false?false:{lockRecipient:!config.crew,showAddress:!!config.crew,showThreads:false,placeholder:config.placeholder||'Talk with your companion…',attachments:!!config.attachments,dictation:!!config.dictation}});handles.push(layout);
var actions=document.createElement('div');actions.className='app-actions';actions.hidden=!(config.actions||[]).length;
var anchor=main.querySelector('h1');if(anchor){var after=anchor.nextElementSibling;after?after.after(actions):anchor.after(actions);}else main.prepend(actions);
var forms=[];
(config.actions||[]).forEach(function(action){var mount=document.createElement('div');actions.append(mount);var fields=action.fields.map(function(f){return Object.assign({},f);});var handle=kit.actionForm(mount,{title:action.title,tool:action.pageTool,fields:fields,mapInput:action.mapInput,submitLabel:action.submitLabel||'Save',onSaved:async function(){window.dispatchEvent(new Event('gezel-app-data-changed'));await refreshChoices();}});handles.push(handle);forms.push({action:action,fields:fields,handle:handle,last:''});});
// A choice list may leave out finished records: {field:'status', not:['done']} or {field, in:[...]}.
function included(record,where){if(!where)return true;var value=valueAt(record,where.field);if(where.in&&where.in.indexOf(value)<0)return false;if(where.not&&where.not.indexOf(value)>=0)return false;return true;}
function valueAt(object,path){return path.split('.').reduce(function(value,key){return value&&value[key];},object);}
var revision=0;
async function refreshChoices(){var current=++revision;try{var paths=Array.from(new Set(forms.flatMap(function(form){return form.fields.filter(function(f){return f.records;}).map(function(f){return f.records.path;});})));var docs=await Promise.all(paths.map(function(path){return api.data.read(path);}));if(stopped||revision!==current)return;forms.forEach(function(form){form.fields.forEach(function(field){if(!field.records)return;var spec=field.records,doc=docs[paths.indexOf(spec.path)],records=(valueAt(doc,spec.list)||[]).filter(function(record){return included(record,spec.where);});field.options=records.map(function(record){return {value:record.id,label:spec.labelFields.map(function(path){return valueAt(record,path);}).filter(Boolean).join(' · ')};});});var next=JSON.stringify(form.fields);if(next!==form.last){form.last=next;form.handle.update({fields:form.fields});}});}catch(e){error(e);}}
void refreshChoices();
Array.from(new Set(forms.flatMap(function(form){return form.fields.filter(function(f){return f.records;}).map(function(f){return f.records.path;});}))).forEach(function(path){stops.push(api.data.watch(path,refreshChoices));});
if(config.filter&&kit.collectionFilter){var container=document.querySelector(config.filter[0]);if(container){var search=document.createElement('div');search.className='app-search';container.before(search);handles.push(kit.collectionFilter(search,{container:container,selector:config.filter[1],label:config.filter[2]}));}}
var headings=Array.from(main.querySelectorAll('h2')).filter(function(h){return h.textContent.trim()&&!h.closest('dialog,[role=dialog]');});if(headings.length>1&&headings.length<10){var nav=document.createElement('nav');nav.className='app-section-nav';nav.setAttribute('aria-label','On this page');headings.forEach(function(h,index){if(!h.id)h.id='app-section-'+index;var id=h.id,label=Array.from(h.childNodes).filter(function(n){return n.nodeType===3;}).map(function(n){return n.data;}).join('').trim()||h.textContent.trim(),link=document.createElement('a');link.href='#'+id;link.textContent=label;link.onclick=function(event){var target=document.getElementById(id)||Array.from(main.querySelectorAll('h2')).find(function(c){return c.textContent.trim().indexOf(label)===0;});if(target){event.preventDefault();target.scrollIntoView({block:'start'});}};nav.append(link);});actions.before(nav);}
window.addEventListener('pagehide',function(){stopped=true;revision++;stops.forEach(function(stop){stop();});handles.reverse().forEach(function(handle){handle.destroy();});},{once:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
