export const STARTER_CODES=['120716','143341','153089','120594','120621'];
export function validateHistory(input,code){
  if(String(input?.meta?.scheme_code)!==String(code))throw Error('Provider returned the wrong scheme');
  if(!Array.isArray(input.data)||input.data.length<2||input.data.length>25000)throw Error('Invalid history length');
  if(!/growth/i.test(input.meta.scheme_name)||/IDCW|dividend/i.test(input.meta.scheme_name))throw Error('Only growth-option history is supported');
  const seen=new Set();
  const data=input.data.map(row=>{
    if(!/^\d{2}-\d{2}-\d{4}$/.test(row.date))throw Error('Invalid date format');
    const iso=row.date.split('-').reverse().join('-'),d=new Date(iso+'T00:00:00Z');
    if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==iso||seen.has(iso))throw Error('Invalid or duplicate date');
    if(!Number.isFinite(Number(row.nav))||Number(row.nav)<=0)throw Error('Invalid NAV');
    seen.add(iso);return {date:row.date,nav:String(row.nav)};
  }).sort((a,b)=>b.date.split('-').reverse().join('-').localeCompare(a.date.split('-').reverse().join('-')));
  const snapshot={meta:input.meta,data,status:'SUCCESS'},json=JSON.stringify(snapshot);
  if(new TextEncoder().encode(json).length>1000000)throw Error('History exceeds the 1 MB free-tier storage cap');
  return {snapshot,json,first:data.at(-1).date.split('-').reverse().join('-'),last:data[0].date.split('-').reverse().join('-'),count:data.length};
}
export async function downloadHistory(code,fetcher=fetch){
  const r=await fetcher('https://api.mfapi.in/mf/'+code,{signal:AbortSignal.timeout(15000),headers:{Accept:'application/json'}});
  if(!r.ok)throw Error('Provider HTTP '+r.status);
  return validateHistory(await r.json(),code);
}
export async function syncFund(db,code,fetcher=fetch,now=new Date()){
  const at=now.toISOString();
  const old=await db.prepare('SELECT history_json,last_date,observation_count FROM funds WHERE code=?').bind(code).first();
  if(!old)throw Error('Scheme is not in the managed catalogue');
  try{
    const h=await downloadHistory(code,fetcher);
    if(old.last_date&&h.last<old.last_date)throw Error('Provider history is older than the stored snapshot');
    if(old.observation_count&&h.count<old.observation_count*.95)throw Error('Provider history unexpectedly lost observations');
    const statements=[];
    if(h.json!==old.history_json)statements.push(db.prepare('UPDATE funds SET name=?, category=?, history_json=?,first_date=?,last_date=?,observation_count=?,fetched_at=?,checked_at=?,last_error=NULL WHERE code=?').bind(h.snapshot.meta.scheme_name,h.snapshot.meta.scheme_category||'',h.json,h.first,h.last,h.count,at,at,code));
    else statements.push(db.prepare('UPDATE funds SET checked_at=?,last_error=NULL WHERE code=?').bind(at,code));
    statements.push(db.prepare('INSERT INTO sync_events(code,checked_at,outcome,details) VALUES(?,?,?,?)').bind(code,at,'ok',h.json===old.history_json?'Unchanged':'Snapshot updated'));
    await db.batch(statements);return {code,ok:true,count:h.count,last:h.last};
  }catch(error){
    const message=String(error.message).slice(0,200);
    await db.batch([db.prepare('UPDATE funds SET checked_at=?,last_error=? WHERE code=?').bind(at,message,code),db.prepare('INSERT INTO sync_events(code,checked_at,outcome,details) VALUES(?,?,?,?)').bind(code,at,'error',message)]);
    return {code,ok:false,error:message};
  }
}
export async function syncSlot(db,time,fetcher=fetch){
  const now=new Date(time),slot=now.getUTCHours();
  const fund=await db.prepare('SELECT code FROM funds WHERE refresh_slot=?').bind(slot).first();
  if(!fund)return {skipped:true};
  const result=await syncFund(db,fund.code,fetcher,now);
  await db.prepare('DELETE FROM sync_events WHERE checked_at < ?').bind(new Date(time-30*86400000).toISOString()).run();
  return result;
}
