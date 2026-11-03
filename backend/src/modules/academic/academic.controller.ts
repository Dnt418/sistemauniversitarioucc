import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from "@nestjs/swagger";
import { UserRole } from "@prisma/client";

import { AcademicService } from "./academic.service";
import {
  CreateFacultyDto,
  CreateDepartmentDto,
  CreateCourseDto,
  CreateCurriculumDto,
  CreateDisciplineDto,
  CreateAcademicYearDto,
  CreateAcademicSemesterDto,
  CreateTurmaDto,
} from "./dto/academic.schema";
import { Roles } from "@common/decorators/roles.decorator";

@ApiTags("Estrutura Curricular e Cadastros Base")
@ApiBearerAuth("JWT-Auth")
@Controller("academic")
export class AcademicController {
  constructor(private readonly academicService: AcademicService) {}

  // ============================================================================
  // 1. UNIDADES ORGANICAS E CURSOS (RF-05)
  // ============================================================================

  @Post("faculties")
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Cadastra uma nova Faculdade/Instituto (RF-05)" })
  @ApiResponse({ status: 201, description: "Faculdade cadastrada com sucesso" })
  @ApiResponse({ status: 409, description: "Sigla ja em uso" })
  async createFaculty(@Body() dto: CreateFacultyDto) {
    return this.academicService.createFaculty(dto);
  }

  @Get("faculties")
  @ApiOperation({ summary: "Lista todas as Faculdades institucionais" })
  async listFaculties() {
    return this.academicService.listFaculties();
  }

  @Post("departments")
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Cadastra um Departamento vinculado a uma Faculdade (RF-05)",
  })
  async createDepartment(@Body() dto: CreateDepartmentDto) {
    return this.academicService.createDepartment(dto);
  }

  @Get("departments")
  @ApiQuery({ name: "facultyId", required: false })
  @ApiOperation({ summary: "Lista os Departamentos academicos" })
  async listDepartments(@Query("facultyId") facultyId?: string) {
    return this.academicService.listDepartments(facultyId);
  }

  @Post("courses")
  @Roles(UserRole.SUPER_ADMIN, UserRole.COORDENADOR)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Cadastra um novo Curso de graduacao ou pos-graduacao (RF-05)",
  })
  async createCourse(@Body() dto: CreateCourseDto) {
    return this.academicService.createCourse(dto);
  }

  @Get("courses")
  @ApiQuery({ name: "departmentId", required: false })
  @ApiOperation({ summary: "Lista os Cursos cadastrados" })
  async listCourses(@Query("departmentId") departmentId?: string) {
    return this.academicService.listCourses(departmentId);
  }

  @Get("courses/:id")
  @ApiOperation({
    summary: "Obtem detalhes completos de um Curso e suas grelhas",
  })
  async getCourseById(@Param("id", ParseUUIDPipe) id: string) {
    return this.academicService.getCourseById(id);
  }

  // ============================================================================
  // 2. GRELHA CURRICULAR E PRECEDENCIAS (RF-06)
  // ============================================================================

  @Post("curriculums")
  @Roles(UserRole.SUPER_ADMIN, UserRole.COORDENADOR)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Cria uma versao de Plano de Estudos / Grelha Curricular (RF-06)",
  })
  async createCurriculum(@Body() dto: CreateCurriculumDto) {
    return this.academicService.createCurriculum(dto);
  }

  @Get("courses/:courseId/curriculums")
  @ApiOperation({
    summary: "Lista as versoes de grelha curricular de um curso",
  })
  async listCurriculums(@Param("courseId", ParseUUIDPipe) courseId: string) {
    return this.academicService.listCurriculums(courseId);
  }

  @Post("disciplines")
  @Roles(UserRole.SUPER_ADMIN, UserRole.COORDENADOR)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Cadastra uma Disciplina e suas precedencias curriculares (RF-06)",
  })
  async createDiscipline(@Body() dto: CreateDisciplineDto) {
    return this.academicService.createDiscipline(dto);
  }

  @Get("curriculums/:id/matrix")
  @ApiOperation({
    summary:
      "Consulta a matriz curricular com cadeiras ordenadas por ano, semestre e precedencias",
  })
  async getCurriculumMatrix(@Param("id", ParseUUIDPipe) id: string) {
    return this.academicService.getCurriculumMatrix(id);
  }

  // ============================================================================
  // 3. PERIODOS LETIVOS E CALENDARIO ACADEMICO (RF-07)
  // ============================================================================

  @Post("years")
  @Roles(UserRole.SUPER_ADMIN, UserRole.SECRETARIA)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Abre e cadastra um novo Ano Academico (RF-07)" })
  async createAcademicYear(@Body() dto: CreateAcademicYearDto) {
    return this.academicService.createAcademicYear(dto);
  }

  @Get("years")
  @ApiOperation({ summary: "Lista todos os Anos Academicos cadastrados" })
  async listAcademicYears() {
    return this.academicService.listAcademicYears();
  }

  @Patch("years/:id/activate")
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: "Ativa um Ano Academico tornando-o o vigente na instituicao",
  })
  async activateAcademicYear(@Param("id", ParseUUIDPipe) id: string) {
    return this.academicService.activateAcademicYear(id);
  }

  @Post("semesters")
  @Roles(UserRole.SUPER_ADMIN, UserRole.SECRETARIA)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      "Configura Semestre Letivo com travas temporais compulsorias (RF-07)",
  })
  async createAcademicSemester(@Body() dto: CreateAcademicSemesterDto) {
    return this.academicService.createAcademicSemester(dto);
  }

  @Get("semesters/current")
  @ApiOperation({
    summary:
      "Obtem o Semestre Letivo corrente e o estado das janelas de matricula e pautas",
  })
  async getCurrentSemester() {
    return this.academicService.getCurrentSemester();
  }

  // ============================================================================
  // 4. PLANEJAMENTO E ABERTURA DE TURMAS (RF-08)
  // ============================================================================

  @Post("turmas")
  @Roles(UserRole.SUPER_ADMIN, UserRole.SECRETARIA, UserRole.COORDENADOR)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Planeja e abre uma Turma para o semestre (RF-08)" })
  async createTurma(@Body() dto: CreateTurmaDto) {
    return this.academicService.createTurma(dto);
  }

  @Get("turmas")
  @ApiQuery({ name: "academicSemesterId", required: false })
  @ApiQuery({ name: "disciplineId", required: false })
  @ApiQuery({ name: "regenteDocenteId", required: false })
  @ApiOperation({ summary: "Lista as turmas abertas por semestre ou cadeira" })
  async listTurmas(
    @Query("academicSemesterId") academicSemesterId?: string,
    @Query("disciplineId") disciplineId?: string,
    @Query("regenteDocenteId") regenteDocenteId?: string,
  ) {
    return this.academicService.listTurmas({
      academicSemesterId,
      disciplineId,
      regenteDocenteId,
    });
  }

  @Get("turmas/:id")
  @ApiOperation({
    summary: "Obtem detalhes da turma, cronograma e docente regente",
  })
  async getTurmaById(@Param("id", ParseUUIDPipe) id: string) {
    return this.academicService.getTurmaById(id);
  }
}
