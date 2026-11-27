import { useCallback, useRef, useState } from 'react';
import { Download, FolderOpen, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import type { Editor } from '../model/store';
import { countBlocks } from '../model/tree';
import { getTemplate } from '../model/templates';
import { toJson } from '../interchange/json';
import { downloadText, readTextFile, slugify } from '../interchange/download';
import { TEMPLATE_LIST } from './templateList';
import { Modal } from './Modal';
import { ContextMenu, useContextMenu } from './ContextMenu';

/** Inline project manager: the sidebar's local "file list". */
export function ProjectsPanel({ editor }: { editor: Editor }) {
  const { projects, trash, activeProjectId, t, locale } = editor;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const closeNewProject = useCallback(() => setNewProjectOpen(false), []);
  const closeTrash = useCallback(() => setTrashOpen(false), []);
  const ctx = useContextMenu();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const time = (iso: string) => {
    const date = new Date(iso);
    return Number.isNaN(date.getTime())
      ? ''
      : date.toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US', {
          month: 'numeric',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
  };

  const commitRename = () => {
    if (editingId) editor.renameProject(editingId, draft);
    setEditingId(null);
  };

  const exportJson = (name: string, doc: Parameters<typeof toJson>[0]) =>
    downloadText(toJson(doc), `${slugify(name, 'diagram')}.json`, 'application/json;charset=utf-8');

  return (
    <>
      <section className="panel projects-panel">
      <header className="panel-head">
        <h2>{t('projects')}</h2>
        <div className="outline-tools">
          <span className="panel-note">{projects.length}</span>
          <button
            type="button"
            className="icon-btn is-mini"
            onClick={() => setNewProjectOpen(true)}
            title={t('projectNew')}
            aria-label={t('projectNew')}
          >
            <Plus size={14} strokeWidth={2} />
          </button>
        </div>
      </header>

      <p className="panel-hint project-hint">{t('projectHint')}</p>

      {projects.length === 0 ? (
        <p className="panel-hint">{t('projectEmpty')}</p>
      ) : (
        <ul className="project-list">
          {projects.map((project) => {
            const active = project.id === activeProjectId;
            return (
              <li
                key={project.id}
                className={`project-row${active ? ' is-active' : ''}`}
                onContextMenu={(event) =>
                  ctx.open(event, [
                    {
                      id: 'open',
                      label: t('projectOpen'),
                      icon: FolderOpen,
                      onSelect: () => editor.openProject(project.id),
                    },
                    {
                      id: 'rename',
                      label: t('projectRename'),
                      icon: Pencil,
                      onSelect: () => {
                        setEditingId(project.id);
                        setDraft(project.name);
                      },
                    },
                    {
                      id: 'export',
                      label: t('projectExport'),
                      icon: Download,
                      onSelect: () => exportJson(project.name, project.doc),
                    },
                    {
                      id: 'delete',
                      label: t('projectTrash'),
                      icon: Trash2,
                      danger: true,
                      onSelect: async () => {
                        if (
                          await editor.askConfirm(
                            t('projectDeleteConfirm'),
                            t('projectTrash'),
                            true,
                          )
                        ) {
                          editor.deleteProject(project.id);
                        }
                      },
                    },
                  ])
                }
              >
                {editingId === project.id ? (
                  <input
                    className="input project-name-input"
                    value={draft}
                    autoFocus
                    placeholder={t('projectNamePlaceholder')}
                    onChange={(event) => setDraft(event.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        commitRename();
                      } else if (event.key === 'Escape') {
                        event.preventDefault();
                        setEditingId(null);
                      }
                    }}
                    aria-label={t('projectNamePlaceholder')}
                  />
                ) : (
                  <button
                    type="button"
                    className="project-open"
                    onClick={() => editor.openProject(project.id)}
                    title={t('projectOpen')}
                  >
                    <span className="project-name">{project.name}</span>
                    <span className="project-meta">
                      {getTemplate(project.doc.meta.template).name[locale]} ·{' '}
                      {t('projectBlocks', { n: countBlocks(project.doc.root) })} · {time(project.updatedAt)}
                    </span>
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <button
        type="button"
        className={`trash-entry${trash.length ? '' : ' is-empty'}`}
        onClick={() => setTrashOpen(true)}
        title={t('trash')}
      >
        <span className="trash-icon">
          <Trash2 size={12} strokeWidth={1.9} />
        </span>
        <span className="trash-label">{t('trash')}</span>
        {trash.length ? <span className="trash-count">{trash.length}</span> : null}
      </button>


      <div className="project-controls">
        <button
          type="button"
          className="btn ghost"
          disabled={!editor.doc}
          onClick={() => editor.doc && exportJson(editor.doc.meta.title, editor.doc)}
        >
          {t('projectExport')}
        </button>
        <button type="button" className="btn ghost" onClick={() => fileRef.current?.click()}>
          {t('projectImport')}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,.pop,.txt,application/json,text/plain"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void readTextFile(file)
                .then((text) => editor.importProject(text, file.name))
                .catch(() => editor.notify(t('importFailed'), 'error'));
            }
            event.target.value = '';
          }}
        />
      </div>
      </section>

      {trashOpen ? (
        <Modal labelledBy="trash-title" onClose={closeTrash} wide>
          <h2 className="dialog-title" id="trash-title">
            {t('trash')}
          </h2>
          {trash.length === 0 ? (
            <p className="dialog-empty">{t('trashEmpty')}</p>
          ) : (
            <ul className="project-list is-trash">
              {trash.map((project) => (
                <li key={project.id} className="project-row">
                  <div className="project-open is-static">
                    <span className="project-name">{project.name}</span>
                    <span className="project-meta">
                      {getTemplate(project.doc.meta.template).name[locale]} ·{' '}
                      {t('projectBlocks', { n: countBlocks(project.doc.root) })} ·{' '}
                      {time(project.updatedAt)}
                    </span>
                  </div>
                  <div className="project-actions">
                    <button
                      type="button"
                      className="link-btn"
                      title={t('trashRestore')}
                      aria-label={t('trashRestore')}
                      onClick={() => editor.restoreProject(project.id)}
                    >
                      <RotateCcw size={13} strokeWidth={1.8} />
                    </button>
                    <button
                      type="button"
                      className="link-btn is-danger"
                      title={t('trashPurge')}
                      aria-label={t('trashPurge')}
                      onClick={() => editor.purgeProject(project.id)}
                    >
                      <Trash2 size={13} strokeWidth={1.8} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="dialog-actions">
            {trash.length ? (
              <button
                type="button"
                className="btn ghost is-danger"
                onClick={async () => {
                  if (await editor.askConfirm(t('trashEmptyConfirm'), t('trashEmptyAll'), true)) {
                    editor.emptyTrash();
                  }
                }}
              >
                {t('trashEmptyAll')}
              </button>
            ) : null}
            <button type="button" className="btn primary" onClick={closeTrash}>
              {t('close')}
            </button>
          </div>
        </Modal>
      ) : null}

      {newProjectOpen ? (
        <Modal labelledBy="new-project-title" onClose={closeNewProject} wide>
          <h2 className="dialog-title" id="new-project-title">{t('projectNew')}</h2>
          <p className="panel-hint">{t('projectNewHint')}</p>
          <div className="template-grid-modal">
            {TEMPLATE_LIST.map((id) => (
              <button
                key={id}
                type="button"
                className="template-option"
                onClick={() => {
                  editor.newProject(id);
                  closeNewProject();
                }}
              >
                <strong>{getTemplate(id).name[locale]}</strong>
                <span>{getTemplate(id).tagline[locale]}</span>
              </button>
            ))}
          </div>
          <div className="dialog-actions">
            <button type="button" className="btn ghost" onClick={closeNewProject}>
              {t('cancel')}
            </button>
          </div>
        </Modal>
      ) : null}

      {ctx.menu ? <ContextMenu menu={ctx.menu} onClose={ctx.close} /> : null}
    </>
  );
}
