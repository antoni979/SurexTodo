import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

// Convierte [[Título]] y [[Título|Alias]] en enlaces markdown normales que
// apuntan a un esquema propio ("brainlink://"), para que react-markdown los
// procese como <a> y podamos interceptarlos con un renderer a medida.
function wikilinksToMarkdown(body: string): string {
  return body.replace(
    /\[\[([^\]|]+)(\|([^\]]+))?\]\]/g,
    (_match, title: string, _pipe: string | undefined, alias: string | undefined) => {
      const t = title.trim();
      const label = (alias ?? t).trim();
      return `[${label}](brainlink://${encodeURIComponent(t)})`;
    },
  );
}

export default function BrainMarkdown({
  body,
  existingTitles,
  onNavigate,
  onCreateMissing,
}: {
  body: string;
  existingTitles: Set<string>;
  onNavigate: (title: string) => void;
  onCreateMissing: (title: string) => void;
}) {
  const transformed = wikilinksToMarkdown(body);

  const components: Components = {
    a: ({ href, children }) => {
      if (href?.startsWith("brainlink://")) {
        const title = decodeURIComponent(href.replace("brainlink://", ""));
        const exists = existingTitles.has(title);
        return (
          <button
            type="button"
            className={"wikilink" + (exists ? "" : " wikilink-broken")}
            title={exists ? title : `Crear nota "${title}"`}
            onClick={() => (exists ? onNavigate(title) : onCreateMissing(title))}
          >
            {children}
          </button>
        );
      }
      return (
        <a href={href} target="_blank" rel="noreferrer">
          {children}
        </a>
      );
    },
  };

  return (
    <div className="brain-markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {transformed}
      </ReactMarkdown>
    </div>
  );
}
