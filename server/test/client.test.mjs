import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
test('practice gameplay hooks record scores, reset segments and exclude co-op',()=>{
  let now=600000*100;const data=new Map();let timer;
  const context={G:{DB:{guest:false,user:'Alice',save:{}}},Date:{now:()=>now},Math,JSON,String,Array,crypto:{randomUUID},localStorage:{getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)},setInterval:fn=>timer=fn};
  vm.runInNewContext(readFileSync(new URL('../../js/tournament.js',import.meta.url),'utf8'),context);
  const api=context.G.Tournament,board=()=>JSON.parse([...data.values()][0]);
  api.start(false);now+=10000;api.sample(10,5);assert.equal(board().entries[0].score,60);
  now=600000*101;timer();assert.equal(board().entries.length,0);assert.equal(board().history[0].entries[0].score,60);
  now+=3000;api.sample(13,7);assert.equal(board().entries[0].score,23);api.finish(13,7);
  api.start(true);now+=3000;api.sample(50,500);assert.equal(board().entries[0].score,23);
});
