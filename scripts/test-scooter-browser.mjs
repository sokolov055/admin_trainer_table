import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { build } from 'esbuild';
import { readFileSync, mkdirSync } from 'node:fs';

const bundle = async () => (await build({ bundle: true, write: false, format: 'iife', loader: { '.css': 'empty', '.png': 'dataurl' }, logLevel: 'silent', define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"production"' }, stdin: { resolveDir: process.cwd(), loader: 'jsx', contents: `
import React from 'react'; import {createRoot} from 'react-dom/client';
import ScooterGame from './src/ScooterGame.jsx'; import {ScooterSessionProvider,useScooterSession} from './src/ScooterSession.jsx';
import {PlankSessionProvider} from './src/PlankSession.jsx'; import {RestScreen} from './src/RestScreen.jsx';
function Fixture({menu=true,rest=false,until=Infinity,now=Date.now(),allowed=true,immersive=true}) {
 const session=useScooterSession(); window.ride=session.game; window.readRide=()=>structuredClone(session.game);
 return <>{menu&&<ScooterGame immersive={immersive}/>} {rest&&<RestScreen until={until} now={now} total={30000} allowGame={allowed} onStop={()=>window.show({menu:false})}/>}</>;
}
const root=createRoot(document.getElementById('root'));
window.show=props=>root.render(<ScooterSessionProvider><PlankSessionProvider><Fixture {...props}/></PlankSessionProvider></ScooterSessionProvider>);
window.show({});` }, plugins: [{ name: 'silent-alarm', setup(b) { b.onResolve({ filter: /^(\.\/native-rest\.js|\.\/rest-alarm\.js)$/ }, a => ({ path: a.path, namespace: 'stub' })); b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const alarmRings=()=>false; export const alarmClosed=async()=>false; export const ringOnce=()=>{}; export const stopVibration=()=>{};' })); } }] })).outputFiles[0].text;

async function setup(t) {
  const browser = await chromium.launch(); t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
  const errors=[]; page.on('pageerror',e=>errors.push(String(e)));
  const css=['styles.css','rest.css','scooter.css'].map(f=>readFileSync('src/'+f,'utf8')).join('\n');
  await page.setContent('<style>'+css+'</style><div id="root"></div>');
  await page.addScriptTag({content:await bundle()});
  await page.getByRole('button',{name:'В путь',exact:true}).waitFor();
  await page.clock.install(); await page.clock.pauseAt(new Date(Date.now()+100));
  t.after(()=>assert.deepEqual(errors,[]));
  return page;
}

test('самокат: кнопки, свайп, пауза, повторный монтаж и единственный владелец поездки', async t=>{
  const page=await setup(t);
  mkdirSync('reports/scooter',{recursive:true});
  await page.screenshot({path:'reports/scooter/immersive-start-390.png',fullPage:true});
  await page.getByRole('button',{name:'В путь',exact:true}).click(); await page.clock.runFor(4200);
  await page.screenshot({path:'reports/scooter/immersive-playing-390.png',fullPage:true});
  const canvasPixels=await page.locator('canvas').evaluate(element=>({width:element.width,css:element.clientWidth}));
  assert.ok(canvasPixels.width>=canvasPixels.css*2.9,'Canvas использует полный DPR экрана');
  await page.evaluate(()=>{ride.nitroCharges=1}); await page.clock.runFor(30);
  await page.getByRole('button',{name:/Включить нитро/}).click(); await page.clock.runFor(120);
  assert.ok((await page.evaluate(()=>readRide())).nitro>3);
  await page.screenshot({path:'reports/scooter/immersive-nitro-390.png',fullPage:true});
  await page.keyboard.press('ArrowLeft');
  assert.equal((await page.evaluate(()=>readRide())).lane,0);
  await page.getByRole('button',{name:'Вправо',exact:true}).click();
  assert.equal((await page.evaluate(()=>readRide())).lane,1);
  const canvas=await page.locator('canvas').boundingBox();
  await page.mouse.move(canvas.x+100,canvas.y+200); await page.mouse.down(); await page.mouse.move(canvas.x+180,canvas.y+201); await page.mouse.up();
  assert.equal((await page.evaluate(()=>readRide())).lane,2);
  await page.getByRole('button',{name:'Пауза',exact:true}).click();
  const paused=await page.evaluate(()=>readRide()); await page.clock.runFor(20000);
  assert.equal((await page.evaluate(()=>readRide())).remaining,paused.remaining);
  await page.evaluate(()=>show({menu:false})); await page.locator('.scooter-game').waitFor({state:'detached'});
  await page.clock.runFor(10000); await page.evaluate(()=>show({menu:true}));
  await page.getByRole('button',{name:'Продолжить поездку',exact:true}).click(); await page.clock.runFor(1000);
  const current=await page.evaluate(()=>readRide());
  assert.ok(current.remaining<paused.remaining); assert.ok(current.remaining>paused.remaining-1.2);
  // Вторая сцена во время отдыха получает управление; нижняя не удваивает скорость.
  await page.evaluate(()=>show({menu:true,rest:true,until:Date.now()+30000}));
  await page.getByRole('dialog').getByRole('button',{name:'Продолжить поездку',exact:true}).click();
  const scene=page.getByRole('dialog').locator('.scooter-game');
  await scene.getByRole('button',{name:'Продолжить поездку',exact:true}).click();
  const before=await page.evaluate(()=>readRide()); await page.clock.runFor(1000);
  const after=await page.evaluate(()=>readRide()); assert.ok(after.elapsed-before.elapsed<1.1);
  await scene.getByRole('button',{name:'К отдыху',exact:true}).click();
  assert.equal((await page.evaluate(()=>readRide())).phase,'paused');
});

test('самокат: конец отдыха, сохранение поездки, повторный отдых и закрытый доступ',async t=>{
  const page=await setup(t); const at=await page.evaluate(()=>Date.now());
  await page.evaluate(at=>show({menu:false,rest:true,until:at+6000,now:at}),at);
  await page.getByRole('button',{name:'На самокате до зала',exact:true}).click();
  await page.getByRole('button',{name:'В путь',exact:true}).click(); await page.clock.runFor(6100);
  const stopped=await page.evaluate(()=>readRide()); assert.equal(stopped.phase,'paused');
  await page.evaluate(at=>show({menu:false,rest:true,until:at+6000,now:at+6100}),at);
  await page.getByRole('dialog',{name:'Отдых окончен',exact:true}).waitFor();
  assert.match(await page.getByRole('status').innerText(),/Игра на паузе/);
  await page.clock.runFor(20000);
  await page.evaluate(()=>show({menu:false,rest:true,until:Date.now()+30000}));
  await page.getByRole('button',{name:'Продолжить поездку',exact:true}).click();
  assert.equal((await page.evaluate(()=>readRide())).distance,stopped.distance);
  await page.getByRole('button',{name:'Продолжить поездку',exact:true}).click(); await page.clock.runFor(800);
  assert.ok((await page.evaluate(()=>readRide())).distance>stopped.distance);
  mkdirSync('reports/scooter',{recursive:true});
  await page.screenshot({path:'reports/scooter/rest-playing.png',fullPage:true});
  await page.getByRole('button',{name:'Пауза',exact:true}).click();
  await page.setViewportSize({width:320,height:640});
  await page.clock.runFor(300);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.equal(await page.locator('[data-scooter=speed]').first().innerText(),'0');
  await page.screenshot({path:'reports/scooter/rest-paused-320.png',fullPage:true});
  await page.evaluate(()=>show({menu:false,rest:true,until:Date.now()+30000,allowed:false}));
  assert.equal(await page.locator('.scooter-game').count(),0);
  assert.equal(await page.getByRole('button',{name:/самокате|поездку/}).count(),0);
});

test('самокат: наклон, отказ, уход в фон и очистка датчика после выхода',async t=>{
  const page=await setup(t);
  await page.evaluate(()=>{
    Object.defineProperty(window,'isSecureContext',{configurable:true,value:true});
    window.DeviceOrientationEvent=class { static requestPermission=async()=> 'granted'; };
    window.tilt=gamma=>window.dispatchEvent(Object.assign(new Event('deviceorientation'),{gamma,beta:0}));
  });
  await page.getByRole('button',{name:'Наклон телефона',exact:true}).click(); await page.evaluate(()=>tilt(0));
  await page.getByRole('button',{name:'В путь',exact:true}).click(); await page.clock.runFor(3200);
  await page.evaluate(()=>tilt(-20)); assert.equal((await page.evaluate(()=>readRide())).lane,0);
  await page.evaluate(()=>tilt(20)); assert.equal((await page.evaluate(()=>readRide())).lane,2);
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  assert.equal((await page.evaluate(()=>readRide())).phase,'paused');
  await page.evaluate(()=>show({menu:false})); await page.locator('.scooter-game').waitFor({state:'detached'});
  await page.evaluate(()=>show({menu:true}));
  await page.getByRole('button',{name:'Продолжить поездку',exact:true}).click();
  await page.evaluate(()=>tilt(-20)); assert.equal((await page.evaluate(()=>readRide())).lane,2,'удалённый датчик не рулит новой сценой');
  await page.evaluate(()=>DeviceOrientationEvent.requestPermission=async()=> 'denied');
  await page.setViewportSize({width:320,height:640});
  await page.getByRole('button',{name:'Наклон телефона',exact:true}).click();
  const sensor=page.locator('[data-scooter=sensor-status]');
  assert.equal(await sensor.isVisible(),true);
  assert.match(await sensor.innerText(),/не разрешён/);
});

test('самокат: чистый финиш открывает длинный уровень, столкновение завершает попытку', async t=>{
  const page=await setup(t);
  await page.getByRole('button',{name:'В путь',exact:true}).click(); await page.clock.runFor(3100);
  await page.evaluate(()=>{ ride.route=[]; ride.distance=ride.goalDistance-1; });
  await page.clock.runFor(120);
  assert.equal((await page.evaluate(()=>readRide())).phase,'won');
  await page.getByRole('button',{name:'Уровень 2',exact:true}).click();
  const second=await page.evaluate(()=>readRide());
  assert.equal(second.level,2); assert.equal(second.goalDistance,1800);
  await page.clock.runFor(3100);
  await page.evaluate(()=>{ ride.route=[{id:'crash',at:ride.distance+2,lane:ride.lane,type:'robot',passed:false}]; });
  await page.clock.runFor(250);
  const crashed=await page.evaluate(()=>readRide());
  assert.equal(crashed.phase,'lost'); assert.equal(crashed.crashed,true);
  await page.getByRole('heading',{name:'Столкновение!',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Повторить уровень',exact:true}).isVisible(),true);
});
