import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { localPhotoApi } from '../server/localPhotoApi.js';

async function requestApi(middleware, { method, url, headers = {}, body = null }) {
  const request = Readable.from(body ? [body] : []);
  Object.assign(request, { method, url, headers: { host: 'localhost:5180', ...headers } });
  const chunks = [];
  const response = new Writable({
    write(chunk, encoding, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    },
  });
  response.statusCode = 200;
  response.headers = new Map();
  response.setHeader = (name, value) => response.headers.set(name.toLowerCase(), String(value));
  response.getHeader = (name) => response.headers.get(name.toLowerCase());
  const finished = new Promise((resolve) => response.once('finish', resolve));
  await middleware(request, response, () => response.end());
  await finished;
  return { status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) };
}

test('local QR API stores, displays and downloads a temporary JPEG', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'zerkalo-photo-test-'));
  const middleware = localPhotoApi({ directory });

  try {
    const jpeg = Buffer.from([0xff, 0xd8, 0x01, 0x02, 0xff, 0xd9]);
    const upload = await requestApi(middleware, {
      method: 'POST',
      url: '/api/photos',
      headers: { 'content-type': 'image/jpeg' },
      body: jpeg,
    });
    assert.equal(upload.status, 201);
    const payload = JSON.parse(upload.body.toString());
    assert.match(payload.id, /^[a-z0-9]+-[a-f0-9]{32}$/);
    assert.match(payload.shareUrl, /\/photo\.html\?id=/);

    const view = await requestApi(middleware, {
      method: 'GET',
      url: `/api/photo?id=${payload.id}`,
    });
    assert.equal(view.status, 200);
    assert.equal(view.headers.get('content-type'), 'image/jpeg');
    assert.deepEqual(view.body, jpeg);

    const download = await requestApi(middleware, {
      method: 'GET',
      url: `/api/photo?id=${payload.id}&download=1`,
    });
    assert.match(download.headers.get('content-disposition'), /^attachment;/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
