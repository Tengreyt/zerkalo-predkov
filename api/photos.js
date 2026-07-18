import { del, list, put } from '@vercel/blob';
import { randomUUID } from 'node:crypto';

const PREFIX = 'zerkalo-predkov/';
const TTL_MS = 60 * 60 * 1000;
const MAX_BYTES = 4 * 1024 * 1024;

async function cleanupExpiredPhotos(now = Date.now()) {
  try {
    let cursor;
    do {
      const page = await list({ prefix: PREFIX, limit: 250, cursor });
      const expired = page.blobs.filter((blob) =>
        now - new Date(blob.uploadedAt).getTime() > TTL_MS);
      if (expired.length) await del(expired.map((blob) => blob.url));
      cursor = page.cursor;
    } while (cursor);
  } catch (err) {
    // Очистка не должна лишать текущего посетителя фотографии.
    console.warn('Temporary photo cleanup failed:', err);
  }
}

export default async function handler(request) {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }
  const contentType = request.headers.get('content-type')?.split(';')[0];
  if (contentType !== 'image/jpeg') {
    return Response.json({ error: 'Разрешены только JPEG-фотографии' }, { status: 415 });
  }
  const declaredSize = Number(request.headers.get('content-length') || 0);
  if (declaredSize > MAX_BYTES) {
    return Response.json({ error: 'Фотография слишком большая' }, { status: 413 });
  }

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (
    bytes.length < 4 || bytes.length > MAX_BYTES ||
    bytes[0] !== 0xff || bytes[1] !== 0xd8 ||
    bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9
  ) {
    return Response.json({ error: 'Некорректный JPEG-файл' }, { status: 400 });
  }

  const createdAt = Date.now();
  const id = `${createdAt.toString(36)}-${randomUUID().replaceAll('-', '')}`;
  const pathname = `${PREFIX}${id}.jpg`;
  try {
    await put(pathname, bytes, {
      access: 'private',
      addRandomSuffix: false,
      contentType: 'image/jpeg',
      cacheControlMaxAge: 3600,
    });
  } catch (error) {
    console.error('Photo blob upload failed:', error);
    return Response.json(
      { error: 'Облачное хранилище фотографий временно недоступно' },
      { status: 503 },
    );
  }

  // Удаляем истёкшие снимки opportunistically при каждом новом фото.
  await cleanupExpiredPhotos(createdAt);
  const shareUrl = new URL(`/photo.html?id=${encodeURIComponent(id)}`, request.url).toString();
  return Response.json({ id, shareUrl, expiresAt: createdAt + TTL_MS }, {
    status: 201,
    headers: { 'Cache-Control': 'no-store' },
  });
}
