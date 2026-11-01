import {
  PrismaClient,
  UserRole,
  AccountStatus,
  Gender,
  DocenteCategory,
  DocenteRegime,
  AcademicStatus,
} from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Iniciando carga de dados iniciais (Seed)...");

  const defaultPassword = await bcrypt.hash("Siga@2026!", 10);

  // 1. Super Administrador (Acesso Global)
  const adminEmail = "admin@siga.ao";
  const existingAdmin = await prisma.account.findUnique({
    where: { email: adminEmail },
  });

  if (!existingAdmin) {
    const admin = await prisma.account.create({
      data: {
        email: adminEmail,
        passwordHash: defaultPassword,
        status: AccountStatus.ACTIVE,
        roles: [UserRole.SUPER_ADMIN, UserRole.SECRETARIA],
        staffProfile: {
          create: {
            employeeNumber: "EMP-0001",
            identityCardNumber: "001122334LA042",
            fullName: "Administrador do Sistema SIGA",
            department: "Diretoria de Tecnologias de Informação",
            jobTitle: "Administrador de Sistemas",
            phoneNumber: "+244 923 000 001",
            isActive: true,
          },
        },
      },
      include: { staffProfile: true },
    });
    console.log(
      `✅ Super Admin criado: ${admin.email} (Perfil: ${admin.staffProfile?.fullName})`,
    );
  } else {
    console.log(`ℹ️ Super Admin já existe: ${adminEmail}`);
  }

  // 2. Docente de Teste
  const docenteEmail = "docente@siga.ao";
  const existingDocente = await prisma.account.findUnique({
    where: { email: docenteEmail },
  });

  if (!existingDocente) {
    const docente = await prisma.account.create({
      data: {
        email: docenteEmail,
        passwordHash: defaultPassword,
        status: AccountStatus.ACTIVE,
        roles: [UserRole.DOCENTE],
        docenteProfile: {
          create: {
            mechanographicNumber: "DOC-2026-001",
            identityCardNumber: "002233445LA043",
            fullName: "Prof. Dr. Manuel Afonso de Almeida",
            category: DocenteCategory.PROFESSOR_AUXILIAR,
            regime: DocenteRegime.INTEGRAL,
            academicDegree: "Doutoramento em Ciências da Computação",
            specialization: "Engenharia de Software e Algoritmos",
            phoneNumber: "+244 923 000 002",
            isActive: true,
          },
        },
      },
      include: { docenteProfile: true },
    });
    console.log(
      `✅ Docente criado: ${docente.email} (${docente.docenteProfile?.fullName})`,
    );
  }

  // 3. Estudante de Teste
  const estudanteEmail = "estudante@siga.ao";
  const existingEstudante = await prisma.account.findUnique({
    where: { email: estudanteEmail },
  });

  if (!existingEstudante) {
    const estudante = await prisma.account.create({
      data: {
        email: estudanteEmail,
        passwordHash: defaultPassword,
        status: AccountStatus.ACTIVE,
        roles: [UserRole.ESTUDANTE],
        studentProfile: {
          create: {
            studentNumber: "MAT-2026-0001",
            identityCardNumber: "003344556LA044",
            fullName: "António Kipungo Domingos",
            gender: Gender.MASCULINO,
            birthDate: new Date("2002-05-15"),
            academicStatus: AcademicStatus.REGULAR,
            currentYear: 2,
            phoneNumber: "+244 923 000 003",
          },
        },
      },
      include: { studentProfile: true },
    });
    console.log(
      `✅ Estudante criado: ${estudante.email} (${estudante.studentProfile?.fullName})`,
    );
  }

  // 4. Oficial da Tesouraria / Financeiro
  const financeiroEmail = "financeiro@siga.ao";
  const existingFinanceiro = await prisma.account.findUnique({
    where: { email: financeiroEmail },
  });

  if (!existingFinanceiro) {
    const financeiro = await prisma.account.create({
      data: {
        email: financeiroEmail,
        passwordHash: defaultPassword,
        status: AccountStatus.ACTIVE,
        roles: [UserRole.FINANCEIRO],
        staffProfile: {
          create: {
            employeeNumber: "FIN-0001",
            identityCardNumber: "004455667LA045",
            fullName: "Helena Teresa Sebastião",
            department: "Tesouraria e Gestão de Propinas",
            jobTitle: "Oficial de Tesouraria",
            phoneNumber: "+244 923 000 004",
            isActive: true,
          },
        },
      },
      include: { staffProfile: true },
    });
    console.log(
      `✅ Oficial Financeiro criado: ${financeiro.email} (${financeiro.staffProfile?.fullName})`,
    );
  }

  console.log("\n🎉 Seed finalizado com sucesso!");
  console.log("--------------------------------------------------");
  console.log("Credenciais padrão para desenvolvimento:");
  console.log("  Senha comum: Siga@2026!");
  console.log("  Super Admin: admin@siga.ao");
  console.log("  Docente:     docente@siga.ao");
  console.log("  Estudante:   estudante@siga.ao");
  console.log("  Financeiro:  financeiro@siga.ao");
  console.log("--------------------------------------------------");
}

main()
  .catch((e) => {
    console.error("❌ Erro durante execução do seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
