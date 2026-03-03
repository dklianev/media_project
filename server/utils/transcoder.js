import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { dirname, resolve, extname, basename } from 'path';
import { fileURLToPath } from 'url';
import db from '../db.js';
import { normalizeManagedMediaUrl } from './mediaLibrary.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const uploadsDir = resolve(__dirname, '..', '..', 'public', 'uploads');
const videosDir = resolve(__dirname, '..', '..', 'public', 'uploads', 'videos');

// ─── Queue: max 1 concurrent transcode ───
let activeJob = null;
const jobQueue = [];
let ffmpegAvailable = null;
let ffprobeAvailable = null;

function normalizeLocalVideoUrl(value) {
    const normalized = normalizeManagedMediaUrl(value);
    if (!normalized || !normalized.startsWith('/uploads/videos/')) {
        return null;
    }
    return normalized;
}

function resolveLocalVideoPath(videoUrl) {
    const normalized = normalizeLocalVideoUrl(videoUrl);
    if (!normalized) {
        return null;
    }

    return resolve(uploadsDir, normalized.replace(/^\/uploads\//, ''));
}

function markTranscodeFailed(episodeId) {
    db.prepare(`
      UPDATE episodes
      SET transcoding_status = 'failed', updated_at = datetime('now')
      WHERE id = ?
    `).run(episodeId);
}

function checkBinary(command, args = ['-version']) {
    return new Promise((resolve) => {
        const proc = spawn(command, args, { stdio: 'pipe', shell: true });
        proc.on('error', () => resolve(false));
        proc.on('close', (code) => resolve(code === 0));
    });
}

/**
 * Check if ffmpeg is available on the system.
 * Called once at server startup.
 */
export function checkFfmpeg() {
    return checkBinary('ffmpeg');
}

export function checkFfprobe() {
    return checkBinary('ffprobe');
}

async function ensureMediaToolsStatus() {
    if (ffmpegAvailable === null) {
        ffmpegAvailable = await checkFfmpeg();
    }
    if (ffprobeAvailable === null) {
        ffprobeAvailable = await checkFfprobe();
    }

    return {
        ffmpegAvailable,
        ffprobeAvailable,
    };
}

async function probeVideo(inputPath) {
    return new Promise((resolve, reject) => {
        const args = [
            '-v', 'error',
            '-print_format', 'json',
            '-show_format',
            '-show_streams',
            inputPath,
        ];
        const proc = spawn('ffprobe', args, { stdio: ['ignore', 'pipe', 'pipe'], shell: true });

        let stdout = '';
        let stderr = '';
        proc.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
        proc.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });

        proc.on('error', (err) => {
            reject(new Error(`ffprobe spawn error: ${err.message}`));
        });

        proc.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`ffprobe exited with code ${code}: ${stderr.slice(-500)}`));
                return;
            }

            try {
                resolve(JSON.parse(stdout || '{}'));
            } catch (err) {
                reject(new Error(`ffprobe parse error: ${err.message}`));
            }
        });
    });
}

async function detectMp4Faststart(inputPath) {
    const fileHandle = await fs.open(inputPath, 'r');

    try {
        const stats = await fileHandle.stat();
        let offset = 0;
        let sawMdat = false;
        const headerBuffer = Buffer.alloc(16);

        while (offset + 8 <= stats.size) {
            const { bytesRead } = await fileHandle.read(headerBuffer, 0, 8, offset);
            if (bytesRead < 8) break;

            let boxSize = headerBuffer.readUInt32BE(0);
            const boxType = headerBuffer.toString('ascii', 4, 8);
            let headerSize = 8;

            if (boxSize === 1) {
                const extended = await fileHandle.read(headerBuffer, 0, 16, offset);
                if (extended.bytesRead < 16) return false;
                boxSize = Number(headerBuffer.readBigUInt64BE(8));
                headerSize = 16;
            } else if (boxSize === 0) {
                boxSize = stats.size - offset;
            }

            if (!Number.isFinite(boxSize) || boxSize < headerSize) {
                return false;
            }

            if (boxType === 'moov') {
                return !sawMdat;
            }

            if (boxType === 'mdat') {
                sawMdat = true;
            }

            offset += boxSize;
        }

        return false;
    } finally {
        await fileHandle.close();
    }
}

function hasSupportedAudio(streams) {
    const audioStreams = streams.filter((stream) => stream?.codec_type === 'audio');
    return audioStreams.every((stream) => stream?.codec_name === 'aac');
}

function isSupportedVideo(videoStream) {
    if (!videoStream) return false;

    const width = Number(videoStream.width || 0);
    const height = Number(videoStream.height || 0);
    return videoStream.codec_name === 'h264'
        && videoStream.pix_fmt === 'yuv420p'
        && width > 0
        && height > 0
        && width <= 1920
        && height <= 1080;
}

