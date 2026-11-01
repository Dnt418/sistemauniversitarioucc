import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client!: Redis;

  // Script Lua atomico para reserva imediata de vagas (RF-10)
  // KEYS[1]: turma:vagas:{turmaId}
  // KEYS[2]: turma:reservas:{turmaId}
  // ARGV[1]: estudanteId
  // ARGV[2]: maxCapacity (inicializacao se a chave nao existir)
  private readonly RESERVE_SEAT_LUA = `
    local vagasKey = KEYS[1]
    local reservasKey = KEYS[2]
    local estudanteId = ARGV[1]
    local maxCapacity = tonumber(ARGV[2])

    -- Se o estudante ja tem vaga reservada nesta turma, retorna 1 (idempotente)
    if redis.call('SISMEMBER', reservasKey, estudanteId) == 1 then
      return 1
    end

    -- Se a chave nao existe no Redis, inicializa com maxCapacity
    if redis.call('EXISTS', vagasKey) == 0 then
      redis.call('SET', vagasKey, maxCapacity)
    end

    local vagasRestantes = redis.call('DECR', vagasKey)

    if vagasRestantes < 0 then
      -- Rollback imediato: esgotado
      redis.call('INCR', vagasKey)
      return 0
    end

    -- Registra o estudante no conjunto de reservas
    redis.call('SADD', reservasKey, estudanteId)
    return 1
  `;

  // Script Lua atomico para liberacao de vaga reservada
  // KEYS[1]: turma:vagas:{turmaId}
  // KEYS[2]: turma:reservas:{turmaId}
  // ARGV[1]: estudanteId
  private readonly RELEASE_SEAT_LUA = `
    local vagasKey = KEYS[1]
    local reservasKey = KEYS[2]
    local estudanteId = ARGV[1]

    if redis.call('SREM', reservasKey, estudanteId) == 1 then
      redis.call('INCR', vagasKey)
      return 1
    end

    return 0
  `;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const redisUrl = this.configService.get<string>('REDIS_URL', {
      infer: true,
    }) || 'redis://localhost:6379';

    this.client = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true,
      retryStrategy: (times) => Math.min(times * 100, 3000),
    });

    this.client.on('connect', () => {
      this.logger.log('Conexao estabelecida com sucesso com o servidor Redis');
    });

    this.client.on('error', (err) => {
      this.logger.error(`Erro na conexao com o Redis: ${err.message}`);
    });

    // Conectar de forma assincrona sem bloquear o boot
    this.client.connect().catch((err) => {
      this.logger.warn(`Conexao inicial com Redis em segundo plano: ${err.message}`);
    });
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
      this.logger.log('Conexao com o Redis encerrada com sucesso');
    }
  }

  getClient(): Redis {
    return this.client;
  }

  /**
   * RF-10: Reserva atomica de vaga em milissegundos via script Lua
   * Retorna true se a vaga foi obtida com sucesso; false caso esgotada.
   */
  async reserveSeat(turmaId: string, estudanteId: string, maxCapacity: number): Promise<boolean> {
    const vagasKey = `turma:vagas:${turmaId}`;
    const reservasKey = `turma:reservas:${turmaId}`;

    try {
      const result = await this.client.eval(
        this.RESERVE_SEAT_LUA,
        2,
        vagasKey,
        reservasKey,
        estudanteId,
        maxCapacity.toString(),
      );

      return Number(result) === 1;
    } catch (err: any) {
      this.logger.error(
        `Falha na execucao do script Lua de reserva de vaga (Turma: ${turmaId}, Estudante: ${estudanteId}): ${err.message}`,
      );
      throw err;
    }
  }

  /**
   * RF-10: Liberacao atomica de vaga em caso de cancelamento ou falha
   */
  async releaseSeat(turmaId: string, estudanteId: string): Promise<boolean> {
    const vagasKey = `turma:vagas:${turmaId}`;
    const reservasKey = `turma:reservas:${turmaId}`;

    try {
      const result = await this.client.eval(
        this.RELEASE_SEAT_LUA,
        2,
        vagasKey,
        reservasKey,
        estudanteId,
      );

      return Number(result) === 1;
    } catch (err: any) {
      this.logger.error(
        `Falha na liberacao de vaga no Redis (Turma: ${turmaId}): ${err.message}`,
      );
      return false;
    }
  }

  /**
   * Consulta a quantidade de vagas restantes em memoria
   */
  async getAvailableSeats(turmaId: string, fallbackCapacity: number): Promise<number> {
    const vagasKey = `turma:vagas:${turmaId}`;
    const seats = await this.client.get(vagasKey);

    if (seats === null) {
      // Inicializa chave com a capacidade fornecida
      await this.client.set(vagasKey, fallbackCapacity.toString());
      return fallbackCapacity;
    }

    return Math.max(0, parseInt(seats, 10));
  }

  /**
   * Sincroniza o contador do Redis com a base relacional
   */
  async syncCapacity(turmaId: string, availableCapacity: number): Promise<void> {
    const vagasKey = `turma:vagas:${turmaId}`;
    await this.client.set(vagasKey, availableCapacity.toString());
  }
}

