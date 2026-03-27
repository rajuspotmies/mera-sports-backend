import { z } from 'zod';

export const connectSocialSchema = z.object({
  platform: z.enum(['instagram', 'youtube', 'twitter']),
  accessToken: z.string().min(1, 'accessToken is required'),
});

export const disconnectSocialSchema = z.object({
  platform: z.enum(['instagram', 'youtube', 'twitter']),
});

export type ConnectSocialDTO = z.infer<typeof connectSocialSchema>;
export type DisconnectSocialDTO = z.infer<typeof disconnectSocialSchema>;
