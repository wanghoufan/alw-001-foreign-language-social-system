#!/usr/bin/env node
/**
 * Private, source-backed deliverable only.
 * Usage: node socialmate-prototype/package-prototype.cjs
 * The output contains personal demo seeds. Never deploy its ZIP publicly.
 */
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const rel='socialmate-prototype';
const out=path.join(root,rel,'.local','releases');
const file='2026-10-31 - Mac Mini - ChatGPT - ALW001 SocialMate-HTML Prototype - V1.0.zip';
function run(command,args){
  const p=cp.spawnSync(command,args,{cwd:root,stdio:'inherit'});
  if(p.error)throw p.error;
  if(p.status!==0)throw Error(command+' exited '+p.status);
}
run(process.execPath,[path.join(root,rel,'build-data.cjs')]);
run(process.execPath,['--test',path.join(root,rel,'test-prototype.cjs')]);
fs.mkdirSync(out,{recursive:true});
const dest=path.join(out,file);
try{fs.unlinkSync(dest);}catch(e){if(e.code!=='ENOENT')throw e;}
run('zip',['-q','-r',dest,rel,'-x',
  'socialmate-prototype/.local/*','socialmate-prototype/.git/*','*.DS_Store',
  'socialmate-prototype/ai-gateway/.env','socialmate-prototype/ai-gateway/.env.*',
  '*/node_modules/*','*.pem','*.key']);
const entries=cp.spawnSync('unzip',['-Z1',dest],{cwd:root,encoding:'utf8'});
if(entries.status!==0)throw Error('Could not verify package contents');
const leaked=entries.stdout.split('\n').filter(entry=>/\/(?:\.env(?:\.|$)|[^/]+\.(?:pem|key)$)/i.test(entry));
if(leaked.length){fs.unlinkSync(dest);throw Error('Private credentials in archive: '+leaked.join(', '));}
console.log('\nPRIVATE RELEASE: '+dest);
console.log('Warning: contains private example story cards; do not upload this ZIP to a public site.');
