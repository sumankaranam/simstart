import {readFileSync} from 'node:fs';
import {runWrangler} from './cloudflare.mjs';
const config=JSON.parse(readFileSync('wrangler.jsonc','utf8'));
if(!config.d1_databases[0].database_id)throw Error('Create the free D1 database first: node scripts/cloudflare.mjs d1 create simstart-nav --binding DB --update-config. Verify the account is on Workers Free before deployment.');
if(runWrangler(['d1','migrations','apply','DB','--remote'])!==0)process.exit(1);
process.exitCode=runWrangler(['deploy']);
