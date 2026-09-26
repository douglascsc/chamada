#!/bin/bash
# Roda todos os testes contra o emulador do Firebase (liga o emulador se
# ele não estiver rodando).
# Limpa o banco e as contas do emulador antes de cada arquivo.
cd "$(dirname "$0")"
./build-site.sh >/dev/null
[ -d img ] || python3 gerar-imagens.py
if ! curl -s -m2 http://127.0.0.1:9099/ >/dev/null; then
  echo "Ligando o emulador do Firebase..."
  nohup npx firebase emulators:start --project demo-chamada > out/emulador.log 2>&1 &
  for i in $(seq 1 60); do curl -s -m2 http://127.0.0.1:9099/ >/dev/null && curl -s -m2 http://127.0.0.1:8080/ >/dev/null && break; sleep 2; done
fi
falhou=0
for t in rules e2e admin topo ux novidades lote2 lote3 lote4 lote5 lote6 lote7 lote8 lote9 lote10 lote11 lote12 lote13 lote14 lote15 lote16 lote17 lote18 lote19 lote20; do
  curl -s -X DELETE "http://127.0.0.1:8080/emulator/v1/projects/demo-chamada/databases/(default)/documents" >/dev/null
  curl -s -X DELETE "http://127.0.0.1:9099/emulator/v1/projects/demo-chamada/accounts" >/dev/null
  printf "%-10s " "$t"
  saida=$(S=. OUT=out timeout 900 node "$t.test.mjs" 2>&1)
  echo "$saida" | grep -E "passaram|❌|Error:" | tr '\n' ' '; echo
  echo "$saida" | grep -q " 0 falharam" || falhou=1
done
exit $falhou
