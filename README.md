# Registro de Chamada

Sistema de registro de presença por turma: cada turma tem sua própria lista de alunos e seu próprio código do dia. Os alunos marcam a própria presença informando o código que o professor definiu para aquela turma; o professor tem uma área própria para criar turmas, cadastrar alunos, gerar o código do dia e consultar o histórico de chamadas.

O sistema roda como uma aplicação web estática — um único arquivo `index.html` — usando **Firebase** (Cloud Firestore + Authentication) como banco de dados e provedor de login, hospedado gratuitamente no **GitHub Pages**. A razão dessa escolha de arquitetura e suas implicações estão em **[Arquitetura e decisões técnicas](#arquitetura-e-decisões-técnicas)**.

⚠️ **Este sistema é um apoio ao professor — não substitui os sistemas institucionais.** A chamada oficial continua sendo registrada normalmente no SUAP (ou sistema equivalente da instituição). Antes de usar com dados reais de alunos, leia **[Privacidade e LGPD](#privacidade-e-lgpd)** e **[Limitações conhecidas](#limitações-conhecidas)**.

## Sumário

1. [Funcionalidades](#funcionalidades)
2. [Arquitetura e decisões técnicas](#arquitetura-e-decisões-técnicas)
3. [Segurança e controle de acesso](#segurança-e-controle-de-acesso)
4. [Privacidade e LGPD](#privacidade-e-lgpd)
5. [Limitações conhecidas](#limitações-conhecidas)
6. [Instalação e configuração](#instalação-e-configuração)
7. [Modelo de dados](#modelo-de-dados)
8. [Testes recomendados](#testes-recomendados)
9. [Problemas comuns](#problemas-comuns)
10. [Créditos](#créditos)

## Funcionalidades

- **Tela inicial**: lista as turmas cadastradas (de todos os professores juntas) e o nome do professor dono de cada uma. O aluno escolhe a turma direto, ou filtra por professor primeiro se houver turmas de mais de um. No primeiro acesso à Área do professor, definir o próprio nome de exibição é obrigatório antes de liberar o restante da interface.
- **Tela de chamada**: a lista de alunos e as presenças ficam bloqueadas até o aluno informar o código do dia daquela turma. Esse bloqueio é reforçado pelas regras do Firestore, não é só uma restrição de interface — os detalhes exatos de o que isso garante (e o que não garante) estão em **[Código do dia](#código-do-dia)**.
- **Área do professor** (login real — ver **[Autenticação e sessão](#autenticação-e-sessão)**): cada professor só vê e gerencia as turmas que ele mesmo criou; permite:
  - criar turmas (campos **Turma / Ano / Disciplina**, combinados automaticamente no nome, ex.: "INF2M 2026 - Banco de Dados") com lista opcional de alunos colada de uma vez, e um botão de dica explicando como exportar a relação de alunos pelo SUAP (o passo de usar uma IA externa para formatar essa lista só é exibido para a conta master, por cautela quanto a enviar dados de alunos a serviços de terceiros);
  - gerenciar uma turma: editar o nome, gerar e salvar o código do dia com uma duração escolhida no momento (15 min, 1h, 2h ou 3h), adicionar/editar/remover alunos, e excluir a turma inteira (com confirmação e senha do professor, apagando alunos e histórico de presenças junto);
  - trocar a própria senha a qualquer momento;
  - consultar o **histórico de chamadas** da turma — presentes e ausentes por dia, com exportação em `.xlsx`. Essa tela só é exibida, na interface, ao professor dono da turma ou à conta master; o que as regras do Firestore efetivamente permitem ler sobre esses mesmos dados está descrito em **[Isolamento entre professores](#isolamento-entre-professores)**;
  - **(só a conta master)** criar login de outros professores direto pelo site, sem precisar do Firebase Console — ver **[Adicionar mais professores](#adicionar-mais-professores-no-mesmo-sitebanco-de-dados)**.
- **Modo professor**: com login do dono da turma (ou da conta master) ativo, permite marcar a presença de qualquer aluno diretamente, sem o código do dia — útil para chamada oral ou aluno sem celular. Nesse modo também não vale a trava de "um aparelho por aluno". Desfazer uma presença sempre exige a senha do professor de novo, mesmo com o Modo professor ativo, para que outra pessoa no mesmo computador não consiga desfazer sem a senha.
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
- a conta com privilégios administrativos amplos (a "conta master") é identificada hoje por comparação de e-mail, e não por um mecanismo mais robusto como UID ou Custom Claims (ver **[Conta master](#conta-master)**).

**Simplicidade não é o mesmo que segurança.** As duas coisas são avaliadas separadamente ao longo deste documento, em especial em **[Segurança e controle de acesso](#segurança-e-controle-de-acesso)**.

## Segurança e controle de acesso

Esta seção separa, para cada mecanismo do sistema, o que é **proteção de interface** (o `index.html` esconde ou bloqueia uma ação, mas o dado em si pode estar acessível a quem consulta o Firestore diretamente) do que é **segurança aplicada pelas regras do Firestore** (avaliada pelo servidor do Google, independente do que o navegador de quem pede faz ou deixa de fazer). Tratar as duas coisas como equivalentes é o principal jeito de criar uma falsa sensação de segurança — por isso a distinção é explícita em cada item abaixo.

### `firebaseConfig` não é uma credencial

O bloco `firebaseConfig`, visível no código-fonte público do site, identifica **qual** projeto Firebase o app usa — não é, por si só, uma credencial de acesso; isso é assim por design do Firebase, documentado pelo próprio Google. **Isso não significa que o projeto esteja automaticamente seguro.** Quem efetivamente decide quem pode ler ou escrever cada dado são:

- as **regras do Firestore** (o bloco publicado no passo de configuração do banco, seção [Instalação e configuração](#instalação-e-configuração)) — controlam leitura/escrita de cada documento;
- o **Firebase Authentication** — controla quem consegue provar ser um e-mail/senha cadastrado.

A segurança do sistema depende inteiramente dessas duas peças estarem configuradas corretamente, não de o `firebaseConfig` estar visível ou não. Consequência prática: nunca coloque dados pessoais de alunos diretamente no código-fonte do `index.html`; cadastre sempre pela Área do professor, que grava no Firestore.

### Código do dia

O código do dia deve ser entendido como uma **credencial compartilhada da turma** — não como autenticação individual de cada aluno, e não como prova de presença física de quem o utiliza.

- É salvo em `turmas/{turmaId}.codigoDoDia` como texto simples (não é um hash). A coleção `turmas` tem `allow read: if true` — necessário para a tela inicial listar as turmas antes de qualquer login —, o que também significa que **qualquer pessoa que consulte o Firestore diretamente (sem passar pela interface) consegue ler o código atual de qualquer turma**, mesmo sem ter aberto a tela de chamada. Esta é uma limitação conhecida da modelagem atual, não um comportamento acidental.
- A verificação "o código digitado é igual ao `codigoDoDia`" acontece no JavaScript do navegador e **também** é reconferida pelo servidor ao criar uma presença (função `codigoAtivo()` nas regras, que compara o `codigoUsado` enviado com o `codigoDoDia` real da turma e confirma se ainda está dentro do prazo escolhido). Essa parte específica não é apenas proteção de interface.
- A leitura da lista de alunos e das presenças de uma turma exige, de fato, o código ativo dela — a regra `allow read: if ehProfessorDaTurma(turmaId) || codigoAtivo(turmaId)` é aplicada pelo servidor do Firestore.
- **O que isso não garante**: qualquer pessoa que saiba o código — por tê-lo recebido de outro aluno, por exemplo — consegue ler os dados da turma dentro do prazo de validade, mesmo sem estar fisicamente na sala. O código autentica "conhecer o código daquela turma", não "estar presente".

### Identificador do aparelho

A trava de "um aparelho, um aluno, por dia" funciona assim:

- O identificador é um UUID gerado no navegador e guardado em `localStorage`. Ele não identifica a pessoa — identifica o navegador/aparelho, e permanece o mesmo só enquanto ninguém limpar os dados do site.
- Ele pode ser contornado por qualquer pessoa: limpar o `localStorage`, usar uma aba anônima ou outro navegador gera um identificador novo, liberando uma nova marcação no mesmo aparelho físico. Essa limitação é conhecida e aceita — o objetivo da trava nunca foi impedir fraude deliberada, e sim evitar o caso comum de duplo clique ou de um colega tentar marcar por outro no mesmo celular sem intenção.
- **O que é garantido pelo Firestore**: o documento de presença usa um ID determinístico (`data_idDoAparelho`), e a regra `allow update: if false` impede que esse mesmo documento seja reescrito. Ou seja: com o **mesmo** identificador, no mesmo dia, na mesma turma, uma segunda tentativa de marcação é recusada pelo banco, não só escondida pela interface. Com um identificador diferente, essa trava específica não se aplica.
- O campo `maquina` não tem seu valor validado pelas regras — o Firestore não tem como confirmar que aquele valor corresponde de fato ao identificador salvo no `localStorage` de quem está escrevendo; é um dado informado pelo próprio navegador.
- Depois que o professor desfaz uma presença, o mesmo identificador de aparelho fica livre para marcar de novo (o documento antigo foi apagado, então uma nova escrita com o mesmo ID é uma criação, não uma atualização bloqueada).

### Criação de presença sem estar autenticado

Sem estar logado, alguém só consegue criar uma presença informando `nome`, `data`, `horario`, `maquina` **e** um `codigoUsado` igual ao `codigoDoDia` real da turma, dentro do prazo de validade daquele código (`codigoAtivo()`) — isso é verificado pelo servidor, não só pela interface. Dentro dessa exigência, ainda existem lacunas conhecidas:

- **Não é verificado** se `nome` corresponde a um aluno de fato cadastrado na turma — é possível registrar presença com um nome inventado, desde que se conheça o código ativo.
- **Não é verificado** se `data`/`horario` correspondem ao momento real — quem conhece o código ativo pode, em tese, enviar uma presença com uma data diferente (retroativa ou futura), dentro da janela em que aquele código é válido.
- **É verificado e bloqueado**: reescrever a mesma presença de um mesmo aparelho no mesmo dia, e criar uma presença sem um código correto e ativo (a menos que quem estiver criando seja o professor dono da turma, autenticado).

O risco prático dessas lacunas de `nome`/`data`/`horario` é limitado, já que depende de conhecer o código ativo da turma — mas estão documentadas aqui deliberadamente, para não sugerir uma proteção maior do que a implementação atual entrega.

### Isolamento entre professores

- As regras do Firestore exigem estar autenticado **e** que o `professorUid` da turma seja igual ao UID de quem está logado (ou que seja a conta master) para: criar/editar/apagar a turma, criar/editar/apagar alunos, mudar o código do dia, ou apagar uma presença. Um professor não consegue alterar, apagar ou gerenciar os alunos de uma turma de outro professor — isso é garantido pelo Firestore, e não apenas pela Área do professor filtrar a lista para mostrar só as próprias turmas.
- A leitura de alunos/presenças de uma turma que não é sua também exige o código ativo dela (`codigoAtivo()`) — um professor não vê automaticamente os dados de turmas de outros professores só por estar autenticado; precisaria saber o código do dia daquela turma, como qualquer outra pessoa.
- Dentro da própria turma, o dono (ou a conta master) sempre pode marcar presença de qualquer aluno via Modo professor, sem precisar do código — esse é o comportamento pretendido dessa funcionalidade, não uma falha de isolamento.
- A conta master é a única exceção deliberada nas regras: tem acesso de leitura/escrita a todas as turmas, alunos e presenças de todos os professores, por design, sem depender do código do dia.

### Conta master

`TEACHER_EMAIL` (em `index.html`) e o e-mail definido dentro de `isMaster()` (nas regras do Firestore) são **duas configurações independentes**, em lugares diferentes, e precisam ser editadas juntas para o mesmo e-mail:

- `TEACHER_EMAIL` roda no navegador e controla apenas comportamento de **interface**: preenche o campo de e-mail do formulário de login por padrão, e decide se a interface mostra os painéis de conta master (ex.: "Painel admin — criar professor").
- `isMaster()` roda no servidor do Firestore e é quem de fato **concede** a permissão de acessar/alterar turmas de qualquer professor.

Se só uma das duas for trocada, o resultado é inconsistente:
- trocar `TEACHER_EMAIL` sem trocar `isMaster()` faz a interface mostrar os painéis de master para uma conta que não tem a permissão real — qualquer ação de master de fato é negada pelo Firestore;
- trocar `isMaster()` sem trocar `TEACHER_EMAIL` dá a permissão real a uma conta que a interface continua tratando como comum, e a conta antiga continua vendo os painéis sem ter mais a permissão.

**Nota de arquitetura**: nesta versão, a conta master é identificada por comparação direta de e-mail. É uma simplificação adequada para uma instalação de escala pequena e individual, mas tem limitações: comparação de string é sensível a erro de digitação, e o mecanismo muda pouco mesmo se o e-mail da conta for trocado no Firebase sem atualizar as duas configurações. Uma arquitetura institucional de maior escala tende a identificar contas privilegiadas por **UID fixo** ou por **Custom Claims** do Firebase Authentication, que não dependem de comparar e-mails em dois lugares do código. Isso não está implementado nesta versão — é registrado aqui como um ponto de evolução, não como algo pendente de correção.

### Criação de novos professores

O botão "Criar professor" usa `createUserWithEmailAndPassword` do Firebase Authentication, chamado direto do navegador — consequência direta de não haver backend nesta arquitetura (ver **[Arquitetura e decisões técnicas](#arquitetura-e-decisões-técnicas)**). Isso só é possível porque o provedor "E-mail/senha" está ativado no projeto; essa mesma possibilidade já existe de forma independente do painel admin, já que qualquer requisição com o `apiKey` público do projeto pode pedir a criação de conta enquanto esse provedor estiver ativo — o painel admin apenas torna essa operação mais conveniente para a conta master, sem ser o que a habilita.

Remover a conta de um professor, hoje, só é possível pelo Firebase Console (Authentication → Users) — o painel admin cria contas, mas não remove. Uma arquitetura com backend (por exemplo, Cloud Functions usando o Admin SDK) permitiria centralizar essa administração pelo próprio site, incluindo a remoção. Isso não torna a abordagem atual incorreta; é a consequência coerente de manter o projeto sem servidor próprio.

### Autenticação e sessão

- **E-mail e senha**: a tela de login pede os dois. Qualquer conta criada em Authentication → Users nesse projeto Firebase consegue entrar como professor — o campo de e-mail já vem preenchido com `TEACHER_EMAIL` por padrão, mas pode ser trocado por outro e-mail cadastrado.
- A senha nunca fica no `index.html` nem em qualquer parte do código-fonte do site — apenas o Firebase Authentication a valida.
- **Esqueci minha senha**: envia um e-mail de redefinição automaticamente para o e-mail informado, usando o próprio mecanismo do Firebase — funciona desde que o provedor "E-mail/senha" esteja configurado.
- **Trocar a senha**: disponível a qualquer momento dentro da Área do professor.
- **Persistência de sessão**: o código chama `setPersistence(auth, browserSessionPersistence)`, o modo de persistência do Firebase Authentication ligado ao `sessionStorage` do navegador — dura só a aba atual. Recarregar a página mantém o login; fechar a aba (ou o navegador) encerra a sessão. Isso é adequado para um computador compartilhado em sala de aula, desde que a aba seja de fato fechada entre um professor e outro.

## Privacidade e LGPD

Este sistema trata dados pessoais de estudantes — a LGPD (Lei Geral de Proteção de Dados) trata nome e frequência escolar como dados pessoais. Pontos relevantes para quem for usar ou avaliar este projeto:

- **Dados tratados**: nome do aluno, nome da turma, e registros de presença (nome, data, horário e um identificador de dispositivo). Não são coletados e-mail, matrícula, CPF ou qualquer outro dado do aluno.
- **Onde ficam armazenados**: no Cloud Firestore, dentro do projeto Firebase de quem publicou aquela cópia do sistema — ver **[Modelo de dados](#modelo-de-dados)**.
- **Finalidade**: apoio operacional ao controle de chamada do professor. Este sistema não substitui os sistemas institucionais de controle acadêmico — a chamada oficial continua sendo registrada no SUAP (ou equivalente), sempre após validação do professor. A marcação depende do próprio aluno, sem verificação de identidade (ver **[Identificador do aparelho](#identificador-do-aparelho)** e **[Código do dia](#código-do-dia)**) — por isso o professor não deve tratar os registros deste sistema, isoladamente, como prova definitiva de frequência.
- **Quem tem acesso**: na interface, o professor dono da turma e a conta master. Pelas regras do Firestore, a leitura de alunos/presenças de uma turma também é liberada a qualquer pessoa que apresente o código do dia dentro do prazo de validade — ver **[Código do dia](#código-do-dia)** para o detalhamento técnico completo; isso é mais amplo do que "só o professor e os alunos daquela turma".
- **Retenção**: presenças marcadas a partir desta versão são apagadas automaticamente cerca de 72h após serem criadas, na próxima vez em que algum professor acessar a Área do professor — ver **[Retenção de dados](#retenção-de-dados)** para as limitações dessa implementação. Turmas, alunos e presenças anteriores a esta versão não têm exclusão automática. Excluir uma turma remove permanentemente seus alunos e presenças, de forma irreversível.
- **Transparência com o professor**: no primeiro acesso à Área do professor, o sistema exibe um aviso obrigatório resumindo esses pontos, que só é dispensado depois de o professor clicar em "Concordo"; essa confirmação é registrada em `acordosProfessor/{uid}` (ver **[Modelo de dados](#modelo-de-dados)**).
- **Transparência com o aluno**: na tela de chamada, o link "ℹ️ Sobre seus dados" abre um aviso curto explicando o que é salvo e que o sistema não substitui o SUAP, com um canal para pedir acesso, correção ou exclusão dos próprios dados — um link de e-mail pré-preenchido para o professor daquela turma (`professorEmail`). Diferente do aviso do professor, este não é obrigatório: o aluno precisa clicar para ver.
- **Responsabilidade institucional**: cabe ao professor e/ou à instituição que utiliza este sistema observar as próprias políticas de proteção de dados e a legislação aplicável, incluindo, quando pertinente, informar os alunos sobre esse tratamento complementar de dados.

**Este texto não constitui parecer jurídico** nem certificação de conformidade com a LGPD. É uma descrição técnica honesta do que o sistema efetivamente faz com os dados, para que quem for utilizá-lo possa avaliar se atende às próprias obrigações legais e institucionais, e tomar as providências adicionais que considerar necessárias — por exemplo, um termo próprio para os alunos, ou consulta ao setor responsável por proteção de dados da instituição.

## Limitações conhecidas

Resumo das limitações técnicas já detalhadas nas seções acima — nenhuma delas é escondida ou "compensada" pela interface:

- O identificador de dispositivo é forjável (limpar `localStorage`, aba anônima, outro navegador) — ver **[Identificador do aparelho](#identificador-do-aparelho)**.
- O código do dia é uma credencial compartilhada da turma, não uma autenticação individual nem prova de presença física — ver **[Código do dia](#código-do-dia)**.
- Os campos `nome`, `data` e `horario` de uma presença não são verificados contra o cadastro real de alunos nem contra o relógio do servidor — ver **[Criação de presença sem estar autenticado](#criação-de-presença-sem-estar-autenticado)**.
- A retenção de 72h das presenças depende de algum professor acessar a Área do professor — não é um processo contínuo em segundo plano — ver **[Retenção de dados](#retenção-de-dados)**.
- Não há backend próprio: a criação de contas de professor é feita direto do navegador, e a remoção de contas ainda depende do Firebase Console — ver **[Criação de novos professores](#criação-de-novos-professores)**.
- A conta master é identificada por e-mail, não por UID ou Custom Claims — ver **[Conta master](#conta-master)**.
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
     function isMaster() {
       return request.auth != null && request.auth.token.email == 'douglascamargo@ifsul.edu.br';
     }

     match /databases/{database}/documents {
       function turmaAtual(turmaId) {
         return get(/databases/$(database)/documents/turmas/$(turmaId)).data;
       }

       function ehProfessorDaTurma(turmaId) {
         return request.auth != null
                && (isMaster() || turmaAtual(turmaId).professorUid == request.auth.uid);
       }

       function codigoAtivo(turmaId) {
         let t = turmaAtual(turmaId);
         return t.codigoDoDia is string && t.codigoDoDia != ''
                && t.get('codigoDefinidoEm', null) != null
                && request.time < t.codigoDefinidoEm + duration.value(t.get('codigoDuracaoMin', 180), 'm');
       }

       match /turmas/{turmaId} {
         allow read: if true;
         allow create: if request.auth != null
                       && request.resource.data.keys().hasAll(['nome', 'professorUid'])
                       && request.resource.data.nome is string
                       && request.resource.data.professorUid == request.auth.uid;
         allow update: if request.auth != null
                       && (
                            isMaster()
                            || resource.data.professorUid == request.auth.uid
                            || (!('professorUid' in resource.data) && request.resource.data.professorUid == request.auth.uid)
                          )
                       && request.resource.data.diff(resource.data).affectedKeys()
                       .hasOnly(['codigoDoDia', 'codigoDefinidoEm', 'codigoDuracaoMin', 'nome', 'professorUid', 'professorEmail', 'professorNome'])
                       && (!request.resource.data.diff(resource.data).affectedKeys().hasAny(['nome'])
                           || request.resource.data.nome is string)
                       && (!request.resource.data.diff(resource.data).affectedKeys().hasAny(['codigoDuracaoMin'])
                           || request.resource.data.codigoDuracaoMin is int);
         allow delete: if request.auth != null && (isMaster() || resource.data.professorUid == request.auth.uid);

         match /alunos/{alunoId} {
           allow read: if ehProfessorDaTurma(turmaId) || codigoAtivo(turmaId);
           allow create: if ehProfessorDaTurma(turmaId)
                         && request.resource.data.keys().hasAll(['nome'])
                         && request.resource.data.nome is string;
           allow update: if ehProfessorDaTurma(turmaId)
                         && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['nome'])
                         && request.resource.data.nome is string;
           allow delete: if ehProfessorDaTurma(turmaId);
         }

         match /presencas/{presencaId} {
           allow read: if ehProfessorDaTurma(turmaId) || codigoAtivo(turmaId);
           allow create: if request.resource.data.keys().hasAll(['nome', 'data', 'horario', 'maquina'])
                         && request.resource.data.nome is string
                         && request.resource.data.data is string
                         && request.resource.data.horario is string
                         && request.resource.data.maquina is string
                         && (
                              ehProfessorDaTurma(turmaId)
                              || (
                                   request.resource.data.keys().hasAll(['codigoUsado'])
                                   && request.resource.data.codigoUsado is string
                                   && codigoAtivo(turmaId)
                                   && request.resource.data.codigoUsado == turmaAtual(turmaId).codigoDoDia
                                 )
                            );
           allow update: if false;
           allow delete: if ehProfessorDaTurma(turmaId);
         }
       }

       match /acordosProfessor/{uid} {
         allow read: if request.auth != null && (request.auth.uid == uid || isMaster());
         allow write: if request.auth != null && request.auth.uid == uid;
       }
     }
   }
   ```

   A função `isMaster()` dá acesso total (editar/apagar qualquer turma, aluno ou presença) para a conta `douglascamargo@ifsul.edu.br`, além do próprio dono de cada turma. Para trocar quem é a conta master, edite esse e-mail dentro de `isMaster()` — e veja **[Conta master](#conta-master)** antes de fazer isso.

   Clique em **"Publicar"**. Com essas regras:
   - criar turma, gerenciar alunos, mudar o código do dia ou apagar uma presença exige estar logado como o professor dono da turma (ou a conta master);
   - a leitura de alunos e presenças de uma turma é liberada para o professor dono/master, ou para quem informar o código do dia dentro do prazo de validade escolhido — ver **[Código do dia](#código-do-dia)** para o que isso garante de fato;
   - `acordosProfessor/{uid}` guarda o registro de que aquele professor confirmou os "Avisos importantes" — cada um só lê/escreve o próprio registro; a conta master também pode ler todos.

   > Sempre que o formato dos dados mudar, as regras precisam ser atualizadas — este README sempre tem o bloco completo mais recente para copiar e colar.

   > **Retenção de 72h nas presenças** já é feita pelo próprio `index.html`, sem precisar configurar nada extra no Console — ver **[Retenção de dados](#retenção-de-dados)**.

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

> **Sobre remover um professor**: hoje só é possível pelo Firebase Console (Authentication → Users) — ver **[Criação de novos professores](#criação-de-novos-professores)** para o motivo técnico.

## Modelo de dados

Tudo fica no Cloud Firestore, no projeto Firebase de cada instalação, organizado assim:

```
turmas/{turmaId}
  nome, codigoDoDia, codigoDefinidoEm, codigoDuracaoMin, professorUid, professorEmail, professorNome
  alunos/{alunoId}
    nome
  presencas/{presencaId}
    nome, data, horario, maquina, codigoUsado, expiraEm
acordosProfessor/{uid}
  avisosAceitosEm, email
```

- `nome` (em `alunos`) e `nome` (em `presencas`) são independentes por decisão de modelagem: a presença guarda uma **cópia** do nome no momento em que foi marcada, não uma referência ao documento do aluno. Isso preserva o registro histórico como estava no momento da chamada — renomear um aluno depois não altera presenças já registradas, só as futuras. Ver **[Renomear aluno](#renomear-aluno)**.
- `maquina` guarda o identificador do aparelho salvo no `localStorage` de quem marcou — ver **[Identificador do aparelho](#identificador-do-aparelho)**.
- `codigoDuracaoMin` guarda por quantos minutos aquele código vale (15, 60, 120 ou 180), escolhido no botão usado para gerá-lo.
- `expiraEm` guarda até quando aquela presença deve existir (72h depois de criada) — usado pela limpeza automática, ver **[Retenção de dados](#retenção-de-dados)**.
- `acordosProfessor/{uid}` guarda quando aquele professor confirmou os "Avisos importantes" — um documento por professor; só ele (e a conta master) consegue ler o próprio.

Visível em console.firebase.google.com → projeto → Firestore Database → aba "Dados". Nada disso fica salvo no GitHub — o GitHub só guarda o código do site, nunca os dados de alunos ou presenças.

> **Sobre os limites gratuitos do Firestore**: o plano Spark inclui uma cota diária de leituras/escritas e armazenamento suficiente para o uso normal de algumas turmas fazendo chamada por semana — os números exatos e as condições são definidos pelo Google e podem mudar; consulte a [documentação/preços oficiais do Firebase](https://firebase.google.com/pricing) antes de assumir qualquer limite como garantido. Turmas e alunos não são apagados automaticamente — permanecem até alguém apagar manualmente. As presenças têm uma limpeza automática própria, descrita abaixo.

### Retenção de dados

Cada presença criada a partir desta versão guarda um campo `expiraEm` com a data/hora 72 horas depois de ter sido marcada.

O mecanismo "nativo" para apagar isso automaticamente em segundo plano seria uma **política de TTL** do Firestore — mas essa funcionalidade exige que o projeto esteja no plano Blaze (pago por uso, com uma conta de faturamento vinculada); no plano Spark, o Google recusa a criação da política (`403: ... has billing disabled`). Para manter o projeto sem depender de faturamento, a retenção foi implementada de outra forma, direto no `index.html`:

- toda vez que um professor entra na Área do professor, o app executa `cleanupExpiredPresencas()`: para cada turma dele (ou de todas, se for a conta master), busca as presenças com `expiraEm` já vencido e apaga em lote;
- **isso não é um processo automático rodando 24 horas por dia** — só é executado nos momentos em que algum professor efetivamente abre a Área do professor. Numa turma cujo professor não acessa o sistema por um período longo, presenças vencidas continuam existindo até o próximo acesso dele (ou da conta master, que limpa as turmas de todos ao entrar);
- consequentemente, a exclusão **não ocorre necessariamente exatamente 72 horas** depois da criação — pode levar mais tempo, dependendo de quando alguém acessa a Área do professor;
- não exige Cloud Functions nem faturamento, e usa apenas operações normais de leitura/escrita do Firestore, dentro da mesma regra `allow delete: if ehProfessorDaTurma(turmaId)` já publicada;
- não apaga `alunos` nem `turmas` — só o histórico de presença;
- presenças marcadas **antes** desta atualização não têm o campo `expiraEm` e por isso não são apagadas por essa limpeza.

Para reter por mais ou menos tempo, a constante `PRESENCA_RETENTION_MS` no `index.html` controla o valor gravado em `expiraEm`. Se o projeto migrar para o plano Blaze por outro motivo no futuro, a política de TTL nativa do Firestore (grupo de coleções `presencas`, campo `expiraEm`) passa a ser uma alternativa mais robusta a essa limpeza dependente de login.

## Testes recomendados

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
13. Gerar um código de 15 min e esperar passar o prazo → a leitura de alunos/presenças da turma volta a ser negada para quem só tem o código, mesmo digitando o código certo (porque `codigoAtivo()` deixou de ser verdadeiro).
14. Primeiro login de um professor novo → o modal "Avisos importantes" abre sozinho e não fecha clicando fora nem com Esc, só pelo botão "Concordo"; um novo login depois disso não deve mais mostrar o modal forçado.

Nem tudo nesta lista tem garantia absoluta — onde a limitação é conhecida (ex.: identificador de aparelho forjável, `data` não verificada), isso está descrito em **[Limitações conhecidas](#limitações-conhecidas)**, para não prometer uma proteção que a implementação atual não entrega.

## Problemas comuns

- **"Não acho a aba Regras no Firestore"** → o banco de dados ainda não foi criado; a aba Regras só aparece depois disso.
- **"A senha do professor não funciona" / "Esqueci minha senha não envia e-mail"** → falta um dos dois passos de Authentication: ativar o provedor "E-mail/senha" e criar o usuário em Users, com o mesmo e-mail de `TEACHER_EMAIL`.
- **"Fiz uma alteração e não vejo efeito no site"** → normalmente é cache do navegador (Ctrl+F5, ou aba anônima). Para mudanças no `index.html`, confira se o commit foi enviado para `main`.
- **"Deu 404 depois de configurar o GitHub Pages"** → normal nos primeiros 1–2 minutos; aguarde e tente de novo.
- **"Não acho as presenças no Firestore"** → dentro do documento da turma, abra a subcoleção `presencas`. Se estiver vazia, ninguém marcou presença ainda.
- **"Preciso mesmo tornar o repositório público?"** → sim, para usar o GitHub Pages de graça. Os dados de alunos e presenças não ficam no GitHub, só no Firestore.
- **"Criei/excluí uma turma e a lista não atualiza sozinha"** → abra o Console do navegador (F12) e veja se há um erro do Firestore pedindo para criar um índice — comum quando falta o índice combinado (passo 11 da instalação).
- **"A lista de alunos não aparece mesmo com o código certo"** → confira se as regras publicadas são exatamente as da seção de instalação, incluindo onde cada função foi declarada. Já ocorreu, numa versão anterior deste projeto, de `turmaAtual`/`ehProfessorDaTurma`/`codigoAtivo` serem declaradas fora do bloco `match /databases/{database}/documents { ... }` — o que faz toda regra que as usa falhar com "Invalid variable name: database" (visível passando o mouse sobre o indicador de erro na aba Regras). O Firestore trata esse erro como negar o acesso, mesmo para quem digitou o código certo. O bloco da seção de instalação já tem as funções no lugar correto.

### Renomear aluno

Presenças já registradas guardam o nome de quando foram marcadas (uma cópia de texto, não uma referência ao documento do aluno) — renomear um aluno não altera o nome em presenças antigas, só nas marcadas depois da mudança. Essa é a decisão de modelagem descrita em **[Modelo de dados](#modelo-de-dados)**.

## Créditos

Desenvolvido por **Prof. Douglas Camargo Carvalho**, docente do IFSul — Campus Sapiranga.

Contato: douglascamargo@ifsul.edu.br

Este projeto é de iniciativa docente e não substitui os sistemas institucionais do IFSul.
