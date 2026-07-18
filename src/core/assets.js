/**
 * Загрузка manifest.json и предзагрузка всех изображений костюмов/уборов/фонов.
 * Координаты якорей берутся ТОЛЬКО из манифеста — никакого хардкода.
 */
import { settings } from '../config/settings.js';

/** @type {{ manifest: object, images: Map<string, HTMLImageElement> }} */
const cache = { manifest: null, images: new Map(), layers: new Map() };

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Не удалось загрузить ${src}`));
    img.src = src;
  });
}

export async function loadAssets() {
  const base = settings.paths.assets;
  const response = await fetch(`${base}/manifest.json`);
  if (!response.ok) throw new Error(`Не удалось загрузить manifest.json (${response.status})`);
  const manifest = await response.json();
  if (!manifest?.costumes || !manifest?.headwear || !manifest?.backgrounds) {
    throw new Error('manifest.json имеет неверную структуру');
  }
  cache.manifest = manifest;
  cache.images.clear();
  cache.layers.clear();

  const files = new Set();
  for (const [name, costume] of Object.entries(manifest.costumes)) {
    const assetName = costume.asset ?? name;
    const sizes = costume.sizes.length ? costume.sizes : [''];
    for (const size of sizes) files.add(size ? `${assetName}_${size}.png` : `${assetName}.png`);
  }
  for (const name of Object.keys(manifest.headwear)) files.add(`${name}.png`);
  for (const file of Object.values(manifest.backgrounds)) files.add(file);

  const results = await Promise.allSettled(
    [...files].map(async (file) => {
      cache.images.set(file, await loadImage(`${base}/${file}`));
      return file;
    }),
  );
  for (let i = 0; i < results.length; i++) {
    if (results[i].status === 'rejected') {
      console.warn(`Необязательный ассет пропущен: ${[...files][i]}`, results[i].reason);
    }
  }

  // Повреждение одного необязательного костюма не должно остановить весь киоск.
  for (const [name, costume] of Object.entries(manifest.costumes)) {
    const assetName = costume.asset ?? name;
    const sizes = costume.sizes.length ? costume.sizes : [''];
    const bodyReady = sizes.every((size) =>
      cache.images.has(size ? `${assetName}_${size}.png` : `${assetName}.png`));
    if (!bodyReady) {
      console.warn(`Костюм ${name} исключён: отсутствует основной PNG.`);
      delete manifest.costumes[name];
      continue;
    }
    if (costume.headwear && !cache.images.has(`${costume.headwear}.png`)) {
      console.warn(`Головной убор ${costume.headwear} недоступен; ${name} работает без него.`);
      costume.headwear = null;
    }
  }
  if (!manifest.costumes.cherkeska) {
    throw new Error('Гарантированный ассет cherkeska.png отсутствует');
  }

  // Разделяем рукава во время экрана загрузки, а не на первом live-кадре.
  for (const name of Object.keys(manifest.costumes)) {
    const costume = getCostumeConfig(name);
    if (costume.fit?.sleeves) getCostumeLayers(name, 'regular');
  }
  return manifest;
}

export function getManifest() {
  return cache.manifest;
}

/** Конфигурация варианта может переиспользовать PNG и посадку базового костюма. */
export function getCostumeConfig(costumeId) {
  const resolvedId = cache.manifest.costumes[costumeId] ? costumeId : 'cherkeska';
  const own = cache.manifest.costumes[resolvedId];
  const base = own.asset && cache.manifest.costumes[own.asset]
    ? cache.manifest.costumes[own.asset]
    : null;
  if (!base) return own;
  return {
    ...base,
    ...own,
    anchors: { ...base.anchors, ...own.anchors },
    fit: { ...base.fit, ...own.fit },
  };
}

/** PNG нательного костюма для класса комплекции (у бурки версий нет). */
export function getCostumeImage(costumeId, bodyClass) {
  const resolvedId = cache.manifest.costumes[costumeId] ? costumeId : 'cherkeska';
  const costume = getCostumeConfig(resolvedId);
  const assetName = costume.asset ?? resolvedId;
  const safeClass = costume.sizes.includes(bodyClass) ? bodyClass : (costume.sizes[0] ?? '');
  const file = costume.sizes.length ? `${assetName}_${safeClass}.png` : `${assetName}.png`;
  return cache.images.get(file);
}

function polygonPath(ctx, points) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
}

function polygonMask(width, height, polygon, feather = 1.6) {
  const raw = document.createElement('canvas');
  raw.width = width;
  raw.height = height;
  const rawCtx = raw.getContext('2d');
  rawCtx.fillStyle = '#fff';
  polygonPath(rawCtx, polygon);
  rawCtx.fill();

  if (feather <= 0) return raw;
  const soft = document.createElement('canvas');
  soft.width = width;
  soft.height = height;
  const softCtx = soft.getContext('2d');
  softCtx.filter = `blur(${feather}px)`;
  softCtx.drawImage(raw, 0, 0);
  return soft;
}

function clippedLayer(image, mask) {
  const layer = document.createElement('canvas');
  layer.width = image.naturalWidth || image.width;
  layer.height = image.naturalHeight || image.height;
  const ctx = layer.getContext('2d');
  ctx.drawImage(image, 0, 0);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(mask, 0, 0);
  return layer;
}

/**
 * Один раз разделяет исходный PNG на корпус и независимые рукава.
 * Все слои сохраняют исходный размер, поэтому используют одну систему координат.
 */
export function getCostumeLayers(costumeId, bodyClass) {
  const resolvedId = cache.manifest.costumes[costumeId] ? costumeId : 'cherkeska';
  const costume = getCostumeConfig(resolvedId);
  const source = getCostumeImage(resolvedId, bodyClass);
  if (!costume.fit?.sleeves) return { source, torso: source, sleeves: null };

  const cacheKey = `${resolvedId}:${bodyClass}`;
  if (cache.layers.has(cacheKey)) return cache.layers.get(cacheKey);

  const torso = document.createElement('canvas');
  torso.width = source.naturalWidth || source.width;
  torso.height = source.naturalHeight || source.height;
  const torsoCtx = torso.getContext('2d');
  torsoCtx.drawImage(source, 0, 0);

  const sleeves = {};
  for (const side of ['left', 'right']) {
    const polygon = costume.fit.sleeves[side].polygon;
    const mask = polygonMask(torso.width, torso.height, polygon);
    sleeves[side] = clippedLayer(source, mask);
    torsoCtx.save();
    torsoCtx.globalCompositeOperation = 'destination-out';
    torsoCtx.drawImage(mask, 0, 0);
    torsoCtx.restore();
  }

  const layers = { source, torso, sleeves };
  cache.layers.set(cacheKey, layers);
  return layers;
}

export function getHeadwearImage(headwearId) {
  return headwearId ? cache.images.get(`${headwearId}.png`) ?? null : null;
}

export function getBackgroundImage(costumeId) {
  const costume = getCostumeConfig(costumeId);
  const requested = cache.manifest.backgrounds[costume?.background];
  if (requested && cache.images.has(requested)) return cache.images.get(requested);
  for (const file of Object.values(cache.manifest.backgrounds)) {
    if (cache.images.has(file)) return cache.images.get(file);
  }
  return null;
}
