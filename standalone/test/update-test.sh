#!/bin/sh
# Test dell'aggiornamento: installa la versione 9.0.0, la aggiorna a 9.0.1 (ok) e prova una 9.0.2 difettosa (ritorno alla 9.0.1).
# Non richiede root né systemd: usa le variabili UCM_* per spostare i percorsi e uno "systemctl" finto.
set -eu
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
T="$(mktemp -d)"
PORT=$((20000 + $$ % 20000))
cleanup() { [ -f "$T/server.pid" ] && kill "$(cat "$T/server.pid")" 2>/dev/null || true; rm -rf "$T"; }
trap cleanup EXIT
ok() { echo "  ok: $*"; }
die() { echo "FALLITO: $*" >&2; exit 1; }

build() { # versione -> tarball in $T/pkg-<versione>.tar.gz
  (cd "$ROOT" && UCM_VERSION_OVERRIDE="$1" node standalone/build.js >/dev/null)
  cp "$ROOT/release-standalone/ad-usecase-archive-linux-v$1.tar.gz" "$T/pkg-$1.tar.gz"
}
echo "Compilazione dei pacchetti di prova…"
build 9.0.0; build 9.0.1

# systemctl finto: "restart" riavvia il server come farebbe il servizio
cat > "$T/systemctl" <<STUB
#!/bin/sh
[ "\$1" = restart ] || exit 0
[ -f "$T/server.pid" ] && kill "\$(cat "$T/server.pid")" 2>/dev/null || true
sleep 0.5
while IFS= read -r line; do case "\$line" in \#*|"") ;; *) export "\$line" ;; esac; done < "$T/etc/ucm.env"
nohup "$T/opt/bin/ucm-server" > "$T/server.log" 2>&1 &
echo \$! > "$T/server.pid"
STUB
chmod +x "$T/systemctl"

export UCM_APP_DIR="$T/opt" UCM_INSTALL_DATA_DIR="$T/data" UCM_CONF_DIR="$T/etc" UCM_BIN_DIR="$T/bin" UCM_UNIT_DIR="$T/unit" \
       UCM_SYSTEMCTL="$T/systemctl" UCM_SKIP_SYSTEM=1 UCM_BACKUP_DIR="$T/backups"

# ---- installazione iniziale della 9.0.0 ----
mkdir "$T/x0" && tar xzf "$T/pkg-9.0.0.tar.gz" -C "$T/x0"
mkdir -p "$T/etc"
cp "$T/x0"/*/ucm.env.example "$T/etc/ucm.env"
sed -i "s#^UCM_PORT=.*#UCM_PORT=$PORT#; s#^UCM_HOST=.*#UCM_HOST=127.0.0.1#; s#^UCM_DATA_DIR=.*#UCM_DATA_DIR=$T/data#" "$T/etc/ucm.env"
echo "UCM_ADMIN_PASSWORD=password-admin-1" >> "$T/etc/ucm.env"
(cd "$T"/x0/* && ./install.sh >/dev/null)
sleep 2
version() { node -e "fetch('http://127.0.0.1:$PORT/api/config').then(r=>r.json()).then(j=>console.log(j.app.version))"; }
[ "$(version)" = "9.0.0" ] || die "installazione iniziale: versione $(version)"
ok "installata la 9.0.0"
[ -f "$T/etc/update.conf" ] || die "update.conf non creato"
[ -x "$T/bin/ucm-update" ] || die "comando ucm-update non installato"

# un dato da ritrovare dopo l'aggiornamento
node -e "
(async () => {
  const H = { 'Content-Type': 'application/json', 'X-Requested-With': 'ucm' };
  const l = await fetch('http://127.0.0.1:$PORT/api/login', { method: 'POST', headers: H, body: JSON.stringify({ username: 'admin', password: 'password-admin-1' }) });
  const cookie = l.headers.get('set-cookie').split(';')[0];
  const r = await fetch('http://127.0.0.1:$PORT/api/items', { method: 'POST', headers: Object.assign({ Cookie: cookie }, H), body: JSON.stringify({ cliente: 'Cliente di prova', nomeProgetto: 'Progetto di prova', stato: 'Bozza' }) });
  if (r.status !== 201) process.exit(1);
})()" || die "creazione del caso di prova"
count() { node -e "
(async () => {
  const H = { 'Content-Type': 'application/json', 'X-Requested-With': 'ucm' };
  const l = await fetch('http://127.0.0.1:$PORT/api/login', { method: 'POST', headers: H, body: JSON.stringify({ username: 'admin', password: 'password-admin-1' }) });
  const c = l.headers.get('set-cookie').split(';')[0];
  const items = await (await fetch('http://127.0.0.1:$PORT/api/items', { headers: { Cookie: c } })).json();
  console.log(items.length);
})()"; }
[ "$(count)" = "1" ] || die "caso di prova non salvato"

# ---- repository di aggiornamento con la 9.0.1 ----
git init -q -b main "$T/repo"
mkdir "$T/repo/deploy"
publish() { # tarball -> commit nel repo
  cp "$1" "$T/repo/deploy/ad-usecase-archive-latest.tar.gz"
  (cd "$T/repo/deploy" && sha256sum ad-usecase-archive-latest.tar.gz > ad-usecase-archive-latest.tar.gz.sha256)
  (cd "$T/repo" && git add -A && git -c user.email=t@t -c user.name=t commit -q -m "release")
}
publish "$T/pkg-9.0.1.tar.gz"
printf 'REPO_URL="file://%s/repo"\nBRANCH="main"\n' "$T" > "$T/etc/update.conf"

# ---- controllo senza installare ----
out="$(ucm_out="$("$T/bin/ucm-update" --check)"; echo "$ucm_out")"
echo "$out" | grep -q "v9.0.0" && echo "$out" | grep -q "v9.0.1" && echo "$out" | grep -q "Aggiornamento disponibile" || die "--check: $out"
[ "$(version)" = "9.0.0" ] || die "--check non deve installare"
ok "--check segnala l'aggiornamento senza installarlo"

# ---- aggiornamento riuscito ----
"$T/bin/ucm-update" > "$T/update1.log" 2>&1 || { cat "$T/update1.log"; die "aggiornamento 9.0.0 → 9.0.1"; }
grep -q "v9.0.0 → v9.0.1" "$T/update1.log" || die "messaggio finale mancante"
[ "$(version)" = "9.0.1" ] || die "versione dopo l'aggiornamento: $(version)"
[ "$(count)" = "1" ] || die "i dati non sono stati conservati"
[ -d "$T/opt.prev" ] && die "la cartella .prev doveva essere rimossa"
ls "$T/backups"/*/usecases.db >/dev/null 2>&1 || die "backup non creato"
ok "aggiornata alla 9.0.1: dati conservati, backup creato"

