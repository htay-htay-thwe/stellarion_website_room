#!/bin/bash
cd /var/www/stellarion_website_room

# Pull the latest code
git pull origin main

# Install dependencies (Node example)c
npm install

# Build frontend (if frontend project)
npm run build

# Restart Node server (using PM2)
pm2 restart all
