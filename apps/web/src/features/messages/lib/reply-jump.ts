export const JUMP_COMFORT = 24;

export interface JumpGeometry {
  itemBottom: number;
  itemTop: number;
  viewportBottom: number;
  viewportTop: number;
}

export function revealDelta(geometry: JumpGeometry): number {
  const { itemBottom, itemTop, viewportBottom, viewportTop } = geometry;

  const viewport = viewportBottom - viewportTop;
  const item = itemBottom - itemTop;

  if (itemTop >= viewportTop && itemBottom <= viewportBottom) {
    return 0;
  }

  const toTop = itemTop - (viewportTop + JUMP_COMFORT);
  const toBottom = itemBottom - (viewportBottom - JUMP_COMFORT);

  if (item + 2 * JUMP_COMFORT > viewport) {
    return toTop;
  }

  const above = itemTop < viewportTop;
  const travel = above ? -toTop : toBottom;

  if (travel > viewport) {
    return (itemTop + itemBottom) / 2 - (viewportTop + viewportBottom) / 2;
  }

  return above ? toTop : toBottom;
}
