/**
 * Shared algorithms for map editor tools
 */

/**
 * Generator that yields all points along a line using Bresenham's algorithm.
 * @param x0 Starting X coordinate
 * @param y0 Starting Y coordinate
 * @param x1 Ending X coordinate
 * @param y1 Ending Y coordinate
 */
export function* bresenhamLine(
    x0: number,
    y0: number,
    x1: number,
    y1: number
): Generator<{ x: number; y: number }> {
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    let cx = x0;
    let cy = y0;

    do {
        yield { x: cx, y: cy };
        if (cx === x1 && cy === y1) break;
        const e2 = 2 * err;
        if (e2 > -dy) {
            err -= dy;
            cx += sx;
        }
        if (e2 < dx) {
            err += dx;
            cy += sy;
        }
    } while (true);
}

/**
 * Collect all points within a circular brush around a center point.
 * @param cx Center X coordinate
 * @param cy Center Y coordinate
 * @param radius Brush radius (1 = single tile, 2 = 3x3 area, etc.)
 */
export function* circularBrush(
    cx: number,
    cy: number,
    radius: number
): Generator<{ x: number; y: number }> {
    if (radius <= 1) {
        yield { x: cx, y: cy };
        return;
    }
    const r = radius - 1;
    for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist <= r) {
                yield { x: cx + dx, y: cy + dy };
            }
        }
    }
}

/**
 * Collect all points in a filled rectangle.
 * @param x0 First corner X
 * @param y0 First corner Y
 * @param x1 Second corner X
 * @param y1 Second corner Y
 */
export function* filledRect(
    x0: number,
    y0: number,
    x1: number,
    y1: number
): Generator<{ x: number; y: number }> {
    const minX = Math.min(x0, x1);
    const maxX = Math.max(x0, x1);
    const minY = Math.min(y0, y1);
    const maxY = Math.max(y0, y1);

    for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
            yield { x, y };
        }
    }
}

/**
 * Collect all points within a filled circle.
 * @param cx Center X
 * @param cy Center Y
 * @param radius Circle radius
 */
export function* filledCircle(
    cx: number,
    cy: number,
    radius: number
): Generator<{ x: number; y: number }> {
    const minX = Math.floor(cx - radius);
    const maxX = Math.ceil(cx + radius);
    const minY = Math.floor(cy - radius);
    const maxY = Math.ceil(cy + radius);

    for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
            const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
            if (dist <= radius) {
                yield { x, y };
            }
        }
    }
}
