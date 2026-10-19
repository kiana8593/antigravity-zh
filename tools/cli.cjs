'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {sha256,decode,embeddedIntegrityEnabled}=require('./asar.cjs');
const {build}=require('./patch.cjs');
const root=path.resolve(__dirname,'..');
const defaultApp=path.join(process.env.LOCALAPPDATA||'','Programs','antigravity');
function readJson(p){return JSON.parse(fs.readFileSync(p,'utf8'));}
function atomicJson(p,data){fs.writeFileSync(p+'.tmp',JSON.stringify(data,null,2)+'\n',{flag:'wx'});fs.renameSync(p+'.tmp',p);}
function ensureStopped(app){
  if(process.platform!=='win32')throw new Error('Installation is supported on Windows only');
  const script="$ErrorActionPreference='Stop'; @(Get-CimInstance Win32_Process -Filter \"Name='Antigravity.exe'\").Count";
  const r=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{encoding:'utf8',windowsHide:true});
  if(r.status!==0||!/^\s*\d+\s*$/.test(r.stdout))throw new Error('Cannot verify whether Antigravity is running');
  if(Number(r.stdout)>0)throw new Error('请先退出所有 Antigravity 窗口和后台进程，再安装或恢复。');
}
function compatible(app,projectRoot=root){
  const exe=fs.readFileSync(path.join(app,'Antigravity.exe'));
  if(embeddedIntegrityEnabled(exe))throw new Error('应用启用了归档强制校验，停止安装；不会关闭校验。');
  const profile=readJson(path.join(projectRoot,'compatibility/windows-2.24.0.json'));
  if(sha256(exe)!==profile.exeSha256)throw new Error('可执行文件指纹不匹配，请重新适配。');
  return profile;
}
function atomicReplace(file,data,expected){
  const temp=file+'.agzh-next';
  if(fs.existsSync(temp))throw new Error('发现上次操作的临时文件，请先检查，不会覆盖。');
  try{
    fs.writeFileSync(temp,data,{flag:'wx'});
    const fd=fs.openSync(temp,'r+');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    if(sha256(fs.readFileSync(temp))!==sha256(data))throw new Error('临时文件校验失败。');
    if(sha256(fs.readFileSync(file))!==expected)throw new Error('操作期间应用文件发生变化，停止替换。');
    fs.renameSync(temp,file);
  }finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
}
// Injectable project location and process guard are used by isolated fixture tests.
// The command line always uses the real Windows process guard and project root.
function execute(command,app=defaultApp,dependencies={}){
  const projectRoot=dependencies.projectRoot||root;
  const stopped=dependencies.assertStopped||ensureStopped;
  app=path.resolve(app);
  const file=path.join(app,'resources','app.asar');
  const profile=compatible(app,projectRoot),current=fs.readFileSync(file),hash=sha256(current);
  const version=JSON.parse(decode(current).files.get('package.json').toString()).version;
  if(version!==profile.version)throw new Error('应用版本不受支持。');
  const backups=path.join(projectRoot,'backups',profile.originalSha256),backup=path.join(backups,'original.asar'),statePath=path.join(backups,'state.json');
  const state=fs.existsSync(statePath)?readJson(statePath):null;
  if(state && (state.appPath!==app||state.originalSha256!==profile.originalSha256))throw new Error('备份记录与安装位置不匹配。');
  if(state && (!fs.existsSync(backup)||sha256(fs.readFileSync(backup))!==profile.originalSha256))throw new Error('原始备份缺失或损坏，停止操作。');
  const original=hash===profile.originalSha256;
  const patched=!!state?.patchedHashes?.includes(hash);
  if(!original&&!patched)throw new Error('当前归档存在未知修改，停止操作。');
  if(command==='status')return {version,state:original?'原版':'已安装汉化补丁',sha256:hash,backupVerified:!!state};
  if(!['build','install','restore'].includes(command))throw new Error('用法：node tools/cli.cjs status|build|install|restore [--app 安装目录]');
  if(command!=='build')stopped(app);
  const lockDir=path.join(projectRoot,'work');fs.mkdirSync(lockDir,{recursive:true});
  const lock=path.join(lockDir,'operation.lock');const fd=fs.openSync(lock,'wx');
  try{
    if(command==='restore'){
      if(original)return {state:'已经是原版，无需恢复。'};
      if(!state)throw new Error('没有可用的原始备份。');
      const data=fs.readFileSync(backup);stopped(app);atomicReplace(file,data,hash);
      if(sha256(fs.readFileSync(file))!==profile.originalSha256)throw new Error('恢复后校验失败。');
      return {state:'已恢复原始应用，校验一致。',sha256:profile.originalSha256};
    }
    const source=original?current:fs.readFileSync(backup),result=build(source,projectRoot);
    const dist=path.join(projectRoot,'dist');fs.mkdirSync(dist,{recursive:true});
    fs.writeFileSync(path.join(dist,'app.asar'),result.output);
    atomicJson(path.join(dist,'build.json'),{appVersion:profile.version,patchVersion:result.patchVersion,originalSha256:result.originalSha256,patchedSha256:result.patchedSha256});
    if(command==='build')return {state:'构建并校验完成。',sha256:result.patchedSha256};
    if(hash===result.patchedSha256)return {state:'已安装相同补丁，无需重复安装。',sha256:hash};
    fs.mkdirSync(backups,{recursive:true});
    if(!fs.existsSync(backup))fs.writeFileSync(backup,source,{flag:'wx'});
    if(sha256(fs.readFileSync(backup))!==profile.originalSha256)throw new Error('原始备份校验失败。');
    // Record the intended hash before replacing: recovery also works after a crash.
    atomicJson(statePath,{appPath:app,appVersion:profile.version,originalSha256:profile.originalSha256,patchedHashes:[...new Set([...(state?.patchedHashes||[]),result.patchedSha256])],updatedAt:new Date().toISOString()});
    stopped(app);atomicReplace(file,result.output,hash);
    if(sha256(fs.readFileSync(file))!==result.patchedSha256)throw new Error('安装后校验失败，请执行恢复。');
    return {state:'汉化补丁已安装。',patchVersion:result.patchVersion,sha256:result.patchedSha256};
  }finally{fs.closeSync(fd);fs.unlinkSync(lock);}
}
if(require.main===module){try{const args=process.argv.slice(2),i=args.indexOf('--app');console.log(JSON.stringify(execute(args[0]||'status',i>=0?args[i+1]:defaultApp),null,2));}catch(e){console.error('操作停止：'+e.message);process.exitCode=1;}}
module.exports={execute,atomicReplace};
