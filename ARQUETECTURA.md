## Visão Geral do Sistema

O SIGA Universitário é uma plataforma integrada de gestão acadêmica, pedagógica e financeira concebida especificamente para o subsistema de ensino superior em Angola. O sistema opera como o núcleo transacional institucional que orquestra a relação entre **Estudantes**, **Docentes**, **Coordenações de Curso**, **Secretaria Acadêmica** e **Tesouraria/Financeiro**, assegurando integridade rigorosa de pautas, controle de propinas e alta tolerância a concorrência massiva durante os períodos de matrícula e confirmação de inscrições para mais de 20.000 estudantes ativos.

## Padrão Arquitetural: Monólito Modular Desacoplado

Para o MVP, adota-se a abordagem de **Monólito Modular** dentro de um **Monorepo**, estruturado sobre o princípio de **Identidade Centralizada e Perfis Independentes**.

- **Por que esta abordagem?** Garante máxima velocidade de desenvolvimento, facilidade de refatoração e baixo custo operacional inicial, mantendo fronteiras de domínio rígidas entre os módulos acadêmicos e financeiros.
- **Isolamento de Perfis:** A conta central de acesso (`Account`) é totalmente apartada dos papéis operacionais (`DocenteProfile`, `EstudanteProfile`, `FuncionarioProfile`). A eventual inativação, corrupção de dados ou alteração de vínculo em um perfil específico não compromete a integridade da conta global do utilizador.
- **Evolução:** Módulos sujeitos a picos sazonais extremos de tráfego — em particular o **Motor de Matrículas/Inscrições** e a **Emissão Assíncrona de Documentos em PDF** — utilizam filas BullMQ e Redis atômico desacoplados, podendo ser facilmente extraídos para microsserviços autônomos no futuro sem necessidade de reescrever a base do sistema.

## Organização do Projeto

O projeto utiliza **npm Workspaces** com **Nx** para orquestração de compilação, testes e scripts, mantendo uma estrutura física limpa, direta e modular para suportar o desenvolvimento ágil no MVP.

```text
siga-universitario/
├── frontend/             # Aplicação SPA em React 19 / Vite (Portais: Admin, Docente, Estudante, Tesouraria)
├── backend/              # API Gateway e Monólito Modular em NestJS (Prisma ORM, Zod Pipes e Regras de Negócio)
├── infra/                # Docker Compose, PgBouncer, Redis, MinIO e scripts de infraestrutura local
└── REQUISITOS_FUNCIONAIS_MVP.md               # Documentação técnica consolidada, regras de negócio e contratos de dados
```
