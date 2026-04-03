// server.js - Complete video downloader backend
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const ytdl = require('@distube/ytdl-core');
const { TwitterApi } = require('twitter-api-v2');
const app = express();

app.use(cors());
app.use(express.json());

// YouTube Downloader
app.get('/api/download/youtube', async (req, res) => {
    try {
        const { url, quality } = req.query;
        
        // Get video info
        const info = await ytdl.getInfo(url);
        const title = info.videoDetails.title.replace(/[^\w\s]/gi, '');
        
        // Get the best format based on quality requested
        let format;
        if (quality === 'highest') {
            format = ytdl.chooseFormat(info.formats, { quality: 'highestvideo' });
        } else {
            format = ytdl.chooseFormat(info.formats, { quality: quality });
        }
        
        // Set headers to force download
        res.header('Content-Disposition', `attachment; filename="${title}.mp4"`);
        res.header('Content-Type', 'video/mp4');
        
        // Stream the video directly to client
        ytdl(url, { format: format })
            .pipe(res);
            
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// TikTok Downloader
app.get('/api/download/tiktok', async (req, res) => {
    try {
        const { url } = req.query;
        
        // Use tikwm.com API (free, no key required)
        const apiUrl = `https://tikwm.com/api/?url=${encodeURIComponent(url)}`;
        const response = await axios.get(apiUrl);
        
        if (response.data && response.data.data && response.data.data.play) {
            const videoUrl = response.data.data.play;
            const title = response.data.data.title || 'tiktok_video';
            
            // Fetch the video and pipe it to response
            const videoResponse = await axios({
                method: 'get',
                url: videoUrl,
                responseType: 'stream'
            });
            
            res.header('Content-Disposition', `attachment; filename="${title}.mp4"`);
            res.header('Content-Type', 'video/mp4');
            videoResponse.data.pipe(res);
        } else {
            throw new Error('Could not fetch TikTok video');
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Instagram Downloader
app.get('/api/download/instagram', async (req, res) => {
    try {
        const { url } = req.query;
        
        // Using instagram-stories API (free)
        const apiUrl = `https://instagram-stories-api.p.rapidapi.com/v1/media-info?url=${encodeURIComponent(url)}`;
        
        // Note: You need to sign up for free RapidAPI key
        // Replace with your key from https://rapidapi.com/rockethearts/api/instagram-stories
        const response = await axios.get(apiUrl, {
            headers: {
                'X-RapidAPI-Key': 'YOUR_RAPIDAPI_KEY', // Get free key
                'X-RapidAPI-Host': 'instagram-stories-api.p.rapidapi.com'
            }
        });
        
        if (response.data && response.data.video_url) {
            const videoResponse = await axios({
                method: 'get',
                url: response.data.video_url,
                responseType: 'stream'
            });
            
            res.header('Content-Disposition', `attachment; filename="instagram_video.mp4"`);
            videoResponse.data.pipe(res);
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Facebook Downloader
app.get('/api/download/facebook', async (req, res) => {
    try {
        const { url } = req.query;
        
        // Using fdown.net API
        const apiUrl = `https://fdown.net/api/download?url=${encodeURIComponent(url)}`;
        const response = await axios.post(apiUrl);
        
        if (response.data && response.data.video_url) {
            const videoResponse = await axios({
                method: 'get',
                url: response.data.video_url,
                responseType: 'stream'
            });
            
            res.header('Content-Disposition', `attachment; filename="facebook_video.mp4"`);
            videoResponse.data.pipe(res);
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Twitter/X Downloader
app.get('/api/download/twitter', async (req, res) => {
    try {
        const { url } = req.query;
        
        // Using twitsave API
        const apiUrl = `https://twitsave.com/info?url=${encodeURIComponent(url)}`;
        const response = await axios.get(apiUrl);
        
        // Extract video URL from HTML response
        const match = response.data.match(/https:\/\/[\w.-]+\.twimg\.com\/[\w\/\-\.]+\.mp4/);
        if (match) {
            const videoResponse = await axios({
                method: 'get',
                url: match[0],
                responseType: 'stream'
            });
            
            res.header('Content-Disposition', `attachment; filename="twitter_video.mp4"`);
            videoResponse.data.pipe(res);
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Universal Downloader - Auto detects platform
app.get('/api/download', async (req, res) => {
    const { url, quality = 'highest' } = req.query;
    
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }
    
    // Detect platform
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
        // Redirect to YouTube handler
        res.redirect(`/api/download/youtube?url=${encodeURIComponent(url)}&quality=${quality}`);
    } 
    else if (url.includes('tiktok.com')) {
        res.redirect(`/api/download/tiktok?url=${encodeURIComponent(url)}`);
    }
    else if (url.includes('instagram.com')) {
        res.redirect(`/api/download/instagram?url=${encodeURIComponent(url)}`);
    }
    else if (url.includes('facebook.com') || url.includes('fb.com')) {
        res.redirect(`/api/download/facebook?url=${encodeURIComponent(url)}`);
    }
    else if (url.includes('twitter.com') || url.includes('x.com')) {
        res.redirect(`/api/download/twitter?url=${encodeURIComponent(url)}`);
    }
    else {
        res.status(400).json({ error: 'Unsupported platform' });
    }
});

// Get video info (title, thumbnail, formats)
app.get('/api/info', async (req, res) => {
    const { url } = req.query;
    
    try {
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            const info = await ytdl.getInfo(url);
            const formats = info.formats
                .filter(f => f.hasVideo && f.hasAudio)
                .map(f => ({
                    quality: f.qualityLabel || f.quality,
                    format: f.container,
                    size: f.contentLength ? (f.contentLength / 1024 / 1024).toFixed(2) + ' MB' : 'Unknown',
                    itag: f.itag
                }));
            
            res.json({
                title: info.videoDetails.title,
                thumbnail: info.videoDetails.thumbnails[0].url,
                platform: 'youtube',
                formats: formats
            });
        }
        else if (url.includes('tiktok.com')) {
            const apiUrl = `https://tikwm.com/api/?url=${encodeURIComponent(url)}`;
            const response = await axios.get(apiUrl);
            res.json({
                title: response.data.data.title,
                thumbnail: response.data.data.cover,
                platform: 'tiktok',
                formats: [{ quality: 'HD', format: 'mp4', size: 'Unknown' }]
            });
        }
        else {
            res.json({
                title: 'Video',
                thumbnail: '',
                platform: 'other',
                formats: [{ quality: 'Best', format: 'mp4', size: 'Unknown' }]
            });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
