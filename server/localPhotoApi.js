import { createReadStream, readFileSync } from 'node:fs';
import { mkdir, readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { networkInterfaces, tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

export const PHOTO_TTL_MS = 60 * 60 * 1000;
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
export const PHOTO_ID_RE = /^([a-z0-9]+)-([a-f0-9]{32})$/;
export const QR_ORIGIN_FILE = process.env.QR_ORIGIN_FILE || resolve(tmpdir(), 'zerkalo-predkov-public-origin');

function json(response, status, payload) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(payload));
}

function firstLanAddress() {
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) return entry.address;
    }
  }
  return null;
}

export function publicOrigin(request) {
  if (process.env.QR_PUBLIC_ORIGIN) return process.env.QR_PUBLIC_ORIGIN.replace(/\/$/, '');
  try {
    const tunneledOrigin = readFileSync(QR_ORIGIN_FILE, 'utf8').trim();
    if (/^https:\/\/[a-z0-9.-]+$/i.test(tunneledOrigin)) return tunneledOrigin;
  } catch {
    // Туннель необязателен в обычном dev-режиме: ниже остаётся LAN fallback.
  }
  if (process.env.QR_REQUIRE_PUBLIC === '1') return null;
  const host = request.headers.host || 'localhost:5180';
  const [hostname, port] = host.split(':');
  if (['localhost', '127.0.0.1', '0.0.0.0'].includes(hostname)) {
    const lan = firstLanAddress();
    if (lan) return `http://${lan}${port ? `:${port}` : ''}`;
  }
  return `http://${host}`;
}

async function readRequest(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_PHOTO_BYTES) throw Object.assign(new Error('too-large'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function cleanup(directory, now = Date.now()) {
  const names = await readdir(directory).catch(() => []);
  await Promise.all(names.map(async (name) => {
    const path = resolve(directory, name);
    const info = await stat(path).catch(() => null);
    if (info && now - info.mtimeMs > PHOTO_TTL_MS) await unlink(path).catch(() => {});
  }));
}

export function localPhotoApi({ directory = resolve(tmpdir(), 'zerkalo-predkov-photos') } = {}) {
  return async function photoApi(request, response, next) {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    if (url.pathname === '/api/photos' && request.method === 'POST') {
      try {
        if (request.headers['content-type']?.split(';')[0] !== 'image/jpeg') {
          json(response, 415, { error: 'Разрешены только JPEG-фотографии' });
          return;
        }
        const bytes = await readRequest(request);
        if (
          bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 ||
          bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9
        ) {
          json(response, 400, { error: 'Некорректный JPEG-файл' });
          return;
        }
        await mkdir(directory, { recursive: true });
        const createdAt = Date.now();
        const id = `${createdAt.toString(36)}-${randomUUID().replaceAll('-', '')}`;
        await writeFile(resolve(directory, `${id}.jpg`), bytes, { flag: 'wx' });
        cleanup(directory, createdAt).catch(() => {});
        const origin = publicOrigin(request);
        if (!origin) {
          await unlink(resolve(directory, `${id}.jpg`)).catch(() => {});
          json(response, 503, {
            error: 'Публичный QR ещё запускается. Подождите несколько секунд и нажмите снова',
          });
          return;
        }
        json(response, 201, {
          id,
          shareUrl: `${origin}/photo.html?id=${encodeURIComponent(id)}`,
          expiresAt: createdAt + PHOTO_TTL_MS,
          storage: origin.startsWith('https://') ? 'tunnel' : 'local',
        });
      } catch (error) {
        json(response, error.status ?? 500, {
          error: error.status === 413 ? 'Фотография слишком большая' : 'Не удалось сохранить фотографию',
        });
      }
      return;
    }

    if (url.pathname === '/api/photo' && request.method === 'GET') {
      const id = url.searchParams.get('id') ?? '';
      const match = PHOTO_ID_RE.exec(id);
      if (!match) {
        response.statusCode = 400;
        response.end('Некорректная ссылка');
        return;
      }
      const createdAt = Number.parseInt(match[1], 36);
      const path = resolve(directory, `${id}.jpg`);
      if (!Number.isFinite(createdAt) || Date.now() - createdAt > PHOTO_TTL_MS) {
        await unlink(path).catch(() => {});
        response.statusCode = 410;
        response.end('Срок действия фотографии истёк');
        return;
      }
      try {
        await readFile(path);
        response.statusCode = 200;
        response.setHeader('Content-Type', 'image/jpeg');
        response.setHeader(
          'Content-Disposition',
          `${url.searchParams.get('download') === '1' ? 'attachment' : 'inline'}; filename="zerkalo-predkov-${id}.jpg"`,
        );
        response.setHeader('Cache-Control', 'private, no-store');
        createReadStream(path).pipe(response);
      } catch {
        response.statusCode = 404;
        response.end('Фотография не найдена');
      }
      return;
    }
    next();
  };
}
