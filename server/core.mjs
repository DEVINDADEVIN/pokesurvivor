import { DatabaseSync } from 'node:sqlite';
import { randomUUID, createHash } from 'node:crypto';
export const PERIOD=600000, PRIZES=[10000000,6000000,3000000];
export const roundAt=now=>Math.floor(now/PERIOD);
export const score=(seconds,kills)=>Math.floor(seconds)+kills*10;
export const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export class Tournament {
  constructor(file='tournament.sqlite',clock=Date.now){
    this.clock=clock;this.db=new DatabaseSync(file);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS rounds(id INTEGER PRIMARY KEY, status TEXT NOT NULL DEFAULT 'open');
      CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY,wallet TEXT NOT NULL,name TEXT NOT NULL,started INTEGER,last INTEGER,time REAL DEFAULT 0,kills INTEGER DEFAULT 0,round INTEGER,baseTime REAL DEFAULT 0,baseKills INTEGER DEFAULT 0,ended INTEGER DEFAULT 0);
      CREATE TABLE IF NOT EXISTS entries(round INTEGER,wallet TEXT,name TEXT,run TEXT,seconds INTEGER,kills INTEGER,score INTEGER,achievedAt INTEGER,hash TEXT,status TEXT DEFAULT 'provisional',PRIMARY KEY(round,wallet));
      CREATE TABLE IF NOT EXISTS verified(round INTEGER,wallet TEXT,name TEXT,run TEXT,seconds INTEGER,kills INTEGER,score INTEGER,achievedAt INTEGER,hash TEXT,status TEXT DEFAULT 'verified',PRIMARY KEY(round,wallet));
      CREATE TABLE IF NOT EXISTS payouts(round INTEGER PRIMARY KEY,status TEXT NOT NULL,winners TEXT NOT NULL,amount INTEGER NOT NULL,signature TEXT,raw TEXT,lastHeight INTEGER,error TEXT,day INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS challenges(id TEXT PRIMARY KEY,wallet TEXT,message TEXT,expires INTEGER);
      CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,wallet TEXT,expires INTEGER);`);
  }
  all(sql,...args){return this.db.prepare(sql).all(...args);}
  one(sql,...args){return this.db.prepare(sql).get(...args);}
  exec(sql,...args){return this.db.prepare(sql).run(...args);}
  atomic(fn){this.db.exec('BEGIN IMMEDIATE');try{const r=fn();this.db.exec('COMMIT');return r;}catch(e){this.db.exec('ROLLBACK');throw e;}}
  tick(){
    const now=this.clock(),round=roundAt(now);
    this.atomic(()=>{
      this.exec('INSERT OR IGNORE INTO rounds(id) VALUES(?)',round);
      for(const r of this.all("SELECT id FROM rounds WHERE status='open' AND id<?",round)){
        const winners=this.all('SELECT * FROM verified WHERE round=? ORDER BY score DESC,seconds DESC,achievedAt ASC,wallet ASC LIMIT 3',r.id).map((e,i)=>({...e,lamports:PRIZES[i]}));
        this.exec("INSERT OR IGNORE INTO payouts(round,status,winners,amount,day) VALUES(?,?,?,?,?)",r.id,winners.length?'queued':'empty',JSON.stringify(winners),winners.reduce((s,w)=>s+w.lamports,0),Math.floor(now/86400000));
        this.exec("UPDATE rounds SET status='closed' WHERE id=?",r.id);
      }
      this.exec('DELETE FROM challenges WHERE expires<?',now);
      this.exec('DELETE FROM sessions WHERE expires<?',now);
    });
    return round;
  }
  start(wallet,name){
    const now=this.clock(),round=this.tick();
    if(this.one('SELECT id FROM runs WHERE wallet=? AND ended=0 AND last>?',wallet,now-30000))throw new Error('A run is already active for this wallet');
    this.exec('UPDATE runs SET ended=1 WHERE wallet=? AND ended=0',wallet);
    const id=randomUUID();this.exec('INSERT INTO runs(id,wallet,name,started,last,round) VALUES(?,?,?,?,?,?)',id,wallet,String(name||'Player').slice(0,24),now,now,round);return{id,round};
  }
  heartbeat(wallet,{id,time,kills,end=false}){
    this.tick();const now=this.clock(),round=roundAt(now);
    return this.atomic(()=>{
      const r=this.one('SELECT * FROM runs WHERE id=? AND wallet=?',id,wallet);
      if(!r||r.ended)throw new Error('Run is not active');
      if(!Number.isFinite(time)||time<r.time||!Number.isSafeInteger(kills)||kills<r.kills||kills>10000000)throw new Error('Invalid counters');
      const gap=(now-r.last)/1000;
      if(gap>30){this.exec('UPDATE runs SET ended=1 WHERE id=?',id);throw new Error('Connection interrupted; start a new ranked run');}
      if(time-r.time>gap+1||time>(now-r.started)/1000+1)throw new Error('Survival time exceeds server elapsed time');
      // Counters are only plausibility-checked, NOT trusted proof of gameplay.
      // Drop the boundary-spanning observation rather than credit old-round kills.
      const baseTime=round===r.round?r.baseTime:time,baseKills=round===r.round?r.baseKills:kills;
      this.exec('UPDATE runs SET time=?,kills=?,last=?,round=?,baseTime=?,baseKills=?,ended=? WHERE id=?',time,kills,now,round,baseTime,baseKills,end?1:0,id);
      const seconds=Math.floor(time-baseTime),n=kills-baseKills;
      if(seconds===0&&n===0)return{round};
      const entry={round,wallet,name:r.name,run:id,seconds,kills:n,score:score(seconds,n),achievedAt:now};
      const hash=digest(entry),old=this.one('SELECT * FROM entries WHERE round=? AND wallet=?',round,wallet);
      if(!old||entry.score>old.score||(entry.score===old.score&&seconds>old.seconds)){
        this.exec("INSERT OR REPLACE INTO entries(round,wallet,name,run,seconds,kills,score,achievedAt,hash,status) VALUES(?,?,?,?,?,?,?,?,?,'provisional')",round,wallet,r.name,id,seconds,n,entry.score,now,hash);
      }
      return{round,hash};
    });
  }
  verify({round,wallet,hash}){
    this.tick();
    return this.atomic(()=>{
      if(round!==roundAt(this.clock()))throw new Error('Round already closed');
      const e=this.one('SELECT * FROM entries WHERE round=? AND wallet=? AND hash=?',round,wallet,hash);
      if(!e)throw new Error('Stale or unknown score attestation');
      this.exec("INSERT OR REPLACE INTO verified SELECT round,wallet,name,run,seconds,kills,score,achievedAt,hash,'verified' FROM entries WHERE round=? AND wallet=?",round,wallet);
      this.exec("UPDATE entries SET status='verified' WHERE round=? AND wallet=?",round,wallet);return{verified:true};
    });
  }
  board(){const round=this.tick();return{serverTime:this.clock(),round,prizes:PRIZES,entries:this.all('SELECT * FROM entries WHERE round=? ORDER BY score DESC,seconds DESC,achievedAt ASC,wallet ASC LIMIT 100',round),history:this.all('SELECT * FROM payouts ORDER BY round DESC LIMIT 20').map(p=>({round:p.round,status:p.status,signature:p.signature,entries:JSON.parse(p.winners)}))};}
}
