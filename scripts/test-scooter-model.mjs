import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, begin, advance, steer, setLane, pause, resume, activateNitro, laneFromTilt, tiltAxis, TUNING, DIFFICULTIES } from '../src/scooter-model.js';
const playing = (seed=563, difficulty='medium') => { const g=createGame(seed,difficulty); begin(g); advance(g,3); return g; };
test('отсчёт, три полосы и пауза сохраняют поездку',()=>{
 const g=createGame(); begin(g); advance(g,2); assert.equal(g.phase,'countdown'); assert.equal(g.elapsed,0);
 pause(g); const before=JSON.stringify(g); advance(g,10); assert.equal(JSON.stringify(g),before);
 resume(g); advance(g,1); assert.equal(g.phase,'playing'); steer(g,-1); steer(g,-1); assert.equal(g.lane,0);
 steer(g,1); steer(g,1); steer(g,1); assert.equal(g.lane,2);
});
test('столкновение завершает попытку сразу и замораживает мир',()=>{
 const g=playing();g.route=[{at:3,lane:1,type:'robot'}];advance(g,.5);
 assert.equal(g.phase,'lost'); assert.equal(g.crashed,true); assert.equal(g.hits,1);
 const before=JSON.stringify(g); advance(g,2); steer(g,-1);assert.equal(JSON.stringify(g),before);
});
test('предтрен даёт до двух зарядов, нитро добавляет скорость и тратится',()=>{
 const g=playing();g.route=[{at:3,lane:1,type:'preworkout'}];advance(g,.15);assert.equal(g.nitroCharges,1);
 g.route=[];const normal=g.speed;assert.equal(activateNitro(g),true);advance(g,1/60);
 assert.ok(g.speed>normal*1.4);assert.equal(activateNitro(g),false);
 g.route=[];advance(g,TUNING.nitroDuration+.1);assert.equal(g.nitro,0);
});
test('вода даёт очки без прежнего таймера финиша',()=>{
 const g=playing();g.route=[{at:3,lane:1,type:'bottle'}];advance(g,.2);
 assert.equal(g.bottles,1); assert.equal(g.score,25); assert.equal(g.remaining,undefined);
});
test('три сложности различаются скоростью и плотностью, среднего финиша нет',()=>{
 const configs=Object.values(DIFFICULTIES);
 assert.ok(configs[0].max<configs[1].max&&configs[1].max<configs[2].max);
 assert.ok(configs[0].minGap>configs[1].minGap&&configs[1].minGap>configs[2].minGap);
 const g=playing();g.route=[];g.distance=100000;g.nextAt=100500;g.nextCrossing=100950;advance(g,1/60);assert.equal(g.phase,'playing');assert.ok(g.distance>100000);
});
test('генератор аллеи: пешеходы и ремонт; машины только поперёк на переходах',()=>{
 const g=playing();
 assert.ok(g.route.every(o=>!['car','taxi'].includes(o.type)));
 g.distance=400;g.route=[];advance(g,1/60);
 const cars=g.route.filter(o=>o.crossing);assert.equal(cars.length,2);
 assert.ok(cars.every(o=>Math.abs(o.at-450)===7));
 const before=cars[0].lane;advance(g,.05);assert.notEqual(cars[0].lane,before);
 assert.ok(g.route.some(o=>['grandma','athlete','runner','robot','barrier'].includes(o.type)));
});
test('30 и 60 кадров дают одинаковый результат и детерминированный журнал',()=>{
 const a=playing(),b=playing();
 for(let i=0;i<60;i++) advance(a,1/60);for(let i=0;i<30;i++) advance(b,1/30);
 assert.equal(a.distance,b.distance);assert.equal(a.ticks,b.ticks);assert.deepEqual(a.route,b.route);
});
test('бесконечный генератор не накапливает пройденные объекты',()=>{
 const g=playing();
 for(let i=0;i<500;i++){g.distance+=20;g.route=[];advance(g,1/60);}
 assert.ok(g.route.length<50);assert.ok(g.nextAt>10000);
});
test('наклон: мёртвая зона, гистерезис и поворот',()=>{
 assert.equal(laneFromTilt(-14),0);assert.equal(laneFromTilt(14),2);assert.equal(laneFromTilt(9,2),2);
 assert.equal(laneFromTilt(5,2),1);assert.equal(tiltAxis(null,10),null);assert.ok(Math.abs(tiltAxis(15,20,90)-20)<.001);
});
test('близкий объезд персонажа вызывает реплику с ограничением частоты',()=>{
 const g=playing();setLane(g,0);advance(g,.5);g.route=[{at:g.distance+3,lane:1,type:'athlete',row:0}];advance(g,1);
 assert.equal(g.hits,0);assert.equal(g.event.kind,'bark');assert.match(g.event.text,/ноги/);
});
test('машины уступают НПС и роботу перед занятой зеброй',()=>{
 const g=playing();g.nextAt=2000;g.nextCrossing=2450;
 g.route=[{at:450,lane:1,type:'robot'},{at:443,crossingAt:450,lane:-1.21,type:'car',crossing:true,direction:1},{at:457,crossingAt:450,lane:3.21,type:'taxi',crossing:true,direction:-1}];
 advance(g,1);assert.equal(g.route[1].lane,-1.2);assert.equal(g.route[2].lane,3.2);assert.equal(g.route[1].waiting,true);
 g.route[0].at=472;advance(g,.1);assert.ok(g.route[1].lane>-1.2);assert.ok(g.route[2].lane<3.2);
});
test('пешеход ждёт перед бордюром, пока машины освобождают переход',()=>{
 const g=playing();g.nextAt=2000;g.nextCrossing=2450;
 g.route=[{at:429.99,lane:1,type:'runner'},{at:443,crossingAt:450,lane:0,type:'car',crossing:true,direction:1}];
 advance(g,1);assert.equal(g.route[0].at,430);assert.equal(g.route[0].waiting,true);
 g.route[1].lane=4;advance(g,.1);assert.ok(g.route[0].at>430);
});
test('бегун сохраняет дистанцию за медленной бабушкой',()=>{
 const g=playing();g.nextAt=2000;g.nextCrossing=2450;
 g.route=[{at:100,lane:0,type:'runner'},{at:114,lane:0,type:'grandma'}];advance(g,1);
 assert.ok(g.route[1].at-g.route[0].at>=14-1e-8);assert.ok(g.route[0].at>100);
});
