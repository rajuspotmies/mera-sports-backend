import { Job } from 'bull';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { env } from '@/config/env';
import { AppError } from '@/shared/errors';
import { logger } from '@/shared/utils/logger';

const EMAIL_FROM = env.EMAIL_FROM || 'Mutiny Maker <notifications@mutinytalent.com>';

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

async function sendViaResend(to: string, subject: string, html: string) {
  const { Resend } = await import('resend');
  const resend = new Resend(env.SMTP_API_KEY);

  const { error } = await resend.emails.send({
    from: EMAIL_FROM,
    to,
    subject,
    html,
  });

  if (error) {
    throw new AppError('EMAIL_SEND_FAILED', `Resend error: ${error.message}`);
  }
}

async function sendViaSMTP(to: string, subject: string, html: string) {
  const nodemailer = await import('nodemailer');

  const transporter = nodemailer.default.createTransport({
    host: env.SMTP_HOST || 'smtp.resend.com',
    port: env.SMTP_PORT || 465,
    secure: (env.SMTP_PORT ?? 465) === 465,
    auth: {
      user: env.SMTP_USER || 'resend',
      pass: env.SMTP_PASS || env.SMTP_API_KEY || '',
    },
  });

  await transporter.sendMail({ from: EMAIL_FROM, to, subject, html });
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

  if (env.SMTP_API_KEY) {
    await sendViaResend(user.email, title, html);
  } else if (env.SMTP_HOST) {
    await sendViaSMTP(user.email, title, html);
  } else {
    logger.warn('No email provider configured (set SMTP_API_KEY for Resend or SMTP_HOST for SMTP)');
  }
}
