const vm = require('node:vm');
const fs = require('node:fs');
const assert = require('node:assert/strict');

function fixture({ reduced = false, width = 1280, height = 800, clipSupported = true, prepaint = false,
  sourcePath = __dirname+'/../src/cartoon-source.js' } = {}) {
  let clock = 0, nextId = 0, nextNodeId = 0;
  const timers = new Map(), frames = new Map(), listeners = new Map(), ids = new Map();
  const events = [], writes = [], frameTimes = [];
  const decode = value => value.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
  const encode = value => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  function matches(node, selector) {
    if (selector.startsWith('#')) return node.id === selector.slice(1);
    if (selector.startsWith('.')) return (node.attributes.class || '').split(/\s+/).includes(selector.slice(1));
    return node.tagName === selector.toLowerCase();
  }
  function visit(node) { return node.children.flatMap(child => [child, ...visit(child)]); }
  function write(n, kind, key, value, previous) {
    writes.push({time:clock,node:n.id || n.nodeId,kind,key,value:String(value),
      previous:previous===undefined?undefined:String(previous),redundant:previous!==undefined&&String(previous)===String(value)});
  }
  function trackedProperties(n, kind) {
    return new Proxy({}, {set(target,key,value) {
      write(n,kind,key,value,target[key]); target[key]=String(value); return true;
    }});
  }
  function node(tag) {
    const n = { tagName:tag.toLowerCase(), sourceTagName:tag, nodeId:++nextNodeId, attributes:{}, children:[], events:new Map(), parent:null,
      setAttribute(name, value) {
        write(this,'attribute',name,value,this.attributes[name]);
        this.attributes[name] = String(value);
        if (name === 'id') ids.set(String(value),this);
      },
      getAttribute(name) { return this.attributes[name] ?? null; },
      addEventListener(name, fn) { this.events.set(name,fn); },
      removeEventListener(name) { this.events.delete(name); },
      append(...nodes) { for (const child of nodes) { child.parent=this; this.children.push(child); if (child.id) ids.set(child.id,child); } },
      remove() {
        for (const child of [this,...visit(this)]) if (child.id) ids.delete(child.id);
        if (this.parent) this.parent.children=this.parent.children.filter(child => child!==this);
        this.parent=null;
      },
      querySelector(selector) { return visit(this).find(child => matches(child,selector)) || null; },
      querySelectorAll(selector) { return visit(this).filter(child => matches(child,selector)); }
    };
    n.dataset=trackedProperties(n,'dataset');n.style=trackedProperties(n,'style');
    Object.defineProperty(n,'id',{get() { return this.attributes.id || ''; },set(value) { this.setAttribute('id',value); }});
    Object.defineProperty(n,'isConnected',{get() { let ancestor=this; while (ancestor.parent) ancestor=ancestor.parent; return ancestor===document.body || ancestor===document.head; }});
    Object.defineProperty(n,'textContent',{get() { return this.text || this.children.map(child => child.textContent).join(''); },set(value) {
      write(this,'text','textContent',value,this.textContent);this.text=String(value);this.children=[];
    }});
    Object.defineProperty(n,'innerHTML',{get() { return this.children.map(serialize).join(''); },set(value) {
      for (const child of visit(this)) if (child.id) ids.delete(child.id);
      this.children=[];
      const stack=[this];
      for (const token of String(value).match(/<!--[\s\S]*?-->|<[^>]+>|[^<]+/g) || []) {
        if (token.startsWith('<!--')) continue;
        if (token.startsWith('</')) { stack.pop(); continue; }
        if (token.startsWith('<')) {
          const tagMatch=token.match(/^<([\w:-]+)/); if (!tagMatch) continue;
          const child=node(tagMatch[1]);
          for (const attr of token.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g)) child.setAttribute(attr[1],decode(attr[3]));
          stack.at(-1).append(child);
          if (!token.endsWith('/>') && !['br','hr','img','input','meta','link'].includes(child.tagName)) stack.push(child);
        } else if (token.trim()) { const child=node('#text'); child.text=decode(token); stack.at(-1).append(child); }
      }
    }});
    return n;
  }
  function serialize(n) {
    if (n.tagName==='#text') return encode(n.text || '');
    const attributes={...n.attributes};
    const styles=Object.entries(n.style).map(([key,value]) => `${key.replace(/[A-Z]/g,letter => '-'+letter.toLowerCase())}:${value}`).join(';');
    if (styles) attributes.style=(attributes.style ? attributes.style+';' : '')+styles;
    const attrs=Object.entries(attributes).map(([key,value]) => ` ${key}="${encode(value)}"`).join('');
    return `<${n.sourceTagName}${attrs}>${n.text ? encode(n.text) : n.children.map(serialize).join('')}</${n.sourceTagName}>`;
  }
  const document={hidden:false,body:node('body'),head:node('head'),createElement:node,
    createElementNS:(_,tag) => node(tag),getElementById:id => ids.get(id),
    addEventListener(name,fn) { listeners.set('document:'+name,fn); },
    removeEventListener(name) { listeners.delete('document:'+name); }};
  const sandbox={document,navigator:{hardwareConcurrency:8},innerWidth:width,innerHeight:height,
    devicePixelRatio:2,performance:{now:() => clock},matchMedia:() => ({matches:reduced}),
    CSS:{supports:() => clipSupported},
    setTimeout(fn,ms) { const id=++nextId; timers.set(id,{fn,at:clock+ms}); return id; },
    clearTimeout(id) { timers.delete(id); },requestAnimationFrame(fn) { const id=++nextId; frames.set(id,fn); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    addEventListener(name,fn) { listeners.set(name,fn); },removeEventListener(name) { listeners.delete(name); },
    dispatchEvent(event) { events.push(event); },CustomEvent:function(name,options) { this.type=name; this.detail=options.detail; }};
  sandbox.window=sandbox;
  const source=fs.readFileSync(sourcePath,'utf8');
  let prepaintOverlay;
  if (prepaint) {
    prepaintOverlay=node('div'); prepaintOverlay.id='codex-startup-visual';
    prepaintOverlay.innerHTML=source.match(/overlay\.innerHTML = `([\s\S]*?)`;/)[1];
    document.body.append(prepaintOverlay);
  }
  vm.runInNewContext(source,sandbox);
  function tick(target) {
    while (true) {
      const next=[...timers].filter(([,task]) => task.at<=target).sort((a,b) => a[1].at-b[1].at)[0];
      if (!next) break;
      clock=next[1].at; timers.delete(next[0]); next[1].fn();
    }
    clock=target;
  }
  function frame(target) {
    tick(target); const pending=[...frames]; frames.clear();
    for (const [,fn] of pending) {frameTimes.push(target);fn(target);}
  }
  function advance(ms) { const target=clock+ms; while (clock+16<=target) frame(clock+16); if (clock<target) frame(target); }
  function clean() {
    assert.equal(ids.size,0,'Overlay and scoped CSS are removed');
    assert.equal(timers.size,0,'Timers are cancelled');
    assert.equal(frames.size,0,'RAF loop is cancelled');
    assert.equal(listeners.size,0,'Global listeners are removed');
    assert.equal(sandbox.__codexStartupVisual,undefined,'Global API releases closure');
    assert.equal(document.body.children.length,0); assert.equal(document.head.children.length,0);
  }
  return {document,timers,frames,listeners,events,ids,serialize,frame,tick,advance,clean,prepaintOverlay,
    writes,frameTimes,
    api:sandbox.__codexStartupVisual,get clock() { return clock; }};
}
module.exports={fixture};
