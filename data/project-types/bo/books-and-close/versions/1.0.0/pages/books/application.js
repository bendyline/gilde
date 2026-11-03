// App-owned composition; platform components come from the Gezel host.
(function(){
'use strict';
var config={
  "title": "With your bookkeeper",
  "description": "Book a receipt or a sale, give an entry its category, or check off a step of the month close.",
  "load": "loadBooks",
  "filter": [
    "#ledger-section .table-wrap",
    "tbody tr",
    "Find an entry"
  ],
  "placeholder": "Tell your bookkeeper what came in or went out…",
  "actions": [
    {
      "tool": "record_entry",
      "pageTool": "page_record_entry",
      "title": "Book an entry",
      "submitLabel": "Book it",
      "fields": [
        {
          "name": "date",
          "label": "Date",
          "type": "date",
          "required": true
        },
        {
          "name": "payee",
          "label": "Paid to or received from",
          "required": true,
          "placeholder": "Hillside Hardware"
        },
        {
          "name": "amount",
          "label": "Amount",
          "type": "number",
          "required": true,
          "placeholder": "284.17"
        },
        {
          "name": "category",
          "label": "Category",
          "required": true,
          "options": [
            {
              "value": "materials",
              "label": "Materials"
            },
            {
              "value": "subcontractors",
              "label": "Subcontractors"
            },
            {
              "value": "payroll",
              "label": "Payroll"
            },
            {
              "value": "vehicle",
              "label": "Vehicle and fuel"
            },
            {
              "value": "tools",
              "label": "Tools and equipment"
            },
            {
              "value": "insurance",
              "label": "Insurance"
            },
            {
              "value": "rent",
              "label": "Rent"
            },
            {
              "value": "utilities",
              "label": "Utilities and phone"
            },
            {
              "value": "software",
              "label": "Software"
            },
            {
              "value": "marketing",
              "label": "Marketing"
            },
            {
              "value": "office",
              "label": "Office"
            },
            {
              "value": "professional-fees",
              "label": "Professional fees"
            },
            {
              "value": "bank-fees",
              "label": "Bank and card fees"
            },
            {
              "value": "licenses",
              "label": "Licenses and permits"
            },
            {
              "value": "meals",
              "label": "Meals"
            },
            {
              "value": "other",
              "label": "Other"
            },
            {
              "value": "sales",
              "label": "Sales"
            },
            {
              "value": "other-income",
              "label": "Other income"
            },
            {
              "value": "owner-draw",
              "label": "Owner draw"
            },
            {
              "value": "uncategorized",
              "label": "Not sure yet"
            }
          ]
        },
        {
          "name": "note",
          "label": "What it was for",
          "placeholder": "Cable and boxes for the Alder Street job"
        }
      ]
    },
    {
      "tool": "categorize_entry",
      "pageTool": "page_categorize_entry",
      "title": "Give an entry its category",
      "submitLabel": "Sort it",
      "fields": [
        {
          "name": "id",
          "label": "Entry",
          "required": true,
          "options": [],
          "records": {
            "path": "ledger.json",
            "list": "entries",
            "labelFields": [
              "data.payee",
              "data.date"
            ],
            "where": {
              "field": "category",
              "in": [
                "uncategorized"
              ]
            }
          }
        },
        {
          "name": "category",
          "label": "Category",
          "required": true,
          "options": [
            {
              "value": "materials",
              "label": "Materials"
            },
            {
              "value": "subcontractors",
              "label": "Subcontractors"
            },
            {
              "value": "payroll",
              "label": "Payroll"
            },
            {
              "value": "vehicle",
              "label": "Vehicle and fuel"
            },
            {
              "value": "tools",
              "label": "Tools and equipment"
            },
            {
              "value": "insurance",
              "label": "Insurance"
            },
            {
              "value": "rent",
              "label": "Rent"
            },
            {
              "value": "utilities",
              "label": "Utilities and phone"
            },
            {
              "value": "software",
              "label": "Software"
            },
            {
              "value": "marketing",
              "label": "Marketing"
            },
            {
              "value": "office",
              "label": "Office"
            },
            {
              "value": "professional-fees",
              "label": "Professional fees"
            },
            {
              "value": "bank-fees",
              "label": "Bank and card fees"
            },
            {
              "value": "licenses",
              "label": "Licenses and permits"
            },
            {
              "value": "meals",
              "label": "Meals"
            },
            {
              "value": "other",
              "label": "Other"
            },
            {
              "value": "sales",
              "label": "Sales"
            },
            {
              "value": "other-income",
              "label": "Other income"
            },
            {
              "value": "owner-draw",
              "label": "Owner draw"
            }
          ]
        }
      ]
    },
    {
      "tool": "tick_close_step",
      "pageTool": "page_tick_close_step",
      "title": "Check off a close step",
      "submitLabel": "Check it off",
      "fields": [
        {
          "name": "step",
          "label": "Step",
          "required": true,
          "options": [
            {
              "value": "receipts",
              "label": "Book every receipt in the inbox"
            },
            {
              "value": "bank",
              "label": "Match the bank statement"
            },
            {
              "value": "card",
              "label": "Match the card statement"
            },
            {
              "value": "payroll",
              "label": "Record payroll and subcontractor payments"
            },
            {
              "value": "income",
              "label": "Record every customer payment"
            },
            {
              "value": "review",
              "label": "Review the P&L with the owner"
            }
          ]
        },
        {
          "name": "note",
          "label": "Note",
          "placeholder": "Statement ending 4471 matches"
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
