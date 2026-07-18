import { del, get } from '@vercel/blob';

const PREFIX = 'zerkalo-predkov/';
const TTL_MS = 60 * 60 * 1000;
const ID_RE = /^([a-z0-9]+)-([a-f0-9]{32})$/;

export default async function handler(request) {
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return new Response('QR storage is not configured', { status: 503 });
  }
  const url = new URL(request.url);
  const id = url.searchParams.get('id') ?? '';
  const match = ID_RE.exec(id);
  if (!match) return new Response('Некорректная ссылка', { status: 400 });

  const createdAt = Number.parseInt(match[1], 36);
  const pathname = `${PREFIX}${id}.jpg`;
  if (!Number.isFinite(createdAt) || Date.now() - createdAt > TTL_MS) {
    del(pathname).catch(() => {});
    return new Response('Срок действия фотографии истёк', { status: 410 });
  }

  const result = await get(pathname, { access: 'private' });
  if (!result || result.statusCode !== 200 || !result.stream) {
    return new Response('Фотография не найдена', { status: 404 });
  }
  const download = url.searchParams.get('download') === '1';
  const safeFilename = `zerkalo-predkov-${id}.jpg`;
  return new Response(result.stream, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${safeFilename}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
