export const OWNER='N8LgWo2TRgtwj8qvc7WcTapLx1XrunQrEssH82t8Wg6';
export function initializeSettings(t){
  t.db.exec(`CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY CHECK(id=1),budget INTEGER NOT NULL,prizes TEXT NOT NULL,revision INTEGER NOT NULL);
    INSERT OR IGNORE INTO settings VALUES(1,400000000,'[10000000,6000000,3000000]',1);
    CREATE TABLE IF NOT EXISTS round_prizes(round INTEGER PRIMARY KEY,prizes TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS admin_sessions(hash TEXT PRIMARY KEY,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS admin_audit(id INTEGER PRIMARY KEY,created INTEGER,actor TEXT,previous TEXT,next TEXT);`);
}
export function settings(t){const s=t.one('SELECT * FROM settings WHERE id=1');return {budget:s.budget,prizes:JSON.parse(s.prizes),revision:s.revision};}
export function committed(t){return t.one("SELECT COALESCE(SUM(amount),0) AS amount FROM payouts WHERE status NOT IN ('queued','empty')").amount;}
export function adminState(t){return {...settings(t),committed:committed(t),audit:t.all('SELECT created,actor,previous,next FROM admin_audit ORDER BY id DESC LIMIT 20')};}
export function updateSettings(t,data,actor){
  return t.atomic(()=>{
    const old=settings(t),{budget,prizes,revision}=data;
    if(revision!==old.revision)throw new Error('Settings changed. Refresh before saving.');
    if(!Number.isSafeInteger(budget)||budget<committed(t))throw new Error('Budget must cover all paid and reserved rewards.');
    if(!Array.isArray(prizes)||prizes.length!==3||prizes.some(p=>!Number.isSafeInteger(p)||p<0)||!Number.isSafeInteger(prizes.reduce((a,b)=>a+b,0))||prizes[0]<prizes[1]||prizes[1]<prizes[2])throw new Error('Enter three nonnegative prizes in descending order.');
    if(prizes.reduce((a,b)=>a+b,0)>budget)throw new Error('Round prizes exceed the total budget.');
    const next={budget,prizes,revision:revision+1};
    t.exec('UPDATE settings SET budget=?,prizes=?,revision=? WHERE id=1',budget,JSON.stringify(prizes),next.revision);
    t.exec('INSERT INTO admin_audit(created,actor,previous,next) VALUES(?,?,?,?)',t.clock(),actor,JSON.stringify(old),JSON.stringify(next));
    return next;
  });
}
