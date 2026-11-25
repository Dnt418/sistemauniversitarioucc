-- Script de Inicialização da Base de Dados - SIGA Universitário
-- Executado automaticamente pelo container do PostgreSQL na primeira inicialização (/docker-entrypoint-initdb.d)

-- Habilitar extensões necessárias para UUID e criptografia
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Log de confirmação
DO $$
BEGIN
   RAISE NOTICE 'Base de dados do SIGA Universitário inicializada com sucesso com extensões UUID e PGCRYPTO.';
END
$$;
