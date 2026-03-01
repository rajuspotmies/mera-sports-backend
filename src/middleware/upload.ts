import multer from 'multer';
import path from 'path';
import multerS3 from 'multer-s3';
import {
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZES,
  type UploadFolder,
} from '@/config/storage';
import { AppError } from '@/shared/errors';
import { s3Client } from '@/config/s3';
import { env } from '@/config/env';

const storage = multerS3({
  s3: s3Client,
  bucket: env.S3_BUCKET_NAME,
  // Automatically generate content-type based on file rather than saving everything as generic binary
  contentType: multerS3.AUTO_CONTENT_TYPE,
  key: (req, file, cb) => {
    // We already have `uploadFolder` injected in routes (e.g., 'avatars', 'thumbnails')
    const folder = (req.uploadFolder ?? 'misc') as UploadFolder;
    const ext = path.extname(file.originalname);
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    // Creates a simulated folder structure in the bucket: avatars/123456.jpg
    cb(null, `${folder}/${unique}${ext}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // multer hard limit (50MB)
  fileFilter: (req, file, cb) => {
    const folder = (req.uploadFolder ?? 'misc') as UploadFolder;
    const allowed = ALLOWED_MIME_TYPES[folder] ?? [];
    const maxSize = MAX_FILE_SIZES[folder] ?? 5 * 1024 * 1024;

    if (!allowed.includes(file.mimetype)) {
      cb(new AppError('INVALID_FILE_TYPE', `File type not allowed: ${file.mimetype}`, 400));
      return;
    }

    // We'll check size in a post-upload middleware since multer provides the size after saving
    req.body._maxFileSize = maxSize;
    cb(null, true);
  },
});

/**
 * Set uploadFolder on req before calling upload middleware.
 * Usage: router.post('/avatar', setUploadFolder('avatars'), upload.single('file'), ...)
 */
export function setUploadFolder(folder: UploadFolder) {
  return (req: import('express').Request, _res: import('express').Response, next: import('express').NextFunction) => {
    req.uploadFolder = folder;
    next();
  };
}
