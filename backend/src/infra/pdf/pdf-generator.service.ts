import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import PDFDocument from 'pdfkit';
import * as QRCode from 'qrcode';

export interface AcademicDocPdfData {
  documentNumber: string;
  documentType: string;
  studentName: string;
  studentNumber: string;
  identityCardNumber: string;
  courseName: string;
  issuedAt: Date;
  verificationHash: string;
  purpose?: string;
  coeficienteRendimento?: number;
  grades?: Array<{
    disciplina: string;
    codigo: string;
    creditos: number;
    notaFinal: number;
    estado?: string;
    ano?: string;
    semestre?: number;
  }>;
}

export interface EnrollmentProofPdfData {
  studentName: string;
  studentNumber: string;
  identityCardNumber: string;
  courseName: string;
  enrolledAt: Date;
  academicYear: string;
  semesterNumber: number;
  turmas: Array<{
    turmaCode: string;
    disciplinaName: string;
    disciplinaCode: string;
    credits: number;
    turno?: string;
  }>;
  totalCredits: number;
  verificationHash: string;
}

@Injectable()
export class PdfGeneratorService {
  private readonly logger = new Logger(PdfGeneratorService.name);
  private readonly portalUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.portalUrl =
      this.configService.get<string>('PORTAL_URL') || 'http://localhost:3000';
  }

  /**
   * RF-25: Gera PDF vetorial oficial de Certidoes e Declaracoes Academicas
   */
  async generateAcademicDocumentPdf(data: AcademicDocPdfData): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margins: { top: 40, bottom: 40, left: 50, right: 50 },
        });

        const chunks: Buffer[] = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', (err) => reject(err));

        // 1. Cabecalho Oficial Institucional
        doc
          .font('Helvetica-Bold')
          .fontSize(11)
          .text('REPÚBLICA DE ANGOLA', { align: 'center' })
          .fontSize(10)
          .text('MINISTÉRIO DO ENSINO SUPERIOR, CIÊNCIA, TECNOLOGIA E INOVAÇÃO', {
            align: 'center',
          })
          .text('UNIVERSIDADE - SIGA UNIVERSITÁRIO', { align: 'center' })
          .font('Helvetica')
          .fontSize(9)
          .text('Secretaria Geral e Serviços Académicos', { align: 'center' });

        doc.moveDown(1.5);

        // Linha divisoria
        doc
          .strokeColor('#003366')
          .lineWidth(1.5)
          .moveTo(50, doc.y)
          .lineTo(545, doc.y)
          .stroke();

        doc.moveDown(1.5);

        // 2. Titulo do Documento e Registro
        const friendlyTitle = this.formatDocumentTitle(data.documentType);
        doc
          .font('Helvetica-Bold')
          .fontSize(14)
          .fillColor('#003366')
          .text(friendlyTitle, { align: 'center' })
          .fontSize(10)
          .fillColor('#444444')
          .text(`Registo Nº: ${data.documentNumber}`, { align: 'center' });

        doc.moveDown(1.5);

        // 3. Texto Formal de Certificacao
        doc
          .font('Helvetica')
          .fontSize(10.5)
          .fillColor('#222222')
          .text(
            'A Secretaria Geral da Universidade certifica, em conformidade com os registos constantes no Sistema Integrado de Gestão Acadêmica (SIGA), que:',
            { align: 'justify', lineGap: 3 },
          );

        doc.moveDown(1);

        // Dados de Identificacao
        doc
          .font('Helvetica-Bold')
          .text(`Nome Completo: `, { continued: true })
          .font('Helvetica')
          .text(data.studentName)
          .font('Helvetica-Bold')
          .text(`Número de Matrícula/Processo: `, { continued: true })
          .font('Helvetica')
          .text(data.studentNumber)
          .font('Helvetica-Bold')
          .text(`Bilhete de Identidade (BI): `, { continued: true })
          .font('Helvetica')
          .text(data.identityCardNumber)
          .font('Helvetica-Bold')
          .text(`Curso de Licenciatura: `, { continued: true })
          .font('Helvetica')
          .text(data.courseName);

        if (data.purpose) {
          doc
            .font('Helvetica-Bold')
            .text(`Finalidade Declarada: `, { continued: true })
            .font('Helvetica')
            .text(data.purpose);
        }

        doc.moveDown(1.5);

        // 4. Tabela de Classificacoes (se aplicavel)
        if (data.grades && data.grades.length > 0) {
          doc
            .font('Helvetica-Bold')
            .fontSize(10)
            .fillColor('#003366')
            .text('DISCRIMINAÇÃO DE APROVEITAMENTO ACADÉMICO:', { underline: true });

          doc.moveDown(0.5);

          // Cabecalho da tabela
          const startY = doc.y;
          doc.rect(50, startY, 495, 18).fill('#f0f4f8');
          doc
            .font('Helvetica-Bold')
            .fontSize(8.5)
            .fillColor('#003366')
            .text('Código', 55, startY + 4, { width: 50 })
            .text('Unidade Curricular / Disciplina', 110, startY + 4, { width: 230 })
            .text('ECTS', 345, startY + 4, { width: 35, align: 'center' })
            .text('Nota Final', 385, startY + 4, { width: 55, align: 'center' })
            .text('Resultado', 445, startY + 4, { width: 95, align: 'center' });

          let currentY = startY + 20;

          doc.font('Helvetica').fontSize(8).fillColor('#333333');
          for (const item of data.grades) {
            doc
              .text(item.codigo, 55, currentY, { width: 50 })
              .text(item.disciplina, 110, currentY, { width: 230 })
              .text(String(item.creditos), 345, currentY, { width: 35, align: 'center' })
              .text(
                item.notaFinal !== null && item.notaFinal !== undefined
                  ? item.notaFinal.toFixed(1)
                  : '-',
                385,
                currentY,
                { width: 55, align: 'center' },
              )
              .text(item.estado ?? 'APROVADO', 445, currentY, {
                width: 95,
                align: 'center',
              });

            currentY += 16;
            if (currentY > 700) {
              doc.addPage();
              currentY = 50;
            }
          }

          doc.y = currentY + 10;

          if (data.coeficienteRendimento !== undefined) {
            doc
              .font('Helvetica-Bold')
              .fontSize(9.5)
              .fillColor('#003366')
              .text(
                `Coeficiente de Rendimento (Média Ponderada Acumulada): ${data.coeficienteRendimento.toFixed(2)} valores (Escala 0 a 20)`,
                { align: 'right' },
              );
            doc.moveDown(1);
          }
        }

        // 5. Data de Emissao e Assinatura
        const formattedDate = new Date(data.issuedAt).toLocaleDateString('pt-AO', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });

        doc
          .font('Helvetica')
          .fontSize(9.5)
          .fillColor('#222222')
          .text(`Luanda, aos ${formattedDate}.`, { align: 'right' });

        doc.moveDown(2);

        // Linha de assinatura
        const signatureY = doc.y;
        doc
          .strokeColor('#999999')
          .lineWidth(0.8)
          .moveTo(320, signatureY)
          .lineTo(520, signatureY)
          .stroke();

        doc
          .font('Helvetica-Bold')
          .fontSize(8.5)
          .text('A Secretaria Geral', 320, signatureY + 4, {
            width: 200,
            align: 'center',
          });

        // 6. Bloco de Seguranca, Assinatura Digital e QR Code (RF-25)
        const verificationUrl = `${this.portalUrl}/api/v1/registry/verify/${data.verificationHash}`;
        const qrBuffer = await QRCode.toBuffer(verificationUrl, {
          width: 80,
          margin: 1,
        });

        const footerY = 720;
        doc.image(qrBuffer, 50, footerY - 5, { width: 65 });

        doc
          .font('Helvetica-Bold')
          .fontSize(7.5)
          .fillColor('#003366')
          .text('AUTENTICAÇÃO PÚBLICA E ASSINATURA DIGITAL INSTITUCIONAL', 125, footerY)
          .font('Helvetica')
          .fontSize(7)
          .fillColor('#555555')
          .text(
            'Este documento oficial possui validade jurídica plena, emitido e assinado digitalmente.',
            125,
            footerY + 11,
          )
          .font('Helvetica-Bold')
          .text(`Código SHA-256: `, 125, footerY + 22, { continued: true })
          .font('Helvetica')
          .text(data.verificationHash)
          .text(`Validação instantânea no portal: ${verificationUrl}`, 125, footerY + 33);

        doc.end();
      } catch (err: any) {
        this.logger.error(`Falha ao compilar PDF de documento: ${err.message}`);
        reject(err);
      }
    });
  }

  /**
   * RF-11: Gera PDF vetorial oficial do Comprovativo de Inscricao / Matricula
   */
  async generateEnrollmentProofPdf(data: EnrollmentProofPdfData): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margins: { top: 40, bottom: 40, left: 50, right: 50 },
        });

        const chunks: Buffer[] = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', (err) => reject(err));

        // Cabecalho
        doc
          .font('Helvetica-Bold')
          .fontSize(11)
          .text('REPÚBLICA DE ANGOLA', { align: 'center' })
          .fontSize(10)
          .text('MINISTÉRIO DO ENSINO SUPERIOR, CIÊNCIA, TECNOLOGIA E INOVAÇÃO', {
            align: 'center',
          })
          .text('UNIVERSIDADE - SIGA UNIVERSITÁRIO', { align: 'center' })
          .font('Helvetica')
          .fontSize(9)
          .text('Comprovativo Oficial de Matrícula e Inscrição Semestral', {
            align: 'center',
          });

        doc.moveDown(1.5);

        doc
          .strokeColor('#003366')
          .lineWidth(1.5)
          .moveTo(50, doc.y)
          .lineTo(545, doc.y)
          .stroke();

        doc.moveDown(1.5);

        // Dados do Aluno e Semestre
        doc
          .font('Helvetica-Bold')
          .fontSize(10)
          .fillColor('#003366')
          .text('DADOS DO ESTUDANTE:', { underline: true });

        doc.moveDown(0.5);

        doc
          .font('Helvetica-Bold')
          .fontSize(9)
          .fillColor('#222222')
          .text('Nome Completo: ', { continued: true })
          .font('Helvetica')
          .text(data.studentName)
          .font('Helvetica-Bold')
          .text('Nº de Matrícula: ', { continued: true })
          .font('Helvetica')
          .text(data.studentNumber)
          .font('Helvetica-Bold')
          .text('Bilhete de Identidade (BI): ', { continued: true })
          .font('Helvetica')
          .text(data.identityCardNumber)
          .font('Helvetica-Bold')
          .text('Curso: ', { continued: true })
          .font('Helvetica')
          .text(data.courseName)
          .font('Helvetica-Bold')
          .text('Ano Letivo / Semestre: ', { continued: true })
          .font('Helvetica')
          .text(`${data.academicYear} - Semestre ${data.semesterNumber}`);

        doc.moveDown(1.5);

        // Tabela de Turmas Inscritas
        doc
          .font('Helvetica-Bold')
          .fontSize(10)
          .fillColor('#003366')
          .text('DISCIPLINAS E TURMAS CONFIRMADAS:');

        doc.moveDown(0.5);

        const startY = doc.y;
        doc.rect(50, startY, 495, 18).fill('#f0f4f8');
        doc
          .font('Helvetica-Bold')
          .fontSize(8.5)
          .fillColor('#003366')
          .text('Turma', 55, startY + 4, { width: 60 })
          .text('Código', 120, startY + 4, { width: 50 })
          .text('Unidade Curricular', 175, startY + 4, { width: 220 })
          .text('Turno', 400, startY + 4, { width: 60, align: 'center' })
          .text('ECTS', 465, startY + 4, { width: 70, align: 'center' });

        let currentY = startY + 20;

        doc.font('Helvetica').fontSize(8).fillColor('#333333');
        for (const turma of data.turmas) {
          doc
            .text(turma.turmaCode, 55, currentY, { width: 60 })
            .text(turma.disciplinaCode, 120, currentY, { width: 50 })
            .text(turma.disciplinaName, 175, currentY, { width: 220 })
            .text(turma.turno ?? 'MANHA', 400, currentY, {
              width: 60,
              align: 'center',
            })
            .text(String(turma.credits), 465, currentY, {
              width: 70,
              align: 'center',
            });

          currentY += 16;
        }

        doc.moveDown(1);
        doc.y = currentY + 8;
        doc
          .font('Helvetica-Bold')
          .fontSize(9)
          .fillColor('#003366')
          .text(`Total de Créditos Inscritos: ${data.totalCredits} ECTS (Limite Regulamentar: 36 ECTS)`, {
            align: 'right',
          });

        doc.moveDown(2);

        // Bloco de Seguranca com QR Code
        const verificationUrl = `${this.portalUrl}/api/v1/registry/verify/${data.verificationHash}`;
        const qrBuffer = await QRCode.toBuffer(verificationUrl, {
          width: 80,
          margin: 1,
        });

        const footerY = 720;
        doc.image(qrBuffer, 50, footerY - 5, { width: 65 });

        doc
          .font('Helvetica-Bold')
          .fontSize(7.5)
          .fillColor('#003366')
          .text('VALIDAÇÃO INSTITUCIONAL DE MATRÍCULA', 125, footerY)
          .font('Helvetica')
          .fontSize(7)
          .fillColor('#555555')
          .text(
            'Documento processado atomicamente com reserva de vagas no motor transacional do SIGA.',
            125,
            footerY + 11,
          )
          .font('Helvetica-Bold')
          .text(`Assinatura SHA-256: `, 125, footerY + 22, { continued: true })
          .font('Helvetica')
          .text(data.verificationHash)
          .text(`Autenticação pública em: ${verificationUrl}`, 125, footerY + 33);

        doc.end();
      } catch (err: any) {
        this.logger.error(`Falha ao compilar PDF de matricula: ${err.message}`);
        reject(err);
      }
    });
  }

  private formatDocumentTitle(type: string): string {
    switch (type) {
      case 'DECLARACAO_MATRICULA_SEM_NOTAS':
        return 'DECLARAÇÃO DE MATRÍCULA';
      case 'DECLARACAO_MATRICULA_COM_NOTAS':
        return 'DECLARAÇÃO DE MATRÍCULA COM APROVEITAMENTO';
      case 'HISTORICO_ESCOLAR_PARCIAL':
        return 'HISTÓRICO ESCOLAR PARCIAL';
      case 'CERTIDAO_DE_NOTAS':
        return 'CERTIDÃO DE APROVEITAMENTO ACADÉMICO';
      case 'GUIA_TRANSFERENCIA':
        return 'GUIA DE TRANSFERÊNCIA INSTITUCIONAL';
      default:
        return 'DECLARAÇÃO OFICIAL';
    }
  }
}

