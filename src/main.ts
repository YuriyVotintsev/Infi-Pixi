import { mount } from 'svelte';
import './style.css';
import App from './ui/App.svelte';
import { Editor } from './engine/editor';
import { InputController } from './engine/input';

if (new URLSearchParams(location.search).has('debug')) {
  import('eruda').then(({ default: eruda }) => eruda.init());
}

async function start() {
  const editor = new Editor();
  await editor.init(document.getElementById('stage')!);
  new InputController(editor);
  mount(App, { target: document.getElementById('ui')!, props: { editor } });
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
