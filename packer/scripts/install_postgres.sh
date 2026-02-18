#!/bin/bash
set -euo pipefail

sudo apt-get update -y
sudo apt-get install -y postgresql postgresql-contrib

sudo systemctl enable postgresql
sudo systemctl start postgresql

# Detect major version (e.g., 16)
PG_VER="$(psql -V | awk '{print $3}' | cut -d. -f1)"
PG_CONF_DIR="/etc/postgresql/${PG_VER}/main"

# 1) Set postgres password to 'postgres' (matches your DATABASE_URL)
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "ALTER USER postgres WITH PASSWORD 'postgres';"

# 2) Ensure Postgres listens on localhost (TCP)
sudo sed -i "s/^#listen_addresses.*/listen_addresses = 'localhost'/" "${PG_CONF_DIR}/postgresql.conf"

# 3) Allow password auth for local TCP (127.0.0.1)
# Ensure a host line exists for IPv4 localhost
if ! sudo grep -qE "^\s*host\s+all\s+all\s+127\.0\.0\.1/32\s+" "${PG_CONF_DIR}/pg_hba.conf"; then
  echo "host all all 127.0.0.1/32 scram-sha-256" | sudo tee -a "${PG_CONF_DIR}/pg_hba.conf" >/dev/null
fi

# Also for IPv6 localhost (optional but nice)
if ! sudo grep -qE "^\s*host\s+all\s+all\s+::1/128\s+" "${PG_CONF_DIR}/pg_hba.conf"; then
  echo "host all all ::1/128 scram-sha-256" | sudo tee -a "${PG_CONF_DIR}/pg_hba.conf" >/dev/null
fi

sudo systemctl restart postgresql
