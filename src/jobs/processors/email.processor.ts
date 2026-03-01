import { Job } from 'bull';
import nodemailer from 'nodemailer';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { env } from '@/config/env';
import { AppError } from '@/shared/errors';

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
    if (!transporter) {
        if (!env.SMTP_HOST) {
            console.warn('SMTP_HOST not configured, falling back to mock transporter');
        }
        transporter = nodemailer.createTransport({
            host: env.SMTP_HOST || 'smtp.localhost',
            port: env.SMTP_PORT || 1025,
            auth: {
                user: env.SMTP_USER || 'test',
                pass: env.SMTP_PASS || 'test',
            },
        });
    }
    return transporter;
}

function renderEmailTemplate(type: string, data: any) {
    return `
    <html>
      <body>
        <h1>${data.title}</h1>
        <p>Hi ${data.userName},</p>
        <p>${data.message}</p>
        <p>Thanks,<br/>Mutiny Maker Team</p>
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

    const mailer = getTransporter();

    await mailer.sendMail({
        from: '"Mutiny Maker" <notifications@mutinymaker.com>',
        to: user.email,
        subject: title,
        html: renderEmailTemplate(type, { title, message, userName: user.name }),
    });
}
