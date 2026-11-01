# Especificação Funcional do SIGA Universitário

Este documento especifica todos os módulos e requisitos funcionais essenciais para o MVP (Minimum Viable Product) do Sistema Integrado de Gestão Acadêmica (SIGA), dimensionado para suportar mais de 20.000 estudantes universitários ativos com isolamento de perfis, integridade transacional e controle de concorrência.

---

## 1. Módulo de Autenticação, Identidade e Segurança

Responsável pelo controle de acesso, persistência de credenciais mínimas e desacoplamento total entre a conta e os perfis de atuação.

- **RF-01 - Autenticação Centralizada:**
  - Login por identificador único (Email institucional, Número de Matrícula/Processo ou Bilhete de Identidade) e senha criptografada (Argon2 ou bcrypt).
  - Emissão de Access Token (JWT com vida útil de 15 minutos) mantido em memória no frontend.
  - Emissão de Refresh Token rotativo (validade de 7 dias) persistido exclusivamente em cookie seguro (`HttpOnly`, `SameSite=Lax`, `Secure`).
  - Endpoint de renovação (`/auth/refresh`) e encerramento de sessão (`/auth/logout`) com invalidação de cookie.

- **RF-02 - Troca Dinâmica de Contexto de Perfil:**
  - Capacidade de um utilizador autenticado alternar entre perfis vinculados à sua conta (ex.: `DOCENTE` e `ESTUDANTE_POS_GRADUACAO`) sem necessidade de novo login.
  - Injeção do papel ativo no cabeçalho das requisições subsequentes para validação estrita no backend.

- **RF-03 - Recuperação de Senha Segura:**
  - Solicitação de redefinição com envio assíncrono de token de uso único (expiração em 30 minutos) disparado via fila de mensageria (BullMQ).

- **RF-04 - Trilha de Auditoria Transacional Imutável (`AuditLog`):**
  - Interceptação obrigatória de qualquer operação de escrita (`POST`, `PUT`, `PATCH`, `DELETE`) em notas, assiduidade, matrículas e estados financeiros.
  - Gravação compulsória de: `userId`, `perfilUtilizado`, `ip`, `endpoint`, `timestamp`, `dadosAntigos` (JSON) e `dadosNovos` (JSON).

---

## 2. Módulo de Estrutura Curricular e Cadastros Base

Responsável pela definição das entidades organizacionais, grelhas curriculares e calendários institucionais.

- **RF-05 - Gestão de Unidades Orgânicas e Cursos:**
  - Cadastro de Faculdades/Institutos, Departamentos e Cursos (Licenciatura, Mestrado, etc.).
  - Definição de regime acadêmico (Semestral / Anual) e total de créditos curriculares (ECTS ou equivalente).

- **RF-06 - Grelha Curricular (Matriz) e Precedências:**
  - Cadastro de planos de estudo versionados com associação de disciplinas por ano curricular (1º ao 5º ano) e semestre letivo.
  - Definição de carga horária (Teórica, Prática e Laboratorial) e créditos por disciplina.
  - Cadastro de regras de precedência (pré-requisitos obrigatórios para inscrição em cadeiras avançadas).

- **RF-07 - Gestão de Períodos Letivos:**
  - Abertura, configuração e encerramento de Anos Acadêmicos e Semestres.
  - Definição de marcos temporais com travas automáticas do sistema:
    - Janela de confirmação de matrícula / inscrição em turmas.
    - Janela de aulas regulares.
    - Prazo limite para lançamento e submissão de pautas ordinárias.
    - Prazo limite para exames de recurso e melhoria de nota.

- **RF-08 - Planejamento e Abertura de Turmas:**
  - Criação de turmas por disciplina, definindo código (ex.: "T1", "PL2"), turno (Manhã, Tarde, Pós-Laboral), limite máximo de vagas e cronograma de aulas (dias e horários).
  - Vinculação do docente regente responsável pela turma.

---

## 3. Módulo de Inscrição em Cadeiras / Matrícula Online

Módulo crítico projetado para suportar altíssima concorrência simultânea sem inconsistência de banco.

