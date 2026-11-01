import {mkdir,writeFile} from 'node:fs/promises';
import {STARTER_CODES,downloadHistory} from '../data.mjs';
import {makeSeedInsert} from './seed-sql.mjs';
const statements=[],summary=[];
for(const [slot,code] of STARTER_CODES.entries()){
  const h=await downloadHistory(code),now=new Date().toISOString();
  // Use a bound-size-compatible 1-row import; bootstrap runs only through owner CLI.
  statements.push(...makeSeedInsert(code,slot,h,now));
  summary.push({code,name:h.snapshot.meta.scheme_name,observations:h.count,through:h.last,bytes:Buffer.byteLength(h.json)});
}
await mkdir('work',{recursive:true});await writeFile('work/seed.sql',statements.join('\n'));
await writeFile('work/seed-summary.json',JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary,null,2));
