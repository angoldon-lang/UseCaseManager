#!/bin/sh
# Rimuove il servizio. I dati restano in /var/lib/ad-usecase-archive salvo l'opzione --purge.
set -eu
[ "$(id -u)" -eq 0 ] || { echo "Eseguire come root." >&2; exit 1; }
systemctl disable --now ad-usecase-archive.service 2>/dev/null || true
rm -f /etc/systemd/system/ad-usecase-archive.service /usr/local/bin/ucm /usr/local/bin/ucm-update
systemctl daemon-reload
rm -rf /opt/ad-usecase-archive /opt/ad-usecase-archive.prev
if [ "${1:-}" = "--purge" ]; then
  rm -rf /var/lib/ad-usecase-archive /etc/ad-usecase-archive /var/backups/ad-usecase-archive
  userdel ucm 2>/dev/null || true
  echo "Servizio, dati e backup rimossi."
else
  echo "Servizio rimosso. Dati in /var/lib/ad-usecase-archive, configurazione in /etc/ad-usecase-archive e backup in /var/backups/ad-usecase-archive (usare --purge per eliminarli)."
fi
