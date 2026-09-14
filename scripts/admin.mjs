import { invite, initAuth } from '../src/lib/auth.mjs';
import { db } from '../src/lib/db.mjs';
await initAuth();
if (db.prepare('SELECT count(*) AS n FROM members').get().n) {
  throw new Error('Initial setup is complete. Invite additional users from the dashboard.');
}
const [name, email] = process.argv.slice(2);
if (!name || !email) throw new Error('Usage: npm run admin -- "Your name" "your@email.com"');
const invitation = await invite({ name, email, role: 'admin' });
console.log(
  'Open this single-use link within one hour to set your password. Keep it private:\n' +
    invitation.url,
);
