'use strict';
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {decode,encode,sha256}=require('./asar.cjs');
const {installTranslation}=require('../src/translate.cjs');
function build(original, root) {
  const archive=decode(original);
  const spec=JSON.parse(fs.readFileSync(path.join(root,'dictionary/zh-CN.json'),'utf8'));
  const preload=archive.files.get('dist/preload.js');
  if (!preload || preload.includes(Buffer.from('ANTIGRAVITY_ZH_BEGIN'))) throw new Error('Unsupported or already patched preload');
  const injection=`\n// ANTIGRAVITY_ZH_BEGIN ${spec.version}\n;(${installTranslation.toString()})(window,${JSON.stringify(spec)});\n// ANTIGRAVITY_ZH_END\n`;
  const modified=Buffer.concat([preload,Buffer.from(injection)]);
  new vm.Script(modified.toString(),{filename:'preload.js'});
  archive.files.set('dist/preload.js',modified);
  const output=encode(archive), check=decode(output);
  for(const [name,data] of archive.files) if(!check.files.get(name)?.equals(data)) throw new Error(`Repack verification failed: ${name}`);
  return {output,patchVersion:spec.version,originalSha256:sha256(original),patchedSha256:sha256(output)};
}
module.exports={build};
