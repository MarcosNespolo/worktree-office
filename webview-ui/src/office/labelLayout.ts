export interface LabelSlot {
  id: number;
  x: number;
  top: number;
  w: number;
  h: number;
  rank: number;
}

const LABEL_GAP_PX = 3;

function overlaps(a: LabelSlot, b: LabelSlot): boolean {
  return (
    Math.abs(a.x - b.x) * 2 < a.w + b.w + LABEL_GAP_PX * 2 &&
    a.top < b.top + b.h + LABEL_GAP_PX &&
    b.top < a.top + a.h + LABEL_GAP_PX
  );
}

export function placeLabels(slots: readonly LabelSlot[]): Map<number, number> {
  const order = [...slots].sort(
    (a, b) => a.rank - b.rank || b.top - a.top || a.x - b.x || a.id - b.id,
  );
  const placed: LabelSlot[] = [];
  const tops = new Map<number, number>();
  for (const slot of order) {
    const box = { ...slot };
    for (let guard = 0; guard <= placed.length; guard++) {
      const hit = placed.find((other) => overlaps(box, other));
      if (!hit) break;
      box.top = hit.top - box.h - LABEL_GAP_PX;
    }
    placed.push(box);
    tops.set(slot.id, box.top);
  }
  return tops;
}
