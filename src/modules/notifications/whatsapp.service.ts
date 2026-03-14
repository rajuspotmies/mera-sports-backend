import { env } from '@/config/env';
import { logger } from '@/shared/utils/logger';

export interface WhatsAppMessage {
  messaging_product: 'whatsapp';
  recipient_type?: 'individual';
  to: string;
  type: 'template';
  template: {
    name: string;
    language: {
      code: string;
    };
    components: Array<
      | {
          type: 'body';
          parameters: Array<{ type: 'text'; text: string }>;
        }
      | {
          type: 'button';
          sub_type: 'url';
          index: string;
          parameters: Array<{ type: 'text'; text: string }>;
        }
    >;
  };
}

/**
 * Normalizes a phone number for WhatsApp: digits only, with 91 (India) prefix if 10-digit.
 * @param phoneNumber e.g. "9876543210", "+91 9876543210", "919876543210"
 * @returns E.164 without + e.g. "919876543210"
 */
function normalizePhoneForWhatsApp(phoneNumber: string): string {
  const digits = phoneNumber.replace(/\D/g, '');
  if (digits.length === 10) {
    return `91${digits}`;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits;
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return `91${digits.slice(1)}`;
  }
  return digits;
}

/**
 * Sends a WhatsApp OTP message using Meta's WhatsApp Business API.
 * The recipient number is normalized to include the 91 (India) prefix when a 10-digit number is provided.
 *
 * @param phoneNumber The recipient's phone number (e.g. 9876543210, +919876543210, 919876543210)
 * @param code The 6-digit OTP code
 */
export async function sendWhatsAppOTP(phoneNumber: string, code: string) {
  if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) {
    logger.warn('WhatsApp service not configured (missing Access Token or Phone Number ID)');
    return null;
  }

  const toNumber = normalizePhoneForWhatsApp(phoneNumber);
  logger.info(`[WhatsApp] Sending OTP to ${toNumber} (from payload: ${phoneNumber})`);

  const url = `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  
  const body: WhatsAppMessage = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: toNumber,
    type: 'template',
    template: {
      // Set WHATSAPP_OTP_TEMPLATE_NAME=login_otp in .env if your Meta template is "login_otp"
      name: env.WHATSAPP_OTP_TEMPLATE_NAME,
      language: {
        code: 'en_US',
      },
      components: [
        {
          type: 'body',
          parameters: [{ type: 'text', text: code }],
        },
        {
          type: 'button',
          sub_type: 'url',
          index: '0',
          parameters: [{ type: 'text', text: code }],
        },
      ],
    },
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json() as any;

    if (!response.ok) {
      logger.error('WhatsApp API Error Response:', data);
      throw new Error(`WhatsApp API Error: ${data.error?.message || 'Unknown error'}`);
    }

    logger.info(`WhatsApp OTP successfully sent to ${toNumber} (normalized from ${phoneNumber})`);
    return data;
  } catch (error) {
    logger.error('Failed to send WhatsApp OTP:', error);
    throw error;
  }
}
