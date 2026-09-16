export class GenerationError<TCode extends string = string> extends Error {
  constructor(public readonly code: TCode, message: string, public readonly recoverable = true, public readonly detail?: unknown) { super(message); this.name = "GenerationError"; }
}

export const publicGenerationError = (code: string): string => ({
  "GEN-COUNT-REQUIRED": "Informe a quantidade de conteúdos.",
  "GEN-COUNT-RANGE": "A quantidade deve estar entre 1 e 10.",
  "GEN-ACTIVE": "Já existe uma análise em andamento.",
  "GEN-READY": "Este produto já possui conteúdos prontos.",
  "GEN-PRODUCT-CAPACITY": "O limite de Products ativos foi atingido. Arquive um Product para liberar espaço.",
  "GEN-CAPACITY": "A capacidade mensal de conteúdos foi atingida.",
  "GEN-PROVIDER": "Não foi possível concluir a análise. Tente novamente.",
  "GEN-SKILL": "A configuração de geração está indisponível. Tente novamente.",
}[code] ?? "Não foi possível concluir a análise. Tente novamente.");

// Mapeamento ÚNICO código→HTTP para todos os callers de geração (POST start e
// recuperação retry/complete): 409 conflito de estado, 429 capacidade mensal
// esgotada (Too Many Requests), 400 demais rejeições de entrada.
export const generationErrorStatus = (code: string): number =>
  code === "GEN-ACTIVE" || code === "GEN-READY" || code === "GEN-PRODUCT-CAPACITY"
    ? 409
    : code === "GEN-CAPACITY"
      ? 429
      : 400;
