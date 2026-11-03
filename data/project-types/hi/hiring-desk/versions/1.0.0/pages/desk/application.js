// App-owned composition; platform components come from the Gezel host.
(function(){
'use strict';
var config={
  "title": "At the hiring desk",
  "description": "Open a role, add a candidate, move someone along, or record how an interview went.",
  "load": "loadDesk",
  "filter": [
    "#pipelines-section .pipelines",
    ".cand",
    "Find a candidate"
  ],
  "placeholder": "Tell your recruiter what happened…",
  "actions": [
    {
      "tool": "add_role",
      "pageTool": "page_add_role",
      "title": "Open a role",
      "fields": [
        {
          "name": "title",
          "label": "Role",
          "required": true,
          "placeholder": "Barista"
        },
        {
          "name": "requirements",
          "label": "Requirements, separated by commas",
          "required": true,
          "placeholder": "Coffee and milk skills, Warm customer service, Weekend availability"
        },
        {
          "name": "openings",
          "label": "Openings",
          "type": "number",
          "min": 1,
          "step": 1
        },
        {
          "name": "manager",
          "label": "Hiring manager"
        },
        {
          "name": "pay",
          "label": "Pay",
          "placeholder": "$19–21 an hour plus tips"
        }
      ]
    },
    {
      "tool": "add_candidate",
      "pageTool": "page_add_candidate",
      "title": "Add a candidate",
      "fields": [
        {
          "name": "name",
          "label": "Full name",
          "required": true
        },
        {
          "name": "role",
          "label": "Role",
          "required": true,
          "options": [],
          "records": {
            "path": "roles.json",
            "list": "records",
            "labelFields": [
              "fields.title"
            ],
            "where": {
              "field": "status",
              "in": [
                "open",
                "paused"
              ]
            }
          }
        },
        {
          "name": "source",
          "label": "Found through",
          "options": [
            "Job board",
            "Referral",
            "Walk-in",
            "Social media",
            "Other"
          ]
        },
        {
          "name": "note",
          "label": "Job-related note",
          "placeholder": "Two years on a bakery counter"
        }
      ]
    },
    {
      "tool": "move_candidate",
      "pageTool": "page_move_candidate",
      "title": "Move a candidate",
      "submitLabel": "Move",
      "fields": [
        {
          "name": "candidate",
          "label": "Candidate",
          "required": true,
          "options": [],
          "records": {
            "path": "candidates.json",
            "list": "records",
            "labelFields": [
              "fields.name",
              "fields.roleTitle",
              "status"
            ],
            "where": {
              "field": "status",
              "not": [
                "hired",
                "closed"
              ]
            }
          }
        },
        {
          "name": "status",
          "label": "Move to",
          "required": true,
          "options": [
            "screen",
            "interview",
            "offer",
            "hired",
            "closed"
          ]
        },
        {
          "name": "interviewOn",
          "label": "Interview date",
          "type": "date",
          "when": {
            "field": "status",
            "equals": "interview"
          }
        },
        {
          "name": "interviewTime",
          "label": "Time",
          "placeholder": "2:30 pm",
          "when": {
            "field": "status",
            "equals": "interview"
          }
        },
        {
          "name": "interviewer",
          "label": "Interviewer",
          "when": {
            "field": "status",
            "equals": "interview"
          }
        },
        {
          "name": "note",
          "label": "Note"
        }
      ]
    },
    {
      "tool": "log_feedback",
      "pageTool": "page_log_feedback",
      "title": "Record a scorecard",
      "submitLabel": "Record",
      "fields": [
        {
          "name": "candidate",
          "label": "Candidate",
          "required": true,
          "options": [],
          "records": {
            "path": "candidates.json",
            "list": "records",
            "labelFields": [
              "fields.name",
              "fields.roleTitle"
            ]
          }
        },
        {
          "name": "by",
          "label": "Interviewer",
          "required": true
        },
        {
          "name": "ratings",
          "label": "Ratings, 1 to 4 per requirement",
          "placeholder": "Coffee and milk skills 3, Warm customer service 4"
        },
        {
          "name": "note",
          "label": "What they said or did"
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
