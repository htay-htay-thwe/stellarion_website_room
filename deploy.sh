#!/bin/bash

# Stellarion Deployment Script
# Deploy to 159.223.34.170 with domain stellarion.studio

echo "🚀 Stellarion Deployment Script"
echo "==============================="

# Server configuration
SERVER_IP="159.223.34.170"
DOMAIN="stellarion.studio"
APP_DIR="/var/www/stellarion"
DB_NAME="stellarion_furniture"
DB_USER="stellarion_user"
DB_PASS="stellarion2025"

echo "📦 Step 1: Preparing deployment package..."

# Create deployment directory
mkdir -p deployment
cp -r * deployment/ 2>/dev/null || true
cd deployment

# Remove unnecessary files
rm -rf node_modules
rm -f deploy.sh
rm -f README.md
rm -rf .git

echo "🔧 Step 2: Installing dependencies..."
npm install --production

echo "🌐 Step 3: Connecting to server..."

# Upload files to server
echo "Uploading files to $SERVER_IP..."
rsync -avz --exclude 'node_modules' --exclude '.git' . root@$SERVER_IP:$APP_DIR/

# Execute commands on server
ssh root@$SERVER_IP << EOF

echo "🔄 Setting up server environment..."

# Update system
apt update && apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
apt-get install -y nodejs

# Install Nginx
apt install nginx -y

# Install MySQL
apt install mysql-server -y

# Install phpMyAdmin
apt install phpmyadmin -y

# Install PM2 for process management
npm install -g pm2

echo "🗄️  Setting up database..."

# Configure MySQL
mysql -e "CREATE DATABASE IF NOT EXISTS $DB_NAME;"
mysql -e "CREATE USER IF NOT EXISTS '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASS';"
mysql -e "GRANT ALL PRIVILEGES ON $DB_NAME.* TO '$DB_USER'@'localhost';"
mysql -e "FLUSH PRIVILEGES;"

# Import database schemas
mysql $DB_NAME < $APP_DIR/database/setup.sql
mysql $DB_NAME < $APP_DIR/database/3d_models_schema.sql

echo "🔧 Installing application dependencies..."
cd $APP_DIR
npm install --production

echo "🌐 Configuring Nginx..."

# Create Nginx configuration
cat > /etc/nginx/sites-available/stellarion << 'NGINX_EOF'
server {
    listen 80;
    server_name stellarion.studio www.stellarion.studio 159.223.34.170;

    # Static files
    location / {
        root /var/www/stellarion;
        try_files \$uri \$uri/ @nodejs;
        index index.html;
    }

    # API routes to Node.js
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # Fallback to Node.js for SPA routes
    location @nodejs {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }

    # phpMyAdmin
    location /phpmyadmin {
        alias /usr/share/phpmyadmin;
        index index.php;
        
        location ~ \.php\$ {
            include snippets/fastcgi-php.conf;
            fastcgi_pass unix:/var/run/php/php8.1-fpm.sock;
        }
    }
}
NGINX_EOF

# Enable site
ln -sf /etc/nginx/sites-available/stellarion /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test and restart Nginx
nginx -t && systemctl restart nginx

echo "🔐 Setting up SSL with Let's Encrypt..."

# Install Certbot
apt install certbot python3-certbot-nginx -y

# Get SSL certificate
certbot --nginx -d stellarion.studio -d www.stellarion.studio --non-interactive --agree-tos --email admin@stellarion.studio

echo "🚀 Starting application..."

# Start application with PM2
cd $APP_DIR
pm2 stop stellarion 2>/dev/null || true
pm2 delete stellarion 2>/dev/null || true
pm2 start server.js --name stellarion --env production
pm2 save
pm2 startup

echo "🔧 Setting up firewall..."
ufw allow 22
ufw allow 80
ufw allow 443
ufw allow 3000
ufw --force enable

echo "✅ Deployment completed!"
echo "🌐 Website: https://stellarion.studio"
echo "🗄️  phpMyAdmin: https://stellarion.studio/phpmyadmin"
echo "📊 Database: $DB_NAME"
echo "👤 User: $DB_USER"
echo "🔑 Password: $DB_PASS"

EOF

echo "🎉 Deployment completed successfully!"
echo "🌐 Your application is now available at: https://stellarion.studio"
echo "🗄️  phpMyAdmin: https://stellarion.studio/phpmyadmin"