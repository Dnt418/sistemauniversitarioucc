# Stack Tecnológica e Infraestrutura do SIGA Universitário

Especificação técnica oficial da infraestrutura e arquitetura de software para o Sistema Integrado de Gestão Acadêmica (SIGA), dimensionado para suportar mais de 20.000 estudantes universitários com isolamento estrito de domínios, tolerância a falhas por perfil e alta concorrência.

---

## 1. Arquitetura de Identidade e Isolamento de Perfis

Para evitar acoplamento nocivo em que a corrupção ou erro num papel (ex.: Professor) comprometa a conta global do utilizador, a arquitetura adota o padrão **Decoupled Identity & Profiles**:

- **Entidade Central de Acesso (`Account` / `User`):**
  - Responsável estritamente por autenticação e credenciais (ID único, email institucional, password hash, estado da conta e timestamps).
  - Desconhece regras de turmas, propinas, cursos ou departamentos.
- **Perfis Especializados e Isolados (Sub-domínios 1:1 ou 1:N):**
  - `DocenteProfile`: Vínculo departamental, categoria docente, turmas atribuídas e histórico letivo.
  - `EstudanteProfile`: Número de processo/matrícula, curso, ano curricular e situação acadêmica.
  - `FuncionarioProfile`: Cargo administrativo, setor/secretaria e permissões operacionais.
  - `CoordenadorProfile`: Vinculação de gestão a cursos específicos.
- **Resiliência:** A inativação, falha de integridade ou exclusão lógica de um perfil específico não remove nem invalida a conta central do utilizador.

---

## 2. Frontend Web (Portais: Administração, Docente e Estudante)

SPA (Single Page Application) responsiva orientada a componentes funcionais, alto desempenho de renderização e forte tipagem estática.

- **Core Framework:** React 19 + TypeScript
- **Build Tool:** Vite
- **Design System & Estilização:** Ant Design + shadcn/ui (componentes modulares e acessíveis baseados em Radix UI)
- **Gerenciamento de Estado:**
  - **Server State & Cache:** TanStack Query v5 (cache de requisições, paginação, sincronização automática de pautas e invalidação estruturada)
  - **Global Client State:** Zustand (sessão de UI, controle de modais, menus laterais e preferências de layout)
- **Formulários e Validação:** React Hook Form integrado diretamente com esquemas Zod (sem classes duplicadas, com inferência direta de tipos no cliente)
- **Tabelas e Gráficos:**
  - **Tabelas Complexas:** TanStack Table v8 (virtualização para grandes listagens de pautas e turmas com ordenação e filtros avançados)
  - **Visualização de Dados:** Recharts (gráficos de aproveitamento acadêmico, assiduidade e métricas financeiras/propinas)
- **Comunicação em Tempo Real:** Socket.IO Client (notificações ativas e alertas de publicação de pautas)

---

## 3. Backend Principal (API Gateway & Domínios Desacoplados)

Monólito modular em NestJS com eliminação de classes DTO legadas, adotando validação declarativa funcional via Zod.

- **Framework:** NestJS (Node.js runtime com TypeScript)
- **Contratos e Validação (Substituição de DTOs baseados em classe):**
  - Validação com **Zod Pipes** nativos no NestJS.
  - Tipos inferidos diretamente dos esquemas Zod (`type CreateDocenteInput = z.infer<typeof DocenteSchema>`), eliminando classes DTO intermediárias e anotações `@IsString()`, `@IsOptional()`.
  - Esquemas isolados por operação: esquemas de conta de acesso são estritamente independentes dos esquemas de perfis docentes ou discentes.
- **Acesso ao Banco de Dados (ORM):** Prisma ORM (migrações declarativas e tipagem nativa) + execução de SQL cru via `prisma.$executeRaw` em rotas críticas de concorrência massiva
- **Gerenciador de Conexões:** PgBouncer (pooling de conexões obrigatório para suportar milhares de conexões simultâneas sem esgotar o pool do PostgreSQL)
- **Filas & Processamento Assíncrono:** BullMQ sobre Redis (geração assíncrona de relatórios, declarações em PDF com código de verificação e processamento em lote)
- **Comunicação em Tempo Real:** NestJS WebSockets Gateway (Socket.IO)

---

## 4. Persistência, Cache e Armazenamento

- **Banco de Dados Relacional:** PostgreSQL 16+ (instância primária para escrita com réplica de leitura para consultas pesadas de pautas e histórico escolar)
- **Cache em Memória & Concorrência:** Redis 7+
  - Bloqueio atômico de vagas de turmas via contadores (`DECRBY`) e scripts Lua
  - Controle de sessões distribuídas e rate limiting contra sobrecarga de requisições
  - Barramento transacional de tarefas em segundo plano para o BullMQ
- **Armazenamento de Arquivos (Object Storage):** MinIO (em ambiente local/homologação) ou S3-Compatible (Cloudflare R2 / AWS S3 em produção)
  - Armazenamento seguro de comprovativos bancários/borderôs, documentos de identificação pessoal e pautas finais exportadas em PDF com hash de autenticidade

---

## 5. Segurança, Autenticação e Autorização

- **Autenticação:** JWT (JSON Web Tokens) de curta duração (15 minutos) com rotação de _Refresh Tokens_ persistidos em cookies seguros (`HttpOnly`, `Secure`, `SameSite=Lax`).
- **Controle de Acesso (RBAC):** NestJS Guards verificando os papéis ativos associados à conta (`SUPER_ADMIN`, `SECRETARIA`, `COORDENADOR`, `DOCENTE`, `ESTUDANTE`, `FINANCEIRO`).
- **Trilha de Auditoria (Audit Log):** Tabela imutável para rastreamento de qualquer inserção, alteração ou eliminação de notas, faltas, equivalências ou estados de pagamento (armazenando `userId`, `perfilUtilizado`, `ip`, `timestamp`, `dadosAntigos` e `dadosNovos`).

---

## 6. Infraestrutura, Qualidade e Testes

- **Containerização Local:** Docker e Docker Compose (orquestrando Node/NestJS, PostgreSQL, PgBouncer, Redis e MinIO)
- **Testes de Software:**
  - **Backend:** Jest (testes unitários para cálculos de fórmulas de notas, regras de bloqueio e testes de integração de endpoints)
  - **Frontend:** Vitest + React Testing Library (testes de formulários Zod e componentes visuais)
  - **End-to-End:** Playwright (fluxos de ponta a ponta: login, submissão de notas e matrícula)
  - **Testes de Carga:** k6 (simulação de picos com 5.000 a 6.000 requisições simultâneas em períodos críticos)
- **Documentação de API:** OpenAPI/Swagger gerado automaticamente a partir dos módulos e esquemas Zod (`nestjs-zod` / `@anatine/zod-openapi`)
- **Observabilidade:** Sentry (captura de erros em tempo real no frontend e backend) + Prometheus e Grafana (monitoramento de latência e saúde dos contêineres)
