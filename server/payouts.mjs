import {settings,committed} from './admin.mjs';
import {Connection,PublicKey,SystemProgram,Transaction} from '@solana/web3.js';
import bs58 from 'bs58';
import {loadSigner} from './signer.mjs';
// The signed transaction is durably stored BEFORE broadcasting. A retry always
// uses the identical bytes/signature. Ambiguous expiry requires reconciliation,
// never an automatic replacement transfer that might pay a winner twice.
export class Payouts {
  constructor(tournament,adapter=null,options={}){this.t=tournament;this.adapter=adapter;this.enabled=options.enabled===true;this.cap=options.dailyCap??2736000000;this.busy=false;}
  async tick(){
    this.t.tick();if(!this.enabled||!this.adapter||this.busy)return;this.busy=true;
    try{
      for(const item of this.t.all("SELECT * FROM payouts WHERE status IN ('queued','signed','submitted') ORDER BY round LIMIT 20")){
        try{await this.process(item);}catch(e){this.t.exec('UPDATE payouts SET error=? WHERE round=?',String(e.message).slice(0,160),item.round);}
      }
    }finally{this.busy=false;}
  }
  async process(item){
    const t=this.t;
    if(item.status==='queued'){
      const claimed=t.atomic(()=>{
        const current=t.one('SELECT * FROM payouts WHERE round=?',item.round);
        if(current.status!=='queued')return false;
        const day=Math.floor(t.clock()/86400000);
        const spent=t.one("SELECT COALESCE(SUM(amount),0) AS amount FROM payouts WHERE day=? AND status NOT IN ('queued','empty')",day).amount;
        if(spent+item.amount>this.cap||committed(t)+current.amount>settings(t).budget){t.exec("UPDATE payouts SET error=? WHERE round=?","Budget limit reached; awaiting administrator adjustment",item.round);return false;}
        t.exec("UPDATE payouts SET status='preparing',day=? WHERE round=?",day,item.round);return true;
      });
      if(!claimed)return;
      // Any crash/failure during preparation remains held for operator review.
      // No automatic reset to queued because a signing service may have side effects.
      const prepared=await this.adapter.prepare(JSON.parse(item.winners));
      if(!prepared.raw||!prepared.signature||!Number.isSafeInteger(prepared.lastHeight))throw new Error('Invalid prepared transaction');
      t.exec("UPDATE payouts SET status='signed',raw=?,signature=?,lastHeight=?,error=NULL WHERE round=?",prepared.raw,prepared.signature,prepared.lastHeight,item.round);
      item=t.one('SELECT * FROM payouts WHERE round=?',item.round);
    }
    const state=await this.adapter.status(item.signature);
    if(state==='finalized'){t.exec("UPDATE payouts SET status='paid',error=NULL WHERE round=?",item.round);return;}
    if(state==='failed'){t.exec("UPDATE payouts SET status='failed',error='Transaction failed; operator review required' WHERE round=?",item.round);return;}
    if(state==='confirmed')return;
    if(await this.adapter.height()>item.lastHeight){t.exec("UPDATE payouts SET status='review',error='Expired or unknown; reconcile signature before any retry' WHERE round=?",item.round);return;}
    await this.adapter.broadcast(item.raw);
    t.exec("UPDATE payouts SET status='submitted',error=NULL WHERE round=?",item.round);
  }
}
export async function solanaAdapter(env){
  if(!['devnet','mainnet-beta'].includes(env.SOLANA_CLUSTER))throw new Error('Set SOLANA_CLUSTER explicitly');
  if(!env.SOLANA_RPC_URL)throw new Error('Server RPC URL required');
  const connection=new Connection(env.SOLANA_RPC_URL,'finalized');
  const genesis=await connection.getGenesisHash();
  const expected=env.SOLANA_CLUSTER==='devnet'?'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG':'5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
  if(genesis!==expected)throw new Error('RPC cluster does not match configuration');
  if(env.SOLANA_CLUSTER==='mainnet-beta'&&env.MAINNET_PAYMENTS_ENABLED!=='true')throw new Error('Mainnet payouts are disabled');
  const key=loadSigner(env);
  return{
    async prepare(winners){
      const {blockhash,lastValidBlockHeight}=await connection.getLatestBlockhash('finalized');
      const tx=new Transaction({feePayer:key.publicKey,recentBlockhash:blockhash});
      for(const w of winners)tx.add(SystemProgram.transfer({fromPubkey:key.publicKey,toPubkey:new PublicKey(w.wallet),lamports:w.lamports}));
      const fee=await connection.getFeeForMessage(tx.compileMessage(),'finalized');
      if(fee.value==null||await connection.getBalance(key.publicKey,'finalized')<winners.reduce((s,w)=>s+w.lamports,0)+fee.value)throw new Error('Insufficient treasury balance; round held for review');
      tx.sign(key);return{raw:tx.serialize().toString('base64'),signature:bs58.encode(tx.signature),lastHeight:lastValidBlockHeight};
    },
    async status(signature){const s=(await connection.getSignatureStatuses([signature],{searchTransactionHistory:true})).value[0];return s?.err?'failed':s?.confirmationStatus||'unknown';},
    height:()=>connection.getBlockHeight('finalized'),
    broadcast:raw=>connection.sendRawTransaction(Buffer.from(raw,'base64'),{skipPreflight:false,maxRetries:3})
  };
}
