import {loadSigner} from './signer.mjs';
export function readiness(env,owner,test=null){
 const treasury=env.TREASURY_WALLET||owner;
 let signer='missing';
 if(env.SOLANA_PRIVATE_KEY||env.SOLANA_KEYPAIR_FILE){
  try{const key=loadSigner({...env,TREASURY_WALLET:treasury});signer='configured';key.secretKey.fill(0);}catch{signer='invalid';}
 }
 return {treasury,signer,cluster:env.SOLANA_CLUSTER||'not configured',rpcConfigured:Boolean(env.SOLANA_RPC_URL),
  devnetTransfer:{status:test?.status||'not started',signature:test?.signature||null},
  gameplayVerification:'not implemented',realPaymentsReady:false,
  message:(test?.status==='finalized'?'Devnet self-transfer confirmed. ':'Devnet self-transfer is not yet finalized. ')+'Real rewards remain disabled: server-side gameplay verification and an end-to-end three-winner devnet payout are still required.'};
}
