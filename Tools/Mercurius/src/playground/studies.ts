export const checkpoints = [
  { name: 'Introduce', frame: 36 },
  { name: 'Follow', frame: 96 },
  { name: 'Focus', frame: 168 },
  { name: 'Hold', frame: 240 },
] as const;
export const studyTiming = {
  introduce: 0,
  follow: 60,
  focus: 135,
  hold: 210,
  duration: 270,
  fps: 30,
} as const;
export const studies = [
  {
    id: 'dependency',
    number: '01',
    name: 'Dependency',
    group: 'Diagrams',
    heading: 'Delivery needs\nInventory.',
    note: 'new Delivery(inventory)',
  },
  {
    id: 'sequence',
    number: '02',
    name: 'Sequence',
    group: 'Diagrams',
    heading: 'The delivery\ncall.',
    note: 'Solid: request / Dashed: response',
  },
  {
    id: 'state',
    number: '03',
    name: 'State machine',
    group: 'Diagrams',
    heading: 'Delivery\nstatus.',
    note: 'accept → deliver → complete',
  },
  {
    id: 'pipeline',
    number: '04',
    name: 'Data transformation',
    group: 'Diagrams',
    heading: 'From editor\nto game.',
    note: 'Authored content → runtime data',
  },
  {
    id: 'timeline',
    number: '05',
    name: 'Timeline',
    group: 'Diagrams',
    heading: 'Dialogue waits\nfor the camera.',
    note: 'Shared time axis / seconds',
  },
  {
    id: 'comparison',
    number: '06',
    name: 'Before / after',
    group: 'Diagrams',
    heading: 'Constructor\ninjection.',
    note: 'Cost: the caller must wire Inventory.',
  },
  {
    id: 'spatial',
    number: '07',
    name: 'Spatial overlay',
    group: 'Diagrams',
    heading: 'A route through\nthe market.',
    note: 'Schematic / not game footage',
  },
  {
    id: 'typography',
    number: '08',
    name: 'Type & colour',
    group: 'Foundations',
    heading: 'ROEMER',
    note: 'Cinzel / Gideon Roman / Noto Sans Mono',
  },
  {
    id: 'components',
    number: '09',
    name: 'Code & callouts',
    group: 'Foundations',
    heading: 'The constructor.',
    note: 'C# / constructor excerpt',
  },
] as const;
export type StudyId = (typeof studies)[number]['id'];
export const findStudy = (id: string) =>
  studies.find((study) => study.id === id);
