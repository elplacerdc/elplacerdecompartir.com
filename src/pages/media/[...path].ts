import type { APIRoute } from 'astro';
import fs from 'node:fs';
import path from 'node:path';

export const GET: APIRoute = async ({ params }) => {
  const filePath = params.path;
  if (!filePath) {
    return new Response('Not found', { status: 404 });
  }

  const basePath = '/var/www/localstorage/proyectos/ELPLACERDC/media/';
  const fullPath = path.join(basePath, filePath);

  // Security check to ensure the resolved path stays within basePath
  if (!fullPath.startsWith(basePath)) {
    return new Response('Forbidden', { status: 403 });
  }

  try {
    const file = fs.readFileSync(fullPath);
    const ext = path.extname(fullPath).toLowerCase();
    
    let contentType = 'application/octet-stream';
    if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
    else if (ext === '.png') contentType = 'image/png';
    else if (ext === '.gif') contentType = 'image/gif';
    else if (ext === '.webp') contentType = 'image/webp';
    else if (ext === '.svg') contentType = 'image/svg+xml';
    
    return new Response(file, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable'
      }
    });
  } catch (error) {
    return new Response('Not found', { status: 404 });
  }
};
