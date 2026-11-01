describe('Regras de Negocio: Validacao de Matricula e Travas (RF-09, RF-10, RF-23)', () => {
  interface HorarioItem {
    dia: string;
    inicio: string;
    fim: string;
    sala?: string;
  }

  function converterHoraParaMinutos(horaStr: string): number {
    const [h, m] = horaStr.split(':').map(Number);
    return h * 60 + m;
  }

  function verificarChoqueHorario(
    h1: HorarioItem,
    h2: HorarioItem,
  ): boolean {
    if (h1.dia.toUpperCase() !== h2.dia.toUpperCase()) {
      return false;
    }
    const inicio1 = converterHoraParaMinutos(h1.inicio);
    const fim1 = converterHoraParaMinutos(h1.fim);
    const inicio2 = converterHoraParaMinutos(h2.inicio);
    const fim2 = converterHoraParaMinutos(h2.fim);

    // Ha choque se os intervalos de tempo se sobrepoem
    return Math.max(inicio1, inicio2) < Math.min(fim1, fim2);
  }

  function validarTetoCreditos(creditosAtuais: number, novosCreditos: number): boolean {
    const LIMITE_REGULAMENTAR_ECTS = 36;
    return creditosAtuais + novosCreditos <= LIMITE_REGULAMENTAR_ECTS;
  }

  function validarTravaFinanceira(faturasVencidas: Array<{ valorPendente: number }>): {
    adimplente: boolean;
    totalDivida: number;
  } {
    const totalDivida = faturasVencidas.reduce(
      (soma, f) => soma + f.valorPendente,
      0,
    );
    return {
      adimplente: faturasVencidas.length === 0 && totalDivida <= 0,
      totalDivida,
    };
  }

  describe('Deteccao de Conflito e Choque de Horarios (RF-10)', () => {
    it('deve detectar choque se duas aulas forem no mesmo dia e horários se sobrepuserem', () => {
      const aula1: HorarioItem = { dia: 'SEGUNDA', inicio: '08:00', fim: '10:00' };
      const aula2: HorarioItem = { dia: 'SEGUNDA', inicio: '09:00', fim: '11:00' };

      expect(verificarChoqueHorario(aula1, aula2)).toBe(true);
    });

    it('nao deve acusar choque para aulas em dias distintos', () => {
      const aula1: HorarioItem = { dia: 'SEGUNDA', inicio: '08:00', fim: '10:00' };
      const aula2: HorarioItem = { dia: 'TERCA', inicio: '08:00', fim: '10:00' };

      expect(verificarChoqueHorario(aula1, aula2)).toBe(false);
    });

    it('nao deve acusar choque para aulas contiguas (aula 1 termina quando aula 2 comeca)', () => {
      const aula1: HorarioItem = { dia: 'QUARTA', inicio: '08:00', fim: '10:00' };
      const aula2: HorarioItem = { dia: 'QUARTA', inicio: '10:00', fim: '12:00' };

      expect(verificarChoqueHorario(aula1, aula2)).toBe(false);
    });
  });

  describe('Teto Regulamentar de 36 ECTS por Semestre (RF-10)', () => {
    it('deve permitir inscricao dentro do teto de 36 ECTS', () => {
      const creditosJaInscritos = 24;
      const novosCreditos = 6;
      expect(validarTetoCreditos(creditosJaInscritos, novosCreditos)).toBe(true);
    });

    it('deve permitir inscricao exatamente no limite de 36 ECTS', () => {
      const creditosJaInscritos = 30;
      const novosCreditos = 6;
      expect(validarTetoCreditos(creditosJaInscritos, novosCreditos)).toBe(true);
    });

    it('deve bloquear inscricao que exceda o teto de 36 ECTS', () => {
      const creditosJaInscritos = 32;
      const novosCreditos = 6; // Total 38 > 36
      expect(validarTetoCreditos(creditosJaInscritos, novosCreditos)).toBe(false);
    });
  });

  describe('Trava Financeira Academica (RF-23)', () => {
    it('deve aprovar estudante com zero faturas vencidas', () => {
      const status = validarTravaFinanceira([]);
      expect(status.adimplente).toBe(true);
      expect(status.totalDivida).toBe(0);
    });

    it('deve bloquear estudante que possua faturas em atraso', () => {
      const status = validarTravaFinanceira([
        { valorPendente: 55000.0 },
        { valorPendente: 10000.0 },
      ]);
      expect(status.adimplente).toBe(false);
      expect(status.totalDivida).toBe(65000.0);
    });
  });
});

