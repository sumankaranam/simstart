import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {validateHistory,syncFund,syncSlot} from '../data.mjs';
import app from '../worker.mjs';
import {makeSeedInsert} from '../scripts/seed-sql.mjs';
const sample={meta:{scheme_code:120716,scheme_name:'Test Direct Growth',scheme_category:'Equity'},data:[{date:'01-11-2026',nav:'100'},{date:'30-10-2026',nav:'99'}]};
function database(){
  const sql=new DatabaseSync(':memory:');sql.exec(readFileSync('migrations/0001_nav.sql','utf8'));
  sql.prepare('INSERT INTO funds(code,name,refresh_slot,source_url) VALUES(?,?,?,?)').run('120716','Test',0,'https://api.mfapi.in/mf/120716');
  const db={prepare(query){let params=[];const stmt=sql.prepare(query);return {bind(...p){params=p;return this},async first(){return stmt.get(...params)||null},async all(){return {results:stmt.all(...params)}},async run(){return stmt.run(...params)}}},async batch(statements){sql.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}};
  return {db,sql};
}
test('history validates dates, duplicates, prices, scheme identity and growth option',()=>{
  assert.equal(validateHistory(sample,'120716').count,2);
  assert.throws(()=>validateHistory(sample,'1'),/wrong scheme/);
  assert.throws(()=>validateHistory({...sample,data:[...sample.data,sample.data[0]]},'120716'),/duplicate/);
  assert.throws(()=>validateHistory({...sample,data:[{date:'30-02-2026',nav:'100'},sample.data[1]]},'120716'),/Invalid/);
  assert.throws(()=>validateHistory({...sample,meta:{...sample.meta,scheme_name:'Dividend IDCW'}},'120716'),/growth/);
});
test('successful sync persists history and stale failures preserve it',async()=>{
  const {db,sql}=database();const good=async()=>Response.json(sample);
  const first=await syncFund(db,'120716',good,new Date('2026-11-01T00:00:00Z'));assert.equal(first.ok,true);
  const before=sql.prepare('SELECT history_json FROM funds').get().history_json;
  const failed=await syncFund(db,'120716',async()=>{throw Error('Provider offline')},new Date('2026-11-02T00:00:00Z'));assert.equal(failed.ok,false);
  assert.equal(sql.prepare('SELECT history_json FROM funds').get().history_json,before);
  const response=await app.fetch(new Request('https://app.test/api/fund/120716'),{DB:db});
  assert.equal(response.status,200);const body=await response.json();assert.equal(body.storage.mode,'database');assert.equal(body.storage.stale,true);assert.equal(body.data.length,2);
  sql.close();
});
test('older provider snapshot cannot replace newer stored data',async()=>{
  const {db,sql}=database();await syncFund(db,'120716',async()=>Response.json(sample));
  const older={...sample,data:[{date:'29-10-2026',nav:'99'},{date:'28-10-2026',nav:'98'}]};
  const result=await syncFund(db,'120716',async()=>Response.json(older));assert.equal(result.ok,false);assert.match(result.error,/older/);sql.close();
});
test('scheduler refreshes only assigned slot and catalogue omits raw history',async()=>{
  const {db,sql}=database();let calls=0;const f=async()=>{calls++;return Response.json(sample)};
  await syncSlot(db,Date.parse('2026-11-01T01:00:00Z'),f);assert.equal(calls,0);
  await syncSlot(db,Date.parse('2026-11-01T00:00:00Z'),f);assert.equal(calls,1);
  const res=await app.fetch(new Request('https://app.test/api/catalogue'),{DB:db});const body=await res.json();assert.equal(body.funds.length,1);assert.equal(body.funds[0].history_json,undefined);
  assert.throws(()=>sql.prepare('INSERT INTO funds(code,name,refresh_slot,source_url) VALUES(?,?,?,?)').run('2','x',20,'x'),/CHECK/);sql.close();
});
test('seed SQL stays within D1 statement size and reconstructs valid JSON',()=>{
  const statements=[];for(let slot=0;slot<5;slot++){const code=String(120716+slot),h=validateHistory({...sample,meta:{...sample.meta,scheme_code:code,description:'x'.repeat(120000)}},code);statements.push(...makeSeedInsert(code,slot,h,'2026-11-01T00:00:00Z'));}
  const seed=statements.join('\n');const db=new DatabaseSync(':memory:');db.exec(readFileSync('migrations/0001_nav.sql','utf8'));db.exec(seed);
  const rows=db.prepare('SELECT history_json,observation_count FROM funds').all();assert.equal(rows.length,5);for(const row of rows)assert.equal(JSON.parse(row.history_json).data.length,row.observation_count);
  // All source NAV strings and names are single-line; generator emits one statement per line.
  for(const line of seed.split('\n'))assert.ok(Buffer.byteLength(line)<100000);
  db.exec(seed);assert.equal(db.prepare('SELECT count(*) AS n FROM funds').get().n,5);for(const row of db.prepare('SELECT history_json,observation_count FROM funds').all())assert.equal(JSON.parse(row.history_json).data.length,row.observation_count);db.close();
});