- **RF-09 - Painel de Seleção de Turmas pelo Estudante:**
  - Exibição apenas das disciplinas elegíveis de acordo com o ano curricular e precedências cumpridas.
  - Seleção dinâmica de horários com verificação no cliente e no servidor de choques de horário entre disciplinas.
  - Trava de limite de créditos máximos permitidos por período.

- **RF-10 - Motor de Reserva Atômica de Vagas (Redis + BullMQ):**
  - Bloqueio imediato da vaga em memória através de scripts atômicos Lua no Redis (`DECRBY`), prevenindo _overbooking_ em milissegundos.
  - Rejeição imediata com código HTTP `409 Conflict` caso as vagas da turma estejam esgotadas.
  - Disparo do payload de inscrição para fila assíncrona (BullMQ) para persistência final na tabela `Enrollment` do PostgreSQL sem gargalo de conexões.

- **RF-11 - Emissão de Comprovativo de Inscrição:**
  - Geração assíncrona de PDF com disciplinas inscritas, horários, salas e código verificador (hash SHA-256), armazenado no MinIO.

---

## 4. Módulo do Docente (Diário de Turma & Pautas)

Interface do professor para gestão de sala de aula e formalização de avaliações acadêmicas.

- **RF-12 - Painel de Turmas do Docente:**
  - Listagem das turmas ativas sob responsabilidade do docente no período letivo corrente.
  - Acesso à pauta de chamada com lista nominal, fotos e número de processo dos estudantes regularmente inscritos.

- **RF-13 - Controle de Assiduidade (Faltas):**
  - Registro de presenças e ausências por data/aula letiva.
  - Totalizador percentual automático de faltas por estudante, com alerta visual de iminência de reprovação por falta (ex.: > 25% de ausências injustificadas).

- **RF-14 - Lançamento de Avaliações Contínuas e Exames:**
  - Lançamento de notas na escala padrão de 0 a 20 valores:
    - Parcelares / Frequências / Trabalhos Práticos.
    - Exame Normal / Primeira Época.
    - Exame de Recurso / Segunda Época.
    - Exame de Melhoria de Nota.
  - Bloqueio compulsório de edição caso o período esteja fora do prazo limite estabelecido no calendário acadêmico.

- **RF-15 - Cálculo de Médias e Fechamento de Pauta:**
  - Aplicação automática da fórmula de ponderação da disciplina.
  - Atribuição de estados acadêmicos regulamentares:
    - `Aprovado` (Nota $\ge$ 10 valores).
    - `Admitido ao Recurso` (Nota de frequência suficiente para época de recurso).
    - `Reprovado por Nota` (Nota final < 10 valores após recurso).
    - `Reprovado por Falta` (Excesso de faltas injustificadas).
  - Submissão e congelamento da pauta com assinatura digital simples/registro de envio.
  - Pauta congelada só pode ser retificada mediante solicitação formal via Secretaria com registro em auditoria.

---

## 5. Módulo do Estudante (Portal Discente)

Ambiente de autoatendimento para acompanhamento acadêmico.

- **RF-16 - Dashboard do Estudante:**
  - Resumo das disciplinas do semestre corrente com horários de aula e salas atribuídas.
  - Mural institucional com notificações em tempo real (Socket.IO).

- **RF-17 - Consulta de Notas e Pautas Parciais:**
  - Visualização em tempo real das notas parcelares lançadas pelo docente e histórico de faltas por cadeira.
  - Consulta do resultado final após a publicação oficial da pauta pela coordenação/secretaria.

- **RF-18 - Acompanhamento da Grelha Curricular (Histórico Acadêmico):**
  - Mapa visual do curso indicando cadeiras concluídas (com nota e ano de conclusão), cadeiras em curso e cadeiras em atraso/pendentes.
  - Cálculo dinâmico da Média Ponderada Acumulada / Coeficiente de Rendimento.

- **RF-19 - Repositório de Documentos:**
  - Download direto de comprovativos de matrícula, pautas individuais e declarações emitidas pela instituição.

---

## 6. Módulo Financeiro Básico & Gestão de Propinas

Controle de cobranças essenciais para regularização do vínculo acadêmico.

