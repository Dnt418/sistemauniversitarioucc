import { AcademicFinalState } from '@prisma/client';

describe('Regras de Negocio: Avaliacao, Ponderacao e Estados Academicos (RF-14, RF-15)', () => {
  /**
   * Formula de Media de Frequencia:
   * NF = (F1 * 0.4) + (F2 * 0.4) + (TP * 0.2)
   */
  function calcularNotaFrequencia(
    f1: number | null,
    f2: number | null,
    tp: number | null,
  ): number | null {
    if (f1 !== null && f2 !== null && tp !== null) {
      return Number((f1 * 0.4 + f2 * 0.4 + tp * 0.2).toFixed(2));
    }
    if (f1 !== null && f2 !== null) {
      return Number(((f1 + f2) / 2).toFixed(2));
    }
    if (f1 !== null) {
      return f1;
    }
    return null;
  }

  /**
   * Determinacao de Nota Final e Estado Academico
   */
  function apurarResultadoFinal(params: {
    notaFrequencia: number | null;
    exameNormal: number | null;
    exameRecurso: number | null;
    exameMelhoria: number | null;
    percentualFaltas: number;
  }): { notaFinal: number | null; estadoFinal: AcademicFinalState } {
    const {
      notaFrequencia,
      exameNormal,
      exameRecurso,
      exameMelhoria,
      percentualFaltas,
    } = params;

    // Regra Compulsoria de Assiduidade: > 25% de faltas injustificadas reprova diretamente
    if (percentualFaltas > 25.0) {
      return {
        notaFinal: exameRecurso ?? exameNormal ?? notaFrequencia ?? 0,
        estadoFinal: AcademicFinalState.REPROVADO_FALTA,
      };
    }

    if (exameMelhoria !== null) {
      return {
        notaFinal: exameMelhoria,
        estadoFinal: AcademicFinalState.APROVADO,
      };
    }

    if (exameRecurso !== null) {
      return {
        notaFinal: exameRecurso,
        estadoFinal:
          exameRecurso >= 10.0
            ? AcademicFinalState.APROVADO
            : AcademicFinalState.REPROVADO_NOTA,
      };
    }

    if (exameNormal !== null) {
      const calculada =
        notaFrequencia !== null
          ? Number((notaFrequencia * 0.4 + exameNormal * 0.6).toFixed(2))
          : exameNormal;

      return {
        notaFinal: calculada,
        estadoFinal:
          calculada >= 10.0
            ? AcademicFinalState.APROVADO
            : AcademicFinalState.ADMITIDO_RECURSO,
      };
    }

    if (notaFrequencia !== null) {
      if (notaFrequencia >= 14.0) {
        return {
          notaFinal: notaFrequencia,
          estadoFinal: AcademicFinalState.DISPENSADO_EXAME,
        };
      }
      return {
        notaFinal: notaFrequencia,
        estadoFinal: AcademicFinalState.ADMITIDO_RECURSO,
      };
    }

    return {
      notaFinal: null,
      estadoFinal: AcademicFinalState.ADMITIDO_RECURSO,
    };
  }

  describe('Calculo da Nota de Frequencia (NF)', () => {
    it('deve calcular a media ponderada com F1 (40%), F2 (40%) e TP (20%)', () => {
      const nf = calcularNotaFrequencia(16.0, 14.0, 18.0);
      // (16 * 0.4) + (14 * 0.4) + (18 * 0.2) = 6.4 + 5.6 + 3.6 = 15.6
      expect(nf).toBe(15.6);
    });

    it('deve calcular media simples se nao houver trabalho pratico (apenas F1 e F2)', () => {
      const nf = calcularNotaFrequencia(12.0, 16.0, null);
      // (12 + 16) / 2 = 14.0
      expect(nf).toBe(14.0);
    });

    it('deve manter apenas F1 se for a unica avaliacao lancada', () => {
      const nf = calcularNotaFrequencia(13.5, null, null);
      expect(nf).toBe(13.5);
    });
  });

  describe('Regulamento de Assiduidade e Faltas (RF-13)', () => {
    it('deve reprovar por falta caso o percentual de ausencias seja superior a 25%', () => {
      const resultado = apurarResultadoFinal({
        notaFrequencia: 18.0,
        exameNormal: 17.0,
        exameRecurso: null,
        exameMelhoria: null,
        percentualFaltas: 26.5,
      });

      expect(resultado.estadoFinal).toBe(AcademicFinalState.REPROVADO_FALTA);
    });

    it('deve permitir aprovacao normal se o percentual de faltas for igual ou inferior a 25%', () => {
      const resultado = apurarResultadoFinal({
        notaFrequencia: 16.0,
        exameNormal: 14.0,
        exameRecurso: null,
        exameMelhoria: null,
        percentualFaltas: 24.0,
      });

      expect(resultado.estadoFinal).toBe(AcademicFinalState.APROVADO);
    });
  });

  describe('Epocas de Exame e Transicoes de Estado (RF-14, RF-15)', () => {
    it('deve dispensar de exame se a nota de frequencia for maior ou igual a 14 valores', () => {
      const resultado = apurarResultadoFinal({
        notaFrequencia: 14.5,
        exameNormal: null,
        exameRecurso: null,
        exameMelhoria: null,
        percentualFaltas: 10.0,
      });

      expect(resultado.estadoFinal).toBe(AcademicFinalState.DISPENSADO_EXAME);
      expect(resultado.notaFinal).toBe(14.5);
    });

    it('deve admitir ao exame normal se a nota de frequencia for inferior a 14 valores', () => {
      const resultado = apurarResultadoFinal({
        notaFrequencia: 11.0,
        exameNormal: null,
        exameRecurso: null,
        exameMelhoria: null,
        percentualFaltas: 5.0,
      });

      expect(resultado.estadoFinal).toBe(AcademicFinalState.ADMITIDO_RECURSO);
      expect(resultado.notaFinal).toBe(11.0);
    });

    it('deve aprovar no Exame Normal com media ponderada (NF 40% + Exame 60%) >= 10 valores', () => {
      // NF = 10, Exame = 12 => (10 * 0.4) + (12 * 0.6) = 4.0 + 7.2 = 11.2
      const resultado = apurarResultadoFinal({
        notaFrequencia: 10.0,
        exameNormal: 12.0,
        exameRecurso: null,
        exameMelhoria: null,
        percentualFaltas: 8.0,
      });

      expect(resultado.estadoFinal).toBe(AcademicFinalState.APROVADO);
      expect(resultado.notaFinal).toBe(11.2);
    });

    it('deve admitir ao Recurso se a media ponderada no Exame Normal for < 10 valores', () => {
      // NF = 10, Exame = 8 => (10 * 0.4) + (8 * 0.6) = 4.0 + 4.8 = 8.8
      const resultado = apurarResultadoFinal({
        notaFrequencia: 10.0,
        exameNormal: 8.0,
        exameRecurso: null,
        exameMelhoria: null,
        percentualFaltas: 5.0,
      });

      expect(resultado.estadoFinal).toBe(AcademicFinalState.ADMITIDO_RECURSO);
      expect(resultado.notaFinal).toBe(8.8);
    });

    it('deve aprovar na epoca de Recurso se a nota for >= 10 valores', () => {
      const resultado = apurarResultadoFinal({
        notaFrequencia: 8.0,
        exameNormal: 7.0,
        exameRecurso: 13.0,
        exameMelhoria: null,
        percentualFaltas: 12.0,
      });

      expect(resultado.estadoFinal).toBe(AcademicFinalState.APROVADO);
      expect(resultado.notaFinal).toBe(13.0);
    });

    it('deve reprovar por nota na epoca de Recurso se a nota for < 10 valores', () => {
      const resultado = apurarResultadoFinal({
        notaFrequencia: 8.0,
        exameNormal: 7.0,
        exameRecurso: 9.0,
        exameMelhoria: null,
        percentualFaltas: 12.0,
      });

      expect(resultado.estadoFinal).toBe(AcademicFinalState.REPROVADO_NOTA);
      expect(resultado.notaFinal).toBe(9.0);
    });
  });
});

