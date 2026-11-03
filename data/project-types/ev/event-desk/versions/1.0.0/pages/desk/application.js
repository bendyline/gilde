// App-owned composition; platform components come from the Gezel host.
(function(){
'use strict';
var config={
  "title": "At the event desk",
  "description": "Compare venues, book vendors, track RSVPs and dietary needs, and keep the run of show.",
  "load": "loadDesk",
  "filter": [
    "#guests-section .table-wrap",
    "tbody tr",
    "Find a guest"
  ],
  "placeholder": "Tell your event planner what changed…",
  "actions": [
    {
      "tool": "set_event",
      "pageTool": "page_set_event",
      "title": "Event details",
      "fields": [
        {
          "name": "occasion",
          "label": "Event",
          "placeholder": "Client summit"
        },
        {
          "name": "date",
          "label": "Date",
          "type": "date"
        },
        {
          "name": "time",
          "label": "Hours",
          "placeholder": "3:00 to 8:30 pm"
        },
        {
          "name": "headcount",
          "label": "Planning for (guests)",
          "type": "number",
          "min": 1
        },
        {
          "name": "budget",
          "label": "Budget ($)",
          "type": "number",
          "min": 0
        },
        {
          "name": "rsvp",
          "label": "RSVP line",
          "placeholder": "Reply to Mara by November 19"
        }
      ]
    },
    {
      "tool": "add_venue",
      "pageTool": "page_add_venue",
      "title": "Add a venue",
      "fields": [
        {
          "name": "name",
          "label": "Venue",
          "required": true,
          "placeholder": "The Foundry"
        },
        {
          "name": "capacity",
          "label": "Holds (guests)",
          "type": "number",
          "min": 1,
          "required": true
        },
        {
          "name": "fee",
          "label": "Hire fee ($)",
          "type": "number",
          "min": 0,
          "required": true
        },
        {
          "name": "cateringPerHead",
          "label": "In-house catering per guest ($)",
          "type": "number",
          "min": 0
        },
        {
          "name": "av",
          "label": "Sound and screens",
          "required": true,
          "options": [
            "included",
            "extra"
          ]
        },
        {
          "name": "location",
          "label": "Where"
        }
      ]
    },
    {
      "tool": "add_vendor",
      "pageTool": "page_add_vendor",
      "title": "Add a vendor",
      "fields": [
        {
          "name": "name",
          "label": "Vendor",
          "required": true,
          "placeholder": "Sorrel Kitchen"
        },
        {
          "name": "category",
          "label": "Kind",
          "required": true,
          "options": [
            "catering",
            "av",
            "entertainment",
            "photography",
            "rentals",
            "decor",
            "transport",
            "venue",
            "other"
          ]
        },
        {
          "name": "status",
          "label": "Status",
          "required": true,
          "options": [
            "booked",
            "quoted"
          ]
        },
        {
          "name": "contract",
          "label": "Total ($)",
          "type": "number",
          "min": 0
        },
        {
          "name": "deposit",
          "label": "Deposit ($)",
          "type": "number",
          "min": 0
        },
        {
          "name": "depositDueAt",
          "label": "Deposit due",
          "type": "date"
        },
        {
          "name": "contact",
          "label": "Contact"
        },
        {
          "name": "arrival",
          "label": "Arrives on the day",
          "options": [
            {
              "value": "06:00",
              "label": "6 am"
            },
            {
              "value": "06:15",
              "label": "6:15 am"
            },
            {
              "value": "06:30",
              "label": "6:30 am"
            },
            {
              "value": "06:45",
              "label": "6:45 am"
            },
            {
              "value": "07:00",
              "label": "7 am"
            },
            {
              "value": "07:15",
              "label": "7:15 am"
            },
            {
              "value": "07:30",
              "label": "7:30 am"
            },
            {
              "value": "07:45",
              "label": "7:45 am"
            },
            {
              "value": "08:00",
              "label": "8 am"
            },
            {
              "value": "08:15",
              "label": "8:15 am"
            },
            {
              "value": "08:30",
              "label": "8:30 am"
            },
            {
              "value": "08:45",
              "label": "8:45 am"
            },
            {
              "value": "09:00",
              "label": "9 am"
            },
            {
              "value": "09:15",
              "label": "9:15 am"
            },
            {
              "value": "09:30",
              "label": "9:30 am"
            },
            {
              "value": "09:45",
              "label": "9:45 am"
            },
            {
              "value": "10:00",
              "label": "10 am"
            },
            {
              "value": "10:15",
              "label": "10:15 am"
            },
            {
              "value": "10:30",
              "label": "10:30 am"
            },
            {
              "value": "10:45",
              "label": "10:45 am"
            },
            {
              "value": "11:00",
              "label": "11 am"
            },
            {
              "value": "11:15",
              "label": "11:15 am"
            },
            {
              "value": "11:30",
              "label": "11:30 am"
            },
            {
              "value": "11:45",
              "label": "11:45 am"
            },
            {
              "value": "12:00",
              "label": "12 pm"
            },
            {
              "value": "12:15",
              "label": "12:15 pm"
            },
            {
              "value": "12:30",
              "label": "12:30 pm"
            },
            {
              "value": "12:45",
              "label": "12:45 pm"
            },
            {
              "value": "13:00",
              "label": "1 pm"
            },
            {
              "value": "13:15",
              "label": "1:15 pm"
            },
            {
              "value": "13:30",
              "label": "1:30 pm"
            },
            {
              "value": "13:45",
              "label": "1:45 pm"
            },
            {
              "value": "14:00",
              "label": "2 pm"
            },
            {
              "value": "14:15",
              "label": "2:15 pm"
            },
            {
              "value": "14:30",
              "label": "2:30 pm"
            },
            {
              "value": "14:45",
              "label": "2:45 pm"
            },
            {
              "value": "15:00",
              "label": "3 pm"
            },
            {
              "value": "15:15",
              "label": "3:15 pm"
            },
            {
              "value": "15:30",
              "label": "3:30 pm"
            },
            {
              "value": "15:45",
              "label": "3:45 pm"
            },
            {
              "value": "16:00",
              "label": "4 pm"
            },
            {
              "value": "16:15",
              "label": "4:15 pm"
            },
            {
              "value": "16:30",
              "label": "4:30 pm"
            },
            {
              "value": "16:45",
              "label": "4:45 pm"
            },
            {
              "value": "17:00",
              "label": "5 pm"
            },
            {
              "value": "17:15",
              "label": "5:15 pm"
            },
            {
              "value": "17:30",
              "label": "5:30 pm"
            },
            {
              "value": "17:45",
              "label": "5:45 pm"
            },
            {
              "value": "18:00",
              "label": "6 pm"
            },
            {
              "value": "18:15",
              "label": "6:15 pm"
            },
            {
              "value": "18:30",
              "label": "6:30 pm"
            },
            {
              "value": "18:45",
              "label": "6:45 pm"
            },
            {
              "value": "19:00",
              "label": "7 pm"
            },
            {
              "value": "19:15",
              "label": "7:15 pm"
            },
            {
              "value": "19:30",
              "label": "7:30 pm"
            },
            {
              "value": "19:45",
              "label": "7:45 pm"
            },
            {
              "value": "20:00",
              "label": "8 pm"
            },
            {
              "value": "20:15",
              "label": "8:15 pm"
            },
            {
              "value": "20:30",
              "label": "8:30 pm"
            },
            {
              "value": "20:45",
              "label": "8:45 pm"
            },
            {
              "value": "21:00",
              "label": "9 pm"
            },
            {
              "value": "21:15",
              "label": "9:15 pm"
            },
            {
              "value": "21:30",
              "label": "9:30 pm"
            },
            {
              "value": "21:45",
              "label": "9:45 pm"
            },
            {
              "value": "22:00",
              "label": "10 pm"
            },
            {
              "value": "22:15",
              "label": "10:15 pm"
            },
            {
              "value": "22:30",
              "label": "10:30 pm"
            },
            {
              "value": "22:45",
              "label": "10:45 pm"
            },
            {
              "value": "23:00",
              "label": "11 pm"
            },
            {
              "value": "23:15",
              "label": "11:15 pm"
            },
            {
              "value": "23:30",
              "label": "11:30 pm"
            },
            {
              "value": "23:45",
              "label": "11:45 pm"
            }
          ]
        }
      ]
    },
    {
      "tool": "record_payment",
      "pageTool": "page_record_payment",
      "title": "Record a payment",
      "submitLabel": "Record",
      "fields": [
        {
          "name": "id",
          "label": "Vendor",
          "required": true,
          "options": [],
          "records": {
            "path": "vendors.json",
            "list": "records",
            "labelFields": [
              "fields.name",
              "fields.category"
            ],
            "where": {
              "field": "status",
              "not": [
                "dropped",
                "paid"
              ]
            }
          }
        },
        {
          "name": "amount",
          "label": "Amount ($)",
          "type": "number",
          "min": 0,
          "required": true
        },
        {
          "name": "kind",
          "label": "For",
          "required": true,
          "options": [
            "deposit",
            "balance",
            "other"
          ]
        },
        {
          "name": "note",
          "label": "Reference",
          "placeholder": "Invoice SK-1042"
        }
      ]
    },
    {
      "tool": "add_guest",
      "pageTool": "page_add_guest",
      "title": "Add a guest",
      "fields": [
        {
          "name": "name",
          "label": "Guest",
          "required": true,
          "placeholder": "Mei Lin"
        },
        {
          "name": "company",
          "label": "Company"
        },
        {
          "name": "response",
          "label": "RSVP",
          "required": true,
          "options": [
            "invited",
            "yes",
            "no"
          ]
        },
        {
          "name": "dietary",
          "label": "Dietary needs",
          "placeholder": "vegetarian, or none"
        }
      ]
    },
    {
      "tool": "record_rsvp",
      "pageTool": "page_record_rsvp",
      "title": "Record an RSVP",
      "submitLabel": "Record",
      "fields": [
        {
          "name": "id",
          "label": "Guest",
          "required": true,
          "options": [],
          "records": {
            "path": "guests.json",
            "list": "records",
            "labelFields": [
              "fields.name",
              "fields.company"
            ]
          }
        },
        {
          "name": "response",
          "label": "Answer",
          "required": true,
          "options": [
            "yes",
            "no"
          ]
        },
        {
          "name": "dietary",
          "label": "Dietary needs",
          "placeholder": "vegetarian, or none"
        },
        {
          "name": "joining",
          "label": "Bringing (extra people)",
          "type": "number",
          "min": 0
        }
      ]
    },
    {
      "tool": "set_program_item",
      "pageTool": "page_set_program_item",
      "title": "Add to the run of show",
      "fields": [
        {
          "name": "time",
          "label": "Starts",
          "required": true,
          "options": [
            {
              "value": "06:00",
              "label": "6 am"
            },
            {
              "value": "06:15",
              "label": "6:15 am"
            },
            {
              "value": "06:30",
              "label": "6:30 am"
            },
            {
              "value": "06:45",
              "label": "6:45 am"
            },
            {
              "value": "07:00",
              "label": "7 am"
            },
            {
              "value": "07:15",
              "label": "7:15 am"
            },
            {
              "value": "07:30",
              "label": "7:30 am"
            },
            {
              "value": "07:45",
              "label": "7:45 am"
            },
            {
              "value": "08:00",
              "label": "8 am"
            },
            {
              "value": "08:15",
              "label": "8:15 am"
            },
            {
              "value": "08:30",
              "label": "8:30 am"
            },
            {
              "value": "08:45",
              "label": "8:45 am"
            },
            {
              "value": "09:00",
              "label": "9 am"
            },
            {
              "value": "09:15",
              "label": "9:15 am"
            },
            {
              "value": "09:30",
              "label": "9:30 am"
            },
            {
              "value": "09:45",
              "label": "9:45 am"
            },
            {
              "value": "10:00",
              "label": "10 am"
            },
            {
              "value": "10:15",
              "label": "10:15 am"
            },
            {
              "value": "10:30",
              "label": "10:30 am"
            },
            {
              "value": "10:45",
              "label": "10:45 am"
            },
            {
              "value": "11:00",
              "label": "11 am"
            },
            {
              "value": "11:15",
              "label": "11:15 am"
            },
            {
              "value": "11:30",
              "label": "11:30 am"
            },
            {
              "value": "11:45",
              "label": "11:45 am"
            },
            {
              "value": "12:00",
              "label": "12 pm"
            },
            {
              "value": "12:15",
              "label": "12:15 pm"
            },
            {
              "value": "12:30",
              "label": "12:30 pm"
            },
            {
              "value": "12:45",
              "label": "12:45 pm"
            },
            {
              "value": "13:00",
              "label": "1 pm"
            },
            {
              "value": "13:15",
              "label": "1:15 pm"
            },
            {
              "value": "13:30",
              "label": "1:30 pm"
            },
            {
              "value": "13:45",
              "label": "1:45 pm"
            },
            {
              "value": "14:00",
              "label": "2 pm"
            },
            {
              "value": "14:15",
              "label": "2:15 pm"
            },
            {
              "value": "14:30",
              "label": "2:30 pm"
            },
            {
              "value": "14:45",
              "label": "2:45 pm"
            },
            {
              "value": "15:00",
              "label": "3 pm"
            },
            {
              "value": "15:15",
              "label": "3:15 pm"
            },
            {
              "value": "15:30",
              "label": "3:30 pm"
            },
            {
              "value": "15:45",
              "label": "3:45 pm"
            },
            {
              "value": "16:00",
              "label": "4 pm"
            },
            {
              "value": "16:15",
              "label": "4:15 pm"
            },
            {
              "value": "16:30",
              "label": "4:30 pm"
            },
            {
              "value": "16:45",
              "label": "4:45 pm"
            },
            {
              "value": "17:00",
              "label": "5 pm"
            },
            {
              "value": "17:15",
              "label": "5:15 pm"
            },
            {
              "value": "17:30",
              "label": "5:30 pm"
            },
            {
              "value": "17:45",
              "label": "5:45 pm"
            },
            {
              "value": "18:00",
              "label": "6 pm"
            },
            {
              "value": "18:15",
              "label": "6:15 pm"
            },
            {
              "value": "18:30",
              "label": "6:30 pm"
            },
            {
              "value": "18:45",
              "label": "6:45 pm"
            },
            {
              "value": "19:00",
              "label": "7 pm"
            },
            {
              "value": "19:15",
              "label": "7:15 pm"
            },
            {
              "value": "19:30",
              "label": "7:30 pm"
            },
            {
              "value": "19:45",
              "label": "7:45 pm"
            },
            {
              "value": "20:00",
              "label": "8 pm"
            },
            {
              "value": "20:15",
              "label": "8:15 pm"
            },
            {
              "value": "20:30",
              "label": "8:30 pm"
            },
            {
              "value": "20:45",
              "label": "8:45 pm"
            },
            {
              "value": "21:00",
              "label": "9 pm"
            },
            {
              "value": "21:15",
              "label": "9:15 pm"
            },
            {
              "value": "21:30",
              "label": "9:30 pm"
            },
            {
              "value": "21:45",
              "label": "9:45 pm"
            },
            {
              "value": "22:00",
              "label": "10 pm"
            },
            {
              "value": "22:15",
              "label": "10:15 pm"
            },
            {
              "value": "22:30",
              "label": "10:30 pm"
            },
            {
              "value": "22:45",
              "label": "10:45 pm"
            },
            {
              "value": "23:00",
              "label": "11 pm"
            },
            {
              "value": "23:15",
              "label": "11:15 pm"
            },
            {
              "value": "23:30",
              "label": "11:30 pm"
            },
            {
              "value": "23:45",
              "label": "11:45 pm"
            }
          ]
        },
        {
          "name": "item",
          "label": "What happens",
          "required": true,
          "placeholder": "Welcome from the founders"
        },
        {
          "name": "owner",
          "label": "On point"
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
