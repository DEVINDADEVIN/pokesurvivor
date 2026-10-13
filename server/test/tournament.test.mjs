import test from 'node:test';
import assert from 'node:assert/strict';
import {Tournament,PERIOD,score} from '../core.mjs';
import {Payouts} from '../payouts.mjs';
function setup(){let now=PERIOD*100;const t=new Tournament(':memory:',()=>now);return{t,advance:n=>now+=n};}
function entry(t,advance,wallet,time=10,kills=5){const run=t.start(wallet,wallet);advance(time*1000);const result=t.heartbeat(wallet,{id:run.id,time,kills,end:true});return{...result,wallet};}
test('score and reset at the exact UTC boundary without ending the run',()=>{
  const {t,advance}=setup();assert.equal(score(300.9,50),800);
  advance(PERIOD-10000);const r=t.start('a','a');advance(5000);t.heartbeat('a',{id:r.id,time:5,kills:10});
  advance(5000);t.heartbeat('a',{id:r.id,time:10,kills:20});assert.equal(t.board().entries.length,0);
  advance(3000);t.heartbeat('a',{id:r.id,time:13,kills:22});assert.equal(t.board().entries[0].score,23);t.db.close();
});
test('unverified browser scores never create payout winners',()=>{const{t,advance}=setup();entry(t,advance,'a');advance(PERIOD);t.tick();const p=t.one('SELECT * FROM payouts');assert.equal(p.status,'empty');assert.equal(p.amount,0);t.db.close();});
test('verified top three receive exact lamports once; reset preserves history',()=>{
  const{t,advance}=setup();for(const [w,k]of[['a',10],['b',20],['c',30],['d',5]])t.verify(entry(t,advance,w,10,k));
  advance(PERIOD);t.tick();t.tick();const p=t.one('SELECT * FROM payouts WHERE round=100');
  assert.equal(p.amount,19000000);assert.deepEqual(JSON.parse(p.winners).map(w=>[w.wallet,w.lamports]),[['c',10000000],['b',6000000],['a',3000000]]);assert.equal(t.all('SELECT * FROM payouts').length,1);assert.equal(t.board().entries.length,0);t.db.close();
});
test('best run per wallet, ties favor survival then earlier time',()=>{const{t,advance}=setup();entry(t,advance,'a',20,1);entry(t,advance,'a',5,0);entry(t,advance,'b',10,2);entry(t,advance,'c',20,1);assert.deepEqual(t.board().entries.map(e=>e.wallet),['a','c','b']);t.db.close();});
test('closed rounds reject late attestations; stale hashes are rejected',()=>{const{t,advance}=setup();const r=t.start('a','a');advance(1000);const old=t.heartbeat('a',{id:r.id,time:1,kills:1});advance(1000);t.heartbeat('a',{id:r.id,time:2,kills:2});assert.throws(()=>t.verify({...old,wallet:'a'}),/Stale/);const current=t.board().entries[0];advance(PERIOD);assert.throws(()=>t.verify(current),/closed/);t.db.close();});
test('counter forgery, duplicate active runs and wallet mismatch rejected',()=>{const{t,advance}=setup();const r=t.start('a','a');assert.throws(()=>t.start('a','a'),/active/);advance(1000);assert.throws(()=>t.heartbeat('a',{id:r.id,time:500,kills:10}),/exceeds/);assert.throws(()=>t.heartbeat('b',{id:r.id,time:1,kills:1}),/active/);assert.throws(()=>t.heartbeat('a',{id:r.id,time:1,kills:-1}),/Invalid/);t.db.close();});
test('one qualifying player receives only first prize',()=>{const{t,advance}=setup();t.verify(entry(t,advance,'a'));advance(PERIOD);t.tick();assert.equal(t.one('SELECT amount FROM payouts').amount,10000000);t.db.close();});
test('automatic payout persists signed bytes before send; timeout retry cannot double-pay',async()=>{
  const{t,advance}=setup();t.verify(entry(t,advance,'a'));advance(PERIOD);
  let prepares=0,sends=0,final=false;const adapter={prepare:async()=>{prepares++;return{raw:'same-bytes',signature:'same-sig',lastHeight:100};},status:async()=>final?'finalized':'unknown',height:async()=>50,broadcast:async raw=>{assert.equal(t.one('SELECT raw FROM payouts').raw,raw);sends++;if(sends===1)throw new Error('timeout');}};
  const p=new Payouts(t,adapter,{enabled:true});await p.tick();await p.tick();assert.equal(prepares,1);assert.equal(sends,2);final=true;await p.tick();await p.tick();assert.equal(t.one('SELECT status FROM payouts').status,'paid');assert.equal(sends,2);t.db.close();
});
test('expired unknown transactions are held; never re-signed',async()=>{const{t,advance}=setup();t.verify(entry(t,advance,'a'));advance(PERIOD);let sent=0;const p=new Payouts(t,{prepare:async()=>({raw:'x',signature:'s',lastHeight:10}),status:async()=>'unknown',height:async()=>11,broadcast:async()=>sent++},{enabled:true});await p.tick();await p.tick();assert.equal(t.one('SELECT status FROM payouts').status,'review');assert.equal(sent,0);t.db.close();});
test('disabled payouts and daily cap prevent signing',async()=>{const{t,advance}=setup();t.verify(entry(t,advance,'a'));advance(PERIOD);let signed=0;const adapter={prepare:async()=>signed++};await new Payouts(t,adapter).tick();await new Payouts(t,adapter,{enabled:true,dailyCap:1}).tick();assert.equal(signed,0);t.db.close();});
test('durable rounds survive process restart',async()=>{
  const {mkdtempSync,rmSync}=await import('node:fs');const{tmpdir}=await import('node:os');const{join}=await import('node:path');
  const dir=mkdtempSync(join(tmpdir(),'pse-test-')),file=join(dir,'db.sqlite');let time=PERIOD*100;
  let t=new Tournament(file,()=>time);const r=t.start('a','a');time+=10000;const e=t.heartbeat('a',{id:r.id,time:10,kills:3});t.verify({...e,wallet:'a'});t.db.close();time+=PERIOD;
  t=new Tournament(file,()=>time);t.tick();assert.equal(t.one('SELECT amount FROM payouts').amount,10000000);t.db.close();rmSync(dir,{recursive:true});
});
