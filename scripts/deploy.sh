#!/usr/bin/env bash

set -euo pipefail

APP_DIR="${APP_DIR:-/srv/media_project/app}"
APP_OWNER="${APP_OWNER:-mediaapp:mediaapp}"
SERVICE_NAME="${SERVICE_NAME:-media-project}"

echo "==> Deploying application from ${APP_DIR}"

if ! command -v git >/dev/null 2>&1; then
  echo "git is required but not installed." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required but not installed." >&2
  exit 1
fi

if ! command -v systemctl >/dev/null 2>&1; then
  echo "systemctl is required but not installed." >&2
  exit 1
fi

cd "${APP_DIR}"

echo "==> Pulling latest changes"
git pull --ff-only

echo "==> Installing dependencies"
npm ci

echo "==> Building frontend"
npm run build

echo "==> Fixing ownership"
chown -R "${APP_OWNER}" /srv/media_project

echo "==> Restarting service ${SERVICE_NAME}"
systemctl restart "${SERVICE_NAME}"

echo "==> Service status"
systemctl --no-pager --full status "${SERVICE_NAME}"
