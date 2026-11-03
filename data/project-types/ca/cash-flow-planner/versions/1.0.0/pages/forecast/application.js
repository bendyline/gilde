// App-owned composition; platform components come from the Gezel host.
(function(){
'use strict';
var config={
  "title": "With your bookkeeper",
  "description": "Update the bank balance, add an invoice or a bill, or ask what happens if something changes.",
  "load": "loadForecast",
  "filter": [
    "#plan-section .table-wrap",
    "tbody tr",
    "Find an item"
  ],
  "placeholder": "Tell your bookkeeper what is coming in or going out…",
  "actions": [
    {
      "tool": "set_balance",
      "pageTool": "page_set_balance",
      "title": "Update the bank balance",
      "submitLabel": "Save balance",
      "fields": [
        {
          "name": "amount",
          "label": "Cash in the bank",
          "type": "number",
          "required": true,
          "placeholder": "9840"
        },
        {
          "name": "date",
          "label": "As of",
          "type": "date",
          "required": true
        },
        {
          "name": "cushion",
          "label": "Keep at least",
          "type": "number",
          "placeholder": "12000"
        }
      ]
    },
    {
      "tool": "add_cash_item",
      "pageTool": "page_add_cash_item",
      "title": "Add expected cash",
      "submitLabel": "Add it",
      "fields": [
        {
          "name": "name",
          "label": "What it is",
          "required": true,
          "placeholder": "Hollis Bakery invoice"
        },
        {
          "name": "direction",
          "label": "Which way",
          "required": true,
          "options": [
            {
              "value": "out",
              "label": "Money out (a bill or cost)"
            },
            {
              "value": "in",
              "label": "Money in (an invoice or sale)"
            }
          ]
        },
        {
          "name": "amount",
          "label": "Amount",
          "type": "number",
          "required": true,
          "placeholder": "7200"
        },
        {
          "name": "date",
          "label": "Expected on",
          "type": "date",
          "required": true
        },
        {
          "name": "recurs",
          "label": "Repeats",
          "required": true,
          "options": [
            {
              "value": "none",
              "label": "Once"
            },
            {
              "value": "weekly",
              "label": "Every week"
            },
            {
              "value": "biweekly",
              "label": "Every two weeks"
            },
            {
              "value": "monthly",
              "label": "Every month"
            },
            {
              "value": "quarterly",
              "label": "Every quarter"
            }
          ]
        }
      ]
    },
    {
      "tool": "settle_cash_item",
      "pageTool": "page_settle_cash_item",
      "title": "Mark it paid or received",
      "submitLabel": "Mark it",
      "fields": [
        {
          "name": "item",
          "label": "Item",
          "required": true,
          "options": [],
          "records": {
            "path": "cashflow.json",
            "list": "records",
            "labelFields": [
              "fields.name",
              "fields.date"
            ],
            "where": {
              "field": "status",
              "in": [
                "expected"
              ]
            }
          }
        },
        {
          "name": "amount",
          "label": "Actual amount, if different",
          "type": "number"
        }
      ]
    },
    {
      "tool": "what_if",
      "pageTool": "page_what_if",
      "title": "Try a what-if",
      "submitLabel": "Try it",
      "fields": [
        {
          "name": "scenario",
          "label": "Name it",
          "required": true,
          "placeholder": "Hire an apprentice"
        },
        {
          "name": "change",
          "label": "What changes",
          "required": true,
          "options": [
            {
              "value": "delay",
              "label": "Something expected comes later"
            },
            {
              "value": "add",
              "label": "A new cost or income"
            }
          ]
        },
        {
          "name": "item",
          "label": "Item",
          "required": true,
          "options": [],
          "records": {
            "path": "cashflow.json",
            "list": "records",
            "labelFields": [
              "fields.name",
              "fields.date"
            ],
            "where": {
              "field": "status",
              "in": [
                "expected"
              ]
            }
          },
          "when": {
            "field": "change",
            "equals": "delay"
          }
        },
        {
          "name": "weeks",
          "label": "Weeks later",
          "type": "number",
          "required": true,
          "placeholder": "4",
          "when": {
            "field": "change",
            "equals": "delay"
          }
        },
        {
          "name": "name",
          "label": "What it is",
          "required": true,
          "placeholder": "Apprentice wages",
          "when": {
            "field": "change",
            "equals": "add"
          }
        },
        {
          "name": "direction",
          "label": "Which way",
          "required": true,
          "options": [
            {
              "value": "out",
              "label": "Money out (a bill or cost)"
            },
            {
              "value": "in",
              "label": "Money in (an invoice or sale)"
            }
          ],
          "when": {
            "field": "change",
            "equals": "add"
          }
        },
        {
          "name": "amount",
          "label": "Amount",
          "type": "number",
          "required": true,
          "placeholder": "1900",
          "when": {
            "field": "change",
            "equals": "add"
          }
        },
        {
          "name": "date",
          "label": "Starting",
          "type": "date",
          "required": true,
          "when": {
            "field": "change",
            "equals": "add"
          }
        },
        {
          "name": "recurs",
          "label": "Repeats",
          "required": true,
          "options": [
            {
              "value": "none",
              "label": "Once"
            },
            {
              "value": "weekly",
              "label": "Every week"
            },
            {
              "value": "biweekly",
              "label": "Every two weeks"
            },
            {
              "value": "monthly",
              "label": "Every month"
            },
            {
              "value": "quarterly",
              "label": "Every quarter"
            }
          ],
          "when": {
            "field": "change",
            "equals": "add"
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
