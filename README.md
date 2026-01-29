# tg-file-linker (Telegram file → Railway stream/download links)

## What it does
Send any file/video/document to the bot.
It returns:
- Stream page: /s/:id  (Railway page with HTML video player)
- Video source: /v/:id (redirect to Telegram CDN)
- Download: /d/:id (redirect to Telegram CDN)

This keeps Railway bandwidth very low.

## Environment variables (Railway Variables)
Required:
- BOT_TOKEN=123:ABC...
- BASE_URL=https://your-app.up.railway.app

Optional:
- REDIS_URL=redis://... (recommended)
- LINK_TTL_SEC=86400
- ADMIN_ID=123456789
- MAX_MB=0

## Run locally
npm i
npm start
