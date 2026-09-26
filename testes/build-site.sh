#!/bin/bash
# Gera uma CÓPIA de teste do site apontando para o emulador do Firebase
# (projeto demo-chamada — nunca a produção). CHAMADA_DIR = pasta com o
# index.html da branch que será testada (padrão: ../../chamada).
set -e
cd "$(dirname "$0")"
CHAMADA_DIR="${CHAMADA_DIR:-../../chamada}"
mkdir -p site out
SRC="$CHAMADA_DIR/index.html" python3 - <<'PY'
import os, re; s=open(os.environ['SRC']).read()
def rep(a,b):
    global s
    assert s.count(a)==1, a
    s=s.replace(a,b)
rep('projectId: "chamada-99924"','projectId: "demo-chamada"')
s=re.sub(r'serverTimestamp, Timestamp(, Bytes)?\n', lambda m: m.group(0)[:-1]+', connectFirestoreEmulator\n', s, count=1)
rep('createUserWithEmailAndPassword\n    } from','createUserWithEmailAndPassword, connectAuthEmulator\n    } from')
rep('    const auth = getAuth(firebaseApp);\n','    const auth = getAuth(firebaseApp);\n    connectFirestoreEmulator(db, "127.0.0.1", 8080);\n    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });\n')
if '      const secondaryAuth = getAuth(secondaryApp);\n' in s:
    s=s.replace('      const secondaryAuth = getAuth(secondaryApp);\n','      const secondaryAuth = getAuth(secondaryApp);\n      connectAuthEmulator(secondaryAuth, "http://127.0.0.1:9099", { disableWarnings: true });\n')
open('site/index.html','w').write(s)
PY
printf '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n' > tw-in.css
npx tailwindcss -i tw-in.css -o site/tw.css --content site/index.html 2>&1 | tail -1
rm -rf site/icons && cp -r "$CHAMADA_DIR/icons" site/icons && cp "$CHAMADA_DIR/manifest.webmanifest" site/
