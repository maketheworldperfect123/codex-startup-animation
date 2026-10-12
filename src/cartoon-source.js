/* Native SVG cartoon, isolated from the Codex React tree. */
(() => {
  'use strict';
  window.__codexStartupVisual?.cancel();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const started = performance.now(), timers = new Set();
  const STORY = 7600, BURST = 1000;
  let disposed = false, requested = false, fading = false, failed = false;
  let raf = 0, lastFrame = started, elapsed = 0, burstTime = -1;
  let paused = 0, hiddenAt = document.hidden ? started : null;
  let resolveDone;
  const done = new Promise(resolve => { resolveDone = resolve; });
  const later = (fn, delay) => {
    const id = setTimeout(() => { timers.delete(id); fn(); }, delay);
    timers.add(id); return id;
  };
  const style = document.createElement('style');
  style.id = 'codex-startup-visual-style';
  style.textContent = `
    #codex-startup-visual { position:fixed; inset:0; z-index:2147483647; overflow:hidden;
      background:#f6f5e9; color:#152723; isolation:isolate; opacity:1; contain:layout paint;
      font-family:"Arial Rounded MT Bold","Microsoft YaHei","Segoe UI",sans-serif;
      transition:opacity 220ms ease; }
    #codex-startup-visual::before { content:""; position:absolute; inset:0;
      background:radial-gradient(circle,#6ca98b30 1.4px,transparent 1.8px) 0 0/18px 18px;
      pointer-events:none; }
    #codex-startup-visual .cs-scene { position:absolute; inset:0; width:100%; height:100%;
      display:block; overflow:visible; }
    #codex-startup-visual .cs-ink { stroke:#18322a; stroke-linecap:round; stroke-linejoin:round; }
    #codex-startup-visual .cs-type { font-family:"Arial Rounded MT Bold","Microsoft YaHei",sans-serif;
      font-weight:900; paint-order:stroke fill; }
    #codex-startup-visual .cs-ui { position:absolute; top:22px; left:28px; right:28px;
      display:flex; align-items:center; justify-content:space-between; gap:12px; pointer-events:none; }
    #codex-startup-visual .cs-brand { font-size:13px; font-weight:900; letter-spacing:2px; }
    #codex-startup-visual .cs-chapter { background:#fffaf0; border:2px solid #18322a;
      border-radius:999px; padding:7px 14px; font-size:12px; font-weight:800;
      box-shadow:3px 3px 0 #18322a; }
    #codex-startup-visual .cs-footer { position:absolute; bottom:20px; left:28px; right:28px;
      display:flex; gap:12px; align-items:center; justify-content:space-between; }
    #codex-startup-visual .cs-status { font-size:12px; font-weight:700; color:#486158; }
    #codex-startup-visual .cs-skip { appearance:none; background:#fffaf0; color:#18322a;
      border:2px solid #18322a; border-radius:999px; padding:8px 14px;
      font:700 12px/1.2 "Microsoft YaHei","Segoe UI",sans-serif; cursor:pointer; }
    #codex-startup-visual .cs-skip:focus-visible { outline:3px solid #00a66c; outline-offset:3px; }
    #codex-startup-visual[data-leaving] { pointer-events:none; }
    #codex-startup-visual[data-leaving="ready"] { will-change:opacity; }
    #codex-startup-visual[data-exit-mode="fade"] { opacity:0; }
    #codex-startup-visual[data-exit-mode="comic"] .cs-ui,
    #codex-startup-visual[data-exit-mode="comic"] .cs-footer { opacity:0; }
    @media (max-width:600px) { #codex-startup-visual .cs-ui { top:16px; left:16px; right:16px; }
      #codex-startup-visual .cs-brand { font-size:10px; letter-spacing:1px; }
      #codex-startup-visual .cs-chapter { font-size:10px; padding:6px 9px; }
      #codex-startup-visual .cs-footer { bottom:16px; left:16px; right:16px; }
      #codex-startup-visual .cs-status { font-size:10px; max-width:55%; }
      #codex-startup-visual .cs-skip { font-size:10px; padding:7px 10px; } }
    @media (max-height:440px) { #codex-startup-visual .cs-ui { top:10px; }
      #codex-startup-visual .cs-footer { bottom:10px; } }
    @media (prefers-reduced-motion:reduce) { #codex-startup-visual { transition-duration:120ms; } }
  `;
  const overlay = document.getElementById('codex-startup-visual') || document.createElement('div');
  overlay.id = 'codex-startup-visual';
  overlay.setAttribute('aria-label', 'Codex 卡通喝水启动动画，点击或按 Escape 跳过');
  overlay.innerHTML = `
    <svg class="cs-scene" viewBox="0 0 1400 850" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs>
        <pattern id="cs-comic-dots" width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="4" cy="4" r="2.2" fill="#148458" opacity=".16"/></pattern>
        <linearGradient id="cs-water-glass" x1="0" x2="1"><stop stop-color="#8cddd5" stop-opacity=".68"/><stop offset=".3" stop-color="#ebffff" stop-opacity=".8"/><stop offset=".75" stop-color="#8bd6d7" stop-opacity=".52"/><stop offset="1" stop-color="#55bebb" stop-opacity=".75"/></linearGradient>
        <linearGradient id="cs-liquid" x2="0" y2="1"><stop stop-color="#72e5e1"/><stop offset="1" stop-color="#37b2ca"/></linearGradient>
        <clipPath id="cs-bottle-clip"><path d="M-50-243H50L55-204C57-180 112-169 124-126L132 214Q132 266 88 274H-88Q-132 266-132 214L-124-126C-112-169-57-180-55-204Z"/></clipPath>
        <clipPath id="cs-belly-clip"><ellipse id="cs-belly-mask" cx="0" cy="18" rx="29" ry="49"/></clipPath>
        <g id="cs-star-shape"><path d="M0-18L5-6L18-6L8 3L11 17L0 9L-11 17L-8 3L-18-6L-5-6Z" fill="#ffcf4a" stroke="#18322a" stroke-width="3" stroke-linejoin="round"/></g>
      </defs>
      <g id="cs-paper-panel">
        <path d="M78 93L1288 83L1322 756L105 771Z" fill="#ddf2df" stroke="#18322a" stroke-width="5" stroke-linejoin="round"/>
        <path d="M78 93L1288 83L1322 756L105 771Z" fill="url(#cs-comic-dots)"/>
        <path d="M102 708Q675 663 1308 710L1314 754L105 771Z" fill="#a1d8b9"/>
        <path d="M112 728Q680 695 1306 729" fill="none" stroke="#18322a" stroke-width="3" opacity=".45"/>
        <path d="M130 127L233 121M1240 117L1263 200M133 672L139 719" fill="none" stroke="#fffdf3" stroke-width="8" stroke-linecap="round"/>
        <path d="M158 385L251 425M182 273L272 346M223 181L288 263M1194 239L1103 301M1241 372L1140 398M1254 552L1160 532" fill="none" stroke="#69ad87" stroke-width="4" stroke-linecap="round" opacity=".45"/>
        <g fill="#fffef5" stroke="#18322a" stroke-width="3"><path d="M325 235C295 223 290 193 313 179C311 149 347 140 367 157C386 142 414 152 417 176C447 176 454 202 434 218C414 239 374 230 325 235Z"/><path d="M1068 642C1042 628 1051 605 1073 603C1088 581 1111 588 1119 602C1149 595 1163 621 1144 637Z"/></g>
        <g class="cs-type" fill="#244e3a"><text x="172" y="205" font-size="22" transform="rotate(-7 172 205)">补水！</text><text x="1180" y="670" font-size="18" transform="rotate(8 1180 670)">灵感 +1</text></g>
      </g>
      <ellipse id="cs-bottle-shadow" cx="665" cy="730" rx="182" ry="26" fill="#173e2b" opacity=".14"/>
      <ellipse id="cs-man-shadow" cx="970" cy="730" rx="114" ry="20" fill="#173e2b" opacity="0"/>
      <g id="cs-giant-note" class="cs-type" transform="translate(930 265)">
        <path d="M-68-69L179-56L207 62L-41 81L-63 13L-99 4L-68-7Z" fill="#fff4c9" stroke="#18322a" stroke-width="4"/>
        <text x="-33" y="6" font-size="59" fill="#126e46" transform="rotate(-5)">1.55 L</text>
        <text x="-23" y="44" font-size="18" fill="#18322a" transform="rotate(-5)">超大瓶 · 超大灵感</text>
        <path d="M-118 76Q-161 125-183 179M-183 179L-191 154M-183 179L-157 169" fill="none" stroke="#18322a" stroke-width="5" stroke-linecap="round"/>
      </g>
      <g id="cs-bottle" transform="translate(665 435) scale(1.12)" class="cs-ink">
        <path d="M-50-243H50L55-204C57-180 112-169 124-126L132 214Q132 266 88 274H-88Q-132 266-132 214L-124-126C-112-169-57-180-55-204Z" fill="url(#cs-water-glass)" stroke-width="6"/>
        <g clip-path="url(#cs-bottle-clip)" stroke="none"><rect id="cs-bottle-water" x="-140" y="-194" width="280" height="485" fill="url(#cs-liquid)" opacity=".65"/>
          <path id="cs-water-surface" d="M-132-194Q-64-209 0-194T132-194" fill="none" stroke="#e6fffc" stroke-width="6"/>
          <path d="M-94-143L-94 229" stroke="#fff" stroke-width="15" opacity=".52"/>
          <path d="M99-132L99 204" stroke="#288e9a" stroke-width="7" opacity=".36"/>
          <g fill="none" stroke="#548e8d" stroke-width="3" opacity=".55"><path d="M-129 171Q0 202 129 171M-130 196Q0 224 130 196M-125 224Q0 248 125 224M-124-116Q0-82 124-116M-126-87Q0-53 126-87"/></g>
          <g fill="#e9ffff" opacity=".72"><circle cx="64" cy="142" r="8"/><circle cx="32" cy="200" r="5"/><circle cx="-65" cy="-113" r="5"/></g>
        </g>
        <path d="M-132-9Q0 8 132-9L133 132Q0 151-133 132Z" fill="#019a58" stroke-width="4"/>
        <path d="M-129-9Q0 9 129-9L128 11Q0 29-128 11Z" fill="#64c481" stroke="none"/>
        <path d="M-130 119Q0 138 130 119" fill="none" stroke="#bff1ca" stroke-width="3"/>
        <g class="cs-type" text-anchor="middle" stroke="none"><text x="0" y="68" font-size="55" fill="#fffdf1">怡宝</text>
          <text x="0" y="96" font-size="20" fill="#efffd6" letter-spacing="1">C'estbon</text>
          <text x="0" y="166" font-size="17" fill="#135740">饮用纯净水 · 1.55 L</text></g>
        <path d="M-52-243H52M-54-223H54" fill="none" stroke-width="4"/>
        <g id="cs-cap" transform="translate(0 0)"><rect x="-60" y="-291" width="120" height="49" rx="10" fill="#008d4a" stroke-width="5"/>
          <ellipse cx="0" cy="-289" rx="58" ry="11" fill="#50c371" stroke-width="4"/>
          <path d="M-42-278V-250M-22-278V-250M0-278V-250M22-278V-250M42-278V-250" fill="none" stroke="#075e34" stroke-width="4"/></g>
      </g>
      <g id="cs-free-cap" transform="translate(630 200) rotate(-20)" opacity="0" class="cs-ink"><rect x="-36" y="-15" width="72" height="30" rx="6" fill="#008d4a" stroke-width="4"/><ellipse cx="0" cy="-14" rx="35" ry="7" fill="#50c371" stroke-width="3"/><path d="M-17-7V11M0-7V11M17-7V11" stroke="#075e34" stroke-width="3"/></g>
      <g id="cs-man" transform="translate(1110 490)" opacity="0" class="cs-ink">
        <g id="cs-legs" fill="none" stroke-width="15"><path id="cs-leg-left" d="M-15 85L-45 167L-56 230L-98 232"/><path id="cs-leg-right" d="M15 85L48 161L57 230L102 230"/></g>
        <path d="M0-126L0 107" fill="none" stroke-width="14"/>
        <g id="cs-belly-shell">
          <ellipse id="cs-belly" cx="0" cy="18" rx="29" ry="49" fill="#fff8d7" stroke-width="8" vector-effect="non-scaling-stroke"/>
          <g clip-path="url(#cs-belly-clip)" stroke="none"><rect id="cs-belly-water" x="-200" y="0" width="400" height="200" fill="#71dcdb" opacity=".82"/><path id="cs-belly-wave" d="M-200 0Q-150-9-100 0T0 0T100 0T200 0" fill="none" stroke="#f7ffff" stroke-width="5" vector-effect="non-scaling-stroke"/></g>
          <path id="cs-belly-gloss" d="M-17.98-8.46Q-23.2 2.32-21.17 10.65" fill="none" stroke="#fff" stroke-width="8" opacity=".8" vector-effect="non-scaling-stroke"/>
        </g>
        <path id="cs-arm-left" d="M-3-87Q-70-32-67 83" fill="none" stroke-width="13"/>
        <path id="cs-arm-right" d="M4-89Q73-37 70 85" fill="none" stroke-width="13"/>
        <circle id="cs-hand-left" cx="-67" cy="83" r="12" fill="#fff8d7" stroke-width="5"/>
        <circle id="cs-hand-right" cx="70" cy="85" r="12" fill="#fff8d7" stroke-width="5"/>
        <circle cx="0" cy="-181" r="58" fill="#fff8d7" stroke-width="7"/>
        <g id="cs-face-normal"><path id="cs-eyes" d="M-25-194L-20-193M17-194L22-193" fill="none" stroke-width="9"/>
          <path id="cs-mouth" d="M-19-167Q-6-148 14-163" fill="none" stroke-width="6"/>
          <ellipse cx="-34" cy="-171" rx="12" ry="6" fill="#fca391" stroke="none"/><ellipse cx="30" cy="-171" rx="12" ry="6" fill="#fca391" stroke="none"/></g>
        <g id="cs-face-dizzy" opacity="0"><use href="#cs-star-shape" transform="translate(-22 -191) scale(.58)"/><use href="#cs-star-shape" transform="translate(22 -191) scale(.58)"/><path d="M-17-158Q0-171 17-158" fill="none" stroke-width="5"/></g>
        <g class="cs-type" text-anchor="middle" stroke="none"><rect x="-56" y="-275" width="112" height="32" rx="9" fill="#18322a"/><text x="0" y="-252" font-size="22" fill="#faffef" letter-spacing="1">codex</text></g>
      </g>
      <g id="cs-uncap-notes" opacity="0" class="cs-type" fill="#126e46" stroke="#fffef4" stroke-width="6"><text x="529" y="172" font-size="35" transform="rotate(-12 529 172)">拧—开！</text><path d="M651 197Q722 164 734 220M734 220L712 208M734 220L742 197" fill="none" stroke="#18322a" stroke-width="4" stroke-linecap="round"/></g>
      <g id="cs-gulp" opacity="0" class="cs-type" fill="#196c58" stroke="#fffef4" stroke-width="7"><text x="1115" y="220" font-size="47" transform="rotate(11 1115 220)">咕嘟</text><text x="1162" y="284" font-size="31" transform="rotate(-6 1162 284)">咕嘟！</text></g>
      <g id="cs-droplets" opacity="0" fill="#68dae1" stroke="#18322a" stroke-width="3"><path d="M918 328Q899 347 908 355Q923 366 931 352Q936 343 918 328Z"/><path d="M891 351Q878 366 884 372Q895 380 900 369Q904 362 891 351Z"/><path d="M936 364Q923 378 930 385Q941 391 946 381Q950 372 936 364Z"/></g>
      <g id="cs-pressure" opacity="0" class="cs-ink" fill="none" stroke-width="5"><path d="M766 496L732 470M774 549L731 553M1178 486L1214 459M1170 559L1215 572"/><path d="M836 401L821 378M1109 409L1128 385"/></g>
      <g id="cs-belly-note" opacity="0" class="cs-type" transform="translate(455 555) rotate(-8)"><path d="M-148-38L145-43L159 45L-151 46Z" fill="#fff4c9" stroke="#18322a" stroke-width="4"/><text x="0" y="2" font-size="31" text-anchor="middle" fill="#18322a">容量突破想象</text><text x="0" y="29" font-size="16" text-anchor="middle" fill="#237c51">100% → 200% → ∞</text></g>
      <g id="cs-burst" transform="translate(970 535) scale(0)" opacity="0" class="cs-ink">
        <path d="M-190-77L-267-122L-167-143L-194-220L-95-175L-54-267L7-187L91-263L114-167L217-210L190-111L280-57L192-14L267 75L166 91L180 194L91 157L25 258L-17 173L-118 242L-122 140L-238 157L-190 63L-284 19L-189-27Z" fill="#ffcf4a" stroke-width="7"/>
        <path d="M-117-108C-133-172-54-197-20-148C13-194 87-163 87-121C158-160 208-95 174-50C229-12 195 57 151 56C186 119 119 158 80 117C63 185-23 184-43 128C-100 175-170 129-149 80C-220 83-229 7-176-18C-223-68-174-135-117-108Z" fill="#fffdf2" stroke-width="6"/>
        <g class="cs-type" stroke="#18322a" stroke-width="10" fill="#f8a84b" text-anchor="middle"><text x="0" y="42" font-size="123" transform="rotate(-8)">嘭！</text></g>
        <g class="cs-type" stroke="none" text-anchor="middle" fill="#18322a"><text x="0" y="93" font-size="22">灵感溢出来啦</text></g>
      </g>
      <g id="cs-confetti" opacity="0">
        <g class="cs-pop-bit" data-angle="-155" data-distance="365"><use href="#cs-star-shape" transform="scale(1.3)"/></g>
        <g class="cs-pop-bit" data-angle="-125" data-distance="350"><rect x="-8" y="-16" width="16" height="32" rx="3" fill="#06a66c" stroke="#18322a" stroke-width="3"/></g>
        <g class="cs-pop-bit" data-angle="-92" data-distance="370"><use href="#cs-star-shape" transform="scale(.9)"/></g>
        <g class="cs-pop-bit" data-angle="-60" data-distance="348"><rect x="-12" y="-7" width="24" height="14" rx="2" fill="#fa9f86" stroke="#18322a" stroke-width="3"/></g>
        <g class="cs-pop-bit" data-angle="-30" data-distance="295"><use href="#cs-star-shape" transform="scale(1.15)"/></g>
        <g class="cs-pop-bit" data-angle="15" data-distance="307"><rect x="-6" y="-15" width="12" height="30" rx="2" fill="#68dbe1" stroke="#18322a" stroke-width="3"/></g>
        <g class="cs-pop-bit" data-angle="55" data-distance="320"><use href="#cs-star-shape" transform="scale(.85)"/></g>
        <g class="cs-pop-bit" data-angle="112" data-distance="300"><rect x="-12" y="-7" width="24" height="14" rx="2" fill="#06a66c" stroke="#18322a" stroke-width="3"/></g>
        <g class="cs-pop-bit" data-angle="151" data-distance="345"><use href="#cs-star-shape" transform="scale(.8)"/></g>
        <g class="cs-pop-bit" data-angle="178" data-distance="380"><rect x="-6" y="-15" width="12" height="30" rx="2" fill="#fa9f86" stroke="#18322a" stroke-width="3"/></g>
      </g>
      <g class="cs-type" text-anchor="middle" fill="#18322a"><text id="cs-caption" x="700" y="813" font-size="30" letter-spacing="2">一瓶水，开启一个宇宙。</text></g>
    </svg>
    <div class="cs-ui"><span class="cs-brand">CODEX / 灵感补给站</span><span class="cs-chapter">01 · 超大瓶登场</span></div>
    <div class="cs-footer"><span class="cs-status" role="status" aria-live="polite">正在开启对话界面</span><button type="button" class="cs-skip">点击 / Esc 跳过</button></div>
  `;
  document.head.append(style);
  if (!overlay.isConnected) document.body.append(overlay);
  const byId = id => overlay.querySelector('#cs-' + id);
  const nodes = {};
  for (const id of ['bottle','bottle-shadow','bottle-water','water-surface','cap','free-cap',
    'giant-note','man','man-shadow','belly-shell','belly','belly-mask','belly-water','belly-wave','belly-gloss',
    'arm-left','arm-right','hand-left','hand-right','leg-left','leg-right','face-normal','face-dizzy',
    'eyes','mouth','uncap-notes','gulp','droplets','pressure','belly-note','burst','confetti','caption']) nodes[id] = byId(id);
  const status = overlay.querySelector('.cs-status'), chapter = overlay.querySelector('.cs-chapter');
  const bits = Array.from(overlay.querySelectorAll('.cs-pop-bit'),node => ({node,
    angle:Number(node.getAttribute('data-angle'))*Math.PI/180,
    distance:Number(node.getAttribute('data-distance'))}));
  const clamp = n => Math.max(0, Math.min(1, n));
  const phase = (t, a, b) => clamp((t - a) / (b - a));
  const ease = n => 1 - Math.pow(1 - clamp(n), 3);
  const lerp = (a, b, t) => a + (b - a) * t;
  // Avoid invalidating SVG paint or live text when a held pose has not changed.
  const writes = new WeakMap();
  function write(node, key, value) {
    if (!node) return;
    value=String(value);
    let previous=writes.get(node);
    if (!previous) { previous={}; writes.set(node,previous); }
    if (previous[key]===value) return;
    previous[key]=value;
    if (key==='text') node.textContent=value;
    else if (key==='stage') node.dataset.stage=value;
    else node.setAttribute(key,value);
  }
  const attr = (id, key, value) => write(nodes[id],key,typeof value==='number'?value.toFixed(2):value);
  const alpha = (id, value) => attr(id, 'opacity', value.toFixed(3));
  const trans = (id, value) => attr(id, 'transform', value);
  function belly(rx, ry, fill) {
    trans('belly-shell','translate(0 18) scale('+(rx/29).toFixed(4)+' '+(ry/49).toFixed(4)+') translate(0 -18)');
    const y=(18+49*(1-fill*1.68)).toFixed(2);
    trans('belly-water','translate(0 '+y+')');
    trans('belly-wave','translate(0 '+y+')');
  }
  function setHand(side, x, y, bend) {
    attr('arm-'+side,'d','M'+(side==='left'?-3:4)+'-87Q'+bend+' '+(y-20)+' '+x+' '+y);
    attr('hand-'+side,'cx',x); attr('hand-'+side,'cy',y);
  }
  function scene(t) {
    if (!nodes.bottle || !nodes.man) throw new Error('Cartoon artwork unavailable');
    const settle = ease(phase(t, 1300, 2600)), enter = ease(phase(t, 1850, 2800));
    const twist = phase(t, 2900, 4100), lift = ease(phase(t, 4000, 4700));
    const drink = phase(t, 4700, STORY), gulp = Math.sin(Math.max(0,t-4700)/145);
    const manX = lerp(1200,970,enter), manY = 490 + (t<2800?Math.sin(t/100)*(1-enter)*10:0);
    const bottleX = lerp(665,676,settle), bottleY = lerp(435,475,settle), bottleScale = lerp(1.12,.84,settle);
    const pourAngle = 112 + (drink>0?gulp*2:0), radians=pourAngle*Math.PI/180;
    const drinkingX=944-Math.sin(radians)*244*.75, drinkingY=323+Math.cos(radians)*244*.75;
    const bx=lerp(bottleX,drinkingX,lift), by=lerp(bottleY,drinkingY,lift);
    const bs=lerp(bottleScale,.75,lift), br=pourAngle*lift;
    trans('bottle','translate('+bx.toFixed(2)+' '+by.toFixed(2)+') rotate('+br.toFixed(2)+') scale('+bs.toFixed(3)+')');
    if (enter>0 || t===0) trans('man','translate('+manX.toFixed(2)+' '+manY.toFixed(2)+')');
    alpha('man',enter); alpha('man-shadow',enter*.14); alpha('giant-note',1-settle);
    attr('bottle-shadow','rx',lerp(182,118,settle)*(1-lift*.8));
    attr('bottle-shadow','opacity',.14*(1-lift));
    const capLift = ease(phase(t, 3500, 4100))*90;
    trans('cap','translate(0 '+(-capLift)+') rotate('+(twist*720)+' 0 -267)');
    alpha('cap',1-phase(t,4050,4300));
    const capFly=phase(t,4100,5100);
    alpha('free-cap',t>=4100?(1-capFly):0);
    trans('free-cap','translate('+(676-190*ease(capFly))+' '+(172-80*Math.sin(capFly*Math.PI))+') rotate('+(-20-capFly*210)+')');
    const reach = ease(phase(t,2750,3200));
    const capHandX=676-manX, capHandY=475-267*.84-capLift*.84-manY;
    const angle=br*Math.PI/180;
    const bottlePoint=(x,y) => ({x:bx+bs*(x*Math.cos(angle)-y*Math.sin(angle))-manX,
      y:by+bs*(x*Math.sin(angle)+y*Math.cos(angle))-manY});
    const neckGrip=bottlePoint(0,-67), baseGrip=bottlePoint(127,80);
    const handLX=lerp(lerp(-67,capHandX,reach),neckGrip.x,lift), handLY=lerp(lerp(83,capHandY,reach),neckGrip.y,lift);
    setHand('left',handLX,handLY,Math.min(-55,handLX*.65));
    const handRX=lerp(70,baseGrip.x,lift), handRY=lerp(85,baseGrip.y,lift);
    setHand('right',handRX,handRY,lerp(90,baseGrip.x*.6,lift));
    const inflate=ease(drink)*.7+drink*.3, wobble=drink>0?gulp*2.2*drink:0;
    belly(lerp(29,177,inflate)+wobble,lerp(49,164,inflate)-wobble*.45,drink);
    attr('leg-left','d','M-15 '+lerp(85,150,inflate)+'L-45 189L-56 230L-98 232');
    attr('leg-right','d','M15 '+lerp(85,150,inflate)+'L48 189L57 230L102 230');
    attr('eyes','d',drink>.77?'M-30-194L-17-184M17-184L30-194':drink>0?'M-31-194Q-23-201-15-194M13-194Q21-201 29-194':'M-25-194L-20-193M17-194L22-193');
    attr('mouth','d',lift>.7?'M-36-168Q-25-156-17-166':'M-19-167Q-6-148 14-163');
    alpha('uncap-notes',Math.sin(twist*Math.PI));
    alpha('gulp',drink>0?.7+.3*Math.abs(gulp):0);
    trans('gulp','translate(0 '+(drink>0?gulp*5:0)+')');
    alpha('droplets',drink>0?.35+.65*Math.abs(gulp):0);
    trans('droplets','translate(0 '+(drink>0?(t%350)/35:0)+')');
    const waterY=lerp(-194,225,drink);
    const waterTranslate='translate(0 '+(waterY+194).toFixed(2)+')';
    trans('bottle-water',waterTranslate); trans('water-surface',waterTranslate);
    alpha('pressure',phase(t,6200,7000)*(.65+.35*Math.abs(gulp)));
    alpha('belly-note',ease(phase(t,5700,6300)));
    let stage, title, caption;
    if (t<1850) { stage='bottle'; title='01 · 超大瓶登场'; caption='一瓶水，开启一个宇宙。'; }
    else if (t<2900) { stage='enter'; title='02 · Codex 来了'; caption='今天的 Codex，有点渴。'; }
    else if (t<4700) { stage='uncap'; title='03 · 拧开灵感'; caption='瓶盖一拧，准备开喝！'; }
    else if (t<STORY) { stage='drink'; title='04 · 咕嘟 × 无限'; caption=drink>.67?'容量，正在突破想象。':'咕嘟、咕嘟……灵感蓄满中。'; }
    else { stage='full'; title='05 · 灵感满格'; caption='再等一下，灵感就要溢出来了！'; }
    write(overlay,'stage',stage); write(chapter,'text',title); write(nodes.caption,'text',caption);
  }
  function burst(t) {
    const pop=ease(phase(t,0,240)), shrink=ease(phase(t,90,290));
    write(overlay,'stage',t<500?'burst':'reveal');
    write(chapter,'text','06 · 嘭！灵感溢出'); write(nodes.caption,'text','喝饱了，开聊吧！');
    alpha('gulp',0); alpha('droplets',0); alpha('pressure',0); alpha('belly-note',0);
    alpha('face-normal',1-shrink); alpha('face-dizzy',shrink);
    belly(lerp(177,35,shrink),lerp(164,50,shrink),1-shrink);
    const bounce=Math.sin(phase(t,70,430)*Math.PI)*64;
    trans('man','translate('+(970+shrink*145)+' '+(490-bounce)+') rotate('+(shrink*-12)+')');
    setHand('left',-89,-58,-73); setHand('right',90,-55,76);
    attr('leg-left','d','M-15 85L-45 167L-56 230L-98 232');
    attr('leg-right','d','M15 85L48 161L57 230L102 230');
    const cloudScale=lerp(.08,1.04,pop)*(1+.025*Math.sin(t/40));
    trans('burst','translate(970 535) rotate('+(-6+6*pop)+') scale('+cloudScale+')');
    alpha('burst',1); alpha('confetti',1-phase(t,500,800));
    for (const bit of bits) {
      const distance=bit.distance*pop;
      write(bit.node,'transform','translate('+(970+Math.cos(bit.angle)*distance).toFixed(2)+' '+(535+Math.sin(bit.angle)*distance).toFixed(2)+') rotate('+(t*.35).toFixed(2)+')');
    }
  }
  function stopFrame() { cancelAnimationFrame(raf); raf=0; }
  function cleanup(reason) {
    if (disposed) return;
    disposed=true; stopFrame(); timers.forEach(clearTimeout); timers.clear();
    removeEventListener('keydown',key,true);
    document.removeEventListener('visibilitychange',visibility);
    overlay.removeEventListener('pointerdown',skip);
    overlay.removeEventListener('transitionend',ended);
    overlay.remove(); style.remove();
    if (window.__codexStartupVisual===api) delete window.__codexStartupVisual;
    resolveDone({reason});
    dispatchEvent(new CustomEvent('codex:startup-visual-removed',{detail:{reason}}));
  }
  function fade(reason, duration) {
    if (disposed || fading) return;
    fading=true; stopFrame(); overlay.dataset.leaving=reason; write(overlay,'stage','leaving');
    overlay.dataset.exitMode='fade';
    overlay.style.transitionDuration=duration+'ms';
    later(() => cleanup(reason),duration+50);
  }
  function startBurst() {
    if (disposed || fading || burstTime>=0 || document.hidden) return;
    try {
      burstTime=0; overlay.dataset.leaving='ready'; overlay.dataset.exitMode='comic';
      write(status,'text','正在进入对话…'); burst(0);
      lastFrame=performance.now();
      if (!raf) raf=requestAnimationFrame(frame);
      // A wall-clock fallback also releases a stalled or hidden animation renderer.
      later(() => cleanup('ready'),BURST+1500);
    } catch { failed=true; fade('ready',850); }
  }
  function frame(now) {
    raf=0;
    if (disposed || fading || document.hidden) return;
    // A busy app renderer should not jump over the cap twist or the comic pop.
    const delta=Math.min(100,Math.max(0,now-lastFrame)); lastFrame=now;
    try {
      if (burstTime>=0) {
        burstTime=Math.min(BURST/2,burstTime+delta); burst(burstTime);
        if (burstTime>=BURST/2) { fade('ready',BURST/2); return; }
      } else {
        elapsed=Math.min(STORY,elapsed+delta); scene(elapsed);
        if (elapsed>=STORY) {
          if (requested) startBurst();
          else return; // Keep the full pose while Codex completes its first render.
        }
      }
    } catch { failed=true; stopFrame(); if (requested) fade('ready',850); return; }
    if (!disposed && !fading && !raf) raf=requestAnimationFrame(frame);
  }
  function finish() {
    if (disposed || requested || fading) return done;
    requested=true;
    if (reduced) later(() => fade('ready',120),Math.max(0,120-(performance.now()-started)));
    else if (failed) fade('ready',850);
    else if (elapsed>=STORY) startBurst();
    return done;
  }
  function skip(event) { event?.preventDefault?.(); event?.stopPropagation?.(); fade('skipped',reduced?120:220); }
  function key(event) { if (event.key==='Escape' && !disposed) skip(event); }
  function ended(event) {
    if (fading && event.target===overlay && event.propertyName==='opacity') cleanup(overlay.dataset.leaving);
  }
  function visibility() {
    stopFrame();
    const now=performance.now();
    if (document.hidden) { if (hiddenAt===null) hiddenAt=now; }
    else {
      if (hiddenAt!==null) { paused+=now-hiddenAt; hiddenAt=null; }
      lastFrame=now;
      if (!disposed && !fading && !reduced && !failed && (elapsed<STORY || burstTime>=0 || requested)) raf=requestAnimationFrame(frame);
    }
  }
  const api = {finish,cancel:() => cleanup('cancelled'),done,
    get notBefore() { return started+(reduced?120:STORY)+paused+(hiddenAt===null?0:performance.now()-hiddenAt); },
    setStatus(text) { if (!disposed && !fading && burstTime<0 && typeof text==='string') write(status,'text',text.slice(0,80)); }};
  window.__codexStartupVisual=api;
  overlay.addEventListener('pointerdown',skip);
  overlay.addEventListener('transitionend',ended);
  addEventListener('keydown',key,true);
  document.addEventListener('visibilitychange',visibility);
  later(() => fade('timeout',reduced?120:850),15000);
  later(() => cleanup('timeout'),17000);
  try { scene(reduced?2600:0); } catch { failed=true; }
  if (!reduced && !failed && !document.hidden) raf=requestAnimationFrame(frame);
})();
