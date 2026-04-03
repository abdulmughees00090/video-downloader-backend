const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

// ============ CONFIGURATION ============
const TEMP_DIR = '/tmp/video_downloads';
const YT_DLP_PATH = '/usr/local/bin/yt-dlp';
const FFMPEG_PATH = '/usr/local/bin/ffmpeg';
const COOKIES_PATH = path.join(os.homedir(), '.yt-dlp', 'cookies.txt');

// Create necessary directories
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
if (!fs.existsSync(path.dirname(COOKIES_PATH))) fs.mkdirSync(path.dirname(COOKIES_PATH), { recursive: true });

// ============ INSTALL DEPENDENCIES ON STARTUP ============
function installDependencies() {
    console.log('🔧 Checking/Installing dependencies...');
    
    // Install yt-dlp
    if (!fs.existsSync(YT_DLP_PATH)) {
        console.log('📦 Installing yt-dlp...');
        exec(`sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o ${YT_DLP_PATH} && sudo chmod +x ${YT_DLP_PATH}`, 
            (error) => {
                if (error) console.error('❌ yt-dlp install failed:', error);
                else console.log('✅ yt-dlp installed');
            });
    }
    
    // Install ffmpeg
    if (!fs.existsSync(FFMPEG_PATH)) {
        console.log('📦 Installing ffmpeg...');
        exec(`sudo apt-get update && sudo apt-get install -y ffmpeg`, 
            (error) => {
                if (error) console.error('❌ ffmpeg install failed:', error);
                else console.log('✅ ffmpeg installed');
            });
    }
}

// ============ COOKIE MANAGEMENT ============
// You'll need to upload your cookies file. Create a file at ~/.yt-dlp/cookies.txt
// Format: each line: domain\tTRUE\tpath\tFALSE\texpires\tname\tvalue
function checkCookies() {
    if (!fs.existsSync(COOKIES_PATH)) {
        console.warn('⚠️  No cookies file found at:', COOKIES_PATH);
        console.warn('⚠️  YouTube may block requests. Create cookies.txt file for best results');
        return false;
    }
    console.log('✅ Cookies file found');
    return true;
}

// ============ VIDEO ID EXTRACTION ============
function extractVideoId(url) {
    if (!url) return null;
    
    // Handle youtu.be format
    if (url.includes('youtu.be')) {
        const match = url.match(/youtu\.be\/([^?&]+)/);
        if (match) return match[1];
    }
    
    // Handle youtube.com format
    const patterns = [
        /[?&]v=([^&]+)/,
        /\/embed\/([^?]+)/,
        /\/v\/([^?]+)/,
        /\/shorts\/([^?]+)/
    ];
    
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    
    return null;
}

// ============ GET VIDEO INFO ============
app.get('/api/info', async (req, res) => {
    const { url } = req.query;
    
    if (!url) {
        return res.status(400).json({ error: 'No URL provided' });
    }
    
    const videoId = extractVideoId(url);
    if (!videoId) {
        return res.status(400).json({ error: 'Invalid YouTube URL' });
    }
    
    const fullUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    // Build command with cookies if available
    let cookieFlag = '';
    if (fs.existsSync(COOKIES_PATH)) {
        cookieFlag = `--cookies "${COOKIES_PATH}"`;
    }
    
    const command = `${YT_DLP_PATH} ${cookieFlag} -j "${fullUrl}"`;
    console.log('Fetching info for:', videoId);
    
    exec(command, { timeout: 30000, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) {
            console.error('Info fetch error:', stderr);
            return res.status(500).json({ 
                error: 'Failed to fetch video info', 
                detail: stderr,
                suggestion: 'Try again in a few minutes or upload cookies file'
            });
        }
        
        try {
            const info = JSON.parse(stdout);
            
            // Extract available formats
            const formats = [];
            const seenQualities = new Set();
            
            if (info.formats && Array.isArray(info.formats)) {
                for (const format of info.formats) {
                    // Only include formats that have both video and audio
                    if (format.vcodec !== 'none' && format.acodec !== 'none') {
                        let quality = format.format_note || format.height + 'p';
                        if (!quality || quality === 'unknown') quality = 'Medium';
                        
                        // Remove duplicates
                        if (!seenQualities.has(quality)) {
                            seenQualities.add(quality);
                            formats.push({
                                quality: quality,
                                format: format.ext || 'mp4',
                                size: format.filesize ? (format.filesize / 1024 / 1024).toFixed(2) + ' MB' : 'Unknown',
                                format_id: format.format_id
                            });
                        }
                    }
                }
            }
            
            // Sort by quality (higher resolution first)
            formats.sort((a, b) => {
                const aNum = parseInt(a.quality) || 0;
                const bNum = parseInt(b.quality) || 0;
                return bNum - aNum;
            });
            
            // Get best thumbnail
            let thumbnail = info.thumbnail || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
            
            res.json({
                title: info.title || 'YouTube Video',
                thumbnail: thumbnail,
                duration: info.duration,
                platform: 'youtube',
                formats: formats.slice(0, 10) // Limit to 10 formats
            });
            
        } catch (parseError) {
            console.error('Parse error:', parseError);
            res.status(500).json({ error: 'Failed to parse video information' });
        }
    });
});

