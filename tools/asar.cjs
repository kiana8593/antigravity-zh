'use strict';
const crypto = require('node:crypto');
const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');
function entries(header) {
  const result = [];
  function walk(dir, prefix = '') {
    for (const [name, entry] of Object.entries(dir.files || {})) {
      const path = prefix ? `${prefix}/${name}` : name;
      if (entry.files) walk(entry, path); else result.push({ path, entry });
    }
  }
  walk(header); return result;
}
function decode(buffer) {
  if (buffer.length < 16 || buffer.readUInt32LE(0) !== 4) throw new Error('Invalid ASAR header');
  const headerSize = buffer.readUInt32LE(4), jsonSize = buffer.readUInt32LE(12), base = 8 + headerSize;
  if (base > buffer.length || jsonSize > headerSize - 8 || buffer.readUInt32LE(8) !== headerSize - 4) throw new Error('Invalid ASAR bounds');
  const header = JSON.parse(buffer.subarray(16, 16 + jsonSize).toString('utf8'));
  const files = new Map();
  for (const {path,entry} of entries(header)) {
    if (entry.unpacked || entry.link) continue;
    const start = Number(entry.offset), size = entry.size;
    if (!Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(size) || size < 0 || base + start + size > buffer.length) throw new Error(`Invalid ASAR file: ${path}`);
    const data = buffer.subarray(base + start, base + start + size);
    if (entry.integrity) {
      const blockSize = entry.integrity.blockSize;
      if (entry.integrity.algorithm !== 'SHA256' || !Number.isSafeInteger(blockSize) || blockSize <= 0 || sha256(data) !== entry.integrity.hash) throw new Error(`ASAR integrity mismatch: ${path}`);
      const blocks = [];
      for (let i=0;i<data.length;i+=blockSize) blocks.push(sha256(data.subarray(i,i+blockSize)));
      if (JSON.stringify(blocks) !== JSON.stringify(entry.integrity.blocks)) throw new Error(`ASAR block mismatch: ${path}`);
    }
    files.set(path, data);
  }
  return { header, files };
}
function encode(archive) {
  const header = structuredClone(archive.header), chunks = []; let offset = 0;
  for (const {path,entry} of entries(header)) {
    if (entry.unpacked || entry.link) continue;
    const data = archive.files.get(path);
    if (!Buffer.isBuffer(data)) throw new Error(`Missing ASAR content: ${path}`);
    entry.offset = String(offset); entry.size = data.length;
    if (entry.integrity) {
      const blockSize=entry.integrity.blockSize, blocks=[];
      for(let i=0;i<data.length;i+=blockSize) blocks.push(sha256(data.subarray(i,i+blockSize)));
      entry.integrity={algorithm:'SHA256',hash:sha256(data),blockSize,blocks};
    }
    offset += data.length; chunks.push(data);
  }
  const json = Buffer.from(JSON.stringify(header));
  const headerSize = 8 + Math.ceil(json.length / 4) * 4;
  const prefix = Buffer.alloc(8 + headerSize);
  prefix.writeUInt32LE(4,0); prefix.writeUInt32LE(headerSize,4);
  prefix.writeUInt32LE(headerSize-4,8); prefix.writeUInt32LE(json.length,12); json.copy(prefix,16);
  return Buffer.concat([prefix,...chunks]);
}
function embeddedIntegrityEnabled(exe) {
  const sentinel=Buffer.from('dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX');
  const pos=exe.indexOf(sentinel);
  if(pos<0 || exe.indexOf(sentinel,pos+1)>=0) throw new Error('Unknown Electron fuse layout');
  const start=pos+sentinel.length;
  if(exe[start]!==1 || exe[start+1]<5 || ![48,49].includes(exe[start+2+4])) throw new Error('Unknown integrity fuse state');
  return exe[start+2+4]===49;
}
module.exports={sha256,entries,decode,encode,embeddedIntegrityEnabled};
