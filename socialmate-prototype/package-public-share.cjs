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
const name='2026-10-31 - Mac Mini - ChatGPT - ALW001 Hainan Guide-Public Share - V1.0.zip';
function run(command,args){const x=cp.spawnSync(command,args,{cwd:root,stdio:'inherit'});if(x.error)throw x.error;if(x.status!==0)throw Error(command+' exited '+x.status);}
run(process.execPath,[path.join(__dirname,'build-data.cjs')]);
run(process.execPath,['--test',path.join(__dirname,'test-prototype.cjs')]);
const files=['public-share.html','public-share.js','public-places.js','styles.css'];
const src=files.map(file=>path.join(__dirname,file));
const forbidden=/storyExamples|personId|sessionId|SecretKey/i;
const data=fs.readFileSync(path.join(__dirname,'public-places.js'),'utf8');
if(forbidden.test(data))throw Error('private fields detected in public bundle');
fs.mkdirSync(out,{recursive:true});const dest=path.join(out,name);
try{fs.unlinkSync(dest);}catch(e){if(e.code!=='ENOENT')throw e;}
run('zip',['-q','-j',dest,...src]);
console.log('\nPUBLIC SHARE ZIP: '+dest);
console.log('This ZIP is safe as regards private data fields, but map/wording copyright and live deployment still need review.');
