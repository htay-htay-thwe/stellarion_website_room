# 🚀 STELLARION 3D FURNITURE GENERATOR - PRODUCTION DEPLOYMENT GUIDE

## Quick Overview
This guide will help you deploy the Stellarion 3D Furniture Generator to your production server (159.223.34.170) with domain stellarion.studio.

## 📋 Pre-Deployment Checklist

### ✅ Domain Configuration
1. **DNS Setup**: Point your domain to the server IP
   ```
   A Record: stellarion.studio → 159.223.34.170
   A Record: www.stellarion.studio → 159.223.34.170
   ```

2. **Server Access**: Ensure you have root SSH access
   ```bash
   ssh root@159.223.34.170
   ```

3. **Meshy API Key**: Have your Meshy AI API key ready
   - Get it from: https://www.meshy.ai/
   - You'll need to add it to the .env file after deployment

## 🎯 Deployment Methods

### Method 1: Automated Deployment (Recommended)

#### Step 1: Upload Files to Server
```bash
# From your local machine (where stellarion project is located)
rsync -avz --exclude node_modules --exclude .git ./stellarion/ root@159.223.34.170:/var/www/stellarion/
```

#### Step 2: Run Deployment Script
```bash
# SSH into your server
ssh root@159.223.34.170

# Navigate to project directory
cd /var/www/stellarion

# Make deploy script executable
chmod +x deploy.sh

# Run deployment
./deploy.sh
```

#### Step 3: Configure API Key
```bash
# Edit environment file
nano /var/www/stellarion/.env

# Update the MESHY_API_KEY line:
MESHY_API_KEY=msy_your_actual_api_key_here
```

#### Step 4: Restart Application
```bash
pm2 restart stellarion-3d
```

### Method 2: Manual Step-by-Step Deployment

#### Step 1: System Updates
```bash
apt update && apt upgrade -y
apt install -y curl wget git unzip software-properties-common
```

#### Step 2: Install Node.js 18
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
apt install -y nodejs
npm install -g pm2 yarn
```

#### Step 3: Install MySQL 8.0
```bash
apt install -y mysql-server mysql-client

# Secure MySQL
mysql_secure_installation

# Create database
mysql -u root -p
```

```sql
CREATE DATABASE stellarion_furniture CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'stellarion_user'@'localhost' IDENTIFIED BY 'your_secure_password';
GRANT ALL PRIVILEGES ON stellarion_furniture.* TO 'stellarion_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

#### Step 4: Install phpMyAdmin
```bash
apt install -y phpmyadmin php-mbstring php-zip php-gd php-json php-curl
```

#### Step 5: Install and Configure Nginx
```bash
apt install -y nginx

# Create Nginx configuration
nano /etc/nginx/sites-available/stellarion
```

```nginx
# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name stellarion.studio www.stellarion.studio 159.223.34.170;
    return 301 https://$host$request_uri;
}

# Main HTTPS configuration
server {
    listen 443 ssl http2;
    server_name stellarion.studio www.stellarion.studio;
    
    # SSL certificates (will be updated by Certbot)
    ssl_certificate /etc/letsencrypt/live/stellarion.studio/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/stellarion.studio/privkey.pem;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    
    # Main application
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
    
    # API routes with larger body size for file uploads
    location /api/ {
        proxy_pass http://localhost:3000;
        client_max_body_size 50M;
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }
    
    # phpMyAdmin
    location /phpmyadmin {
        proxy_pass http://localhost/phpmyadmin;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
# Enable site
ln -sf /etc/nginx/sites-available/stellarion /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test and restart
nginx -t
systemctl restart nginx
systemctl enable nginx
```

#### Step 6: Install SSL Certificate
```bash
# Install Certbot
apt install -y snapd
snap install core; snap refresh core
snap install --classic certbot
ln -sf /snap/bin/certbot /usr/bin/certbot

# Get SSL certificate
certbot --nginx -d stellarion.studio -d www.stellarion.studio

# Setup auto-renewal
echo "0 12 * * * /usr/bin/certbot renew --quiet" | crontab -
```

