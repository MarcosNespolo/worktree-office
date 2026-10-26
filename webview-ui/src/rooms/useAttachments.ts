import { useCallback, useEffect, useRef, useState } from 'react';

import { isImageFile, uploadImage } from './uploads.js';

export interface Attachment {
  id: string;
  name: string;
  previewUrl: string;
  path: string | null;
  error: string | null;
}

export interface AttachmentsApi {
  items: Attachment[];
  paths: string[];
  uploading: boolean;
  add: (files: Iterable<File>) => void;
  remove: (id: string) => void;
  clear: () => void;
  onPaste: (event: React.ClipboardEvent) => void;
  onDrop: (event: React.DragEvent) => void;
  onDragOver: (event: React.DragEvent) => void;
}

let nextId = 0;

export function useAttachments(): AttachmentsApi {
  const [items, setItems] = useState<Attachment[]>([]);
  const urls = useRef(new Set<string>());

  useEffect(() => {
    const owned = urls.current;
    return () => {
      for (const url of owned) URL.revokeObjectURL(url);
      owned.clear();
    };
  }, []);

  const add = useCallback((files: Iterable<File>) => {
    for (const file of files) {
      if (!isImageFile(file)) continue;
      const id = `att-${nextId++}`;
      const previewUrl = URL.createObjectURL(file);
      urls.current.add(previewUrl);
      setItems((list) => [...list, { id, name: file.name, previewUrl, path: null, error: null }]);
      uploadImage(file).then(
        (path) => setItems((list) => list.map((a) => (a.id === id ? { ...a, path } : a))),
        (err: unknown) =>
          setItems((list) =>
            list.map((a) =>
              a.id === id ? { ...a, error: err instanceof Error ? err.message : String(err) } : a,
            ),
          ),
      );
    }
  }, []);

  const remove = useCallback((id: string) => {
    setItems((list) => {
      const gone = list.find((a) => a.id === id);
      if (gone) {
        URL.revokeObjectURL(gone.previewUrl);
        urls.current.delete(gone.previewUrl);
      }
      return list.filter((a) => a.id !== id);
    });
  }, []);

  const clear = useCallback(() => {
    setItems((list) => {
      for (const a of list) {
        URL.revokeObjectURL(a.previewUrl);
        urls.current.delete(a.previewUrl);
      }
      return [];
    });
  }, []);

  const onPaste = useCallback(
    (event: React.ClipboardEvent) => {
      const files = [...event.clipboardData.files].filter(isImageFile);
      if (files.length === 0) return;
      event.preventDefault();
      add(files);
    },
    [add],
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      const files = [...event.dataTransfer.files].filter(isImageFile);
      if (files.length === 0) return;
      event.preventDefault();
      add(files);
    },
    [add],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    if ([...event.dataTransfer.items].some((item) => item.kind === 'file')) event.preventDefault();
  }, []);

  return {
    items,
    paths: items.flatMap((a) => (a.path ? [a.path] : [])),
    uploading: items.some((a) => a.path === null && a.error === null),
    add,
    remove,
    clear,
    onPaste,
    onDrop,
    onDragOver,
  };
}
