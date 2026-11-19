export const EVENTS=['visit','parameters_changed','kit_offer','free_selection','more_variants','previous_variant','copy_calculation','print','requirements_email_open','kit_email_open'];
const ORIGIN='https://datts-light-calculator.datts-vk-226271074.workers.dev';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const START_DAY='2026-11-19';
export const dayOf = (now=Date.now()) => new Date(now+10800000).toISOString().slice(0,10);
export function validEvent(e) {
  return e && typeof e==='object' && !Array.isArray(e) && Object.keys(e).sort().join(',')==='id,name,sid,vid' &&
    ['id','vid','sid'].every(k=>typeof e[k]==='string' && UUID.test(e[k])) && EVENTS.includes(e.name);
}
export const SCHEMA=`CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY, day TEXT NOT NULL, vid TEXT NOT NULL, sid TEXT NOT NULL, name TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS event_day ON events(day);
CREATE INDEX IF NOT EXISTS event_session ON events(sid,day);
CREATE TABLE IF NOT EXISTS reports(day TEXT PRIMARY KEY, data TEXT NOT NULL);`;
export async function report(db,day) {
  const fields=["COUNT(DISTINCT sid) AS visits","COUNT(DISTINCT vid) AS visitors",
    ...EVENTS.filter(n=>n!=='visit').flatMap(n=>[
      `COUNT(DISTINCT CASE WHEN name='${n}' THEN vid END) AS ${n}_users`,
      `SUM(CASE WHEN name='${n}' THEN 1 ELSE 0 END) AS ${n}_clicks`])];
  const r=await db.prepare(`SELECT ${fields.join(',')} FROM events WHERE day=?`).bind(day).first();
  return {day,...Object.fromEntries(Object.entries(r).map(([k,v])=>[k,v||0]))};
}
async function archive(db) {
  for(let i=1;i<=7;i++) {
    const day=dayOf(Date.now()-86400000*i);
    if(day<START_DAY)continue;
    const data=await report(db,day);
    await db.prepare('INSERT INTO reports(day,data) VALUES(?,?) ON CONFLICT(day) DO UPDATE SET data=excluded.data').bind(day,JSON.stringify(data)).run();
  }
  await db.prepare('DELETE FROM events WHERE day<?').bind(dayOf(Date.now()-90*86400000)).run();
}
const authCache=new Map();
async function authorized(request) {
  const token=request.headers.get('Authorization')?.replace(/^Bearer /,'');
  if (!token || token.length>5000) return false;
  if ((authCache.get(token)||0)>Date.now()) return true;
  const r=await fetch('https://oauth2.googleapis.com/tokeninfo?id_token='+encodeURIComponent(token));
  if(!r.ok)return false;
  const p=await r.json();
  const ok=p.email==='jfdjbdy.com@gmail.com' && String(p.email_verified)==='true' && Number(p.exp)*1000>Date.now() && ['https://accounts.google.com','accounts.google.com'].includes(p.iss);
  if(ok) {if(authCache.size>10)authCache.clear();authCache.set(token,Math.min(Number(p.exp)*1000,Date.now()+300000));}
  return ok;
}
export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    const cors={'Access-Control-Allow-Origin':ORIGIN,'Vary':'Origin','Cache-Control':'no-store'};
    if(url.pathname==='/events') {
      if(request.headers.get('Origin')!==ORIGIN)return new Response('Forbidden',{status:403});
      if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...cors,'Access-Control-Allow-Methods':'POST','Access-Control-Allow-Headers':'Content-Type'}});
      if(request.method!=='POST')return new Response('Method not allowed',{status:405,headers:cors});
      if(Number(request.headers.get('Content-Length'))>12000)return new Response('Too large',{status:413,headers:cors});
      const text=await request.text();
      if(text.length>12000)return new Response('Too large',{status:413,headers:cors});
      let items;try{items=JSON.parse(text);}catch{return new Response('Invalid JSON',{status:400,headers:cors});}
      if(!Array.isArray(items)||!items.length||items.length>30||!items.every(validEvent))return new Response('Invalid events',{status:400,headers:cors});
      const day=dayOf();
      await env.STATS.batch(items.map(e=>env.STATS.prepare(`INSERT OR IGNORE INTO events(id,day,vid,sid,name)
        SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM events WHERE sid=? AND day=?)<2000`)
        .bind(e.id,day,e.vid,e.sid,e.name,e.sid,day)));
      return new Response(null,{status:204,headers:cors});
    }
    if(url.pathname==='/reports' && request.method==='GET') {
      if(!await authorized(request))return new Response('Unauthorized',{status:401});
      const reports=[];
      for(let i=7;i>=1;i--) {
        const day=dayOf(Date.now()-86400000*i);
        if(day<START_DAY)continue;
        const saved=await env.STATS.prepare('SELECT data FROM reports WHERE day=?').bind(day).first();
        reports.push(saved ? JSON.parse(saved.data) : await report(env.STATS,day));
      }
      return Response.json({timezone:'Europe/Moscow',reports},{headers:{'Cache-Control':'no-store'}});
    }
    return new Response('Not found',{status:404});
  },
  scheduled(event,env,ctx) {ctx.waitUntil(archive(env.STATS));}
};
