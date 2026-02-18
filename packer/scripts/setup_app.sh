#!/bin/bash
set -euo pipefail

APP_DIR="/opt/csye6225"
APP_USER="csye6225"
APP_GROUP="csye6225"
SERVICE_NAME="csye6225"   # unit name WITHOUT .service

echo "$(date -u) - Updating apt and installing prereqs..."
sudo apt-get update -y
sudo apt-get install -y curl unzip ca-certificates gnupg

echo "$(date -u) - Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

echo "$(date -u) - Creating non-login user/group..."
if ! getent group "${APP_GROUP}" >/dev/null; then
  sudo groupadd "${APP_GROUP}"
fi
if ! id -u "${APP_USER}" >/dev/null 2>&1; then
  sudo useradd -r -g "${APP_GROUP}" -s /usr/sbin/nologin -m "${APP_USER}"
fi

echo "$(date -u) - Creating app directory..."
sudo mkdir -p "${APP_DIR}"
sudo chown -R "${APP_USER}:${APP_GROUP}" "${APP_DIR}"

echo "$(date -u) - Verifying artifact exists..."
if [ ! -f /tmp/webapp.zip ]; then
  echo "ERROR: /tmp/webapp.zip not found. Ensure packer uploads it."
  exit 1
fi

echo "$(date -u) - Unzipping artifact..."
sudo unzip -o /tmp/webapp.zip -d "${APP_DIR}"
sudo chown -R "${APP_USER}:${APP_GROUP}" "${APP_DIR}"

echo "$(date -u) - Writing env file..."
sudo mkdir -p /etc/csye6225
sudo bash -c 'cat > /etc/csye6225/webapp.env <<EOF
NODE_ENV=production
PORT=8080
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres?schema=public
EOF'

# root owns it, but group is csye6225 so the service user can read it
sudo chown root:${APP_GROUP} /etc/csye6225/webapp.env
sudo chmod 640 /etc/csye6225/webapp.env

echo "$(date -u) - Installing Node dependencies (includes dev deps so Prisma CLI is available)..."
cd "${APP_DIR}"
# Need prisma CLI to run migrations during image build
sudo -u "${APP_USER}" npm ci

echo "$(date -u) - Running Prisma generate + migrate deploy..."
sudo -u "${APP_USER}" bash -c "
  set -euo pipefail
  cd '${APP_DIR}'

  set -a
  source /etc/csye6225/webapp.env
  set +a

  npx prisma generate
  npx prisma migrate deploy
"

echo "$(date -u) - Pruning dev dependencies for production..."
sudo -u "${APP_USER}" npm prune --omit=dev

echo "$(date -u) - Installing systemd service..."
if [ ! -f "/tmp/${SERVICE_NAME}.service" ]; then
  echo "ERROR: /tmp/${SERVICE_NAME}.service not found. Ensure packer uploads it."
  exit 1
fi

sudo cp "/tmp/${SERVICE_NAME}.service" "/etc/systemd/system/${SERVICE_NAME}.service"
sudo systemctl daemon-reload
sudo systemctl enable "${SERVICE_NAME}"

echo "$(date -u) - Starting service..."
sudo systemctl start "${SERVICE_NAME}"

echo "$(date -u) - setup_app.sh completed successfully."
