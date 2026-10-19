'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {encode,decode,sha256,embeddedIntegrityEnabled}=require('../tools/asar.cjs');
const {atomicReplace}=require('../tools/cli.cjs');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
function archive(){const data=Buffer.from('hello 世界');return {header:{files:{'a.js':{size:0,offset:'0',integrity:{blockSize:4}},native:{files:{'x.node':{unpacked:true,size:100}}}}},files:new Map([['a.js',data]])};}
test('ASAR round trip preserves Unicode bytes and integrity blocks',()=>{const a=archive(),b=encode(a),d=decode(b);assert.ok(d.files.get('a.js').equals(a.files.get('a.js')));assert.equal(d.header.files.native.files['x.node'].unpacked,true);assert.ok(encode(d).equals(b));});
test('corrupted packed content and malformed bounds are rejected',()=>{const b=encode(archive());b[b.length-1]^=1;assert.throws(()=>decode(b),/integrity/);assert.throws(()=>decode(Buffer.alloc(20)),/header/);});
test('read-only fuse detection rejects unknown layouts and enabled validation',()=>{const sentinel=Buffer.from('dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX');for(const v of [48,49]){const b=Buffer.concat([sentinel,Buffer.from([1,9,49,48,49,49,v,48,48,49,49])]);assert.equal(embeddedIntegrityEnabled(b),v===49);}assert.throws(()=>embeddedIntegrityEnabled(Buffer.alloc(50)),/layout/);});
test('transaction refuses concurrent changes and leaves original intact on staging collision',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'agzh-test-'));const file=path.join(dir,'app.asar');try{fs.writeFileSync(file,'original');assert.throws(()=>atomicReplace(file,Buffer.from('patch'),sha256(Buffer.from('other'))),/发生变化/);assert.equal(fs.readFileSync(file,'utf8'),'original');fs.writeFileSync(file+'.agzh-next','occupied');assert.throws(()=>atomicReplace(file,Buffer.from('patch'),sha256(Buffer.from('original'))),/临时文件/);assert.equal(fs.readFileSync(file,'utf8'),'original');fs.unlinkSync(file+'.agzh-next');atomicReplace(file,Buffer.from('patch'),sha256(Buffer.from('original')));assert.equal(fs.readFileSync(file,'utf8'),'patch');}finally{fs.rmSync(dir,{recursive:true,force:true});}});
