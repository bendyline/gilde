// App-owned composition; platform components come from the Gezel host.
(function(){
'use strict';
var config={
  "title": "In the stockroom",
  "description": "Log what came in or got used, count a shelf, or ask what to order this week.",
  "load": "loadStock",
  "filter": [
    "#stock-section .table-wrap",
    "tbody tr",
    "Find an item"
  ],
  "placeholder": "Tell your stock keeper what came in or ran out…",
  "actions": [
    {
      "tool": "add_item",
      "pageTool": "page_add_item",
      "title": "Add an item",
      "fields": [
        {
          "name": "name",
          "label": "Item",
          "required": true,
          "placeholder": "Oat milk"
        },
        {
          "name": "unit",
          "label": "Counted in",
          "placeholder": "carton"
        },
        {
          "name": "onHand",
          "label": "On hand now",
          "type": "number",
          "required": true,
          "min": 0
        },
        {
          "name": "reorderPoint",
          "label": "Reorder at",
          "type": "number",
          "required": true,
          "min": 0
        },
        {
          "name": "par",
          "label": "Order up to",
          "type": "number",
          "min": 0
        },
        {
          "name": "supplier",
          "label": "Supplier",
          "placeholder": "Valley Dairy"
        },
        {
          "name": "leadDays",
          "label": "Supplier lead time (days)",
          "type": "number",
          "min": 0
        },
        {
          "name": "unitCost",
          "label": "Price each ($)",
          "type": "number",
          "min": 0
        }
      ]
    },
    {
      "tool": "record_stock",
      "pageTool": "page_record_stock",
      "title": "Log stock in or out",
      "submitLabel": "Log",
      "fields": [
        {
          "name": "item",
          "label": "Item",
          "required": true,
          "options": [],
          "records": {
            "path": "items.json",
            "list": "records",
            "labelFields": [
              "fields.name"
            ]
          }
        },
        {
          "name": "received",
          "label": "Came in",
          "type": "number",
          "min": 0
        },
        {
          "name": "used",
          "label": "Used, sold or thrown out",
          "type": "number",
          "min": 0
        }
      ]
    },
    {
      "tool": "record_stock",
      "pageTool": "page_record_stock",
      "title": "Count a shelf",
      "submitLabel": "Save count",
      "fields": [
        {
          "name": "item",
          "label": "Item",
          "required": true,
          "options": [],
          "records": {
            "path": "items.json",
            "list": "records",
            "labelFields": [
              "fields.name"
            ]
          }
        },
        {
          "name": "count",
          "label": "Counted on the shelf",
          "type": "number",
          "required": true,
          "min": 0
        }
      ]
    },
    {
      "tool": "draft_orders",
      "pageTool": "page_draft_orders",
      "title": "Draft purchase orders",
      "submitLabel": "Draft",
      "fields": [
        {
          "name": "supplier",
          "label": "Only this supplier",
          "placeholder": "Valley Dairy"
        }
      ]
    },
    {
      "tool": "update_order",
      "pageTool": "page_update_order",
      "title": "Update an order",
      "submitLabel": "Update",
      "fields": [
        {
          "name": "order",
          "label": "Order",
          "required": true,
          "options": [],
          "records": {
            "path": "orders.json",
            "list": "records",
            "labelFields": [
              "id",
              "fields.supplier"
            ],
            "where": {
              "field": "status",
              "in": [
                "draft",
                "sent"
              ]
            }
          }
        },
        {
          "name": "status",
          "label": "Mark it",
          "required": true,
          "options": [
            {
              "value": "sent",
              "label": "Sent to the supplier"
            },
            {
              "value": "received",
              "label": "Received (adds it to stock)"
            },
            {
              "value": "cancelled",
              "label": "Cancelled"
            }
          ]
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
