import { ValidationError } from '@testpilot/domain';
export type ValidationStage =
  | 'INPUT'
  | 'PARSE'
  | 'SCHEMA'
  | 'REFERENCE_MAPPING'
  | 'GROUNDING'
  | 'PLAN'
  | 'PERSISTENCE';
export type ReferenceCategory =
  'REQUIREMENT' | 'RISK' | 'OPERATION' | 'SCENARIO' | 'NONE';
export interface ValidationDiagnostic {
  stage: ValidationStage;
  code: 'AI_VALIDATION_REJECTED';
  rule: string;
  referenceCategory: ReferenceCategory;
  rejectionCount: number;
}
export class AiValidationError extends ValidationError {
  readonly diagnostic: ValidationDiagnostic;
  constructor(
    stage: ValidationStage,
    rule: string,
    referenceCategory: ReferenceCategory = 'NONE',
    rejectionCount = 1,
  ) {
    super('Invalid AI planning proposal.');
    this.diagnostic = {
      stage,
      code: 'AI_VALIDATION_REJECTED',
      rule,
      referenceCategory,
      rejectionCount,
    };
  }
}
