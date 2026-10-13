import test from 'node:test';
import assert from 'node:assert/strict';
import {Tournament} from '../core.mjs';
import {devnetTest} from '../devnet-test.mjs';
test('diagnostic forbids mainnet and retries only persisted devnet bytes',async()=>{
 const t=new Tournament(':memory:');let prepared=0,sends=0,status='unknown';
 const adapter={prepare:async winners=>{prepared++;assert.deepEqual(winners,[{wallet:'treasury',lamports:1000000}]);return {raw:'same-bytes',signature:'sig',lastHeight:99};},status:async()=>status,height:async()=>1,broadcast:async raw=>{assert.equal(t.one('SELECT raw FROM devnet_test').raw,raw);sends++;if(sends===1)throw Error('timeout');}};
 await assert.rejects(devnetTest(t,{SOLANA_CLUSTER:'mainnet-beta'},async()=>{throw Error('must not load signer');})(),/devnet only/);
 const run=devnetTest(t,{SOLANA_CLUSTER:'devnet',TREASURY_WALLET:'treasury'},async()=>adapter);
 await assert.rejects(run(),/timeout/);assert.equal((await run()).status,'submitted');status='finalized';assert.equal((await run()).status,'finalized');await run();assert.equal(prepared,1);assert.equal(sends,2);t.db.close();
});
test('expired diagnostic never creates a replacement transaction',async()=>{
 const t=new Tournament(':memory:');const run=devnetTest(t,{SOLANA_CLUSTER:'devnet'},async()=>({prepare:async()=>({raw:'x',signature:'s',lastHeight:1}),status:async()=> 'unknown',height:async()=>2,broadcast:async()=>assert.fail('must not send')}));
 assert.equal((await run()).status,'review');assert.equal((await run()).status,'review');t.db.close();
});