function isMp4LikeFormat(formatName) {
    const normalized = String(formatName || '').toLowerCase();
    return normalized.includes('mp4') || normalized.includes('mov');
}

export async function analyzeUploadedVideo(inputPath) {
    const tools = await ensureMediaToolsStatus();

    if (!tools.ffprobeAvailable) {
        if (!tools.ffmpegAvailable) {
            return {
                decision: 'unavailable',
                reason: 'ffmpeg/ffprobe are unavailable',
            };
        }

        return {
            decision: 'transcode',
            reason: 'ffprobe unavailable',
        };
    }

    let probe;
    try {
        probe = await probeVideo(inputPath);
    } catch (err) {
        return {
            decision: 'invalid',
            reason: err.message,
        };
    }
    const streams = Array.isArray(probe?.streams) ? probe.streams : [];
    const videoStream = streams.find((stream) => stream?.codec_type === 'video');
    const inputExt = extname(inputPath).toLowerCase();

    if (!videoStream) {
        return {
            decision: 'invalid',
            reason: 'missing video stream',
        };
    }

    const codecCompatibleCandidate = isMp4LikeFormat(probe?.format?.format_name)
        && isSupportedVideo(videoStream)
        && hasSupportedAudio(streams);

    if (codecCompatibleCandidate && inputExt === '.mp4') {
        const hasFaststart = await detectMp4Faststart(inputPath);
        if (hasFaststart) {
            return {
                decision: 'ready',
                reason: 'already web-optimized',
            };
        }
    }

    if (codecCompatibleCandidate) {
        if (!tools.ffmpegAvailable) {
            return {
                decision: 'unavailable',
                reason: 'ffmpeg unavailable for mp4 remux',
            };
        }

        return {
            decision: 'remux',
            reason: 'requires mp4 faststart remux',
        };
    }

    if (!tools.ffmpegAvailable) {
        return {
            decision: 'unavailable',
            reason: 'ffmpeg unavailable for transcoding',
        };
    }

    return {
        decision: 'transcode',
        reason: 'codec/container requires transcoding',
    };
}

export async function initializeTranscoder() {
    const tools = await ensureMediaToolsStatus();

    if (!tools.ffmpegAvailable) {
        console.warn('[Transcoder] ffmpeg is not available. Local uploads will be marked as failed.');
        db.prepare(`
          UPDATE episodes
          SET transcoding_status = 'failed', updated_at = datetime('now')
          WHERE video_source = 'local' AND transcoding_status IN ('pending', 'processing')
        `).run();
        return false;
    }

    if (!tools.ffprobeAvailable) {
        console.warn('[Transcoder] ffprobe is not available. Uploads will conservatively be transcoded.');
    }

    const recoverableJobs = db.prepare(`
      SELECT id, local_video_url
      FROM episodes
      WHERE video_source = 'local' AND transcoding_status IN ('pending', 'processing')
      ORDER BY id ASC
    `).all();

    let recoveredCount = 0;
    for (const job of recoverableJobs) {
        const inputPath = resolveLocalVideoPath(job.local_video_url);
        if (!inputPath) {
            markTranscodeFailed(job.id);
            continue;
        }

        try {
            await fs.stat(inputPath);
            enqueueTranscode(job.id, inputPath, { skipStatusUpdate: true });
            recoveredCount += 1;
        } catch {
            markTranscodeFailed(job.id);
        }
    }

    if (recoveredCount > 0) {
        console.log(`[Transcoder] Recovered ${recoveredCount} pending transcode job(s)`);
    }

    return true;
}

/**
 * Transcode a video file to H.264 MP4 (up to 1080p, CRF 23, faststart).
 * Returns the output path on success, throws on error.
 */
function transcodeVideo(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        const args = [
            '-i', inputPath,
            '-c:v', 'libx264',
            '-preset', 'medium',
            '-crf', '23',
            // Scale down to 1080p if larger, keep aspect ratio, no upscale
            '-vf', "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease",
            '-c:a', 'aac',
            '-b:a', '128k',
            '-movflags', '+faststart',
            '-y',
            outputPath,
        ];

        const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'], shell: true });

        let stderr = '';
        proc.stderr?.on('data', (d) => { stderr += d.toString(); });

        proc.on('error', (err) => {
            reject(new Error(`ffmpeg spawn error: ${err.message}`));
        });

        proc.on('close', (code) => {
            if (code === 0) {
                resolve(outputPath);
            } else {
                reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-500)}`));
            }
        });
    });
}

function remuxVideoFaststart(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        const args = [
            '-i', inputPath,
            '-c', 'copy',
            '-movflags', '+faststart',
            '-y',
            outputPath,
        ];

        const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'], shell: true });

        let stderr = '';
        proc.stderr?.on('data', (d) => { stderr += d.toString(); });

        proc.on('error', (err) => {
            reject(new Error(`ffmpeg spawn error: ${err.message}`));
        });

        proc.on('close', (code) => {
            if (code === 0) {
                resolve(outputPath);
            } else {
                reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-500)}`));
            }
        });
    });
}

