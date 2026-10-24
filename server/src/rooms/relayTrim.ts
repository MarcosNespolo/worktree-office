const MAX_TOOL_TEXT = 2_000;
const MAX_MESSAGE_TEXT = 4_000;

export function trimHookPayload(data: Record<string, unknown>): Record<string, unknown> {
  const trimmed: Record<string, unknown> = { ...data };
  delete trimmed.tool_response;
  const input = trimmed.tool_input;
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    const kept: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (typeof value === 'string') kept[key] = value.slice(0, MAX_TOOL_TEXT);
      else if (value === null || typeof value !== 'object') kept[key] = value;
    }
    trimmed.tool_input = kept;
  }
  if (typeof trimmed.last_assistant_message === 'string') {
    trimmed.last_assistant_message = trimmed.last_assistant_message.slice(-MAX_MESSAGE_TEXT);
  }
  return trimmed;
}
