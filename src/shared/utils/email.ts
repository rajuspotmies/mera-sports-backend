import { env } from '@/config/env';
import { logger } from '@/shared/utils/logger';
import { AppError } from '@/shared/errors';

export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
  from?: string;
}

const DEFAULT_FROM = env.EMAIL_FROM || 'Mutiny Maker <notifications@mutinytalent.com>';

/**
 * Unified email sender that supports Resend (preferred) and SMTP (fallback).
 * Dispatches emails synchronously.
 */
export async function sendEmail(options: SendEmailOptions): Promise<void> {
  const { to, subject, html, attachments, from = DEFAULT_FROM } = options;

  if (env.SMTP_API_KEY) {
    // --- Resend Implementation ---
    try {
      const { Resend } = await import('resend');
      const resend = new Resend(env.SMTP_API_KEY);
      
      const { error } = await resend.emails.send({
        from,
        to,
        subject,
        html,
        attachments: attachments?.map(a => ({
          filename: a.filename,
          content: a.content as Buffer, // Resend expects Buffer for attachments
        })),
      });

      if (error) {
        logger.error('Resend email error', error);
        throw new AppError('EMAIL_SEND_FAILED', `Resend error: ${error.message}`);
      }
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      logger.error('Failed to send email via Resend', err);
      throw new AppError('EMAIL_SEND_FAILED', `Failed to send email via Resend: ${err.message}`);
    }
  } else if (env.SMTP_HOST) {
    // --- SMTP Implementation ---
    try {
      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.default.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT || 465,
        secure: (env.SMTP_PORT ?? 465) === 465,
        auth: {
          user: env.SMTP_USER || 'resend',
          pass: env.SMTP_PASS || env.SMTP_API_KEY || '',
        },
      });

      await transporter.sendMail({
        from,
        to,
        subject,
        html,
        attachments: attachments?.map(a => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType,
        })),
      });
    } catch (err: any) {
      logger.error('Failed to send email via SMTP', err);
      throw new AppError('EMAIL_SEND_FAILED', `Failed to send email via SMTP: ${err.message}`);
    }
  } else {
    logger.warn('No email provider configured — email NOT sent', { to, subject });
    if (env.NODE_ENV === 'production') {
      throw new AppError('EMAIL_CONFIG_MISSING', 'Email provider not configured');
    }
  }
}
