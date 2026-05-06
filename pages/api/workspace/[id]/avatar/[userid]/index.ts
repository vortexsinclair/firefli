import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import { getPlayerThumbnails } from '@/utils/roblox';
import { createHash } from 'crypto';

// In-memory LRU cache (very lightweight)
type CacheEntry = { buffer: Buffer; etag: string; mtime: number; lastRefresh: number };
const memoryCache = new Map<string, CacheEntry>();
const MAX_ITEMS = 500;
function touch(key: string, entry: CacheEntry) {
  if (memoryCache.has(key)) memoryCache.delete(key);
  memoryCache.set(key, entry);
  if (memoryCache.size > MAX_ITEMS) {
    // remove oldest (first inserted)
    const first = memoryCache.keys().next().value;
    if (first) memoryCache.delete(first);
  }
}

const CACHE_CONTROL = 'public, max-age=300, stale-while-revalidate=600';
const STALE_AFTER_MS = 6 * 60 * 60 * 1000; // 6h revalidation threshold

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { userid } = req.query;
  if (!userid || Array.isArray(userid)) return res.status(400).end('Invalid userId');
  if (!/^[0-9]+$/.test(userid)) return res.status(400).end('Invalid userId');
  const userIdNum = Number(userid);
  if (!Number.isInteger(userIdNum) || userIdNum <= 0) return res.status(400).end('Invalid userId');
  if (userIdNum > 100_000_000_000) return res.status(400).end('Invalid userId');
  const avatarDir = path.join(process.cwd(), 'public', 'avatars');
  const avatarPath = path.join(avatarDir, `${userIdNum}.png`);
  const resolved = path.resolve(avatarPath);
  if (!resolved.startsWith(path.resolve(avatarDir) + path.sep)) return res.status(400).end('Invalid userId');
  const cacheKey = String(userIdNum);

  try {
    // Serve from memory cache if present
    const mem = memoryCache.get(cacheKey);
    if (mem) {
      if (isNotModified(req, mem)) {
        setCommonHeaders(res, mem);
        return res.status(304).end();
      }
      setCommonHeaders(res, mem);
      res.setHeader('Content-Length', mem.buffer.length.toString());
      res.end(mem.buffer);
      // Background refresh if stale
      if (Date.now() - mem.lastRefresh > STALE_AFTER_MS) triggerBackgroundRefresh(userIdNum, avatarPath, cacheKey).catch(()=>{});
      return;
    }

    // Ensure directory exists
    await fs.mkdir(avatarDir, { recursive: true }).catch(()=>{});

    // Try disk cache
    let diskBuffer: Buffer | null = null;
    let diskStat: any = null;
    try {
      diskBuffer = await fs.readFile(avatarPath);
      diskStat = await fs.stat(avatarPath);
    } catch {}

    if (diskBuffer && diskStat) {
      const etag = computeETag(diskBuffer);
      const entry: CacheEntry = { buffer: diskBuffer, etag, mtime: diskStat.mtimeMs, lastRefresh: diskStat.mtimeMs };
      touch(cacheKey, entry);
      if (isNotModified(req, entry)) {
        setCommonHeaders(res, entry);
        return res.status(304).end();
      }
      setCommonHeaders(res, entry);
      res.setHeader('Content-Length', diskBuffer.length.toString());
      res.end(diskBuffer);
      if (Date.now() - entry.lastRefresh > STALE_AFTER_MS) triggerBackgroundRefresh(userIdNum, avatarPath, cacheKey).catch(()=>{});
      return;
    }

    // Fetch remote avatar (cold miss)
    const buffer = await fetchAndPersist(userIdNum, avatarPath);
    const etag = computeETag(buffer);
    const now = Date.now();
    const entry: CacheEntry = { buffer, etag, mtime: now, lastRefresh: now };
    touch(cacheKey, entry);
    setCommonHeaders(res, entry);
    res.setHeader('Content-Length', buffer.length.toString());
    res.end(buffer);
  } catch (e) {
    console.error('Avatar error serving', userIdNum, e);
    res.status(404).end('Not found');
  }
}

function computeETag(buf: Buffer) {
  return 'W/"' + createHash('sha1').update(buf).digest('hex') + '"';
}

function setCommonHeaders(res: NextApiResponse, entry: CacheEntry) {
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', CACHE_CONTROL);
  res.setHeader('ETag', entry.etag);
  res.setHeader('Last-Modified', new Date(entry.mtime).toUTCString());
}

function isNotModified(req: NextApiRequest, entry: CacheEntry) {
  const inm = req.headers['if-none-match'];
  if (inm && inm === entry.etag) return true;
  const ims = req.headers['if-modified-since'];
  if (ims) {
    const since = Date.parse(ims);
    if (!Number.isNaN(since) && entry.mtime <= since) return true;
  }
  return false;
}

async function fetchAndPersist(userId: number, filePath: string): Promise<Buffer> {
  const remoteUrl = await getRemoteAvatarUrl(userId);
  const response = await axios.get(remoteUrl, { responseType: 'arraybuffer', timeout: 12000 });
  const buf = Buffer.from(response.data);
  // Persist async (ignore errors)
  fs.writeFile(filePath, buf).catch(()=>{});
  return buf;
}

async function triggerBackgroundRefresh(userId: number, filePath: string, cacheKey: string) {
  try {
    const buf = await fetchAndPersist(userId, filePath);
    const now = Date.now();
    const entry: CacheEntry = { buffer: buf, etag: computeETag(buf), mtime: now, lastRefresh: now };
    touch(cacheKey, entry);
    console.log('Avatar refreshed', userId);
  } catch (e) {
    console.warn('Avatar background refresh failed', userId, e);
  }
}

async function getRemoteAvatarUrl(userid: number): Promise<string> {
  try {
    const thumbnails = await getPlayerThumbnails([userid], '180x180');
    if (thumbnails && thumbnails[0]?.imageUrl) return thumbnails[0].imageUrl;
  } catch {}
  return `https://www.roblox.com/headshot-thumbnail/image?userId=${userid}&width=180&height=180&format=png`;
}
