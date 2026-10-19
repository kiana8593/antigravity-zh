'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {execute}=require('../tools/cli.cjs');
const {encode,decode,sha256}=require('../tools/asar.cjs');
const {build}=require('../tools/patch.cjs');
function fixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'agzh-installer-')),app=path.join(root,'app');
  const exe=Buffer.concat([Buffer.from('dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX'),Buffer.from([1,9,49,48,49,49,48,48,48,49,49])]);
  const main="const options = {buttons: ['Cancel', 'Quit'], title: 'Confirm Quit', message: 'Are you sure you want to quit?', detail: 'There may be agents or background tasks running.'};";
  const source=encode({header:{files:{'package.json':{size:0,offset:'0'},dist:{files:{'preload.js':{size:0,offset:'0'},'main.js':{size:0,offset:'0'}}}}},files:new Map([['package.json',Buffer.from('{"version":"2.24.0"}')],['dist/preload.js',Buffer.from('"use strict";\n')],['dist/main.js',Buffer.from(main)]])});
  fs.mkdirSync(path.join(app,'resources'),{recursive:true});fs.writeFileSync(path.join(app,'Antigravity.exe'),exe);
  const file=path.join(app,'resources/app.asar');fs.writeFileSync(file,source);
  fs.mkdirSync(path.join(root,'compatibility'));fs.writeFileSync(path.join(root,'compatibility/windows-2.24.0.json'),JSON.stringify({version:'2.24.0',originalSha256:sha256(source),exeSha256:sha256(exe)}));
  fs.mkdirSync(path.join(root,'dictionary'));fs.copyFileSync(path.join(__dirname,'../dictionary/zh-CN.json'),path.join(root,'dictionary/zh-CN.json'));
  const deps={projectRoot:root,assertStopped:()=>{}};
  return {root,app,file,source,deps,cleanup:()=>fs.rmSync(root,{recursive:true,force:true})};
}
test('first install, repeated install, byte-identical restore and deterministic rebuild',()=>{
  const f=fixture();try{
    const first=execute('install',f.app,f.deps);assert.match(first.state,/已安装/);
    const main=decode(fs.readFileSync(f.file)).files.get('dist/main.js').toString();assert.match(main,/确认退出/);assert.match(main,/buttons: \['取消', '退出'\]/);
    assert.match(execute('status',f.app,f.deps).state,/已安装/);
    assert.match(execute('install',f.app,f.deps).state,/无需重复/);
    assert.equal(execute('build',f.app,f.deps).sha256,first.sha256);
    assert.match(execute('restore',f.app,f.deps).state,/已恢复/);assert.ok(fs.readFileSync(f.file).equals(f.source));
    assert.match(execute('restore',f.app,f.deps).state,/无需恢复/);
    assert.equal(execute('install',f.app,f.deps).sha256,first.sha256);
  }finally{f.cleanup();}
});
test('unrecognized native dialog anchors abort the build',()=>{
  const f=fixture();try{const archive=decode(f.source);archive.files.set('dist/main.js',Buffer.from('const options = {};'));assert.throws(()=>build(encode(archive),f.root),/anchor mismatch/);assert.ok(fs.readFileSync(f.file).equals(f.source));}finally{f.cleanup();}
});
test('running application, changed executable and unknown archive leave installation intact',()=>{
  const f=fixture();try{
    assert.throws(()=>execute('install',f.app,{...f.deps,assertStopped:()=>{throw Error('running');}}),/running/);assert.ok(fs.readFileSync(f.file).equals(f.source));
    fs.appendFileSync(path.join(f.app,'Antigravity.exe'),'changed');assert.throws(()=>execute('install',f.app,f.deps),/指纹/);
    fs.writeFileSync(path.join(f.app,'Antigravity.exe'),Buffer.concat([Buffer.from('dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX'),Buffer.from([1,9,49,48,49,49,48,48,48,49,49])]));
    fs.appendFileSync(f.file,'unknown');assert.throws(()=>execute('install',f.app,f.deps),/未知修改/);
  }finally{f.cleanup();}
});
test('corrupt or missing backup blocks restore; damaged backup never overwritten',()=>{
  const f=fixture();try{
    execute('install',f.app,f.deps);const patched=fs.readFileSync(f.file);
    const backup=path.join(f.root,'backups',sha256(f.source),'original.asar');
    fs.writeFileSync(backup,'bad');assert.throws(()=>execute('restore',f.app,f.deps),/备份/);assert.ok(fs.readFileSync(f.file).equals(patched));
    assert.throws(()=>execute('install',f.app,f.deps),/备份/);assert.equal(fs.readFileSync(backup,'utf8'),'bad');
    fs.unlinkSync(backup);assert.throws(()=>execute('restore',f.app,f.deps),/备份/);
  }finally{f.cleanup();}
});
test('staging collision and concurrent operation preserve original and backup',()=>{
  const f=fixture();try{
    fs.writeFileSync(f.file+'.agzh-next','occupied');assert.throws(()=>execute('install',f.app,f.deps),/临时文件/);assert.ok(fs.readFileSync(f.file).equals(f.source));
    fs.unlinkSync(f.file+'.agzh-next');fs.writeFileSync(path.join(f.root,'work/operation.lock'),'busy');assert.throws(()=>execute('install',f.app,f.deps),/EEXIST/);
  }finally{f.cleanup();}
});
