# Registro de Chamada

Sistema de registro de presença por turma: cada turma tem sua própria lista de alunos e seu próprio código do dia. Os alunos marcam a própria presença informando o código que o professor definiu para aquela turma; o professor tem uma área própria para criar turmas, cadastrar alunos, gerar o código do dia e consultar o histórico de chamadas.

O sistema roda como uma aplicação web estática — um único arquivo `index.html` — usando **Firebase** (Cloud Firestore + Authentication) como banco de dados e provedor de login, hospedado gratuitamente no **GitHub Pages**. A razão dessa escolha de arquitetura e suas implicações estão em **[Arquitetura e decisões técnicas](#arquitetura-e-decisões-técnicas)**.

⚠️ **Este sistema é um apoio ao professor — não substitui os sistemas institucionais.** A chamada oficial continua sendo registrada normalmente no SUAP (ou sistema equivalente da instituição). Antes de usar com dados reais de alunos, leia **[Privacidade e LGPD](#privacidade-e-lgpd)** e **[Limitações conhecidas](#limitações-conhecidas)**.

## Sumário

1. [Funcionalidades](#funcionalidades)
2. [Arquitetura e decisões técnicas](#arquitetura-e-decisões-técnicas)
3. [Segurança e controle de acesso](#segurança-e-controle-de-acesso)
4. [Privacidade e LGPD](#privacidade-e-lgpd)
5. [Riscos aceitos](#riscos-aceitos)
6. [Limitações conhecidas](#limitações-conhecidas)
7. [Instalação e configuração](#instalação-e-configuração)
8. [Modelo de dados](#modelo-de-dados)
9. [Testes recomendados](#testes-recomendados)
10. [Problemas comuns](#problemas-comuns)
11. [Créditos](#créditos)

## Funcionalidades

- **Tela inicial**: lista as turmas cadastradas (de todos os professores juntas) e o nome do professor dono de cada uma. O aluno escolhe a turma direto, ou filtra por professor primeiro se houver turmas de mais de um. No primeiro acesso à Área do professor, definir o próprio nome de exibição é obrigatório antes de liberar o restante da interface.
- **Tela de chamada**: a lista de alunos e as presenças ficam bloqueadas até o aluno informar o código do dia daquela turma. Esse bloqueio é reforçado pelas regras do Firestore, não é só uma restrição de interface — os detalhes exatos de o que isso garante (e o que não garante) estão em **[Código do dia](#código-do-dia)**. Depois de validar, a tela desce sozinha até a lista, que mostra **só quem ainda não marcou** (em ordem alfabética); quem já marcou fica recolhido em "Já marcaram (N)" e aparece na busca. Nomes longos aparecem sempre inteiros (quebram linha), para não confundir alunos com nomes parecidos.
- **Área do professor** (login real — ver **[Autenticação e sessão](#autenticação-e-sessão)**): cada professor só vê e gerencia as turmas que ele mesmo criou; permite:
  - criar turmas (campos **Turma / Ano / Disciplina**, combinados automaticamente no nome, ex.: "INF2M 2026 - Banco de Dados") com lista opcional de alunos colada de uma vez, e um botão de dica explicando como exportar a relação de alunos pelo SUAP (o passo de usar uma IA externa para formatar essa lista só é exibido para a conta master, por cautela quanto a enviar dados de alunos a serviços de terceiros);
  - gerenciar uma turma — a tela segue a frequência de uso: **Histórico** primeiro; **Alunos** (adicionar/importar/editar/remover) recolhido no celular e ao lado do histórico no computador; **Configurações da turma** recolhidas (código manual com duração de 15 min, 30 min, 1h, 2h ou 3h, link/QR/cartaz, cor, arquivar, transferir e excluir a turma — este com confirmação e senha, apagando alunos e histórico junto);
  - trocar a própria senha a qualquer momento;
  - **📷 Atrasos**: guardar fotos de comprovantes/autorizações de atraso de cada turma — sem formulário, só a foto — ("Tirar foto" abre a câmera direto no celular; "Da galeria" para fotos já tiradas) e consultá-las depois, por turma ou todas juntas ("Ver todos os atrasos", com filtro por turma), filtrando por dia e baixando todas de uma vez em `.zip`. Cada foto é apagada automaticamente após 180 dias — ver **[Fotos de atrasos](#fotos-de-atrasos)**;
  - consultar o **histórico de chamadas** da turma — presentes e ausentes por dia, com exportação em `.xlsx`. Essa tela só é exibida, na interface, ao professor dono da turma ou à conta master; o que as regras do Firestore efetivamente permitem ler sobre esses mesmos dados está descrito em **[Isolamento entre professores](#isolamento-entre-professores)**;
  - **(só a conta master)** criar login de outros professores direto pelo site, sem precisar do Firebase Console — ver **[Adicionar mais professores](#adicionar-mais-professores-no-mesmo-sitebanco-de-dados)**;
  - **QR Code da janela do código** (`<site>#turma=<id>&c=<código>`): o aluno que escaneia já entra com o código validado (enquanto ele valer); o código sai do endereço logo em seguida. "Copiar link" e "Compartilhar" continuam sem o código;
  - **na janela do código**, um contador ao vivo "18 de 30 já marcaram" (sem nomes, pode ser projetado);
  - **código perto de vencer** (5 min ou menos): ⚠ em amarelo no cartão, na barra da Chamada e na janela do código, e um aviso na Chamada se ainda faltar gente;
  - **quem marcou** (só o professor vê): ícone 📱 (celular/tablet do aluno), 💻 (computador do aluno) ou 👤 (professor) ao lado do horário, na Chamada e no histórico — ajuda a escolher quais marcações conferir na sala. O tipo de aparelho (campo `aparelho` da presença) é informado pelo próprio navegador: serve de orientação, não de prova; presenças antigas, sem o campo, aparecem como celular;
  - **limite de tentativas**: depois de 5 códigos errados, o aparelho do aluno espera 1 minuto;
  - **link e QR Code de cada turma** (`<site>#turma=<id>`): abre direto a turma para o aluno — o código do dia continua sendo pedido. Aparece na janela do código grande (com o QR) e no Gerenciar ("Copiar link", "Mostrar QR Code");
  - **tempo restante do código** sempre à vista ("expira em 12 min (15:33)") no cartão da turma, na janela do código e na tela Chamada;
  - **marcar com 1 toque** na tela Chamada / Modo professor (o "Sim, sou eu" é só para o aluno);
  - **corrigir o histórico**: num dia anterior, "Marcar presente" (lançada como "manual") ou "Desfazer" (com senha);
  - **importar alunos com prévia** (no Gerenciar): antes de gravar, mostra "3 novos · 2 já cadastrados (…) · 1 repetido na lista · 1 linha vazia" e só adiciona os novos, com os espaços arrumados; na Nova turma, a lista colada também entra sem repetidos nem linhas vazias, com a contagem ao vivo embaixo do campo;
  - **copiar alunos de outra turma** ao criar uma turma nova (Nova turma → "Copiar alunos de outra turma"): a lista entra no campo de alunos, sem repetir nomes, para conferir antes de criar;
  - **lista para assinatura** (no Gerenciar, "Imprimir lista para assinatura"): folha A4 com os nomes em ordem alfabética, numerados, e uma coluna para assinar — plano B se a internet da sala cair;
  - **ausentes primeiro** na tela Chamada / Modo professor: quem ainda não marcou fica no topo da lista;
  - **cartaz com o QR da turma** (no Gerenciar, "Imprimir cartaz"): folha A4 com o nome da turma, o QR grande, as instruções para o aluno e o link — para colar na sala ou no mural;
  - **atrasos no histórico**: ao escolher um dia do histórico, aparece "N fotos de atraso neste dia" com "Ver fotos", que abre os atrasos da turma já filtrados naquele dia;
  - **presença com atraso**: quem marcar **mais de 20 minutos depois da primeira marcação da turma no dia** (de aluno ou do professor) aparece como "Presente · 08:27 · atrasado" na Chamada do professor, no Histórico ("20 presentes, 3 atrasados") e no Excel (Status "Atrasado"; no Excel dos 7 dias, "08:27 (atrasado)" e a coluna "Atrasos"). É calculado na hora, a partir dos horários — nada é gravado a mais — e o aluno não vê. Correções feitas no Histórico ("manual") não contam como atraso;
  - **Marcar todos presentes** (tela Chamada): marca de uma vez quem ainda falta — pede um segundo toque para confirmar e oferece "Desfazer" por 8 segundos (só desfaz os que ele marcou);
  - **Ir para outra turma** direto da tela Chamada (seletor "Ir para"), sem voltar ao painel;
  - **marcações ainda não enviadas**: sem internet, a faixa laranja mostra quantas marcações esperam envio; sem "Manter conectado", o navegador pergunta antes de fechar a página enquanto houver alguma pendente;
  - **Chamada enxuta no celular** (só para o professor): sem o título grande, com a barra do código no topo e "Encerrar código" / "Copiar ocorrências" lado a lado — no computador, nada muda;
  - **o código encerra sozinho quando todos marcarem** (sempre; não é mais uma opção): funciona enquanto a Chamada ou a janela do código estiver aberta;
  - **tocar num código já gerado** (no cartão da turma ou na barra da Chamada) reabre a janela do código grande, com o QR (já com o código), a validade e o contador;
  - **Modo professor sem internet**: a presença aparece na hora, marcada "aguardando internet", e é enviada quando a conexão voltar. Com "Manter conectado" (celular pessoal), o banco guarda uma cópia no aparelho, então as marcações sobrevivem mesmo se o navegador fechar; "Sair" apaga essa cópia. Sem "Manter conectado" (aparelho compartilhado), nada fica gravado no aparelho e a página precisa ficar aberta até a internet voltar;
  - **compartilhar o link da turma** (Gerenciar e janela do código): abre o menu de compartilhar do celular (WhatsApp, e-mail…), onde o navegador oferece;
  - **cor da turma** (no Gerenciar): faixa colorida no cartão da turma, para o professor e para os alunos (campo `cor`, validado pelas regras);
  - **arquivar turma** (no Gerenciar): esconde a turma da lista do professor e da tela dos alunos **sem apagar nada**; fica em "Turmas arquivadas", no fim da lista, com "Reativar";
  - **encerrar o código antes do prazo** (botão "Encerrar" no cartão da turma e na tela Chamada): ninguém mais consegue marcar presença com ele;
  - **copiar ocorrências** (na tela Chamada e no histórico) para colar no SUAP: uma linha por aluno com ocorrência, em ordem alfabética: "Arthur - Ausente", "Bernardo - Atrasado 09:30", "Carlos - Saída antecipada 10:15" (quem chegou atrasado e saiu antes aparece com as duas);
  - **saída antecipada** (só o professor): na Chamada, cada aluno presente tem o botão **"Saiu antes"**, que grava o horário da saída (campo `saidaEm` da presença, hora do momento do toque). Aparece como "Presente · 08:00 · saiu às 10:15" em laranja, igual ao atraso, no resumo ("1 saída antecipada"), no Histórico, no Excel do dia (coluna "Saída antecipada") e no Excel dos 7 dias ("08:00 (saiu às 10:15)" e a coluna "Saídas antecipadas"). O mesmo botão vira **"Desfazer saída"**. O aluno não vê. As regras só deixam o professor dono da turma (ou a master) mudar esse único campo da presença, e com horário que não esteja no futuro (tolerância de 5 minutos);
  - e **exportar os 7 dias** do histórico num único Excel (uma coluna por dia, com total de presenças e faltas);
  - **(só a conta master)** administrar professores em ⚙️ Opções → **Painel admin — professores**: ver a lista, **enviar e-mail de redefinição de senha**, **remover** um professor (transferindo as turmas dele para outro professor ou excluindo-as) e, no **Gerenciar** de qualquer turma, **transferir a turma** para outro professor — ver **[Administrar professores](#administrar-professores-conta-master)**.
- **Painel do professor pensado para o celular**: as turmas aparecem logo no topo (cerca de 4 na primeira tela, com 6 turmas). Cada cartão tem as ações do dia a dia numa linha — **Gerar código 30 min · Chamada · 📷 Atrasos** — e o **⋯** com "Gerar código 1h" e "Gerenciar" (no computador, todas ficam visíveis; outras durações — 15 min, 2h, 3h — ficam no Gerenciar). O código ativo aparece como "Código 4821 · até 15:30", com "Encerrar" ao lado. O que é usado raramente fica em **⚙️ Opções** (botão ao lado de "Sair"): conta conectada, aviso "não substitui o SUAP", Avisos importantes, Atalho no celular, Nova turma, Minha conta e Painel admin. Todas as telas voltam com "Voltar às turmas", e o botão Voltar do celular também volta para as turmas. Ao gerar ou salvar um código do dia, ele aparece **em tamanho grande** com a validade, para mostrar aos alunos ou projetar.
- **Atalho direto para a Área do professor**: o endereço do site com `#professor` no fim (ex.: `https://<usuário>.github.io/chamada/#professor`) abre direto nas turmas (ou no login, se ninguém estiver conectado). Dá para salvar como ícone na tela inicial do celular — o passo a passo está em ⚙️ Opções → 📱 Atalho no celular. Com "Manter conectado neste aparelho", o atalho abre direto nas turmas, sem senha.
- **Relatar problema** (rodapé): abre um e-mail para o suporte já com versão, tela/turma, internet, tamanho da tela e navegador.
- **Vibração**: o celular do aluno vibra ao confirmar a presença (onde o navegador permite; o iPhone não vibra).
- **Tela "Pronto ✓" para o aluno**: depois de marcar, uma confirmação grande (nome, horário, turma) substitui a lista — serve também para o professor conferir. Voltando no mesmo aparelho no mesmo dia, ela aparece de novo.
- **Ícone de aplicativo**: `manifest.webmanifest` e a pasta `icons/` fazem o "Adicionar à tela inicial" usar o símbolo do IFSul, o nome "Chamada" e abrir em tela cheia. O manifesto não define `start_url`, então o ícone abre a página em que foi criado (ex.: `#professor`).
- **Modo professor**: com login do dono da turma (ou da conta master) ativo, permite marcar a presença de qualquer aluno diretamente, sem o código do dia — útil para chamada oral ou aluno sem celular. Nesse modo também não vale a trava de "um aparelho por aluno". Desfazer uma presença exige a senha do professor de novo (só a senha, numa janela pequena), mesmo com o Modo professor ativo, para que outra pessoa no mesmo computador não consiga desfazer sem a senha. A exceção é o **"Desfazer" do aviso** que aparece logo depois de marcar: por 8 segundos, e só na tela da chamada, ele apaga aquela marcação sem pedir senha (é para corrigir um toque errado do próprio professor).
- **Exportar Excel**: baixa a lista de presença do dia (ou de um dia do histórico) daquela turma — nome, presente/ausente e horário — como arquivo `.xlsx`. Só aparece para o professor logado.

Um mesmo dispositivo só marca a presença de um aluno por dia, por turma — o que essa trava garante de fato e como ela pode ser contornada está descrito em **[Identificador do aparelho](#identificador-do-aparelho)**.

## Arquitetura e decisões técnicas

Esta é, deliberadamente, uma arquitetura simples:

- aplicação web estática, um único arquivo (`index.html`);
- hospedagem no GitHub Pages;
- **Firebase Authentication** para login;
- **Cloud Firestore** para persistência dos dados;
- as **regras do Firestore** são a única camada de autorização — não existe backend, servidor de aplicação ou Cloud Functions nesta implementação.

Essa escolha prioriza simplicidade de implantação e manutenção para um projeto de iniciativa docente individual: qualquer professor com uma conta Google e uma conta GitHub consegue publicar sua própria cópia, sem manter servidor, sem custos de infraestrutura além dos limites gratuitos do Firebase, e sem depender de conhecimento de backend.

Essa simplicidade tem um custo, em comparação com uma arquitetura institucional com backend próprio:

- toda a autorização depende inteiramente da lógica escrita nas regras do Firestore — não há uma camada de validação de negócio adicional rodando em servidor;
- tarefas que normalmente ficariam a cargo de um backend administrativo — como remover a conta de um professor, ou apagar dados vencidos de forma contínua em segundo plano — dependem de recursos client-side ou de configuração manual no Firebase Console (ver **[Limitações conhecidas](#limitações-conhecidas)**);
- a conta com privilégios administrativos amplos (a "conta master") é identificada nas regras pelo **UID** (ver **[Conta master](#conta-master)**); na interface, pelo e-mail.

**Simplicidade não é o mesmo que segurança.** As duas coisas são avaliadas separadamente ao longo deste documento, em especial em **[Segurança e controle de acesso](#segurança-e-controle-de-acesso)**.

### Cota gratuita do Firebase (leituras)

No plano gratuito (Spark), o Firestore permite **50 mil leituras por dia**. Estourar **não gera cobrança**, mas o banco para de responder até a cota reiniciar (por volta das 4h, horário de Brasília) — a chamada fica parada no resto do dia. Para ficar longe desse limite:

- cada aparelho lê **só as presenças de hoje** da turma (não as dos últimos 7 dias); o Histórico, no Gerenciar do professor, faz a própria busca dos 7 dias quando é aberto;
- a **lista de todas as turmas** só é lida na tela de escolher turma: quem entra pelo **link/QR da turma** não a baixa, e ela deixa de ser acompanhada depois que o aluno entra numa turma;
- com a página aberta de um dia para o outro, a chamada passa a buscar o dia novo sozinha.

Estimativa com uma turma de 32 alunos: cerca de **2 mil a 2,5 mil leituras por aula** (antes, de 3 mil a quase 8 mil no fim da semana) — algo em torno de **20 aulas por dia** no sistema inteiro. O uso real aparece no Firebase Console → Firestore Database → aba **Uso**.

## Segurança e controle de acesso

Esta seção separa, para cada mecanismo do sistema, o que é **proteção de interface** (o `index.html` esconde ou bloqueia uma ação, mas o dado em si pode estar acessível a quem consulta o Firestore diretamente) do que é **segurança aplicada pelas regras do Firestore** (avaliada pelo servidor do Google, independente do que o navegador de quem pede faz ou deixa de fazer). Tratar as duas coisas como equivalentes é o principal jeito de criar uma falsa sensação de segurança — por isso a distinção é explícita em cada item abaixo.

### `firebaseConfig` não é uma credencial

O bloco `firebaseConfig`, visível no código-fonte público do site, identifica **qual** projeto Firebase o app usa — não é, por si só, uma credencial de acesso; isso é assim por design do Firebase, documentado pelo próprio Google. **Isso não significa que o projeto esteja automaticamente seguro.** Quem efetivamente decide quem pode ler ou escrever cada dado são:

- as **regras do Firestore** (o bloco publicado no passo de configuração do banco, seção [Instalação e configuração](#instalação-e-configuração)) — controlam leitura/escrita de cada documento;
- o **Firebase Authentication** — controla quem consegue provar ser um e-mail/senha cadastrado.

A segurança do sistema depende inteiramente dessas duas peças estarem configuradas corretamente, não de o `firebaseConfig` estar visível ou não. Consequência prática: nunca coloque dados pessoais de alunos diretamente no código-fonte do `index.html`; cadastre sempre pela Área do professor, que grava no Firestore.

### Código do dia

O código do dia deve ser entendido como uma **credencial compartilhada da turma** — não como autenticação individual de cada aluno, e não como prova de presença física de quem o utiliza.

- **O código não fica na turma.** A coleção `turmas` tem `allow read: if true` (a tela inicial lista as turmas antes de qualquer login), então a turma guarda só **quando** o código foi gerado (`codigoDefinidoEm`) e **por quanto tempo** vale (`codigoDuracaoMin`). O código em si é o **ID** do documento `turmas/{turmaId}/salas/{código}`, que guarda a lista de nomes da turma para os alunos. Ninguém consegue listar essa coleção (só o professor dono / conta master), então só chega nesse documento quem já sabe o código.
- **Quem confere é o servidor.** O aluno digita o código e o site tenta ler `salas/{código digitado}`: as regras (função `salaValida()`) só liberam se esse documento existir, for do código atual (mesmo horário de `codigoDefinidoEm` da turma) e o prazo não tiver acabado. Código errado, encerrado, trocado ou vencido → acesso negado, e o site mostra "código incorreto" ou "expirou".
- **O aluno não lê a coleção `alunos`** (só o professor): recebe apenas a lista de nomes da sala. **Presenças**: o aluno só consegue ler as presenças do dia marcadas com o código atual (a consulta precisa filtrar por `codigoUsado`) As marcadas pelo professor com um código ativo levam o código e aparecem para os alunos. As que o professor marcou **antes** de gerar o código vão numa lista `marcados` (só os nomes) dentro da sala: o aluno vê esses nomes como já marcados. Essa lista é atualizada quando o professor marca ou desfaz uma presença de hoje (na Chamada, na janela do código ou no histórico).
- **Registro repetido** (ex.: professor e aluno marcaram o mesmo nome): conta uma vez só em todo lugar, e vale o **horário mais cedo** (o atraso fica certo). "Desfazer" apaga todos os registros daquele aluno no dia.
- **Aluno incluído com o código ativo**: ao incluir/renomear/remover um aluno pelo site (Gerenciar, Chamada ou com a janela do código aberta), a lista de nomes da sala é atualizada na hora. Se isso não acontecer (ex.: alteração feita direto no Firebase Console), é só gerar o código de novo.
- Turmas antigas, que tinham o código gravado na própria turma (`codigoDoDia`), perdem esse campo quando o dono (ou a conta master) entra na Área do professor, e ficam sem código ativo até um novo ser gerado. As regras não aceitam mais gravar um código na turma.
- O código tem **6 dígitos** (1 milhão de combinações), sorteados com o gerador criptográfico do navegador (`crypto.getRandomValues`), e vale no máximo 4 horas (as regras não aceitam mais que isso, nem um horário de início "adiantado": ele é sempre a hora do servidor). Adivinhar por tentativa e erro dentro do prazo fica muito mais difícil do que com 4 dígitos (10 mil). Códigos de 4 dígitos gerados antes dessa mudança continuam valendo até vencer (o aluno toca em "Validar").
- Um código vencido há mais de 12 horas (e não encerrado) tem a lista de nomes apagada na limpeza feita ao entrar na Área do professor.
- **O que isso não garante**: qualquer pessoa que saiba o código — por tê-lo recebido de outro aluno, por exemplo — consegue ler os dados da turma dentro do prazo de validade, mesmo sem estar fisicamente na sala. O código autentica "conhecer o código daquela turma", não "estar presente".

### Identificador do aparelho

A trava de "um aparelho, um aluno, por dia" funciona assim:

- O identificador é um UUID gerado no navegador e guardado em `localStorage`. Ele não identifica a pessoa — identifica o navegador/aparelho, e permanece o mesmo só enquanto ninguém limpar os dados do site.
- Ele pode ser contornado por qualquer pessoa: limpar o `localStorage`, usar uma aba anônima ou outro navegador gera um identificador novo, liberando uma nova marcação no mesmo aparelho físico. Essa limitação é conhecida e aceita — o objetivo da trava nunca foi impedir fraude deliberada, e sim evitar o caso comum de duplo clique ou de um colega tentar marcar por outro no mesmo celular sem intenção.
- **O que é garantido pelo Firestore**: o documento de presença usa um ID determinístico (`data_idDoAparelho`), e a regra `allow update: if false` impede que esse mesmo documento seja reescrito. Ou seja: com o **mesmo** identificador, no mesmo dia, na mesma turma, uma segunda tentativa de marcação é recusada pelo banco, não só escondida pela interface. Com um identificador diferente, essa trava específica não se aplica.
- O campo `maquina` não tem seu valor validado pelas regras — o Firestore não tem como confirmar que aquele valor corresponde de fato ao identificador salvo no `localStorage` de quem está escrevendo; é um dado informado pelo próprio navegador.
- Depois que o professor desfaz uma presença, o mesmo identificador de aparelho fica livre para marcar de novo (o documento antigo foi apagado, então uma nova escrita com o mesmo ID é uma criação, não uma atualização bloqueada).

### Criação de presença sem estar autenticado

Sem estar logado, alguém só consegue criar uma presença informando `nome`, `data`, `horario`, `maquina` **e** um `codigoUsado` igual ao código atual da turma, dentro do prazo de validade (`salaValida()`) — isso é verificado pelo servidor, não só pela interface. Além disso, o `nome` precisa estar na lista de nomes da turma (a da sala) e o ID do documento precisa ser `data_maquina`. Dentro dessa exigência, ainda existem lacunas conhecidas:

- **É verificado** (presença do aluno): a `data` tem que ser **hoje** (horário de Brasília, UTC-3) e a presença leva `criadoEm` com a **hora do servidor** (`criadoEm == request.time`). A tela e o cálculo de atraso usam essa hora, não a do celular — mudar o relógio do aparelho não adianta. O campo `horario` continua sendo gravado (presenças antigas e as marcadas pelo professor usam ele), mas deixa de valer para a presença do aluno.
- **É verificado e bloqueado**: reescrever a mesma presença de um mesmo aparelho no mesmo dia, e criar uma presença sem um código correto e ativo (a menos que quem estiver criando seja o professor dono da turma, autenticado).
- **É verificado e bloqueado** (desde a revisão de segurança): campos além de `nome`, `data`, `horario`, `maquina`, `expiraEm` e `codigoUsado`; `nome` vazio ou com mais de 120 caracteres; `data` fora do formato `AAAA-MM-DD`; `horario` e `maquina` longos demais; e presença **sem `expiraEm`** ou com `expiraEm` mais de 8 dias à frente (antes era possível criar presenças que nunca seriam apagadas pela retenção, ou documentos enormes que enchiam o banco).

Atenção: "conhecer o código ativo" não exige estar na sala (um colega pode repassar o código). O código não fica mais público (ver **[Código do dia](#código-do-dia)**), mas essas lacunas de `data`/`horario` e de `maquina` estão documentadas aqui deliberadamente, para não sugerir uma proteção maior do que a implementação atual entrega.

### Isolamento entre professores

- As regras do Firestore exigem estar autenticado **e** que o `professorUid` da turma seja igual ao UID de quem está logado (ou que seja a conta master) para: criar/editar/apagar a turma, criar/editar/apagar alunos, mudar o código do dia, ou apagar uma presença. Um professor não consegue alterar, apagar ou gerenciar os alunos de uma turma de outro professor — isso é garantido pelo Firestore, e não apenas pela Área do professor filtrar a lista para mostrar só as próprias turmas.
- Um professor não vê os dados de turmas de outros professores só por estar autenticado: a coleção `alunos` é só do dono (ou da master), e a lista de nomes/presenças do dia exige saber o código atual daquela turma, como qualquer outra pessoa.
- Dentro da própria turma, o dono (ou a conta master) sempre pode marcar presença de qualquer aluno via Modo professor, sem precisar do código — esse é o comportamento pretendido dessa funcionalidade, não uma falha de isolamento.
- A conta master é a única exceção deliberada nas regras: tem acesso de leitura/escrita a todas as turmas, alunos e presenças de todos os professores, por design, sem depender do código do dia.

### Conta master

A conta master aparece em dois lugares, com papéis diferentes:

- `isMaster()`, nas **regras do Firestore**, é quem de fato **concede** a permissão de acessar e alterar turmas de qualquer professor. Ela compara o **UID** de quem está logado com o UID da conta master, escrito nas regras no lugar de `COLE_AQUI_O_UID_DA_CONTA_MASTER` (o UID aparece no Firebase Console → Authentication → Users → coluna "User UID"). Antes a comparação era pelo e-mail, que o Firebase não garante estar verificado — pelo UID, ninguém consegue se passar pela master mesmo criando uma conta com o mesmo e-mail (caso a original seja apagada, por exemplo).
- `TEACHER_EMAIL`, no `index.html`, controla apenas a **interface** (mostrar os painéis da master, preencher o e-mail no login). Se não bater com a conta do UID acima, a interface mostra os painéis, mas o Firestore nega as ações.

Se a conta master for recriada, o UID muda: é preciso atualizar as regras.

### Criação de novos professores

O botão "Criar professor" usa `createUserWithEmailAndPassword` do Firebase Authentication, chamado direto do navegador — consequência direta de não haver backend nesta arquitetura (ver **[Arquitetura e decisões técnicas](#arquitetura-e-decisões-técnicas)**). Isso só é possível porque o provedor "E-mail/senha" está ativado no projeto; essa mesma possibilidade já existe de forma independente do painel admin, já que qualquer requisição com o `apiKey` público do projeto pode pedir a criação de conta enquanto esse provedor estiver ativo — o painel admin apenas torna essa operação mais conveniente para a conta master, sem ser o que a habilita.

**Cadastro público desligado (recomendado).** Em Firebase Console → Authentication → Configurações → Ações do usuário, desmarque **"Ativar criação (inscrição)"**. Assim ninguém cria login com o `apiKey` público. O "Criar professor" do Painel admin deixa de funcionar (ele usa esse mesmo cadastro) e avisa isso; para um professor novo:
1. Firebase Console → Authentication → Users → **Adicionar usuário** (e-mail do professor e uma senha qualquer, que ninguém precisa saber);
2. copie o **User UID**;
3. no Painel admin → **"Conta criada no Firebase Console"**: cole o UID, nome e e-mail e toque em **Liberar conta**. A pessoa recebe um e-mail para definir a própria senha.

**Professores liberados.** Como qualquer pessoa pode criar um login com o `apiKey` público (enquanto o cadastro estiver ativo), ter um login **não basta** para ser professor: as regras só deixam criar turma quem está em `professoresAutorizados/{uid}` — lista que **só a conta master** escreve (e a própria master, que não precisa estar nela). Assim, ninguém consegue pôr uma turma falsa na tela dos alunos.
- "Criar professor" no Painel admin já libera o professor novo.
- Conta que já existia (adicionada pelo Painel admin com o mesmo e-mail) é liberada sozinha quando a master abre o Painel admin depois do 1º acesso dela.
- Qualquer outra conta aparece no Painel admin como **"Não liberado"**, com o botão **Liberar** — só libere quem você sabe que é professor.
- Quem não foi liberado vê um aviso ao entrar, e as turmas que já tinha continuam funcionando (só criar turma nova é bloqueado). "Remover" um professor no Painel admin também tira a liberação.
- **Ao atualizar para esta versão**, os professores que já usam o sistema precisam ser liberados uma vez no Painel admin (a master não precisa).

Remover a conta de um professor, hoje, só é possível pelo Firebase Console (Authentication → Users) — o painel admin cria contas, mas não remove. Uma arquitetura com backend (por exemplo, Cloud Functions usando o Admin SDK) permitiria centralizar essa administração pelo próprio site, incluindo a remoção. Isso não torna a abordagem atual incorreta; é a consequência coerente de manter o projeto sem servidor próprio.

### Autenticação e sessão

- **E-mail e senha**: a tela de login pede os dois. Qualquer conta criada em Authentication → Users nesse projeto Firebase consegue entrar como professor — o campo de e-mail já vem preenchido com `TEACHER_EMAIL` por padrão, mas pode ser trocado por outro e-mail cadastrado.
- A senha nunca fica no `index.html` nem em qualquer parte do código-fonte do site — apenas o Firebase Authentication a valida.
- **Esqueci minha senha**: envia um e-mail de redefinição automaticamente para o e-mail informado, usando o próprio mecanismo do Firebase — funciona desde que o provedor "E-mail/senha" esteja configurado.
- **Trocar a senha**: disponível a qualquer momento dentro da Área do professor.
- **Persistência de sessão**: por padrão, o código usa `setPersistence(auth, browserSessionPersistence)`, o modo de persistência do Firebase Authentication ligado ao `sessionStorage` do navegador — dura só a aba atual. Recarregar a página mantém o login; fechar a aba (ou o navegador) encerra a sessão. Isso é adequado para um computador compartilhado em sala de aula, desde que a aba seja de fato fechada entre um professor e outro.
- **"Manter conectado neste aparelho"** (opcional, desmarcado por padrão, na tela de login): usa `browserLocalPersistence`, e o login continua valendo mesmo depois de fechar o navegador, até o professor tocar em **Sair** (que também desfaz essa escolha). Pensado para o celular pessoal do professor; **não deve ser marcado em computador compartilhado**. Risco a considerar: quem pegar o aparelho desbloqueado acessa a Área do professor daquela conta (turmas, códigos, fotos de atrasos). Continuam exigindo a senha de novo, mesmo assim: desfazer uma presença (e essa confirmação nunca oferece "manter conectado"), excluir uma turma e trocar a senha. A escolha fica marcada no aparelho em `localStorage` (`chamada:manterConectado`) só para o app saber, ao abrir, que não deve voltar a sessão para o modo "só esta aba".

## Privacidade e LGPD

Este sistema trata dados pessoais de estudantes — a LGPD (Lei Geral de Proteção de Dados) trata nome e frequência escolar como dados pessoais. Pontos relevantes para quem for usar ou avaliar este projeto:

- **Dados tratados**: nome do aluno, nome da turma, e registros de presença (nome, data, horário e um identificador de dispositivo). Não são coletados e-mail, matrícula, CPF ou qualquer outro dado do aluno pelo sistema em si. As **fotos de comprovantes de atraso** guardadas pelo professor podem conter dados do aluno que estejam no próprio papel fotografado (nome, assinatura etc.) — o sistema não lê nem extrai nada delas.
- **Onde ficam armazenados**: no Cloud Firestore, dentro do projeto Firebase de quem publicou aquela cópia do sistema — ver **[Modelo de dados](#modelo-de-dados)**.
- **Finalidade**: apoio operacional ao controle de chamada do professor. Este sistema não substitui os sistemas institucionais de controle acadêmico — a chamada oficial continua sendo registrada no SUAP (ou equivalente), sempre após validação do professor. A marcação depende do próprio aluno, sem verificação de identidade (ver **[Identificador do aparelho](#identificador-do-aparelho)** e **[Código do dia](#código-do-dia)**) — por isso o professor não deve tratar os registros deste sistema, isoladamente, como prova definitiva de frequência.
- **Quem tem acesso**: na interface, o professor dono da turma e a conta master. Pelas regras do Firestore, quem apresenta o código do dia dentro do prazo de validade também lê a lista de nomes da turma e as presenças do dia marcadas com esse código (o código não é público: não fica no documento da turma) — ver **[Código do dia](#código-do-dia)** para o detalhamento técnico completo; isso é mais amplo do que "só o professor e os alunos daquela turma".
- **Fotos de atrasos**: guardadas sem acesso público (sem URL pública, sem Firebase Storage), acessíveis só ao professor dono da turma e à conta master, sem metadados EXIF (a foto é redesenhada no navegador, o que descarta inclusive a localização GPS) e apagadas automaticamente após 180 dias — ver **[Fotos de atrasos](#fotos-de-atrasos)**.
- **Retenção**: presenças são apagadas automaticamente cerca de 7 dias após serem criadas (as marcadas antes dessa mudança, com 72h), na próxima vez em que algum professor acessar a Área do professor — ver **[Retenção de dados](#retenção-de-dados)** para as limitações dessa implementação. Turmas, alunos e presenças anteriores a esta versão não têm exclusão automática. Excluir uma turma remove permanentemente seus alunos e presenças, de forma irreversível.
- **Transparência com o professor**: no primeiro acesso à Área do professor, o sistema exibe um aviso obrigatório resumindo esses pontos, que só é dispensado depois de o professor clicar em "Concordo"; essa confirmação é registrada em `acordosProfessor/{uid}` (ver **[Modelo de dados](#modelo-de-dados)**).
- **Link da turma**: o link/QR de cada turma só leva à tela da turma; não dá acesso a alunos, presenças nem fotos sem o código do dia (a lista de turmas já é pública hoje, para a tela inicial).
- **Transparência com o aluno**: na tela de chamada, o link "ℹ️ Sobre seus dados" abre um aviso curto explicando o que é salvo e que o sistema não substitui o SUAP, com um canal para pedir acesso, correção ou exclusão dos próprios dados — um link de e-mail pré-preenchido para o responsável pelo sistema (`TEACHER_EMAIL`) — o e-mail do professor não fica mais público na turma. Diferente do aviso do professor, este não é obrigatório: o aluno precisa clicar para ver.
- **Responsabilidade institucional**: cabe ao professor e/ou à instituição que utiliza este sistema observar as próprias políticas de proteção de dados e a legislação aplicável, incluindo, quando pertinente, informar os alunos sobre esse tratamento complementar de dados.

**Este texto não constitui parecer jurídico** nem certificação de conformidade com a LGPD. É uma descrição técnica honesta do que o sistema efetivamente faz com os dados, para que quem for utilizá-lo possa avaliar se atende às próprias obrigações legais e institucionais, e tomar as providências adicionais que considerar necessárias — por exemplo, um termo próprio para os alunos, ou consulta ao setor responsável por proteção de dados da instituição.

## Riscos aceitos

Riscos conhecidos que foram avaliados e **aceitos conscientemente** (a correção completa exigiria login de aluno ou App Check, que foram descartados pelos riscos que trariam ao uso em sala):

- **Quem tem o código pode marcar colegas ausentes.** Sem login de aluno, o servidor não sabe *quem* está marcando: com o código em mãos, um aluno consegue marcar outro nome da lista usando uma aba anônima (cada aba conta como um aparelho novo) ou, com um script, marcar a turma inteira. O servidor garante só que o nome está na lista da turma, que é hoje, que o código é o atual e que a hora é a do servidor.
- **A cota gratuita de leituras pode ser esgotada de propósito.** A lista de turmas é pública (a tela inicial precisa dela); um script que a lê sem parar pode gastar as 50 mil leituras/dia do plano Spark e deixar o site fora do ar até a cota zerar (por volta das 4h). O App Check reduziria isso, mas foi descartado: nos testes, quando o reCAPTCHA não carregava direito, o site travava para o aluno.

**Recomendações ao professor** (por causa desses riscos):
- **Em dia de prova** (ou quando a presença tiver peso), use o **Modo professor**: você marca cada aluno, sem código.
- **Sempre confira o número de presentes** ("Presentes N/M" na Chamada) com o número de alunos que você vê na sala. Se houver mais presenças do que pessoas, alguém marcou por outro.
- A chamada oficial continua sendo a do SUAP, validada pelo professor.

## Limitações conhecidas

Resumo das limitações técnicas já detalhadas nas seções acima — nenhuma delas é escondida ou "compensada" pela interface:

- O identificador de dispositivo é forjável (limpar `localStorage`, aba anônima, outro navegador) — ver **[Identificador do aparelho](#identificador-do-aparelho)**.
- O código do dia é uma credencial compartilhada da turma, não uma autenticação individual nem prova de presença física — ver **[Código do dia](#código-do-dia)**.
- Os campos `nome`, `data` e `horario` de uma presença não são verificados contra o cadastro real de alunos nem contra o relógio do servidor — ver **[Criação de presença sem estar autenticado](#criação-de-presença-sem-estar-autenticado)**.
- A retenção de 7 dias das presenças e a de 180 dias das fotos de atrasos dependem de algum professor acessar a Área do professor — não é um processo contínuo em segundo plano — ver **[Retenção de dados](#retenção-de-dados)**.
- As fotos de atrasos ocupam a mesma cota de armazenamento gratuita do Firestore usada pelo restante do sistema — ver **[Fotos de atrasos](#fotos-de-atrasos)**.
- Não há backend próprio: a criação de contas de professor é feita direto do navegador, e a remoção de contas ainda depende do Firebase Console — ver **[Criação de novos professores](#criação-de-novos-professores)**.
- A conta master é identificada pelo UID nas regras (a tela usa o e-mail só para decidir o que mostrar) — ver **[Conta master](#conta-master)**.
- O site não abre dentro de página de outro endereço (fica em branco, proteção contra "clickjacking"); dentro de página do próprio site continua funcionando.
- O `firebaseConfig` é público por design do Firebase, mas isso não implica que o projeto esteja automaticamente seguro — a segurança depende das regras do Firestore e da Authentication.
- O canal de contato para o aluno pedir acesso/correção/exclusão dos dados é um link de e-mail para o professor — não é um processo institucional automatizado, nem garante prazo de resposta; depende do professor ler e agir manualmente.
- Este README não constitui parecer jurídico de conformidade com a LGPD.

## Instalação e configuração

### 1. Criar o banco de dados (Firebase — gratuito)

1. Acesse **https://console.firebase.google.com** e faça login com uma conta Google.
2. Clique em **"Adicionar projeto"**, dê um nome (ex.: `chamada-turma`) e conclua a criação (o Google Analytics pode ser desativado, não é necessário).
3. No menu lateral, procure **"Bancos de dados e armazenamento"** (ou **Build → Firestore Database**, dependendo da versão do console) e clique em **"Firestore Database"**.
4. Clique em **"Criar banco de dados"**.
   - Na tela "Selecionar a edição", deixe marcado **"Edição Standard"** (é a gratuita/correta — não escolha "Enterprise").
   - Escolha a localização mais próxima (ex.: `southamerica-east1` para o Brasil).
   - Selecione **"Iniciar no modo de produção"**.
   - ⚠️ A aba "Regras" só aparece depois que o banco de dados é criado.
5. Depois de criado, vá na aba **"Regras"** do Firestore e substitua todo o conteúdo por:

   ```
   rules_version = '2';
   service cloud.firestore {
     // Conta master: identificada pelo UID (não pelo e-mail, que não é
     // verificado). Troque o texto abaixo pelo UID da sua conta:
     // Firebase Console → Authentication → Users → coluna "User UID".
     function isMaster() {
       return request.auth != null && request.auth.uid == 'COLE_AQUI_O_UID_DA_CONTA_MASTER';
     }

     match /databases/{database}/documents {
       function turmaAtual(turmaId) {
         return get(/databases/$(database)/documents/turmas/$(turmaId)).data;
       }

       function ehProfessorDaTurma(turmaId) {
         return request.auth != null
                && (isMaster() || turmaAtual(turmaId).professorUid == request.auth.uid);
       }

       // Código do dia: o valor NÃO fica na turma (que é pública). Ele é o
       // nome (ID) do documento turmas/{id}/salas/{codigo}, que guarda a lista
       // de nomes para os alunos. Só quem sabe o código chega nesse documento.
       // A turma guarda só quando o código foi gerado e quanto tempo vale.
       function codigoNoPrazo(turmaId) {
         let t = turmaAtual(turmaId);
         return t.get('codigoDefinidoEm', null) != null
                && request.time < t.codigoDefinidoEm + duration.value(t.get('codigoDuracaoMin', 180), 'm');
       }

       function salaPath(turmaId, codigo) {
         return /databases/$(database)/documents/turmas/$(turmaId)/salas/$(codigo);
       }

       // O código informado é o código atual (e ainda no prazo) da turma
       function salaValida(turmaId, codigo) {
         return codigo is string && codigo.matches('^[0-9]{4,10}$')
                && codigoNoPrazo(turmaId)
                && exists(salaPath(turmaId, codigo))
                && get(salaPath(turmaId, codigo)).data.definidoEm == turmaAtual(turmaId).codigoDefinidoEm;
       }

       // Professores liberados pela conta master (lista professoresAutorizados).
       // Só eles (e a master) criam turmas: uma conta qualquer, criada direto no
       // Firebase, não consegue pôr uma turma falsa na tela dos alunos.
       function professorAutorizado() {
         return isMaster()
                || (request.auth != null
                    && exists(/databases/$(database)/documents/professoresAutorizados/$(request.auth.uid)));
       }

       // Data de hoje em Brasília (UTC-3, sem horário de verão), "AAAA-MM-DD"
       function hojeBrasilia() {
         let t = request.time - duration.value(3, 'h');
         return string(t.year()) + '-'
                + (t.month() < 10 ? '0' : '') + string(t.month()) + '-'
                + (t.day() < 10 ? '0' : '') + string(t.day());
       }

       // Texto com tamanho máximo (evita documentos enormes)
       function textoAte(valor, max) {
         return valor is string && valor.size() <= max;
       }

       function corValida(valor) {
         return valor in ['', 'verde', 'azul', 'turquesa', 'roxo', 'rosa', 'vermelho', 'laranja', 'amarelo', 'cinza'];
       }

       // Campos da turma com tipo e tamanho corretos (vale para criar e alterar)
       // (codigoAntes: turmas antigas ainda podem ter um código velho gravado;
       // alterar outra coisa nelas continua permitido, sem trocar esse valor)
       function turmaValida(d, codigoAntes) {
         return textoAte(d.nome, 120) && d.nome.size() > 0
                && (!('professorNome' in d) || textoAte(d.professorNome, 120))
                // o código do dia não pode mais ficar na turma (só vazio/removido)
                && (!('codigoDoDia' in d) || d.codigoDoDia == '' || d.codigoDoDia == codigoAntes)
                && (!('codigoDefinidoEm' in d) || d.codigoDefinidoEm == null || d.codigoDefinidoEm is timestamp)
                // código vale no máximo 4 horas
                && (!('codigoDuracaoMin' in d) || (d.codigoDuracaoMin is int && d.codigoDuracaoMin > 0 && d.codigoDuracaoMin <= 240))
                && (!('arquivada' in d) || d.arquivada is bool)
                && (!('cor' in d) || corValida(d.cor));
       }

       match /turmas/{turmaId} {
         allow read: if true;
         // O e-mail do professor NÃO fica na turma (que é pública).
         allow create: if request.auth != null
                       && request.resource.data.keys().hasAll(['nome', 'professorUid'])
                       && request.resource.data.keys().hasOnly(['nome', 'professorUid', 'professorNome', 'codigoDoDia', 'codigoDefinidoEm', 'codigoDuracaoMin', 'arquivada', 'cor'])
                       && request.resource.data.professorUid == request.auth.uid
                       && professorAutorizado()
                       && (request.resource.data.get('codigoDefinidoEm', null) == null || request.resource.data.codigoDefinidoEm == request.time)
                       && turmaValida(request.resource.data, '');
         allow update: if request.auth != null
                       && (isMaster() || resource.data.professorUid == request.auth.uid)
                       && request.resource.data.diff(resource.data).affectedKeys()
                       .hasOnly(['codigoDoDia', 'codigoDefinidoEm', 'codigoDuracaoMin', 'nome', 'professorUid', 'professorEmail', 'professorNome', 'arquivada', 'cor'])
                       // só a conta master troca o dono (transferência / turmas antigas sem dono)
                       && (!request.resource.data.diff(resource.data).affectedKeys().hasAny(['professorUid']) || isMaster())
                       // e-mail do professor (turmas antigas): só pode ser removido
                       && (!request.resource.data.diff(resource.data).affectedKeys().hasAny(['professorEmail']) || !('professorEmail' in request.resource.data))
                       // gerar código: o horário é o do servidor (não dá para "adiantar" o prazo)
                       && (!request.resource.data.diff(resource.data).affectedKeys().hasAny(['codigoDefinidoEm'])
                           || request.resource.data.codigoDefinidoEm == null
                           || request.resource.data.codigoDefinidoEm == request.time)
                       && turmaValida(request.resource.data, resource.data.get('codigoDoDia', ''));
         allow delete: if request.auth != null && (isMaster() || resource.data.professorUid == request.auth.uid);

         // Lista de nomes para os alunos (e de quem já está marcado), com o
         // código como ID. Aluno só lê
         // (um documento, pelo código exato); listar é só do professor.
         match /salas/{codigo} {
           allow get: if ehProfessorDaTurma(turmaId) || salaValida(turmaId, codigo);
           allow list, delete: if ehProfessorDaTurma(turmaId);
           allow create, update: if ehProfessorDaTurma(turmaId)
                                 && codigo.matches('^[0-9]{4,10}$')
                                 && request.resource.data.keys().hasOnly(['nomes', 'definidoEm', 'marcados'])
                                 && request.resource.data.nomes is list
                                 && request.resource.data.nomes.size() <= 500
                                 // nomes com até ~120 caracteres cada (tamanho total limitado)
                                 && request.resource.data.nomes.join('|').size() <= 500 * 121
                                 // quem o professor já marcou hoje sem o código (o aluno vê como
                                 // marcado): só nomes que estão na lista da sala
                                 && (!('marcados' in request.resource.data)
                                     || (request.resource.data.marcados is list
                                         && request.resource.data.nomes.hasAll(request.resource.data.marcados)))
                                 && request.resource.data.definidoEm is timestamp;
         }

         match /alunos/{alunoId} {
           allow read: if ehProfessorDaTurma(turmaId);
           allow create: if ehProfessorDaTurma(turmaId)
                         && request.resource.data.keys().hasAll(['nome'])
                         && request.resource.data.nome is string;
           allow update: if ehProfessorDaTurma(turmaId)
                         && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['nome'])
                         && request.resource.data.nome is string;
           allow delete: if ehProfessorDaTurma(turmaId);
         }

         match /presencas/{presencaId} {
           // Aluno: só as presenças marcadas com o código atual (a consulta
           // precisa filtrar por codigoUsado).
           allow read: if ehProfessorDaTurma(turmaId)
                       || salaValida(turmaId, resource.data.get('codigoUsado', ''));
           // Só os campos esperados, com tamanho limitado, e com prazo de
           // retenção obrigatório (no máximo 8 dias à frente).
           allow create: if request.resource.data.keys().hasAll(['nome', 'data', 'horario', 'maquina', 'expiraEm'])
                         && request.resource.data.keys().hasOnly(['nome', 'data', 'horario', 'maquina', 'expiraEm', 'codigoUsado', 'criadoEm', 'aparelho'])
                         // tipo do aparelho do aluno (só para o professor ver)
                         && (!('aparelho' in request.resource.data) || request.resource.data.aparelho in ['celular', 'computador'])
                         // criadoEm: hora do servidor (não dá para "voltar o relógio")
                         && (!('criadoEm' in request.resource.data) || request.resource.data.criadoEm == request.time)
                         && textoAte(request.resource.data.nome, 120) && request.resource.data.nome.size() > 0
                         && request.resource.data.data is string && request.resource.data.data.matches('^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
                         && textoAte(request.resource.data.horario, 10)
                         && textoAte(request.resource.data.maquina, 64)
                         && request.resource.data.expiraEm is timestamp
                         && request.resource.data.expiraEm <= request.time + duration.value(8, 'd')
                         && (
                              ehProfessorDaTurma(turmaId)
                              || (
                                   // aluno: código atual, nome da lista da turma e
                                   // um documento por aparelho por dia
                                   salaValida(turmaId, request.resource.data.get('codigoUsado', ''))
                                   && request.resource.data.nome in get(salaPath(turmaId, request.resource.data.codigoUsado)).data.nomes
                                   && presencaId == request.resource.data.data + '_' + request.resource.data.maquina
                                   // aluno: dia de hoje e hora do servidor (o atraso usa essa hora)
                                   && request.resource.data.data == hojeBrasilia()
                                   && request.resource.data.get('criadoEm', null) == request.time
                                 )
                            );
           // Saída antecipada: só o professor da turma, só esse campo (a hora da
           // saída, no máximo 5 min à frente do servidor; ou apagar = desfazer)
           allow update: if ehProfessorDaTurma(turmaId)
                         && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['saidaEm'])
                         && (!('saidaEm' in request.resource.data)
                             || (request.resource.data.saidaEm is timestamp
                                 && request.resource.data.saidaEm <= request.time + duration.value(5, 'm')));
           allow delete: if ehProfessorDaTurma(turmaId);
         }

         // Fotos de comprovantes de atraso: só o dono da turma (ou a conta
         // master). O código do dia NÃO libera leitura aqui.
         match /atrasos/{atrasoId} {
           allow read, delete: if ehProfessorDaTurma(turmaId);
           allow create: if ehProfessorDaTurma(turmaId)
                         && request.resource.data.keys().hasOnly(['criadoEm', 'thumb'])
                         && request.resource.data.criadoEm == request.time
                         && request.resource.data.thumb is bytes
                         && request.resource.data.thumb.size() <= 64 * 1024;
           allow update: if false;
         }

         match /atrasosImg/{atrasoId} {
           allow read, delete: if ehProfessorDaTurma(turmaId);
           allow create: if ehProfessorDaTurma(turmaId)
                         && request.resource.data.keys().hasOnly(['img'])
                         && request.resource.data.img is bytes
                         && request.resource.data.img.size() <= 900 * 1024
                         && existsAfter(/databases/$(database)/documents/turmas/$(turmaId)/atrasos/$(atrasoId));
           allow update: if false;
         }
       }

       match /acordosProfessor/{uid} {
         allow read: if request.auth != null && (request.auth.uid == uid || isMaster());
         // só os campos usados pelo site, com tamanho limitado
         allow create: if request.auth != null && request.auth.uid == uid
                       && request.resource.data.keys().hasOnly(['avisosAceitosEm', 'email', 'nome', 'ultimoAcesso'])
                       && textoAte(request.resource.data.get('email', ''), 200)
                       && textoAte(request.resource.data.get('nome', ''), 120);
         allow update: if request.auth != null && request.auth.uid == uid
                       && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['avisosAceitosEm', 'email', 'nome', 'ultimoAcesso'])
                       && textoAte(request.resource.data.get('email', ''), 200)
                       && textoAte(request.resource.data.get('nome', ''), 120);
         allow delete: if request.auth != null && request.auth.uid == uid;
         // a conta master apaga o registro ao remover um professor do sistema
         allow delete: if isMaster();
       }

       // Professores liberados para criar turmas: só a conta master mexe.
       // Cada professor pode conferir se já foi liberado.
       match /professoresAutorizados/{uid} {
         allow read: if request.auth != null && (request.auth.uid == uid || isMaster());
         allow create, update: if isMaster()
                               && request.resource.data.keys().hasOnly(['email', 'nome', 'autorizadoEm'])
                               && textoAte(request.resource.data.get('email', ''), 200)
                               && textoAte(request.resource.data.get('nome', ''), 120);
         allow delete: if isMaster();
       }

       // Professores criados pelo Painel admin que ainda não entraram no
       // sistema (lista "aguardando 1º acesso"): só a conta master.
       match /professoresPendentes/{pendenteId} {
         allow read, write: if isMaster();
       }
     }
   }
   ```

   A função `isMaster()` dá acesso total (editar/apagar qualquer turma, aluno ou presença) para a conta `douglascamargo@ifsul.edu.br`, além do próprio dono de cada turma. Para trocar quem é a conta master, edite esse e-mail dentro de `isMaster()` — e veja **[Conta master](#conta-master)** antes de fazer isso.

   Clique em **"Publicar"**. Com essas regras:
   - criar turma, gerenciar alunos, mudar o código do dia ou apagar uma presença exige estar logado como o professor dono da turma (ou a conta master);
   - a coleção `alunos` só é lida pelo professor dono/master; quem informar o código do dia dentro do prazo lê só a lista de nomes (`salas/{código}`) e as presenças do dia marcadas com esse código — ver **[Código do dia](#código-do-dia)** para o que isso garante de fato;
   - `acordosProfessor/{uid}` guarda o registro de que aquele professor confirmou os "Avisos importantes" (e o nome/e-mail dele, usados na lista de professores da conta master) — cada um só lê/escreve o próprio registro; a conta master também pode ler todos e apagar o registro ao remover um professor;
   - `atrasos`/`atrasosImg` (fotos de comprovantes de atraso) só podem ser lidos, criados e apagados pelo professor dono da turma (ou pela conta master) — o código do dia não dá acesso a elas; ver **[Fotos de atrasos](#fotos-de-atrasos)**.

   > Sempre que o formato dos dados mudar, as regras precisam ser atualizadas — este README sempre tem o bloco completo mais recente para copiar e colar.

   > **Retenção de 7 dias nas presenças** já é feita pelo próprio `index.html`, sem precisar configurar nada extra no Console — ver **[Retenção de dados](#retenção-de-dados)**.

6. Ative o login: no menu lateral, procure **"Authentication"** (se aparecer um botão "Vamos começar", clique nele). Na aba **"Sign-in method"**, clique em **"Adicionar novo provedor"**, escolha **"E-mail/senha"** e ative a primeira opção (deixe "Link de e-mail" desligada). Salve.
7. Ainda em Authentication, vá na aba **"Users"** → **"Add user"** → digite o e-mail e a senha do professor → **Add user**.
   - ⚠️ Os passos 6 e 7 são ambos obrigatórios para o login funcionar — fazer só um dos dois faz a senha "não funcionar" e o "esqueci minha senha" também falhar.
   - A senha fica só dentro do Firebase — nunca aparece no código-fonte do site.
8. Volte para a tela inicial do projeto → **Configurações (⚙️) → Configurações do projeto**. Na aba "Geral", role até "Seus apps" e clique no ícone `</>` (Web) para registrar um app.
   - Dê um apelido (ex.: `chamada-web`) e clique em "Registrar app".
   - **Não marque** "Configure também o Firebase Hosting" — este projeto usa o GitHub Pages, não o Hosting do Firebase.
   - O Firebase vai mostrar um bloco `firebaseConfig` parecido com este:

     ```js
     const firebaseConfig = {
       apiKey: "AIzaSy...",
       authDomain: "chamada-turma.firebaseapp.com",
       projectId: "chamada-turma",
       storageBucket: "chamada-turma.appspot.com",
       messagingSenderId: "123456789",
       appId: "1:123456789:web:abcdef"
     };
     ```
   - Copie esses valores.
9. Abra o arquivo `index.html`, procure por `firebaseConfig` (perto do topo do `<script type="module">`) e cole os valores reais no lugar dos valores de exemplo. Troque também a linha `const TEACHER_EMAIL = "..."` pelo e-mail do professor cadastrado no passo 7 — veja o que essa variável controla (e o que não controla) em **[Conta master](#conta-master)**.
10. Se essa mesma conta deve ser a **conta master** (acesso a todas as turmas de todos os professores), edite também o e-mail dentro de `isMaster()`, nas regras do Firestore (passo 5) — são duas edições separadas, veja o motivo em **[Conta master](#conta-master)**.
11. Crie o índice combinado que a Área do professor usa para listar "as turmas de cada professor": Firestore Database → aba **"Índices"** → **"Criar índice"** → **"Criar índice estruturado"** → ID da coleção: `turmas` → adicione os campos `professorUid` (Ascendente) e `nome` (Ascendente) → Escopo da consulta: Coleção → **Criar**. Leva 1–2 minutos para ficar "Ativado". Sem esse índice, qualquer professor que não seja a conta master vê um erro ao abrir a Área do professor.

### 2. Publicar o site (GitHub Pages — gratuito)

⚠️ O GitHub Pages gratuito exige que o repositório seja público — o código-fonte fica visível, inclusive o `firebaseConfig`. Isso é esperado (ver **[`firebaseConfig` não é uma credencial](#firebaseconfig-não-é-uma-credencial)**). Ainda assim, **nunca** coloque nomes reais de alunos, e-mails ou qualquer outro dado pessoal diretamente no código-fonte — cadastre sempre pela Área do professor, que grava no Firestore.

1. Depois de editar o `firebaseConfig` e o `TEACHER_EMAIL`, faça commit e push para a branch principal (`main`).
2. Se o repositório ainda estiver privado: **Settings → General → "Danger Zone" → "Change visibility" → "Make public"**.
3. No GitHub, acesse o repositório → **Settings → Pages**.
4. Em "Source", escolha a opção **"Deploy from a branch"** (não escolha "GitHub Actions").
5. Em "Branch", selecione `main` e a pasta `/ (root)`. Clique em **Save**.
6. Aguarde 1–2 minutos. Um "404" logo em seguida é normal enquanto o build processa.
7. O link fica no formato `https://<seu-usuário>.github.io/chamada/`. Se quiser um domínio próprio, dá para apontá-lo para essa mesma página (Settings → Pages → Custom domain) — o Firebase funciona normalmente hospedado assim; um domínio próprio pode exigir adicioná-lo em Authentication → Settings → Authorized domains.

> Depois de qualquer atualização do código, se a mudança não aparecer no site, o problema quase sempre é cache do navegador — recarregue forçado (Ctrl+F5) ou abra em aba anônima antes de desconfiar que algo quebrou.

### 3. Criar sua primeira turma

1. Abra o link publicado.
2. Clique em **"Área do professor"** e faça login com o e-mail e a senha cadastrados no Firebase.
3. Em "Nova turma", preencha Turma/Ano/Disciplina (o nome final é montado automaticamente) e cole/digite a lista de alunos.
4. Clique em "Criar turma" — você cai direto no painel de gerenciamento dela.
5. Em "Código do dia", gere um código com a duração desejada.
6. Volte para a tela inicial, escolha a turma, digite o código e marque uma presença de teste.
7. Repita os passos 3–5 para cada nova turma.

Confira também no Firestore Console (aba "Dados") se a coleção `turmas` e as subcoleções `alunos`/`presencas` estão sendo criadas.

### Cópia independente para outro professor

Se outro professor quiser o próprio sistema, separado deste (banco de dados, login e site próprios, sem nenhum vínculo), ele precisa de uma conta GitHub e um projeto Firebase próprios, e refazer o passo a passo acima na cópia dele. Isso é diferente de **[adicionar mais professores](#adicionar-mais-professores-no-mesmo-sitebanco-de-dados)**, onde todos compartilham o mesmo site/banco:

| | Mesmo site/Firebase (várias contas) | Cópia independente (fork) |
|---|---|---|
| Quem vê as turmas de quem | Todo professor vê a lista de nomes das turmas de todos (tela inicial dos alunos), mas só gerencia as próprias | Cada professor existe só dentro do próprio projeto — nenhum vínculo |
| Banco de dados | Um só, compartilhado, com isolamento por regras do Firestore | Um projeto Firebase por professor |
| Precisa de | Só criar o login em Authentication (ou usar o painel admin) | GitHub + Firebase próprios, do zero |

Resumo da cópia independente:

1. Criar conta no GitHub (gratuita), se ainda não tiver.
2. Com essa conta logada, abrir este repositório e clicar em **"Fork" → "Create fork"**. Isso cria uma cópia completa (`index.html` + `README.md`) — não há nenhuma referência ao projeto Firebase original guardada no código; o único lugar onde o projeto Firebase é identificado é o `firebaseConfig`, substituído no passo 4.
3. Seguir o passo a passo deste README a partir de **[1. Criar o banco de dados](#1-criar-o-banco-de-dados-firebase--gratuito)**, dentro de um projeto Firebase novo (criado do zero, com a conta Google dele) e no repositório forkado.
4. No `firebaseConfig` do `index.html` forkado, colar os valores do projeto Firebase dele.
5. Trocar `TEACHER_EMAIL` pelo e-mail dele, editar `isMaster()` nas regras do Firestore dele com o mesmo e-mail, e criar esse usuário em Authentication → Users.
6. Ativar o GitHub Pages no repositório forkado, do mesmo jeito.

### Adicionar mais professores (no mesmo site/banco de dados)

Cada turma pertence a quem a criou — cada professor só vê e gerencia as próprias turmas na Área do professor (a tela inicial de seleção de turma, para os alunos, continua mostrando todas as turmas juntas). Duas formas de adicionar outro professor:

**Pelo próprio site** (só a conta master vê essa opção): em "Área do professor" → "Painel admin — criar professor", digite nome e e-mail e clique em "Criar professor". O site cria a conta (usando uma instância separada do Firebase Auth, sem afetar a sessão da conta master) e envia um e-mail automático para a pessoa definir a própria senha — ninguém, nem a conta master, vê a senha dela.

**Direto pelo Firebase Console** (sempre funciona):

1. Authentication → Users → Add user → e-mail e senha da pessoa → Add user.
2. Ela já consegue fazer login em "Área do professor". As turmas que ela criar aparecem só para ela.
3. No primeiro login, o app pede o nome dela antes de liberar o restante da tela.

Se a ideia é que os professores não tenham nenhum vínculo entre si, o caminho é a **[cópia independente](#cópia-independente-para-outro-professor)**, não esta seção.

> **Sobre remover um professor**: o site cuida das turmas dele (ver abaixo), mas apagar o login em si só é possível pelo Firebase Console (Authentication → Users) — ver **[Criação de novos professores](#criação-de-novos-professores)** para o motivo técnico.

### Administrar professores (conta master)

Em ⚙️ Opções → **Painel admin — professores** (só a conta master vê):

- **Lista de professores**: vem de `acordosProfessor` (todo professor que já acessou o sistema e aceitou os avisos, com nome, e-mail e **último acesso**) somada aos donos de turmas existentes e aos professores **criados pelo Painel admin que ainda não entraram** (`professoresPendentes`, mostrados como "aguardando 1º acesso" e retirados dessa lista automaticamente no primeiro acesso). Sem backend, o site não consegue listar as contas do Firebase Authentication: um professor criado direto no Console só aparece depois do primeiro acesso — ou se a conta master "criar" de novo com o mesmo e-mail (a conta não é duplicada, só entra na lista). O "último acesso" ajuda a achar registros que sobraram de logins apagados direto no Console (é o que acontece quando alguém apaga no Console sem usar "Remover" no site).
- **Redefinir senha**: envia para o professor o e-mail padrão do Firebase para ele definir uma senha nova. A conta master nunca define nem vê a senha de ninguém; a senha atual continua valendo até a pessoa definir a nova.
- **Transferir turma**: no **Gerenciar** de qualquer turma, a conta master escolhe o novo professor. Alunos, histórico de presenças, código do dia e fotos de atrasos vão junto (as regras de acesso seguem o dono atual da turma), e o professor anterior deixa de ver a turma na hora.
- **Remover professor**: pede a senha da conta master; transfere as turmas dele para outro professor **ou** as exclui por completo (alunos, presenças e fotos); e apaga o registro dele em `acordosProfessor` (sai da lista). **O login em si continua existindo** até ser apagado no Firebase Console (Authentication → Users → ⋮ → Excluir conta) — o site mostra o link no final. Enquanto o login existir, a pessoa ainda consegue entrar (vê o painel vazio e poderia criar turmas novas).
- **Não é possível pelo site** (exigiria backend/Cloud Functions, que exigem o plano pago Blaze): trocar o e-mail de login de outro professor, apagar o login, ou editar o nome de outro professor (o nome é do próprio professor, em Minha conta).

### Bibliotecas externas (integridade)

- **Ícones:** só os ~30 desenhos usados pelo site ficam **embutidos** no `index.html` (Lucide 0.577.0, licença ISC), em vez de baixar o pacote inteiro (~400 KB) de outro servidor. Para usar um ícone novo, copie o desenho dele (de `lucide.icons` no pacote npm `lucide`) para `ICONES`, no começo do `index.html`.
- **ExcelJS (planilhas, ~1 MB)** e **qrcode-generator (QR Code)** são baixados do jsDelivr **só quando usados** (ao exportar / mostrar um QR) — o aluno não baixa nenhum dos dois — e com **`integrity`** (SRI): o navegador só executa o arquivo se ele for exatamente o da versão publicada no npm; se o CDN for invadido e o arquivo alterado, ele é bloqueado (o site avisa "Não foi possível preparar o Excel"). Ao trocar a versão de uma dessas bibliotecas, gere o hash novo do arquivo exato:

```
curl -s <URL do arquivo> | openssl dgst -sha384 -binary | openssl base64 -A
```

e use `sha384-<resultado>` no `integrity`. O Tailwind (CDN "Play", que gera o CSS no navegador) e o Firebase (módulos importados pelo próprio script) ficam sem SRI.

## Modelo de dados

Tudo fica no Cloud Firestore, no projeto Firebase de cada instalação, organizado assim:

```
turmas/{turmaId}
  nome, codigoDefinidoEm, codigoDuracaoMin, professorUid, professorNome, arquivada, cor
  (o e-mail do professor NÃO fica na turma, que é pública: fica em acordosProfessor;
   turmas antigas perdem o campo professorEmail quando o dono ou a master entram;
   o código do dia também NÃO fica na turma — turmas antigas perdem o campo codigoDoDia)
  salas/{código do dia}
    nomes, marcados, definidoEm   (nomes da turma e quem já foi marcado sem o código; o ID é o código)
  alunos/{alunoId}
    nome
  presencas/{presencaId}
    nome, data, horario, maquina, codigoUsado, expiraEm, criadoEm, aparelho, saidaEm   (criadoEm: hora do servidor; aparelho: celular/computador — na presença do aluno; saidaEm: saída antecipada, só o professor grava)
  atrasos/{atrasoId}
    criadoEm, thumb
  atrasosImg/{atrasoId}
    img
acordosProfessor/{uid}
  avisosAceitosEm, email, nome, ultimoAcesso
professoresAutorizados/{uid}
  email, nome, autorizadoEm     (professores liberados para criar turmas; só a master escreve)
professoresPendentes/{email}
  nome, email, criadoEm
```

- `nome` (em `alunos`) e `nome` (em `presencas`) são independentes por decisão de modelagem: a presença guarda uma **cópia** do nome no momento em que foi marcada, não uma referência ao documento do aluno. Isso preserva o registro histórico como estava no momento da chamada — renomear um aluno depois não altera presenças já registradas, só as futuras. Ver **[Renomear aluno](#renomear-aluno)**.
- `maquina` guarda o identificador do aparelho salvo no `localStorage` de quem marcou — ver **[Identificador do aparelho](#identificador-do-aparelho)**.
- `salas/{código}` existe só enquanto há um código gerado (é apagada ao encerrar, arquivar ou gerar outro código); `definidoEm` é igual ao `codigoDefinidoEm` da turma, e é o que as regras usam para saber que é o código atual.
- `codigoDuracaoMin` guarda por quantos minutos aquele código vale (15, 60, 120 ou 180), escolhido no botão usado para gerá-lo.
- `expiraEm` guarda até quando aquela presença deve existir (7 dias depois de criada) — usado pela limpeza automática, ver **[Retenção de dados](#retenção-de-dados)**.
- `atrasos/{atrasoId}` guarda a data de envio (`criadoEm`, hora do servidor) e uma miniatura (`thumb`) de cada foto de atraso; `atrasosImg/{atrasoId}` (mesmo ID) guarda a foto comprimida (`img`). Ver **[Fotos de atrasos](#fotos-de-atrasos)**.
- `acordosProfessor/{uid}` guarda quando aquele professor confirmou os "Avisos importantes" — um documento por professor; só ele (e a conta master) consegue ler o próprio.

Visível em console.firebase.google.com → projeto → Firestore Database → aba "Dados". Nada disso fica salvo no GitHub — o GitHub só guarda o código do site, nunca os dados de alunos ou presenças.

> **Sobre os limites gratuitos do Firestore**: o plano Spark inclui uma cota diária de leituras/escritas e armazenamento suficiente para o uso normal de algumas turmas fazendo chamada por semana — os números exatos e as condições são definidos pelo Google e podem mudar; consulte a [documentação/preços oficiais do Firebase](https://firebase.google.com/pricing) antes de assumir qualquer limite como garantido. Turmas e alunos não são apagados automaticamente — permanecem até alguém apagar manualmente. As presenças têm uma limpeza automática própria, descrita abaixo.

### Retenção de dados

Cada presença criada a partir desta versão guarda um campo `expiraEm` com a data/hora 7 dias depois de ter sido marcada (presenças marcadas antes dessa mudança guardam 72 horas). O histórico na tela mostra, para cada dia, quando ele será apagado, e avisa para exportar em Excel antes.

O mecanismo "nativo" para apagar isso automaticamente em segundo plano seria uma **política de TTL** do Firestore — mas essa funcionalidade exige que o projeto esteja no plano Blaze (pago por uso, com uma conta de faturamento vinculada); no plano Spark, o Google recusa a criação da política (`403: ... has billing disabled`). Para manter o projeto sem depender de faturamento, a retenção foi implementada de outra forma, direto no `index.html`:

- toda vez que um professor entra na Área do professor, o app executa `cleanupExpiredPresencas()`: para cada turma dele (ou de todas, se for a conta master), busca as presenças com `expiraEm` já vencido e apaga em lote;
- **isso não é um processo automático rodando 24 horas por dia** — só é executado nos momentos em que algum professor efetivamente abre a Área do professor. Numa turma cujo professor não acessa o sistema por um período longo, presenças vencidas continuam existindo até o próximo acesso dele (ou da conta master, que limpa as turmas de todos ao entrar);
- consequentemente, a exclusão **não ocorre necessariamente exatamente 7 dias** depois da criação — pode levar mais tempo, dependendo de quando alguém acessa a Área do professor;
- não exige Cloud Functions nem faturamento, e usa apenas operações normais de leitura/escrita do Firestore, dentro da mesma regra `allow delete: if ehProfessorDaTurma(turmaId)` já publicada;
- não apaga `alunos` nem `turmas` — só o histórico de presença;
- presenças antigas, sem o campo `expiraEm`, também são apagadas: a limpeza apaga ainda as presenças cuja `data` é de mais de 8 dias atrás;
- **a conta master limpa as turmas de todos os professores** ao entrar e, se encontrar presenças que já tinham passado do prazo há mais de 2 dias (ou sem prazo), **avisa** quantas eram e o maior atraso. Entrando pelo menos 1 vez por semana, nada fica muito além dos 7 dias.

Para reter por mais ou menos tempo, a constante `PRESENCA_RETENTION_MS` no `index.html` controla o valor gravado em `expiraEm`. Se o projeto migrar para o plano Blaze por outro motivo no futuro, a política de TTL nativa do Firestore (grupo de coleções `presencas`, campo `expiraEm`) passa a ser uma alternativa mais robusta a essa limpeza dependente de login.

As fotos de atrasos usam o mesmo mecanismo, com 180 dias (constante `ATRASO_RETENTION_MS`): ao entrar na Área do professor, `cleanupExpiredAtrasos()` apaga as fotos (e miniaturas) com `criadoEm` de mais de 180 dias atrás. Independentemente disso, as telas de atrasos nunca mostram fotos com mais de 180 dias, mesmo que a limpeza ainda não tenha rodado.

### Fotos de atrasos

Funcionalidade para guardar fotos de comprovantes/autorizações de atraso — **não** é um cadastro de atrasos: o professor não informa aluno, horário, motivo nem nada além da própria foto.

- **Onde**: na Área do professor, botão **📷 Atrasos** em cada turma (ver e adicionar fotos daquela turma) e **📷 Ver todos os atrasos**, no cabeçalho de "Turmas cadastradas" (fotos de todas as turmas do professor, com filtro por turma; cada miniatura mostra a turma e o dia, ex.: "INF2M 2026 · 25/09"). Nas duas telas dá para filtrar por **dia**. Ordem: mais recente primeiro, agrupadas por data.
- **Baixar todas**: baixa de uma vez as fotos que estão na tela (respeitando os filtros de turma e dia) num único arquivo `.zip`, gerado no próprio navegador, sem biblioteca externa; se for só uma foto, baixa a foto direto.
- **Adicionar foto**: abre o seletor nativo do aparelho — no celular, o próprio navegador oferece câmera ou galeria. Dá para escolher várias fotos de uma vez.
- **Compressão (no navegador, antes do envio)**: a foto é redesenhada com no máximo 1200 px no lado maior (fotos menores não são ampliadas), em WebP com qualidade 0,6 — ou JPEG, em navegadores que não geram WebP (alguns Safari/iPhone). Se ainda passar de ~350 KB, a qualidade e depois o tamanho são reduzidos automaticamente. Também é gerada uma miniatura de 200 px para as listas. A foto original nunca sai do aparelho, e metadados EXIF (inclusive localização GPS) são descartados. As constantes `ATRASO_*` no `index.html` controlam esses valores.
- **Armazenamento**: no próprio Cloud Firestore, como bytes — não usa Firebase Storage, que desde 2026 exige o plano pago Blaze. Cada foto são dois documentos com o mesmo ID: `atrasos/{id}` (data + miniatura, lido nas listas) e `atrasosImg/{id}` (foto inteira, lida só ao abrir). Não há URL pública: a imagem só é baixada pelo SDK do Firebase, depois de as regras confirmarem que quem pede é o dono da turma ou a conta master.
- **Visualizar, baixar e excluir**: ao clicar na miniatura. Não há edição. Excluir apaga a foto e a miniatura juntas.
- **Data**: registrada automaticamente com a hora do **servidor** (as regras recusam qualquer outra data), então não dá para antedatar uma foto.
- **Retenção**: 180 dias — ver **[Retenção de dados](#retenção-de-dados)**. Excluir a turma também apaga todas as fotos dela.
- **Segurança**: garantida pelas regras do Firestore (`match /atrasos` e `match /atrasosImg`), não pela interface: exige estar logado como professor dono da turma (ou conta master) para ler, criar ou apagar; trocar o ID da turma ou chamar a API direto não dá acesso às fotos de outro professor. Diferente de `alunos`/`presencas`, o código do dia **não** libera a leitura das fotos. As regras também limitam o tamanho (miniatura ≤ 64 KB, foto ≤ 900 KB), proíbem campos extras e proíbem editar uma foto já enviada.
- **Custo**: nenhum serviço novo — continua no plano gratuito Spark. Cada foto ocupa tipicamente ~80–250 KB. As fotos contam na mesma cota de armazenamento gratuita do Firestore usada pelas turmas e presenças (os limites exatos são definidos pelo Google — consulte a [página de preços](https://firebase.google.com/pricing)); se essa cota fosse atingida, novas gravações do sistema todo (inclusive chamadas) seriam recusadas até o dia seguinte ou até liberar espaço. Com a retenção de 180 dias o volume se estabiliza, mas vale acompanhar o uso em Firestore → Uso no Console se muitos professores usarem intensamente.

## Testes recomendados

Os **testes automáticos** (regras do Firestore e o site inteiro no navegador, com o emulador do Firebase) ficam na branch **`testes`**, separada da `main` para não irem para o site. O README daquela branch explica como rodar (`rodar-todos.sh`).

Depois de publicar as regras, vale confirmar manualmente (idealmente com duas contas de professor diferentes):

1. Professor A cria a turma A; Professor B cria a turma B.
2. Professor A tenta abrir/gerenciar a turma B pela Área do professor → não deve aparecer na lista dele (e vice-versa).
3. Aluno abre uma turma sem código → vê a tela de "código bloqueado", sem a lista de alunos.
4. Aluno informa um código errado → mensagem de erro, lista continua bloqueada.
5. Aluno informa o código correto → lista aparece e ele consegue marcar presença.
6. Aluno tenta marcar a presença de um colega no mesmo aparelho → bloqueado com a mensagem de "este dispositivo já foi usado hoje".
7. Professor tenta desfazer uma presença → sempre pede a senha, mesmo com Modo professor ativo.
8. Fechar a aba do professor e abrir de novo → a Área do professor volta a pedir login.
9. Testar "Esqueci minha senha" → recebe o e-mail de redefinição.
10. Renomear um aluno com presença já registrada → a presença antiga mantém o nome anterior.
11. Excluir uma turma → confirmar no Firestore Console que `alunos` e `presencas` dela desapareceram, não só o documento da turma.
12. Testar em mais de um dispositivo/rede antes de confiar que uma alteração nas regras está funcionando — problemas de leitura/permissão às vezes só aparecem para quem não está autenticado como professor.
13. Gerar um código de 15 min e esperar passar o prazo → a leitura da lista/presenças da turma volta a ser negada para quem só tem o código, mesmo digitando o código certo (porque `salaValida()` deixou de ser verdadeiro).
13b. Abrir a turma (sem login) no Firebase Console / API → o documento da turma **não** contém o código; ler `turmas/{id}/alunos` sem login é negado.
14. **Atrasos**: Professor A adiciona uma foto na turma A → ela aparece em "📷 Atrasos" da turma A e em "Ver todos os atrasos"; Professor B não vê a turma A nem as fotos dela (e, pelas regras, uma leitura direta de `turmas/{turmaA}/atrasos` feita pelo B é negada); um aluno com o código do dia da turma A também não consegue ler as fotos.
15. **Manter conectado**: sem marcar, fechar a aba e abrir o atalho `#professor` de novo pede a senha; marcando, abre direto nas turmas; depois de "Sair", volta a pedir a senha.
16. Primeiro login de um professor novo → o modal "Avisos importantes" abre sozinho e não fecha clicando fora nem com Esc, só pelo botão "Concordo"; um novo login depois disso não deve mais mostrar o modal forçado.

Nem tudo nesta lista tem garantia absoluta — onde a limitação é conhecida (ex.: identificador de aparelho forjável, `data` não verificada), isso está descrito em **[Limitações conhecidas](#limitações-conhecidas)**, para não prometer uma proteção que a implementação atual não entrega.

## Problemas comuns

- **"Não acho a aba Regras no Firestore"** → o banco de dados ainda não foi criado; a aba Regras só aparece depois disso.
- **"A senha do professor não funciona" / "Esqueci minha senha não envia e-mail"** → falta um dos dois passos de Authentication: ativar o provedor "E-mail/senha" e criar o usuário em Users, com o mesmo e-mail de `TEACHER_EMAIL`.
- **"Fiz uma alteração e não vejo efeito no site"** → normalmente é cache do navegador (Ctrl+F5, ou aba anônima). Para mudanças no `index.html`, confira se o commit foi enviado para `main`.
- **"Deu 404 depois de configurar o GitHub Pages"** → normal nos primeiros 1–2 minutos; aguarde e tente de novo.
- **"Não acho as presenças no Firestore"** → dentro do documento da turma, abra a subcoleção `presencas`. Se estiver vazia, ninguém marcou presença ainda.
- **"Preciso mesmo tornar o repositório público?"** → sim, para usar o GitHub Pages de graça. Os dados de alunos e presenças não ficam no GitHub, só no Firestore.
- **"Criei/excluí uma turma e a lista não atualiza sozinha"** → abra o Console do navegador (F12) e veja se há um erro do Firestore pedindo para criar um índice — comum quando falta o índice combinado (passo 11 da instalação).
- **"A lista de alunos não aparece mesmo com o código certo"** → confira se as regras publicadas são exatamente as da seção de instalação, incluindo onde cada função foi declarada. Já ocorreu, numa versão anterior deste projeto, de `turmaAtual`/`ehProfessorDaTurma`/`codigoAtivo` (hoje `salaValida`) serem declaradas fora do bloco `match /databases/{database}/documents { ... }` — o que faz toda regra que as usa falhar com "Invalid variable name: database" (visível passando o mouse sobre o indicador de erro na aba Regras). O Firestore trata esse erro como negar o acesso, mesmo para quem digitou o código certo. O bloco da seção de instalação já tem as funções no lugar correto.

### Renomear aluno

Presenças já registradas guardam o nome de quando foram marcadas (uma cópia de texto, não uma referência ao documento do aluno) — renomear um aluno não altera o nome em presenças antigas, só nas marcadas depois da mudança. Essa é a decisão de modelagem descrita em **[Modelo de dados](#modelo-de-dados)**.

## Créditos

Desenvolvido por **Prof. Douglas Camargo Carvalho**, docente do IFSul — Campus Sapiranga.

Contato: douglascamargo@ifsul.edu.br

Este projeto é de iniciativa docente e não substitui os sistemas institucionais do IFSul.
