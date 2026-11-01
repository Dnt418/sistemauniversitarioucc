import { Test, TestingModule } from '@nestjs/testing';
import { RegistryService } from '../registry.service';
import { PrismaService } from '@infra/database/prisma.service';
import { StorageService } from '@infra/storage/storage.service';
import { QueueService } from '@infra/queue/queue.service';
import { EventsGateway } from '@infra/websocket/events.gateway';
import { IssuedDocumentStatus, IssuedDocumentType, UserRole } from '@prisma/client';
import { ForbiddenException } from '@nestjs/common';

describe('RegistryService - RF-24 e RF-25 Validacao e Emissao Documental', () => {
  let service: RegistryService;
  let prisma: PrismaService;

  const mockPrismaService = {
    issuedAcademicDocument: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    enrollment: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    studentProfile: {
      findUnique: jest.fn(),
    },
    invoice: {
      findMany: jest.fn(),
    },
    academicSemester: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
  };

  const mockStorageService = {
    getPresignedDownloadUrl: jest.fn(),
  };

  const mockQueueService = {
    addDocumentJob: jest.fn(),
  };

  const mockEventsGateway = {
    notifyAccount: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RegistryService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: StorageService, useValue: mockStorageService },
        { provide: QueueService, useValue: mockQueueService },
        { provide: EventsGateway, useValue: mockEventsGateway },
      ],
    }).compile();

    service = module.get<RegistryService>(RegistryService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('RF-25: Validacao Publica Instantanea de Documentos', () => {
    it('deve validar positivamente documento emitido autentico pelo hash SHA-256', async () => {
      const validHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

      mockPrismaService.issuedAcademicDocument.findUnique.mockResolvedValue({
        id: 'doc-1',
        documentNumber: 'DEC-MATR-2026-A1B2C3',
        documentType: IssuedDocumentType.DECLARACAO_MATRICULA_SEM_NOTAS,
        issuedAt: new Date('2026-03-01'),
        status: IssuedDocumentStatus.EMITIDO,
        student: {
          fullName: 'Kizua Manuel',
          studentNumber: '20260001',
          identityCardNumber: '001234567LA042',
          course: { name: 'Engenharia Informatica' },
        },
        metadata: {
          anoLetivo: '2025/2026',
        },
      });

      const result = await service.verifyPublicDocument(validHash);

      expect(result.isValid).toBe(true);
      expect(result.authenticityStatus).toBe('AUTENTICO_E_VALIDO');
      expect(result.documentNumber).toBe('DEC-MATR-2026-A1B2C3');
      expect((result as any).student?.fullName).toBe('Kizua Manuel');
    });

    it('deve retornar diagnostico de documento inexistente ou invalido para hash desconhecido', async () => {
      const unknownHash = 'deadbeefdeadbeefdeadbeefdeadbeef';

      mockPrismaService.issuedAcademicDocument.findUnique.mockResolvedValue(null);
      mockPrismaService.enrollment.findUnique.mockResolvedValue(null);

      const result = await service.verifyPublicDocument(unknownHash);

      expect(result.isValid).toBe(false);
      expect(result.authenticityStatus).toBe('DOCUMENTO_INEXISTENTE_OU_INVALIDO');
    });

    it('deve validar comprovativo de inscricao atraves do fallback de enrollment hash', async () => {
      const enrollmentHash = 'a1b2c3d4e5f6';

      mockPrismaService.issuedAcademicDocument.findUnique.mockResolvedValue(null);
      mockPrismaService.enrollment.findUnique.mockResolvedValue({
        id: 'enr-999-uuid-test',
        enrolledAt: new Date('2026-02-15'),
        status: 'CONFIRMADA',
        student: {
          fullName: 'Nzinga Antonio',
          studentNumber: '20260002',
          identityCardNumber: '007654321LA043',
          course: { name: 'Economia' },
        },
        academicSemester: {
          semesterNumber: 1,
          academicYear: { code: '2025/2026' },
        },
        turma: {
          code: 'TURMA-ECO-1',
          discipline: { name: 'Macroeconomia I' },
        },
      });

      const result = await service.verifyPublicDocument(enrollmentHash);

      expect(result.isValid).toBe(true);
      expect(result.authenticityStatus).toBe('AUTENTICO_E_VALIDO');
      expect(result.documentType).toBe('COMPROVATIVO_MATRICULA_TURMA');
      expect((result as any).student?.fullName).toBe('Nzinga Antonio');
    });
  });

  describe('RF-23: Trava Financeira na Emissao de Documentos', () => {
    it('deve impedir a solicitacao de documentos por estudante com propinas ou faturas vencidas', async () => {
      const accountId = 'acc-student-overdue';

      mockPrismaService.studentProfile.findUnique.mockResolvedValue({
        id: 'student-overdue-id',
        accountId,
        studentNumber: '20250099',
        fullName: 'Estudante Devedor',
        identityCardNumber: '009988776LA044',
      });

      mockPrismaService.invoice.findMany.mockResolvedValue([
        {
          id: 'inv-overdue-1',
          dueDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // Vencida ha 10 dias
          status: 'VENCIDO',
          title: 'Propina de Marco 2026',
        },
      ]);

      await expect(
        service.issueAcademicDocument(
          accountId,
          [UserRole.ESTUDANTE],
          { documentType: IssuedDocumentType.DECLARACAO_MATRICULA_SEM_NOTAS },
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
