const assert = require('node:assert/strict');
const { fixture } = require('./drawing-fixture.cjs');
const overlay = f => f.ids.get('codex-startup-visual');
const numeric = (f,id,name) => Number(f.ids.get('cs-'+id).getAttribute(name));
const bellyRadius = (f,name) => {
  const scale=f.ids.get('cs-belly-shell').getAttribute('transform').match(/scale\(([\d.]+) ([\d.]+)\)/);
  return numeric(f,'belly',name)*Number(scale[name==='rx'?1:2]);
};
const bottleWaterLevel = f => numeric(f,'bottle-water','y')+
  Number(f.ids.get('cs-bottle-water').getAttribute('transform').match(/translate\(0 ([\d.]+)\)/)[1]);

(async () => {
  let f=fixture(), o=overlay(f);
  assert.equal(f.api.notBefore,7600);
  assert.equal(o.dataset.stage,'bottle');
  assert.equal(numeric(f,'man','opacity'),0,'The giant bottle is the first sight');
  assert.match(f.ids.get('cs-bottle').getAttribute('transform'),/scale\(1\.120\)/);
  f.api.setStatus('正在恢复对话');
  assert.equal(o.querySelector('.cs-status').textContent,'正在恢复对话');
  f.api.finish();
  f.advance(2400); assert.equal(o.dataset.stage,'enter');
  assert.ok(numeric(f,'man','opacity')>.8,'Codex walks into the scene');
  f.advance(1200); assert.equal(o.dataset.stage,'uncap');
  assert.match(f.ids.get('cs-cap').getAttribute('transform'),/rotate\([1-9]/,'The cap really twists');
  f.advance(1300); assert.equal(o.dataset.stage,'drink');
  const belly1=bellyRadius(f,'rx'), bottleLevel1=bottleWaterLevel(f);
  f.advance(1600);
  assert.ok(bellyRadius(f,'rx')>belly1+70,'The belly visibly grows as drinking continues');
  assert.ok(bottleWaterLevel(f)>bottleLevel1+150,'The water level falls as Codex drinks');
  assert.equal(numeric(f,'belly','rx'),numeric(f,'belly-mask','rx'),'The fixed ellipse and its liquid clip share the swelling group');
  assert.equal(f.ids.get('cs-belly').getAttribute('vector-effect'),'non-scaling-stroke','Inflation preserves the comic outline');
  assert.equal(o.dataset.leaving,undefined,'Early composer readiness cannot cut the story short');
  f.advance(1099); assert.equal(o.dataset.leaving,undefined);
  f.advance(1); assert.equal(o.dataset.stage,'burst'); assert.equal(o.dataset.exitMode,'comic');
  f.advance(240);
  assert.ok(bellyRadius(f,'rx')<40,'The cartoon pop returns the intact character to normal');
  assert.ok(numeric(f,'face-dizzy','opacity')>.98,'The character uses comic star eyes');
  assert.equal(numeric(f,'burst','opacity'),1);
  assert.notEqual(f.ids.get('cs-confetti').children[0].getAttribute('transform'),
    f.ids.get('cs-confetti').children[1].getAttribute('transform'),'Confetti disperses in different directions');
  o.events.get('transitionend')({target:o,propertyName:'opacity'});
  assert.equal(overlay(f),o,'An unrelated opacity transition cannot cut off the comic reveal');
  f.advance(410); assert.equal(o.dataset.stage,'leaving');
  assert.equal(o.dataset.exitMode,'fade');assert.equal(o.style.transitionDuration,'500ms');
  assert.equal(f.frames.size,0,'The chat reveal uses CSS opacity without an SVG RAF loop');
  assert.equal(o.querySelector('.cs-wipe'),null,'The oversized cloud layer has been removed');
  assert.equal(o.style.clipPath,undefined,'The reveal does not rewrite a screen-sized polygon');
  f.advance(450); f.clean(); assert.equal((await f.api.done).reason,'ready');

  f=fixture(); o=overlay(f); f.advance(9000);
  assert.equal(o.dataset.stage,'full'); assert.equal(o.dataset.leaving,undefined,'Late readiness keeps the full-belly waiting pose');
  assert.equal(f.frames.size,0,'The completed waiting pose does not spin RAF');
  f.api.finish(); assert.equal(o.dataset.stage,'burst');
  assert.equal(f.frames.size,1,'Late composer readiness wakes exactly one burst RAF');
  f.advance(1100); f.clean();

  f=fixture(); o=overlay(f); f.advance(2000);
  let prevented=0,stopped=0;
  f.listeners.get('keydown')({key:'Escape',preventDefault(){prevented++;},stopPropagation(){stopped++;}});
  assert.equal(prevented,1); assert.equal(stopped,1);
  assert.equal(o.dataset.leaving,'skipped'); assert.equal(o.style.transitionDuration,'220ms');
  f.advance(270); f.clean(); assert.equal((await f.api.done).reason,'skipped');
  f=fixture(); o=overlay(f); o.events.get('pointerdown')(); f.advance(270); f.clean();

  f=fixture({reduced:true}); o=overlay(f);
  assert.equal(f.frames.size,0,'Reduced motion has a static cartoon and no RAF');
  assert.equal(f.api.notBefore,120); f.api.finish(); f.advance(119);
  assert.equal(o.dataset.leaving,undefined); f.advance(1);
  assert.equal(o.style.transitionDuration,'120ms'); f.advance(170); f.clean();

  f=fixture(); o=overlay(f); f.advance(3000);
  const capPose=f.ids.get('cs-cap').getAttribute('transform');
  f.document.hidden=true; f.listeners.get('document:visibilitychange')();
  assert.equal(f.frames.size,0); f.advance(4000);
  assert.equal(f.ids.get('cs-cap').getAttribute('transform'),capPose,'Hidden windows pause visible story progress');
  assert.equal(f.api.notBefore,11600,'The readiness minimum accounts for the hidden interval');
  f.document.hidden=false; f.listeners.get('document:visibilitychange')();
  assert.equal(f.frames.size,1); f.api.finish(); f.advance(4599);
  assert.equal(o.dataset.leaving,undefined); f.advance(1); assert.equal(o.dataset.stage,'burst');
  f.advance(1100); f.clean();

  f=fixture(); o=overlay(f); f.advance(14999); assert.equal(o.dataset.leaving,undefined);
  f.advance(1); assert.equal(o.dataset.leaving,'timeout'); f.advance(900); f.clean();
  assert.equal((await f.api.done).reason,'timeout');
  f=fixture(); f.tick(17000); f.clean();
  f=fixture(); f.api.finish(); f.advance(7600); f.tick(10100); f.clean();
  assert.equal((await f.api.done).reason,'ready','A stalled burst renderer still releases the overlay');

  f=fixture({clipSupported:false}); o=overlay(f); f.api.finish(); f.advance(7600);
  assert.equal(o.dataset.exitMode,'comic','The optimized burst does not depend on clip-path support');
  f.advance(1100); f.clean();
  f=fixture(); f.ids.get('cs-bottle').setAttribute=() => {throw new Error('SVG renderer unavailable');};
  f.advance(1400); assert.equal(f.frames.size,0,'A drawing exception stops the failing RAF');
  f.api.finish(); assert.equal(overlay(f).dataset.exitMode,'fade'); f.advance(900); f.clean();
  f=fixture(); f.ids.get('cs-bottle').setAttribute=() => {throw new Error('SVG renderer unavailable');};
  f.advance(1400); f.tick(17000); f.clean();

  f=fixture(); f.api.cancel(); f.api.cancel(); f.api.finish(); f.clean();
  f=fixture(); f.api.finish(); f.advance(7800); f.api.cancel(); f.clean();
  f=fixture({prepaint:true}); assert.equal(overlay(f),f.prepaintOverlay,'The native prepaint overlay is reused');
  assert.equal(f.document.body.children.length,1,'Reuse does not create a duplicate native overlay');
  f.api.finish(); f.advance(8700); f.clean();
  for (const size of [{width:320,height:240},{width:1920,height:1080}]) {
    f=fixture(size); f.api.finish(); f.advance(8400); o=overlay(f);
    assert.equal(o.querySelector('svg').getAttribute('preserveAspectRatio'),'xMidYMid meet');
    assert.doesNotMatch(f.ids.get('cs-belly-shell').getAttribute('transform'),/NaN|Infinity/,'Cartoon geometry stays finite across small and large windows');
    assert.equal(o.style.transitionDuration,'500ms');f.advance(400);f.clean();
  }
  f=fixture();f.api.finish();f.frame(1000);
  assert.equal(overlay(f).dataset.stage,'bottle','A stalled frame cannot skip an entire story beat');
  f.tick(17000);f.clean();
  f=fixture();o=overlay(f);f.api.finish();f.advance(8200);
  assert.equal(o.dataset.exitMode,'fade');o.events.get('transitionend')({target:o,propertyName:'transform'});
  assert.equal(overlay(f),o,'Other transitions do not finish the reveal');
  o.events.get('transitionend')({target:o,propertyName:'opacity'});f.clean();
  console.log('PASS: real RAF storyline, early/late readiness, cap twist, drinking/swelling, intact cartoon pop, confetti and CSS reveal, idle RAF stop/wake, skip/Escape, reduced motion, hidden pause, timeout/stalled renderer, drawing fallback, small-window geometry, and complete cleanup.');
})().catch(error => {console.error(error); process.exitCode=1;});
