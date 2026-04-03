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
        
        // Get video info using yt-dlp
        exec(`yt-dlp -j "https://www.youtube.com/watch?v=${videoId}"`, (error, stdout) => {
            if (error) {
                return res.status(500).json({ error: 'Failed to fetch video info' });
            }
            
            try {
                const info = JSON.parse(stdout);
                const formats = [];
                
                // Extract available formats
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
                
                // Remove duplicates and sort by quality
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

// REAL DOWNLOAD - Returns actual video file
app.get('/api/download', async (req, res) => {
    const { url, formatId } = req.query;
    
    if (!url) {
        return res.status(400).json({ error: 'No URL provided' });
    }
    
    const videoId = extractVideoId(url);
    if (!videoId) {
        return res.status(400).json({ error: 'Invalid YouTube URL' });
    }
    
    const outputPath = path.join('/tmp', `${videoId}.mp4`);
    
    // Build yt-dlp command
    let command = `yt-dlp -f "best[ext=mp4]" -o "${outputPath}" "https://www.youtube.com/watch?v=${videoId}"`;
    
    if (formatId) {
        command = `yt-dlp -f ${formatId} -o "${outputPath}" "https://www.youtube.com/watch?v=${videoId}"`;
    }
    
    // Download the video
    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error('Download error:', error);
            return res.status(500).json({ error: 'Failed to download video' });
        }
        
        // Check if file exists
        if (fs.existsSync(outputPath)) {
            const stat = fs.statSync(outputPath);
            res.writeHead(200, {
                'Content-Type': 'video/mp4',
                'Content-Length': stat.size,
                'Content-Disposition': `attachment; filename="video_${videoId}.mp4"`
            });
            
            const readStream = fs.createReadStream(outputPath);
            readStream.pipe(res);
            
            // Delete file after sending
            readStream.on('end', () => {
                fs.unlinkSync(outputPath);
            });
        } else {
            res.status(500).json({ error: 'Video file not found' });
        }
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
});
