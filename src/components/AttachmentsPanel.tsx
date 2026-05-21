import { useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { DownloadIcon, PaperclipIcon, TrashIcon } from "./icons";

function humanSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

export default function AttachmentsPanel({
  taskId,
}: {
  taskId: Id<"tasks">;
}) {
  const items = useQuery(api.attachments.listAttachments, { taskId });
  const generateUploadUrl = useMutation(api.attachments.generateUploadUrl);
  const addAttachment = useMutation(api.attachments.addAttachment);
  const deleteAttachment = useMutation(api.attachments.deleteAttachment);

  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function uploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const list = Array.from(files);
      for (let i = 0; i < list.length; i++) {
        const file = list[i];
        setProgress(`Subiendo ${i + 1}/${list.length}: ${file.name}`);
        const url = await generateUploadUrl();
        const result = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!result.ok) throw new Error("Fallo al subir el archivo");
        const { storageId } = (await result.json()) as {
          storageId: Id<"_storage">;
        };
        await addAttachment({
          taskId,
          storageId,
          name: file.name,
          size: file.size,
          mimeType: file.type || "application/octet-stream",
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al subir");
    } finally {
      setUploading(false);
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const list = items ?? [];

  return (
    <div className="attachments">
      <div className="subtasks-header">
        <span>Adjuntos</span>
        {list.length > 0 && (
          <span className="subtasks-count">{list.length}</span>
        )}
      </div>
      <div className="attachments-list">
        {list.map((a) => (
          <div key={a._id} className="attachment-row">
            <PaperclipIcon size={14} />
            <div className="attachment-info">
              <a
                href={a.url ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="attachment-name"
                title={a.name}
              >
                {a.name}
              </a>
              <span className="attachment-size">{humanSize(a.size)}</span>
            </div>
            {a.url && (
              <a
                href={a.url}
                download={a.name}
                target="_blank"
                rel="noopener noreferrer"
                className="icon-btn"
                title="Descargar"
              >
                <DownloadIcon size={14} />
              </a>
            )}
            <button
              className="icon-btn"
              title="Eliminar"
              onClick={() => {
                if (confirm(`¿Eliminar ${a.name}?`))
                  void deleteAttachment({ attachmentId: a._id });
              }}
            >
              <TrashIcon size={13} />
            </button>
          </div>
        ))}
      </div>
      <label
        className={"attachment-drop" + (uploading ? " busy" : "")}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (!uploading) void uploadFiles(e.dataTransfer.files);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          disabled={uploading}
          onChange={(e) => void uploadFiles(e.target.files)}
        />
        <PaperclipIcon size={15} />
        <span>
          {uploading
            ? progress ?? "Subiendo…"
            : "Arrastra archivos o haz clic para adjuntar"}
        </span>
      </label>
      {error && <div className="composer-error">{error}</div>}
    </div>
  );
}
