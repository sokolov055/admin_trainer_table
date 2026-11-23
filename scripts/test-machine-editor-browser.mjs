import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
const entry=`import React from 'react';import{createRoot}from'react-dom/client';import{MachineForm}from'./src/trainer/MachinesEditor.jsx';
window.__writes=[];window.__api=async(action,p)=>{window.__writes.push({action,p});return {machine:{uid:'mine'},uid:'mine'};};
createRoot(document.getElementById('root')).render(<MachineForm machine={{uid:'mine',name:'Тяга',kind:'machine',setup:'Сиденье — Поднимите; Проверьте упор',steps:[],photos:[]}} onDone={()=>window.__done=true}/>);`;
test('FT-819 ревью: настоящий MachineForm уже содержит отдельные шаги, стикеры и сохранение',async()=>{
 const out=await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'jsx'},bundle:true,write:false,outdir:'/tmp/ft819-view',format:'iife',define:{'import.meta.env':'{}','process.env.NODE_ENV':'"production"'},plugins:[{name:'stub',setup(b){b.onResolve({filter:/\/telegram\.js$/},()=>({path:'telegram',namespace:'stub'}));b.onResolve({filter:/\/api\.js$/},args=>args.importer.endsWith('/MachinesEditor.jsx')?({path:'api',namespace:'api-stub'}):undefined);b.onLoad({filter:/.*/,namespace:'api-stub'},()=>({contents:'export const apiMutate=(...a)=>window.__api(...a);export const apiWait=()=>new Promise(()=>{});export const apiPublic=apiMutate;export const onMutated=()=>()=>{};export const apiStale=()=>({data:null,promise:new Promise(()=>{})});'}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:"export const haptic=()=>{};export const getInitData=()=>'';export const environmentInfo=()=>({});"}));}}]});
 const js=out.outputFiles.find(f=>f.path.endsWith('.js')).text;
 const css=readFileSync('src/styles.css','utf8')+out.outputFiles.filter(f=>f.path.endsWith('.css')).map(f=>f.text).join('\n');
 const b=await chromium.launch();try{for(const width of[320,390,430])for(const theme of['light','dark']){
 const p=await b.newPage({viewport:{width,height:850},reducedMotion:'reduce'});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.setContent(`<html data-theme="${theme}"><style>${css}</style><main style="padding:16px" id="root"></main></html>`);await p.addScriptTag({content:js});
 await p.getByRole('textbox',{name:'Подпись шага 1',exact:true}).waitFor();
 assert.equal(await p.getByRole('textbox',{name:'Главное шага 1',exact:true}).inputValue(),'Поднимите');
 assert.equal(await p.getByRole('textbox',{name:'Подробности шага 1',exact:true}).inputValue(),'Проверьте упор');
 await p.getByRole('button',{name:'Шаг',exact:true}).click();
 await p.getByRole('textbox',{name:'Подпись шага 2',exact:true}).fill('Вес');await p.getByRole('textbox',{name:'Главное шага 2',exact:true}).fill('Проверьте вес');
 await p.getByRole('button',{name:'Выше',exact:true}).nth(1).click();assert.equal(await p.getByRole('textbox',{name:'Подпись шага 1',exact:true}).inputValue(),'Вес');
 await p.getByRole('button',{name:/Стикер шага 1/}).click();await p.getByRole('textbox',{name:'Найти стикер',exact:true}).fill('сиденье');assert.ok(await p.locator('.sed-st').count()>0);await p.locator('.sed-st').first().click();
 await p.getByRole('button',{name:'Как увидит клиент',exact:true}).click();await p.getByRole('heading',{name:'Как увидит клиент',exact:true}).waitFor();await p.getByRole('button',{name:'Закрыть',exact:true}).click();await p.locator('.sheet').waitFor({state:'detached'});
 await p.getByRole('button',{name:'Удалить шаг 2',exact:true}).click();assert.equal(await p.getByRole('textbox',{name:'Подпись шага 2',exact:true}).count(),0);
 await p.getByRole('button',{name:'Сохранить',exact:true}).click();await p.waitForFunction(()=>window.__done===true);
 const writes=await p.evaluate(()=>window.__writes);assert.equal(writes[0].action,'library.machine.save');assert.match(writes[0].p.setup,/Вес — Проверьте вес/);assert.ok(writes[0].p.setupMeta[0].s);assert.deepEqual(errors,[]);await p.close();
 }}finally{await b.close();}
});
