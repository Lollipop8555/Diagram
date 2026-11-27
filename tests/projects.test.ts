import { describe, expect, it } from 'vitest';
import type { DiagramDoc } from '../src/model/types';
import type { Library } from '../src/model/projects';
import {
  emptyTrash,
  loadLibrary,
  makeProject,
  nextProjectName,
  purgeProject,
  removeProject,
  restoreProject,
  saveLibrary,
  trashProject,
  upsertProject,
} from '../src/model/projects';

function doc(title = '支付系统'): DiagramDoc {
  return {
    version: 3,
    meta: {
      title,
      template: 'layered',
      direction: 'top-down',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    },
    root: {
      id: 'b1',
      title,
      layout: { kind: 'linear', axis: 'y' },
      skin: { kind: 'plain', tone: 'paper' },
      children: [],
    },
    relations: [],
  };
}

describe('nextProjectName', () => {
  it('keeps a unique name and appends an index when taken', () => {
    const existing = [makeProject(doc(), '图表', [])];
    expect(nextProjectName('新图表', existing)).toBe('新图表');
    expect(nextProjectName('图表', existing)).toBe('图表 (2)');
    expect(nextProjectName('  ', existing)).toBe('未命名图表');
  });
});

describe('makeProject', () => {
  it('wraps a document with id, timestamps and a de-duplicated name', () => {
    const first = makeProject(doc(), undefined, []);
    expect(first.doc.meta.title).toBe('支付系统');
    expect(first.name).toBe('支付系统');
    expect(first.updatedAt).toBe('2026-01-02T00:00:00.000Z');
    expect(first.id).not.toBe('');

    const second = makeProject(doc(), undefined, [first]);
    expect(second.id).not.toBe(first.id);
    expect(second.name).toBe('支付系统 (2)');
  });
});

describe('upsertProject', () => {
  it('inserts newest first and replaces in place', () => {
    const a = makeProject(doc('A'), 'A', []);
    const b = makeProject(doc('B'), 'B', []);
    const list = upsertProject(upsertProject([], a), b);
    expect(list.map((p) => p.name)).toEqual(['B', 'A']);

    const renamed = { ...a, name: 'A2' };
    const next = upsertProject(list, renamed);
    expect(next).toHaveLength(2);
    expect(next.find((p) => p.id === a.id)?.name).toBe('A2');
  });
});

describe('removeProject', () => {
  it('drops only the requested id', () => {
    const a = makeProject(doc('A'), 'A', []);
    const b = makeProject(doc('B'), 'B', []);
    expect(removeProject([a, b], a.id).map((p) => p.id)).toEqual([b.id]);
    expect(removeProject([a, b], 'missing')).toHaveLength(2);
  });
});

describe('trash', () => {
  it('moves a project to the trash and keeps it recoverable', () => {
    const a = makeProject(doc('A'), 'A', []);
    const library = { projects: [a], trash: [] };
    const trashed = trashProject(library, a.id);
    expect(trashed.projects).toHaveLength(0);
    expect(trashed.trash.map((p) => p.id)).toEqual([a.id]);
  });

  it('restores a project and de-duplicates a name that is taken again', () => {
    const a = makeProject(doc('A'), 'A', []);
    const b = makeProject(doc('B'), 'B', [a]);
    const trashed = trashProject({ projects: [a, b], trash: [] }, a.id);
    const restored = restoreProject(trashed, a.id);
    expect(restored.trash).toHaveLength(0);
    expect(restored.projects).toHaveLength(2);
    expect(restored.projects[0].name).toBe('A');

    // A new project took the name "A" while the first one sat in the trash.
    const taken = makeProject(doc('A'), 'A', []);
    const clash = restoreProject({ projects: [taken], trash: [a] }, a.id);
    expect(clash.projects[0].name).toBe('A (2)');
  });

  it('purges one project and empties the whole trash', () => {
    const a = makeProject(doc('A'), 'A', []);
    const b = makeProject(doc('B'), 'B', []);
    let library: Library = { projects: [], trash: [a, b] };
    library = purgeProject(library, a.id);
    expect(library.trash.map((p) => p.id)).toEqual([b.id]);
    expect(emptyTrash(library).trash).toHaveLength(0);
  });
});

describe('storage helpers without a DOM', () => {
  it('degrades to an empty library / failed write instead of throwing', () => {
    expect(loadLibrary()).toEqual({ projects: [], trash: [] });
    expect(saveLibrary({ projects: [], trash: [] })).toBe(false);
  });
});
