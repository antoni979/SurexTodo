import { useEffect, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";
import { select } from "d3-selection";
import { zoom, zoomIdentity } from "d3-zoom";
import { drag } from "d3-drag";

type GNode = SimulationNodeDatum & { id: string; title: string };
type GEdge = SimulationLinkDatum<GNode>;

export default function BrainGraphView({
  onOpenNote,
}: {
  onOpenNote: (id: Id<"brainNotes">) => void;
}) {
  const data = useQuery(api.brain.getGraph);
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 800, h: 560 });

  useEffect(() => {
    function measure() {
      if (containerRef.current) {
        const r = containerRef.current.getBoundingClientRect();
        setSize({ w: Math.max(320, r.width), h: Math.max(360, r.height) });
      }
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    if (!data || !svgRef.current) return;
    const { w, h } = size;

    const nodes: GNode[] = data.nodes.map((n: { id: string; title: string }) => ({
      id: n.id,
      title: n.title,
    }));
    const edges: GEdge[] = data.edges.map((e: { source: string; target: string }) => ({
      source: e.source,
      target: e.target,
    }));

    const svg = select(svgRef.current);
    svg.selectAll("*").remove();

    const g = svg.append("g");

    const zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on("zoom", (event) => g.attr("transform", event.transform));
    svg.call(zoomBehavior);
    svg.call(zoomBehavior.transform, zoomIdentity);

    const linkSel = g
      .append("g")
      .attr("class", "brain-graph-links")
      .selectAll("line")
      .data(edges)
      .join("line")
      .attr("class", "brain-graph-link");

    const nodeSel = g
      .append("g")
      .attr("class", "brain-graph-nodes")
      .selectAll<SVGGElement, GNode>("g")
      .data(nodes)
      .join("g")
      .attr("class", "brain-graph-node")
      .on("click", (_event, d) => onOpenNote(d.id as Id<"brainNotes">));

    nodeSel.append("circle").attr("r", 9);
    nodeSel
      .append("text")
      .text((d) => d.title)
      .attr("x", 13)
      .attr("y", 4);

    const sim = forceSimulation<GNode>(nodes)
      .force(
        "link",
        forceLink<GNode, GEdge>(edges)
          .id((d) => d.id)
          .distance(95)
          .strength(0.6),
      )
      .force("charge", forceManyBody().strength(-220))
      .force("center", forceCenter(w / 2, h / 2))
      .force("collide", forceCollide(46));

    sim.on("tick", () => {
      linkSel
        .attr("x1", (d) => (d.source as GNode).x ?? 0)
        .attr("y1", (d) => (d.source as GNode).y ?? 0)
        .attr("x2", (d) => (d.target as GNode).x ?? 0)
        .attr("y2", (d) => (d.target as GNode).y ?? 0);
      nodeSel.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    nodeSel.call(
      drag<SVGGElement, GNode>()
        .on("start", (event, d) => {
          if (!event.active) sim.alphaTarget(0.25).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on("drag", (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on("end", (event, d) => {
          if (!event.active) sim.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        }),
    );

    return () => {
      sim.stop();
    };
  }, [data, size, onOpenNote]);

  if (data && data.nodes.length === 0) {
    return (
      <p className="sidebar-empty">
        Aún no hay notas para dibujar el grafo. Crea alguna y enlázala con [[otra]].
      </p>
    );
  }

  return (
    <div className="brain-graph-container" ref={containerRef}>
      <svg ref={svgRef} width={size.w} height={size.h} />
    </div>
  );
}
