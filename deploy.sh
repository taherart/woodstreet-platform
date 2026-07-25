#!/bin/bash
# Deploy Woodstreet Platform (preserves data between deploys)
set -e

STANDALONE="/root/woodstreet-platform/.next/standalone"
STATIC="/root/woodstreet-platform/.next/static"
PUBLIC="/root/woodstreet-platform/public"
TARGET="/opt/woodstreet"
DATA="$TARGET/data"
UPLOADS="$TARGET/public/uploads"

systemctl stop woodstreet 2>/dev/null || true

# Backup data if exists
if [ -d "$DATA" ]; then
    cp -r "$DATA" /tmp/woodstreet_data_backup
fi
if [ -d "$UPLOADS" ]; then
    cp -r "$UPLOADS" /tmp/woodstreet_uploads_backup
fi

# Fresh deploy
rm -rf "$TARGET"
cp -r "$STANDALONE" "$TARGET"
cp -r "$STATIC" "$TARGET/.next/static"
cp -r "$PUBLIC" "$TARGET/public"

# Restore data
mkdir -p "$DATA"
if [ -d /tmp/woodstreet_data_backup ]; then
    cp -r /tmp/woodstreet_data_backup/* "$DATA"/
    rm -rf /tmp/woodstreet_data_backup
fi

mkdir -p "$UPLOADS"
if [ -d /tmp/woodstreet_uploads_backup ]; then
    cp -r /tmp/woodstreet_uploads_backup/* "$UPLOADS"/
    rm -rf /tmp/woodstreet_uploads_backup
fi

systemctl start woodstreet
echo "Deployed. Persisted data + uploads."
