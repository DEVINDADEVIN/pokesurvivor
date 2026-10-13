import {randomBytes} from 'node:crypto';
import {GameRuntime} from './game-runtime.mjs';
// This component has no payout authority. Promotion requires client integration.
export class ActionSession {
 constructor({wallet,partner=25,clock=Date.now,runtimeFactory=config=>new GameRuntime(config)}){
  this.wallet=wallet;this.clock=clock;this.started=clock();this.last=this.started;this.frames=0;this.sequence=0;this.closed=false;
  this.runtime=runtimeFactory({seed:randomBytes(4).readUInt32LE(),partner});
 }
 accept(wallet,{sequence,actions}){
  if(wallet!==this.wallet)throw Error('Run belongs to another wallet');
  if(this.closed)throw Error('Run closed');
  if(sequence!==this.sequence)throw Error('Out-of-order action batch');
  if(!Array.isArray(actions)||actions.length<1||actions.length>30)throw Error('Send 1 to 30 actions');
  const now=this.clock();
  if(now-this.last>15000){this.closed=true;throw Error('Run disconnected');}
  if(this.frames+actions.length>Math.floor((now-this.started)*30/1000))throw Error('Actions exceed server elapsed time');
  try{
   let state;for(const action of actions)state=this.runtime.step(action);
   this.frames+=actions.length;this.sequence++;this.last=now;
   if(state.state==='over')this.closed=true;
   return {...state,sequence:this.sequence,frames:this.frames};
  }catch(error){this.closed=true;throw error;}
 }
}
