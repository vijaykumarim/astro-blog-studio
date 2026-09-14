import { createAuthClient } from 'better-auth/client';
import { confirmAction } from './dialogs';
export function toast(message: string) {
  const el = document.querySelector<HTMLElement>('#toast');
  if (el) {
    el.textContent = message;
    el.hidden = false;
    setTimeout(() => (el.hidden = true), 7000);
  }
}
export async function api(path: string, method = 'POST', body: unknown = {}) {
  const response = await fetch('/api/' + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? 'Something went wrong.');
  return result;
}
const auth = createAuthClient();
document.querySelectorAll('[data-signout]').forEach((button) =>
  button.addEventListener('click', async () => {
    await auth.signOut();
    location.assign('/login');
  }),
);
let filter = 'all';
const search = document.querySelector<HTMLInputElement>('[data-post-search]');
const categoryFilter = document.querySelector<HTMLSelectElement>('[data-post-category]');
function filterPosts() {
  let shown = 0;
  document.querySelectorAll<HTMLElement>('[data-post-row]').forEach((row) => {
    row.hidden =
      (!!categoryFilter?.value &&
        !JSON.parse(row.dataset.categories || '[]').includes(categoryFilter.value)) ||
      (filter !== 'all' && row.dataset.status !== filter) ||
      !row.dataset.title?.toLowerCase().includes(search?.value.toLowerCase() ?? '');
    if (!row.hidden) shown++;
  });
  const empty = document.querySelector<HTMLElement>('[data-no-matches]');
  if (empty) empty.hidden = shown > 0;
  document.dispatchEvent(new Event('post-filter-change'));
}
categoryFilter?.addEventListener('change', filterPosts);
search?.addEventListener('input', filterPosts);
document.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((button) =>
  button.addEventListener('click', () => {
    filter = button.dataset.filter!;
    document.querySelectorAll('[data-filter]').forEach((b) => b.classList.remove('selected'));
    button.classList.add('selected');
    filterPosts();
  }),
);
document
  .querySelector('[data-invite-open]')
  ?.addEventListener('click', () =>
    document.querySelector<HTMLDialogElement>('#invite-dialog')?.showModal(),
  );
document
  .querySelectorAll('[data-dialog-close]')
  .forEach((button) => button.addEventListener('click', () => button.closest('dialog')?.close()));
function showLink(url: string) {
  const textarea = document.querySelector<HTMLTextAreaElement>('#setup-link');
  if (textarea) textarea.value = url;
  document.querySelector<HTMLDialogElement>('#link-dialog')?.showModal();
}
document.querySelector('[data-copy-link]')?.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(
      document.querySelector<HTMLTextAreaElement>('#setup-link')?.value ?? '',
    );
    toast('Link copied.');
  } catch {
    toast('Select and copy the link manually.');
  }
});
document
  .querySelector<HTMLFormElement>('#invite-form')
  ?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"],button.primary')!;
    button.disabled = true;
    try {
      const result = await api('users', 'POST', Object.fromEntries(new FormData(form)));
      document.querySelector<HTMLDialogElement>('#invite-dialog')?.close();
      showLink(result.url);
      document
        .querySelector<HTMLDialogElement>('#link-dialog')
        ?.addEventListener('close', () => location.reload(), { once: true });
    } catch (e) {
      toast((e as Error).message);
    } finally {
      button.disabled = false;
    }
  });
document.querySelectorAll<HTMLButtonElement>('[data-reset-user]').forEach((button) =>
  button.addEventListener('click', async () => {
    try {
      showLink((await api('users/' + button.dataset.resetUser + '/reset')).url);
    } catch (e) {
      toast((e as Error).message);
    }
  }),
);
for (const kind of ['toggle', 'role'])
  document.querySelectorAll<HTMLButtonElement>('[data-' + kind + '-user]').forEach((button) =>
    button.addEventListener('click', async () => {
      if (
        !(await confirmAction({
          title: 'Change user access?',
          message: 'This updates their access and ends their existing sessions.',
          accept: 'Apply change',
        }))
      )
        return;
      try {
        await api(
          'users/' + (kind === 'toggle' ? button.dataset.toggleUser : button.dataset.roleUser),
          'PATCH',
          kind === 'toggle'
            ? { status: button.dataset.nextStatus }
            : { role: button.dataset.nextRole },
        );
        location.reload();
      } catch (e) {
        toast((e as Error).message);
      }
    }),
  );
document
  .querySelector<HTMLButtonElement>('[data-rebuild]')
  ?.addEventListener('click', async (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    button.disabled = true;
    try {
      await api('rebuild');
      location.reload();
    } catch (e) {
      toast((e as Error).message);
      button.disabled = false;
    }
  });
document
  .querySelector<HTMLFormElement>('#change-password-form')
  ?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement,
      data = new FormData(form);
    try {
      const result = await auth.changePassword({
        currentPassword: String(data.get('currentPassword')),
        newPassword: String(data.get('newPassword')),
        revokeOtherSessions: true,
      });
      if (result.error) throw new Error(result.error.message);
      form.reset();
      toast('Password updated. Other sessions have ended.');
    } catch (e) {
      toast((e as Error).message);
    }
  });
