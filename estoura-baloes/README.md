# RoboSapiens 2026 — Robô Estoura Balão

Aplicação web estática para operar a modalidade Robô Estoura Balão (Ensino Fundamental).
Abra `index.html` no navegador (Chrome/Edge recomendados). Os dados ficam salvos no `localStorage` do navegador.

## Arquivos
- `index.html`, `style.css`, `script.js`
- `assets/robosapiens.png`, `assets/ifsul.svg`

## Telas
| Tela | Função |
|---|---|
| **Início** | Situação atual, próximos da Arena Livre e dos Confrontos, atalhos. |
| **Equipes** | Incluir, editar e excluir equipes (nome, escola, robô, professor, integrantes); sorteio da numeração. |
| **Cores** | Cores dos balões numeradas de 1 a 8: incluir, editar, excluir, restaurar o padrão. |
| **Arena Livre** | Tudo da Arena Livre numa tela só: fila por rodada, chamada da equipe (a cor é sorteada), cronômetro, pontuação, desfazer, classificação. |
| **Confrontos** | Tudo do Confronto Direto numa tela só: geração da fase preliminar, confronto ao vivo, classificação, semifinais, final e campeão. |
| **Telão** | Tela para o público. Abra em outra janela (📺) e arraste para o projetor: ela acompanha tudo ao vivo. |
| **Config.** | Rodadas e tempo da Arena Livre, critérios de desempate, backup (JSON) e reinício. |

## Arena Livre
- Uma equipe por vez, até 4 rodadas (configurável de 1 a 4), 30 s por tentativa.
- +50 por balão de outra cor · −50 por balão da própria cor · −30 por sair da arena.
- Toda tentativa começa em **0**. A pontuação é calculada somente a partir das marcações da tentativa.
- **↶ Desfazer última** e **✕** em cada marcação corrigem erros. Uma tentativa registrada pode ser **anulada** no histórico.
- Classificação por soma das rodadas (ou melhor rodada, em Configurações). Ela é separada da classificação dos Confrontos.

## Confronto Direto
- **Fase preliminar:** N equipes → N confrontos (7 equipes → 7 confrontos). Cada equipe joga exatamente 2 vezes, sem repetir confrontos e sem jogar duas vezes seguidas.
- Confronto: Round 1 (2 min) → intervalo (2 min, automático) → Round 2 (1 min) → conferência do resultado.
- +100 por balão adversário · +30 quando o adversário sai da arena.
- **↶ Desfazer última** de cada equipe e **✕** em cada marcação para corrigir erros. **✏️ Corrigir** reabre um confronto encerrado.
- Classificação: vitória 3, empate 1, derrota 0.
- **Semifinais** geradas automaticamente: 1º × 4º e 2º × 3º. **Final:** vencedores das semifinais.
- Empate em semifinal ou final: o operador seleciona o vencedor definido pela Comissão Organizadora.

## Desempate (fase preliminar)
Configurável em **Configurações** (ordem e ativação): confronto direto, saldo de pontos, pontos marcados, vitórias, resultado da Arena Livre, numeração do sorteio.
Se o empate persistir entre os 4 primeiros, a classificação mostra ▲▼ para a Comissão definir a ordem antes de gerar as semifinais.
**Confira e ajuste os critérios conforme o regulamento oficial.**

## Pontuação oculta
Classificações e resultados começam **ocultos**. O botão 👁️ **Pontuação** revela ou oculta. No telão, a revelação é controlada separadamente, na tela Telão.

## Correção do "−140"
A versão anterior acumulava pontos em campos gravados no navegador (`freePoints`/`_freeTemp`). Com isso, restos de testes apareciam como pontuação inicial.
Agora nenhuma pontuação é armazenada como acumulador: tudo é recalculado a partir das marcações. Na primeira abertura, só o cadastro das equipes da versão anterior é aproveitado.

Base: Regulamento Geral RoboSapiens 2026, seção 5.