#### Step 7: Deploy Application
```bash
# Create application directory
mkdir -p /var/www/stellarion
cd /var/www/stellarion

# Install dependencies
npm install --production

# Create .env file
nano .env
```

```env
NODE_ENV=production
PORT=3000

# Database Configuration
DB_HOST=localhost
DB_USER=stellarion_user
DB_PASSWORD=your_secure_password
DB_NAME=stellarion_furniture

# JWT Configuration
JWT_SECRET=your_jwt_secret_here
JWT_EXPIRES_IN=24h

# Meshy AI Configuration
MESHY_API_KEY=msy_your_actual_api_key_here

# Domain Configuration
DOMAIN=stellarion.studio
SERVER_IP=159.223.34.170

# CORS Configuration
CORS_ORIGINS=https://stellarion.studio,https://www.stellarion.studio,https://159.223.34.170
```

#### Step 8: Setup Database Schema
```bash
mysql -u stellarion_user -p stellarion_furniture < database/enhanced_3d_models_schema.sql
```

#### Step 9: Start Application with PM2
```bash
# Create PM2 ecosystem file
nano ecosystem.config.js
```

```javascript
module.exports = {
  apps: [{
    name: 'stellarion-3d',
    script: 'server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_file: './logs/pm2-combined.log',
    time: true,
    max_memory_restart: '1G'
  }]
};
```

```bash
# Create logs directory
mkdir -p logs

# Start application
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

#### Step 10: Configure Firewall
```bash
# Install and configure UFW
apt install -y ufw
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80
ufw allow 443
ufw enable
```

## 🔧 Post-Deployment Configuration

### 1. Test Application Access
- Visit: https://stellarion.studio
- Check: All pages load correctly
- Test: Sign up and login functionality

### 2. Test 3D Model Generation
1. **Sign up/Login** to the application
2. **Navigate to 3D Generator** page
3. **Upload an image** of furniture
4. **Fill out model details** (category, style, dimensions, etc.)
5. **Generate 3D model** and verify API integration

### 3. Database Management
- Access phpMyAdmin: https://stellarion.studio/phpmyadmin
- Login with database credentials
- Verify tables are created correctly
- Check that 3D models are being saved

### 4. Monitor Application
```bash
# Check PM2 status
pm2 status

# View application logs
pm2 logs stellarion-3d

# Check Nginx logs
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log

# Check system resources
htop
df -h
```

## 🛠️ Troubleshooting

### Common Issues and Solutions

#### 1. CORS Errors
**Problem**: Cross-origin requests blocked
**Solution**: Verify CORS configuration in server.js
```javascript
const corsOptions = {
    origin: [
        'https://stellarion.studio',
        'https://www.stellarion.studio',
        'https://159.223.34.170'
    ],
    credentials: true
};
```

#### 2. 3D Model Generation Fails
**Problem**: Meshy API returns errors
**Solution**: 
- Verify API key is correct in .env
- Check API quota and limits
- Verify image format and size requirements

#### 3. Database Connection Issues
**Problem**: Cannot connect to MySQL
**Solution**:
```bash
# Check MySQL service
systemctl status mysql

# Test connection
mysql -u stellarion_user -p

# Verify user permissions
mysql -u root -p -e "SHOW GRANTS FOR 'stellarion_user'@'localhost';"
```

#### 4. SSL Certificate Issues
**Problem**: Certificate not working
**Solution**:
```bash
# Check certificate status
certbot certificates

# Renew certificate
certbot renew --dry-run

# Check Nginx configuration
nginx -t
```

#### 5. File Upload Issues
**Problem**: Image uploads fail
**Solution**:
```bash
# Check upload directory permissions
ls -la /var/www/stellarion/uploads/

