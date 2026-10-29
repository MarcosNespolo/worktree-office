import { useEffect } from 'react';

import type { WorktreeDisk } from '../../../core/src/messages.js';
import { diskBytes, driveName, isLow, measuredAgo } from './disk.js';
import { measureDisk, useDiskState } from './diskStore.js';
import { formatBytes } from './memory.js';
import { useRoomsState } from './roomsStore.js';
import { IconButton, UiButton } from './ui.js';

const COLUMNS = ['node_modules', 'builds', 'git', 'other', 'total'];

function columnsOf(entry: WorktreeDisk): number[] {
  const other = Math.max(
    0,
    entry.totalBytes - entry.modulesBytes - entry.buildBytes - entry.gitBytes,
  );
  return [entry.modulesBytes, entry.buildBytes, entry.gitBytes, other, entry.totalBytes];
}

interface DiskDialogProps {
  open: boolean;
  onClose: () => void;
  canMeasure: boolean;
}

export function DiskDialog({ open, onClose, canMeasure }: DiskDialogProps) {
  const disk = useDiskState();
  const { rooms } = useRoomsState();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const shown = new Set(rooms.map((room) => room.label));
  const totals = COLUMNS.map((_, index) =>
    disk.worktrees.reduce((sum, entry) => sum + columnsOf(entry)[index], 0),
  );
  const status = disk.scanning ? 'Measuring...' : measuredAgo(disk.measuredAt);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center pt-[10vh] bg-black/45"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      data-testid="disk-dialog"
    >
      <div className="w-[720px] max-w-[calc(100vw-32px)] max-h-[80vh] ui-panel ui-surface flex flex-col text-ink">
        <div className="flex items-center gap-8 px-16 pt-14 pb-8">
          <span className="flex-1 text-ui-lg font-semibold">Disk</span>
          <IconButton icon="close" label="Close (Esc)" onClick={onClose} />
        </div>
        <div className="flex flex-wrap gap-x-16 gap-y-4 px-16 pb-10 text-ui-sm">
          {disk.drives.map((drive) => (
            <span
              key={drive.root}
              className={isLow(drive) ? 'text-state-attention' : 'text-ink-muted'}
              data-testid="disk-drive"
            >
              <span className="font-semibold text-ink">{driveName(drive)}</span>{' '}
              {formatBytes(drive.freeBytes)} free of {formatBytes(drive.totalBytes)}
            </span>
          ))}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto pixel-scrollbar px-16">
          {disk.worktrees.length === 0 ? (
            <div className="py-12 text-ui-sm text-ink-muted">
              No measurement yet. The office measures the worktrees two minutes after it starts,
              then every 30 minutes.
            </div>
          ) : (
            <table className="w-full text-ui-sm border-collapse">
              <thead>
                <tr className="text-ui-2xs uppercase tracking-wide text-ink-faint">
                  <th className="text-left font-semibold py-6">Worktree</th>
                  {COLUMNS.map((column) => (
                    <th key={column} className="text-right font-semibold py-6 pl-12">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {disk.worktrees.map((entry) => (
                  <tr key={entry.path} className="border-t border-line" data-testid="disk-row">
                    <td className="py-6">
                      <span
                        className={`block truncate max-w-[240px] ${shown.has(entry.label) ? 'text-ink' : 'text-ink-muted'}`}
                        title={
                          shown.has(entry.label)
                            ? entry.path
                            : `${entry.path} (not shown in the office)`
                        }
                      >
                        {entry.label}
                      </span>
                    </td>
                    {columnsOf(entry).map((bytes, index) => (
                      <td
                        key={COLUMNS[index]}
                        className={`text-right pl-12 whitespace-nowrap ${index === COLUMNS.length - 1 ? 'font-semibold' : 'text-ink-muted'}`}
                      >
                        {diskBytes(bytes)}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="border-t-2 border-line">
                  <td className="py-6 font-semibold">All worktrees</td>
                  {totals.map((bytes, index) => (
                    <td
                      key={COLUMNS[index]}
                      className="text-right pl-12 whitespace-nowrap font-semibold"
                    >
                      {diskBytes(bytes)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          )}
          {disk.folders.length > 0 && (
            <div className="flex flex-col gap-4 py-10 text-ui-sm">
              {disk.folders.map((folder) => (
                <div
                  key={folder.path}
                  className="flex items-baseline gap-8"
                  title={folder.path}
                  data-testid="disk-folder"
                >
                  <span className="flex-1 truncate">{folder.label}</span>
                  <span
                    className={
                      folder.bytes === null ? 'text-ink-faint' : 'font-semibold whitespace-nowrap'
                    }
                  >
                    {folder.bytes === null ? 'not found' : diskBytes(folder.bytes)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-10 px-16 pt-8 pb-14">
          <span className="flex-1 text-ui-xs text-ink-muted" data-testid="disk-status">
            {status}
          </span>
          {canMeasure && (
            <UiButton
              variant="primary"
              disabled={disk.scanning}
              onClick={measureDisk}
              data-testid="disk-measure"
            >
              Measure now
            </UiButton>
          )}
        </div>
      </div>
    </div>
  );
}
