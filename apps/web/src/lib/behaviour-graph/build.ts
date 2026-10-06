import { buildBehaviourGraph } from '@testpilot/behaviour-graph';
import {
  validateId,
  ValidationError,
  type ApiKnowledgeRepository,
  type BehaviourGraphRepository,
} from '@testpilot/domain';
export async function buildGraphForImport(
  imports: ApiKnowledgeRepository,
  graphs: BehaviourGraphRepository,
  workspaceId: string,
  projectId: string,
  importId: string,
) {
  validateId(importId);
  const source = (await imports.list(workspaceId, projectId)).find(
    (i) => i.id === importId,
  );
  if (!source) throw new ValidationError('Select an available API import.');
  return graphs.save(buildBehaviourGraph(source));
}
