import { betterAuth } from 'better-auth';
import { getMigrations } from 'better-auth/db/migration';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';
import { db, audit, transaction } from './db.mjs';
import { origin, secret } from './config.mjs';
const delivery = new AsyncLocalStorage();
const options = {
  appName: 'Blog Studio',
  baseURL: origin,
  secret,
  database: db,
  trustedOrigins: [origin],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    autoSignIn: false,
    revokeSessionsOnPasswordReset: true,
    resetPasswordTokenExpiresIn: 3600,
    sendResetPassword: async ({ url }) => {
      const mailbox = delivery.getStore();
      if (mailbox) mailbox.url = url;
    },
    onPasswordReset: async ({ user }) => {
      db.prepare("UPDATE members SET status='active' WHERE user_id=? AND status='invited'").run(
        user.id,
      );
      audit(user.id, 'password-reset', user.id);
    },
  },
  session: { expiresIn: 60 * 60 * 12, updateAge: 60 * 60, cookieCache: { enabled: false } },
  rateLimit: {
    enabled: true,
    storage: 'database',
    window: 60,
    max: 40,
    customRules: {
      '/sign-in/email': { window: 60, max: 8 },
      '/reset-password': { window: 60, max: 8 },
    },
  },
  advanced: {
    ipAddress: { ipAddressHeaders: ['x-studio-client-ip'] },
    useSecureCookies: new URL(origin).protocol === 'https:',
    defaultCookieAttributes: { httpOnly: true, sameSite: 'lax' },
  },
};
// Initialize schema before constructing the auth instance. No request-time migrations.
const migrations = await getMigrations(options);
await migrations.runMigrations();
export const auth = betterAuth(options);
export async function initAuth() {}
export async function sessionFor(headers) {
  await initAuth();
  const session = await auth.api.getSession({ headers });
  if (!session) return null;
  const member = db.prepare('SELECT * FROM members WHERE user_id=?').get(session.user.id);
  return member?.status === 'active' ? { ...session, role: member.role } : null;
}
export async function resetLink(email) {
  const mailbox = { url: '' };
  await delivery.run(mailbox, () =>
    auth.api.requestPasswordReset({ body: { email, redirectTo: origin + '/set-password' } }),
  );
  if (!mailbox.url) throw new Error('Could not create a password setup link.');
  // The library's verification route resolves this into /set-password?token=... .
  return mailbox.url;
}
export async function invite({ name, email, role = 'editor' }, actor = 'setup') {
  await initAuth();
  email = email.trim().toLowerCase();
  if (
    !name.trim() ||
    name.length > 100 ||
    !/^\S+@\S+\.\S+$/.test(email) ||
    email.length > 254 ||
    !['admin', 'editor'].includes(role)
  )
    throw new Error('Enter a valid name, email and role.');
  if (db.prepare('SELECT id FROM user WHERE email=?').get(email))
    throw new Error('This email already has an account. Use its setup/reset link instead.');
  const result = await auth.api.signUpEmail({
    body: { name: name.trim(), email, password: randomBytes(40).toString('base64url') },
  });
  db.prepare('INSERT INTO members VALUES(?,?,?)').run(result.user.id, role, 'invited');
  audit(actor, 'user-invited', result.user.id);
  return { id: result.user.id, url: await resetLink(email) };
}
export function changeMember(id, changes, actor) {
  return transaction(() => {
    const member = db.prepare('SELECT * FROM members WHERE user_id=?').get(id);
    if (!member) throw new Error('User not found.');
    const role = changes.role ?? member.role,
      status = changes.status ?? member.status;
    if (
      !['admin', 'editor'].includes(role) ||
      !['active', 'disabled', 'invited'].includes(status) ||
      changes.status === 'invited'
    )
      throw new Error('Invalid user change.');
    if (member.status === 'invited' && status === 'active')
      throw new Error('This user must set their password first.');
    if (
      member.role === 'admin' &&
      member.status === 'active' &&
      (role !== 'admin' || status !== 'active')
    ) {
      if (
        db.prepare("SELECT count(*) AS n FROM members WHERE role='admin' AND status='active'").get()
          .n <= 1
      )
        throw new Error('Keep at least one active administrator.');
    }
    db.prepare('UPDATE members SET role=?,status=? WHERE user_id=?').run(role, status, id);
    db.prepare('DELETE FROM session WHERE userId=?').run(id);
    audit(actor, 'user-updated', id);
  });
}