# ---- già aggiornato ----
"$T/bin/ucm-update" | grep -q "già aggiornata" || die "doveva dire già aggiornata"
ok "nessuna azione se già aggiornata"

# ---- pacchetto difettoso: ritorno alla versione precedente ----
mkdir "$T/x2" && tar xzf "$T/pkg-9.0.1.tar.gz" -C "$T/x2"
for d in "$T"/x2/*; do
  sed -i 's/"version": "9.0.1"/"version": "9.0.2"/' "$d/package.json"
  echo "process.exit(1);" > "$d/server/main.js"
  mv "$d" "$T/x2/ad-usecase-archive-linux-v9.0.2"
done
(cd "$T/x2" && tar czf "$T/pkg-9.0.2.tar.gz" ad-usecase-archive-linux-v9.0.2)
publish "$T/pkg-9.0.2.tar.gz"
if "$T/bin/ucm-update" > "$T/update2.log" 2>&1; then cat "$T/update2.log"; die "l'aggiornamento difettoso doveva fallire"; fi
grep -q "ripristino la versione v9.0.1" "$T/update2.log" || { cat "$T/update2.log"; die "messaggio di ripristino mancante"; }
sleep 2
[ "$(version)" = "9.0.1" ] || die "dopo il ripristino la versione doveva essere 9.0.1, è $(version)"
[ "$(count)" = "1" ] || die "dati persi dopo il ripristino"
ok "aggiornamento difettoso annullato: ripristinata la 9.0.1"

# ---- pacchetto danneggiato (sha256 errato) ----
echo "0000  ad-usecase-archive-latest.tar.gz" > "$T/repo/deploy/ad-usecase-archive-latest.tar.gz.sha256"
(cd "$T/repo" && git add -A && git -c user.email=t@t -c user.name=t commit -q -m bad)
"$T/bin/ucm-update" --check > "$T/update3.log" 2>&1 && die "sha256 errato non rilevato"
grep -q "sha256" "$T/update3.log" || die "messaggio sha256 mancante"
ok "pacchetto con checksum errato rifiutato"

# ---- da file locale ----
"$T/bin/ucm-update" --file "$T/pkg-9.0.0.tar.gz" 2>&1 | grep -q "precedente" || die "--file: doveva rifiutare la versione precedente"
"$T/bin/ucm-update" --file "$T/pkg-9.0.0.tar.gz" --force > /dev/null 2>&1 || die "--file --force"
[ "$(version)" = "9.0.0" ] || die "--file --force non ha installato la 9.0.0"
ok "installazione da file locale (con protezione dalle versioni precedenti)"
echo "TUTTI I TEST DI AGGIORNAMENTO SUPERATI"
