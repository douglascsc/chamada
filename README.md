# Testes do Registro de Chamada

Esta branch guarda **só os testes automáticos** do site. Ela fica separada da
`main` de propósito: o GitHub Pages publica a `main`, e os testes não precisam
estar no site.

Os testes abrem uma **cópia** do site num navegador (Chromium) e usam o
**emulador do Firebase** (projeto `demo-chamada`). Nunca tocam no banco de
dados de verdade.

## Como rodar

Pré-requisitos: Node.js 18+, Java 11+ (para o emulador), Python 3 com Pillow
e um Chromium.

```bash
# 1. As duas branches lado a lado
git clone <repo> chamada                 # branch main (o site)
git clone -b testes <repo> chamada-testes

# 2. Dependências dos testes
cd chamada-testes/testes
npm install

# 3. Rodar tudo (liga o emulador sozinho, gera as imagens de teste
#    e monta a cópia do site a partir de ../../chamada)
CHAMADA_DIR=../../chamada CHROMIUM=/caminho/do/chromium ./rodar-todos.sh
```

Para testar outra branch do site, aponte `CHAMADA_DIR` para a pasta dela.
O script termina com código 0 só se todos os testes passarem.

## O que cada arquivo testa

| Arquivo | O que cobre |
| --- | --- |
| `rules.test.mjs` | Regras do Firestore (quem pode ler/gravar cada coisa) |
| `e2e.test.mjs` | Fluxo completo: aluno, professor, fotos de atraso (compressão, zip, filtros) |
| `admin.test.mjs` | Painel admin da conta master (professores, transferir, remover) |
| `topo.test.mjs` | Cabeçalho da tela da turma |
| `ux.test.mjs` | Login, "Manter conectado", atalho `#professor`, modo professor |
| `novidades.test.mjs` | Tela Chamada do professor, histórico, exportar |
| `lote2` … `lote7` | Lotes de melhorias (link/QR, arquivar, prévia de importação, sem internet, cor da turma…) |
| `lote8` | Melhorias da auditoria (6 turmas, 32 alunos): aluno vê só quem falta, cartão enxuto, Gerenciar reorganizado, Tirar foto; mede alturas e rolagem |

## Manter em dia

- `firestore.rules` aqui deve ser **igual** ao bloco de regras do README da
  `main`. Ao mudar as regras, copie para cá também.
- `build-site.sh` troca o projeto do Firebase pelo emulador; se a forma de
  iniciar o Firebase mudar no `index.html`, ajuste este script.
