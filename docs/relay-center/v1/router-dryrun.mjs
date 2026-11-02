#!/usr/bin/env node
// Read-only task inventory. Never clicks, sends messages, writes files, or changes approvals.
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
const here=path.dirname(fileURLToPath(import.meta.url));
const registry=JSON.parse(fs.readFileSync(path.join(here,"PROJECTS.json"),"utf8"));
const statuses=[];
const ready=[];
const field=(body,key)=> {
 const line=body.split(/\r?\n/).find(x=>x.startsWith(key+":"));
 return line?line.slice(key.length+1).trim():"";
};
const inside=(p,root)=>p===root||p.startsWith(root+path.sep);
const checkFile=(p,root)=>{
 const real=fs.realpathSync(p);
 if(!inside(real,root))throw Error("PATH_OUTSIDE_PROJECT");
 return real;
};
for(const pr of registry.projects){
 const report={id:pr.id,project_root:pr.root,state:"UNKNOWN",deliverable:false,reason:""};
 try{
  const root=fs.realpathSync(pr.root);
  const reg=JSON.parse(fs.readFileSync(checkFile(path.join(root,pr.registry_path),root),"utf8"));
  if(reg.project_id!==pr.id||fs.realpathSync(reg.project_root)!==root)throw Error("REGISTRATION_MISMATCH");
  const source=fs.readFileSync(checkFile(path.join(root,pr.current_task),root),"utf8");
  const s=field(source,"status"),tid=field(source,"task_id");
  report.state=s;report.task_id=tid;
  if(s==="EMPTY"){report.reason="EMPTY_NO_TASK";statuses.push(report);continue;}
  if(["SENT","ACKED","CANCELLED"].includes(s)){report.reason="NOT_READY";statuses.push(report);continue;}
  if(s!=="READY"){report.reason="STATUS_NOT_READY";statuses.push(report);continue;}
  if(!/^[A-Za-z0-9][A-Za-z0-9._-]{4,127}$/.test(tid))throw Error("BAD_TASK_ID");
  const r=path.join(root,pr.receipt_dir,tid+".md");
  if(fs.existsSync(r)){
   const receipt=fs.readFileSync(checkFile(r,root),"utf8");
   if(/GUI_SENT|GUI_SEND:\s*SENT|SEND_CONFIRMED|DEVELOPER_ACKED|ACKED/.test(receipt)){
    report.reason="ALREADY_SENT_RECEIPT";statuses.push(report);continue;
   }
  }
  const approve=field(source,"user_approved")==="true"||field(source,"approved_by_user")==="true"||field(source,"approval").startsWith("USER_APPROVED");
  if(!approve)throw Error("NOT_USER_APPROVED");
  if(field(source,"target_project")!==pr.id)throw Error("TARGET_ID_MISMATCH");
  if(fs.realpathSync(field(source,"project_root"))!==root)throw Error("TARGET_ROOT_MISMATCH");
  const taskFile=field(source,"instruction_file");
  const send=field(source,"send_text");
  if(!send.startsWith("读取并执行：")||send.includes("\n")||send.includes("\r"))throw Error("BAD_SEND_TEXT");
  const rel=send.slice("读取并执行：".length);
  if(!rel.startsWith("docs/plan/")||rel.includes("\\")||path.isAbsolute(rel))throw Error("BAD_RELATIVE_PATH");
  const realInstruction=checkFile(taskFile,root);
  const realFromSend=checkFile(path.join(root,rel),root);
  if(realInstruction!==realFromSend)throw Error("SEND_TEXT_FILE_MISMATCH");
  const priority=Number(field(source,"priority")||"100");
  if(!Number.isInteger(priority)||priority<0||priority>1000)throw Error("BAD_PRIORITY");
  const approvedAt=field(source,"approved_at");
  report.deliverable=true;report.reason="READY_VERIFIED";
  ready.push({project:pr.id,task_id:tid,priority,approved_at:approvedAt||null,send_text:send});
 }catch(e){report.state="BLOCKED";report.reason=e?.message||String(e);}
 statuses.push(report);
}
ready.sort((a,b)=>a.priority-b.priority||String(a.approved_at||"").localeCompare(String(b.approved_at||""))||a.task_id.localeCompare(b.task_id));
const ambiguous=ready.length>1&&ready.some(x=>!x.approved_at);
const result={schema_version:"1.0.0",mode:"DRY_RUN_READ_ONLY",status:ambiguous?"BLOCKED_QUEUE_UNVERIFIED":"OK",eligible_count:ready.length,selected:ambiguous?null:(ready[0]||null),registered:statuses};
console.log(JSON.stringify(result,null,2));
if(ambiguous||statuses.some(x=>x.state==="BLOCKED"))process.exitCode=1;
