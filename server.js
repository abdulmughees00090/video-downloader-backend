const express = require('express');
const cors = require('cors');
const { exec, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());

// ─── Tool paths (/tmp is always writable on Render free tier) ────────────────
const YT_DLP = '/tmp/yt-dlp';
const FFMPEG  = '/tmp/ffmpeg';

function ensureDependencies() {
    // ── yt-dlp ──
    if (!fs.existsSync(YT_DLP)) {
        console.log('📦 Downloading yt-dlp...');
        try {
            execSync(
                `curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o ${YT_DLP} && chmod +x ${YT_DLP}`,
                { stdio: 'inherit', timeout: 60000 }
            );
            console.log('✅ yt-dlp ready');
        } catch (e) {
            console.error('❌ yt-dlp install failed:', e.message);
        }
    } else {
        try { execSync(`${YT_DLP} -U`, { stdio: 'ignore', timeout: 30000 }); } catch (_) {}
        console.log('✅ yt-dlp already present');
    }

    // ── ffmpeg ──
    if (!fs.existsSync(FFMPEG)) {
        try {
            const ffmpegBin = require('@ffmpeg-installer/ffmpeg').path;
            execSync(`cp "${ffmpegBin}" ${FFMPEG} && chmod +x ${FFMPEG}`);
            console.log('✅ ffmpeg ready via @ffmpeg-installer');
        } catch (_) {
            try {
                const sysPath = execSync('which ffmpeg').toString().trim();
                execSync(`ln -sf "${sysPath}" ${FFMPEG}`);
                console.log('✅ ffmpeg symlinked from system');
            } catch (e) {
                console.warn('⚠️  ffmpeg unavailable — high-quality merging may fail');
            }
        }
    } else {
        console.log('✅ ffmpeg already present');
    }
}

ensureDependencies();
// ─────────────────────────────────────────────────────────────────────────────

function extractVideoId(url) {
    if (!url) return null;
    if (url.includes('youtu.be')) {
        const m = url.match(/youtu\.be\/([^?&]+)/);
        if (m) return m[1];
    }
    const m = url.match(/[?&]v=([^&]+)/);
    return m ? m[1] : null;
}

function qualityToFormat(quality) {
    const h = parseInt((quality || '').replace(/\D/g, ''));
    if (!isNaN(h) && h > 0) {
        return `bestvideo[height<=${h}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${h}]+bestaudio/best[height<=${h}]/best`;
    }
    return 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best';
}

// Health check
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', ytDlp: fs.existsSync(YT_DLP), ffmpeg: fs.existsSync(FFMPEG) });
});

// Video info
app.get('/api/info', (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'No URL provided' });
    const videoId = extractVideoId(url);
    if (!videoId) return res.status(400).json({ error: 'Invalid YouTube URL' });

    exec(`${YT_DLP} -j "https://www.youtube.com/watch?v=${videoId}"`, { timeout: 60000 }, (err, stdout, stderr) => {
        if (err) return res.status(500).json({ error: 'Failed to fetch video info', detail: stderr });
        try {
            const info = JSON.parse(stdout);
            const seen = new Set();
            const formats = (info.formats || [])
                .filter(f => f.vcodec !== 'none' && f.acodec !== 'none')
                .map(f => ({
                    quality:  f.format_note || (f.height ? f.height + 'p' : 'unknown'),
                    format:   f.ext,
                    size:     f.filesize ? (f.filesize / 1024 / 1024).toFixed(2) + ' MB' : 'Unknown',
                    formatId: f.format_id
                }))
                .filter(f => { if (seen.has(f.quality)) return false; seen.add(f.quality); return true; })
                .slice(0, 8);
            res.json({ title: info.title, thumbnail: info.thumbnail, platform: 'youtube', formats });
        } catch (e) {
            res.status(500).json({ error: 'Failed to parse video info' });
        }
    });
});

// Download — streams mp4 directly to the browser
app.get('/api/download', (req, res) => {
    const { url, quality, formatId } = req.query;
    if (!url) return res.status(400).json({ error: 'No URL provided' });
    const videoId = extractVideoId(url);
    if (!videoId) return res.status(400).json({ error: 'Invalid YouTube URL' });

    const outputPath = path.join('/tmp', `${videoId}_${Date.now()}.mp4`);
    const formatSelector = formatId || qualityToFormat(quality);
    const safeUrl = `https://www.youtube.com/watch?v=${videoId}`;

    // --ffmpeg-location /tmp tells yt-dlp where to find our ffmpeg binary
    const command = `${YT_DLP} --ffmpeg-location /tmp -f "${formatSelector}" --merge-output-format mp4 -o "${outputPath}" "${safeUrl}"`;
    console.log('▶', command);

    exec(command, { timeout: 300000 }, (err, _stdout, stderr) => {
        if (err) {
            try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch (_) {}
            console.error('yt-dlp error:', stderr);
            return res.status(500).json({ error: 'Failed to download video', detail: stderr });
        }
        if (!fs.existsSync(outputPath)) {
            return res.status(500).json({ error: 'Output file missing after download' });
        }

        const stat     = fs.statSync(outputPath);
        const filename = `video_${videoId}_${(quality || 'best').replace(/\W/g, '')}.mp4`;

        res.writeHead(200, {
            'Content-Type':        'video/mp4',
            'Content-Length':      stat.size,
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Cache-Control':       'no-cache'
        });

        const stream = fs.createReadStream(outputPath);
        stream.pipe(res);
        stream.on('close', () => { try { fs.unlinkSync(outputPath); } catch (_) {} });
        res.on('error',    () => { try { fs.unlinkSync(outputPath); } catch (_) {} });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
