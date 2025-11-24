# Stellarion Deployment Guide

## 🚀 Deploy to VPS (159.223.34.170) with Domain (stellarion.studio)

### Prerequisites
- Ubuntu 20.04/22.04 LTS VPS
- Domain pointed to your server IP
- Root access to the server

### Quick Deployment Steps

#### 1. Prepare Local Files
```bash
# Navigate to project directory
cd "D:\Stellarion AR\stellarion"

# Make deployment script executable (if on Linux/Mac)
chmod +x deploy.sh

# Run deployment script
./deploy.sh
```

#### 2. Manual Deployment (Alternative)

**Step A: Upload Files to Server**
```bash
# Upload via SCP/SFTP to server
scp -r * root@159.223.34.170:/var/www/stellarion/
```

**Step B: Server Setup Commands**
```bash
# Connect to server
ssh root@159.223.34.170

# Update system
apt update && apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
apt-get install -y nodejs

# Install required packages
apt install nginx mysql-server phpmyadmin -y

# Install PM2 for process management
npm install -g pm2

# Navigate to app directory
cd /var/www/stellarion

# Install dependencies
npm install --production
```

**Step C: Database Setup**
```bash
# Secure MySQL installation
mysql_secure_installation

# Create database and user
mysql -e "CREATE DATABASE stellarion_furniture;"
mysql -e "CREATE USER 'stellarion_user'@'localhost' IDENTIFIED BY 'stellarion2025';"
mysql -e "GRANT ALL PRIVILEGES ON stellarion_furniture.* TO 'stellarion_user'@'localhost';"
mysql -e "FLUSH PRIVILEGES;"

# Import database schemas
mysql stellarion_furniture < /var/www/stellarion/database/setup.sql
mysql stellarion_furniture < /var/www/stellarion/database/3d_models_schema.sql
```

**Step D: Nginx Configuration**
```bash
# Create Nginx site configuration
nano /etc/nginx/sites-available/stellarion
```

Paste this configuration:
```nginx
server {
    listen 80;
    server_name stellarion.studio www.stellarion.studio 159.223.34.170;

    root /var/www/stellarion;
    index index.html;

    # Static files
    location / {
        try_files $uri $uri/ @nodejs;
    }

    # API routes to Node.js
    location /api {
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

    # Fallback to Node.js
    location @nodejs {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # phpMyAdmin
    location /phpmyadmin {
        alias /usr/share/phpmyadmin;
        index index.php;
        
        location ~ \.php$ {
            include snippets/fastcgi-php.conf;
            fastcgi_pass unix:/var/run/php/php8.1-fpm.sock;
            fastcgi_param SCRIPT_FILENAME $request_filename;
        }
    }
}
```

```bash
# Enable site
ln -s /etc/nginx/sites-available/stellarion /etc/nginx/sites-enabled/
rm /etc/nginx/sites-enabled/default

# Test and restart Nginx
nginx -t
systemctl restart nginx
```

**Step E: SSL Certificate (Let's Encrypt)**
```bash
# Install Certbot
apt install certbot python3-certbot-nginx -y

# Get SSL certificate
certbot --nginx -d stellarion.studio -d www.stellarion.studio
```

**Step F: Start Application**
```bash
# Start with PM2
cd /var/www/stellarion
pm2 start server.js --name stellarion
pm2 save
pm2 startup
```

**Step G: Firewall Setup**
```bash
ufw allow 22
ufw allow 80
ufw allow 443
ufw allow 3000
ufw enable
```

### 🔧 Configuration Files

#### Environment Variables (.env)
```env
# Database Configuration
DB_HOST=localhost
DB_USER=stellarion_user
DB_PASSWORD=stellarion2025
DB_NAME=stellarion_furniture
DB_PORT=3306

# JWT Secret
JWT_SECRET=stellarion_secret_key_2025_furniture_app_production

# Server Configuration
PORT=3000
NODE_ENV=production

# Frontend URL (for CORS)
FRONTEND_URL=https://stellarion.studio

# Meshy API Configuration
MESHY_API_KEY=msy_BO62XMcAXyvcYttvXRLCQx4OSnyKJaUHCoOG
MESHY_API_BASE=https://api.meshy.ai/openapi/v1/image-to-3d
```

### 🔍 Verification Steps

1. **Check Website**: https://stellarion.studio
2. **Check phpMyAdmin**: https://stellarion.studio/phpmyadmin
3. **Test 3D Generator**: Upload image and generate model
4. **Check Database**: Verify data in phpMyAdmin

### 📊 Database Access

- **Database Name**: stellarion_furniture
- **Username**: stellarion_user
- **Password**: stellarion2025
- **phpMyAdmin**: https://stellarion.studio/phpmyadmin

### 🔧 Troubleshooting

**Check Application Status:**
```bash
pm2 status
pm2 logs stellarion
```

**Check Nginx:**
```bash
nginx -t
systemctl status nginx
```

**Check Database:**
```bash
systemctl status mysql
mysql -u stellarion_user -p
```

### 🎯 Features Included

✅ **Complete 3D Model Workflow:**
1. Image Upload with drag & drop
2. Detailed model information collection
3. AI-powered 3D generation with Meshy API
4. Model preview and download
5. Database storage with full details

✅ **Enhanced Model Details:**
- Category (Sofa, Chair, Table, etc.)
- Style (Modern, Scandinavian, etc.)
- Dimensions, Material, Colors
- Description and Pricing
- Texture and material information

✅ **Security & Authentication:**
- JWT-based user authentication
- CORS protection
- SSL encryption
- Secure database access

✅ **Database Management:**
- phpMyAdmin web interface
- Complete user and model management
- 3D model metadata storage
- Download tracking and analytics

The deployment is now ready for production use with all features fully functional!