import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(2).max(255),
  role: z.enum(['brand_owner', 'influencer']),
  // brand_owner specific
  brandName: z.string().min(1).max(255).optional(),
  industry: z.string().max(100).optional(),
  // influencer specific
  handle: z.string().max(100).optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const refreshSchema = z.object({
  refreshToken: z.string().optional(),
});

export const logoutSchema = z.object({
  refreshToken: z.string().optional(),
});

export const updateMeSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  email: z.string().email().optional(),
});

export const sendOtpSchema = z.object({
  phoneNumber: z.string().min(10).max(15),
});

export const verifyOtpSchema = z.object({
  phoneNumber: z.string().min(10).max(15),
  code: z.string().length(6),
  name: z.string().min(2).max(255).optional(), // for registration
  email: z.string().email().optional(), // for registration
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export type RegisterDTO = z.infer<typeof registerSchema>;
export type LoginDTO = z.infer<typeof loginSchema>;
export type RefreshDTO = z.infer<typeof refreshSchema>;
export type LogoutDTO = z.infer<typeof logoutSchema>;
export type UpdateMeDTO = z.infer<typeof updateMeSchema>;
export type SendOtpDTO = z.infer<typeof sendOtpSchema>;
export type VerifyOtpDTO = z.infer<typeof verifyOtpSchema>;
export type ChangePasswordDTO = z.infer<typeof changePasswordSchema>;
export type ForgotPasswordDTO = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordDTO = z.infer<typeof resetPasswordSchema>;
