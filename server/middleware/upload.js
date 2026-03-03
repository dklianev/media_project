import multer from 'multer';
import { resolve, dirname, extname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, promises as fs } from 'fs';
import crypto from 'crypto';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const uploadsDir = resolve(__dirname, '..', '..', 'public', 'uploads');
export const UPLOAD_MAX_FILE_SIZE_MB = Number(process.env.UPLOAD_MAX_FILE_SIZE_MB || 10);
const MAX_FILE_SIZE = UPLOAD_MAX_FILE_SIZE_MB * 1024 * 1024;
const activeUploadLocks = new Set();
const IMAGE_OPTIMIZATION_ENABLED = String(process.env.IMAGE_OPTIMIZATION_ENABLED ?? 'true')
  .trim()
  .toLowerCase() !== 'false';
const IMAGE_MAX_WIDTH = Math.max(200, Number(process.env.IMAGE_MAX_WIDTH || 1920));
const IMAGE_MAX_HEIGHT = Math.max(200, Number(process.env.IMAGE_MAX_HEIGHT || 1080));
const IMAGE_WEBP_QUALITY = Math.min(100, Math.max(45, Number(process.env.IMAGE_WEBP_QUALITY || 82)));
const videosDir = resolve(__dirname, '..', '..', 'public', 'uploads', 'videos');
export const VIDEO_MAX_FILE_SIZE_MB = Number(process.env.VIDEO_MAX_FILE_SIZE_MB || 2048);
const VIDEO_MAX_FILE_SIZE = VIDEO_MAX_FILE_SIZE_MB * 1024 * 1024;
const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const VIDEO_MIME_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];

mkdirSync(uploadsDir, { recursive: true });
mkdirSync(videosDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueId = crypto.randomBytes(8).toString('hex');
    const ext = extname(file.originalname);
    cb(null, `${Date.now()}-${uniqueId}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (IMAGE_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Неподдържан формат. Разрешени: JPEG, PNG, WebP, GIF'), false);
  }
};

function cleanupUploadedFiles(files) {
  return Promise.all(
    files
      .filter((file) => file?.path)
      .map((file) => fs.unlink(file.path).catch(() => { }))
  );
}

function isEpisodeVideoFile(file) {
  return file?.fieldname === 'video_file';
}

const episodeStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, isEpisodeVideoFile(file) ? videosDir : uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueId = crypto.randomBytes(8).toString('hex');
    const ext = extname(file.originalname);
    cb(null, `${Date.now()}-${uniqueId}${ext}`);
  },
});

const episodeFileFilter = (req, file, cb) => {
  if (isEpisodeVideoFile(file)) {
    if (VIDEO_MIME_TYPES.includes(file.mimetype)) {
      return cb(null, true);
    }
    return cb(new Error('Неподдържан видео формат. Разрешени: MP4, WebM, MOV'), false);
  }

  if (IMAGE_MIME_TYPES.includes(file.mimetype)) {
    return cb(null, true);
  }

  return cb(new Error('Неподдържан формат. Разрешени: JPEG, PNG, WebP, GIF'), false);
};

function getUploadLockKey(req) {
  if (req?.user?.id) return `user:${req.user.id}`;
  const ip = String(req?.ip || req?.socket?.remoteAddress || '').trim();
  return ip ? `ip:${ip}` : '';
}

export function requireUploadLock(req, res, next) {
  const lockKey = getUploadLockKey(req);
  if (!lockKey) {
    return next();
  }

  if (activeUploadLocks.has(lockKey)) {
    return res.status(429).json({
      error: 'В момента вече се обработва друго изображение. Изчакай текущото качване да приключи.',
    });
  }

  activeUploadLocks.add(lockKey);

  let released = false;
  const releaseLock = () => {
    if (released) return;
    released = true;
    activeUploadLocks.delete(lockKey);
    res.off('finish', releaseLock);
    res.off('close', releaseLock);
  };

  res.on('finish', releaseLock);
  res.on('close', releaseLock);
  next();
}

export function getUploadedFiles(req) {
  const files = [];

  if (req.file) files.push(req.file);

  if (Array.isArray(req.files)) {
    files.push(...req.files);
  } else if (req.files && typeof req.files === 'object') {
    for (const list of Object.values(req.files)) {
      if (Array.isArray(list)) files.push(...list);
    }
  }

  return files.filter((file) => file && file.path);
}

function shouldOptimize(file) {
  if (!IMAGE_OPTIMIZATION_ENABLED) return false;
  if (!file || !file.mimetype) return false;
  return ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype);
}

async function optimizeImageFile(file) {
  const ext = extname(file.filename || '').toLowerCase();
  const baseName = ext ? file.filename.slice(0, -ext.length) : file.filename;
  const optimizedName = ext === '.webp' ? `${baseName}-opt.webp` : `${baseName}.webp`;
  const optimizedPath = resolve(uploadsDir, optimizedName);

  await sharp(file.path, { failOn: 'none' })
    .rotate()
    .resize({
      width: IMAGE_MAX_WIDTH,
      height: IMAGE_MAX_HEIGHT,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({
      quality: IMAGE_WEBP_QUALITY,
      effort: 4,
    })
    .toFile(optimizedPath);

  const stats = await fs.stat(optimizedPath);

  if (optimizedPath !== file.path) {
    await fs.unlink(file.path).catch(() => { });
  }

  file.filename = optimizedName;
  file.path = optimizedPath;
  file.size = stats.size;
  file.mimetype = 'image/webp';
  file.optimized = true;
}

export async function optimizeUploadedImages(req, res, next) {
  const files = getUploadedFiles(req);
  if (files.length === 0) {
    return next();
  }

  try {
    await Promise.all(
      files.map(async (file) => {
        if (!shouldOptimize(file)) return;
        await optimizeImageFile(file);
      })
    );
    return next();
  } catch (err) {
    await cleanupUploadedFiles(files);
    return next(new Error('Грешка при обработка на изображението'));
  }
}

export async function validateEpisodeUploads(req, res, next) {
  const files = getUploadedFiles(req);
  const oversizedImage = files.find((file) => !isEpisodeVideoFile(file) && Number(file.size || 0) > MAX_FILE_SIZE);
  if (!oversizedImage) {
    return next();
  }

  await cleanupUploadedFiles(files);

  const err = new Error(`Файлът е твърде голям (макс ${UPLOAD_MAX_FILE_SIZE_MB}MB)`);
  err.code = 'LIMIT_FILE_SIZE';
  err.field = oversizedImage.fieldname;
  err.limitMB = UPLOAD_MAX_FILE_SIZE_MB;
  return next(err);
}

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
});

export const episodeUpload = multer({
  storage: episodeStorage,
  fileFilter: episodeFileFilter,
  limits: { fileSize: VIDEO_MAX_FILE_SIZE },
});
