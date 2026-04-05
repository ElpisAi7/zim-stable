# Deployment Guide to vm952cali.yourlocaldomain.com

## Prerequisites

You have access to vm952cali.yourlocaldomain.com with the SSH public key already configured.

## Quick Start

### 1. Connect to Server
```bash
ssh -i ~/.ssh/your_key ubuntu@vm952cali.yourlocaldomain.com
```

### 2. Clone Repository
```bash
cd /opt
sudo git clone https://github.com/ElpisAi7/zim-stable.git
cd zim-stable
sudo chown -R ubuntu:ubuntu .
```

### 3. Install Dependencies
```bash
# Install Node.js if not present
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install pnpm
npm install -g pnpm

# Install project dependencies
pnpm install
```

### 4. Configure Environment

Create `.env.local` in `apps/web/`:

```bash
nano apps/web/.env.local
```

Paste:
```env
# Paynow
PAYNOW_INTEGRATION_KEY=your_key_here
PAYNOW_API_URL=https://www.paynow.co.zw/api/initiate
PAYNOW_STATUS_URL=https://www.paynow.co.zw/api/status

# Yellow Card
YELLOWCARD_API_KEY=your_key_here
YELLOWCARD_API_URL=https://api.yellowcard.io/v2

# Hosting Africa
HOSTING_AFRICA_API_KEY=your_key_here
HOSTING_AFRICA_API_URL=https://api.hostingafrica.com/v1
HOSTING_AFRICA_REGION=zim

# Celo
NEXT_PUBLIC_CELO_RPC_URL=https://alfajores-forno.celo-testnet.org
NEXT_PUBLIC_CELO_NETWORK=celo-sepolia

# App
NEXT_PUBLIC_APP_URL=https://vm952cali.yourlocaldomain.com
NEXT_PUBLIC_APP_ENVIRONMENT=production
```

### 5. Build Application
```bash
cd apps/web
pnpm build
```

### 6. Setup Systemd Service

Create systemd service file:
```bash
sudo nano /etc/systemd/system/zimstable.service
```

Content:
```ini
[Unit]
Description=ZimStable Remittance Service
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/zim-stable/apps/web
EnvironmentFile=/opt/zim-stable/apps/web/.env.local
ExecStart=/home/ubuntu/.npm/_npx/node /opt/zim-stable/apps/web/.next/server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable zimstable
sudo systemctl start zimstable
```

### 7. Setup Nginx Reverse Proxy

Install Nginx:
```bash
sudo apt-get install -y nginx
```

Create config:
```bash
sudo nano /etc/nginx/sites-available/zimstable
```

Content:
```nginx
server {
    listen 80;
    listen [::]:80;
    server_name vm952cali.yourlocaldomain.com;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name vm952cali.yourlocaldomain.com;

    # SSL Configuration (use Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/vm952cali.yourlocaldomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/vm952cali.yourlocaldomain.com/privkey.pem;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss;

    # Proxy to Next.js
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
        
        # Timeouts for long-running operations
        proxy_connect_timeout 120s;
        proxy_send_timeout 120s;
        proxy_read_timeout 120s;
    }

    # API rate limiting
    location /api/ {
        limit_req zone=api burst=20 nodelay;
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}

# Rate limiting zones
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
```

Enable site:
```bash
sudo ln -s /etc/nginx/sites-available/zimstable /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 8. Setup SSL with Let's Encrypt

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot certonly --nginx -d vm952cali.yourlocaldomain.com
```

### 9. Health Check

Verify service:
```bash
curl https://vm952cali.yourlocaldomain.com
systemctl status zimstable
journalctl -u zimstable -f
```

## Monitoring

### View Logs
```bash
# Service logs
journalctl -u zimstable -f

# Nginx logs
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log

# System logs
dmesg | tail -20
```

### Setup Log Rotation
```bash
sudo nano /etc/logrotate.d/zimstable
```

Content:
```
/opt/zim-stable/apps/web/logs/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 ubuntu ubuntu
    sharedscripts
}
```

### Monitor System Resources
```bash
# CPU/Memory
htop

# Disk usage
df -h

# Network
iftop
```

## Troubleshooting

### Service won't start
```bash
sudo systemctl status zimstable
journalctl -u zimstable -n 50
# Check .env.local exists and has correct permissions
```

### 502 Bad Gateway
```bash
# Check if Next.js is running
curl http://localhost:3000
# Check Nginx config
sudo nginx -t
```

### High CPU usage
```bash
# Check if process is stuck
ps aux | grep node
# Restart service
sudo systemctl restart zimstable
```

### SSL certificate issue
```bash
# Renew certificate
sudo certbot renew

# Check certificate
sudo openssl x509 -in /etc/letsencrypt/live/vm952cali.yourlocaldomain.com/fullchain.pem -text -noout
```

## Maintenance

### Weekly
- [ ] Check disk usage: `df -h`
- [ ] Review error logs: `journalctl -u zimstable -p err`
- [ ] Monitor uptime: `systemctl status zimstable`

### Monthly
- [ ] Security updates: `sudo apt update && sudo apt upgrade`
- [ ] Review performance metrics
- [ ] Check certificate expiration: `sudo certbot certificates`
- [ ] Backup data: `tar -czf /backup/zimstable-backup-$(date +%Y%m%d).tar.gz /opt/zim-stable`

### Quarterly
- [ ] Security audit
- [ ] Dependency updates: `pnpm update`
- [ ] Load testing
- [ ] Disaster recovery test

## Backup & Recovery

### Backup Configuration
```bash
sudo tar -czf /backup/zimstable-env-$(date +%Y%m%d).tar.gz \
  /opt/zim-stable/apps/web/.env.local \
  /opt/zim-stable/apps/web/src
```

### Restore
```bash
sudo tar -xzf /backup/zimstable-env-20231231.tar.gz -C /
sudo systemctl restart zimstable
```

## Scaling

### Increase Node Memory
Edit systemd service:
```bash
sudo nano /etc/systemd/system/zimstable.service
```

Add to [Service] section:
```ini
Environment="NODE_OPTIONS=--max-old-space-size=2048"
```

### Add Process Manager (PM2)
```bash
npm install -g pm2
pm2 start /opt/zim-stable/apps/web/.next/server.js --name zimstable
pm2 startup
pm2 save
```

### Load Balancing (if scaling horizontally)
```nginx
upstream zimstable_backend {
    server localhost:3000;
    server localhost:3001;
    server localhost:3002;
}

server {
    location / {
        proxy_pass http://zimstable_backend;
    }
}
```

## Security Hardening

### SSH Security
```bash
# Edit SSH config
sudo nano /etc/ssh/sshd_config

# Disable password auth
PasswordAuthentication no

# Disable root login
PermitRootLogin no

# Change port (optional)
Port 2222

sudo systemctl restart ssh
```

### Firewall
```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### Fail2Ban
```bash
sudo apt-get install -y fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```
