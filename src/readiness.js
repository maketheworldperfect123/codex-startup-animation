/* Codex video startup: observe only the editable composer and readiness attributes. */
(() => {
  'use strict';
  const api = window.__codexStartupVisual;
  const root = document.getElementById('root');
  if (!api || !root) return;
  const selector = '[data-codex-composer="true"][contenteditable="true"]';
  const blockers = '[hidden], [inert], [aria-hidden="true"], [aria-busy="true"]';
  let stopped = false, preparing = false, candidate = null;
  let timer = null, frameA = null, frameB = null;
  function clearCandidate() {
    if (timer !== null) window.clearTimeout(timer);
    if (frameA !== null) window.cancelAnimationFrame(frameA);
    if (frameB !== null) window.cancelAnimationFrame(frameB);
    timer = frameA = frameB = null;
    candidate = null;
  }
  function isReady(editor) {
    if (!editor || !editor.isConnected || !root.contains(editor) ||
        !editor.matches(selector) || document.visibilityState !== 'visible' ||
        editor.closest(blockers)) return false;
    const bounds = editor.getBoundingClientRect(), style = window.getComputedStyle(editor);
    return editor.getClientRects().length > 0 && bounds.width > 1 && bounds.height > 1 &&
      style.display !== 'none' && style.visibility === 'visible';
  }
  function finishAfterPaint(editor) {
    timer = null;
    if (stopped || candidate !== editor || !isReady(editor)) { check(); return; }
    frameA = window.requestAnimationFrame(() => {
      frameA = null;
      if (stopped || candidate !== editor || !isReady(editor)) { check(); return; }
      frameB = window.requestAnimationFrame(() => {
        frameB = null;
        if (stopped || candidate !== editor || !isReady(editor)) { check(); return; }
        api.finish();
        cleanup();
      });
    });
  }
  function check() {
    if (stopped) return;
    if (!preparing && root.childElementCount > 0 && !root.querySelector('.startup-loader')) {
      preparing = true;
      api.setStatus('正在准备对话界面');
    }
    const editor = Array.from(root.querySelectorAll(selector)).find(isReady) || null;
    if (editor === candidate) return;
    clearCandidate();
    if (!editor) return;
    candidate = editor;
    timer = window.setTimeout(() => finishAfterPaint(editor),
      Math.max(320, (api.notBefore ?? 0) - performance.now()));
  }
  function fallback() { if (!stopped) { clearCandidate(); check(); } }
  const observer = new MutationObserver(check);
  function cleanup() {
    if (stopped) return;
    stopped = true;
    clearCandidate();
    observer.disconnect();
    document.removeEventListener('visibilitychange', check);
    window.removeEventListener('codex:startup-visual-fallback', fallback);
  }
  observer.observe(root, {childList: true, subtree: true, attributes: true,
    attributeFilter: ['data-codex-composer', 'contenteditable', 'hidden', 'inert',
      'aria-hidden', 'aria-busy', 'class', 'style']});
  document.addEventListener('visibilitychange', check);
  window.addEventListener('codex:startup-visual-fallback', fallback);
  api.done.then(cleanup, cleanup);
  check();
})();
