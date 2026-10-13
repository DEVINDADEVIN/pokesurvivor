import {solanaAdapter} from './payouts.mjs';
// One durable self-transfer diagnostic. Never create a replacement automatically.
export function devnetTest(t,env,makeAdapter=solanaAdapter){
 t.exec("CREATE TABLE IF NOT EXISTS devnet_test (id INTEGER PRIMARY KEY CHECK(id=1),status TEXT,raw TEXT,signature TEXT,lastHeight INTEGER)");
 let busy=false;
 return async()=>{
  if(env.SOLANA_CLUSTER!=='devnet')throw Error('This diagnostic is devnet only');
  if(busy)throw Error('Test in progress; check again shortly');
  busy=true;
  try{
   const adapter=await makeAdapter(env);
   let row=t.one('SELECT * FROM devnet_test WHERE id=1');
   if(!row){
    t.exec("INSERT INTO devnet_test(id,status) VALUES(1,'preparing')");
    const p=await adapter.prepare([{wallet:env.TREASURY_WALLET,lamports:1000000}]);
    t.exec("UPDATE devnet_test SET status='signed',raw=?,signature=?,lastHeight=? WHERE id=1",p.raw,p.signature,p.lastHeight);
    row=t.one('SELECT * FROM devnet_test WHERE id=1');
   }
   if(row.signature&&!['finalized','failed','review'].includes(row.status)){
    const status=await adapter.status(row.signature);
    if(status==='finalized'||status==='failed')t.exec('UPDATE devnet_test SET status=? WHERE id=1',status);
    else if(status!=='confirmed'){
     if(await adapter.height()>row.lastHeight)t.exec("UPDATE devnet_test SET status='review' WHERE id=1");
     else {await adapter.broadcast(row.raw);t.exec("UPDATE devnet_test SET status='submitted' WHERE id=1");}
    }
   }
   const result=t.one('SELECT status,signature FROM devnet_test WHERE id=1');
   return {...result,cluster:'devnet',lamports:1000000,recipient:env.TREASURY_WALLET};
  }finally{busy=false;}
 };
}
