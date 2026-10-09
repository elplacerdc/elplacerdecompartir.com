import type { APIRoute } from 'astro';
import fs from 'node:fs';
import path from 'node:path';

const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ogg': 'video/ogg',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

export const GET: APIRoute = async ({ params, request }) => {
  const filePath = params.path;
  if (!filePath) {
    return new Response('Not found', { status: 404 });
  }

  const basePath = '/var/www/localstorage/ELPLACERDC/media/';
  let fullPath = path.resolve(basePath, filePath);

  // Security check to ensure resolved path is inside basePath
  if (!fullPath.startsWith(basePath)) {
    return new Response('Forbidden', { status: 403 });
  }

  // Fallback to public folder if not in localstorage
  if (!fs.existsSync(fullPath)) {
    const publicPath = path.resolve('./public/media', filePath);
    if (fs.existsSync(publicPath) && publicPath.startsWith(path.resolve('./public/media'))) {
      fullPath = publicPath;
    } else {
      return new Response('Not found', { status: 404 });
    }
  }

  try {
    const stat = fs.statSync(fullPath);
    if (!stat.isFile()) {
      return new Response('Not found', { status: 404 });
    }

    const fileSize = stat.size;
    const ext = path.extname(fullPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const isMedia = ext === '.mp4' || ext === '.webm' || ext === '.ogg' || ext === '.mov' || ext === '.mp3';

    const rangeHeader = request.headers.get('range');

    if (isMedia && rangeHeader) {
      const parts = rangeHeader.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (isNaN(start) || start >= fileSize || end >= fileSize || start > end) {
        return new Response('Requested range not satisfiable', {
          status: 416,
          headers: {
            'Content-Range': `bytes */${fileSize}`,
          },
        });
      }

      const chunkSize = end - start + 1;
      
      // Use Bun.file slicing for zero-copy streaming, fallback to Node stream
      let body: any;
      if (typeof (globalThis as any).Bun !== 'undefined') {
        body = (globalThis as any).Bun.file(fullPath).slice(start, end + 1);
      } else {
        const stream = fs.createReadStream(fullPath, { start, end });
        body = new ReadableStream({
          start(controller) {
            stream.on('data', (chunk) => controller.enqueue(chunk));
            stream.on('end', () => controller.close());
            stream.on('error', (err) => controller.error(err));
          },
        });
      }

      return new Response(body, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': String(chunkSize),
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=86400',
        },
      });
    }

    // Full file delivery (images or media without Range header)
    let body: any;
    if (typeof (globalThis as any).Bun !== 'undefined') {
      body = (globalThis as any).Bun.file(fullPath);
    } else {
      const stream = fs.createReadStream(fullPath);
      body = new ReadableStream({
        start(controller) {
          stream.on('data', (chunk) => controller.enqueue(chunk));
          stream.on('end', () => controller.close());
          stream.on('error', (err) => controller.error(err));
        },
      });
    }

    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(fileSize),
        'Accept-Ranges': 'bytes',
        'Cache-Control': isMedia ? 'public, max-age=86400' : 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    return new Response('Not found', { status: 404 });
  }
};
