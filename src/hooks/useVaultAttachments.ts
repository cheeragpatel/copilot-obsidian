import { useCallback, useState } from "react";
import { Notice } from "obsidian";
import type { FileAttachment } from "../types/chat";
import type { CopilotPluginContext } from "../views/CopilotChatView";

interface FileWithPath extends File {
  path?: string;
}

function normalizePath(path: string): string {
  return path.replace(/^file:\/\//, "").replace(/\\/g, "/").replace(/\/+/g, "/");
}

function isFileDrag(dataTransfer: DataTransfer | null): boolean {
  return Array.from(dataTransfer?.types || []).includes("Files");
}

export interface VaultAttachmentsApi {
  attachments: FileAttachment[];
  isDragActive: boolean;
  addFiles: (files: ArrayLike<File>) => void;
  removeAttachment: (path: string) => void;
  clear: () => void;
  bindDropzone: {
    onDragEnter: (event: React.DragEvent<HTMLDivElement>) => void;
    onDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
    onDragLeave: (event: React.DragEvent<HTMLDivElement>) => void;
    onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  };
}

/**
 * Owns vault-aware file attachment state for the chat input: resolves dropped
 * or selected files against the current vault, dedupes, and exposes a
 * dropzone-binding helper.
 */
export function useVaultAttachments(ctx: CopilotPluginContext | null): VaultAttachmentsApi {
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);

  const resolveVaultAttachment = useCallback(
    (file: FileWithPath): FileAttachment | null => {
      const vault = ctx?.app?.vault;
      if (!vault) return null;

      const candidatePaths = new Set<string>();
      const basePath = vault.adapter?.getBasePath?.();
      const normalizedBasePath =
        typeof basePath === "string" && basePath.length > 0
          ? normalizePath(basePath).replace(/\/$/, "")
          : null;
      const rawPath = typeof file.path === "string" ? normalizePath(file.path) : "";
      const webkitPath =
        typeof file.webkitRelativePath === "string" && file.webkitRelativePath.length > 0
          ? normalizePath(file.webkitRelativePath)
          : "";

      if (rawPath) {
        if (normalizedBasePath && rawPath.startsWith(`${normalizedBasePath}/`)) {
          candidatePaths.add(rawPath.slice(normalizedBasePath.length + 1));
        }
        candidatePaths.add(rawPath.replace(/^\/+/, ""));
      }

      if (webkitPath) {
        candidatePaths.add(webkitPath.replace(/^\/+/, ""));
      }

      if (file.name) {
        candidatePaths.add(file.name);
      }

      for (const candidate of candidatePaths) {
        const normalizedCandidate = normalizePath(candidate).replace(/^\/+/, "");
        const abstractFile =
          vault.getAbstractFileByPath?.(normalizedCandidate) ||
          vault.getFileByPath?.(normalizedCandidate);
        if (abstractFile?.path) {
          return {
            path: abstractFile.path,
            name:
              typeof abstractFile.name === "string" && abstractFile.name.length > 0
                ? abstractFile.name
                : file.name || abstractFile.path.split("/").pop() || abstractFile.path,
            type: file.type || "application/octet-stream",
          };
        }
      }

      return null;
    },
    [ctx],
  );

  const addFiles = useCallback(
    (files: ArrayLike<File>) => {
      const resolved = Array.from(files, (file) => resolveVaultAttachment(file as FileWithPath));
      const valid = resolved.filter(
        (attachment): attachment is FileAttachment => attachment !== null,
      );
      const missing = resolved.length - valid.length;

      if (valid.length > 0) {
        setAttachments((current) => {
          const seen = new Set(current.map((a) => a.path));
          const next = valid.filter((a) => !seen.has(a.path));
          return next.length > 0 ? [...current, ...next] : current;
        });
      }

      if (missing > 0) {
        new Notice(
          `${missing} file${missing === 1 ? "" : "s"} could not be attached because they are outside the vault.`,
        );
      }
    },
    [resolveVaultAttachment],
  );

  const removeAttachment = useCallback((path: string) => {
    setAttachments((current) => current.filter((a) => a.path !== path));
  }, []);

  const clear = useCallback(() => {
    setAttachments([]);
    setIsDragActive(false);
  }, []);

  const onDragEnter = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!isFileDrag(event.dataTransfer)) return;
    event.preventDefault();
    setIsDragActive(true);
  }, []);

  const onDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!isFileDrag(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDragActive(true);
  }, []);

  const onDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setIsDragActive(false);
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!isFileDrag(event.dataTransfer)) return;
      event.preventDefault();
      setIsDragActive(false);
      if (event.dataTransfer.files.length > 0) {
        addFiles(Array.from(event.dataTransfer.files));
      }
    },
    [addFiles],
  );

  return {
    attachments,
    isDragActive,
    addFiles,
    removeAttachment,
    clear,
    bindDropzone: { onDragEnter, onDragOver, onDragLeave, onDrop },
  };
}
