import { useState } from "react";

type TreeNode = {
  name: string;
  path: string;
  count: number;
  children: TreeNode[];
};

function buildTree(folders: string[]): TreeNode[] {
  type Raw = { path: string; children: Record<string, Raw> };
  const root: Record<string, Raw> = {};

  for (const f of folders) {
    if (!f) continue;
    const parts = f.split("/").filter(Boolean);
    let cursor = root;
    let pathSoFar = "";
    for (const part of parts) {
      pathSoFar = pathSoFar ? `${pathSoFar}/${part}` : part;
      if (!cursor[part]) cursor[part] = { path: pathSoFar, children: {} };
      cursor = cursor[part].children;
    }
  }

  function toNodes(obj: Record<string, Raw>): TreeNode[] {
    return Object.entries(obj)
      .map(([name, v]) => ({
        name,
        path: v.path,
        count: 0,
        children: toNodes(v.children),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  return toNodes(root);
}

function TreeItem({
  node,
  selected,
  onSelect,
  depth,
  countFor,
}: {
  node: TreeNode;
  selected: string | null;
  onSelect: (path: string) => void;
  depth: number;
  countFor: (path: string) => number;
}) {
  const [open, setOpen] = useState(depth < 1);
  const hasChildren = node.children.length > 0;
  return (
    <div>
      <div className="brain-tree-row" style={{ paddingLeft: depth * 14 }}>
        {hasChildren ? (
          <button
            type="button"
            className="brain-tree-toggle"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? "▾" : "▸"}
          </button>
        ) : (
          <span className="brain-tree-toggle-spacer" />
        )}
        <button
          type="button"
          className={"brain-tree-label" + (selected === node.path ? " active" : "")}
          onClick={() => onSelect(node.path)}
        >
          📁 {node.name} <span className="brain-tree-count">{countFor(node.path)}</span>
        </button>
      </div>
      {open &&
        hasChildren &&
        node.children.map((c) => (
          <TreeItem
            key={c.path}
            node={c}
            selected={selected}
            onSelect={onSelect}
            depth={depth + 1}
            countFor={countFor}
          />
        ))}
    </div>
  );
}

export default function BrainFolderTree({
  notes,
  selectedFolder,
  onSelectFolder,
}: {
  notes: { folder?: string }[];
  selectedFolder: string | null;
  onSelectFolder: (path: string | null) => void;
}) {
  const folders = Array.from(new Set(notes.map((n) => n.folder).filter((f): f is string => !!f)));
  const tree = buildTree(folders);
  const noFolderCount = notes.filter((n) => !n.folder).length;

  function countFor(path: string) {
    return notes.filter((n) => n.folder === path || n.folder?.startsWith(path + "/")).length;
  }

  return (
    <div className="brain-tree">
      <button
        type="button"
        className={"brain-tree-label brain-tree-root" + (selectedFolder === null ? " active" : "")}
        onClick={() => onSelectFolder(null)}
      >
        🧠 Todas las notas <span className="brain-tree-count">{notes.length}</span>
      </button>
      {tree.map((n) => (
        <TreeItem key={n.path} node={n} selected={selectedFolder} onSelect={onSelectFolder} depth={0} countFor={countFor} />
      ))}
      {noFolderCount > 0 && (
        <button
          type="button"
          className={"brain-tree-label" + (selectedFolder === "" ? " active" : "")}
          onClick={() => onSelectFolder("")}
        >
          — Sin carpeta <span className="brain-tree-count">{noFolderCount}</span>
        </button>
      )}
    </div>
  );
}
