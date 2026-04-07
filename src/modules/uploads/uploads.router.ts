import { Router, type Request, type Response, type NextFunction } from 'express';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { s3Client } from '@/config/s3';
import { env } from '@/config/env';
import type { Readable } from 'stream';

const router = Router();

/**
 * GET /uploads/*
 * Proxies files from S3 to the client.
 * Usage: <img src="http://backend/api/v1/uploads/campaigns/123456.jpg" />
 */
router.get('/*', async (req: Request, res: Response, next: NextFunction) => {
    try {
        // Allow media embedding from frontend domains that are cross-site in dev
        // (e.g. localhost frontend consuming api.mutinyx.in uploads).
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

        // req.path gives the path relative to where the router is mounted
        // e.g. for /api/v1/uploads/campaigns/123.jpg, req.path is /campaigns/123.jpg
        const key = req.path.replace(/^\//, '');

        // If a full URL is somehow requested, extract just the pathname
        let finalKey = key;
        if (key.startsWith('http')) {
            try {
                const url = new URL(key);
                finalKey = url.pathname.replace(/^\//, ''); // Strip leading slash
            } catch (e) {
                // Invalid URL string, just proceed
            }
        }

        if (!finalKey) {
            res.status(400).json({ error: 'Missing file key' });
            return;
        }

        const requestRange = typeof req.headers.range === 'string' ? req.headers.range : undefined;

        const command = new GetObjectCommand({
            Bucket: env.S3_BUCKET_NAME,
            Key: finalKey,
            Range: requestRange,
        });

        const s3Response = await s3Client.send(command);

        // Set response headers
        if (s3Response.ContentType) {
            res.setHeader('Content-Type', s3Response.ContentType);
        }
        if (s3Response.ContentLength) {
            res.setHeader('Content-Length', s3Response.ContentLength);
        }
        res.setHeader('Accept-Ranges', 'bytes');
        if (s3Response.ContentRange) {
            res.status(206);
            res.setHeader('Content-Range', s3Response.ContentRange);
        }

        // Cache for 1 day (images don't change once uploaded)
        res.setHeader('Cache-Control', 'public, max-age=86400, immutable');

        // Stream the S3 body to the response
        const body = s3Response.Body;
        if (body && typeof (body as Readable).pipe === 'function') {
            (body as Readable).pipe(res);
        } else if (body) {
            // Fallback: convert to buffer
            const chunks: Uint8Array[] = [];
            for await (const chunk of body as AsyncIterable<Uint8Array>) {
                chunks.push(chunk);
            }
            res.send(Buffer.concat(chunks));
        } else {
            res.status(404).json({ error: 'File not found' });
        }
    } catch (error: any) {
        if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
            res.status(404).json({ error: 'File not found' });
            return;
        }
        next(error);
    }
});

export default router;
