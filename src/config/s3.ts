import { S3Client } from '@aws-sdk/client-s3';
import { env } from './env';

// Don't crash if keys are missing (in case someone is running locally without buckets configured yet)
export const s3Client = new S3Client({
    region: env.S3_REGION || 'us-east-1',
    endpoint: env.S3_ENDPOINT_URL, // e.g., https://s3.us-west-2.amazonaws.com or https://s3.railway.app
    credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID || '',
        secretAccessKey: env.S3_SECRET_ACCESS_KEY || '',
    },
    // Sometimes required for custom endpoints (like DigitalOcean, Railway, MinIO)
    forcePathStyle: true,
});

/**
 * Build a proxy URL for an S3 object served through the backend.
 * This ensures the frontend only gets the proxy path, forcing
 * requests to route through the backend node server for security.
 */
export function getPublicUrl(key: string): string {
    // If somehow a full frontend proxy URL got passed, just return it
    if (key.startsWith('/api/v1/uploads/')) return key;

    // Otherwise construct the secure proxy proxy path
    return `/api/v1/uploads/${key}`;
}
