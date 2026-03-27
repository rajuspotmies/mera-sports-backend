import { Job } from 'bull';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { AppError } from '@/shared/errors';
import { logger } from '@/shared/utils/logger';
import { sendEmail } from '@/shared/utils/email';

function renderEmailTemplate(_type: string, data: { title: string; message: string; userName: string }) {
  return `
    <html>
      <body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #1a1a1a;">${data.title}</h2>
        <p>Hi ${data.userName},</p>
        <p>${data.message}</p>
        <br/>
        <p style="color: #666;">Thanks,<br/>Mutiny Maker Team</p>
      </body>
    </html>
  `;
}

export async function processEmailJob(job: Job) {
  const { userId, type, title, message } = job.data;

  const [user] = await db.select().from(users).where(eq(users.id, userId));

  if (!user) {
    throw new AppError('NOT_FOUND', `User ${userId} not found for email job`);
  }

  if (!user.email) {
    logger.warn(`User ${userId} has no email, skipping email notification`);
    return;
  }

  const html = renderEmailTemplate(type, { title, message, userName: user.name || 'there' });

  await sendEmail({
    to: user.email,
    subject: title,
    html,
  });
}
