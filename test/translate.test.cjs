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
  const dom=page('<nav aria-label="Sidebar"></nav><section class="settings-modal-container"><aside class="bg-sidebar"><div><h1>Settings</h1></div><div><button data-testid="settings-nav-item-Appearance">Appearance</button></div><div><button>Default</button></div><button data-testid="settings-nav-item-Account">General</button></aside><div class="max-w-2xl"><h2>General</h2><span>Queued Messages</span><input value="Default"><pre>Queued Messages</pre><span class="truncate">General</span></div></section>','https://127.0.0.1:1234/?settingsOpen=true');
  const d=dom.window.document;assert.equal(d.querySelector('h2').textContent,'常规');assert.equal(d.querySelector('.max-w-2xl span').textContent,'排队消息');assert.equal(d.querySelector('[data-testid="settings-nav-item-Account"]').textContent,'General');assert.equal(d.querySelector('aside > div:nth-child(3) button').textContent,'Default');assert.equal(d.querySelector('[data-testid="settings-nav-item-Appearance"]').textContent,'外观');assert.equal(d.querySelector('pre').textContent,'Queued Messages');assert.equal(d.querySelector('.truncate').textContent,'General');dom.window.close();
});
test('external origins receive no translation',()=>{const dom=page('<button data-testid="settings-button">Settings</button>','https://example.com/');assert.equal(dom.window.__antigravityZh,undefined);dom.window.close();});
test('menu commands and overview labels translated without touching arbitrary tooltip or file names',()=>{
  const dom=page('<button data-testid="title-menu-bar-item">File</button><button data-testid="title-menu-bar-option"><span>Create Project</span><span>Ctrl+N</span></button><button data-testid="overview-panel-row-files"><span>Files</span><span>Files</span></button><div role="tooltip">Settings</div><button data-testid="settings-button" data-tooltip-id="settings-tip">Settings</button><div id="settings-tip" role="tooltip">Settings</div>');
  const d=dom.window.document;assert.equal(d.querySelector('[data-testid="title-menu-bar-item"]').textContent,'文件');assert.equal(d.querySelector('[data-testid="title-menu-bar-option"]').textContent,'创建项目Ctrl+N');assert.equal(d.querySelector('[data-testid="overview-panel-row-files"]').textContent,'文件Files');assert.equal(d.querySelector('[role="tooltip"]').textContent,'Settings');assert.equal(d.getElementById('settings-tip').textContent,'设置');dom.window.close();
});
test('terminal navigation is translated while terminal content stays untouched',()=>{
  const dom=page('<button data-testid="overview-panel-row-terminal"><span>Terminal</span></button><div data-testid="terminal-surface"><button data-testid="settings-button">Settings</button></div>');
  const d=dom.window.document;assert.equal(d.querySelector('[data-testid="overview-panel-row-terminal"]').textContent,'终端');assert.equal(d.querySelector('[data-testid="terminal-surface"]').textContent,'Settings');dom.window.close();
});
test('streaming user content does not schedule translation passes',async()=>{
  const dom=page('<article><span></span></article>');const d=dom.window.document;await tick();const passes=dom.window.__antigravityZh.passes;
  for(let i=0;i<500;i++)d.querySelector('article span').textContent='Settings '+i;
  await tick();assert.equal(dom.window.__antigravityZh.passes,passes);assert.equal(d.querySelector('article span').textContent,'Settings 499');dom.window.close();
});
test('search and prompt placeholders translate without altering typed values or protected content',async()=>{
  const dom=page('<input data-testid="customizations-search" placeholder="Search customizations..." value="Search customizations..."><textarea data-testid="new-sidecar-prompt" placeholder="Enter a prompt for the agent to run...">Prompt</textarea><article><input data-testid="customizations-search" placeholder="Search customizations..."></article>');
  const d=dom.window.document,input=d.querySelector('input');assert.equal(input.placeholder,'搜索自定义内容…');assert.equal(input.value,'Search customizations...');assert.equal(d.querySelector('textarea').value,'Prompt');assert.match(d.querySelector('textarea').placeholder,/输入/);assert.equal(d.querySelector('article input').placeholder,'Search customizations...');
  input.placeholder='Search customizations...';await tick();assert.equal(input.placeholder,'搜索自定义内容…');assert.equal(input.value,'Search customizations...');dom.window.close();
});
test('built-in sidebar headers translate but same-named custom groups and project names do not',()=>{
  const dom=page('<div aria-label="Sidebar"><a href="/customizations?q=x">Customizations</a><div data-sidebar-section-drop-id="standalone"><div data-testid="section-header"><h2><button><span>Conversations</span></button></h2></div></div><div data-sidebar-section-drop-id="convgroup:123"><div data-testid="section-header"><h2>Conversations</h2></div></div><button data-testid="project-header">Projects</button></div>');const d=dom.window.document;
  assert.equal(d.querySelector('a').textContent,'自定义');assert.equal(d.querySelector('h2').textContent,'对话');assert.equal(d.querySelector('[data-sidebar-section-drop-id="convgroup:123"] h2').textContent,'Conversations');assert.equal(d.querySelector('[data-testid="project-header"]').textContent,'Projects');dom.window.close();
});
test('automation modal title and schedule translate while same-named model and user name stay original',()=>{
  const dom=page('<div role="dialog"><h2>New Automation</h2><div data-testid="new-sidecar-modal"><input value="Daily"><button><span class="truncate">Daily</span></button><div>around</div><button data-testid="new-sidecar-model"><span>Daily</span></button><button data-testid="new-sidecar-submit">Add Automation</button></div></div>');const d=dom.window.document;
  assert.equal(d.querySelector('h2').textContent,'新建自动化');assert.equal(d.querySelector('input').value,'Daily');assert.equal(d.querySelector('button').textContent,'每天');assert.equal(d.querySelector('[data-testid="new-sidecar-model"]').textContent,'Daily');assert.equal(d.querySelector('[data-testid="new-sidecar-submit"]').textContent,'添加自动化');dom.window.close();
});
test('settings sidebar excludes same-named projects, account name and code fragments',()=>{
  const dom=page('<section class="settings-modal-container"><aside class="bg-sidebar"><div><h1>Settings</h1></div><div><button data-testid="settings-nav-item-General">General</button><button data-testid="settings-nav-item-App">Application</button></div><div><h2>Projects</h2></div><div><button data-testid="settings-nav-item-General">General</button></div><button data-testid="settings-nav-item-Account">Settings</button></aside><div class="max-w-2xl"><h2 class="truncate">General</h2><div>Type <code>/</code> and select <code>plan</code> to have the agent generate a plan.</div></div></section>','https://127.0.0.1:1234/?settingsOpen=true');const d=dom.window.document;
  const matches=d.querySelectorAll('[data-testid="settings-nav-item-General"]');assert.equal(matches[0].textContent,'常规');assert.equal(matches[1].textContent,'General');assert.equal(d.querySelector('.max-w-2xl h2').textContent,'常规');assert.equal(d.querySelector('[data-testid="settings-nav-item-Account"]').textContent,'Settings');assert.deepEqual([...d.querySelectorAll('code')].map(e=>e.textContent),['/','plan']);assert.match(d.querySelector('.max-w-2xl div').textContent,/输入/);assert.doesNotMatch(d.querySelector('.max-w-2xl div').textContent,/and select/);dom.window.close();
});
test('customization headings are path-bound and creation forms preserve user names and models',()=>{
  const dom=page('<div class="max-w-4xl"><h1>Customizations</h1></div><div data-testid="new-sidecar-modal"><label>Prompt</label><input value="Cloud"><span class="truncate">Model</span><div role="option"><span>Cloud</span></div><span>Runs on</span><button data-testid="new-sidecar-submit">Create</button></div>','https://127.0.0.1:1234/customizations');const d=dom.window.document;
  assert.equal(d.querySelector('h1').textContent,'自定义');assert.equal(d.querySelector('label').textContent,'提示词');assert.equal(d.querySelector('input').value,'Cloud');assert.equal(d.querySelector('.truncate').textContent,'Model');assert.equal(d.querySelector('[role="option"] span').textContent,'Cloud');assert.equal(d.querySelector('button').textContent,'创建');dom.window.close();
  const other=page('<div class="max-w-4xl"><h1>Customizations</h1></div>','https://127.0.0.1:1234/c/id');assert.equal(other.window.document.querySelector('h1').textContent,'Customizations');other.window.close();
});
