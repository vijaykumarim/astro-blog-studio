import { createAuthClient } from 'better-auth/client';
const auth = createAuthClient();
const status = document.querySelector<HTMLElement>('#auth-status');
document
  .querySelector<HTMLFormElement>('#login-form')
  ?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const data = new FormData(form);
    const button = form.querySelector('button')!;
    button.disabled = true;
    try {
      const result = await auth.signIn.email({
        email: String(data.get('email')),
        password: String(data.get('password')),
      });
      if (result.error) throw new Error(result.error.message ?? 'Could not sign in.');
      location.assign('/');
    } catch (e) {
      if (status) status.textContent = (e as Error).message;
    } finally {
      button.disabled = false;
    }
  });
const params = new URLSearchParams(location.search),
  token = params.get('token');
if (location.pathname === '/set-password') history.replaceState(null, '', '/set-password');
document
  .querySelector<HTMLFormElement>('#set-password-form')
  ?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const data = new FormData(form);
    const button = form.querySelector('button')!;
    if (!token) {
      if (status)
        status.textContent =
          'This setup link is missing or expired. Ask an administrator for a new link.';
      return;
    }
    if (data.get('password') !== data.get('confirm')) {
      if (status) status.textContent = 'The passwords do not match.';
      return;
    }
    button.disabled = true;
    try {
      const result = await auth.resetPassword({ newPassword: String(data.get('password')), token });
      if (result.error) throw new Error(result.error.message);
      location.assign('/login');
    } catch (e) {
      if (status) status.textContent = (e as Error).message;
    } finally {
      button.disabled = false;
    }
  });
