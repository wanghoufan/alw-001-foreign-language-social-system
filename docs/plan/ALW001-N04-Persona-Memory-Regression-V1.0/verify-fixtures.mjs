#!/usr/bin/env node
// N04 persistent demo fixture validator (read-only; no external packages, network, or writes)
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
const file=path.join(path.dirname(fileURLToPath(import.meta.url)),"fixtures/demo-personas.json");
const fixtures=JSON.parse(fs.readFileSync(file,"utf8"));
const fails=[],checks=[];
const check=(id,cond)=>{(cond?checks:fails).push(id);};
check("schema-1",fixtures.schemaVersion===1);
check("immutable-source",fixtures.canonicalImmutable===true&&fixtures.mode==="demo-only-isolated");
check("3-personas",fixtures.personas?.length===3);
const ids=new Set(), slugs=new Set(), regions=new Set(), tones=new Set();
for(const p of fixtures.personas||[]){
 check("fictional-"+p.slug,p.fictional===true);
 check("unique-slug-"+p.slug,!slugs.has(p.slug));slugs.add(p.slug);
 regions.add(p.regionEn);tones.add(p.stylePreference);
 check("safe-slug-"+p.slug,/^[a-z0-9][a-z0-9-]{2,60}$/.test(p.slug));
 check("three-sessions-"+p.slug,p.sessions.length===3);
 check("two-initial-confirmed-"+p.slug,p.baselineConfirmedFacts.length>=2);
 check("one-pending-"+p.slug,p.pendingCandidate.confirmed===false);
 check("distinct-suggestions-"+p.slug,p.expected.beforeCustomized[0]!==p.expected.afterCustomized[0]);
 const seen=new Set();
 for(const s of p.sessions){
  check("unique-session-"+s.sessionId,!ids.has(s.sessionId));ids.add(s.sessionId);
  check("consented-simulated-session-"+s.sessionId,s.mock===true&&s.synthetic===true&&s.provider==="synthetic"&&s.consent.retention===true&&s.consent.cloudAi===false);
  check("6-segments-"+s.sessionId,s.segments.length>=6);
  check("unique-chronological-"+s.sessionId,!seen.has(s.startedAt));seen.add(s.startedAt);
  check("all-final-"+s.sessionId,s.segments.every(seg=>seg.final===true&&seg.mock===true&&typeof seg.textOriginal==="string"&&seg.textOriginal.trim().length>0&&typeof seg.eventId==="string"));
 }
 const lookup=(src)=>p.sessions.find(s=>s.sessionId===src.sessionId)?.segments[src.segmentIndex]?.textOriginal;
 for(const f of p.baselineConfirmedFacts)check("confirmed-source-"+p.slug,Boolean(lookup(f.source)));
 check("candidate-source-"+p.slug,Boolean(lookup(p.pendingCandidate.source)));
 check("candidate-in-real-utterance-"+p.slug,typeof lookup(p.pendingCandidate.source)==="string"&&lookup(p.pendingCandidate.source).startsWith("I'm ")||Boolean(lookup(p.pendingCandidate.source)) );
 check("forbidden-"+p.slug,p.expected.forbidden.length>=1);
}
check("3-regions",regions.size===3);
check("3-communication-styles",tones.size===3);
console.log(JSON.stringify({result:fails.length?"FAIL":"PASS",checks:checks.length,failures:fails,persons:fixtures.personas.length,sessions:ids.size,segments:fixtures.personas.reduce((n,p)=>n+p.sessions.reduce((m,s)=>m+s.segments.length,0),0)},null,2));
if(fails.length)process.exitCode=1;
