import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { api, toast } from './dashboard';
import { confirmAction, requestText } from './dialogs';
const form = document.querySelector<HTMLFormElement>('#post-editor')!;
let dirty = false,
  busy = false;
const status = document.querySelector<HTMLElement>('#save-status')!;
const changed = () => {
  dirty = true;
  status.textContent = 'Unsaved changes';
  stashRecovery();
};
document.querySelector('#rich-editor')!.replaceChildren();
const editor = new Editor({
  element: document.querySelector('#rich-editor')!,
  extensions: [
    StarterKit.configure({ heading: { levels: [2, 3, 4] }, link: { openOnClick: false } }),
    Image,
  ],
  content: document.querySelector<HTMLTemplateElement>('#initial-content')?.innerHTML ?? '<p></p>',
  editorProps: {
    attributes: { role: 'textbox', 'aria-label': 'Article body', 'aria-multiline': 'true' },
  },
  onUpdate: changed,
});
document.querySelector('#rich-editor')!.classList.remove('editor-fallback');
const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement;
form.addEventListener('input', changed);
function suggestSlug() {
  if (!form.dataset.id && !field('slug').dataset.touched) {
    field('slug').value = field('title')
      .value.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    updateSlug();
  }
}
field('title').addEventListener('input', suggestSlug);
suggestSlug();
function updateSlug() {
  const label = document.querySelector('[data-slug-preview]');
  if (label) label.textContent = field('slug').value || 'your-post';
}
field('slug').addEventListener('input', () => {
  field('slug').dataset.touched = 'true';
  updateSlug();
});
async function upload(file: File) {
  const body = new FormData();
  body.append('file', file);
  const response = await fetch('/api/media', { method: 'POST', body });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}
document
  .querySelector<HTMLInputElement>('#featured-upload')
  ?.addEventListener('change', async (event) => {
    const input = event.target as HTMLInputElement;
    if (!input.files?.[0]) return;
    try {
      const result = await upload(input.files[0]);
      field('image').value = result.filename;
      const img = document.querySelector<HTMLImageElement>('#featured-preview')!;
      img.src = result.url;
      img.hidden = false;
      document.querySelector<HTMLElement>('[data-image-placeholder]')!.hidden = true;
      changed();
      toast('Image uploaded. Add a description and save your draft.');
    } catch (e) {
      toast((e as Error).message);
    } finally {
      input.value = '';
    }
  });
document
  .querySelector<HTMLInputElement>('#inline-upload')
  ?.addEventListener('change', async (event) => {
    const input = event.target as HTMLInputElement;
    if (!input.files?.[0]) return;
    const alt = await requestText({
      title: 'Add an article image',
      message: 'Describe the image for readers using a screen reader.',
      label: 'Image description',
      accept: 'Insert image',
    });
    if (alt === null) {
      input.value = '';
      return;
    }
    try {
      const result = await upload(input.files[0]);
      editor.chain().focus().setImage({ src: result.url, alt }).run();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      input.value = '';
    }
  });
