const express = require('express');
const cors = require('cors');
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
    
    const embedMatch = url.match(/embed\/([^?&]+)/);
    if (embedMatch) return embedMatch[1];
    
    return null;
}

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'Server is running',
        timestamp: new Date().toISOString()
    });
});

// Main info endpoint
app.get('/api/info', async (req, res) => {
    const { url } = req.query;
    
    console.log('Request for URL:', url);
    
    if (!url) {
        return res.status(400).json({ error: 'No URL provided' });
    }
    
    try {
        const videoId = extractVideoId(url);
        
        if (!videoId) {
            return res.status(400).json({ 
                error: 'Could not extract YouTube video ID'
            });
        }
        
        console.log('Video ID:', videoId);
        
        // Get video info from YouTube OEmbed
        const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
        const oembedResponse = await axios.get(oembedUrl, { timeout: 10000 });
        
        const thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
        
        // Available qualities
        const formats = [
            { quality: '144p', format: 'mp4', size: '~5 MB' },
            { quality: '240p', format: 'mp4', size: '~10 MB' },
            { quality: '360p', format: 'mp4', size: '~20 MB' },
            { quality: '480p', format: 'mp4', size: '~35 MB' },
            { quality: '720p', format: 'mp4', size: '~60 MB' },
            { quality: '1080p', format: 'mp4', size: '~100 MB' }
        ];
        
        const result = {
            title: oembedResponse.data.title || 'YouTube Video',
            thumbnail: thumbnail,
            platform: 'youtube',
            videoId: videoId,
            formats: formats
        };
        
        console.log('Success! Returning video info');
        res.json(result);
        
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ 
            error: error.message,
            suggestion: 'Try a different YouTube video URL'
        });
    }
});

// Download endpoint - Updated with working services
app.get('/api/download', async (req, res) => {
    const { url, quality } = req.query;
    
    console.log('Download request for:', url);
    
    if (!url) {
        return res.status(400).json({ error: 'No URL provided' });
    }
    
    const videoId = extractVideoId(url);
    
    if (!videoId) {
        return res.status(400).json({ error: 'Invalid YouTube URL' });
    }
    
    // Working download services (all should be accessible)
    const downloadServices = [
        {
            name: 'SaveFrom.net (Recommended)',
            url: `https://en.savefrom.net/download-from-youtube/?video_url=https://www.youtube.com/watch?v=${videoId}`,
            instructions: 'Click "Download" button on the page'
        },
        {
            name: 'Y2Mate',
            url: `https://www.y2mate.com/youtube/${videoId}`,
            instructions: 'Select quality and click "Download"'
        },
        {
            name: 'ConverterMP4',
            url: `https://convertermp4.cc/en13/youtube-mp4/${videoId}`,
            instructions: 'Wait for processing, then click download'
        },
        {
            name: 'YTMP4',
            url: `https://ytmp4.cc/en13/youtube-mp4/${videoId}`,
            instructions: 'Click "Convert" then "Download"'
        }
    ];
    
    res.json({
        success: true,
        videoId: videoId,
        message: 'Choose a download service below',
        downloadServices: downloadServices,
        directVideo: `https://www.youtube.com/watch?v=${videoId}`
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
});
