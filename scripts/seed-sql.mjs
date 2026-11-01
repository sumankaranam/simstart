const quote=x=>"'"+String(x??'').replaceAll("'","''")+"'";
export function makeSeedInsert(code,slot,h,now){
  const statements=['INSERT INTO funds(code,name,category,refresh_slot,source_url,history_json,first_date,last_date,observation_count,fetched_at,checked_at) VALUES('+[quote(code),quote(h.snapshot.meta.scheme_name),quote(h.snapshot.meta.scheme_category||''),slot,quote('https://api.mfapi.in/mf/'+code),quote(''),quote(h.first),quote(h.last),h.count,quote(now),quote(now)].join(',')+') ON CONFLICT(code) DO NOTHING;'];
  for(let i=0;i<h.json.length;i+=20000)statements.push('UPDATE funds SET history_json=history_json || '+quote(h.json.slice(i,i+20000))+' WHERE code='+quote(code)+' AND fetched_at='+quote(now)+' AND length(history_json)='+i+';');
  return statements;
}
