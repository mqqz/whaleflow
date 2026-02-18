import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { Button } from "./ui/button";
import { LiveTransaction } from "../hooks/useLiveTransactions";
import { detectAddressTag } from "../data/addressLabels";

interface GraphNode {
  id: string;
  type: "whale" | "exchange" | "contract" | "wallet";
  value: number;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  value: number;
  type: "inflow" | "outflow";
}

interface NetworkGraphProps {
  network: string;
  transactions: LiveTransaction[];
  selectedWallet: string | null;
  onWalletSelect: (wallet: string) => void;
}

const MAX_NODES = 24;
const MAX_LINKS = 40;
const STRONG_CHARGE = -220;
const WEAK_CHARGE = -14;
const STRONG_COLLISION_PAD = 14;
const WEAK_COLLISION_PAD = 8;
const LINK_DISTANCE = 115;
const LINK_STRENGTH = 0.045;

const isRoleLabel = (value: string) =>
  value.includes("Aggressive") ||
  value.includes("Passive") ||
  value.includes("Buyer") ||
  value.includes("Seller");

const classifyNodeType = (id: string, amount: number): GraphNode["type"] => {
  const label = detectAddressTag(id);
  if (isRoleLabel(id) || label === "exchange") {
    return "exchange";
  }

  if (
    id.toLowerCase() === "unknown" ||
    label === "router" ||
    label === "bridge" ||
    label === "contract"
  ) {
    return "contract";
  }

  if (amount >= 100) {
    return "whale";
  }

  return "wallet";
};

const mergeNodeType = (current: GraphNode["type"], next: GraphNode["type"]): GraphNode["type"] => {
  const weight: Record<GraphNode["type"], number> = {
    whale: 4,
    exchange: 3,
    contract: 2,
    wallet: 1,
  };

  return weight[next] > weight[current] ? next : current;
};

const buildGraphData = (transactions: LiveTransaction[]) => {
  const nodes = new Map<string, GraphNode>();
  const links = new Map<
    string,
    { source: string; target: string; value: number; netVolume: number }
  >();

  for (const tx of transactions) {
    const amount = Number.parseFloat(tx.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      continue;
    }

    const sourceId = tx.from || "unknown";
    const targetId = tx.to || "unknown";

    if (!nodes.has(sourceId)) {
      nodes.set(sourceId, {
        id: sourceId,
        type: classifyNodeType(sourceId, amount),
        value: amount,
      });
    } else {
      const source = nodes.get(sourceId)!;
      source.value += amount;
      source.type = mergeNodeType(source.type, classifyNodeType(sourceId, amount));
    }

    if (!nodes.has(targetId)) {
      nodes.set(targetId, {
        id: targetId,
        type: classifyNodeType(targetId, amount),
        value: amount,
      });
    } else {
      const target = nodes.get(targetId)!;
      target.value += amount;
      target.type = mergeNodeType(target.type, classifyNodeType(targetId, amount));
    }

    const key = `${sourceId}=>${targetId}`;
    const signedVolume = tx.type === "inflow" ? amount : -amount;

    if (!links.has(key)) {
      links.set(key, {
        source: sourceId,
        target: targetId,
        value: amount,
        netVolume: signedVolume,
      });
    } else {
      const link = links.get(key)!;
      link.value += amount;
      link.netVolume += signedVolume;
    }
  }

  const sortedNodes = [...nodes.values()].sort((a, b) => b.value - a.value).slice(0, MAX_NODES);

  const allowedNodeIds = new Set(sortedNodes.map((node) => node.id));

  const sortedLinks: GraphLink[] = [...links.values()]
    .filter((link) => allowedNodeIds.has(link.source) && allowedNodeIds.has(link.target))
    .sort((a, b) => b.value - a.value)
    .slice(0, MAX_LINKS)
    .map((link) => ({
      source: link.source,
      target: link.target,
      value: link.value,
      type: link.netVolume >= 0 ? "inflow" : "outflow",
    }));

  return {
    nodes: sortedNodes,
    links: sortedLinks,
  };
};

