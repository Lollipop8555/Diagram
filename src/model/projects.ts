import type { DiagramDoc } from './types';

/** One remembered diagram: the list is the local "file system" of the app. */
export interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  doc: DiagramDoc;
}

export const PROJECTS_KEY = 'macaron.projects.v1';
export const ACTIVE_PROJECT_KEY = 'macaron.activeProject.v1';

/** Live projects plus the ones sitting in the trash. */
export interface Library {
  projects: Project[];
  trash: Project[];
}

let seq = 0;

export function projectId(): string {
  seq += 1;
  return `p${Date.now().toString(36)}${seq.toString(36)}`;
}

/** Storage can be missing (tests, private mode), so every access is guarded. */
function safeGet(key: string): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function isProject(item: unknown): item is Project {
  return (
    Boolean(item) &&
    typeof item === 'object' &&
    typeof (item as Project).id === 'string' &&
    typeof (item as Project).name === 'string' &&
    Boolean((item as Project).doc?.root)
  );
}

/** Reads the library; the pre-trash format (a bare array) is migrated on the fly. */
export function loadLibrary(): Library {
  const raw = safeGet(PROJECTS_KEY);
  if (!raw) return { projects: [], trash: [] };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return { projects: parsed.filter(isProject), trash: [] };
    if (parsed && typeof parsed === 'object') {
      const value = parsed as Partial<Library>;
      return {
        projects: Array.isArray(value.projects) ? value.projects.filter(isProject) : [],
        trash: Array.isArray(value.trash) ? value.trash.filter(isProject) : [],
      };
    }
    return { projects: [], trash: [] };
  } catch {
    return { projects: [], trash: [] };
  }
}

export function saveLibrary(library: Library): boolean {
  return safeSet(PROJECTS_KEY, JSON.stringify(library));
}

export function loadActiveProjectId(): string | null {
  return safeGet(ACTIVE_PROJECT_KEY);
}

export function saveActiveProjectId(id: string | null): void {
  if (id === null) {
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(ACTIVE_PROJECT_KEY);
    } catch {
      // ignore
    }
    return;
  }
  safeSet(ACTIVE_PROJECT_KEY, id);
}

/** A readable default name, avoiding duplicates already used in the list. */
export function nextProjectName(base: string, list: Project[]): string {
  const trimmed = base.trim() || '未命名图表';
  const used = new Set(list.map((project) => project.name));
  if (!used.has(trimmed)) return trimmed;
  let index = 2;
  while (used.has(`${trimmed} (${index})`)) index += 1;
  return `${trimmed} (${index})`;
}

export function makeProject(doc: DiagramDoc, name: string | undefined, list: Project[] = []): Project {
  const now = new Date().toISOString();
  return {
    id: projectId(),
    name: nextProjectName(name ?? doc.meta.title ?? '', list),
    createdAt: now,
    updatedAt: doc.meta.updatedAt || now,
    doc,
  };
}

/** Insert or replace by id; newest first. */
export function upsertProject(list: Project[], project: Project): Project[] {
  const index = list.findIndex((item) => item.id === project.id);
  if (index < 0) return [project, ...list];
  const next = list.slice();
  next[index] = project;
  return next;
}

export function removeProject(list: Project[], id: string): Project[] {
  return list.filter((item) => item.id !== id);
}

/** Move a project to the trash, remembering it so it can be restored. */
export function trashProject(library: Library, id: string): Library {
  const project = library.projects.find((item) => item.id === id);
  if (!project) return library;
  return {
    projects: library.projects.filter((item) => item.id !== id),
    trash: [project, ...library.trash],
  };
}

/** Pull a project back out of the trash; the name is de-duplicated on the way in. */
export function restoreProject(library: Library, id: string): Library {
  const project = library.trash.find((item) => item.id === id);
  if (!project) return library;
  return {
    projects: [
      { ...project, name: nextProjectName(project.name, library.projects) },
      ...library.projects,
    ],
    trash: library.trash.filter((item) => item.id !== id),
  };
}

/** Drop a single project for good. */
export function purgeProject(library: Library, id: string): Library {
  return { ...library, trash: library.trash.filter((item) => item.id !== id) };
}

/** Empty the trash — the only way to really remove a project. */
export function emptyTrash(library: Library): Library {
  return { ...library, trash: [] };
}
