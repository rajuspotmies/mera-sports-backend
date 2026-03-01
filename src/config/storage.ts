import { env } from './env';

export const UPLOAD_FOLDERS = {
  avatars: 'avatars',
  logos: 'logos',
  scripts: 'scripts',
  submissions: 'submissions',
} as const;

export type UploadFolder = keyof typeof UPLOAD_FOLDERS;

export const ALLOWED_MIME_TYPES: Record<UploadFolder, string[]> = {
  avatars: ['image/png', 'image/jpeg', 'image/webp'],
  logos: ['image/png', 'image/jpeg', 'image/svg+xml'],
  scripts: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
  ],
  submissions: ['image/png', 'image/jpeg', 'video/mp4', 'video/quicktime'],
};

export const MAX_FILE_SIZES: Record<UploadFolder, number> = {
  avatars: 2 * 1024 * 1024,      // 2MB
  logos: 2 * 1024 * 1024,        // 2MB
  scripts: 10 * 1024 * 1024,     // 10MB
  submissions: 50 * 1024 * 1024, // 50MB
};
