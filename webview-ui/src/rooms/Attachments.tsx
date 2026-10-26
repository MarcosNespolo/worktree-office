import { useRef } from 'react';

import { IconButton } from './ui.js';
import type { AttachmentsApi } from './useAttachments.js';

export function AttachButton({
  attachments,
  className = '',
}: {
  attachments: AttachmentsApi;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <IconButton
        icon="add_photo_alternate"
        label="Attach images. You can also paste or drop them."
        onClick={() => input.current?.click()}
        className={className}
        data-testid="attach-button"
      />
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        multiple
        className="hidden"
        onChange={(event) => {
          if (event.target.files) attachments.add(event.target.files);
          event.target.value = '';
        }}
        data-testid="attach-input"
      />
    </>
  );
}

export function AttachmentList({ attachments }: { attachments: AttachmentsApi }) {
  if (attachments.items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-8 pb-8" data-testid="attachments">
      {attachments.items.map((item) => (
        <div
          key={item.id}
          className={`relative w-[56px] h-[56px] rounded-[8px] border ${item.error ? 'border-state-failed' : 'border-line'}`}
          title={item.error ?? (item.path ? item.name : `Uploading ${item.name}...`)}
          data-testid="attachment"
          data-state={item.error ? 'error' : item.path ? 'ready' : 'uploading'}
        >
          <img
            src={item.previewUrl}
            alt={item.name}
            className={`w-full h-full object-cover rounded-[7px] ${item.path ? '' : 'opacity-50'}`}
          />
          <button
            type="button"
            onClick={() => attachments.remove(item.id)}
            title="Remove"
            aria-label="Remove"
            className="absolute -top-6 -right-6 w-[18px] h-[18px] rounded-full flex items-center justify-center text-[12px] leading-none bg-surface-raised text-ink border border-line-strong cursor-pointer"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
