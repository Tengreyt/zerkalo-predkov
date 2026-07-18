/** Запуск киоска вместе с публичным HTTPS QR-туннелем. */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.EXHIBIT_PORT || 5180);
const originFile = process.env.QR_ORIGIN_FILE || resolve(tmpdir(), 'zerkalo-predkov-public-origin');
const localCloudflared = resolve(root, 'bin/cloudflared');
const cloudflared = existsSync(localCloudflared) ? localCloudflared : 'cloudflared';
const children = [];
let stopping = false;

await unlink(originFile).catch(() => {});

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  unlink(originFile).catch(() => {}).finally(() => process.exit(code));
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

const vite = spawn(
  resolve(root, 'node_modules/.bin/vite'),
  ['--host', '0.0.0.0', '--port', String(port), '--strictPort'],
  {
    cwd: root,
    env: {
      ...process.env,
      QR_REQUIRE_PUBLIC: '1',
      QR_ORIGIN_FILE: originFile,
    },
    stdio: ['inherit', 'pipe', 'pipe'],
  },
);
children.push(vite);
vite.stdout.pipe(process.stdout);
vite.stderr.pipe(process.stderr);
vite.on('error', (error) => {
  console.error(`Не удалось запустить Vite: ${error.message}`);
  stop(1);
});
vite.on('exit', (code) => {
  if (!stopping) stop(code || 1);
});

await new Promise((resolveReady, reject) => {
  const timeout = setTimeout(() => reject(new Error('Vite не запустился за 15 секунд')), 15_000);
  const inspect = (chunk) => {
    if (!chunk.toString().includes('ready in')) return;
    clearTimeout(timeout);
    vite.stdout.off('data', inspect);
    resolveReady();
  };
  vite.stdout.on('data', inspect);
}).catch((error) => {
  console.error(error.message);
  stop(1);
});

const tunnel = spawn(
  cloudflared,
  [
    'tunnel', '--no-autoupdate', '--protocol', 'http2', '--edge-ip-version', '4',
    '--url', `http://127.0.0.1:${port}`,
  ],
  {
    cwd: root,
    env: { ...process.env, TUNNEL_DNS_RESOLVER_ADDRS: '1.1.1.1:53' },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
children.push(tunnel);

let tunnelReady = false;
let tunnelUrl = null;
const tunnelTimeout = setTimeout(() => {
  if (tunnelReady) return;
  console.error('\nПубличный QR-туннель не подключился за 45 секунд.');
  console.error('Проверьте интернет/DNS и повторите npm run exhibit.');
  stop(1);
}, 45_000);
const inspectTunnel = async (chunk) => {
  const message = chunk.toString();
  process.stdout.write(message);
  const url = message.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i)?.[0];
  if (url) tunnelUrl = url;
  if (!tunnelUrl || tunnelReady || !message.includes('Registered tunnel connection')) return;
  tunnelReady = true;
  clearTimeout(tunnelTimeout);
  await writeFile(originFile, tunnelUrl, 'utf8');
  console.log('\n==============================================');
  console.log('QR ДЛЯ ТЕЛЕФОНА ГОТОВ');
  console.log(tunnelUrl);
  console.log('Оставьте это окно открытым во время выставки.');
  console.log('==============================================\n');
};
tunnel.stdout.on('data', inspectTunnel);
tunnel.stderr.on('data', inspectTunnel);
tunnel.on('error', (error) => {
  console.error(`Не удалось запустить cloudflared: ${error.message}`);
  console.error('Проверьте наличие bin/cloudflared или установите cloudflared глобально.');
  stop(1);
});
tunnel.on('exit', (code) => {
  if (!stopping) {
    console.error(`QR-туннель остановился (код ${code ?? 'unknown'}).`);
    stop(code || 1);
  }
});
