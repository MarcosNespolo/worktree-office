import { STATE_COLOR, STATE_LABEL, type StateView } from './workState.js';

export function StateChip({ view }: { view: StateView }) {
  const color = STATE_COLOR[view.state];
  return (
    <span
      className="inline-flex items-center gap-6 h-[22px] px-8 rounded-full text-ui-xs font-semibold whitespace-nowrap"
      style={{ color, background: `color-mix(in srgb, ${color} 16%, transparent)` }}
      data-testid="state-chip"
      data-state={view.state}
    >
      <span className="w-[7px] h-[7px] rounded-full shrink-0" style={{ background: color }} />
      {STATE_LABEL[view.state]}
      {view.detail ? ` · ${view.detail}` : ''}
    </span>
  );
}
