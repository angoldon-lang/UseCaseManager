#!/bin/sh
# Aggiorna Archivio Use Case all'ultima versione disponibile, con backup e ripristino automatico in caso di problemi.
#
#   sudo ucm-update                 scarica e installa l'ultima versione
#   sudo ucm-update --check         mostra versione installata e disponibile, senza installare
#   sudo ucm-update --force         reinstalla anche se la versione è la stessa (o più vecchia)
#   sudo ucm-update --file PACCHETTO.tar.gz   usa un pacchetto già copiato sul server (nessun accesso a GitHub)
#   sudo ucm-update --branch RAMO   legge gli aggiornamenti da un ramo diverso
set -eu

SELF="$(readlink -f "$0")"
APP_DIR="${UCM_APP_DIR:-$(dirname "$(dirname "$SELF")")}"
CONF_DIR="${UCM_CONF_DIR:-/etc/ad-usecase-archive}"
SYSTEMCTL="${UCM_SYSTEMCTL:-systemctl}"
BACKUP_ROOT="${UCM_BACKUP_DIR:-/var/backups/ad-usecase-archive}"
SKIP_SYSTEM="${UCM_SKIP_SYSTEM:-0}"   # solo per i test automatici

CHECK=0; FORCE=0; FILE=""; BRANCH_OVERRIDE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --check) CHECK=1 ;;
    --force) FORCE=1 ;;
    --file) shift; FILE="${1:-}" ;;
    --branch) shift; BRANCH_OVERRIDE="${1:-}" ;;
    -h|--help) sed -n '2,9p' "$SELF" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Opzione sconosciuta: $1 (usa --help)" >&2; exit 2 ;;
  esac
  shift
done

say() { echo "==> $*"; }
fail() { echo "ERRORE: $*" >&2; exit 1; }

if [ "$SKIP_SYSTEM" != 1 ] && [ "$CHECK" = 0 ]; then
  [ "$(id -u)" -eq 0 ] || fail "eseguire come root: sudo ucm-update"
fi
command -v node >/dev/null 2>&1 || fail "Node.js non trovato."

REPO_URL=""; BRANCH="main"; TOKEN="${GITHUB_TOKEN:-}"
# shellcheck disable=SC1091
[ -f "$CONF_DIR/update.conf" ] && . "$CONF_DIR/update.conf"
[ -n "$BRANCH_OVERRIDE" ] && BRANCH="$BRANCH_OVERRIDE"
[ -n "${GITHUB_TOKEN:-}" ] && TOKEN="$GITHUB_TOKEN"

pkg_version() { node -p "require('$1').version"; }
OLD="$(pkg_version "$APP_DIR/package.json")"

TMP="$(mktemp -d)"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

# ---- 1. recupero del pacchetto ------------------------------------------------------------------------
if [ -n "$FILE" ]; then
  [ -f "$FILE" ] || fail "file non trovato: $FILE"
  TARBALL="$FILE"
else
  [ -n "$REPO_URL" ] || fail "origine degli aggiornamenti non configurata ($CONF_DIR/update.conf)."
  command -v git >/dev/null 2>&1 || fail "git non trovato: installarlo (apt install git) oppure usare --file."
  say "Scarico l'ultima versione da $REPO_URL (ramo $BRANCH)…"
  export GIT_TERMINAL_PROMPT=0
  if [ -n "$TOKEN" ]; then
    AUTH="$(printf 'x-access-token:%s' "$TOKEN" | base64 | tr -d '\n')"
    git -c "http.extraHeader=Authorization: Basic $AUTH" clone --quiet --depth 1 --branch "$BRANCH" "$REPO_URL" "$TMP/repo" \
      || fail "download non riuscito (controlla rete, ramo e token)."
  else
    git clone --quiet --depth 1 --branch "$BRANCH" "$REPO_URL" "$TMP/repo" \
      || fail "download non riuscito. Se il repository è privato imposta TOKEN in $CONF_DIR/update.conf oppure esegui: sudo GITHUB_TOKEN=... ucm-update"
  fi
  TARBALL="$TMP/repo/deploy/ad-usecase-archive-latest.tar.gz"
  [ -f "$TARBALL" ] || fail "nel repository non c'è deploy/ad-usecase-archive-latest.tar.gz."
  if [ -f "$TARBALL.sha256" ]; then
    ( cd "$TMP/repo/deploy" && sha256sum -c ad-usecase-archive-latest.tar.gz.sha256 >/dev/null ) \
      || fail "verifica di integrità (sha256) non superata: pacchetto danneggiato."
  fi
fi

