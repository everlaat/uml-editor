import type { Editor } from '../editor';
import { emptyDiagram, normalizeDiagram, uid, type Diagram } from '../core/model';
import { deleteDoc, listDocs, loadDoc, saveDoc, storageUsage } from '../core/storage';
import { download, pickFile, slugify } from '../io/export';
import { button, clearChildren, h, iconButton } from './dom';
import { icons } from './icons';
import { openModal } from './modal';
import { toast } from './toast';

export function openDocsModal(editor: Editor): void {
  openModal('Your diagrams', (modal) => {
    const list = h('div', { class: 'doc-list' });
    const usage = h('p', { class: 'palette-hint' });

    const refresh = () => {
      clearChildren(list);
      const docs = listDocs();
      const current = editor.store.doc.id;
      if (!docs.some((d) => d.id === current)) {
        editor.store.flush();
      }
      for (const summary of listDocs()) {
        const isCurrent = summary.id === current;
        const row = h(
          'div',
          { class: `doc-row ${isCurrent ? 'current' : ''}` },
          h(
            'button',
            {
              class: 'doc-open',
              type: 'button',
              on: {
                click: () => {
                  if (isCurrent) return modal.close();
                  const doc = loadDoc(summary.id);
                  if (!doc) return toast('That diagram could not be read', 'error');
                  editor.store.openDoc(doc);
                  editor.fit();
                  modal.close();
                },
              },
            },
            h('span', { class: 'doc-name', text: summary.name || 'Untitled' }),
            h('span', {
              class: 'doc-meta',
              text: `${summary.nodeCount} shapes · ${relativeTime(summary.updatedAt)}${isCurrent ? ' · open' : ''}`,
            }),
          ),
          h(
            'div',
            { class: 'doc-actions' },
            iconButton(icons.copy, 'Duplicate', () => {
              const doc = loadDoc(summary.id);
              if (!doc) return;
              const copy: Diagram = { ...doc, id: uid('d'), name: `${doc.name} copy`, updatedAt: Date.now() };
              saveDoc(copy);
              refresh();
              toast('Duplicated');
            }),
            iconButton(icons.download, 'Export JSON', () => {
              const doc = loadDoc(summary.id);
              if (!doc) return;
              download(`${slugify(doc.name)}.umlx.json`, JSON.stringify(doc, null, 2), 'application/json');
            }),
            iconButton(
              icons.trash,
              'Delete',
              () => {
                if (!confirm(`Delete “${summary.name}”? This cannot be undone.`)) return;
                deleteDoc(summary.id);
                if (summary.id === editor.store.doc.id) {
                  const next = listDocs()[0];
                  const doc = next ? loadDoc(next.id) : null;
                  editor.store.openDoc(doc ?? emptyDiagram());
                  editor.fit();
                }
                refresh();
              },
              'danger',
            ),
          ),
        );
        list.append(row);
      }
      if (!list.childElementCount) {
        list.append(h('p', { class: 'palette-hint', text: 'No saved diagrams yet.' }));
      }
      const { bytes, docs: count } = storageUsage();
      usage.textContent = `${count} saved in this browser · about ${formatBytes(bytes)} of local storage used. Nothing leaves your device.`;
    };

    modal.body.append(
      h(
        'div',
        { class: 'btn-row' },
        button('New diagram', () => {
          editor.store.flush();
          editor.store.openDoc(emptyDiagram('Untitled diagram'));
          editor.fit();
          modal.close();
        }, { class: 'primary' }),
        button('Import JSON…', async () => {
          const file = await pickFile('.json,application/json');
          if (!file) return;
          try {
            const doc = normalizeDiagram(JSON.parse(await file.text()), file.name.replace(/\.[^.]+$/, ''));
            doc.id = uid('d');
            saveDoc(doc);
            editor.store.openDoc(doc);
            editor.fit();
            modal.close();
            toast('Diagram imported');
          } catch {
            toast('That file is not a diagram JSON', 'error');
          }
        }),
      ),
      list,
      usage,
    );
    refresh();
  }, 620);
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return new Date(ts).toLocaleDateString();
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