# Fix permissions if needed
chown -R www-data:www-data /var/www/stellarion/uploads/
chmod -R 755 /var/www/stellarion/uploads/
```

## 📊 Monitoring and Maintenance

### Daily Checks
1. Check application status: `pm2 status`
2. Monitor disk space: `df -h`
3. Check error logs: `pm2 logs stellarion-3d --lines 50`

### Weekly Maintenance
1. Update system packages: `apt update && apt upgrade -y`
2. Restart application: `pm2 restart stellarion-3d`
3. Check SSL certificate status: `certbot certificates`

### Monthly Tasks
1. Database cleanup and optimization
2. Log rotation and cleanup
3. Security updates
4. Backup verification

### Backup Strategy
```bash
# Manual backup script
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/var/backups/stellarion"
mkdir -p $BACKUP_DIR

# Backup database
mysqldump -u stellarion_user -p stellarion_furniture | gzip > $BACKUP_DIR/db_$DATE.sql.gz

# Backup application files
tar -czf $BACKUP_DIR/app_$DATE.tar.gz -C /var/www/stellarion --exclude=node_modules .

# Remove backups older than 30 days
find $BACKUP_DIR -name "*.tar.gz" -mtime +30 -delete
find $BACKUP_DIR -name "*.sql.gz" -mtime +30 -delete
```

## 🎯 Performance Optimization

### MySQL Optimization
Add to `/etc/mysql/mysql.conf.d/stellarion.cnf`:
```ini
[mysqld]
innodb_buffer_pool_size = 256M
query_cache_type = 1
query_cache_size = 32M
max_connections = 200
```

### Nginx Optimization
Add to nginx configuration:
```nginx
gzip on;
gzip_vary on;
gzip_min_length 1024;
gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;

client_body_buffer_size 128k;
client_max_body_size 50m;
```

### PM2 Optimization
```javascript
// In ecosystem.config.js
{
  instances: 'max',
  exec_mode: 'cluster',
  max_memory_restart: '1G',
  node_args: '--max_old_space_size=1024'
}
```

## 🔐 Security Checklist

- ✅ SSL/TLS certificates installed and auto-renewing
- ✅ Firewall configured (UFW)
- ✅ Regular security updates
- ✅ Strong database passwords
- ✅ JWT secret properly configured
- ✅ File upload restrictions in place
- ✅ Nginx security headers configured
- ✅ Database user with minimal privileges
- ✅ SSH key-based authentication (recommended)
- ✅ Regular backups configured

## 📞 Support and Resources

### Important File Locations
- **Application**: `/var/www/stellarion/`
- **Nginx Config**: `/etc/nginx/sites-available/stellarion`
- **PM2 Config**: `/var/www/stellarion/ecosystem.config.js`
- **Environment**: `/var/www/stellarion/.env`
- **Logs**: `/var/www/stellarion/logs/`
- **Database Schema**: `/var/www/stellarion/database/enhanced_3d_models_schema.sql`

### Useful Commands
```bash
# Application management
pm2 status
pm2 restart stellarion-3d
pm2 logs stellarion-3d
pm2 monit

# Server management
systemctl status nginx
systemctl status mysql
nginx -t
mysql -u stellarion_user -p

# Monitoring
htop
df -h
free -m
netstat -tlnp

# SSL management
certbot certificates
certbot renew --dry-run
```

### Emergency Contacts
- **Server Issues**: Check server logs and PM2 status
- **Database Issues**: Access phpMyAdmin or use MySQL CLI
- **SSL Issues**: Use Certbot commands
- **Application Issues**: Check PM2 logs and restart if needed

---

## 🎉 Deployment Complete!

After successful deployment, your Stellarion 3D Furniture Generator will be available at:

- **🌐 Main Site**: https://stellarion.studio
- **📊 Database Management**: https://stellarion.studio/phpmyadmin
- **🔧 Server Management**: SSH to root@159.223.34.170

**Next Steps:**
1. Test all functionality thoroughly
2. Monitor application performance
3. Set up regular backups
4. Configure monitoring alerts
5. Add your actual Meshy AI API key

**Remember to save all passwords and credentials securely!**