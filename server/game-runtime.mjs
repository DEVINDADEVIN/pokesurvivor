import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const files=['core/util','core/i18n','data/lang-en','data/music','data/pokedex','data/sprites-meta','core/sprites','core/camera','data/moves','data/types','data/starters','data/enemies','data/upgrades','data/items','world/tiles','world/world','entities/vfx','entities/fx','entities/projectile','entities/enemy','entities/pickup','entities/player','systems/combat','systems/spawner','systems/levelup','systems/interact','systems/rift','systems/events','systems/weather','systems/pathing','systems/hazards','game'];
const scripts=files.map(name=>{let source=readFileSync(resolve(root,'js',name+'.js'),'utf8');if(name==='game'){const marker='    debugTime(t)';if(!source.includes(marker))throw Error('Game runtime adapter requires review');source=source.replace(marker,"    authoritativeStep() { if (state === 'playing') update(1/30); },\n    debugTime(t)");}return new vm.Script(source,{filename:name+'.js'});});
const bootstrap=new vm.Script(`
window=globalThis;G={};let tick=0,rng=1,axis=[0,0],pending=null;
Math.random=()=>{rng=(rng+0x6D2B79F5)|0;let t=rng;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
performance={now:()=>tick*1000/30};
const noop=()=>{};
const canvasContext=new Proxy({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),getImageData:(x,y,w,h)=>({data:new Uint8ClampedArray(w*h*4)})},{get:(o,k)=>k in o?o[k]:noop});
const element=()=>({style:{},classList:{add:noop,remove:noop,contains:()=>false,toggle:noop},getContext:()=>canvasContext,appendChild:noop,addEventListener:noop});
document={documentElement:{},createElement:element,getElementById:element,querySelectorAll:()=>[],addEventListener:noop};
CanvasRenderingContext2D=class{};Image=class{set src(x){} };addEventListener=noop;removeEventListener=noop;requestAnimationFrame=noop;setTimeout=noop;clearTimeout=noop;
localStorage={getItem:()=>null,setItem:noop};
`);
const setup=new vm.Script(`
G.Settings={get:()=>false,fx:1};G.Audio={sfx:noop,music:noop};G.Touch={active:false,vector:()=>axis};
G.Input={axis:()=>axis,tap:()=>false,held:()=>false,mouse:()=>({x:0,y:0,down:false})};
G.Coop={active:false,isHost:false,scaleRate:()=>1,scaleHp:()=>1};G.UI={hideAll:noop,chrome:noop,isOpen:()=>false,toast:noop};
G.Progress={event:noop,kill:noop,checkAch:noop};G.Social={me:null};G.Ranking={submitSolo:noop};
G.RunUI={showLevelUp:(level,cards,cb)=>{pending={kind:'level',values:cards,cb};},showBond:(opt,cb)=>{pending={kind:'bond',values:opt,cb};},showItemChoice:(old,id,cb)=>{pending={kind:'item',values:[old,id],cb};},showOver:noop};
G.Sprites.preload=noop;
G.DB={save:{partner:25,stats:{runs:0,totalKills:0,bestTime:0,bestLevel:0,coinsEarned:0},coins:0,tickets:0,tickets10:0},upgradesOf:()=>({}),ownsShiny:()=>false,owns:()=>false,grant:noop,grantShiny:noop,commit:noop};
G.Camera.resize(768,432,1);
`);
const start=new vm.Script('if(!G.DEX_BY[config.partner])throw Error("Unknown partner");rng=config.seed>>>0;G.DB.save.partner=config.partner;G.Game.startRun();');
const step=new vm.Script(`
axis=action.axis;
if(action.slot!==undefined)G.Game.player.setActive(action.slot);
if(action.choice!==undefined){
 if(!pending||pending.kind==='bond'||action.choice>=pending.values.length)throw Error('Invalid choice');
 const p=pending;pending=null;p.cb(p.values[action.choice]);
}
G.Game.authoritativeStep();tick++;
result={seconds:G.Game.st.time,kills:G.Game.player.kills,hp:G.Game.player.hp,x:G.Game.player.x,y:G.Game.player.y,state:G.Game.state,choice:pending?pending.kind:null};
`);
/** Trusted game source only. Client messages never become executable code. */
export class GameRuntime{
 constructor({seed,partner=25}){
  if(!Number.isInteger(seed)||!Number.isInteger(partner))throw Error('Invalid run configuration');
  this.context=vm.createContext({}, {codeGeneration:{strings:false,wasm:false}});
  bootstrap.runInContext(this.context,{timeout:1000});for(const script of scripts)script.runInContext(this.context,{timeout:1000});setup.runInContext(this.context,{timeout:1000});
  this.context.config={seed,partner};start.runInContext(this.context,{timeout:1000});
 }
 step(action={axis:[0,0]}){
  if(!Array.isArray(action.axis)||action.axis.length!==2||action.axis.some(n=>!Number.isFinite(n)||Math.abs(n)>1)||Math.hypot(...action.axis)>1.001)throw Error('Invalid movement');
  if(action.slot!==undefined&&(!Number.isInteger(action.slot)||action.slot<0||action.slot>3))throw Error('Invalid move slot');
  if(action.choice!==undefined&&(!Number.isInteger(action.choice)||action.choice<0||action.choice>2))throw Error('Invalid upgrade choice');
  if(Object.keys(action).some(k=>!['axis','slot','choice'].includes(k)))throw Error('Only player actions are accepted');
  this.context.action=JSON.parse(JSON.stringify(action));step.runInContext(this.context,{timeout:3000});return JSON.parse(JSON.stringify(this.context.result));
 }
}





