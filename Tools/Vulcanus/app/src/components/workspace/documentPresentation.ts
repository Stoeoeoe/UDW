import {
  FiBox,
  FiClock,
  FiCode,
  FiDatabase,
  FiMusic,
  FiFilm,
  FiGrid,
  FiHexagon,
  FiMap,
  FiMessageSquare,
  FiPackage,
  FiSettings,
  FiShoppingBag,
  FiSliders,
  FiStar,
  FiUsers,
} from 'react-icons/fi';
import type { IconType } from 'react-icons';
import type { EditorLayout } from '../common/EditorDocumentFrame';
import type { WorkspaceDocument } from '../../types/workspace';
import type { EditorStore } from '../../store/useEditorStore';

/** Adding a document kind requires choosing its shared layout and icon at compile time. */
export const documentPresentation: Record<
  WorkspaceDocument['kind'],
  { layout: EditorLayout; icon: IconType }
> = {
  location: { layout: 'canvas', icon: FiMap },
  tileset: { layout: 'canvas', icon: FiGrid },
  character: { layout: 'sequence', icon: FiUsers },
  characters: { layout: 'sequence', icon: FiUsers },
  entity: { layout: 'form', icon: FiBox },
  entities: { layout: 'form', icon: FiBox },
  item: { layout: 'form', icon: FiPackage },
  items: { layout: 'form', icon: FiPackage },
  shop: { layout: 'form', icon: FiShoppingBag },
  quest: { layout: 'canvas', icon: FiStar },
  object: { layout: 'canvas', icon: FiHexagon },
  routine: { layout: 'sequence', icon: FiClock },
  dialogue: { layout: 'sequence', icon: FiMessageSquare },
  dialogues: { layout: 'sequence', icon: FiMessageSquare },
  cutscene: { layout: 'canvas', icon: FiFilm },
  cutscenes: { layout: 'canvas', icon: FiFilm },
  settings: { layout: 'utility', icon: FiSettings },
  configuration: { layout: 'utility', icon: FiSliders },
  data: { layout: 'utility', icon: FiDatabase },
  scripting: { layout: 'utility', icon: FiCode },
  music: { layout: 'form', icon: FiMusic },
};

/** Read live names so renaming a resource does not leave the document header stale. */
export function documentTitle(document: WorkspaceDocument, state: EditorStore): string {
  switch (document.kind) {
    case 'location':
      return state.maps.find((m) => m.id === document.mapId)?.name ?? document.label;
    case 'tileset':
      return state.tilesets.get(document.tilesetId)?.name ?? document.label;
    case 'character':
      return state.characters.find((c) => c.id === document.characterId)?.name ?? document.label;
    case 'entity':
      return (
        state.entityTypes.find((e) => e.id === document.entityTypeId)?.displayName ?? document.label
      );
    case 'item':
      return state.items.find((i) => i.id === document.itemId)?.name ?? document.label;
    case 'shop':
      return state.shops.find((s) => s.id === document.shopId)?.name ?? document.label;
    case 'quest':
      return state.quests.find((q) => q.id === document.questId)?.title ?? document.label;
    case 'object':
      return state.objects.find((o) => o.id === document.objectId)?.name ?? document.label;
    case 'dialogue':
      return state.dialogues.get(document.dialogueId)?.name ?? document.label;
    case 'cutscene':
      return state.cutsceneLabels[document.cutsceneId] || document.label;
    case 'routine': {
      const routine = state.routines.find((r) => r.id === document.routineId);
      return state.characters.find((c) => c.id === routine?.character)?.name ?? document.label;
    }
    default:
      return document.label;
  }
}
