import type { OfficeState } from '../office/engine/officeState.js';
import type { ToolActivity } from '../office/types.js';

export interface AgentNeed {
  id: number;
  room: string;
  title: string;
  kind: 'approval' | 'input';
}

const LOBBY_NAME = 'lobby';

export function collectAgentNeeds(
  officeState: OfficeState,
  agents: number[],
  agentStatuses: Record<number, string>,
  agentAwaitingInput: Record<number, boolean>,
  agentTools: Record<number, ToolActivity[]>,
): AgentNeed[] {
  const needs: AgentNeed[] = [];
  for (const id of agents) {
    const room = officeState.characters.get(id)?.directoryName ?? LOBBY_NAME;
    if (agentTools[id]?.some((tool) => tool.permissionWait && !tool.done)) {
      needs.push({ id, room, title: 'Needs approval', kind: 'approval' });
    } else if (agentStatuses[id] === 'waiting' && agentAwaitingInput[id]) {
      needs.push({ id, room, title: 'Waiting for your input', kind: 'input' });
    }
  }
  return needs;
}
