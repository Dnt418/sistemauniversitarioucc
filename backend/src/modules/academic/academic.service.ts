import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "@infra/database/prisma.service";
import {
  CreateFacultyInput,
  CreateDepartmentInput,
  CreateCourseInput,
  CreateCurriculumInput,
  CreateDisciplineInput,
  CreateAcademicYearInput,
  CreateAcademicSemesterInput,
  CreateTurmaInput,
} from "./dto/academic.schema";

@Injectable()
export class AcademicService {
  private readonly logger = new Logger(AcademicService.name);

  constructor(private readonly prisma: PrismaService) {}

  // UNIDADES ORGANICAS E CURSOS (RF-05)

  async createFaculty(input: CreateFacultyInput) {
    const existing = await this.prisma.faculty.findUnique({
      where: { code: input.code },
    });

    if (existing) {
      throw new ConflictException(
        `Ja existe uma faculdade cadastrada com a sigla [${input.code}].`,
      );
    }

    return this.prisma.faculty.create({
      data: {
        code: input.code,
        name: input.name,
        description: input.description,
      },
    });
  }

  async listFaculties() {
    return this.prisma.faculty.findMany({
      include: {
        _count: {
          select: { departments: true },
        },
      },
      orderBy: { name: "asc" },
    });
  }

  async createDepartment(input: CreateDepartmentInput) {
    const faculty = await this.prisma.faculty.findUnique({
      where: { id: input.facultyId },
    });

    if (!faculty) {
      throw new NotFoundException("Faculdade de vinculo nao encontrada");
    }

    const existing = await this.prisma.department.findUnique({
      where: { code: input.code },
    });

    if (existing) {
      throw new ConflictException(
        `Ja existe um departamento cadastrado com a sigla [${input.code}].`,
      );
    }

    return this.prisma.department.create({
      data: {
        facultyId: input.facultyId,
        code: input.code,
        name: input.name,
      },
      include: { faculty: true },
    });
  }

  async listDepartments(facultyId?: string) {
    return this.prisma.department.findMany({
      where: facultyId ? { facultyId } : undefined,
      include: {
        faculty: { select: { id: true, code: true, name: true } },
        _count: {
          select: { courses: true, docentes: true },
        },
      },
      orderBy: { name: "asc" },
    });
  }

  async createCourse(input: CreateCourseInput) {
    const department = await this.prisma.department.findUnique({
      where: { id: input.departmentId },
    });

    if (!department) {
      throw new NotFoundException("Departamento de vinculo nao encontrado");
    }

    const existing = await this.prisma.course.findUnique({
      where: { code: input.code },
    });

    if (existing) {
      throw new ConflictException(
        `Ja existe um curso cadastrado com a sigla [${input.code}].`,
      );
    }

    return this.prisma.course.create({
      data: {
        departmentId: input.departmentId,
        code: input.code,
        name: input.name,
        degreeLevel: input.degreeLevel,
        regime: input.regime,
        durationYears: input.durationYears,
        totalCredits: input.totalCredits,
      },
      include: { department: true },
    });
  }

  async listCourses(departmentId?: string) {
    return this.prisma.course.findMany({
      where: departmentId ? { departmentId } : undefined,
      include: {
        department: { select: { id: true, code: true, name: true } },
        curriculums: {
          where: { isActive: true },
          select: { id: true, version: true, isActive: true },
        },
        _count: {
          select: { students: true },
        },
      },
      orderBy: { name: "asc" },
    });
  }

