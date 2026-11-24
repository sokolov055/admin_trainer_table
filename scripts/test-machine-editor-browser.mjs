import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
const entry=`import React from 'react';import{createRoot}from'react-dom/client';import{MachineForm}from'./src/trainer/MachinesEditor.jsx';
window.__writes=[];window.__api=async(action,p)=>{window.__writes.push({action,p});if(window.__fail)throw new Error('Не удалось сохранить. Повторите попытку');return {machine:{uid:'mine'},uid:'mine'};};
const root=createRoot(document.getElementById('root'));let key=0;window.__renderMachine=(machine)=>{window.__done=false;window.__doneResult=undefined;root.render(<MachineForm key={++key} library machine={machine} onDone={result=>{window.__done=true;window.__doneResult=result}}/>)};root.render(<MachineForm library machine={{uid:'mine',name:'Тяга',kind:'machine',setup:'Сиденье — Поднимите; Проверьте упор',fields:['Сиденье'],weightStep:2.5,muscleGroups:['Спина'],setupOk:true,steps:[],photos:[]}} onDone={()=>window.__done=true}/>);`;
test('FT-819: редактор, чистая отмена и выход после ошибки фото',async()=>{
 const out=await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'jsx'},bundle:true,write:false,outdir:'/tmp/ft819-view',format:'iife',define:{'import.meta.env':'{}','process.env.NODE_ENV':'"production"'},plugins:[{name:'stub',setup(b){b.onResolve({filter:/\/telegram\.js$/},()=>({path:'telegram',namespace:'stub'}));b.onResolve({filter:/\/library\.js$/},args=>args.importer.endsWith('/MachinesEditor.jsx')?({path:'library',namespace:'library-stub'}):undefined);b.onLoad({filter:/.*/,namespace:'library-stub'},()=>({contents:"export const mediaUrl=x=>x;export const shrinkPhoto=async()=>new Blob(['photo'],{type:'image/png'});export const uploadMachinePhoto=async()=>{window.__uploads=(window.__uploads||0)+1;throw new Error('Фото не загружено')};"}));b.onResolve({filter:/\/api\.js$/},args=>args.importer.endsWith('/MachinesEditor.jsx')?({path:'api',namespace:'api-stub'}):undefined);b.onLoad({filter:/.*/,namespace:'api-stub'},()=>({contents:'export const apiMutate=(...a)=>window.__api(...a);export const apiWait=()=>new Promise(()=>{});export const apiPublic=apiMutate;export const onMutated=()=>()=>{};export const apiStale=()=>({data:null,promise:new Promise(()=>{})});'}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:"export const haptic=()=>{};export const getInitData=()=>'';export const environmentInfo=()=>({});"}));}}]});
 const js=out.outputFiles.find(f=>f.path.endsWith('.js')).text;
 const css=readFileSync('src/styles.css','utf8')+out.outputFiles.filter(f=>f.path.endsWith('.css')).map(f=>f.text).join('\n');
 const b=await chromium.launch();try{for(const width of[320,390,430])for(const theme of['light','dark']){
 const p=await b.newPage({viewport:{width,height:850},reducedMotion:'reduce'});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.setContent(`<html data-theme="${theme}"><style>${css}</style><main style="padding:16px" id="root"></main></html>`);await p.addScriptTag({content:js});
 await p.getByRole('textbox',{name:'Название тренажёра',exact:true}).fill('Длинное название тренажёра для проверки переноса всех слов в несколько строк');
 assert.ok(await p.locator('.mlib-ename').evaluate(el=>el.scrollHeight<=el.clientHeight+2));
 await p.getByRole('textbox',{name:'Название тренажёра',exact:true}).fill('Тяга новая');
 await p.getByRole('button',{name:'Отмена',exact:true}).click();
 await p.getByRole('heading',{name:'Выйти без сохранения?',exact:true}).waitFor();
 await p.getByRole('button',{name:'Продолжить редактирование',exact:true}).click();
 await p.locator('.sheet').waitFor({state:'detached'});
 await p.getByRole('button',{name:'Бренд',exact:true}).click();
 await p.getByLabel('Производитель / бренд',{exact:true}).fill('Бренд тест');
 await p.getByLabel('Оригинальное название модели',{exact:true}).fill('Модель тест');
 await p.getByRole('button',{name:'Готово',exact:true}).click();await p.locator('.sheet').waitFor({state:'detached'});
 await p.getByRole('textbox',{name:'Подпись шага 1',exact:true}).waitFor();
 assert.equal(await p.getByRole('textbox',{name:'Главное шага 1',exact:true}).inputValue(),'Поднимите');
 assert.equal(await p.getByRole('textbox',{name:'Подробности шага 1',exact:true}).inputValue(),'Проверьте упор');
 await p.getByRole('button',{name:'Шаг',exact:true}).click();
 await p.getByRole('textbox',{name:'Подпись шага 2',exact:true}).fill('Вес');await p.getByRole('textbox',{name:'Главное шага 2',exact:true}).fill('Проверьте вес');
 await p.getByRole('button',{name:'Выше',exact:true}).nth(1).click();assert.equal(await p.getByRole('textbox',{name:'Подпись шага 1',exact:true}).inputValue(),'Вес');
 await p.getByRole('button',{name:/Стикер шага 1/}).click();await p.getByRole('textbox',{name:'Найти стикер',exact:true}).fill('сиденье');assert.ok(await p.locator('.sed-st').count()>0);await p.locator('.sed-st').first().click();
 await p.getByRole('button',{name:'Предпросмотр инструкции',exact:true}).click();await p.getByRole('heading',{name:'Как увидит клиент',exact:true}).waitFor();await p.getByRole('button',{name:'Закрыть',exact:true}).click();await p.locator('.sheet').waitFor({state:'detached'});
 await p.getByRole('button',{name:'Удалить шаг 2',exact:true}).click();assert.equal(await p.getByRole('textbox',{name:'Подпись шага 2',exact:true}).count(),0);
 await p.evaluate(()=>window.__fail=true);
 await p.getByRole('button',{name:'Сохранить',exact:true}).click();await p.getByText('Не удалось сохранить. Повторите попытку',{exact:true}).waitFor();
 assert.equal(await p.getByRole('textbox',{name:'Название тренажёра',exact:true}).inputValue(),'Тяга новая');
 assert.equal(await p.evaluate(()=>window.__done),undefined);
 await p.evaluate(()=>window.__fail=false);
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth > innerWidth),false);
 await p.screenshot({path:'/tmp/ft819-editor-'+width+'-'+theme+'.png',fullPage:true});
 await p.getByRole('button',{name:'Сохранить',exact:true}).click();await p.waitForFunction(()=>window.__done===true);
 const writes=await p.evaluate(()=>window.__writes);assert.equal(writes[0].p.setupOk,true);assert.deepEqual(writes[1].p.setupFields,['Сиденье']);assert.equal(writes[1].p.weightStep,'2,5');assert.deepEqual(writes[1].p.muscleGroups,['Спина']);assert.equal(writes[1].p.brand,'Бренд тест');assert.equal(writes[1].p.originalName,'Модель тест');assert.equal(writes[0].action,'library.machine.save');assert.match(writes[0].p.setup,/Вес — Проверьте вес/);assert.ok(writes[0].p.setupMeta[0].s);assert.deepEqual(errors,[]);
 // #2: старый setup без meta не делает вход грязным.
 await p.evaluate(()=>window.__renderMachine({uid:'legacy',name:'Старый тренажёр',kind:'machine',setup:'Сиденье: поднимите\\nПроверьте упор',photos:[]}));
 await p.getByRole('textbox',{name:'Название тренажёра',exact:true}).waitFor();
 assert.equal(await p.getByLabel('Есть несохранённые изменения',{exact:true}).count(),0);
 await p.getByRole('button',{name:'Отмена',exact:true}).click();
 assert.equal(await p.getByRole('heading',{name:'Выйти без сохранения?',exact:true}).count(),0);
 assert.equal(await p.evaluate(()=>window.__doneResult),null);
 // v7: одно главное фото с номерами, естественные пропорции без дублирования.
 await p.evaluate(()=>window.__renderMachine({uid:'photo',name:'С фото',kind:'machine',setup:'Сиденье — поднимите',steps:[{s:'',p:[30,40]}],photos:['data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="150"><rect width="300" height="150" fill="gray"/></svg>')]}));
 await p.locator('#mlib-primary-photo .sed-photo img').waitFor();
 assert.equal(await p.locator('.mlib-editor img').count(),1);
 assert.equal(await p.locator('#mlib-primary-photo .ss-pin').count(),1);
 const dims=await p.locator('#mlib-primary-photo img').evaluate(el=>({w:el.width,h:el.height}));
 assert.ok(Math.abs(dims.w/dims.h-2)<0.03);
 await p.screenshot({path:'/tmp/ft819-v7-editor-photo-'+width+'-'+theme+'.png',fullPage:true});
 // #3: оборудование не обещает отсутствующее поле шага веса.
 await p.evaluate(()=>window.__renderMachine({uid:'eq',name:'Скамья',kind:'equipment',setup:'',photos:[],weightStep:2.5}));
 await p.getByRole('button',{name:'Оборудование',exact:true}).waitFor();
 assert.equal(await p.locator('.mlib-pass button').count(),3);
 await p.getByRole('button',{name:'Бренд',exact:true}).click();
 assert.equal(await p.getByLabel('Шаг веса, кг',{exact:true}).count(),0);
 await p.getByRole('button',{name:'Готово',exact:true}).click();await p.locator('.sheet').waitFor({state:'detached'});
 // #1: новая карточка и личная версия общей после ошибки фото возвращают сохранённый UID.
 for(const original of [null,{uid:'common',name:'Общая',kind:'machine',setup:'',photos:[]}]){
 await p.evaluate(m=>window.__renderMachine(m),original);
 await p.getByRole('textbox',{name:'Название тренажёра',exact:true}).fill('Сохранённая карточка');
 await p.locator('input[type=file][multiple]').setInputFiles({name:'photo.png',mimeType:'image/png',buffer:Buffer.from('photo')});
 await p.getByRole('button',{name:'Сохранить',exact:true}).click();
 await p.getByText(/Сохранено, а фото загрузилось не всё/).waitFor();
 assert.equal(await p.evaluate(()=>window.__done),false);
 await p.getByRole('button',{name:'Отмена',exact:true}).click();
 await p.getByRole('button',{name:'Выйти без сохранения',exact:true}).click();
 assert.equal(await p.evaluate(()=>window.__doneResult.uid),'mine');
 }
 assert.equal(await p.evaluate(()=>window.__uploads),2);
 assert.deepEqual(errors,[]);await p.close();
 }}finally{await b.close();}
});
