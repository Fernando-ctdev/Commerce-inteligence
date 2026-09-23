-- ADR-021: estado terminal de geração parcial declarada (0 < D < N, F ≤ PARTIAL_FAILURE_CAP).
ALTER TYPE "CommerceIntelligenceJobStatus" ADD VALUE 'SUCCEEDED_PARTIAL';
