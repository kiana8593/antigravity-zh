'use strict';

// Serialized into the existing isolated preload world. No network or page API access.
function installTranslation(win, spec) {
  if (win.location.hostname !== '127.0.0.1' || win.location.protocol !== 'https:') return;
  if (win.top !== win || win.__antigravityZh) return;
  const doc = win.document;
  const excluded = 'article,pre,code,textarea,input,[contenteditable]:not([contenteditable="false"]),[role="textbox"],.monaco-editor,.xterm,webview,iframe,[data-testid="conversation-view"],[data-testid="terminal-surface"],[data-testid="terminal-tab-surface"],[data-testid="standalone-terminal-view"],[data-testid="settings-nav-item-Account"],[data-agzh-ignore]';
  const textHistory = new WeakMap();
  const attrHistory = new WeakMap();
  const counters = { changes: 0, passes: 0, version: spec.version };
  win.__antigravityZh = counters;
  function blocked(el) { return !el || !!el.closest(excluded); }
  function replaceText(node, words) {
    if (blocked(node.parentElement)) return;
    const raw = node.nodeValue;
    const key = raw.trim();
    if (!Object.hasOwn(words, key)) return;
    const value = raw.replace(key, words[key]);
    if (value === raw) return;
    // Preserve text node identity: replacing children can break React reconciliation.
    textHistory.set(node, { original: raw, translated: value });
    node.nodeValue = value;
    counters.changes++;
  }
  function translateElement(el, words, attributes = [], direct = false, attributesOnly = false) {
    if (attributesOnly ? blocked(el.parentElement) : blocked(el)) return;
    if (attributesOnly && !el.matches('input,textarea')) return;
    if (!attributesOnly) {
    if (direct) {
      for (const node of el.childNodes) if (node.nodeType === 3) replaceText(node, words);
    } else {
      const walker = doc.createTreeWalker(el, win.NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) replaceText(node, words);
    }
    }
    for (const name of attributes) {
      if (!['title','aria-label','placeholder'].includes(name)) continue;
      const value = el.getAttribute(name);
      if (value && Object.hasOwn(words, value)) {
        let history = attrHistory.get(el);
        if (!history) attrHistory.set(el, history = {});
        history[name] = { original: value, translated: words[value] };
        el.setAttribute(name, words[value]);
        counters.changes++;
      }
    }
  }
  function restoreMovedNodes(records) {
    function restore(root) {
      const nodes = [];
      if (root.nodeType === 3) nodes.push(root);
      else if (root.nodeType === 1) {
        const walker = doc.createTreeWalker(root, win.NodeFilter.SHOW_TEXT);
        let n; while ((n = walker.nextNode())) nodes.push(n);
      }
      for (const node of nodes) {
        const old = textHistory.get(node);
        if (old && blocked(node.parentElement) && node.nodeValue === old.translated) {
          node.nodeValue = old.original;
          textHistory.delete(node);
        }
      }
      if (root.nodeType === 1) for (const el of [root, ...root.querySelectorAll('*')]) {
        const old = attrHistory.get(el);
        if (old && (el.matches('input,textarea') ? blocked(el.parentElement) : blocked(el))) {
          for (const [name, entry] of Object.entries(old)) if (el.getAttribute(name) === entry.translated) el.setAttribute(name, entry.original);
          attrHistory.delete(el);
        }
      }
    }
    for (const record of records) {
      if (record.type === 'childList') for (const node of record.addedNodes) restore(node);
      else if (record.type === 'attributes' && blocked(record.target)) restore(record.target);
    }
  }
  function settingsRoot() {
    if (new URL(win.location.href).searchParams.get('settingsOpen') !== 'true') return null;
    const modal = doc.querySelector('.settings-modal-container');
    if (modal) return modal;
    const anchor = doc.querySelector('[data-testid="settings-nav-item-Account"]');
    for (let el = anchor?.parentElement; el && el !== doc.body; el = el.parentElement) {
      if (el.querySelector('.max-w-2xl h2') && !el.querySelector('nav[aria-label="Sidebar"]')) return el;
    }
    return null;
  }
  function pass() {
    counters.passes++;
    for (const rule of spec.rules) {
      if (rule.paths && !rule.paths.includes(win.location.pathname)) continue;
      for (const el of doc.querySelectorAll(rule.selector)) {
        if (rule.exclude && el.closest(rule.exclude)) continue;
        translateElement(el, rule.words, rule.attributes, rule.direct, rule.attributesOnly);
        const tooltipId = el.getAttribute('data-tooltip-id');
        const tooltip = tooltipId && doc.getElementById(tooltipId);
        if (tooltip) translateElement(tooltip, rule.words);
      }
    }
    const root = settingsRoot();
    if (root) {
      const sidebar = root.querySelector('[data-testid="settings-nav-item-Account"]')?.closest('.bg-sidebar');
      const heading = sidebar?.querySelector('h1');
      const globalGroup = heading?.parentElement.nextElementSibling;
      for (const el of sidebar?.querySelectorAll('[data-testid^="settings-nav-item-"]') || []) {
        const id = el.dataset.testid;
        const shared = el.parentElement === globalGroup?.parentElement && ['settings-nav-item-Shortcuts','settings-nav-item-Provide Feedback'].includes(id);
        const outsideProject = id === 'settings-nav-item-Conversations' && ['Not in Project','未归属项目'].includes(el.parentElement.previousElementSibling?.textContent.trim());
        if (el.parentElement === globalGroup || shared || outsideProject) translateElement(el, spec.settingsNav);
      }
      for (const el of sidebar?.querySelectorAll('h1,h2') || []) translateElement(el, spec.settingsNav, [], true);
      // Ignore dynamic project/workspace/account rows outside the fixed content column.
      for (const el of root.querySelectorAll('.max-w-2xl h1,.max-w-2xl h2,.max-w-2xl h3,.max-w-2xl p,.max-w-2xl a,.max-w-2xl label,.max-w-2xl span:not(.truncate),.max-w-2xl button,.max-w-2xl div')) {
        if (el.querySelector('input,textarea,[contenteditable="true"]')) continue;
        const params = new URL(win.location.href).searchParams;
        const fixedHeading = el.matches('h1,h2,h3') && !params.has('settingsProjectId') && ['General','App','Appearance','Models','Shortcuts','Provide Feedback'].includes(params.get('settingsScreen') || 'General');
        if ((el.closest('.truncate') && !fixedHeading) || el.closest('[data-project-label],.font-mono')) continue;
        translateElement(el, spec.settings, ['title'], true);
      }
    }
  }
  let timer = null;
  const observer = new win.MutationObserver(records => {
    restoreMovedNodes(records);
    // Changes confined to excluded content never schedule a full scan.
    if (!records.some(r => {
      if (r.type === 'attributes' && r.target.matches('input,textarea')) return !blocked(r.target.parentElement);
      return !blocked(r.target.nodeType === 1 ? r.target : r.target.parentElement);
    })) return;
    if (timer === null) timer = win.setTimeout(() => { timer = null; run(); }, 60);
  });
  function run() {
    observer.disconnect();
    try { pass(); } catch (error) { console.warn('[AntigravityZh] translation pass failed', error.message); }
    finally { observer.observe(doc.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['title','aria-label','placeholder','href','data-testid','contenteditable','role'] }); }
  }
  let started = false;
  function start() {
    if (!doc.body || started) return;
    started = true;
    run();
    win.addEventListener('popstate', () => { if (timer === null) timer = win.setTimeout(() => {timer = null; run();}, 60); });
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}

module.exports = { installTranslation };
