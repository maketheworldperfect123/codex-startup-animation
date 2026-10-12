const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/video-startup.js'), 'utf8');
const css = source.match(/style\.textContent = `([\s\S]*?)`;/)?.[1];
const markup = source.match(/overlay\.innerHTML = `([\s\S]*?)`;/)?.[1];
if (!css || !markup || css.includes('${') || markup.includes('${')) {
  throw new Error('Expected literal startup CSS and markup.');
}

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <base href="../">
  <title>Codex 卡通启动动画 · 独立演示</title>
  <style>
    html,body,#root{height:100%;margin:0}
    body{background:#101114;color:#eee;font:14px "Segoe UI",system-ui}
    .demo{height:100%;display:grid;grid-template-columns:220px 1fr}
    .rail{padding:30px;border-right:1px solid #272930;color:#9297a1}
    .conversation{display:flex;align-items:center;justify-content:center;padding:32px}
    .center{width:min(650px,90%)}
    h1{font-size:30px;font-weight:500;letter-spacing:-.8px}
    p{color:#939aa8;line-height:1.7}
    .composer{min-height:90px;margin-top:32px;border:1px solid #3b3e47;background:#1a1c23;border-radius:18px;padding:20px;outline:none}
    button{border:1px solid #3b3e47;color:#c5c9d4;background:#20222a;border-radius:8px;padding:10px 16px;cursor:pointer}
    @media(max-width:600px){.demo{grid-template-columns:1fr}.rail{display:none}}
    ${css}
    #codex-startup-visual{animation:cs-failsafe 17s step-end forwards}
    @keyframes cs-failsafe{to{visibility:hidden;pointer-events:none}}
  </style>
</head>
<body>
  <div id="root"><div class="startup-loader" role="status">正在准备独立演示…</div></div>
  <div id="codex-startup-visual" aria-label="Codex 正在启动">${markup}</div>
  <script src="src/video-startup.js"></script>
  <script src="src/readiness.js"></script>
  <script>
    // Simulate an application's editable composer becoming ready. No service is contacted.
    setTimeout(() => {
      document.getElementById('root').innerHTML = \`
        <div class="demo"><aside class="rail">Codex<br><br>独立动画演示</aside>
          <main class="conversation"><div class="center">
            <h1>今天想探索什么？</h1><p>这是本地演示输入框，内容不会发送。</p>
            <div class="composer" data-codex-composer="true" contenteditable="true" aria-label="演示输入框"></div>
            <p><button id="replay" type="button">重播启动效果</button></p>
          </div></main></div>\`;
      document.getElementById('replay').addEventListener('click', () => location.reload());
    }, 3000);
  </script>
</body>
</html>
`;
fs.mkdirSync(path.join(root, 'demo'), {recursive: true});
fs.writeFileSync(path.join(root, 'demo/index.html'), html);
console.log('Built demo/index.html from the video overlay source.');
