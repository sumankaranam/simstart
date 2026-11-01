import {syncSlot,downloadHistory} from './data.mjs';
function response(body,status=200,seconds=300){return Response.json(body,{status,headers:{'Cache-Control':status===200?'public, max-age='+seconds:'no-store','X-Content-Type-Options':'nosniff'}});}
export default {
  async scheduled(controller,env,ctx){ctx.waitUntil(syncSlot(env.DB,controller.scheduledTime));},
  async fetch(request,env){
    const u=new URL(request.url);
    if(!['GET','HEAD'].includes(request.method))return response({error:'Method not allowed'},405);
    if(!u.pathname.startsWith('/api/'))return env.ASSETS.fetch(request);
    try{
      if(u.pathname==='/api/catalogue'){
        const rows=await env.DB.prepare('SELECT code,name,category,source,source_url,first_date,last_date,observation_count,fetched_at,checked_at,last_error FROM funds ORDER BY refresh_slot LIMIT 20').all();
        return response({funds:rows.results,storage:'D1',maximumFunds:20});
      }
      if(u.pathname==='/api/health'){
        const row=await env.DB.prepare('SELECT COUNT(*) AS funds,SUM(observation_count) AS observations FROM funds').first();
        return response({ok:true,database:'connected',...row},200,30);
      }
      if(u.pathname==='/api/search'){
        const q=(u.searchParams.get('q')||'').trim();
        if(q.length<3||q.length>120)return response({error:'Search requires 3–120 characters'},400);
        const result=await fetch('https://api.mfapi.in/mf/search?q='+encodeURIComponent(q),{signal:AbortSignal.timeout(15000)});
        if(!result.ok)throw Error('Search provider unavailable');
        const matches=await result.json();if(!Array.isArray(matches))throw Error('Unexpected search response');
        return response(matches.slice(0,100),200,3600);
      }
      if(/^\/api\/fund\/\d{1,9}$/.test(u.pathname)){
        const code=u.pathname.split('/').at(-1);
        const stored=await env.DB.prepare('SELECT history_json,fetched_at,checked_at,last_error,last_date FROM funds WHERE code=?').bind(code).first();
        if(stored?.history_json){
          const stale=!!stored.last_error||Date.now()-Date.parse(stored.checked_at||stored.fetched_at)>72*3600000||Date.now()-Date.parse(stored.last_date)>7*86400000;
          return response({...JSON.parse(stored.history_json),storage:{mode:'database',fetchedAt:stored.fetched_at,checkedAt:stored.checked_at,dataThrough:stored.last_date,stale,lastRefreshFailed:!!stored.last_error}},200,300);
        }
        // Public requests never create database entries or initiate stored-history writes.
        const live=await downloadHistory(code);
        return response({...live.snapshot,storage:{mode:'live',fetchedAt:new Date().toISOString(),dataThrough:live.last,stale:false}},200,3600);
      }
      return response({error:'Not found'},404);
    }catch(error){
      console.error('API failure',u.pathname,error.message);
      return response({error:'Data service temporarily unavailable. Stored data may still be available; try the fund library or CSV import.'},503);
    }
  }
};
