# Deploy Jigness (production)

Assumes **nginx** serves static files from `/var/www/jigness` and proxies `/api/` → `http://127.0.0.1:3001/`.

## One-time: API env + systemd

```bash
sudo mkdir -p /etc/jigness /var/lib/jigness
sudo tee /etc/jigness/api.env >/dev/null <<'EOF'
PORT=3001
HOST=127.0.0.1
CORS_ORIGIN=https://YOUR_DOMAIN
DB_PATH=/var/lib/jigness/erp.sqlite
LOG_LEVEL=info
EOF
```

Replace `YOUR_DOMAIN` with your real host (e.g. `https://jigness.rovark.in`).

```bash
sudo tee /etc/systemd/system/jigness-api.service >/dev/null <<'EOF'
[Unit]
Description=Jigness API
After=network.target

[Service]
WorkingDirectory=/PATH/TO/jigness
EnvironmentFile=/etc/jigness/api.env
ExecStart=/usr/bin/env npm run start -w @jigness/api
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
EOF
```

**Important:** set `WorkingDirectory=` to the **actual** clone path (e.g. `/root/jigness`).

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now jigness-api
```

## Every deploy (after pull)

From the repo root:

```bash
git pull
npm install
npm run build:prod
sudo rsync -a --delete apps/web/dist/ /var/www/jigness/
sudo systemctl restart jigness-api
sudo systemctl reload nginx
```

Or use the script:

```bash
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

## Checks

```bash
curl -s http://127.0.0.1:3001/health
curl -s https://YOUR_DOMAIN/api/health
```

If you use another app on port **3000**, Jigness does **not** use 3000 — only **3001** (localhost) + nginx **80/443**.
