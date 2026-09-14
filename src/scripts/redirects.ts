import { api } from './dashboard';
import { confirmAction } from './dialogs';
const form = document.querySelector<HTMLFormElement>('#redirect-form')!;
const error = document.querySelector<HTMLElement>('#migration-error')!;
const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement;
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  error.hidden = true;
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  button.disabled = true;
  try {
    await api(
      'redirects' + (field('id').value ? '/' + field('id').value : ''),
      field('id').value ? 'PATCH' : 'POST',
      {
        from: field('from').value,
        to: field('to').value,
        status: Number(field('status').value),
        enabled: field('enabled').checked,
      },
    );
    location.reload();
  } catch (e) {
    error.textContent = (e as Error).message;
    error.hidden = false;
    button.disabled = false;
  }
});
form.addEventListener('reset', () => {
  field('id').value = '';
  document.querySelector('#redirect-editor-title')!.textContent = 'Add a redirect';
});
document.querySelectorAll<HTMLButtonElement>('[data-redirect-edit]').forEach((button) =>
  button.addEventListener('click', () => {
    const row = JSON.parse(button.dataset.redirectEdit!);
    field('id').value = row.id;
    field('from').value = row.source;
    field('to').value = row.destination;
    field('status').value = String(row.status);
    field('enabled').checked = !!row.enabled;
    document.querySelector('#redirect-editor-title')!.textContent = 'Edit redirect';
    form.scrollIntoView({ block: 'center' });
    field('from').focus();
  }),
);
document.querySelectorAll<HTMLButtonElement>('[data-redirect-delete]').forEach((button) =>
  button.addEventListener('click', async () => {
    if (
      !(await confirmAction({
        title: 'Delete redirect?',
        message: `Remove ${button.dataset.source} from future exports? Already deployed server rules must be removed separately.`,
        accept: 'Delete redirect',
      }))
    )
      return;
    button.disabled = true;
    try {
      await api('redirects/' + button.dataset.redirectDelete, 'DELETE', {});
      location.reload();
    } catch (e) {
      error.textContent = (e as Error).message;
      error.hidden = false;
      button.disabled = false;
    }
  }),
);