const getNodeColor = (type: GraphNode["type"]) => {
  switch (type) {
    case "whale":
      return "#F43F5E";
    case "exchange":
      return "#F59E0B";
    case "contract":
      return "#8B5CF6";
    default:
      return "#3B82F6";
  }
};

const linkKey = (d: GraphLink) => {
  const source = typeof d.source === "string" ? d.source : d.source.id;
  const target = typeof d.target === "string" ? d.target : d.target.id;
  return `${source}=>${target}`;
};

export function NetworkGraph({
  network,
  transactions,
  selectedWallet,
  onWalletSelect,
}: NetworkGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  const simulationRef = useRef<d3.Simulation<GraphNode, undefined> | null>(null);
  const graphLayerRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null);
  const linkLayerRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null);
  const particleLayerRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null);
  const nodeLayerRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null);

  const linkSelectionRef = useRef<d3.Selection<
    SVGLineElement,
    GraphLink,
    SVGGElement,
    unknown
  > | null>(null);
  const particleSelectionRef = useRef<d3.Selection<
    SVGCircleElement,
    GraphLink,
    SVGGElement,
    unknown
  > | null>(null);
  const nodeSelectionRef = useRef<d3.Selection<
    SVGGElement,
    GraphNode,
    SVGGElement,
    unknown
  > | null>(null);

  const frameIdRef = useRef<number | null>(null);
  const prevNodeSignatureRef = useRef("");
  const prevLinkSignatureRef = useRef("");
  const relaxTimerRef = useRef<number | null>(null);

  const graphData = useMemo(() => buildGraphData(transactions), [transactions]);

  useEffect(() => {
    if (!svgRef.current) {
      return;
    }

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const g = svg.append("g");
    graphLayerRef.current = g;
    linkLayerRef.current = g.append("g");
    particleLayerRef.current = g.append("g");
    nodeLayerRef.current = g.append("g");

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 3])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });

    svg.call(zoom as never);

    const defs = svg.append("defs");

    const inflowGradient = defs
      .append("linearGradient")
      .attr("id", "inflow-gradient")
      .attr("gradientUnits", "userSpaceOnUse");

    inflowGradient
      .append("stop")
      .attr("offset", "0%")
      .attr("stop-color", "#10B981")
      .attr("stop-opacity", 0.6);

    inflowGradient
      .append("stop")
      .attr("offset", "100%")
      .attr("stop-color", "#10B981")
      .attr("stop-opacity", 0.1);

    const outflowGradient = defs
      .append("linearGradient")
      .attr("id", "outflow-gradient")
      .attr("gradientUnits", "userSpaceOnUse");

    outflowGradient
      .append("stop")
      .attr("offset", "0%")
      .attr("stop-color", "#EF4444")
      .attr("stop-opacity", 0.6);

    outflowGradient
      .append("stop")
      .attr("offset", "100%")
      .attr("stop-color", "#EF4444")
      .attr("stop-opacity", 0.1);

    const width = svgRef.current.clientWidth || 800;
    const height = svgRef.current.clientHeight || 420;
    const createBorderRepelForce = () => {
      let nodes: GraphNode[] = [];
      const margin = 18;
      const strength = 0.55;

      const force = (alpha: number) => {
        for (const node of nodes) {
          const x = node.x ?? width / 2;
          const y = node.y ?? height / 2;
          const radius = Math.sqrt(node.value) / 2 + 10;
          const minX = margin + radius;
          const maxX = width - margin - radius;
          const minY = margin + radius;
          const maxY = height - margin - radius;

          if (x < minX) {
            node.vx = (node.vx ?? 0) + (minX - x) * strength * alpha;
          } else if (x > maxX) {
            node.vx = (node.vx ?? 0) - (x - maxX) * strength * alpha;
          }

          if (y < minY) {
            node.vy = (node.vy ?? 0) + (minY - y) * strength * alpha;
          } else if (y > maxY) {
            node.vy = (node.vy ?? 0) - (y - maxY) * strength * alpha;
          }
        }
      };

      (force as any).initialize = (_nodes: GraphNode[]) => {
        nodes = _nodes;
      };

      return force;
    };

    const simulation = d3
      .forceSimulation<GraphNode>([])
      .force(
        "link",
        d3
          .forceLink<GraphNode, GraphLink>([])
          .id((d) => d.id)
          .distance(LINK_DISTANCE)
          .strength(LINK_STRENGTH),
      )
      .force("charge", d3.forceManyBody().strength(-70))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force(
        "collision",
        d3.forceCollide<GraphNode>().radius((d) => Math.sqrt(d.value) / 2 + 10),
      )
      .force("bounds", createBorderRepelForce() as any);

    simulation.on("tick", () => {
      linkSelectionRef.current
        ?.attr("x1", (d: any) => d.source.x)
        ?.attr("y1", (d: any) => d.source.y)
        ?.attr("x2", (d: any) => d.target.x)
        ?.attr("y2", (d: any) => d.target.y);

      nodeSelectionRef.current?.attr("transform", (d: any) => `translate(${d.x},${d.y})`);
    });

    simulationRef.current = simulation;

    const animateParticles = () => {
      particleSelectionRef.current
        ?.attr("cx", (d: any, i) => {
          const t = (Date.now() / 2000 + i * 0.1) % 1;
          return d.source.x + (d.target.x - d.source.x) * t;
        })
        ?.attr("cy", (d: any, i) => {
          const t = (Date.now() / 2000 + i * 0.1) % 1;
          return d.source.y + (d.target.y - d.source.y) * t;
        });

      frameIdRef.current = window.requestAnimationFrame(animateParticles);
    };

    animateParticles();

    return () => {
      simulation.stop();
      if (relaxTimerRef.current !== null) {
        window.clearTimeout(relaxTimerRef.current);
      }
      if (frameIdRef.current !== null) {
        window.cancelAnimationFrame(frameIdRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (
      !simulationRef.current ||
      !linkLayerRef.current ||
      !nodeLayerRef.current ||
      !particleLayerRef.current
    ) {
      return;
    }

    const simulation = simulationRef.current;
    const width = svgRef.current?.clientWidth ?? 800;
    const height = svgRef.current?.clientHeight ?? 420;
    const prevNodes = new Map(simulation.nodes().map((n) => [n.id, n]));

    const linkedPrevPositions = new Map<string, Array<{ x: number; y: number }>>();
    for (const link of graphData.links) {
      const sourceId = typeof link.source === "string" ? link.source : link.source.id;
      const targetId = typeof link.target === "string" ? link.target : link.target.id;

      const sourcePrev = prevNodes.get(sourceId);
      const targetPrev = prevNodes.get(targetId);

      if (sourcePrev && typeof sourcePrev.x === "number" && typeof sourcePrev.y === "number") {
        const arr = linkedPrevPositions.get(targetId) ?? [];
        arr.push({ x: sourcePrev.x, y: sourcePrev.y });
        linkedPrevPositions.set(targetId, arr);
      }

      if (targetPrev && typeof targetPrev.x === "number" && typeof targetPrev.y === "number") {
        const arr = linkedPrevPositions.get(sourceId) ?? [];
        arr.push({ x: targetPrev.x, y: targetPrev.y });
        linkedPrevPositions.set(sourceId, arr);
      }
    }

    const nodes = graphData.nodes.map((node) => {
      const prev = prevNodes.get(node.id);
      if (prev && typeof prev.x === "number" && typeof prev.y === "number") {
        return {
          ...node,
          x: prev.x,
          y: prev.y,
          fx: prev.fx ?? null,
          fy: prev.fy ?? null,
        };
      }

      const neighborPositions = linkedPrevPositions.get(node.id) ?? [];
      const seededFromNeighbors =
        neighborPositions.length > 0
          ? {
              x:
                neighborPositions.reduce((sum, p) => sum + p.x, 0) / neighborPositions.length +
                (Math.random() - 0.5) * 24,
              y:
                neighborPositions.reduce((sum, p) => sum + p.y, 0) / neighborPositions.length +
                (Math.random() - 0.5) * 24,
            }
          : null;

      return {
        ...node,
        x: seededFromNeighbors?.x ?? width / 2 + (Math.random() - 0.5) * 40,
        y: seededFromNeighbors?.y ?? height / 2 + (Math.random() - 0.5) * 40,
        fx: null,
        fy: null,
      };
    });

    const links = graphData.links.map((link) => ({ ...link }));
    const linkExtent = d3.extent(links, (d) => d.value) as [number | undefined, number | undefined];
    const linkMin = Math.max(linkExtent[0] ?? 1, 1);
    const linkMax = Math.max(linkExtent[1] ?? linkMin + 1, linkMin + 1);
    const linkWidthScale = d3.scaleSqrt().domain([linkMin, linkMax]).range([1.8, 6]).clamp(true);

    const link = linkLayerRef.current
      .selectAll<SVGLineElement, GraphLink>("line")
      .data(links, (d: any) => linkKey(d))
      .join("line")
      .attr("stroke", (d) =>
        d.type === "inflow" ? "url(#inflow-gradient)" : "url(#outflow-gradient)",
      )
      .attr("stroke-width", (d) => linkWidthScale(d.value))
      .attr("stroke-opacity", 0.82);

    const particles = particleLayerRef.current
      .selectAll<SVGCircleElement, GraphLink>("circle")
      .data(links, (d: any) => linkKey(d))
      .join("circle")
      .attr("r", 2)
      .attr("fill", (d) => (d.type === "inflow" ? "#10B981" : "#EF4444"))
      .attr("opacity", 0.8);

    const node = nodeLayerRef.current
      .selectAll<SVGGElement, GraphNode>("g")
      .data(nodes, (d: any) => d.id)
      .join((enter) => {
        const group = enter.append("g").attr("cursor", "pointer");

        group.append("circle").attr("class", "node-glow blur-sm").attr("fill-opacity", 0.15);

        group
          .append("circle")
          .attr("class", "node-core")
          .attr("stroke-width", 2)
          .attr("fill-opacity", 0.2);

        group
          .append("text")
          .attr("font-size", 10)
          .attr("fill", "#E5E7EB")
          .attr("text-anchor", "middle")
          .attr("class", "pointer-events-none font-mono");

        return group;
      });

    node
      .select("circle.node-glow")
      .attr("r", (d) => Math.sqrt(d.value) / 2 + 15)
      .attr("fill", (d) => getNodeColor(d.type));

    node
      .select("circle.node-core")
      .attr("r", (d) => Math.sqrt(d.value) / 2 + 8)
      .attr("fill", (d) => getNodeColor(d.type))
      .attr("stroke", (d) => getNodeColor(d.type))
      .attr("stroke-width", (d) => (d.id === selectedWallet ? 3 : 2));

    node
      .select("text")
      .text((d) => d.id)
      .attr("dy", (d) => Math.sqrt(d.value) / 2 + 20);

    node.on("mouseenter", function (_event, d) {
      setHoveredNode(d.id);
      d3.select(this)
        .select("circle.node-core")
        .transition()
        .duration(200)
        .attr("r", (nodeData: any) => Math.sqrt(nodeData.value) / 2 + 12)
        .attr("stroke-width", 3);
    });

    node.on("mouseleave", function () {
      setHoveredNode(null);
      d3.select(this)
        .select("circle.node-core")
        .transition()
        .duration(200)
        .attr("r", (nodeData: any) => Math.sqrt(nodeData.value) / 2 + 8)
        .attr("stroke-width", (nodeData: any) => (nodeData.id === selectedWallet ? 3 : 2));
    });

    node.on("click", function (_event, d) {
      onWalletSelect(d.id);
    });

    node.call(
      d3
        .drag<SVGGElement, GraphNode>()
        .on("start", (event) => {
          const chargeForce = simulation.force("charge") as d3.ForceManyBody<GraphNode>;
          chargeForce.strength(WEAK_CHARGE);
          if (!event.active) {
            simulation.alphaTarget(0.06).restart();
          }
          event.subject.fx = event.subject.x;
          event.subject.fy = event.subject.y;
        })
        .on("drag", (event) => {
          event.subject.fx = event.x;
          event.subject.fy = event.y;
        })
        .on("end", (event) => {
          if (!event.active) {
            simulation.alphaTarget(0);
          }
          event.subject.fx = null;
          event.subject.fy = null;
        }),
    );

    linkSelectionRef.current = link;
    particleSelectionRef.current = particles;
    nodeSelectionRef.current = node;

    simulation.nodes(nodes);
    (simulation.force("link") as d3.ForceLink<GraphNode, GraphLink>)
      .links(links)
      .distance(LINK_DISTANCE)
      .strength(LINK_STRENGTH);
    const chargeForce = simulation.force("charge") as d3.ForceManyBody<GraphNode>;
    const collisionForce = simulation.force("collision") as d3.ForceCollide<GraphNode>;
    chargeForce.strength(WEAK_CHARGE);
    collisionForce.radius((d) => Math.sqrt(d.value) / 2 + WEAK_COLLISION_PAD);

    const nodeSignature = nodes
      .map((n) => n.id)
      .sort()
      .join("|");
    const linkSignature = links
      .map((l) => linkKey(l))
      .sort()
      .join("|");

    const structureChanged =
      nodeSignature !== prevNodeSignatureRef.current ||
      linkSignature !== prevLinkSignatureRef.current;

    const previousNodeIds = new Set(
      prevNodeSignatureRef.current ? prevNodeSignatureRef.current.split("|") : [],
    );
    const hasNewNodes = nodes.some((node) => !previousNodeIds.has(node.id));

    if (structureChanged && hasNewNodes) {
      chargeForce.strength(STRONG_CHARGE);
      collisionForce.radius((d) => Math.sqrt(d.value) / 2 + STRONG_COLLISION_PAD);
      simulation.alpha(0.14).restart();

      if (relaxTimerRef.current !== null) {
        window.clearTimeout(relaxTimerRef.current);
      }

      relaxTimerRef.current = window.setTimeout(() => {
        chargeForce.strength(WEAK_CHARGE);
        collisionForce.radius((d) => Math.sqrt(d.value) / 2 + WEAK_COLLISION_PAD);
        simulation.alpha(0.05).restart();
      }, 1400);

      prevNodeSignatureRef.current = nodeSignature;
      prevLinkSignatureRef.current = linkSignature;
    } else if (structureChanged) {
      simulation.alpha(0.08).restart();
      prevNodeSignatureRef.current = nodeSignature;
      prevLinkSignatureRef.current = linkSignature;
    } else {
      simulation.alpha(0.03);
    }
  }, [graphData, onWalletSelect, selectedWallet]);

  const hasData = transactions.length > 0;

  return (
    <div className="relative h-full w-full bg-card/30 backdrop-blur-sm rounded-xl border border-border/50 overflow-hidden group">
      <div className="absolute top-0 left-0 right-0 p-3 bg-gradient-to-b from-card/80 to-transparent backdrop-blur-sm z-10 border-b border-border/30">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-sm">Network Graph</h3>
            <p className="text-xs text-muted-foreground">
              {hasData
                ? `${network.toUpperCase()} live transaction flow`
                : "Waiting for enough live transactions to build graph"}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              size="icon"
              variant="ghost"
              className="w-7 h-7 bg-secondary/50 hover:bg-secondary"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="w-7 h-7 bg-secondary/50 hover:bg-secondary"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="w-7 h-7 bg-secondary/50 hover:bg-secondary"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>

      <div className="absolute bottom-4 left-4 p-2.5 bg-card/90 backdrop-blur-sm rounded-lg border border-border/50 z-10">
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-[#F43F5E]" />
            <span>Whale</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]" />
            <span>Exchange</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-[#8B5CF6]" />
            <span>Contract</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-[#3B82F6]" />
            <span>Wallet</span>
          </div>
        </div>
      </div>

      {hoveredNode ? (
        <div className="absolute bottom-4 left-4 px-2 py-1 text-xs rounded border border-border/50 bg-card/85 text-muted-foreground z-10 font-mono">
          {hoveredNode}
        </div>
      ) : null}

      <svg ref={svgRef} className="w-full h-full" />
    </div>
  );
}
