import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';

export interface AuthenticatedSocket extends Socket {
  data: {
    user?: {
      sub: string;
      email: string;
      roles: UserRole[];
      activeProfile?: UserRole;
    };
  };
}

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/events',
})
export class EventsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(EventsGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  afterInit() {
    this.logger.log('Gateway WebSocket (Socket.IO) inicializado no namespace /events.');
  }

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token = this.extractToken(client);

      if (!token) {
        this.logger.warn(`Conexao WebSocket rejeitada: token ausente (Cliente: ${client.id})`);
        client.disconnect(true);
        return;
      }

      const jwtSecret = this.configService.get<string>('JWT_SECRET');
      const payload = this.jwtService.verify(token, { secret: jwtSecret });

      client.data.user = payload;

      // Associar cliente a sala individual da conta
      client.join(`account_${payload.sub}`);

      // Associar cliente a sala do perfil ativo
      if (payload.activeProfile) {
        client.join(`role_${payload.activeProfile}`);
      }

      // Associar cliente a sala de cada papel que possui
      if (Array.isArray(payload.roles)) {
        payload.roles.forEach((role: string) => {
          client.join(`role_${role}`);
        });
      }

      this.logger.log(
        `Cliente WebSocket autenticado: ${client.id} (Conta: ${payload.email}, Perfil: ${payload.activeProfile ?? 'Padrao'})`,
      );
    } catch (err: any) {
      this.logger.warn(
        `Falha na autenticacao do WebSocket (Cliente: ${client.id}): ${err.message}`,
      );
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    const userEmail = client.data?.user?.email ?? 'Nao autenticado';
    this.logger.log(`Cliente WebSocket desconectado: ${client.id} (${userEmail})`);
  }

  /**
   * Inscricao em sala de turma para receber alertas de notas e pautas em tempo real
   */
  @SubscribeMessage('turma:join')
  handleJoinTurma(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { turmaId: string },
  ) {
    if (!data?.turmaId) {
      return { status: 'error', message: 'ID da turma e obrigatorio' };
    }

    client.join(`turma_${data.turmaId}`);
    this.logger.log(`Cliente ${client.id} entrou na sala da turma: ${data.turmaId}`);
    return { status: 'success', joined: `turma_${data.turmaId}` };
  }

  @SubscribeMessage('turma:leave')
  handleLeaveTurma(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { turmaId: string },
  ) {
    if (data?.turmaId) {
      client.leave(`turma_${data.turmaId}`);
      return { status: 'success', left: `turma_${data.turmaId}` };
    }
    return { status: 'error' };
  }

  // ==============================================================================
  // METODOS DE EMISSAO INSTITUCIONAL
  // ==============================================================================

  /**
   * Notifica um utilizador especifico via canal privativo
   */
  notifyAccount(accountId: string, event: string, payload: any) {
    this.server.to(`account_${accountId}`).emit(event, {
      ...payload,
      timestamp: new Date().toISOString(),
    });
    this.logger.log(`Evento '${event}' emitido para a conta: ${accountId}`);
  }

  /**
   * Notifica todos os utilizadores de um determinado papel (ex.: ESTUDANTE, DOCENTE, FINANCEIRO)
   */
  notifyRole(role: UserRole | string, event: string, payload: any) {
    this.server.to(`role_${role}`).emit(event, {
      ...payload,
      timestamp: new Date().toISOString(),
    });
    this.logger.log(`Evento '${event}' emitido para o papel: ${role}`);
  }

  /**
   * Notifica todos os estudantes e docentes vinculados a uma turma
   */
  notifyTurma(turmaId: string, event: string, payload: any) {
    this.server.to(`turma_${turmaId}`).emit(event, {
      ...payload,
      timestamp: new Date().toISOString(),
    });
    this.logger.log(`Evento '${event}' emitido para a turma: ${turmaId}`);
  }

  /**
   * Transmissao global para todos os clientes conectados
   */
  broadcast(event: string, payload: any) {
    this.server.emit(event, {
      ...payload,
      timestamp: new Date().toISOString(),
    });
    this.logger.log(`Evento de transmissao global '${event}' emitido.`);
  }

  private extractToken(client: Socket): string | null {
    // 1. Auth object no handshake (padrao Socket.IO client v4)
    if (client.handshake.auth?.token) {
      const auth = client.handshake.auth.token;
      return auth.startsWith('Bearer ') ? auth.slice(7) : auth;
    }

    // 2. Authorization header
    const authHeader = client.handshake.headers?.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }

    // 3. Query string token
    if (client.handshake.query?.token) {
      return client.handshake.query.token as string;
    }

    return null;
  }
}

