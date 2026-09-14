export {};
const form = document.querySelector<HTMLFormElement>('#post-editor')!;
const body = document.querySelector<HTMLElement>('#rich-editor')!;
const notice = document.querySelector<HTMLElement>('#editor-load-status')!;
const fallback = body.innerHTML;
form.addEventListener('submit', (event) => {
  if (form.dataset.ready !== 'true') event.preventDefault();
});
document
  .querySelectorAll<HTMLButtonElement>('[data-editor-command]')
  .forEach((button) => (button.disabled = true));
try {
  await import('./editor');
  form.dataset.ready = 'true';
  notice.textContent = '';
  notice.hidden = true;
  document
    .querySelectorAll<HTMLButtonElement>('[data-editor-ready],[data-editor-command]')
    .forEach((button) => (button.disabled = false));
} catch (error) {
  body.innerHTML = fallback;
  body.classList.add('editor-fallback');
  notice.textContent =
    'The editor could not load. Your saved text is shown below. Refresh this page to try again.';
  notice.setAttribute('role', 'alert');
  console.error('Editor initialization failed', error);
}
