const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();

// Enable CORS
app.use(cors({ origin: '*' }));
app.use(express.json());

// Function to clean YouTube URLs (remove playlist, radio, etc.)
function cleanYouTubeUrl(url) {
    let videoId = null;
    
    // Handle youtu.be format
    if (url.includes('youtu.be')) {
        videoId = url.split('/').pop().split('?')[0];
    } 
    // Handle youtube.com format
    else if (url.includes('youtube.com')) {
        const match = url.match(/[?&]v=([^&]+)/);
        if (match) videoId = match[1];
    }
    
    if (videoId) {
        // Return a clean URL with just the video ID
        return `https://www.youtube.com/watch?v=${videoId}`;
    }
    
    return url;
}

// Test endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Main info endpoint
app.get('/api/info', async (req, res) => {
    let { url } = req.query;
    
    console.log('Original URL:', url);
    
    if (!url) {
        return res.status(400).json({ error: 'No URL provided' });
    }
    
    // Clean YouTube URLs before processing
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
        url = cleanYouTubeUrl(url);
        console.log('Cleaned URL:', url);
    }
    
    try {
        // Handle YouTube URLs
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            // Extract video ID from cleaned URL
            let videoId = null;
            if (url.includes('youtu.be')) {
                videoId = url.split('/').pop().split('?')[0];
            } else {
                const match = url.match(/[?&]v=([^&]+)/);
                if (match) videoId = match[1];
            }
            
            if (!videoId) {
                throw new Error('Could not extract YouTube video ID');
            }
            
            console.log('YouTube video ID:', videoId);
            
            // Use the public API with just the video ID
            const apiUrl = `https://pipedapi.kavin.rocks/streams/${videoId}`;
            const response = await axios.get(apiUrl, {
                timeout: 15000,
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            
            const data = response.data;
            
            // Build formats array safely
            const formats = [];
            
            if (data.videoStreams && Array.isArray(data.videoStreams)) {
                data.videoStreams.forEach(stream => {
                    if (stream.url && stream.quality) {
                        formats.push({
                            quality: stream.quality,
                            format: 'mp4',
                            size: stream.contentLength ? Math.round(stream.contentLength / 1024 / 1024) + ' MB' : 'Unknown'
                        });
                    }
                });
            }
            
            if (formats.length === 0) {
                formats.push(
                    { quality: '360p', format: 'mp4', size: 'Unknown' },
                    { quality: '720p', format: 'mp4', size: 'Unknown' }
                );
            }
            
            const result = {
                title: data.title || 'YouTube Video',
                thumbnail: data.thumbnailUrl || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
                platform: 'youtube',
                formats: formats.slice(0, 8)
            };
            
            console.log('Success! Sending', formats.length, 'formats');
            res.json(result);
        }
        else {
            res.json({
                title: 'Video Link',
                thumbnail: '',
                platform: 'other',
                formats: [{ quality: 'Original', format: 'mp4', size: 'Unknown' }]
            });
        }
        
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ 
            error: error.message,
            hint: 'Try using a simple YouTube URL without playlist parameters'
        });
    }
});

// Download endpoint
app.get('/api/download', async (req, res) => {
    let { url } = req.query;
    
    if (!url) {
        return res.status(400).json({ error: 'No URL provided' });
    }
    
    // Clean YouTube URLs
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
        url = cleanYouTubeUrl(url);
    }
    
    try {
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            let videoId = null;
            if (url.includes('youtu.be')) {
                videoId = url.split('/').pop().split('?')[0];
            } else {
                const match = url.match(/[?&]v=([^&]+)/);
                if (match) videoId = match[1];
            }
            
            if (videoId) {
                const apiUrl = `https://pipedapi.kavin.rocks/streams/${videoId}`;
                const response = await axios.get(apiUrl);
                const videoStream = response.data.videoStreams?.find(s => s.quality === '720p' || s.quality === '360p');
                
                if (videoStream && videoStream.url) {
                    res.redirect(videoStream.url);
                } else {
                    res.json({ 
                        downloadUrl: `https://www.youtube.com/watch?v=${videoId}`,
                        note: 'Open this link and right-click to save video'
                    });
                }
            } else {
                throw new Error('Invalid YouTube URL');
            }
        } else {
            res.status(400).json({ error: 'Download not supported for this platform yet' });
        }
    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
});
