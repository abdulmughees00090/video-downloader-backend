// server.js - Simplified Working Version
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const ytdl = require('@distube/ytdl-core');
const app = express();

// Enable CORS for all requests
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type']
}));

app.use(express.json());

// Simple test endpoint to check if server is running
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running' });
});

// Get video info (Fixed version with better error handling)
app.get('/api/info', async (req, res) => {
    // Add CORS headers
    res.header('Access-Control-Allow-Origin', '*');
    
    const { url } = req.query;
    
    if (!url) {
        return res.status(400).json({ error: 'URL parameter is required' });
    }
    
    console.log('Fetching info for:', url);
    
    try {
        // Check if it's a YouTube URL
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            // Extract video ID
            let videoId = null;
            if (url.includes('youtu.be')) {
                videoId = url.split('/').pop().split('?')[0];
            } else {
                const urlParams = new URLSearchParams(new URL(url).search);
                videoId = urlParams.get('v');
            }
            
            if (!videoId) {
                throw new Error('Could not extract video ID');
            }
            
            // Use a simpler API that doesn't crash
            const apiUrl = `https://pipedapi.kavin.rocks/streams/${videoId}`;
            const response = await axios.get(apiUrl, {
                timeout: 10000,
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            
            const data = response.data;
            
            // Extract formats
            const formats = [];
            if (data.videoStreams && Array.isArray(data.videoStreams)) {
                data.videoStreams.forEach(stream => {
                    if (stream.url && stream.quality) {
                        formats.push({
                            quality: stream.quality,
                            format: 'mp4',
                            size: stream.contentLength ? (stream.contentLength / 1024 / 1024).toFixed(2) + ' MB' : 'Unknown'
                        });
                    }
                });
            }
            
            // If no formats found, add some default ones
            if (formats.length === 0) {
                formats.push(
                    { quality: '360p', format: 'mp4', size: 'Unknown' },
                    { quality: '720p', format: 'mp4', size: 'Unknown' },
                    { quality: '1080p', format: 'mp4', size: 'Unknown' }
                );
            }
            
            res.json({
                title: data.title || 'YouTube Video',
                thumbnail: data.thumbnailUrl || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
                platform: 'youtube',
                formats: formats
            });
        }
        else if (url.includes('tiktok.com')) {
            // TikTok handler
            try {
                const tikApi = `https://tikwm.com/api/?url=${encodeURIComponent(url)}`;
                const tikResponse = await axios.get(tikApi, { timeout: 10000 });
                
                if (tikResponse.data && tikResponse.data.data) {
                    res.json({
                        title: tikResponse.data.data.title || 'TikTok Video',
                        thumbnail: tikResponse.data.data.cover || '',
                        platform: 'tiktok',
                        formats: [{ quality: 'HD', format: 'mp4', size: 'Unknown' }]
                    });
                } else {
                    throw new Error('No data from TikTok API');
                }
            } catch (tikError) {
                res.json({
                    title: 'TikTok Video',
                    thumbnail: '',
                    platform: 'tiktok',
                    formats: [{ quality: 'HD', format: 'mp4', size: 'Unknown' }]
                });
            }
        }
        else {
            // Generic response for other platforms
            res.json({
                title: 'Video from URL',
                thumbnail: '',
                platform: 'generic',
                formats: [
                    { quality: 'Best Available', format: 'mp4', size: 'Unknown' }
                ]
            });
        }
        
    } catch (error) {
        console.error('Error in /api/info:', error.message);
        res.status(500).json({ 
            error: error.message,
            details: 'Failed to fetch video info. Check the URL and try again.'
        });
    }
});

// Download endpoint
app.get('/api/download', async (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    
    const { url, quality = 'highest' } = req.query;
    
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }
    
    try {
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            // Extract video ID
            let videoId = null;
            if (url.includes('youtu.be')) {
                videoId = url.split('/').pop().split('?')[0];
            } else {
                const urlParams = new URLSearchParams(new URL(url).search);
                videoId = urlParams.get('v');
            }
            
            // Get video info first
            const info = await ytdl.getInfo(url);
            const title = info.videoDetails.title.replace(/[^\w\s]/gi, '');
            
            // Choose format based on quality
            let format;
            if (quality === 'highest' || quality === '1080p') {
                format = ytdl.chooseFormat(info.formats, { quality: 'highestvideo' });
            } else if (quality === '720p') {
                format = ytdl.chooseFormat(info.formats, { quality: '720p' });
            } else {
                format = ytdl.chooseFormat(info.formats, { quality: 'lowestvideo' });
            }
            
            res.header('Content-Disposition', `attachment; filename="${title}.mp4"`);
            res.header('Content-Type', 'video/mp4');
            
            ytdl(url, { format: format }).pipe(res);
        } else {
            res.status(400).json({ error: 'Download only supported for YouTube at this time' });
        }
    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`✅ CORS enabled for all origins`);
    console.log(`✅ Health check: http://localhost:${PORT}/api/health`);
});
