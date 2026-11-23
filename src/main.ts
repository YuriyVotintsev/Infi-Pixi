import { mount } from 'svelte';
import './style.css';
import App from './ui/App.svelte';
import { Editor } from './engine/editor';
import { InputController } from './engine/input';
import { startUpdateChecks } from './ui/updates';
import { EXTENSION, openFromFile } from './engine/fileio';

if (new URLSearchParams(location.search).has('debug')) {
  import('eruda').then(({ default: eruda }) => eruda.init());
}

async function start() {
  const editor = new Editor();
  await editor.init(document.getElementById('stage')!);
  new InputController(editor);
  mount(App, { target: document.getElementById('ui')!, props: { editor } });
  startUpdateChecks();

  // Desktop: paste an image (Ctrl+V with an image on the clipboard) or drop a file → reference.
  window.addEventListener('paste', (e) => {
    const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    e.preventDefault();
    if (file) editor.addReference(file, file.name.replace(/\.[^.]+$/, '') || 'Вставка');
    else editor.pasteSelection();
  });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    for (const file of e.dataTransfer?.files ?? []) {
      if (file.name.toLowerCase().endsWith(EXTENSION)) {
        openFromFile(editor, file);
        return;
      }
      if (file.type.startsWith('image/')) editor.addReference(file, file.name.replace(/\.[^.]+$/, ''));
    }
  });
  // Handy for debugging from the eruda console.
  (window as unknown as { editor: Editor }).editor = editor;
}

start().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML(
    'beforeend',
    `<pre style="position:fixed;inset:16px;color:#f66;white-space:pre-wrap;z-index:99">${String(e?.stack ?? e)}</pre>`,
  );
});
