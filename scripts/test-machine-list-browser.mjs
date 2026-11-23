import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
const entry = `import React, {useState} from 'react';import {createRoot} from 'react-dom/client';import MachineList from './src/trainer/MachineList.jsx';
const list=[{uid:'a',name:'Вертикальная тяга с дисками',mine:true,kind:'machine',brand:'Technogym',muscleGroups:['Спина'],uses:[{name:'Тяга к поясу'}],photos:['one','two'],setup:'Сиденье',weightStep:2.5},{uid:'b',name:'Скамья',mine:true,kind:'equipment',brand:'Matrix',muscleGroups:['Грудь'],uses:[],photos:[],setup:''},{uid:'c',name:'Общий гриф',mine:false,kind:'equipment',brand:'',muscleGroups:[],uses:[],photos:[],setup:''}];
function App(){const[state,setState]=useState({scope:'mine',q:'',search:false,kind:'',filters:{brand:'',muscle:'',missing:false,sort:'recent'}});const[open,setOpen]=useState('');return <main style={{padding:16,maxWidth:600,margin:'auto'}}>{open?<button onClick={()=>setOpen('')}>Назад {open}</button>:<MachineList list={list} state={state} setState={setState} onOpen={setOpen} onCreate={k=>setOpen(k)}/>}</main>};createRoot(document.getElementById('root')).render(<App/>);`;
test('FT-819: список, фильтры, переходы и геометрия в обеих темах', async () => {
 const out=await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'jsx'},bundle:true,write:false,outdir:'/tmp/ft819-test',format:'iife',define:{'import.meta.env':'{}','process.env.NODE_ENV':'"production"'},plugins:[{name:'stub',setup(b){b.onResolve({filter:/\/telegram\.js$/},()=>({path:'telegram',namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:"export const haptic=()=>{}; export const getInitData=()=>''; export const environmentInfo=()=>({});"}));}}]});
 const css=readFileSync('src/styles.css','utf8')+readFileSync('src/trainer/machines-lib.css','utf8');
 const b=await chromium.launch();try{
 for(const width of [320,390,430]) for(const theme of ['light','dark']){
 const p=await b.newPage({viewport:{width,height:850},reducedMotion:'reduce'}); const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.setContent(`<html data-theme="${theme}"><style>${css}</style><div id="root"></div></html>`);await p.addScriptTag({content:out.outputFiles.find(f=>f.path.endsWith('.js')).text});
 await p.locator('.mlib-card').first().waitFor();assert.equal(await p.locator('.mlib-card').count(),2);
 const geom=await p.locator('.mlib-scope .chip').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();const t=e.firstElementChild.getBoundingClientRect();return {w:r.width,delta:Math.abs((r.x+r.width/2)-(t.x+t.width/2))}}));assert.ok(Math.abs(geom[0].w-geom[1].w)<.1);assert.ok(geom.every(g=>g.delta<.1));
 await p.getByRole('radio',{name:'Общие 1'}).click();assert.equal(await p.locator('.mlib-card').count(),1);await p.getByRole('radio',{name:'Мои 2'}).click();
 await p.getByRole('button',{name:'Поиск тренажёров',exact:true}).click();await p.getByPlaceholder('Название, бренд, упражнение').fill('поясу');assert.equal(await p.locator('.mlib-card').count(),1);
 await p.locator('.mlib-card').click();await p.getByRole('button',{name:/Назад/}).click();assert.equal(await p.getByPlaceholder('Название, бренд, упражнение').inputValue(),'поясу');
 await p.getByPlaceholder('Название, бренд, упражнение').fill('нет такого');await p.getByText('Ничего не нашлось',{exact:true}).waitFor();await p.getByRole('button',{name:'Сбросить',exact:true}).click();
 await p.getByRole('button',{name:'Закрыть поиск',exact:true}).click();await p.getByRole('button',{name:'Фильтры',exact:true}).click();await p.getByRole('radio',{name:'Без упражнений',exact:true}).click();await p.getByRole('button',{name:'Показать: 1',exact:true}).click();await p.locator('.mlib-card').filter({hasText:'Скамья'}).waitFor();assert.equal(await p.locator('.mlib-card').count(),1);
 await p.getByRole('button',{name:/Фильтры/}).click();await p.getByRole('button',{name:'Сбросить',exact:true}).click();
 const order=await p.locator('.mlib-order .chip').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().width));assert.ok(Math.max(...order)-Math.min(...order)<.1);
 await p.waitForTimeout(400); assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.screenshot({path:'/tmp/ft819-filters-'+width+'-'+theme+'.png'});
 await p.getByRole('button',{name:'Показать: 2',exact:true}).click();await p.screenshot({path:'/tmp/ft819-list-'+width+'-'+theme+'.png'});
 await p.getByRole('button',{name:'Новый тренажёр',exact:true}).click();await p.getByRole('button',{name:'Оборудование',exact:true}).last().click();await p.getByRole('button',{name:'Назад equipment',exact:true}).waitFor();assert.deepEqual(errors,[]);await p.close();
 }
 }finally{await b.close();}
});
