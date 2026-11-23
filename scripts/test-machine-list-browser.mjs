import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
const entry = `import React, {useState} from 'react';import {createRoot} from 'react-dom/client';import MachineList from './src/trainer/MachineList.jsx';import{usePendingDelete}from'./src/pendingDelete.jsx';
const list=globalThis.__testList||[{uid:'a',name:'Вертикальная тяга с дисками',mine:true,kind:'machine',brand:'Technogym',muscleGroups:['Спина'],uses:[{name:'Тяга к поясу'}],photos:['data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2230%22 height=%2290%22 viewBox=%220 0 30 90%22%3E%3Crect width=%2230%22 height=%2290%22 fill=%22steelblue%22/%3E%3C/svg%3E','two'],setup:'Сиденье',weightStep:2.5},{uid:'b',name:'Скамья',mine:true,kind:'equipment',brand:'Matrix',muscleGroups:['Грудь'],uses:[],photos:[],setup:''},{uid:'c',name:'Общий гриф',mine:false,kind:'equipment',brand:'',muscleGroups:[],uses:[],photos:[],setup:''}];
function App(){const del=usePendingDelete(async()=>{});const[state,setState]=useState({scope:'mine',q:'',search:false,kind:'',filters:{brand:'',muscle:'',missing:false,sort:'recent'}});const[open,setOpen]=useState('');return <main style={{padding:16,maxWidth:600,margin:'auto'}}>{del.bar}{open?<button onClick={()=>setOpen('')}>Назад {open}</button>:<MachineList list={list.filter(m=>!del.hidden(m.uid))} state={state} setState={setState} onDelete={m=>del.remove(m.uid,m)} onExercises={uid=>setOpen('links-'+uid)} onOpen={setOpen} onCreate={k=>setOpen(k)}/>}</main>};createRoot(document.getElementById('root')).render(<App/>);`;
test('FT-819: список, фильтры, переходы и геометрия в обеих темах', async () => {
 const out=await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'jsx'},bundle:true,write:false,outdir:'/tmp/ft819-test',format:'iife',define:{'import.meta.env':'{}','process.env.NODE_ENV':'"production"'},plugins:[{name:'stub',setup(b){b.onResolve({filter:/\/telegram\.js$/},()=>({path:'telegram',namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:"export const haptic=()=>{}; export const getInitData=()=>''; export const environmentInfo=()=>({});"}));}}]});
 const css=readFileSync('src/styles.css','utf8')+readFileSync('src/trainer/machines-lib.css','utf8');
 const b=await chromium.launch();try{
 for(const width of [320,390,430]) for(const theme of ['light','dark']){
 const p=await b.newPage({viewport:{width,height:850},reducedMotion:'reduce'}); const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.setContent(`<html data-theme="${theme}"><style>${css}</style><div id="root"></div></html>`);await p.addScriptTag({content:out.outputFiles.find(f=>f.path.endsWith('.js')).text});
 await p.locator('.mlib-card').first().waitFor();assert.equal(await p.locator('.mlib-card').count(),2);
 const photo=p.locator('.mlib-card').first().locator('.mlib-cover img');
 await photo.evaluate(img=>img.decode());
 assert.equal(await photo.evaluate(img=>img.naturalHeight),90);
 assert.equal(await photo.evaluate(img=>getComputedStyle(img).objectFit),'contain');
 assert.equal(await photo.evaluate(img=>Math.round(img.getBoundingClientRect().height)),60);
 assert.equal(await photo.evaluate(img=>Math.round(img.getBoundingClientRect().width)),60);
 assert.equal(await p.locator('.mlib-card').nth(1).locator('.mlib-cover img').count(),0);
 await p.screenshot({path:'/tmp/ft819-photo-'+width+'-'+theme+'.png'});
 // Ошибка загрузки не оставляет сломанную картинку: возвращается значок.
 await photo.evaluate(img=>img.dispatchEvent(new Event('error')));
 await p.locator('.mlib-card').first().locator('.mlib-cover svg').waitFor();
 assert.equal(await p.locator('.mlib-card').first().locator('.mlib-cover img').count(),0);
 const geom=await p.locator('.mlib-scope .chip').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();const t=e.firstElementChild.getBoundingClientRect();return {w:r.width,delta:Math.abs((r.x+r.width/2)-(t.x+t.width/2))}}));assert.ok(Math.abs(geom[0].w-geom[1].w)<.1);assert.ok(geom.every(g=>g.delta<.1));
 assert.equal(await p.locator('.mlib-swipe').count(),2);
 await p.getByRole('radio',{name:'Общие 1'}).click();assert.equal(await p.locator('.mlib-swipe').count(),0);assert.equal(await p.locator('.mlib-card').count(),1);await p.getByRole('radio',{name:'Мои 2'}).click();
 await p.getByRole('button',{name:'Поиск тренажёров',exact:true}).click();await p.getByPlaceholder('Название, бренд, упражнение').fill('поясу');assert.equal(await p.locator('.mlib-card').count(),1);
 await p.getByPlaceholder('Название, бренд, упражнение').fill('Общий гриф');
 await p.getByText('Ничего не нашлось',{exact:true}).waitFor();
 assert.equal(await p.getByRole('radio',{name:'Мои 2'}).isVisible(),true);
 await p.getByRole('radio',{name:'Общие 1'}).click();
 assert.equal(await p.locator('.mlib-card').count(),1);
 assert.match(await p.locator('.mlib-card').innerText(),/Общий гриф/);
 assert.equal(await p.getByPlaceholder('Название, бренд, упражнение').inputValue(),'Общий гриф');
 assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await p.screenshot({path:'/tmp/ft819-review-search-'+width+'-'+theme+'.png'});
 await p.getByRole('radio',{name:'Мои 2'}).click();
 await p.getByPlaceholder('Название, бренд, упражнение').fill('поясу');
 await p.locator('.mlib-card').click();await p.getByRole('button',{name:/Назад/}).click();assert.equal(await p.getByPlaceholder('Название, бренд, упражнение').inputValue(),'поясу');
 await p.getByPlaceholder('Название, бренд, упражнение').fill('нет такого');await p.getByText('Ничего не нашлось',{exact:true}).waitFor();await p.getByRole('button',{name:'Сбросить',exact:true}).click();
 await p.getByRole('button',{name:'Закрыть поиск',exact:true}).click();await p.getByRole('button',{name:'Фильтры',exact:true}).click();await p.getByRole('radio',{name:'Без упражнений',exact:true}).click();await p.getByRole('button',{name:'Показать: 1',exact:true}).click();await p.locator('.mlib-card').filter({hasText:'Скамья'}).waitFor();assert.equal(await p.locator('.mlib-card').count(),1);
 await p.getByRole('button',{name:/Фильтры/}).click();await p.getByRole('button',{name:'Сбросить',exact:true}).click();
 const order=await p.locator('.mlib-order .chip').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().width));assert.ok(Math.max(...order)-Math.min(...order)<.1);
 await p.waitForTimeout(400); assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.screenshot({path:'/tmp/ft819-filters-'+width+'-'+theme+'.png'});
 await p.getByRole('button',{name:'Показать: 2',exact:true}).click();await p.screenshot({path:'/tmp/ft819-list-'+width+'-'+theme+'.png'});
 const row=p.locator('.mlib-swipe').first();const rect=await row.boundingBox();
 await p.mouse.move(rect.x+rect.width-15,rect.y+35);await p.mouse.down();await p.mouse.move(rect.x+rect.width-155,rect.y+35,{steps:12});await p.mouse.up();
 await row.getByRole('button',{name:'Упражнения',exact:true}).click();await p.getByRole('button',{name:'Назад links-a',exact:true}).click();
 const again=p.locator('.mlib-swipe').first();const box=await again.boundingBox();await p.mouse.move(box.x+box.width-15,box.y+35);await p.mouse.down();await p.mouse.move(box.x+box.width-155,box.y+35,{steps:12});await p.mouse.up();
 await again.getByRole('button',{name:'Удалить Вертикальная тяга с дисками',exact:true}).click();await p.getByRole('button',{name:'Вернуть',exact:true}).waitFor();assert.equal(await p.locator('.mlib-card').count(),1);await p.getByRole('button',{name:'Вернуть',exact:true}).click();assert.equal(await p.locator('.mlib-card').count(),2);
 await p.getByRole('button',{name:'Новый тренажёр',exact:true}).click();await p.getByRole('button',{name:'Оборудование',exact:true}).last().click();await p.getByRole('button',{name:'Назад equipment',exact:true}).waitFor();assert.deepEqual(errors,[]);
 // Нет своих, но общие существуют: это пустая область, а не неудачный поиск.
 await p.setContent(`<html data-theme="${theme}"><style>${css}</style><div id="root"></div><script>window.__testList=[{uid:'c',name:'Общий гриф',mine:false,kind:'equipment',uses:[],photos:[]}];</script></html>`);
 await p.addScriptTag({content:out.outputFiles.find(f=>f.path.endsWith('.js')).text});
 await p.getByText('Пока нет своих карточек',{exact:true}).waitFor();
 assert.equal(await p.getByText('Ничего не нашлось',{exact:true}).count(),0);
 await p.getByRole('button',{name:'Поиск тренажёров',exact:true}).click();
 await p.getByPlaceholder('Название, бренд, упражнение').fill('Общий');
 await p.getByText('Пока нет своих карточек',{exact:true}).waitFor();
 await p.getByRole('radio',{name:'Общие 1'}).click();assert.equal(await p.locator('.mlib-card').count(),1);
 await p.getByRole('button',{name:'Закрыть поиск',exact:true}).click();
 // Зеркальный случай: общих нет, своя карточка есть.
 await p.setContent(`<html data-theme="${theme}"><style>${css}</style><div id="root"></div><script>window.__testList=[{uid:'a',name:'Своя скамья',mine:true,kind:'equipment',uses:[],photos:[]}];</script></html>`);
 await p.addScriptTag({content:out.outputFiles.find(f=>f.path.endsWith('.js')).text});
 await p.getByRole('radio',{name:'Общие 0'}).click();await p.getByText('Пока нет общих карточек',{exact:true}).waitFor();
 await p.screenshot({path:'/tmp/ft819-review-empty-'+width+'-'+theme+'.png'});
 assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);await p.close();
 }
 }finally{await b.close();}
});
