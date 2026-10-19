'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const {installTranslation}=require('../src/translate.cjs');
const spec=require('../dictionary/zh-CN.json');
function page(html,url='https://127.0.0.1:1234/') {const dom=new JSDOM(html,{url});installTranslation(dom.window,spec);dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));return dom;}
const tick=()=>new Promise(r=>setTimeout(r,150));
test('fixed navigation translated; dynamic conversation names and content untouched',()=>{
  const dom=page('<nav aria-label="Sidebar"><a data-testid="new-conversation-button">New Conversation</a><a href="/c/id">New Conversation</a><a href="/customizations">Customizations</a></nav><article><button data-testid="settings-button">Settings</button></article><pre>Settings</pre><input value="Settings"><div contenteditable="true">Settings</div>');
  const d=dom.window.document;
  assert.equal(d.querySelector('[data-testid="new-conversation-button"]').textContent,'新建对话');
  assert.equal(d.querySelector('[href="/c/id"]').textContent,'New Conversation');
  assert.equal(d.querySelector('[href="/customizations"]').textContent,'自定义');
  assert.equal(d.querySelector('article').textContent,'Settings');
  assert.equal(d.querySelector('pre').textContent,'Settings');
  assert.equal(d.querySelector('input').value,'Settings');
  assert.equal(d.querySelector('[contenteditable]').textContent,'Settings');dom.window.close();
});
test('dynamic controls, recycled English nodes, moved user content and observer settle',async()=>{
  const dom=page('<main></main>');const d=dom.window.document;
  const b=d.createElement('button');b.dataset.testid='settings-button';b.textContent='Settings';d.querySelector('main').append(b);await tick();assert.equal(b.textContent,'设置');
  b.firstChild.nodeValue='Settings';await tick();assert.equal(b.textContent,'设置');
  let p=dom.window.__antigravityZh.passes;await tick();assert.equal(dom.window.__antigravityZh.passes,p);
  const a=d.createElement('article');d.body.append(a);a.append(b);await tick();assert.equal(b.textContent,'Settings');dom.window.close();
});
test('settings are restricted to fixed content and account/project rows excluded',()=>{
  const dom=page('<nav aria-label="Sidebar"></nav><section><aside><button data-testid="settings-nav-item-Account">General</button><button data-testid="settings-nav-item-Appearance">Appearance</button><button>Default</button></aside><div class="max-w-2xl"><h2>General</h2><span>Queued Messages</span><input value="Default"><pre>Queued Messages</pre><span class="truncate">General</span></div></section>','https://127.0.0.1:1234/?settingsOpen=true');
  const d=dom.window.document;assert.equal(d.querySelector('h2').textContent,'常规');assert.equal(d.querySelector('.max-w-2xl span').textContent,'排队消息');assert.equal(d.querySelector('[data-testid="settings-nav-item-Account"]').textContent,'General');assert.equal(d.querySelector('aside button:last-child').textContent,'Default');assert.equal(d.querySelector('pre').textContent,'Queued Messages');assert.equal(d.querySelector('.truncate').textContent,'General');dom.window.close();
});
test('external origins receive no translation',()=>{const dom=page('<button data-testid="settings-button">Settings</button>','https://example.com/');assert.equal(dom.window.__antigravityZh,undefined);dom.window.close();});
