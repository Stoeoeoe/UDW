import { z } from 'zod';

export const pixelPositionSchema = z
  .object({
    x: z.number().finite().int().nonnegative(),
    y: z.number().finite().int().nonnegative(),
  })
  .strict();
export const mapPositionSchema = z.union([
  pixelPositionSchema,
  z.object({ anchor: z.string().regex(/\S/) }).strict(),
]);
export type MapPosition = z.infer<typeof pixelPositionSchema>;
export type PositionArgument = z.infer<typeof mapPositionSchema>;
export type PlacementMode = 'tile' | 'pixel' | 'anchor';
export const positionPickerSchema = z
  .object({
    type: z.literal('position'),
    picker: z.literal('mapPosition'),
    coordinateSpace: z.literal('mapPixels'),
    origin: z.literal('topLeft'),
    placementModes: z
      .array(z.enum(['tile', 'pixel', 'anchor']))
      .nonempty()
      .refine((modes) => new Set(modes).size === modes.length),
    tileAnchor: z.literal('center'),
    characterPivot: z.literal('feet'),
  })
  .passthrough();
export function positionPickerMetadata(parameter: unknown) {
  const result = positionPickerSchema.safeParse(parameter);
  return result.success ? result.data : null;
}
export function isMapPosition(value: unknown): value is MapPosition {
  return pixelPositionSchema.safeParse(value).success;
}
export function pickMapPosition(
  tileX: number,
  tileY: number,
  tileSize: number,
  mode: PlacementMode,
): MapPosition {
  return mode === 'tile'
    ? {
        x: Math.floor((Math.floor(tileX) + 0.5) * tileSize),
        y: Math.floor((Math.floor(tileY) + 0.5) * tileSize),
      }
    : { x: Math.floor(tileX * tileSize), y: Math.floor(tileY * tileSize) };
}

export function isAnchorPosition(value: unknown): value is { anchor: string } {
  return mapPositionSchema.safeParse(value).success && !isMapPosition(value);
}
export function resolveMapPosition(
  value: unknown,
  anchors: readonly { id: string; position: [number, number] }[],
  width: number,
  height: number,
  tileSize: number,
): [number, number] | null {
  if (isAnchorPosition(value)) return anchors.find((a) => a.id === value.anchor)?.position ?? null;
  return isMapPosition(value) && value.x < width * tileSize && value.y < height * tileSize
    ? [value.x, value.y]
    : null;
}
