import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as nodemailer from "nodemailer";

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

@Injectable()
export class MailerService implements OnModuleInit {
  private readonly logger = new Logger(MailerService.name);
  private transporter?: nodemailer.Transporter;
  private isConfigured = false;
  private defaultFrom = "SIGA Universitário <nao-responder@siga.ao>";
  private portalUrl = "http://localhost:3000";

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    try {
      const host = this.configService.get<string>("SMTP_HOST") || "localhost";
      const port = this.configService.get<number>("SMTP_PORT") || 1025;
      const secure = this.configService.get<boolean>("SMTP_SECURE") || false;
      const user = this.configService.get<string>("SMTP_USER");
      const pass = this.configService.get<string>("SMTP_PASS");
      this.defaultFrom =
        this.configService.get<string>("SMTP_FROM") ||
        "SIGA Universitário <nao-responder@siga.ao>";
      this.portalUrl =
        this.configService.get<string>("PORTAL_URL") || "http://localhost:3000";

      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        ...(user && pass ? { auth: { user, pass } } : {}),
      });

      this.isConfigured = true;
      this.logger.log(
        `Servico de email SMTP inicializado com sucesso em ${host}:${port}`,
      );
    } catch (err: any) {
      this.isConfigured = false;
      this.logger.warn(
        `Falha na configuracao do transporte SMTP: ${err.message}. Modo contingencia ativo.`,
      );
    }
  }

  /**
   * Envio generico de mensagens de email
   */
  async sendEmail(options: SendEmailOptions): Promise<boolean> {
    if (!this.isConfigured || !this.transporter) {
      this.logger.warn(
        `[CONTINGENCIA] Email para [${options.to}] simulado. Assunto: ${options.subject}`,
      );
      return false;
    }

    try {
      await this.transporter.sendMail({
        from: this.defaultFrom,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });

      this.logger.log(`Email enviado com sucesso para: ${options.to}`);
      return true;
    } catch (err: any) {
      this.logger.error(
        `Erro ao enviar email para [${options.to}]: ${err.message}`,
      );
      return false;
    }
  }

  /**
   * RF-03: Email de Recuperacao de Senha Institucional
   */
  async sendPasswordResetEmail(
    to: string,
    token: string,
    fullName?: string,
  ): Promise<boolean> {
    const resetUrl = `${this.portalUrl}/auth/reset-password?token=${token}`;
    const greeting = fullName
      ? `Prezado(a) ${fullName},`
      : "Prezado(a) Utilizador(a),";

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; padding: 24px;">
        <h2 style="color: #003366; margin-top: 0;">Recuperação de Senha - SIGA Universitário</h2>
        <p>${greeting}</p>
        <p>Recebemos uma solicitação de redefinição de senha para o acesso à sua conta institucional.</p>
        <p>Para criar uma nova credencial de segurança, utilize o botão abaixo dentro do prazo regulamentar de 15 minutos:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="background-color: #003366; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">
            Redefinir Minha Senha
          </a>
        </div>
        <p style="font-size: 13px; color: #666;">Se o botão não funcionar, copie e cole o seguinte endereço no seu navegador:<br/>
        <a href="${resetUrl}" style="color: #003366;">${resetUrl}</a></p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="font-size: 12px; color: #999;">Caso não tenha solicitado esta alteração, desconsidere esta mensagem. A sua conta permanecerá segura.</p>
      </div>
    `;

    return this.sendEmail({
      to,
      subject: "SIGA Universitário - Recuperação de Senha de Acesso",
      html,
      text: `${greeting}\n\nPara redefinir a sua senha no SIGA Universitário, aceda ao link:\n${resetUrl}\n\nO link e valido por 15 minutos.`,
    });
  }

  /**
   * RF-11: Notificacao de Confirmacao de Matricula / Inscricao em Turmas
   */
  async sendEnrollmentConfirmationEmail(
    to: string,
    studentName: string,
    turmaCodes: string[],
    verificationHash: string,
  ): Promise<boolean> {
    const verifyUrl = `${this.portalUrl}/api/v1/registry/verify/${verificationHash}`;

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; padding: 24px;">
        <h2 style="color: #003366; margin-top: 0;">Confirmação de Inscrição em Turmas</h2>
        <p>Prezado(a) <strong>${studentName}</strong>,</p>
        <p>A sua inscrição semestral foi confirmada com sucesso pelo motor de matrículas do SIGA Universitário.</p>
        <p><strong>Turmas Inscritas:</strong> ${turmaCodes.join(", ")}</p>
        <p><strong>Código Hash de Autenticidade Digital (SHA-256):</strong><br/>
        <code style="background-color: #f4f4f4; padding: 4px 8px; border-radius: 4px; font-size: 12px; word-break: break-all;">${verificationHash}</code></p>
        <div style="margin: 24px 0; text-align: center;">
          <a href="${verifyUrl}" style="background-color: #003366; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">
            Verificar Autenticidade do Comprovativo
          </a>
        </div>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="font-size: 12px; color: #999;">Documento gerado eletronicamente pela Secretaria Geral.</p>
      </div>
    `;

    return this.sendEmail({
      to,
      subject: "SIGA Universitário - Confirmação Oficial de Matrícula",
      html,
      text: `Prezado(a) ${studentName},\n\nA sua inscricao foi confirmada nas turmas: ${turmaCodes.join(", ")}.\nHash SHA-256: ${verificationHash}\nVerificacao: ${verifyUrl}`,
    });
  }

  /**
   * RF-21: Notificacao de Fatura de Propinas Emitida
   */
  async sendInvoiceNoticeEmail(
    to: string,
    studentName: string,
    invoiceNumber: string,
    amount: number,
    dueDate: Date,
  ): Promise<boolean> {
    const formattedDate = new Date(dueDate).toLocaleDateString("pt-AO");
    const formattedAmount = `${amount.toLocaleString("pt-AO", { minimumFractionDigits: 2 })} AOA`;

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; padding: 24px;">
        <h2 style="color: #003366; margin-top: 0;">Emissão de Fatura de Propina Mensal</h2>
        <p>Prezado(a) <strong>${studentName}</strong>,</p>
        <p>Informamos que foi emitida a sua obrigação financeira referente ao período letivo corrente:</p>
        <ul style="list-style-type: none; padding-left: 0;">
          <li><strong>Número da Fatura:</strong> ${invoiceNumber}</li>
          <li><strong>Valor a Liquidar:</strong> ${formattedAmount}</li>
          <li><strong>Data de Vencimento:</strong> ${formattedDate}</li>
        </ul>
        <p style="font-size: 13px; color: #c00;">Aviso: O pagamento após a data limite acarreta a aplicação de multa regulamentar de 10% por mora.</p>
        <p>Efetue o pagamento através dos canais bancários autorizados e anexe o borderô no portal discente.</p>
      </div>
    `;

    return this.sendEmail({
      to,
      subject: `SIGA Universitário - Notificação de Propina (${invoiceNumber})`,
      html,
      text: `Prezado(a) ${studentName},\n\nA fatura ${invoiceNumber} no valor de ${formattedAmount} vence a ${formattedDate}.\nSubmeta o comprovativo no portal institucional.`,
    });
  }

  /**
   * RF-22: Notificacao de Validacao/Rejeicao de Bordero pela Tesouraria
   */
  async sendPaymentDecisionEmail(
    to: string,
    studentName: string,
    invoiceNumber: string,
    isApproved: boolean,
    reason?: string,
  ): Promise<boolean> {
    const statusText = isApproved ? "Aprovado" : "Rejeitado";
    const statusColor = isApproved ? "#28a745" : "#dc3545";

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; padding: 24px;">
        <h2 style="color: #003366; margin-top: 0;">Conferência de Comprovativo de Pagamento</h2>
        <p>Prezado(a) <strong>${studentName}</strong>,</p>
        <p>O comprovativo bancário submetido para a fatura <strong>${invoiceNumber}</strong> foi avaliado pela Tesouraria:</p>
        <p style="font-size: 16px;"><strong>Decisão:</strong> <span style="color: ${statusColor}; font-weight: bold;">${statusText}</span></p>
        ${!isApproved && reason ? `<p><strong>Motivo da Rejeição:</strong> ${reason}</p>` : ""}
        ${isApproved ? "<p>A sua conta corrente foi devidamente creditada e a fatura encontra-se liquidada.</p>" : "<p>Por favor, regularize a sua pendência submetendo um novo documento válido ou dirija-se à Tesouraria.</p>"}
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="font-size: 12px; color: #999;">Tesouraria e Gestão Financeira - SIGA Universitário.</p>
      </div>
    `;

    return this.sendEmail({
      to,
      subject: `SIGA Universitário - Decisão sobre Pagamento (${invoiceNumber})`,
      html,
      text: `Prezado(a) ${studentName},\n\nO seu comprovativo referente a fatura ${invoiceNumber} foi ${statusText}.\n${!isApproved && reason ? "Motivo: " + reason : ""}`,
    });
  }
}
