#!/bin/sh
# Installa Archivio Use Case (standalone) come servizio systemd. Eseguire da root: sudo ./install.sh
set -eu

APP_DIR=/opt/ad-usecase-archive
DATA_DIR=/var/lib/ad-usecase-archive
CONF_DIR=/etc/ad-usecase-archive
SRC="$(cd "$(dirname "$0")" && pwd)"

[ "$(id -u)" -eq 0 ] || { echo "Eseguire come root (sudo ./install.sh)." >&2; exit 1; }

command -v node >/dev/null 2>&1 || { echo "Node.js non trovato. Installare Node.js 22.13 o superiore (https://nodejs.org)." >&2; exit 1; }
node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22||(a===22&&b>=13)?0:1)' \
  || { echo "Serve Node.js >= 22.13 (trovato $(node -v))." >&2; exit 1; }

id ucm >/dev/null 2>&1 || useradd --system --home-dir "$DATA_DIR" --shell /usr/sbin/nologin ucm

mkdir -p "$APP_DIR" "$DATA_DIR" "$CONF_DIR"
for item in web server bin package.json README.md uninstall.sh nginx.conf.example; do
  rm -rf "$APP_DIR/$item"
  cp -R "$SRC/$item" "$APP_DIR/$item"
done
chmod 755 "$APP_DIR/bin/ucm" "$APP_DIR/bin/ucm-server" "$APP_DIR/uninstall.sh"
chown -R root:root "$APP_DIR"
chown -R ucm:ucm "$DATA_DIR"
chmod 750 "$DATA_DIR"

# La configurazione esistente non viene mai sovrascritta.
if [ ! -f "$CONF_DIR/ucm.env" ]; then
  cp "$SRC/ucm.env.example" "$CONF_DIR/ucm.env"
  chmod 640 "$CONF_DIR/ucm.env"
  chgrp ucm "$CONF_DIR/ucm.env"
fi

cp "$SRC/ucm.service" /etc/systemd/system/ad-usecase-archive.service
ln -sf "$APP_DIR/bin/ucm" /usr/local/bin/ucm
systemctl daemon-reload
systemctl enable --now ad-usecase-archive.service

PORT=$(sed -n 's/^UCM_PORT=\([0-9]*\).*/\1/p' "$CONF_DIR/ucm.env" | tail -1)
echo
echo "Installazione completata."
echo "  Indirizzo:      http://$(hostname -f 2>/dev/null || hostname):${PORT:-8080}"
echo "  Configurazione: $CONF_DIR/ucm.env   (poi: systemctl restart ad-usecase-archive)"
echo "  Dati:           $DATA_DIR"
echo "  Password iniziale dell'utente 'admin' (solo al primo avvio):"
echo "      journalctl -u ad-usecase-archive | grep -A3 'PRIMO AVVIO'"
echo "  Gestione utenti: sudo -u ucm env UCM_DATA_DIR=$DATA_DIR ucm user:list"
