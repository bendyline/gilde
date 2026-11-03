// App-owned composition; platform components come from the Gezel host.
(function(){
'use strict';
var config={
  "title": "At the scheduling desk",
  "description": "Add a shift, mark when someone can’t work, or ask where the week is short.",
  "load": "loadRoster",
  "filter": [
    "#hours-section .table-wrap",
    "tbody tr",
    "Find a person"
  ],
  "placeholder": "Tell your shift scheduler what changed…",
  "actions": [
    {
      "tool": "add_staff",
      "pageTool": "page_add_staff",
      "title": "Add a person",
      "fields": [
        {
          "name": "name",
          "label": "Name",
          "required": true,
          "placeholder": "Ana"
        },
        {
          "name": "roles",
          "label": "Works",
          "placeholder": "barista, kitchen"
        },
        {
          "name": "maxHours",
          "label": "Their own weekly hour limit",
          "type": "number",
          "min": 0
        }
      ]
    },
    {
      "tool": "add_shift",
      "pageTool": "page_add_shift",
      "title": "Add a shift",
      "fields": [
        {
          "name": "date",
          "label": "Date",
          "type": "date",
          "required": true
        },
        {
          "name": "start",
          "label": "Starts",
          "required": true,
          "options": [
            "05:00",
            "06:00",
            "07:00",
            "08:00",
            "09:00",
            "10:00",
            "11:00",
            "12:00",
            "13:00",
            "14:00",
            "15:00",
            "16:00"
          ]
        },
        {
          "name": "end",
          "label": "Ends",
          "required": true,
          "options": [
            "10:00",
            "11:00",
            "12:00",
            "13:00",
            "14:00",
            "15:00",
            "16:00",
            "17:00",
            "18:00",
            "19:00",
            "20:00",
            "21:00",
            "22:00",
            "23:00"
          ]
        },
        {
          "name": "role",
          "label": "Role",
          "placeholder": "barista"
        },
        {
          "name": "needed",
          "label": "People needed",
          "type": "number",
          "min": 1,
          "value": 1
        }
      ]
    },
    {
      "tool": "assign_shift",
      "pageTool": "page_assign_shift",
      "title": "Put someone on a shift",
      "submitLabel": "Assign",
      "fields": [
        {
          "name": "id",
          "label": "Shift",
          "required": true,
          "options": [],
          "records": {
            "path": "shifts.json",
            "list": "records",
            "labelFields": [
              "fields.date",
              "fields.start",
              "fields.role"
            ]
          }
        },
        {
          "name": "staff",
          "label": "Person",
          "required": true,
          "options": [],
          "records": {
            "path": "staff.json",
            "list": "records",
            "labelFields": [
              "fields.name"
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
    },
    {
      "tool": "set_availability",
      "pageTool": "page_set_availability",
      "title": "Mark when someone can’t work",
      "fields": [
        {
          "name": "staff",
          "label": "Person",
          "required": true,
          "options": [],
          "records": {
            "path": "staff.json",
            "list": "records",
            "labelFields": [
              "fields.name"
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
          "name": "day",
          "label": "Day",
          "required": true,
          "options": [
            {
              "value": "monday",
              "label": "Mondays"
            },
            {
              "value": "tuesday",
              "label": "Tuesdays"
            },
            {
              "value": "wednesday",
              "label": "Wednesdays"
            },
            {
              "value": "thursday",
              "label": "Thursdays"
            },
            {
              "value": "friday",
              "label": "Fridays"
            },
            {
              "value": "saturday",
              "label": "Saturdays"
            },
            {
              "value": "sunday",
              "label": "Sundays"
            },
            {
              "value": "weekdays",
              "label": "Weekdays"
            },
            {
              "value": "weekends",
              "label": "Weekends"
            },
            {
              "value": "every day",
              "label": "Every day"
            },
            {
              "value": "one date",
              "label": "One date"
            }
          ]
        },
        {
          "name": "date",
          "label": "Date",
          "type": "date",
          "required": true,
          "when": {
            "field": "day",
            "equals": "one date"
          }
        },
        {
          "name": "part",
          "label": "When",
          "required": true,
          "options": [
            {
              "value": "all day",
              "label": "All day"
            },
            {
              "value": "morning",
              "label": "Mornings (until noon)"
            },
            {
              "value": "afternoon",
              "label": "Afternoons (noon to 5 pm)"
            },
            {
              "value": "evening",
              "label": "Evenings (after 5 pm)"
            }
          ]
        }
      ]
    },
    {
      "tool": "set_rules",
      "pageTool": "page_set_rules",
      "title": "Your scheduling rules",
      "fields": [
        {
          "name": "maxWeekHours",
          "label": "Most hours a week per person",
          "type": "number",
          "min": 0
        },
        {
          "name": "minRestHours",
          "label": "Fewest hours between shifts",
          "type": "number",
          "min": 0
        },
        {
          "name": "maxShiftHours",
          "label": "Longest shift (hours)",
          "type": "number",
          "min": 0
        },
        {
          "name": "rule",
          "label": "Another rule, in your words",
          "placeholder": "Two people on every weekend open"
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