- **RF-20 - Tabela de Emolumentos e Taxas Institucionais:**
  - Parametrização de valores por curso e ano para: Matrícula, Inscrição Semestral, Propinas Mensais, Taxa de Exame de Recurso e Emissão de Declarações.

- **RF-21 - Conta Corrente do Estudante:**
  - Geração mensal e automatizada das obrigações financeiras (débitos de propinas) com definição de data de vencimento e aplicação de multas por mora.

- **RF-22 - Submissão e Validação de Pagamentos (Borderôs):**
  - Upload de comprovativos de depósito/transferência bancária ou borderô pelo estudante direto para o bucket do MinIO.
  - Painel administrativo da Tesouraria/Financeiro para conferência, confirmação do valor recebido e baixa no sistema.

- **RF-23 - Travas Financeiras Acadêmicas:**
  - Bloqueio automatizado de inscrição em cadeiras ou de registro em exames de recurso para estudantes em situação de incumprimento financeiro, conforme regulamento institucional.

---

## 7. Módulo da Secretaria Acadêmica e Emissão Documental

Núcleo de controle de registros definitivos, prontuários e certidões oficiais.

- **RF-24 - Prontuário Geral do Aluno:**
  - Cadastro e validação de documentos pessoais (Bilhete de Identidade, Certificado de Habilitações do Ensino Médio, Fotografias tipo passe, Atestado Médico).
  - Gestão de eventos de carreira: trancamento total/parcial de matrícula, anulação, transferência de curso ou polo e desistência.

- **RF-25 - Emissão Automatizada de Documentos Acadêmicos:**
  - Processamento assíncrono em segundo plano (BullMQ) de documentos em PDF:
    - Declaração de Matrícula (com ou sem notas).
    - Histórico Escolar Parcial / Certidão de Notas.
    - Guia de Transferência.
  - Inserção de código hash SHA-256 e QR Code em cada documento emitido para validação pública instantânea de autenticidade no portal institucional.

- **RF-26 - Retificação Administrativa de Pautas:**
  - Interface restrita para aplicação de decisões do Conselho Pedagógico (revisões de provas e deferimento de recursos).
  - Exigência de despacho institucional anexado e justificativa textual com salvamento automático no `AuditLog`.

---

## 8. Matriz de Cobertura Funcional por Papel de Acesso (RBAC)

| Módulo / Funcionalidade                  | Super Admin |  Secretaria  |  Coordenador   |   Docente   | Estudante | Financeiro |
| ---------------------------------------- | :---------: | :----------: | :------------: | :---------: | :-------: | :--------: |
| **Gestão de Contas (Acesso)**            |     Sim     |     Não      |      Não       |     Não     |    Não    |    Não     |
| **Gestão de Perfis Acadêmicos**          |     Sim     | Sim (Alunos) | Sim (Docentes) |     Não     |    Não    |    Não     |
| **Grelhas Curriculares & Precedências**  |     Sim     |   Consulta   |      Sim       |  Consulta   | Consulta  |    Não     |
| **Abertura de Períodos e Prazos**        |     Sim     |     Sim      |    Consulta    |     Não     |    Não    |    Não     |
| **Inscrição em Turmas (Matrícula)**      |     Sim     |   Suporte    |      Não       |     Não     |    Sim    |    Não     |
| **Lançamento de Faltas e Notas**         |  Auditoria  |     Não      |   Auditoria    |     Sim     |    Não    |    Não     |
| **Fechamento e Congelamento de Pauta**   |  Auditoria  | Desbloqueio  |  Homologação   |     Sim     |    Não    |    Não     |
| **Consulta de Histórico Acadêmico**      |     Sim     |     Sim      |      Sim       | Turmas dele |  Próprio  |    Não     |
| **Validação de Propinas e Comprovantes** |     Sim     |   Consulta   |      Não       |     Não     |   Envio   |    Sim     |
| **Emissão de Declarações com QR Code**   |     Sim     |     Sim      |      Não       |     Não     | Download  |    Não     |
| **Retificação de Notas com Despacho**    |     Sim     |     Sim      |      Sim       |     Não     |    Não    |    Não     |
| **Consulta da Trilha de Auditoria**      |     Sim     |     Não      |      Não       |     Não     |    Não    |    Não     |
