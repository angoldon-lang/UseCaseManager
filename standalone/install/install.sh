#!/bin/sh
# Installa o aggiorna Archivio Use Case come servizio systemd. Eseguire da root: sudo ./install.sh
# (Per aggiornare un'installazione esistente è più comodo: sudo ucm-update)
set -eu

APP_DIR="${UCM_APP_DIR:-/opt/ad-usecase-archive}"
DATA_DIR="${UCM_INSTALL_DATA_DIR:-/var/lib/ad-usecase-archive}"
CONF_DIR="${UCM_CONF_DIR:-/etc/ad-usecase-archive}"
BIN_DIR="${UCM_BIN_DIR:-/usr/local/bin}"
UNIT_DIR="${UCM_UNIT_DIR:-/etc/systemd/system}"
SYSTEMCTL="${UCM_SYSTEMCTL:-systemctl}"
SKIP_SYSTEM="${UCM_SKIP_SYSTEM:-0}"   # solo per i test automatici
SRC="$(cd "$(dirname "$0")" && pwd)"

if [ "$SKIP_SYSTEM" != 1 ]; then
  [ "$(id -u)" -eq 0 ] || { echo "Eseguire come root (sudo ./install.sh)." >&2; exit 1; }
fi

command -v node >/dev/null 2>&1 || { echo "Node.js non trovato. Installare Node.js 22.13 o superiore (https://nodejs.org)." >&2; exit 1; }
node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22||(a===22&&b>=13)?0:1)' \
  || { echo "Serve Node.js >= 22.13 (trovato $(node -v))." >&2; exit 1; }

if [ "$SKIP_SYSTEM" != 1 ]; then
  id ucm >/dev/null 2>&1 || useradd --system --home-dir "$DATA_DIR" --shell /usr/sbin/nologin ucm
fi

mkdir -p "$APP_DIR" "$DATA_DIR" "$CONF_DIR" "$BIN_DIR" "$UNIT_DIR"
for item in web server bin package.json README.md CHANGELOG.md uninstall.sh nginx.conf.example; do
  rm -rf "${APP_DIR:?}/$item"
  cp -R "$SRC/$item" "$APP_DIR/$item"
done
cp "$SRC/ucm-update.sh" "$APP_DIR/bin/ucm-update"
chmod 755 "$APP_DIR/bin/ucm" "$APP_DIR/bin/ucm-server" "$APP_DIR/bin/ucm-update" "$APP_DIR/uninstall.sh"
if [ "$SKIP_SYSTEM" != 1 ]; then
  chown -R root:root "$APP_DIR"
  chown -R ucm:ucm "$DATA_DIR"
  chmod 750 "$DATA_DIR"
fi

# La configurazione esistente non viene mai sovrascritta.
if [ ! -f "$CONF_DIR/ucm.env" ]; then
  cp "$SRC/ucm.env.example" "$CONF_DIR/ucm.env"
  chmod 640 "$CONF_DIR/ucm.env"
  [ "$SKIP_SYSTEM" = 1 ] || chgrp ucm "$CONF_DIR/ucm.env"
fi
if [ ! -f "$CONF_DIR/update.conf" ]; then
  cp "$SRC/update.conf.example" "$CONF_DIR/update.conf"
  chmod 640 "$CONF_DIR/update.conf"
fi

cp "$SRC/ucm.service" "$UNIT_DIR/ad-usecase-archive.service"
ln -sf "$APP_DIR/bin/ucm" "$BIN_DIR/ucm"
ln -sf "$APP_DIR/bin/ucm-update" "$BIN_DIR/ucm-update"
$SYSTEMCTL daemon-reload
$SYSTEMCTL enable ad-usecase-archive.service
$SYSTEMCTL restart ad-usecase-archive.service

VERSION=$(node -p "require('$APP_DIR/package.json').version")
PORT=$(sed -n 's/^UCM_PORT=\([0-9]*\).*/\1/p' "$CONF_DIR/ucm.env" | tail -1)
echo
echo "Installazione completata: Archivio Use Case v$VERSION"
echo "  Indirizzo:      http://$(hostname -f 2>/dev/null || hostname):${PORT:-8080}"
echo "  Configurazione: $CONF_DIR/ucm.env   (poi: systemctl restart ad-usecase-archive)"
echo "  Dati:           $DATA_DIR"
echo "  Aggiornamenti:  sudo ucm-update        (controllo senza installare: sudo ucm-update --check)"
echo "  Password iniziale dell'utente 'admin' (solo al primo avvio):"
echo "      journalctl -u ad-usecase-archive | grep -A3 'PRIMO AVVIO'"
echo "  Gestione utenti: dalla pagina web (pulsante Utenti) oppure: sudo -u ucm env UCM_DATA_DIR=$DATA_DIR ucm user:list"
