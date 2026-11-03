// App-owned composition; platform components come from the Gezel host.
(function(){
'use strict';
var config={
  "title": "In the campaign room",
  "description": "Plan an asset, move one along, log the numbers or a spend, or ask how the campaign is doing.",
  "load": "loadCampaign",
  "filter": [
    "#assets-section .table-wrap",
    "tbody tr",
    "Find an asset"
  ],
  "placeholder": "Tell your campaign manager what changed…",
  "actions": [
    {
      "tool": "set_campaign",
      "pageTool": "page_set_campaign",
      "title": "Campaign details",
      "fields": [
        {
          "name": "name",
          "label": "Campaign",
          "placeholder": "The Salt Road launch"
        },
        {
          "name": "goal",
          "label": "Goal",
          "placeholder": "600 preorders by launch day"
        },
        {
          "name": "goalMetric",
          "label": "The goal counts",
          "placeholder": "preorders"
        },
        {
          "name": "goalTarget",
          "label": "Goal number",
          "type": "number",
          "min": 0,
          "step": 1
        },
        {
          "name": "launchAt",
          "label": "Launch day",
          "type": "date"
        },
        {
          "name": "budget",
          "label": "Budget ($)",
          "type": "number",
          "min": 0
        }
      ]
    },
    {
      "tool": "add_asset",
      "pageTool": "page_add_asset",
      "title": "Add an asset",
      "fields": [
        {
          "name": "title",
          "label": "Asset",
          "required": true,
          "placeholder": "Launch-day email"
        },
        {
          "name": "channel",
          "label": "Channel",
          "required": true,
          "options": [
            "email",
            "instagram",
            "facebook",
            "linkedin",
            "bluesky",
            "x",
            "tiktok",
            "youtube",
            "website",
            "ads",
            "print",
            "press",
            "event",
            "other"
          ]
        },
        {
          "name": "goesOutAt",
          "label": "Goes out",
          "type": "date"
        },
        {
          "name": "owner",
          "label": "Owner"
        },
        {
          "name": "status",
          "label": "Stage",
          "required": true,
          "options": [
            "idea",
            "draft",
            "approved",
            "scheduled"
          ]
        }
      ]
    },
    {
      "tool": "move_asset",
      "pageTool": "page_move_asset",
      "title": "Move an asset",
      "submitLabel": "Move",
      "fields": [
        {
          "name": "id",
          "label": "Asset",
          "required": true,
          "options": [],
          "records": {
            "path": "assets.json",
            "list": "records",
            "labelFields": [
              "fields.title",
              "status"
            ],
            "where": {
              "field": "status",
              "not": [
                "live"
              ]
            }
          }
        },
        {
          "name": "status",
          "label": "Stage",
          "required": true,
          "options": [
            "idea",
            "draft",
            "approved",
            "scheduled",
            "live"
          ]
        },
        {
          "name": "goesOutAt",
          "label": "New date",
          "type": "date"
        }
      ]
    },
    {
      "tool": "log_result",
      "pageTool": "page_log_result",
      "title": "Log results",
      "submitLabel": "Log",
      "fields": [
        {
          "name": "id",
          "label": "Asset",
          "required": true,
          "options": [],
          "records": {
            "path": "assets.json",
            "list": "records",
            "labelFields": [
              "fields.title",
              "fields.channel"
            ]
          }
        },
        {
          "name": "day",
          "label": "Day",
          "type": "date",
          "required": true
        },
        {
          "name": "reach",
          "label": "Reach",
          "type": "number",
          "min": 0,
          "step": 1
        },
        {
          "name": "clicks",
          "label": "Clicks",
          "type": "number",
          "min": 0,
          "step": 1
        },
        {
          "name": "conversions",
          "label": "Conversions",
          "type": "number",
          "min": 0,
          "step": 1
        }
      ]
    },
    {
      "tool": "log_spend",
      "pageTool": "page_log_spend",
      "title": "Log a spend",
      "submitLabel": "Log",
      "fields": [
        {
          "name": "amount",
          "label": "Amount ($)",
          "type": "number",
          "required": true,
          "min": 0.01
        },
        {
          "name": "channel",
          "label": "Channel",
          "required": true,
          "options": [
            "email",
            "instagram",
            "facebook",
            "linkedin",
            "bluesky",
            "x",
            "tiktok",
            "youtube",
            "website",
            "ads",
            "print",
            "press",
            "event",
            "other"
          ]
        },
        {
          "name": "note",
          "label": "What for",
          "placeholder": "Second round of preorder ads"
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
