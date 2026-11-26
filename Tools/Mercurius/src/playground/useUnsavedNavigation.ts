import { useEffect } from 'react';

export const useUnsavedNavigation = (dirty: boolean) => {
  useEffect(() => {
    const guard = (event: Event) => {
      if (
        dirty &&
        !window.confirm(
          'Leave with unsaved changes? Save or download them first to keep your work.',
        )
      )
        event.preventDefault();
    };
    window.addEventListener('mercurius-navigate', guard);
    return () => window.removeEventListener('mercurius-navigate', guard);
  }, [dirty]);
};
