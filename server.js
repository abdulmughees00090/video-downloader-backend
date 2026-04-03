const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());

// Extract YouTube video ID
function extractVideoId(url) {
    if (!url) return null;
    if (url.includes('youtu.be')) {
        const match = url.match(/youtu\.be\/([^?&]+)/);
        if (match) return match[1];
    }
    const match = url.match(/[?&]v=([^&]+)/);
    if (match) return match[1];
    return null;
}

// Map quality label to yt-dlp format selector
function qualityToFormat(quality) {
    const q = (quality || '').toLowerCase().replace('p', '');
    const height = parseInt(q);

    if (!isNaN(height)) {
        // Best mp4 at or below the requested height, fallback to best available
        return `bestvideo[height<=${height}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${height}]+bestaudio/best[height<=${height}]/best`;
    }

    // Fallback: best available mp4
    return 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best';
}

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Server running' });
});

// Get video info
app.get('/api/info', async (req, res) => {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'No URL provided' });
    }

    try {
        const videoId = extractVideoId(url);
        if (!videoId) {
            throw new Error('Invalid YouTube URL');
        }

        exec(`yt-dlp -j "https://www.youtube.com/watch?v=${videoId}"`, (error, stdout) => {
            if (error) {
                return res.status(500).json({ error: 'Failed to fetch video info' });
            }

            try {
                const info = JSON.parse(stdout);
                const formats = [];

                if (info.formats) {
                    info.formats.forEach(format => {
                        if (format.vcodec !== 'none' && format.acodec !== 'none') {
                            formats.push({
                                quality: format.format_note || format.height + 'p',
                                format: format.ext,
                                size: format.filesize ? (format.filesize / 1024 / 1024).toFixed(2) + ' MB' : 'Unknown',
                                formatId: format.format_id
                            });
                        }
                    });
                }

                const uniqueFormats = [];
                const seen = new Set();
                formats.forEach(f => {
                    if (!seen.has(f.quality)) {
                        seen.add(f.quality);
                        uniqueFormats.push(f);
                    }
                });

                res.json({
                    title: info.title,
                    thumbnail: info.thumbnail,
                    platform: 'youtube',
                    formats: uniqueFormats.slice(0, 8)
                });
            } catch (e) {
                res.status(500).json({ error: 'Failed to parse video info' });
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DOWNLOAD endpoint — streams the video file directly to the client
app.get('/api/download', (req, res) => {
    const { url, quality, formatId } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'No URL provided' });
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
        return res.status(400).json({ error: 'Invalid YouTube URL' });
    }

    // Unique temp filename to support concurrent requests
    const outputPath = path.join('/tmp', `${videoId}_${Date.now()}.mp4`);

    // Prefer explicit formatId, otherwise map quality label → yt-dlp selector
    const formatSelector = formatId
        ? formatId
        : qualityToFormat(quality);

    const safeUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const command = `yt-dlp -f "${formatSelector}" --merge-output-format mp4 -o "${outputPath}" "${safeUrl}"`;

    console.log(`Downloading: ${command}`);

    exec(command, { timeout: 300000 }, (error, stdout, stderr) => {
        if (error) {
            console.error('yt-dlp error:', stderr);
            // Clean up partial file if present
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
            return res.status(500).json({ error: 'Failed to download video', detail: stderr });
        }

        if (!fs.existsSync(outputPath)) {
            return res.status(500).json({ error: 'Output file not found after download' });
        }

        const stat = fs.statSync(outputPath);
        const safeTitle = `video_${videoId}_${quality || 'best'}.mp4`.replace(/[^a-zA-Z0-9._-]/g, '_');

        res.writeHead(200, {
            'Content-Type': 'video/mp4',
            'Content-Length': stat.size,
            'Content-Disposition': `attachment; filename="${safeTitle}"`,
            'Cache-Control': 'no-cache'
        });

        const readStream = fs.createReadStream(outputPath);
        readStream.pipe(res);

        readStream.on('close', () => {
            try { fs.unlinkSync(outputPath); } catch (_) {}
        });

        res.on('error', () => {
            try { fs.unlinkSync(outputPath); } catch (_) {}
        });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
});