// ============ DOWNLOAD VIDEO ============
app.get('/api/download', async (req, res) => {
    const { url, quality, format_id } = req.query;
    
    if (!url) {
        return res.status(400).json({ error: 'No URL provided' });
    }
    
    const videoId = extractVideoId(url);
    if (!videoId) {
        return res.status(400).json({ error: 'Invalid YouTube URL' });
    }
    
    const fullUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const timestamp = Date.now();
    const outputPath = path.join(TEMP_DIR, `${videoId}_${timestamp}.mp4`);
    
    // Build format selector
    let formatSelector;
    if (format_id) {
        formatSelector = format_id;
    } else if (quality) {
        // Convert quality string to format selector
        const height = parseInt(quality);
        if (!isNaN(height)) {
            formatSelector = `bestvideo[height<=${height}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${height}]/best`;
        } else {
            formatSelector = 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best';
        }
    } else {
        formatSelector = 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best';
    }
    
    // Add cookie flag if available
    let cookieFlag = '';
    if (fs.existsSync(COOKIES_PATH)) {
        cookieFlag = `--cookies "${COOKIES_PATH}"`;
    }
    
    // Add user agent to avoid detection
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    
    const command = `${YT_DLP_PATH} ${cookieFlag} --user-agent "${userAgent}" -f "${formatSelector}" --merge-output-format mp4 -o "${outputPath}" "${fullUrl}"`;
    console.log('Downloading:', videoId, 'Quality:', quality || 'best');
    
    exec(command, { timeout: 300000, maxBuffer: 100 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) {
            console.error('Download error:', stderr);
            // Clean up partial file
            if (fs.existsSync(outputPath)) {
                fs.unlinkSync(outputPath);
            }
            return res.status(500).json({ 
                error: 'Failed to download video', 
                detail: stderr,
                suggestion: 'Try a different quality or check if video is age-restricted'
            });
        }
        
        if (!fs.existsSync(outputPath)) {
            return res.status(500).json({ error: 'Output file not created' });
        }
        
        const stat = fs.statSync(outputPath);
        const safeTitle = `video_${videoId}_${quality || 'best'}`.replace(/[^a-z0-9_-]/gi, '_');
        const filename = `${safeTitle}.mp4`;
        
        res.writeHead(200, {
            'Content-Type': 'video/mp4',
            'Content-Length': stat.size,
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Cache-Control': 'no-cache',
            'Access-Control-Expose-Headers': 'Content-Disposition'
        });
        
        const readStream = fs.createReadStream(outputPath);
        readStream.pipe(res);
        
        readStream.on('end', () => {
            // Clean up after streaming completes
            setTimeout(() => {
                if (fs.existsSync(outputPath)) {
                    fs.unlinkSync(outputPath);
                    console.log('Cleaned up:', outputPath);
                }
            }, 1000);
        });
        
        readStream.on('error', (streamError) => {
            console.error('Stream error:', streamError);
            if (fs.existsSync(outputPath)) {
                fs.unlinkSync(outputPath);
            }
        });
    });
});

// ============ HEALTH CHECK ============
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        ytDlpExists: fs.existsSync(YT_DLP_PATH),
        ffmpegExists: fs.existsSync(FFMPEG_PATH),
        cookiesExist: fs.existsSync(COOKIES_PATH),
        tempDir: TEMP_DIR,
        uptime: process.uptime()
    });
});

// ============ CLEANUP OLD FILES ============
setInterval(() => {
    const now = Date.now();
    const maxAge = 3600000; // 1 hour
    
    if (fs.existsSync(TEMP_DIR)) {
        fs.readdir(TEMP_DIR, (err, files) => {
            if (err) return;
            files.forEach(file => {
                const filePath = path.join(TEMP_DIR, file);
                fs.stat(filePath, (err, stats) => {
                    if (err) return;
                    if (now - stats.mtimeMs > maxAge) {
                        fs.unlink(filePath, () => {});
                        console.log('Cleaned old file:', file);
                    }
                });
            });
        });
    }
}, 1800000); // Run every 30 minutes

// ============ START SERVER ============
installDependencies();
checkCookies();

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📁 Temp directory: ${TEMP_DIR}`);
    console.log(`🍪 Cookies: ${fs.existsSync(COOKIES_PATH) ? 'Loaded' : 'Not found'}`);
});
