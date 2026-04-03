const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();

// Enable CORS
app.use(cors({ origin: '*' }));
app.use(express.json());

// Test endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Main info endpoint - Simplified to avoid crashes
app.get('/api/info', async (req, res) => {
    const { url } = req.query;
    
    console.log('Received request for URL:', url);
    
    if (!url) {
        return res.status(400).json({ error: 'No URL provided' });
    }
    
    try {
        // Handle YouTube URLs
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            // Extract video ID
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
            
            // Use a public API that definitely works
            const apiUrl = `https://pipedapi.kavin.rocks/streams/${videoId}`;
            const response = await axios.get(apiUrl, {
                timeout: 15000,
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            
            const data = response.data;
            
            // Build formats array safely
            const formats = [];
            
            // Add video streams if they exist
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
            
            // If no formats found, provide defaults
            if (formats.length === 0) {
                formats.push(
                    { quality: '360p', format: 'mp4', size: 'Unknown' },
                    { quality: '720p', format: 'mp4', size: 'Unknown' },
                    { quality: '1080p', format: 'mp4', size: 'Unknown' }
                );
            }
            
            const result = {
                title: data.title || 'YouTube Video',
                thumbnail: data.thumbnailUrl || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
                platform: 'youtube',
                formats: formats.slice(0, 8) // Limit to 8 formats
            };
            
            console.log('Sending response with', formats.length, 'formats');
            res.json(result);
        }
        else {
            // For non-YouTube URLs
            res.json({
                title: 'Video Link',
                thumbnail: '',
                platform: 'other',
                formats: [{ quality: 'Original', format: 'mp4', size: 'Unknown' }]
            });
        }
        
    } catch (error) {
        console.error('Error details:', error.message);
        res.status(500).json({ 
            error: error.message,
            hint: 'Make sure the video URL is valid and accessible'
        });
    }
});

// Download endpoint
app.get('/api/download', async (req, res) => {
    const { url } = req.query;
    
    if (!url) {
        return res.status(400).json({ error: 'No URL provided' });
    }
    
    try {
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            // For now, provide a direct download link using a public service
            // Extract video ID
            let videoId = null;
            if (url.includes('youtu.be')) {
                videoId = url.split('/').pop().split('?')[0];
            } else {
                const match = url.match(/[?&]v=([^&]+)/);
                if (match) videoId = match[1];
            }
            
            if (videoId) {
                // Use a public download service
                const downloadUrl = `https://pipedapi.kavin.rocks/streams/${videoId}`;
                const response = await axios.get(downloadUrl);
                const videoStream = response.data.videoStreams?.find(s => s.quality === '720p' || s.quality === '360p');
                
                if (videoStream && videoStream.url) {
                    // Redirect to the actual video URL
                    res.redirect(videoStream.url);
                } else {
                    res.json({ 
                        downloadUrl: `https://www.youtube.com/watch?v=${videoId}`,
                        note: 'Direct download requires backend with ytdl-core. Video will open in new tab.'
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
    console.log(`✅ Test with: https://your-backend.onrender.com/api/health`);
});
