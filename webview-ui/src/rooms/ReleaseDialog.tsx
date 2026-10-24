import { useEffect } from 'react';

import { Button } from '../components/ui/Button.js';
import { Modal } from '../components/ui/Modal.js';
import {
  cancelRelease,
  confirmRelease,
  dismissReleaseNotice,
  useReleaseState,
} from './releaseStore.js';

const NOTICE_MS = 8_000;

const CONFIRM_LABEL: Record<string, string> = {
  'open-pr': 'Release anyway',
  agents: 'Close them and release',
  dirty: 'Stash and release',
};

export function ReleaseDialog() {
  const { prompt } = useReleaseState();
  return (
    <Modal
      isOpen={prompt !== null}
      onClose={cancelRelease}
      title={`Release ${prompt?.label ?? ''}?`}
    >
      {prompt && (
        <div className="px-10 pb-8 flex flex-col gap-10 max-w-[560px]">
          <p className="text-base m-0">{prompt.message}</p>
          {prompt.files.length > 0 && (
            <ul className="m-0 pl-18 list-disc max-h-[240px] overflow-y-auto pixel-scrollbar">
              {prompt.files.map((file) => (
                <li key={file} className="text-sm text-text-muted">
                  {file}
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-end gap-10">
            <Button onClick={cancelRelease}>Cancel</Button>
            <Button variant="accent" onClick={confirmRelease}>
              {(prompt.needs && CONFIRM_LABEL[prompt.needs]) ?? 'Release'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function ReleaseNotice() {
  const { notice, busy } = useReleaseState();
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(dismissReleaseNotice, NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);
  if (!notice && !busy) return null;
  return (
    <div
      className="absolute bottom-60 left-1/2 -translate-x-1/2 z-30 pixel-panel px-14 py-8 text-base max-w-[640px]"
      data-testid="release-notice"
    >
      {busy && !notice ? (
        <span className="text-text-muted">Releasing {busy}...</span>
      ) : (
        <span className={notice?.ok ? 'text-status-success' : 'text-danger'}>
          {notice?.message}
        </span>
      )}
    </div>
  );
}
