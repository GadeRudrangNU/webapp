#!/bin/bash
set -euo pipefail

# ========= CONFIG =========
APP_DIR="/opt/csye6225"
APP_GROUP="csye6225"
APP_USER="csye6225"

DB_NAME="csye6225_db"
DB_USER="csye6225"
DB_PASSWORD="${DB_PASSWORD:-}"     # REQUIRED at runtime

APP_ZIP_PATH="${APP_ZIP_PATH:-}"   # OPTIONAL at runtime (e.g. /tmp/webapp.zip)

SERVICE_NAME="csye6225"
SERVICE_PATH="/etc/systemd/system/${SERVICE_NAME}.service"

APP_ENTRY="${APP_ENTRY:-server.js}"  # change if different
NODE_BIN="/usr/bin/node"
# ==========================

if [[ $EUID -ne 0 ]]; then
  echo "ERROR: Please run as root (use sudo)."
  exit 1
fi

echo "=== 0) Validate required inputs ==="
if [[ -z "${DB_PASSWORD}" ]]; then
  echo "ERROR: DB_PASSWORD is required."
  echo "Run like: sudo DB_PASSWORD='yourpassword' APP_ZIP_PATH='/tmp/webapp.zip' ./setup.sh"
  exit 1
fi

echo "=== 1) Update package lists ==="
apt-get update -y

echo "=== 2) Upgrade system packages ==="
DEBIAN_FRONTEND=noninteractive apt-get upgrade -y

echo "=== 3) Install PostgreSQL and unzip ==="
apt-get install -y postgresql postgresql-contrib unzip

echo "=== Ensure PostgreSQL service is enabled and running ==="
systemctl enable postgresql
systemctl start postgresql

echo "=== 4) Create application database + user (idempotent) ==="

# Create DB if missing
if ! runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
  runuser -u postgres -- psql -c "CREATE DATABASE ${DB_NAME};"
fi

# Create user if missing
if ! runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1; then
  runuser -u postgres -- psql -c "CREATE USER ${DB_USER};"
fi

# Always ensure password is set (since DB_PASSWORD is required)
runuser -u postgres -- psql -c "ALTER USER ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';"

# Grants/ownership (safe to re-run)
runuser -u postgres -- psql -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};"
runuser -u postgres -- psql -c "ALTER DATABASE ${DB_NAME} OWNER TO ${DB_USER};"

echo "=== 5) Create application Linux group (if missing) ==="
if ! getent group "${APP_GROUP}" >/dev/null; then
  groupadd "${APP_GROUP}"
else
  echo "Group already exists: ${APP_GROUP}"
fi

echo "=== 6) Create application user (non-login) and add to group ==="
if ! id -u "${APP_USER}" >/dev/null 2>&1; then
  useradd --system --no-create-home --shell /usr/sbin/nologin --gid "${APP_GROUP}" "${APP_USER}"
else
  usermod -aG "${APP_GROUP}" "${APP_USER}" || true
fi

echo "=== 7) Deploy application files to /opt/csye6225 (optional unzip) ==="
mkdir -p "${APP_DIR}"

if [[ -n "${APP_ZIP_PATH}" ]]; then
  if [[ ! -f "${APP_ZIP_PATH}" ]]; then
    echo "ERROR: APP_ZIP_PATH was set but file not found: ${APP_ZIP_PATH}"
    exit 1
  fi
  rm -rf "${APP_DIR:?}/"*
  unzip -q "${APP_ZIP_PATH}" -d "${APP_DIR}"
  echo "Unzipped app to ${APP_DIR}"
else
  echo "Skipping unzip: set APP_ZIP_PATH=/path/to/zip to deploy automatically."
fi

echo "=== 8) Set file ownership and permissions ==="
chown -R "${APP_USER}:${APP_GROUP}" "${APP_DIR}"
chmod -R 750 "${APP_DIR}"

echo "=== 9) Create systemd service ==="

cat > "${SERVICE_PATH}" <<EOF
[Unit]
Description=CSYE6225 Web Application
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=${APP_USER}
Group=${APP_GROUP}
WorkingDirectory=${APP_DIR}
Environment=NODE_ENV=production
Environment=DB_NAME=${DB_NAME}
Environment=DB_USER=${DB_USER}
Environment=DB_PASSWORD=${DB_PASSWORD}
ExecStart=${NODE_BIN} ${APP_DIR}/${APP_ENTRY}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "${SERVICE_NAME}"

# Start only if app entry exists
if [[ -f "${APP_DIR}/${APP_ENTRY}" ]]; then
  systemctl restart "${SERVICE_NAME}"
else
  echo "WARNING: ${APP_DIR}/${APP_ENTRY} not found. Service enabled but not started."
  echo "After you deploy the app, run: sudo systemctl restart ${SERVICE_NAME}"
fi

echo "=== DONE ✅ Server is provisioned ==="
echo "Verify:"
echo "  systemctl status postgresql"
echo "  systemctl is-enabled postgresql"
echo "  systemctl status ${SERVICE_NAME}"
echo "  systemctl is-enabled ${SERVICE_NAME}"
echo "  runuser -u postgres -- psql -c \"\\l\""
echo "  getent group ${APP_GROUP}"
echo "  id ${APP_USER}"
echo "  ls -la ${APP_DIR}"
