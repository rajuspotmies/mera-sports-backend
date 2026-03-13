import { env } from '@/config/env';
import { logger } from '@/shared/utils/logger';

export interface WhatsAppMessage {
  messaging_product: 'whatsapp';
  to: string;
  type: 'template';
  template: {
    name: string;
    language: {
      code: string;
    };
    components: Array<{
      type: 'body';
      parameters: Array<{
        type: 'text';
        text: string;
      }>;
    }>;
  };
}

/**
 * Sends a WhatsApp OTP message using Meta's WhatsApp Business API.
 * 
 * @param phoneNumber The recipient's phone number with country code (e.g., +919000000000)
 * @param code The 6-digit OTP code
 */
export async function sendWhatsAppOTP(phoneNumber: string, code: string) {
  if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) {
    logger.warn('WhatsApp service not configured (missing Access Token or Phone Number ID)');
    return null;
  }

  // clean number: remove '+' and any spaces
  const cleanPhone = phoneNumber.replace(/\+/g, '').replace(/\s/g, '');
  
  const url = `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  
  const body: WhatsAppMessage = {
    messaging_product: 'whatsapp',
    to: cleanPhone,
    type: 'template',
    template: {
      name: env.WHATSAPP_OTP_TEMPLATE_NAME,
      language: {
        code: 'en_US',
      },
      components: [
        {
          type: 'body',
          parameters: [
            {
              type: 'text',
              text: code,
            },
          ],
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

    logger.info(`WhatsApp OTP successfully sent to ${phoneNumber}`);
    return data;
  } catch (error) {
    logger.error('Failed to send WhatsApp OTP:', error);
    throw error;
  }
}
