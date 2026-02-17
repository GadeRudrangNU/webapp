#!/bin/bash
set -euo pipefail

APP_DIR="/opt/csye6225"
APP_USER="csye6225"
APP_GROUP="csye6225"
SERVICE_NAME="csye6225"   # unit name WITHOUT .service

sudo apt-get update -y
sudo apt-get install -y curl unzip ca-certificates

# Install Node 20 on Ubuntu 24.04
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Create non-login user/group
if ! getent group "${APP_GROUP}" >/dev/null; then
  sudo groupadd "${APP_GROUP}"
fi
if ! id -u "${APP_USER}" >/dev/null 2>&1; then
  sudo useradd -r -g "${APP_GROUP}" -s /usr/sbin/nologin -m "${APP_USER}"
fi

# App directory
sudo mkdir -p "${APP_DIR}"
sudo chown -R "${APP_USER}:${APP_GROUP}" "${APP_DIR}"

# Artifact (uploaded by packer file provisioner)
if [ ! -f /tmp/webapp.zip ]; then
  echo "ERROR: /tmp/webapp.zip not found. Ensure packer uploads it."
  exit 1
fi

sudo unzip -o /tmp/webapp.zip -d "${APP_DIR}"
sudo chown -R "${APP_USER}:${APP_GROUP}" "${APP_DIR}"

# Install dependencies (production only)
cd "${APP_DIR}"
sudo -u "${APP_USER}" npm ci --omit=dev

# Create env file for systemd (Prisma/app needs DATABASE_URL)
sudo mkdir -p /etc/csye6225
sudo bash -c 'cat > /etc/csye6225/webapp.env <<EOF
NODE_ENV=production
PORT=8080
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres?schema=public
EOF'
sudo chmod 640 /etc/csye6225/webapp.env
sudo chown root:root /etc/csye6225/webapp.env

# Install systemd service (uploaded by packer file provisioner)
if [ ! -f "/tmp/${SERVICE_NAME}.service" ]; then
  echo "ERROR: /tmp/${SERVICE_NAME}.service not found. Ensure packer uploads it."
  exit 1
fi

sudo cp "/tmp/${SERVICE_NAME}.service" "/etc/systemd/system/${SERVICE_NAME}.service"
sudo systemctl daemon-reload
sudo systemctl enable "${SERVICE_NAME}"

# Start now (also starts automatically on boot)
sudo systemctl start "${SERVICE_NAME}"