/**
 * Process the next job in the queue (if any).
 */
function processQueue() {
    if (activeJob || jobQueue.length === 0) return;

    const job = jobQueue.shift();
    activeJob = job;

    runTranscodeJob(job.episodeId, job.inputPath)
        .finally(() => {
            activeJob = null;
            processQueue();
        });
}

/**
 * Run the actual transcode for an episode.
 */
async function runTranscodeJob(episodeId, inputPath) {
    const episode = db.prepare('SELECT id, local_video_url FROM episodes WHERE id = ?').get(episodeId);
    if (!episode) {
        console.error(`[Transcoder] Episode ${episodeId} not found, skipping`);
        return;
    }

    const ext = extname(inputPath);
    const base = basename(inputPath, ext);
    const outputPath = resolve(videosDir, `${base}-transcoded.mp4`);
    const outputUrl = `/uploads/videos/${base}-transcoded.mp4`;
    const remuxPath = resolve(videosDir, `${base}-faststart.mp4`);
    const remuxUrl = `/uploads/videos/${base}-faststart.mp4`;

    try {
        // Mark as processing
        db.prepare('UPDATE episodes SET transcoding_status = ? WHERE id = ?')
            .run('processing', episodeId);

        const plan = await analyzeUploadedVideo(inputPath);
        if (plan.decision === 'invalid') {
            throw new Error(`video analysis failed: ${plan.reason}`);
        }
        if (plan.decision === 'unavailable') {
            throw new Error(plan.reason);
        }

        let finalPath = inputPath;
        let finalUrl = episode.local_video_url;

        if (plan.decision === 'ready') {
            finalPath = inputPath;
            finalUrl = episode.local_video_url;
        } else if (plan.decision === 'remux') {
            console.log(`[Transcoder] Starting faststart remux for episode ${episodeId}: ${inputPath}`);
            await remuxVideoFaststart(inputPath, remuxPath);
            finalPath = remuxPath;
            finalUrl = remuxUrl;
        } else {
            console.log(`[Transcoder] Starting transcode for episode ${episodeId}: ${inputPath}`);
            await transcodeVideo(inputPath, outputPath);
            finalPath = outputPath;
            finalUrl = outputUrl;
        }

        // Verify output exists
        const stats = await fs.stat(finalPath);
        if (stats.size < 1000) {
            throw new Error('Processed video file is suspiciously small');
        }

        // Update DB with processed file
        db.prepare(`
      UPDATE episodes
      SET local_video_url = ?, transcoding_status = 'ready', updated_at = datetime('now')
      WHERE id = ?
    `).run(finalUrl, episodeId);

        // Delete original file (if different from output)
        if (inputPath !== finalPath) {
            await fs.unlink(inputPath).catch(() => { });
        }

        console.log(`[Transcoder] Episode ${episodeId} processed successfully → ${finalUrl}`);
    } catch (err) {
        console.error(`[Transcoder] Episode ${episodeId} failed:`, err.message);

        // Mark as failed, keep original file as fallback
        markTranscodeFailed(episodeId);
    }
}

/**
 * Queue a transcode job for an episode.
 * Called after a video upload is saved.
 *
 * @param {number} episodeId
 * @param {string} inputPath - Absolute path to the uploaded video file
 */
export function enqueueTranscode(episodeId, inputPath, options = {}) {
    const { skipStatusUpdate = false } = options;

    if (ffmpegAvailable === false) {
        console.error(`[Transcoder] Cannot transcode episode ${episodeId}: ffmpeg is unavailable`);
        markTranscodeFailed(episodeId);
        return false;
    }

    if (!skipStatusUpdate) {
        db.prepare('UPDATE episodes SET transcoding_status = ? WHERE id = ?')
            .run('pending', episodeId);
    }

    jobQueue.push({ episodeId, inputPath });
    console.log(`[Transcoder] Queued episode ${episodeId} (queue length: ${jobQueue.length})`);
    processQueue();
    return true;
}

/**
 * Get current transcoding status for an episode.
 */
export function getTranscodeStatus(episodeId) {
    const row = db.prepare('SELECT transcoding_status FROM episodes WHERE id = ?').get(episodeId);
    return row?.transcoding_status || null;
}
