import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { build } from 'esbuild';
import { readFileSync, mkdirSync } from 'node:fs';
const bundle=async()=>(await build({bundle:true,write:false,format:'iife',loader:{'.css':'empty','.png':'dataurl'},logLevel:'silent',define:{'import.meta.env':'{}','process.env.NODE_ENV':'"production"'},stdin:{resolveDir:process.cwd(),loader:'jsx',contents:`
import React from 'react';import {createRoot} from 'react-dom/client';
import ScooterGame from './src/ScooterGame.jsx';import {ScooterSessionProvider,useScooterSession} from './src/ScooterSession.jsx';
import {PlankSessionProvider} from './src/PlankSession.jsx';import {RestScreen} from './src/RestScreen.jsx';import GameShell from './src/GameShell.jsx';import {IconScooterGame,IconPlankGame,IconMatchGame} from './src/game-icons.jsx';
function Fixture({menu=true,rest=false,until=Infinity,now=Date.now(),allowed=true}) {
 const session=useScooterSession();window.ride=session.game;window.readRide=()=>structuredClone(session.game);
 return <div className="app"><header>Имя клиента</header><main>{menu&&<GameShell kind="scooter"><ScooterGame immersive onClose={()=>window.show({menu:false})}/></GameShell>}</main>{rest&&<RestScreen until={until} now={now} total={30000} allowGame={allowed} onStop={()=>window.show({menu:false})}/>}</div>;
}
let joined=false;window.gameApi=async(action,params)=>{if(action==='scooter.join')joined=true;if(action==='scooter.leave')joined=false;
 if(action==='scooter.board')return {profile:{enabled:joined,alias:'Райдер ТЕСТ'},entries:[]};
 if(action==='scooter.start')return {id:'test',seed:563,rules:3};return {enabled:joined,alias:'Райдер ТЕСТ'};};
const root=createRoot(document.getElementById('root'));window.show=props=>root.render(<ScooterSessionProvider><PlankSessionProvider><Fixture {...props}/></PlankSessionProvider></ScooterSessionProvider>);window.showIcons=()=>root.render(<div style={{padding:24,background:'#fffdf2',height:'100vh',color:'#173c34',fontFamily:'Manrope,sans-serif'}}><h2>Игры</h2><div style={{display:'flex',gap:18}}>{[[IconScooterGame,'Самокат'],[IconPlankGame,'Викторина'],[IconMatchGame,'Три в ряд']].map(([Icon,label])=><div key={label} style={{width:96,textAlign:'center',fontSize:12,fontWeight:800}}><Icon size={96}/><p>{label}</p></div>)}</div></div>);window.show({});`},
plugins:[{name:'stubs',setup(b){
 b.onResolve({filter:/^\.\/api\.js$/},a=>a.importer.endsWith('scooter-session.js')?{path:a.path,namespace:'gameapi'}:undefined);
 b.onLoad({filter:/.*/,namespace:'gameapi'},()=>({contents:'export const apiPrimary=(action,params)=>window.gameApi(action,params);'}));
 b.onResolve({filter:/^(\.\/native-rest\.js|\.\/rest-alarm\.js)$/},a=>({path:a.path,namespace:'alarm'}));
 b.onLoad({filter:/.*/,namespace:'alarm'},()=>({contents:'export const alarmRings=()=>false;export const alarmClosed=async()=>false;export const ringOnce=()=>{};export const stopVibration=()=>{};'}));
}}]})).outputFiles[0].text;
async function setup(t, firstTime=false){
 const browser=await (process.env.SCOOTER_BROWSER === 'webkit' ? webkit : chromium).launch();t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:3,hasTouch:true});page.setDefaultTimeout(10000);const errors=[];
 page.on('pageerror',e=>errors.push(String(e)));const css=['styles.css','rest.css','scooter.css','game-shell.css'].map(f=>readFileSync('src/'+f,'utf8')).join('\n');
 await page.setContent('<style>'+css+'</style><div id="root"></div>');
 await page.evaluate(firstTime=>{const values=new Map(firstTime?[]:[['ft.scooter.tutorial.v1','done']]);Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)}});},firstTime);
 await page.addScriptTag({content:await bundle()});
 await page.getByRole('button',{name:'В путь',exact:true}).waitFor();await page.clock.install({time:new Date('2026-10-17T00:00:00Z')});await page.clock.pauseAt(new Date('2026-10-18T00:00:00Z'));
 t.after(()=>assert.deepEqual(errors,[]));mkdirSync('reports/scooter-v3',{recursive:true});return page;
}
test('полный экран, компактный HUD, меню, настройки и нитро',async t=>{
 const page=await setup(t);
 await page.screenshot({path:'reports/scooter-v3/menu-390.png',fullPage:true});
 await page.getByRole('button',{name:'В путь',exact:true}).click();await page.clock.runFor(4000);
 const canvas=page.locator('canvas');const bounds=await canvas.boundingBox();assert.equal(bounds.y,0);assert.equal(bounds.height,844);
 assert.equal(await page.locator('.game-header,.game-footer,.route-status').count(),0);
 const pixel=await canvas.evaluate(e=>({width:e.width,css:e.clientWidth}));assert.ok(pixel.width>=pixel.css*2.9);
 await page.evaluate(()=>{ride.nitroCharges=1;ride.route=[]});await page.clock.runFor(30);
 await page.getByRole('button',{name:/Включить нитро/}).click();await page.clock.runFor(120);assert.ok((await page.evaluate(()=>readRide())).nitro>3);
 await page.keyboard.press('ArrowLeft');assert.equal((await page.evaluate(()=>readRide())).lane,0);
 // Нитро внизу не закрывает самокат и на правой полосе (отзыв 17.10.2026)
 await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');await page.clock.runFor(600);
 const nitro=await page.locator('.nitro-button').boundingBox(),k=bounds.width/420;
 const rider={x:(122+2*88-47)*k,y:(bounds.height/k-154-52)*k,w:94*k,h:104*k};
 assert.ok(nitro.y>=rider.y+rider.h||nitro.x+nitro.width<=rider.x,'нитро не перекрывает игрока: '+JSON.stringify({nitro,rider}));
 await page.keyboard.press('ArrowLeft');await page.keyboard.press('ArrowLeft');await page.clock.runFor(600);
 await page.screenshot({path:'reports/scooter-v3/playing-390.png',fullPage:true});
 await page.getByRole('button',{name:'Меню игры',exact:true}).click();const paused=await page.evaluate(()=>readRide());
 await page.clock.runFor(5000);assert.equal((await page.evaluate(()=>readRide())).distance,paused.distance);
 await page.getByRole('button',{name:'Управление',exact:true}).click();
 await page.getByRole('heading',{name:'Управление',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Наклон телефона',exact:true}).isVisible(),true);
 await page.getByRole('button',{name:'К игре',exact:true}).click();await page.getByRole('button',{name:'Продолжить поездку',exact:true}).click();
 await page.evaluate(async()=>{if(document.fullscreenElement)await document.exitFullscreen();});
 await page.setViewportSize({width:1440,height:900});await page.clock.runFor(100);
 await page.screenshot({path:'reports/scooter-v3/playing-desktop.png',fullPage:true});
 await page.setViewportSize({width:320,height:640});await page.clock.runFor(100);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:'reports/scooter-v3/playing-320.png',fullPage:true});
 await page.evaluate(()=>showIcons());await page.setViewportSize({width:390,height:844});await page.clock.runFor(100);
 await page.locator('.game-menu-icon').first().waitFor();
 await page.locator('img.game-menu-icon').evaluateAll(images=>Promise.all(images.map(img=>img.decode())));
 await page.screenshot({path:'reports/scooter-v3/game-icons-390.png',fullPage:true});
});
test('бесконечная аллея, зебра, бабушки, качки и конец от столкновения',async t=>{
 const page=await setup(t);await page.getByRole('button',{name:'В путь',exact:true}).click();await page.clock.runFor(3100);
 await page.evaluate(()=>{ride.distance=385;ride.ticks=1200;ride.elapsed=20;ride.nextAt=1000;ride.nextCrossing=950;
 ride.route=[{at:414,lane:0,type:'grandma',row:0},{at:427,lane:1,type:'athlete',row:1},{at:450,lane:2,type:'robot',row:2},
 {at:443,crossingAt:450,lane:-1.2,type:'car',crossing:true,direction:1},{at:457,crossingAt:450,lane:3.2,type:'taxi',crossing:true,direction:-1}];});
 await page.clock.runFor(30);await page.screenshot({path:'reports/scooter-v3/crossing-390.png',fullPage:true});
 await page.evaluate(()=>{ride.route=[{id:'crash',at:ride.distance+2,lane:ride.lane,type:'robot',row:0}];});await page.clock.runFor(120);
 assert.equal((await page.evaluate(()=>readRide())).phase,'lost');await page.getByRole('heading',{name:'Заезд окончен',exact:true}).waitFor();
 await page.screenshot({path:'reports/scooter-v3/result-390.png',fullPage:true});
 await page.getByRole('button',{name:'Ещё заезд',exact:true}).click();assert.equal((await page.evaluate(()=>readRide())).phase,'countdown');
});
test('приоритет отдыха и продолжение общей поездки',async t=>{
 const page=await setup(t);const at=await page.evaluate(()=>Date.now());
 await page.evaluate(at=>show({menu:false,rest:true,until:at+6000,now:at}),at);
 await page.getByRole('button',{name:'На самокате до зала',exact:true}).click();await page.getByRole('button',{name:'В путь',exact:true}).click();await page.clock.runFor(6100);
 const stopped=await page.evaluate(()=>readRide());assert.equal(stopped.phase,'paused');
 await page.evaluate(at=>show({menu:false,rest:true,until:at+6000,now:at+6100}),at);
 await page.getByRole('dialog',{name:'Отдых окончен',exact:true}).waitFor();
 await page.evaluate(()=>show({menu:false,rest:true,until:Date.now()+30000}));
 await page.getByRole('button',{name:'Продолжить поездку',exact:true}).click();
 assert.equal((await page.evaluate(()=>readRide())).distance,stopped.distance);
});
test('рейтинг добровольный, отдельное согласие, удаление и ошибка загрузки',async t=>{
 const page=await setup(t);await page.getByRole('button',{name:'Рейтинг игроков',exact:true}).click();
 await page.getByText('Здесь пока нет рекордов. Начни первый заезд.').waitFor();
 await page.screenshot({path:'reports/scooter-v3/leaderboard-390.png',fullPage:true});
 const join=page.getByRole('button',{name:'Участвовать в рейтинге',exact:true});assert.equal(await join.isDisabled(),true);
 await page.getByRole('checkbox',{name:/Я согласен/}).check();await join.click();
 await page.getByText('Твой псевдоним:').waitFor();
 await page.getByRole('button',{name:'Выйти из рейтинга и удалить рекорды',exact:true}).click();await join.waitFor();
 await page.evaluate(()=>window.gameApi=async()=>{throw new Error('Нет связи. Повтори загрузку.');});
 await page.getByRole('button',{name:'Предел',exact:true}).click();await page.getByRole('alert').waitFor();
 assert.equal(await page.getByRole('button',{name:'Повторить загрузку',exact:true}).isVisible(),true);
});
test('настройки наклона находятся в меню и датчик снимается при выходе',async t=>{
 const page=await setup(t);await page.evaluate(()=>{Object.defineProperty(window,'isSecureContext',{configurable:true,value:true});window.DeviceOrientationEvent=class{static requestPermission=async()=>'granted'};window.tilt=gamma=>window.dispatchEvent(Object.assign(new Event('deviceorientation'),{gamma,beta:0}));});
 await page.getByRole('button',{name:'Управление',exact:true}).click();await page.getByRole('button',{name:'Наклон телефона',exact:true}).click();await page.evaluate(()=>tilt(0));
 await page.getByRole('button',{name:'К игре',exact:true}).click();await page.getByRole('button',{name:'В путь',exact:true}).click();await page.clock.runFor(3200);
 await page.evaluate(()=>tilt(-20));assert.equal((await page.evaluate(()=>readRide())).lane,0);
 await page.evaluate(()=>window.dispatchEvent(new Event('blur')));assert.equal((await page.evaluate(()=>readRide())).phase,'paused');
 await page.getByRole('button',{name:'Свернуть игру',exact:true}).click();await page.locator('.scooter-game').waitFor({state:'detached'});
 const lane=await page.evaluate(()=>ride.lane);await page.evaluate(()=>tilt(20));assert.equal(await page.evaluate(()=>ride.lane),lane);
});
test('касания половин меняют одну полосу, свайп не даёт второго поворота, нитро не рулит',async t=>{
 const page=await setup(t);await page.getByRole('button',{name:'В путь',exact:true}).click();await page.clock.runFor(3100);
 assert.equal(await page.locator('[data-scooter=left],[data-scooter=right],.steering').count(),0);
 await page.touchscreen.tap(60,500);assert.equal(await page.evaluate(()=>ride.lane),0);
 await page.touchscreen.tap(320,500);assert.equal(await page.evaluate(()=>ride.lane),1);
 await page.mouse.move(70,500);await page.mouse.down();await page.mouse.move(310,500);await page.mouse.up();assert.equal(await page.evaluate(()=>ride.lane),2);
 await page.evaluate(()=>{ride.nitroCharges=1;ride.route=[]});await page.clock.runFor(30);
 await page.getByRole('button',{name:/Включить нитро/}).click();assert.equal(await page.evaluate(()=>ride.lane),2);
});
test('первое обучение безопасно, пробует обе половины и запоминается',async t=>{
 const page=await setup(t,true);await page.getByRole('button',{name:'В путь',exact:true}).click();
 await page.getByRole('dialog',{name:'Обучение управлению',exact:true}).waitFor();await page.clock.runFor(5000);
 assert.equal(await page.evaluate(()=>ride.distance),0);
 await page.getByRole('button',{name:'Попробовать влево',exact:true}).click();await page.clock.runFor(200);assert.equal(await page.evaluate(()=>ride.lane),0);
 await page.getByRole('button',{name:'Попробовать вправо',exact:true}).click();await page.clock.runFor(200);assert.equal(await page.evaluate(()=>ride.lane),1);
 await page.screenshot({path:'reports/scooter-v3/tutorial-390.png',fullPage:true});
 // Игра на сенсорном экране сама уходит во весь экран; размер окна меняется только вне его
 await page.evaluate(()=>document.fullscreenElement&&document.exitFullscreen());
 await page.setViewportSize({width:320,height:640});await page.clock.runFor(50);await page.screenshot({path:'reports/scooter-v3/tutorial-320.png',fullPage:true});
 await page.setViewportSize({width:1440,height:900});await page.clock.runFor(50);await page.screenshot({path:'reports/scooter-v3/tutorial-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.clock.runFor(50);
 await page.getByRole('button',{name:'Поехали',exact:true}).click();await page.clock.runFor(3100);assert.equal(await page.evaluate(()=>ride.phase),'playing');
 assert.equal(await page.evaluate(()=>localStorage.getItem('ft.scooter.tutorial.v1')),'done');
 await page.getByRole('button',{name:'Меню игры',exact:true}).click();await page.getByRole('button',{name:'Новый заезд',exact:true}).click();await page.clock.runFor(30);
 assert.equal(await page.getByRole('dialog',{name:'Обучение управлению',exact:true}).isVisible(),false);
});
test('позы ног и колёса меняются при движении и замирают на паузе',async t=>{
 const page=await setup(t);await page.getByRole('button',{name:'В путь',exact:true}).click();await page.clock.runFor(3100);
 await page.evaluate(()=>{ride.nextAt=2000;ride.nextCrossing=2450;ride.route=[{at:ride.distance+30,lane:0,type:'grandma',row:0},{at:ride.distance+46,lane:1,type:'athlete',row:1},{at:ride.distance+62,lane:2,type:'runner',row:2},{at:ride.distance+82,lane:0,type:'robot',row:3}];});
 await page.clock.runFor(30);await page.screenshot({path:'reports/scooter-v3/walking-390.png',fullPage:true});
 const before=await page.locator('canvas').screenshot();await page.clock.runFor(150);const after=await page.locator('canvas').screenshot();assert.notDeepEqual(before,after);
 await page.getByRole('button',{name:'Меню игры',exact:true}).click();const stopped=await page.locator('canvas').screenshot();await page.clock.runFor(1000);assert.deepEqual(await page.locator('canvas').screenshot(),stopped);
});
