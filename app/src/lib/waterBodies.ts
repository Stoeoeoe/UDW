import type { ToolType } from '../types/editor';
import type { PropertyDefinition, WaterBodyDef } from '../types/schema';

/** The two tools that paint pixels, as opposed to drawing and removing currents. */
export function isWaterPaintTool(tool: ToolType): boolean {
  return tool === 'waterBrush' || tool === 'waterErase';
}

export function isWaterTool(tool: ToolType): boolean {
  return isWaterPaintTool(tool) || tool === 'waterFlow' || tool === 'waterFlowErase';
}

/** The mask value for the selected body (its list position + 1), or 0 when nothing is selected. */
export function waterBodyValue(bodies: WaterBodyDef[] | undefined, bodyId: string | null): number {
  const index = bodies?.findIndex((body) => body.id === bodyId) ?? -1;
  return index + 1;
}

/** Overlay colours for bodies, by position in the layer's list (value - 1). Distinct but all watery. */
const BODY_COLORS = [
  0x3182ce, 0x38b2ac, 0x805ad5, 0x38a169, 0xd69e2e, 0xdd6b20, 0xe53e3e, 0xd53f8c,
];

export function waterBodyColor(index: number): number {
  return BODY_COLORS[index % BODY_COLORS.length];
}

export function waterBodyColorCss(index: number): string {
  return `#${waterBodyColor(index).toString(16).padStart(6, '0')}`;
}

/** The profiles the project offers for water: the `waterType` tile property's options, minus None. */
export function getWaterTypeOptions(tileMetadataDefinitions: PropertyDefinition[]): string[] {
  const options =
    tileMetadataDefinitions.find((definition) => definition.key === 'waterType')?.constraints
      ?.options ?? [];
  return options.filter((option) => option !== 'None');
}

export function createWaterBody(id: string, name: string, waterType: string): WaterBodyDef {
  return { id, name, waterType, isFreshwater: false, flow: [] };
}

/** The next unused "Water N" name on a layer. */
export function nextWaterBodyName(bodies: WaterBodyDef[]): string {
  const names = new Set(bodies.map((body) => body.name));
  let n = bodies.length + 1;
  while (names.has(`Water ${n}`)) n++;
  return `Water ${n}`;
}
