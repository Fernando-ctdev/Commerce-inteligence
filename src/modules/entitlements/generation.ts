import { GenerationError } from "../commerce-intelligence/errors";
export function generationCapacityLimit(): number {
  const value = Number(process.env.GENERATED_CONTENTS_MONTH_LIMIT);
  if (!Number.isInteger(value) || value <= 0)
    throw new GenerationError(
      "GEN-CAPACITY",
      "Capacidade não configurada",
      false,
    );
  return value;
}
export function monthUtc(date = new Date()): string {
  return date.toISOString().slice(0, 7);
}
export function assertCapacity(used: number, requested: number): void {
  if (used + requested > generationCapacityLimit())
    throw new GenerationError("GEN-CAPACITY", "Capacidade mensal insuficiente");
}
