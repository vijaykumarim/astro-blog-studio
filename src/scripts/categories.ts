import { api } from './dashboard';
const edit = document.querySelector<HTMLDialogElement>('#category-editor');
const remove = document.querySelector<HTMLDialogElement>('#category-delete-dialog');
function clearError(dialog: HTMLDialogElement) {
  const el = dialog.querySelector<HTMLElement>('[data-category-error]')!;
  el.hidden = true;
  el.textContent = '';
}
function showError(dialog: HTMLDialogElement, error: unknown) {
  const el = dialog.querySelector<HTMLElement>('[data-category-error]')!;
  el.textContent = (error as Error).message;
  el.hidden = false;
}
function openEditor(id = '', name = '') {
  if (!edit) return;
  edit.dataset.id = id;
  clearError(edit);
  edit.querySelector('h2')!.textContent = id ? 'Rename category' : 'Add category';
  edit.querySelector<HTMLInputElement>('input')!.value = name;
  edit.showModal();
}
document.querySelector('[data-category-add]')?.addEventListener('click', () => openEditor());
document
  .querySelectorAll<HTMLButtonElement>('[data-category-edit]')
  .forEach((button) =>
    button.addEventListener('click', () =>
      openEditor(button.dataset.categoryEdit, button.dataset.name),
    ),
  );
document.querySelectorAll<HTMLButtonElement>('[data-category-delete]').forEach((button) =>
  button.addEventListener('click', () => {
    if (!remove) return;
    clearError(remove);
    remove.dataset.id = button.dataset.categoryDelete;
    const count = Number(button.dataset.count);
    remove.querySelector('[data-delete-description]')!.textContent = count
      ? `Choose where to move the ${count} ${count === 1 ? 'post' : 'posts'} in “${button.dataset.name}”. No posts will be deleted.`
      : `Delete “${button.dataset.name}”? This category has no posts.`;
    const select = remove.querySelector<HTMLSelectElement>('select')!;
    select.value = '';
    select.required = count > 0;
    remove.querySelector<HTMLElement>('[data-replacement-field]')!.hidden = count === 0;
    for (const option of select.options) {
      option.disabled = option.value === remove.dataset.id;
      option.hidden = option.disabled;
    }
    remove.showModal();
  }),
);
document
  .querySelectorAll('[data-category-close]')
  .forEach((button) => button.addEventListener('click', () => button.closest('dialog')!.close()));
for (const dialog of [edit, remove])
  dialog?.querySelector('form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError(dialog);
    const form = event.currentTarget as HTMLFormElement;
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    if (button.disabled) return;
    button.disabled = true;
    try {
      const id = dialog.dataset.id;
      const result = await api(
        'categories' + (id ? '/' + id : ''),
        dialog === remove ? 'DELETE' : id ? 'PATCH' : 'POST',
        Object.fromEntries(new FormData(form)),
      );
      location.assign('/categories' + (result.changed ? '?updated=' + result.changed : ''));
    } catch (error) {
      showError(dialog, error);
      button.disabled = false;
    }
  });
