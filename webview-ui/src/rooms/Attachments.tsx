import { useRef } from 'react';

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
      <button
        type="button"
        onClick={() => input.current?.click()}
        title="Attach images. You can also paste or drop them."
        className={`bg-transparent border-0 p-0 text-2xs text-accent-bright hover:text-accent cursor-pointer ${className}`}
        data-testid="attach-button"
      >
        attach
      </button>
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
    <div className="flex flex-wrap gap-6 px-8 py-4" data-testid="attachments">
      {attachments.items.map((item) => (
        <div
          key={item.id}
          className={`relative w-[48px] h-[48px] border-2 ${item.error ? 'border-danger' : 'border-border'}`}
          title={item.error ?? (item.path ? item.name : `Uploading ${item.name}...`)}
          data-testid="attachment"
          data-state={item.error ? 'error' : item.path ? 'ready' : 'uploading'}
        >
          <img
            src={item.previewUrl}
            alt={item.name}
            className={`w-full h-full object-cover ${item.path ? '' : 'opacity-50'}`}
          />
          <button
            type="button"
            onClick={() => attachments.remove(item.id)}
            title="Remove"
            className="absolute -top-6 -right-6 w-16 h-16 leading-none text-2xs bg-bg-dark text-text border-2 border-border cursor-pointer"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
