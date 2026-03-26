# Image Background Remove (API)

AI-powered background removal using remove.bg API.

## ✨ Features

- **API Mode**: Uses remove.bg API for background removal
- **Simple UI**: Clean and intuitive interface
- **Supports**: PNG, JPG, WebP (up to 10MB)

## 🚀 Quick Start

### Install dependencies

```bash
npm install
```

### Run the service

```bash
npm start
```

Visit http://localhost:3001

### Configuration

To modify API Key, edit `server/index.js`:

```javascript
apiKey: process.env.REMOVE_BG_API_KEY || 'your-api-key'
```

## 📁 Project Structure

```
Image-Bg-Remove-API/
├── client/          # Frontend
├── server/          # Node.js backend
├── temp/            # Temp files
└── warmup/         # Warmup scripts
```

## 🛠️ Tech Stack

- **Frontend**: Native HTML/CSS/JavaScript
- **Backend**: Node.js + Express
- **API**: remove.bg

## 📄 License

MIT