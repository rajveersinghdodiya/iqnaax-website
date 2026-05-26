# IQNAAX Deployment Guide

## Overview
This guide covers Hostinger Cloud Startup deployment for the IQNAAX project, including frontend build, backend Node.js deployment, PM2, Nginx reverse proxy, SSL, domain setup, API configuration, build/restart commands, and backup procedure.

---

## 1. Hostinger Cloud Startup Setup

1. Create a Cloud Startup plan and connect via SSH.
2. Access the server terminal and update system packages:

```bash
sudo apt update && sudo apt upgrade -y
```

3. Ensure you have a project folder for IQNAAX, for example:

```bash
cd /var/www
mkdir -p iqnaax
cd iqnaax
```

4. Upload or clone the repository into `/var/www/iqnaax`.

---

## 2. Node.js Installation

Install Node.js 20.x LTS and npm:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

Verify installation:

```bash
node -v
npm -v
```

---

## 3. PM2 Setup

Install PM2 globally:

```bash
sudo npm install -g pm2
```

Start the backend using the project ecosystem config:

```bash
cd /var/www/iqnaax
pm install --prefix backend-node
pm install --prefix front
pm2 start ecosystem.config.js --env production
```

Useful PM2 commands:

```bash
pm2 status
pm2 logs iqnaax-backend
pm2 restart iqnaax-backend
pm2 stop iqnaax-backend
pm2 delete iqnaax-backend
pm2 save
```

---

## 4. Frontend Build and Production Scripts

The frontend is built as static assets and served by Nginx.

Build frontend:

```bash
cd /var/www/iqnaax/front
npm run build:prod
```

The production build outputs to `front/dist`.

If you need a preview server for testing, use:

```bash
npm run preview
```

---

## 5. Backend Production Environment

The backend is located in `backend-node`.

Create or copy the backend environment example:

```bash
cd /var/www/iqnaax/backend-node
cp .env.example .env
```

Update `.env` with production values, for example:

```env
NODE_ENV=production
PORT=5000
DATABASE_PATH=./data/iqnaax.db
JWT_SECRET=your_secure_jwt_secret_here
SMTP_EMAIL=your_smtp_username
SMTP_PASSWORD=your_smtp_password
SMTP_FROM_EMAIL=no-reply@iqnaax.com
```

Notes:
- `DATABASE_PATH` must point to a persistent SQLite file location.
- `JWT_SECRET` must be secure and unique for production.
- SMTP settings are required for contact form email delivery.

---

## 6. Upload Path Verification

Backend upload paths are:

- Product uploads: `backend-node/uploads/products`
- Blog uploads: `backend-node/uploads/blogs`
- General uploads: `backend-node/uploads/general`

The backend serves uploaded files as:

- `/uploads/*` via static middleware
- `/api/uploads/products/:filename` for product images
- `/api/uploads/blogs/:filename` for blog images

Important production mapping:
- product asset full URLs are generated as `https://<host>/api/uploads/products/<filename>`
- blog content and image blocks may use `/uploads/blogs/<filename>` or absolute host URLs

Create these directories and set permissions:

```bash
cd /var/www/iqnaax/backend-node
mkdir -p uploads/products uploads/blogs uploads/general data
chmod -R 755 uploads data
```

---

## 7. Database Configuration for Production

The backend uses SQLite and reads `DATABASE_PATH` from environment variables.

Default fallback behavior is not safe for production, so define `DATABASE_PATH` explicitly.

Suggested location:

```env
DATABASE_PATH=./data/iqnaax.db
```

Make sure the parent folder exists and is writable by the Node process.

---

## 8. Nginx Reverse Proxy Configuration

Install Nginx:

```bash
sudo apt install -y nginx
```

Sample Nginx site configuration for `iqnaax.com` and `api.iqnaax.com`:

```nginx
server {
    listen 80;
    server_name iqnaax.com www.iqnaax.com;

    root /var/www/iqnaax/front/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /uploads/ {
        proxy_pass http://127.0.0.1:5000/uploads/;
        proxy_set_header Host $host;
    }
}

server {
    listen 80;
    server_name api.iqnaax.com;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Reload Nginx after configuration changes:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## 9. SSL Setup

Install Certbot and issue certificates:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d iqnaax.com -d www.iqnaax.com -d api.iqnaax.com
```

Certbot should automatically update Nginx config to use HTTPS.

Renew certificates automatically:

```bash
sudo certbot renew --dry-run
```

---

## 10. Domain Setup

Set DNS records for the Hostinger server IP:

- `A record` for `iqnaax.com` → server IP
- `A record` for `www.iqnaax.com` → server IP
- `A record` for `api.iqnaax.com` → server IP

Allow DNS propagation before issuing SSL.

---

## 11. Build Commands

Frontend:

```bash
cd /var/www/iqnaax/front
npm install
npm run build:prod
```

Backend:

```bash
cd /var/www/iqnaax/backend-node
npm install
npm run start
```

---

## 12. PM2 Restart Commands

Use these commands from the project root:

```bash
cd /var/www/iqnaax
pm2 restart iqnaax-backend
pm2 logs iqnaax-backend
```

To reload config after editing `ecosystem.config.js`:

```bash
pm2 reload ecosystem.config.js --env production
```

---

## 13. Backup Procedure

Because the backend uses SQLite and filesystem uploads, include both the DB file and upload directories in backups.

Recommended backup targets:

- `backend-node/data/iqnaax.db`
- `backend-node/uploads/products`
- `backend-node/uploads/blogs`
- `backend-node/uploads/general`

Example backup script:

```bash
cd /var/www/iqnaax
tar -czvf backup-iqnaax-$(date +"%Y%m%d-%H%M%S").tar.gz backend-node/data/iqnaax.db backend-node/uploads
```

Store backups off-server or on a separate volume.

---

## 14. Final Notes

- Keep frontend and backend deployment separate: frontend as static assets served by Nginx, backend as a Node/PM2 service.
- Ensure `DATABASE_PATH` is set explicitly in production; do not rely on the default fallback path.
- Ensure `api.iqnaax.com` DNS points to the same server and Nginx forwards traffic to backend port 5000.
- Verify uploaded files exist in `backend-node/uploads` and that Nginx proxies `/uploads` and `/api/uploads` as needed.
