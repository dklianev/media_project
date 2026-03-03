import { spawn } from 'child_process';
import { promises as fs, existsSync } from 'fs';
import { dirname, resolve, extname, basename } from 'path';
import { fileURLToPath } from 'url';
import db from '../db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const videosDir = resolve(__dirname, '..', '..', 'public', 'uploads', 'videos');

// ─── Queue: max 1 concurrent transcode ───
let activeJob = null;
const jobQueue = [];

/**
 * Check if ffmpeg is available on the system.
 * Called once at server startup.
 */
export function checkFfmpeg() {
    return new Promise((resolve) => {
        const proc = spawn('ffmpeg', ['-version'], { stdio: 'pipe', shell: true });
        let output = '';
        proc.stdout?.on('data', (d) => { output += d; });
        proc.on('error', () => resolve(false));
        proc.on('close', (code) => resolve(code === 0));
    });
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

    try {
        // Mark as processing
        db.prepare('UPDATE episodes SET transcoding_status = ? WHERE id = ?')
            .run('processing', episodeId);

        console.log(`[Transcoder] Starting transcode for episode ${episodeId}: ${inputPath}`);
        await transcodeVideo(inputPath, outputPath);

        // Verify output exists
        const stats = await fs.stat(outputPath);
        if (stats.size < 1000) {
            throw new Error('Transcoded file is suspiciously small');
        }

        // Update DB with transcoded file
        db.prepare(`
      UPDATE episodes
      SET local_video_url = ?, transcoding_status = 'ready', updated_at = datetime('now')
      WHERE id = ?
    `).run(outputUrl, episodeId);

        // Delete original file (if different from output)
        if (inputPath !== outputPath) {
            await fs.unlink(inputPath).catch(() => { });
        }

        console.log(`[Transcoder] Episode ${episodeId} transcoded successfully → ${outputUrl}`);
    } catch (err) {
        console.error(`[Transcoder] Episode ${episodeId} failed:`, err.message);

        // Mark as failed, keep original file as fallback
        db.prepare(`
      UPDATE episodes
      SET transcoding_status = 'failed', updated_at = datetime('now')
      WHERE id = ?
    `).run(episodeId);
    }
}

/**
 * Queue a transcode job for an episode.
 * Called after a video upload is saved.
 *
 * @param {number} episodeId
 * @param {string} inputPath - Absolute path to the uploaded video file
 */
export function enqueueTranscode(episodeId, inputPath) {
    // Mark as pending in DB
    db.prepare('UPDATE episodes SET transcoding_status = ? WHERE id = ?')
        .run('pending', episodeId);

    jobQueue.push({ episodeId, inputPath });
    console.log(`[Transcoder] Queued episode ${episodeId} (queue length: ${jobQueue.length})`);
    processQueue();
}

/**
 * Get current transcoding status for an episode.
 */
export function getTranscodeStatus(episodeId) {
    const row = db.prepare('SELECT transcoding_status FROM episodes WHERE id = ?').get(episodeId);
    return row?.transcoding_status || null;
}
