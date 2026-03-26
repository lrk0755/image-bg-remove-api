/**
 * Image Background Remove - API 模式
 * 使用 remove.bg API 进行图片背景去除
 * 支持 Google OAuth 登录
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const session = require('express-session');
const passport = require('passport');
const authRoutes = require('../routes/auth');

// Session configuration
const sessionConfig = {
  secret: process.env.SESSION_SECRET || 'image-bg-remove-api-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000
  }
};

// Configuration
const config = {
  // Fixed to API mode
  mode: 'api',
  // remove.bg API configuration
  api: {
    apiKey: process.env.REMOVE_BG_API_KEY || '1teo3E5gQ5Rk82dN7CCXFZ1G',
    endpoint: 'https://api.remove.bg/v1.0/removebg'
  }
};

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('client'));

// Add session and Passport middleware
app.use(session(sessionConfig));
app.use(passport.initialize());
app.use(passport.session());
app.use('/auth', authRoutes);

// Get configuration
app.get('/api/config', (req, res) => {
  res.json({
    mode: config.mode,
    hasApiKey: !!config.api.apiKey,
    isAuthenticated: req.isAuthenticated ? req.isAuthenticated() : false
  });
});

// Use remove.bg API
async function removeBackgroundAPI(imageBuffer) {
  const FormData = require('form-data');
  const formData = new FormData();
  
  formData.append('image_file', Buffer.from(imageBuffer), {
    filename: 'image.png',
    contentType: 'image/png'
  });
  formData.append('size', 'auto');

  console.log('🔄 Using remove.bg API...');

  try {
    const response = await axios.post(config.api.endpoint, formData, {
      headers: {
        'X-Api-Key': config.api.apiKey,
        ...formData.getHeaders()
      },
      responseType: 'arraybuffer'
    });
    return Buffer.from(response.data);
  } catch (err) {
    console.error('API Error:', err.response?.data?.toString() || err.message);
    throw err;
  }
}

// Remove background endpoint
app.post('/api/remove-bg', async (req, res) => {
  try {
    const { image, imageUrl } = req.body;

    let buffer;
    if (image) {
      buffer = Buffer.from(image, 'base64');
    } else if (imageUrl) {
      const response = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30000 });
      buffer = Buffer.from(response.data);
    } else {
      return res.status(400).json({ error: 'Please provide image (base64 or URL)' });
    }

    console.log('🤖 Processing image...');
    const startTime = Date.now();
    
    const resultBuffer = await removeBackgroundAPI(buffer);
    const resultBase64 = resultBuffer.toString('base64');

    console.log(`✅ Done! Time: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

    res.json({ 
      image: resultBase64,
      format: 'png'
    });
    
  } catch (error) {
    console.error('Processing failed:', error.message);
    res.status(500).json({ error: error.message || 'Processing failed, please try again' });
  }
});

// Status endpoint
app.get('/api/status', (req, res) => {
  res.json({ 
    status: 'running',
    mode: config.mode,
    hasApiKey: !!config.api.apiKey,
    isAuthenticated: req.isAuthenticated ? req.isAuthenticated() : false
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Image Background Remove (API) started: http://0.0.0.0:${PORT}`);
  console.log(`📋 Current mode: ${config.mode}`);
  console.log(`🔑 API Key: ${config.api.apiKey ? 'configured' : 'not configured'}`);
});