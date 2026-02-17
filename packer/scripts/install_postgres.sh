#!/bin/bash
set -euo pipefail

sudo apt-get update -y
sudo apt-get install -y postgresql postgresql-contrib

sudo systemctl enable postgresql
sudo systemctl start postgresql
