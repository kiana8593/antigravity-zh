'use strict';
const cp=require('node:child_process');
const root=require('node:path').resolve(__dirname,'..');
function git(args){return cp.execFileSync('git',['-C',root,...args],{encoding:'utf8',maxBuffer:30*1024*1024});}
const commits=git(['rev-list','--all']).trim().split('\n').filter(Boolean),seen=new Set(),problems=[];
const patterns=[
  /\b[A-Z]:[\\/]+Users[\\/]+(?!<|USER|user|example)[^\\/\s`]+/gi,
  /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g
];
for(const commit of commits){
  for(const line of git(['ls-tree','-r','-z',commit]).split('\0').filter(Boolean)){
    const match=/^\d+ blob ([0-9a-f]+)\t(.+)$/.exec(line);if(!match||seen.has(match[1]))continue;
    seen.add(match[1]);const file=match[2],text=git(['cat-file','blob',match[1]]);
    if(/(^|\/)(?:backups|node_modules|work|logs|dist|screenshots)\//.test(file)||/\.(?:asar|exe|pem|key|bundle|zip|log)$/.test(file))problems.push({file,reason:'private or generated artifact'});
    for(const pattern of patterns){pattern.lastIndex=0;if(pattern.test(text))problems.push({file,reason:'personal path or credential pattern'});}
    for(const email of text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)||[])if(!email.endsWith('@users.noreply.github.com'))problems.push({file,reason:'non-private email'});
  }
}
for(const email of git(['log','--all','--format=%ae%n%ce']).trim().split('\n'))if(email&&!email.endsWith('@users.noreply.github.com'))problems.push({reason:'commit email must use GitHub privacy address'});
console.log(JSON.stringify({commits:commits.length,uniqueBlobs:seen.size,problems},null,2));
if(problems.length)process.exitCode=1;
