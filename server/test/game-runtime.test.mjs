import test from 'node:test';
import assert from 'node:assert/strict';
import {GameRuntime} from '../game-runtime.mjs';
import {ActionSession} from '../action-session.mjs';

test('original combat runs deterministically and derives kills without client counters',()=>{
 const a=new GameRuntime({seed:42}),b=new GameRuntime({seed:42});let first,second;
 for(let i=0;i<300;i++){first=a.step();second=b.step();}
 assert.deepEqual(first,second);assert.ok(first.kills>0);assert.ok(Math.abs(first.seconds-10)<1e-9);
 assert.throws(()=>a.step({axis:[0,0],kills:1000000}),/Only player actions/);
 assert.throws(()=>a.step({axis:[2,0]}),/Invalid movement/);
 assert.throws(()=>a.step({axis:[1,1]}),/Invalid movement/);
 assert.throws(()=>a.step({axis:[0,0],choice:0}),/Invalid choice/);
});
test('death stops survival time; movement cannot create invulnerability',()=>{
 const g=new GameRuntime({seed:42});let state;
 for(let i=0;i<1800;i++)state=g.step({axis:[Math.sin(i/80)*0.7,Math.cos(i/80)*0.7],...(state?.choice==='level'?{choice:0}:{})});
 assert.equal(state.state,'over');assert.equal(state.hp,0);const seconds=state.seconds;
 for(let i=0;i<60;i++)state=g.step();assert.equal(state.seconds,seconds);
});
test('action sessions bind wallet and reject fast-forward, replays, disconnects and forged counters',()=>{
 let now=1000,calls=0;const session=new ActionSession({wallet:'owner',clock:()=>now,runtimeFactory:()=>({step:action=>{if('kills' in action)throw Error('Forged counters');calls++;return{seconds:calls/30,kills:0,state:'playing'};}})});
 const batch={sequence:0,actions:Array.from({length:30},()=>({axis:[0,0]}))};
 assert.throws(()=>session.accept('other',batch),/another wallet/);
 assert.throws(()=>session.accept('owner',batch),/elapsed time/);assert.equal(calls,0);
 now+=1000;assert.equal(session.accept('owner',batch).seconds,1);
 assert.throws(()=>session.accept('owner',batch),/Out-of-order/);
 now+=1000;assert.throws(()=>session.accept('owner',{sequence:1,actions:[{axis:[0,0],kills:1}]}),/Forged/);assert.equal(session.closed,true);
 const stale=new ActionSession({wallet:'owner',clock:()=>now,runtimeFactory:()=>({step:()=>assert.fail()})});now+=15001;
 assert.throws(()=>stale.accept('owner',batch),/disconnected/);
});