document.querySelectorAll<HTMLButtonElement>('[data-editor-command]').forEach((button) =>
  button.addEventListener('click', () => {
    const chain = editor.chain().focus();
    switch (button.dataset.editorCommand) {
      case 'bold':
        chain.toggleBold().run();
        break;
      case 'italic':
        chain.toggleItalic().run();
        break;
      case 'h2':
        chain.toggleHeading({ level: 2 }).run();
        break;
      case 'h3':
        chain.toggleHeading({ level: 3 }).run();
        break;
      case 'bullet':
        chain.toggleBulletList().run();
        break;
      case 'ordered':
        chain.toggleOrderedList().run();
        break;
      case 'quote':
        chain.toggleBlockquote().run();
        break;
      case 'undo':
        chain.undo().run();
        break;
      case 'redo':
        chain.redo().run();
        break;
      case 'image':
        document.querySelector<HTMLInputElement>('#inline-upload')?.click();
        break;
      case 'link':
        document.querySelector<HTMLDialogElement>('#insert-dialog')?.showModal();
        break;
    }
  }),
);
document.querySelector<HTMLDialogElement>('#insert-dialog')?.addEventListener('close', (event) => {
  if ((event.target as HTMLDialogElement).returnValue !== 'insert') return;
  const value = document.querySelector<HTMLInputElement>('#insert-url')!.value;
  if (!/^https?:\/\//i.test(value)) {
    toast('Use a complete http or https link.');
    return;
  }
  editor.chain().focus().setLink({ href: value }).run();
});
async function save() {
  if (!form.reportValidity()) throw new Error('Complete the required fields.');
  const body = {
    ...Object.fromEntries(new FormData(form)),
    categories: new FormData(form).getAll('categories'),
    html: editor.getHTML(),
    version: Number(form.dataset.version),
  };
  const post = await api(
    'posts' + (form.dataset.id ? '/' + form.dataset.id : ''),
    form.dataset.id ? 'PATCH' : 'POST',
    body,
  );
  clearRecovery();
  form.dataset.id = post.id;
  form.dataset.version = String(post.version);
  dirty = false;
  status.textContent = 'Saved just now';
  history.replaceState(null, '', '/posts/' + post.id);
  return post;
}
function lock(value: boolean) {
  busy = value;
  form
    .querySelectorAll<HTMLButtonElement>('.editor-heading button')
    .forEach((button) => (button.disabled = value));
}
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy) return;
  lock(true);
  const wasNew = !form.dataset.id;
  try {
    await save();
    toast('Draft saved.');
    if (wasNew) location.reload();
  } catch (e) {
    toast((e as Error).message);
  } finally {
    lock(false);
  }
});
document.querySelector('[data-publish]')?.addEventListener('click', async () => {
  if (busy) return;
  lock(true);
  try {
    const post = await save();
    await api('posts/' + post.id + '/publish');
    location.assign('/publishing');
  } catch (e) {
    toast((e as Error).message);
  } finally {
    lock(false);
  }
});
document.querySelector('[data-unpublish]')?.addEventListener('click', async () => {
  if (
    !(await confirmAction({
      title: 'Unpublish article?',
      message: 'Remove this article from the published website? Your saved draft will be kept.',
      accept: 'Unpublish',
    }))
  )
    return;
  try {
    await api('posts/' + form.dataset.id + '/unpublish');
    location.assign('/publishing');
  } catch (e) {
    toast((e as Error).message);
  }
});
document.querySelector('[data-delete-post]')?.addEventListener('click', async () => {
  if (
    !(await confirmAction({
      title: 'Delete draft?',
      message: 'Remove this draft from your post list?',
      accept: 'Delete draft',
    }))
  )
    return;
  try {
    await api('posts/' + form.dataset.id, 'DELETE');
    clearRecovery();
    dirty = false;
    location.assign('/');
  } catch (e) {
    toast((e as Error).message);
  }
});
// App navigation uses our own dialog. Reload recovery avoids a native beforeunload prompt.
function recoveryKey() {
  return 'blog-studio-recovery:' + form.dataset.owner + ':' + (form.dataset.id || 'new');
}
function clearRecovery() {
  try {
    sessionStorage.removeItem(recoveryKey());
  } catch {}
}
function stashRecovery() {
  if (!dirty) return;
  try {
    sessionStorage.setItem(
      recoveryKey(),
      JSON.stringify({
        version: Number(form.dataset.version),
        at: Date.now(),
        fields: Object.fromEntries(new FormData(form)),
        categories: new FormData(form).getAll('categories'),
        html: editor.getHTML(),
      }),
    );
  } catch {}
}
addEventListener('pagehide', stashRecovery);
document.addEventListener(
  'click',
  async (event) => {
    if (
      !dirty ||
      event.defaultPrevented ||
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const target = (event.target as Element).closest<HTMLAnchorElement | HTMLButtonElement>(
      'a[href],[data-signout]',
    );
    if (!target || target.closest('dialog')) return;
    if (
      target instanceof HTMLAnchorElement &&
      (target.target === '_blank' ||
        target.hasAttribute('download') ||
        target.getAttribute('href')?.startsWith('#'))
    )
      return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (
      await confirmAction({
        title: 'Leave without saving?',
        message:
          'Your unsaved changes will be discarded. Save your draft first if you want to keep them.',
        accept: 'Discard changes',
      })
    ) {
      clearRecovery();
      dirty = false;
      if (target instanceof HTMLAnchorElement) location.assign(target.href);
      else target.click();
    }
  },
  true,
);
async function restoreRecovery() {
  let saved;
  try {
    saved = JSON.parse(sessionStorage.getItem(recoveryKey()) || 'null');
  } catch {
    return;
  }
  if (!saved) return;
  if (saved.version !== Number(form.dataset.version) || Date.now() - saved.at > 86400000) {
    clearRecovery();
    return;
  }
  if (
    await confirmAction({
      title: 'Restore unsaved changes?',
      message: 'This browser tab has unsaved text from your previous visit to this editor.',
      accept: 'Restore changes',
    })
  ) {
    for (const [name, value] of Object.entries(saved.fields)) {
      const input = form.elements.namedItem(name);
      if (
        input instanceof HTMLInputElement ||
        input instanceof HTMLTextAreaElement ||
        input instanceof HTMLSelectElement
      )
        input.value = String(value);
    }
    form.querySelectorAll('input[name=categories]').forEach((input) => {
      (input as HTMLInputElement).checked = (saved.categories || []).includes(
        (input as HTMLInputElement).value,
      );
    });
    editor.commands.setContent(saved.html);
    changed();
    updateSlug();
    const image = document.querySelector<HTMLImageElement>('#featured-preview')!;
    image.src = field('image').value ? '/media/' + field('image').value : '';
    image.hidden = !field('image').value;
    document.querySelector<HTMLElement>('[data-image-placeholder]')!.hidden =
      !!field('image').value;
  } else clearRecovery();
}
void restoreRecovery();
