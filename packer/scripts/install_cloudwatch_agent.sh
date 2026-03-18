#!/bin/bash
set -euo pipefail

sudo apt-get update -y
sudo apt-get install -y wget

wget https://amazoncloudwatch-agent.s3.amazonaws.com/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb -O /tmp/amazon-cloudwatch-agent.deb
sudo dpkg -i /tmp/amazon-cloudwatch-agent.deb

sudo systemctl enable amazon-cloudwatch-agent