mkdir -p "$TMP/new"
tar -xzf "$TARBALL" -C "$TMP/new" || fail "il pacchetto non è un archivio valido."
NEWDIR="$(find "$TMP/new" -maxdepth 1 -mindepth 1 -type d | head -1)"
[ -f "$NEWDIR/install.sh" ] && [ -f "$NEWDIR/package.json" ] || fail "contenuto del pacchetto non riconosciuto."
NEW="$(pkg_version "$NEWDIR/package.json")"

cmp_ver() { node -e "
const a='$1'.split('.').map(Number), b='$2'.split('.').map(Number);
for (let i=0;i<3;i++){ if((a[i]||0)>(b[i]||0)){console.log(1);process.exit()} if((a[i]||0)<(b[i]||0)){console.log(-1);process.exit()} } console.log(0)"; }
REL="$(cmp_ver "$NEW" "$OLD")"

echo "Versione installata:  v$OLD"
echo "Versione disponibile: v$NEW"

if [ "$CHECK" = 1 ]; then
  case "$REL" in
    1) echo "Aggiornamento disponibile. Per installarlo: sudo ucm-update" ;;
    0) echo "L'applicazione è già aggiornata." ;;
    *) echo "La versione disponibile è precedente a quella installata." ;;
  esac
  exit 0
fi
if [ "$FORCE" = 0 ]; then
  [ "$REL" = 0 ] && { echo "L'applicazione è già aggiornata."; exit 0; }
  [ "$REL" = -1 ] && fail "la versione disponibile (v$NEW) è precedente a quella installata (v$OLD). Usa --force per installarla comunque."
fi

# ---- 2. backup dei dati ----------------------------------------------------------------------------------
DATA_DIR="$(sed -n 's/^UCM_DATA_DIR=//p' "$CONF_DIR/ucm.env" 2>/dev/null | tail -1)"
DATA_DIR="${UCM_DATA_DIR:-${DATA_DIR:-/var/lib/ad-usecase-archive}}"
STAMP="$(date +%Y%m%d-%H%M%S)-v$OLD"
if [ -f "$DATA_DIR/usecases.db" ]; then
  say "Backup dei dati in $BACKUP_ROOT/$STAMP"
  if [ "$SKIP_SYSTEM" != 1 ] && id ucm >/dev/null 2>&1; then
    install -d -o ucm -g ucm -m 750 "$BACKUP_ROOT"
    runuser -u ucm -- env UCM_DATA_DIR="$DATA_DIR" "$APP_DIR/bin/ucm" backup "$BACKUP_ROOT/$STAMP" >/dev/null
  else
    mkdir -p "$BACKUP_ROOT"
    UCM_DATA_DIR="$DATA_DIR" "$APP_DIR/bin/ucm" backup "$BACKUP_ROOT/$STAMP" >/dev/null
  fi
  # conserva gli ultimi 10 backup
  # shellcheck disable=SC2012
  ls -1dt "$BACKUP_ROOT"/*/ 2>/dev/null | tail -n +11 | while read -r old; do rm -rf "$old"; done
fi

# ---- 3. installazione con ritorno alla versione precedente in caso di problemi -------------------------------
say "Installo la versione v$NEW…"
rm -rf "$APP_DIR.prev"
cp -a "$APP_DIR" "$APP_DIR.prev"

rollback() {
  echo "ERRORE: l'aggiornamento non è andato a buon fine: ripristino la versione v$OLD." >&2
  rm -rf "$APP_DIR"
  mv "$APP_DIR.prev" "$APP_DIR"
  $SYSTEMCTL restart ad-usecase-archive.service || true
  echo "Versione v$OLD ripristinata. I dati non sono stati modificati (backup in $BACKUP_ROOT/$STAMP)." >&2
  exit 1
}

if ! ( cd "$NEWDIR" && ./install.sh >"$TMP/install.log" 2>&1 ); then
  cat "$TMP/install.log" >&2
  rollback
fi

# ---- 4. verifica che il servizio risponda con la nuova versione -----------------------------------------------
PORT="$(sed -n 's/^UCM_PORT=\([0-9]*\).*/\1/p' "$CONF_DIR/ucm.env" | tail -1)"
PORT="${PORT:-8080}"
OK=0; i=0
while [ "$i" -lt 25 ]; do
  GOT="$(node -e "fetch('http://127.0.0.1:$PORT/api/config').then(r=>r.json()).then(j=>console.log((j.app&&j.app.version)||'')).catch(()=>{})" 2>/dev/null || true)"
  if [ "$GOT" = "$NEW" ]; then OK=1; break; fi
  i=$((i + 1)); sleep 1
done
[ "$OK" = 1 ] || rollback

rm -rf "$APP_DIR.prev"
echo
say "Aggiornamento completato: v$OLD → v$NEW"
echo "    Ricarica la pagina nel browser con Ctrl+F5. Backup dei dati: $BACKUP_ROOT/$STAMP"
