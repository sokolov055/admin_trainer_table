import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {build} from 'esbuild';
const code=(await build({bundle:true,write:false,format:'iife',globalName:'Ride',entryPoints:['src/scooter-session.js'],logLevel:'silent',plugins:[{name:'api',setup(b){b.onResolve({filter:/api.js$/},()=>({path:'api',namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:'export const apiPrimary=(...args)=>mockApi(...args);'}));}}]})).outputFiles[0].text;
function session(mockApi){const context={mockApi,console};vm.runInNewContext(code,context);return context.Ride.createScooterSession();}
test('ответ старого заезда не стирает текущий серверный старт',async()=>{
 let count=0,resolve;const s=session(async action=>{
  if(action==='scooter.start')return {id:String(++count),seed:count,rules:3};
  if(action==='scooter.finish'&&count===1)return new Promise(r=>{resolve=r;});
  if(action==='scooter.finish')return {profile:{enabled:true},rank:1,improved:true};
 });
 s.profile={enabled:true};await s.start();s.game.phase='lost';s.game.ticks=60;
 const old=s.finish();await s.start();resolve({profile:{enabled:true},rank:9,improved:true});await old;
 s.game.phase='lost';s.game.ticks=80;await s.finish();assert.match(s.rankStatus,/Место: 1/);
});
test('запоздалый ответ таблицы другой сложности не заменяет выбранную',async()=>{
 const resolves=[];const s=session(()=>new Promise(r=>resolves.push(r)));
 const first=s.leaderboard('easy'),second=s.leaderboard('extreme');
 resolves[1]({profile:{enabled:false},entries:[{alias:'Предел'}]});await second;
 resolves[0]({profile:{enabled:false},entries:[{alias:'Разминка'}]});await first;
 assert.equal(s.board[0].alias,'Предел');
});
test('несовместимая версия правил не отправляет рекорды по чужой модели',async()=>{
 const s=session(async()=>({id:'old',seed:1,rules:999}));s.profile={enabled:true};
 await assert.rejects(()=>s.start(),/Правила игры обновились/);assert.equal(s.loading,false);
});
