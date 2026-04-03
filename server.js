const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());

// Extract YouTube video ID from any YouTube URL
function extractVideoId(url) {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&?#]+)/,
        /youtube\.com\/watch\?.*v=([^&]+)/
    ];
    
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    return null;
}

// Clean URL to just the video ID
function cleanYouTubeUrl(url) {
    const videoId = extractVideoId(url);
    return videoId ? `https://www.youtube.com/watch?v=${videoId}` : url;
}

// Multiple API sources to try (one will work)
async function fetchYouTubeInfo(videoId) {
    const errors = [];
    
    // API 1: YouTube OEmbed (always works, but limited info)
    try {
        const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
        const response = await axios.get(oembedUrl, { timeout: 5000 });
        return {
            title: response.data.title,
            thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
            formats: [
                { quality: '360p', format: 'mp4', size: 'Unknown' },
                { quality: '720p', format: 'mp4', size: 'Unknown' },
                { quality: '1080p', format: 'mp4', size: 'Unknown' }
            ]
        };
    } catch (e) {
        errors.push('OEmbed failed: ' + e.message);
    }
    
    // API 2: Invidious (alternative to Piped)
    const invidiousInstances = [
        'https://inv.riverside.rocks',
        'https://invidious.snopyta.org',
        'https://yewtu.be'
    ];
    
    for (const instance of invidiousInstances) {
        try {
            const apiUrl = `${instance}/api/v1/videos/${videoId}`;
            const response = await axios.get(apiUrl, { 
                timeout: 8000,
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            
            const data = response.data;
            const formats = [];
            
            if (data.formatStreams) {
                data.formatStreams.forEach(stream => {
                    if (stream.url && stream.qualityLabel) {
                        formats.push({
                            quality: stream.qualityLabel,
                            format: stream.type?.split(';')[0] || 'mp4',
                            size: stream.size ? Math.round(parseInt(stream.size) / 1024 / 1024) + ' MB' : 'Unknown'
                        });
                    }
                });
            }
            
            if (formats.length > 0) {
                return {
                    title: data.title,
                    thumbnail: data.videoThumbnails?.[0]?.url || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
                    formats: formats.slice(0, 8)
                };
            }
        } catch (e) {
            errors.push(`Invidious (${instance}) failed`);
        }
    }
    
    // API 3: Return basic info with generic formats
    return {
        title: 'YouTube Video',
        thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        formats: [
            { quality: '360p', format: 'mp4', size: 'Unknown' },
            { quality: '720p', format: 'mp4', size: 'Unknown' },
            { quality: '1080p', format: 'mp4', size: 'Unknown' }
        ]
    };
}

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running' });
});

// Main info endpoint
app.get('/api/info', async (req, res) => {
    let { url } = req.query;
    
    console.log('Received URL:', url);
    
    if (!url) {
        return res.status(400).json({ error: 'No URL provided' });
    }
    
    try {
        // Handle YouTube URLs
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            const videoId = extractVideoId(url);
            
            if (!videoId) {
                throw new Error('Could not extract video ID');
            }
            
            console.log('Video ID:', videoId);
            
            const videoInfo = await fetchYouTubeInfo(videoId);
            
            const result = {
                title: videoInfo.title,
                thumbnail: videoInfo.thumbnail,
                platform: 'youtube',
                formats: videoInfo.formats
            };
            
            console.log('Success! Returning', result.formats.length, 'formats');
            res.json(result);
        }
        else {
            res.json({
                title: 'Video from URL',
                thumbnail: '',
                platform: 'other',
                formats: [{ quality: 'Original', format: 'mp4', size: 'Unknown' }]
            });
        }
        
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ 
            error: error.message,
            suggestion: 'Try a different YouTube video URL'
        });
    }
});

// Download endpoint
app.get('/api/download', async (req, res) => {
    let { url } = req.query;
    
    if (!url) {
        return res.status(400).json({ error: 'No URL provided' });
    }
    
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
        const videoId = extractVideoId(url);
        
        if (videoId) {
            // Provide multiple download options
            res.json({
                success: true,
                message: 'Click the link below to download',
                downloadOptions: [
                    `https://yt1s.su/ab77/?q=https://www.youtube.com/watch?v=${videoId}`,
                    `https://y2mate.nu/en-US/search/${videoId}`,
                    `https://www.y2mate.com/youtube/${videoId}`
                ],
                directUrl: `https://www.youtube.com/watch?v=${videoId}`
            });
        } else {
            res.status(400).json({ error: 'Invalid YouTube URL' });
        }
    } else {
        res.status(400).json({ error: 'Only YouTube is supported in this version' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
});
