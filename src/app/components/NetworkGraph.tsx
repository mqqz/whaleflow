import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { Button } from "./ui/button";

interface Node {
  id: string;
  type: "whale" | "exchange" | "contract" | "wallet";
  value: number;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

interface Link {
  source: string | Node;
  target: string | Node;
  value: number;
  type: "inflow" | "outflow";
}

export function NetworkGraph() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  useEffect(() => {
    if (!svgRef.current) return;

    // Clear previous content
    d3.select(svgRef.current).selectAll("*").remove();

    // Generate mock data
    const nodes: Node[] = [
      { id: "0xA34F...7B21", type: "whale", value: 450 },
      { id: "0xB12C...3A45", type: "exchange", value: 1200 },
      { id: "0xC89D...6F12", type: "contract", value: 300 },
      { id: "0xD45E...8C34", type: "wallet", value: 120 },
      { id: "0xE67F...9D56", type: "whale", value: 380 },
      { id: "0xF89A...1E78", type: "wallet", value: 95 },
      { id: "0xG12B...2F90", type: "exchange", value: 850 },
      { id: "0xH34C...3G01", type: "wallet", value: 140 },
      { id: "0xI56D...4H23", type: "contract", value: 220 },
      { id: "0xJ78E...5I45", type: "wallet", value: 160 },
      { id: "0xK90F...6J67", type: "whale", value: 520 },
      { id: "0xL23G...7K89", type: "wallet", value: 75 },
    ];

    const links: Link[] = [
      { source: "0xA34F...7B21", target: "0xB12C...3A45", value: 120, type: "inflow" },
      { source: "0xB12C...3A45", target: "0xC89D...6F12", value: 85, type: "outflow" },
      { source: "0xA34F...7B21", target: "0xE67F...9D56", value: 65, type: "outflow" },
      { source: "0xE67F...9D56", target: "0xG12B...2F90", value: 95, type: "inflow" },
      { source: "0xD45E...8C34", target: "0xF89A...1E78", value: 45, type: "outflow" },
      { source: "0xG12B...2F90", target: "0xI56D...4H23", value: 110, type: "inflow" },
      { source: "0xK90F...6J67", target: "0xB12C...3A45", value: 150, type: "inflow" },
      { source: "0xC89D...6F12", target: "0xH34C...3G01", value: 55, type: "outflow" },
      { source: "0xI56D...4H23", target: "0xJ78E...5I45", value: 70, type: "outflow" },
      { source: "0xH34C...3G01", target: "0xL23G...7K89", value: 35, type: "outflow" },
    ];

    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    const svg = d3.select(svgRef.current);

    // Create zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 3])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });

    svg.call(zoom as any);

    const g = svg.append("g");

    // Define gradients for links
    const defs = svg.append("defs");
    
    const inflowGradient = defs.append("linearGradient")
      .attr("id", "inflow-gradient")
      .attr("gradientUnits", "userSpaceOnUse");
    
    inflowGradient.append("stop")
      .attr("offset", "0%")
      .attr("stop-color", "#10B981")
      .attr("stop-opacity", 0.6);
    
    inflowGradient.append("stop")
      .attr("offset", "100%")
      .attr("stop-color", "#10B981")
      .attr("stop-opacity", 0.1);

    const outflowGradient = defs.append("linearGradient")
      .attr("id", "outflow-gradient")
      .attr("gradientUnits", "userSpaceOnUse");
    
    outflowGradient.append("stop")
      .attr("offset", "0%")
      .attr("stop-color", "#EF4444")
      .attr("stop-opacity", 0.6);
    
    outflowGradient.append("stop")
      .attr("offset", "100%")
      .attr("stop-color", "#EF4444")
      .attr("stop-opacity", 0.1);

    // Create force simulation
    const simulation = d3.forceSimulation(nodes as any)
      .force("link", d3.forceLink(links).id((d: any) => d.id).distance(150))
      .force("charge", d3.forceManyBody().strength(-400))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(40));

    // Create links
    const link = g.append("g")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", (d) => d.type === "inflow" ? "url(#inflow-gradient)" : "url(#outflow-gradient)")
      .attr("stroke-width", (d) => Math.sqrt(d.value) / 2)
      .attr("stroke-opacity", 0.6);

    // Animated particles on links
    const particles = g.append("g")
      .selectAll("circle")
      .data(links)
      .join("circle")
      .attr("r", 2)
      .attr("fill", (d) => d.type === "inflow" ? "#10B981" : "#EF4444")
      .attr("opacity", 0.8);

    // Node color mapping
    const getNodeColor = (type: string) => {
      switch (type) {
        case "whale":
          return "#22D3EE";
        case "exchange":
          return "#F59E0B";
        case "contract":
          return "#8B5CF6";
        default:
          return "#06B6D4";
      }
    };

    // Create nodes
    const node = g.append("g")
      .selectAll("g")
      .data(nodes)
      .join("g")
      .attr("cursor", "pointer")
      .call(d3.drag<any, any>()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended) as any);

    // Node circles with glow effect
    node.append("circle")
      .attr("r", (d) => Math.sqrt(d.value) / 2 + 15)
      .attr("fill", (d) => getNodeColor(d.type))
      .attr("fill-opacity", 0.15)
      .attr("class", "blur-sm");

    node.append("circle")
      .attr("r", (d) => Math.sqrt(d.value) / 2 + 8)
      .attr("fill", (d) => getNodeColor(d.type))
      .attr("stroke", (d) => getNodeColor(d.type))
      .attr("stroke-width", 2)
      .attr("fill-opacity", 0.2);

    // Node labels
    node.append("text")
      .text((d) => d.id)
      .attr("font-size", 10)
      .attr("fill", "#E5E7EB")
      .attr("text-anchor", "middle")
      .attr("dy", (d) => Math.sqrt(d.value) / 2 + 20)
      .attr("class", "pointer-events-none font-mono");

    // Mouse events
    node.on("mouseenter", function(event, d) {
      setHoveredNode(d.id);
      d3.select(this).select("circle:nth-child(2)")
        .transition()
        .duration(200)
        .attr("r", (d: any) => Math.sqrt(d.value) / 2 + 12)
        .attr("stroke-width", 3);
    });

    node.on("mouseleave", function(event, d) {
      setHoveredNode(null);
      d3.select(this).select("circle:nth-child(2)")
        .transition()
        .duration(200)
        .attr("r", (d: any) => Math.sqrt(d.value) / 2 + 8)
        .attr("stroke-width", 2);
    });

    // Update positions on tick
    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      // Animate particles along links
      particles
        .attr("cx", (d: any, i) => {
          const t = (Date.now() / 2000 + i * 0.1) % 1;
          return d.source.x + (d.target.x - d.source.x) * t;
        })
        .attr("cy", (d: any, i) => {
          const t = (Date.now() / 2000 + i * 0.1) % 1;
          return d.source.y + (d.target.y - d.source.y) * t;
        });

      node.attr("transform", (d: any) => `translate(${d.x},${d.y})`);
    });

    // Drag functions
    function dragstarted(event: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }

    function dragged(event: any) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }

    function dragended(event: any) {
      if (!event.active) simulation.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;
    }

    // Animate particles
    const animateParticles = () => {
      particles
        .attr("cx", (d: any, i) => {
          const t = (Date.now() / 2000 + i * 0.1) % 1;
          return d.source.x + (d.target.x - d.source.x) * t;
        })
        .attr("cy", (d: any, i) => {
          const t = (Date.now() / 2000 + i * 0.1) % 1;
          return d.source.y + (d.target.y - d.source.y) * t;
        });
      requestAnimationFrame(animateParticles);
    };
    animateParticles();

    return () => {
      simulation.stop();
    };
  }, []);

  return (
    <div className="relative h-full w-full bg-card/30 backdrop-blur-sm rounded-xl border border-border/50 overflow-hidden group">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 p-3 bg-gradient-to-b from-card/80 to-transparent backdrop-blur-sm z-10 border-b border-border/30">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-sm">Network Graph</h3>
            <p className="text-xs text-muted-foreground">Live blockchain transaction flow</p>
          </div>
          <div className="flex gap-2">
            <Button size="icon" variant="ghost" className="w-7 h-7 bg-secondary/50 hover:bg-secondary">
              <ZoomIn className="w-3.5 h-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="w-7 h-7 bg-secondary/50 hover:bg-secondary">
              <ZoomOut className="w-3.5 h-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="w-7 h-7 bg-secondary/50 hover:bg-secondary">
              <Maximize2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="absolute top-16 left-4 p-2.5 bg-card/90 backdrop-blur-sm rounded-lg border border-border/50 z-10">
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-[#22D3EE]" />
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
            <div className="w-2.5 h-2.5 rounded-full bg-[#06B6D4]" />
            <span>Wallet</span>
          </div>
        </div>
      </div>

      {/* SVG Canvas */}
      <svg ref={svgRef} className="w-full h-full" />
    </div>
  );
}