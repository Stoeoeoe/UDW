export interface RecentProject {
    name: string;
    path: string;
    lastOpened: number;
}

const RECENT_PROJECTS_KEY = 'recent_projects';
const MAX_RECENT_PROJECTS = 5;

export const recentProjects = {
    get: (): RecentProject[] => {
        const stored = localStorage.getItem(RECENT_PROJECTS_KEY);
        if (!stored) return [];
        try {
            return JSON.parse(stored).sort((a: RecentProject, b: RecentProject) => b.lastOpened - a.lastOpened);
        } catch (e) {
            console.error('Failed to parse recent projects', e);
            return [];
        }
    },

    add: (name: string, path: string) => {
        const current = recentProjects.get();
        const existingIndex = current.findIndex(p => p.path === path);

        const newProject: RecentProject = {
            name,
            path,
            lastOpened: Date.now()
        };

        let updated;
        if (existingIndex > -1) {
            updated = [...current];
            updated[existingIndex] = newProject;
        } else {
            updated = [newProject, ...current].slice(0, MAX_RECENT_PROJECTS);
        }

        updated.sort((a, b) => b.lastOpened - a.lastOpened);
        localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(updated));
    },

    remove: (path: string) => {
        const current = recentProjects.get();
        const updated = current.filter(p => p.path !== path);
        localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(updated));
    }
};
