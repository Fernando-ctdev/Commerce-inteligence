export class GenerationError extends Error {
  constructor(public readonly code: string, message: string, public readonly recoverable = true, public readonly detail?: unknown) { super(message); this.name = "GenerationError"; }
}

export const publicGenerationError = (code: string): string => ({
  "GEN-COUNT-REQUIRED": "Informe a quantidade de conteúdos.",
  "GEN-COUNT-RANGE": "A quantidade deve estar entre 1 e 30.",
  "GEN-ACTIVE": "Já existe uma análise em andamento.",
  "GEN-PRODUCT-CAPACITY": "O limite de Products ativos foi atingido. Arquive um Product para liberar espaço.",
  "GEN-CAPACITY": "A capacidade mensal de conteúdos foi atingida.",
  "GEN-PROVIDER": "Não foi possível concluir a análise. Tente novamente.",
  "GEN-SKILL": "A configuração de geração está indisponível. Tente novamente.",
}[code] ?? "Não foi possível concluir a análise. Tente novamente.");
