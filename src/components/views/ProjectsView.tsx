import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  PROJECT_STATUS_META,
  type ProjectStatus,
  type ProjectSummary,
  shortDate,
} from "../../util";
import { FolderIcon } from "../icons";

export default function ProjectsView({
  onOpen,
  workspaceId,
}: {
  onOpen: (projectId: Id<"tasks">) => void;
  workspaceId?: Id<"workspaces"> | null;
}) {
  const projects = useQuery(api.projects.listMyProjects, {
    ...(workspaceId ? { workspaceId } : {}),
  });

  if (projects === undefined) {
    return (
      <div className="screen">
        <div className="screen-scroll">
          <p className="screen-empty">Cargando…</p>
        </div>
      </div>
    );
  }

  const personal = projects.filter((p) => !p.teamId);
  const team = projects.filter((p) => p.teamId);

  function renderCard(p: ProjectSummary) {
    const meta = PROJECT_STATUS_META[p.projectStatus as ProjectStatus];
    return (
      <button
        key={p._id}
        className="project-card"
        onClick={() => onOpen(p._id as Id<"tasks">)}
      >
        <div className="project-card-head">
          <FolderIcon size={18} />
          <span className="project-card-title">{p.title}</span>
          <span
            className="project-status-chip"
            style={{ background: meta.color }}
          >
            {meta.label}
          </span>
        </div>
        <div className="project-card-body">
          <div className="project-progress">
            <div className="project-progress-bar">
              <div
                className="project-progress-fill"
                style={{ width: `${p.progress}%`, background: meta.color }}
              />
            </div>
            <span className="project-progress-pct">{p.progress}%</span>
          </div>
          <div className="project-card-meta">
            <span>
              {p.taskCount === 1 ? "1 tarea" : `${p.taskCount} tareas`}
            </span>
            {p.teamName && <span>· {p.teamName}</span>}
            {p.leadName && <span>· {p.leadName}</span>}
            {p.endDate && <span>· entrega {shortDate(p.endDate)}</span>}
          </div>
          {p.tags.length > 0 && (
            <div className="project-tags">
              {p.tags.map((t) => (
                <span key={t} className="project-tag">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      </button>
    );
  }

  return (
    <div className="screen">
      <header className="screen-head" style={{ color: "#7c3aed" }}>
        <h1>Proyectos</h1>
        <p className="screen-sub">
          Convierte cualquier tarea en proyecto desde su panel de detalle
          para gestionar tareas, subtareas, hitos y un tablero kanban.
        </p>
      </header>
      <div className="screen-scroll">
        {projects.length === 0 && (
          <div className="screen-empty">
            <p>
              Todavía no tienes proyectos. Abre una tarea y pulsa
              "Convertir en proyecto" para crear el primero.
            </p>
          </div>
        )}

        {personal.length > 0 && (
          <section className="task-group">
            <div className="group-label">
              Personales <span className="group-count">{personal.length}</span>
            </div>
            <div className="project-grid">{personal.map(renderCard)}</div>
          </section>
        )}
        {team.length > 0 && (
          <section className="task-group">
            <div className="group-label">
              De equipo <span className="group-count">{team.length}</span>
            </div>
            <div className="project-grid">{team.map(renderCard)}</div>
          </section>
        )}
      </div>
    </div>
  );
}
