const express = require('express');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Install yt-dlp on startup
console.log('🚀 Starting Video Downloader on Render...');
try {
    execSync('which yt-dlp', { stdio: 'ignore' });
    console.log('✅ yt-dlp is installed');
} catch (e) {
    console.log('📦 Installing yt-dlp...');
    try {
        execSync('pip3 install yt-dlp', { stdio: 'inherit' });
        console.log('✅ yt-dlp installed successfully');
    } catch (error) {
        console.log('❌ yt-dlp installation failed:', error.message);
    }
}

// Middleware
app.use(express.static('public'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Rate limiting
const downloadCounts = {};
const MAX_DOWNLOADS_PER_HOUR = 10;

// Home route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Download route
app.post('/download', (req, res) => {
    const { url, quality } = req.body;
    const clientIP = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    
    // Rate limiting
    const now = Date.now();
    const oneHourAgo = now - 3600000;
    
    if (!downloadCounts[clientIP]) {
        downloadCounts[clientIP] = [];
    }
    
    downloadCounts[clientIP] = downloadCounts[clientIP].filter(time => time > oneHourAgo);
    
    if (downloadCounts[clientIP].length >= MAX_DOWNLOADS_PER_HOUR) {
        return res.json({ 
            success: false, 
            message: '⏳ Rate limit: Max 10 downloads per hour. Please wait.' 
        });
    }
    
    downloadCounts[clientIP].push(now);

    if (!url) {
        return res.json({ success: false, message: '❌ URL is required' });
    }

    console.log(`📥 Download request: ${url}`);

    // Quality mapping
    let qualityArg;
    switch(quality) {
        case 'best':
            qualityArg = 'best[height<=720]';
            break;
        case 'worst':
            qualityArg = 'worst';
            break;
        case 'mp4':
            qualityArg = 'best[ext=mp4]';
            break;
        case '360p':
            qualityArg = 'best[height<=360]';
            break;
        case '480p':
            qualityArg = 'best[height<=480]';
            break;
        case '720p':
            qualityArg = 'best[height<=720]';
            break;
        default:
            qualityArg = 'best[height<=720]';
    }

    const args = [
        '-f', qualityArg,
        '--merge-output-format', 'mp4',
        '-o', '/tmp/%(title).100s.%(ext)s',
        '--no-warnings',
        '--max-filesize', '100M',
        url
    ];

    const ytDlp = spawn('yt-dlp', args);

    let output = '';
    let error = '';

    ytDlp.stdout.on('data', (data) => {
        output += data.toString();
        if (data.toString().includes('[download]') || data.toString().includes('%')) {
            console.log('📊', data.toString().trim());
        }
    });

    ytDlp.stderr.on('data', (data) => {
        error += data.toString();
    });

    ytDlp.on('close', (code) => {
        if (code === 0) {
            res.json({ 
                success: true, 
                message: '✅ Download completed! File will auto-delete after some time.' 
            });
        } else {
            let errorMessage = '❌ Download failed';
            if (error.includes('File is larger')) {
                errorMessage = '❌ File too large (max 100MB)';
            } else if (error.includes('Unsupported URL')) {
                errorMessage = '❌ Unsupported website';
            } else if (error.includes('Video unavailable')) {
                errorMessage = '❌ Video not available';
            }
            res.json({ success: false, message: errorMessage });
        }
    });
});

// Get video info
app.post('/info', (req, res) => {
    const { url } = req.body;
    
    if (!url) {
        return res.json({ success: false, message: 'URL is required' });
    }

    const ytDlp = spawn('yt-dlp', [
        '--dump-json',
        '--no-warnings',
        url
    ]);

    let data = '';
    let errorData = '';
    
    ytDlp.stdout.on('data', (chunk) => {
        data += chunk.toString();
    });

    ytDlp.stderr.on('data', (error) => {
        errorData += error.toString();
    });

    ytDlp.on('close', (code) => {
        if (code === 0 && data) {
            try {
                const info = JSON.parse(data);
                res.json({
                    success: true,
                    title: info.title || 'Unknown Title',
                    duration: info.duration_string || 'Unknown',
                    thumbnail: info.thumbnail || '',
                    uploader: info.uploader || 'Unknown'
                });
            } catch (e) {
                res.json({ success: false, message: 'Failed to parse video info' });
            }
        } else {
            res.json({ success: false, message: 'Failed to get video info' });
        }
    });
});

// Server status
app.get('/status', (req, res) => {
    res.json({
        status: 'online',
        platform: 'Render.com',
        max_file_size: '100MB',
        rate_limit: '10 downloads/hour',
        supported_sites: 'YouTube, Facebook, Instagram, TikTok, Vimeo, Dailymotion'
    });
});

// Start server
app.listen(PORT, () => {
    console.log('\n' + '='.repeat(50));
    console.log('🎥 VIDEO DOWNLOADER - RENDER DEPLOYMENT');
    console.log('='.repeat(50));
    console.log(`📍 Server running on port: ${PORT}`);
    console.log(`🌐 Your site: https://your-project.onrender.com`);
    console.log(`⚡ Free Tier: 750 hours/month`);
    console.log(`📊 Rate limit: 10 downloads/hour per user`);
    console.log(`💾 Max file size: 100MB`);
    console.log('='.repeat(50));
});
