import {spawnSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
// Keep OAuth state in ignored project-local storage, never in exported source.
export function runWrangler(args){
  const auth=path.resolve('.cloudflare-auth');mkdirSync(auth,{recursive:true});
  const result=spawnSync(process.execPath,[path.resolve('node_modules/wrangler/bin/wrangler.js'),...args],{
    stdio:'inherit',windowsHide:true,
    env:{...process.env,XDG_CONFIG_HOME:auth,WRANGLER_SEND_METRICS:'false',WRANGLER_LOG_PATH:path.resolve('work/wrangler.log')}
  });
  if(result.error)throw result.error;
  return result.status??1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve('scripts/cloudflare.mjs'))process.exitCode=runWrangler(process.argv.slice(2));