  async getCourseById(courseId: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      include: {
        department: {
          include: {
            faculty: true,
          },
        },
        curriculums: {
          include: {
            disciplines: {
              orderBy: [{ curricularYear: "asc" }, { semester: "asc" }],
            },
          },
        },
      },
    });

    if (!course) {
      throw new NotFoundException("Curso nao encontrado");
    }

    return course;
  }

  // GRELHA CURRICULAR E PRECEDENCIAS (RF-06)

  async createCurriculum(input: CreateCurriculumInput) {
    const course = await this.prisma.course.findUnique({
      where: { id: input.courseId },
    });

    if (!course) {
      throw new NotFoundException(
        "Curso nao encontrado para vinculacao da grelha",
      );
    }

    const existing = await this.prisma.curriculum.findUnique({
      where: {
        courseId_version: {
          courseId: input.courseId,
          version: input.version,
        },
      },
    });

    if (existing) {
      throw new ConflictException(
        `Ja existe um plano de estudos com a versao [${input.version}] para este curso.`,
      );
    }

    return this.prisma.curriculum.create({
      data: {
        courseId: input.courseId,
        version: input.version,
        isActive: input.isActive,
      },
      include: { course: true },
    });
  }

  async listCurriculums(courseId: string) {
    return this.prisma.curriculum.findMany({
      where: { courseId },
      include: {
        _count: {
          select: { disciplines: true },
        },
      },
      orderBy: { version: "desc" },
    });
  }

  async createDiscipline(input: CreateDisciplineInput) {
    const curriculum = await this.prisma.curriculum.findUnique({
      where: { id: input.curriculumId },
    });

    if (!curriculum) {
      throw new NotFoundException("Grelha curricular nao encontrada");
    }

    const existing = await this.prisma.discipline.findUnique({
      where: {
        curriculumId_code: {
          curriculumId: input.curriculumId,
          code: input.code,
        },
      },
    });

    if (existing) {
      throw new ConflictException(
        `Ja existe uma cadeira com o codigo [${input.code}] nesta grelha.`,
      );
    }

    // Criar a disciplina e suas precedencias atomicas
    return this.prisma.$transaction(async (tx) => {
      const discipline = await tx.discipline.create({
        data: {
          curriculumId: input.curriculumId,
          code: input.code,
          name: input.name,
          curricularYear: input.curricularYear,
          semester: input.semester,
          credits: input.credits,
          theoreticalHours: input.theoreticalHours,
          practicalHours: input.practicalHours,
          labHours: input.labHours,
        },
      });

      if (
        input.prerequisiteDisciplineIds &&
        input.prerequisiteDisciplineIds.length > 0
      ) {
        for (const prereqId of input.prerequisiteDisciplineIds) {
          if (prereqId === discipline.id) {
            throw new BadRequestException(
              "Uma disciplina nao pode ser precedencia de si mesma",
            );
          }

          await tx.prerequisite.create({
            data: {
              disciplineId: discipline.id,
              prerequisiteDisciplineId: prereqId,
            },
          });
        }
      }

      return tx.discipline.findUnique({
        where: { id: discipline.id },
        include: {
          prerequisites: {
            include: {
              prerequisiteDiscipline: {
                select: { id: true, code: true, name: true, credits: true },
              },
            },
          },
        },
      });
    });
  }

  async getCurriculumMatrix(curriculumId: string) {
    const curriculum = await this.prisma.curriculum.findUnique({
      where: { id: curriculumId },
      include: {
        course: {
          include: {
            department: { include: { faculty: true } },
          },
        },
        disciplines: {
          include: {
            prerequisites: {
              include: {
                prerequisiteDiscipline: {
                  select: {
                    id: true,
                    code: true,
                    name: true,
                    curricularYear: true,
                    semester: true,
                  },
                },
              },
            },
            isRequirementOf: {
              include: {
                discipline: {
                  select: {
                    id: true,
                    code: true,
                    name: true,
                    curricularYear: true,
                    semester: true,
                  },
                },
              },
            },
          },
          orderBy: [
            { curricularYear: "asc" },
            { semester: "asc" },
            { code: "asc" },
          ],
        },
      },
    });

    if (!curriculum) {
      throw new NotFoundException("Grelha curricular nao encontrada");
    }

    // Totalizadores estatisticos da grelha
    const totalCredits = curriculum.disciplines.reduce(
      (acc, curr) => acc + curr.credits,
      0,
    );
    const totalHours = curriculum.disciplines.reduce(
      (acc, curr) =>
        acc + curr.theoreticalHours + curr.practicalHours + curr.labHours,
      0,
    );

    return {
      curriculum: {
        id: curriculum.id,
        version: curriculum.version,
        isActive: curriculum.isActive,
        course: curriculum.course,
      },
      estatisticas: {
        totalDisciplinas: curriculum.disciplines.length,
        totalCreditos: totalCredits,
        totalCargaHoraria: totalHours,
      },
      disciplinas: curriculum.disciplines,
    };
  }

  // PERIODOS LETIVOS E CALENDARIO ACADEMICO (RF-07)

  async createAcademicYear(input: CreateAcademicYearInput) {
    const existing = await this.prisma.academicYear.findUnique({
      where: { code: input.code },
    });

    if (existing) {
      throw new ConflictException(
        `O ano academico [${input.code}] ja se encontra cadastrado.`,
      );
    }

    return this.prisma.academicYear.create({
      data: {
        code: input.code,
        startDate: input.startDate,
        endDate: input.endDate,
        isActive: input.isActive,
      },
    });
  }

  async listAcademicYears() {
    return this.prisma.academicYear.findMany({
      include: {
        semesters: {
          orderBy: { semesterNumber: "asc" },
        },
      },
      orderBy: { code: "desc" },
    });
  }

  async activateAcademicYear(academicYearId: string) {
    return this.prisma.$transaction(async (tx) => {
      // Desativa todos os outros anos
      await tx.academicYear.updateMany({
        data: { isActive: false },
      });

      // Ativa o ano selecionado
      return tx.academicYear.update({
        where: { id: academicYearId },
        data: { isActive: true },
        include: { semesters: true },
      });
    });
  }

  async createAcademicSemester(input: CreateAcademicSemesterInput) {
    const academicYear = await this.prisma.academicYear.findUnique({
      where: { id: input.academicYearId },
    });

    if (!academicYear) {
      throw new NotFoundException("Ano academico nao encontrado");
    }

    const existing = await this.prisma.academicSemester.findUnique({
      where: {
        academicYearId_semesterNumber: {
          academicYearId: input.academicYearId,
          semesterNumber: input.semesterNumber,
        },
      },
    });

    if (existing) {
      throw new ConflictException(
        `O semestre [${input.semesterNumber}º] ja foi criado para este ano academico.`,
      );
    }

    return this.prisma.academicSemester.create({
      data: {
        academicYearId: input.academicYearId,
        semesterNumber: input.semesterNumber,
        startDate: input.startDate,
        endDate: input.endDate,
        isCurrent: input.isCurrent,
        enrollmentStartDate: input.enrollmentStartDate,
        enrollmentEndDate: input.enrollmentEndDate,
        classesStartDate: input.classesStartDate,
        classesEndDate: input.classesEndDate,
        gradeSubmissionDeadline: input.gradeSubmissionDeadline,
        examRecursoDeadline: input.examRecursoDeadline,
      },
      include: { academicYear: true },
    });
  }

  async getCurrentSemester() {
    const semester = await this.prisma.academicSemester.findFirst({
      where: { isCurrent: true },
      include: { academicYear: true },
    });

    if (!semester) {
      throw new NotFoundException(
        "Nenhum semestre letivo ativo/corrente foi configurado no sistema.",
      );
    }

    const now = new Date();
    const isEnrollmentOpen =
      now >= semester.enrollmentStartDate && now <= semester.enrollmentEndDate;
    const isGradeSubmissionOpen = now <= semester.gradeSubmissionDeadline;

    return {
      semester,
      statusJanelas: {
        inscricaoAberta: isEnrollmentOpen,
        prazoLancamentoNotasAberto: isGradeSubmissionOpen,
        dataAtual: now.toISOString(),
      },
    };
  }

  // PLANEJAMENTO E ABERTURA DE TURMAS (RF-08)

  async createTurma(input: CreateTurmaInput) {
    const discipline = await this.prisma.discipline.findUnique({
      where: { id: input.disciplineId },
    });

    if (!discipline) {
      throw new NotFoundException(
        "Disciplina nao encontrada para criacao da turma",
      );
    }

    const semester = await this.prisma.academicSemester.findUnique({
      where: { id: input.academicSemesterId },
    });

    if (!semester) {
      throw new NotFoundException("Semestre academico nao encontrado");
    }

    if (input.regenteDocenteId) {
      const docente = await this.prisma.docenteProfile.findUnique({
        where: { id: input.regenteDocenteId },
      });
      if (!docente) {
        throw new NotFoundException("Docente regente indicado nao encontrado");
      }
    }

    const existing = await this.prisma.turma.findUnique({
      where: {
        disciplineId_academicSemesterId_code: {
          disciplineId: input.disciplineId,
          academicSemesterId: input.academicSemesterId,
          code: input.code,
        },
      },
    });

    if (existing) {
      throw new ConflictException(
        `Ja existe uma turma com o codigo [${input.code}] para esta cadeira no semestre indicado.`,
      );
    }

    return this.prisma.turma.create({
      data: {
        code: input.code,
        disciplineId: input.disciplineId,
        academicSemesterId: input.academicSemesterId,
        regenteDocenteId: input.regenteDocenteId || null,
        turno: input.turno,
        maxCapacity: input.maxCapacity,
        occupiedCapacity: 0,
        schedule: input.schedule,
      },
      include: {
        discipline: true,
        academicSemester: true,
        regenteDocente: true,
      },
    });
  }

  async listTurmas(params: {
    academicSemesterId?: string;
    disciplineId?: string;
    regenteDocenteId?: string;
  }) {
    return this.prisma.turma.findMany({
      where: {
        academicSemesterId: params.academicSemesterId,
        disciplineId: params.disciplineId,
        regenteDocenteId: params.regenteDocenteId,
        isActive: true,
      },
      include: {
        discipline: {
          select: {
            id: true,
            code: true,
            name: true,
            credits: true,
            curricularYear: true,
          },
        },
        academicSemester: {
          select: {
            id: true,
            semesterNumber: true,
            academicYear: { select: { code: true } },
          },
        },
        regenteDocente: {
          select: {
            id: true,
            fullName: true,
            mechanographicNumber: true,
            category: true,
          },
        },
      },
      orderBy: [{ discipline: { name: "asc" } }, { code: "asc" }],
    });
  }

  async getTurmaById(turmaId: string) {
    const turma = await this.prisma.turma.findUnique({
      where: { id: turmaId },
      include: {
        discipline: {
          include: {
            curriculum: {
              include: { course: true },
            },
          },
        },
        academicSemester: {
          include: { academicYear: true },
        },
        regenteDocente: true,
      },
    });

    if (!turma) {
      throw new NotFoundException("Turma nao encontrada");
    }

    return turma;
  }
}
