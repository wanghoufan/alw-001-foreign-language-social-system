#!/usr/bin/env node
/**
 * Safe public-only static Hainan share package.
 * Includes ONLY HTML, CSS, public controller and public Hainan data.
 * Does not include data.js, story-seeds, people, audio, tokens or sessions.
 */
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const out=path.join(__dirname,'.local','releases');
const name='2026-10-31 - Mac Mini - ChatGPT - ALW001 Hainan Guide-Public Share - V1.1.zip';
function run(command,args){const x=cp.spawnSync(command,args,{cwd:root,stdio:'inherit'});if(x.error)throw x.error;if(x.status!==0)throw Error(command+' exited '+x.status);}
run(process.execPath,[path.join(__dirname,'build-data.cjs')]);
run(process.execPath,['--test',path.join(__dirname,'test-prototype.cjs')]);
const files=['public-share.html','public-share.js','public-places.js','styles.css','manifest.webmanifest','sw.js','icon.svg'];
const src=files.map(file=>path.join(__dirname,file));
const forbidden=[/storyExamples|personId|sessionId|SecretKey/i, /\/api\//, /api\/(profile|asr|ai)/i,
  /SOCIALMATE_AI_PORT/, /DeepSeek/i, /getUserMedia/i, /microphone/i];
for(const file of files){
  const body=fs.readFileSync(path.join(__dirname,file),'utf8');
  for(const pattern of forbidden){
    if(pattern.test(body))throw Error('forbidden public-bundle content '+pattern+' in '+file);
  }
}
const html=fs.readFileSync(path.join(__dirname,'public-share.html'),'utf8');
for(const banned of ['index.html','app.js','data.js','/v12','socialmate-v1.2']){
  if(html.includes(banned))throw Error('private asset referenced in public bundle: '+banned);
}
fs.mkdirSync(out,{recursive:true});const dest=path.join(out,name);
try{fs.unlinkSync(dest);}catch(e){if(e.code!=='ENOENT')throw e;}
run('zip',['-q','-j',dest,...src]);
console.log('\nPUBLIC SHARE ZIP: '+dest);
console.log('This ZIP is safe as regards private data fields, but map/wording copyright and live deployment still need review.');
