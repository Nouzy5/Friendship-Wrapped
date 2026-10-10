import { prisma } from "../src/lib/prisma.js";
import { emailSchema } from "../src/modules/users/users.schemas.js";

/*
 * Confirms an email address from the server's command line, for when the person can't do it with the
 * emailed link: the first admin on a deployment with no mail server yet (nobody can open the admin
 * panel to do it there), or a mail outage that locks everyone out.
 *
 *   npm run admin:verify-email -w server -- someone@example.com
 *   npm run admin:verify-email -w server -- owner@example.com owner     (an account that has no email yet: give its username)
 */

const [rawEmail, rawUsername] = process.argv.slice(2);
const parsed = emailSchema.safeParse(rawEmail ?? "");
if (!parsed.success) {
  console.error("Usage: npm run admin:verify-email -w server -- <email> [username]");
  process.exit(1);
}
const email = parsed.data;

try {
  const holder = await prisma.user.findUnique({ where: { email }, select: { id: true, username: true, emailVerifiedAt: true } });

  if (holder) {
    await prisma.user.update({ where: { id: holder.id }, data: { emailVerifiedAt: holder.emailVerifiedAt ?? new Date() } });
    await prisma.emailVerificationToken.deleteMany({ where: { userId: holder.id } });
    console.log(`${email} is confirmed for @${holder.username}.`);
  } else if (rawUsername) {
    const account = await prisma.user.findUnique({ where: { username: rawUsername.trim().toLowerCase() }, select: { id: true, username: true, email: true } });
    if (!account) throw new Error(`No account has the username "${rawUsername}".`);
    if (account.email) throw new Error(`@${account.username} already has the address ${account.email}.`);
    await prisma.user.update({ where: { id: account.id }, data: { email, emailVerifiedAt: new Date() } });
    console.log(`@${account.username} now has ${email}, confirmed.`);
  } else {
    throw new Error(`No account has ${email}. To give it to an account that has no email yet, add that account's username.`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
