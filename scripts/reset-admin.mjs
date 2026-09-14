import { resetLink, initAuth } from '../src/lib/auth.mjs';
import { db } from '../src/lib/db.mjs';
await initAuth();
const email = (process.argv[2] ?? '').toLowerCase();
const user = db
  .prepare(
    "SELECT u.id FROM user u JOIN members m ON u.id=m.user_id WHERE u.email=? AND m.role='admin' AND m.status IN ('active','invited')",
  )
  .get(email);
if (!user) throw new Error('Provide the email of an active or invited administrator.');
console.log('Private recovery link (expires in one hour):\n' + (await resetLink(email)));
