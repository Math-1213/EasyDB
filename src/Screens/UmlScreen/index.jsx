import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ReactFlow,
  Background,
  Controls,
  MarkerType,
  useReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import "@xyflow/react/dist/style.css";
import "./styles.css";
import { getCache, setCache } from "./UmlCache";

const getLayoutedElements = (nodes, edges, direction = "TB") => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  const nodeWidth = 240;
  const nodeHeight = 180;

  dagreGraph.setGraph({ rankdir: direction, nodesep: 80, ranksep: 120 });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  return {
    nodes: nodes.map((node) => {
      const nodeWithPosition = dagreGraph.node(node.id);
      return {
        ...node,
        targetPosition: "top",
        sourcePosition: "bottom",
        position: {
          x: nodeWithPosition.x - nodeWidth / 2,
          y: nodeWithPosition.y - nodeHeight / 2,
        },
      };
    }),
    edges,
  };
};

function UmlCanvas({ selectedTable, currentDb }) {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hoveredOrClickedNode, setHoveredOrClickedNode] = useState(null);

  const { setCenter } = useReactFlow();

  // EFECT 1: Roda APENAS UMA VEZ ao montar a tela para construir a estrutura do banco
  useEffect(() => {
    async function initDiagram() {
      // Verifica cache primeiro
      const cached = getCache(currentDb);
      console.log("Cached:", !!cached);
      console.log("Current DB:", currentDb);

      if (cached) {
        setNodes(cached.nodes);
        setEdges(cached.edges);
        return;
      }

      setLoading(true);

      // Limpa valores anteriores
      setError("");
      setNodes([]);
      setEdges([]);
      try {
        const tables = await invoke("get_tables");
        const rels = await invoke("get_db_relationships");

        const structuresPayload = await Promise.all(
          tables.map(async (table) => {
            try {
              const cols = await invoke("get_table_structure", {
                tableName: table,
              });
              return { table, cols };
            } catch {
              return { table, cols: [] };
            }
          }),
        );

        const structuresMap = structuresPayload.reduce((acc, curr) => {
          acc[curr.table] = curr.cols;
          return acc;
        }, {});

        const nodeWidth = 240;

        const initialNodes = tables.map((tableName) => {
          const tableColumns = structuresMap[tableName] || [];
          return {
            id: tableName,
            data: {
              label: (
                <div className="uml-node-inner">
                  <div className="uml-node-title">{tableName}</div>
                  <div className="uml-node-columns-list">
                    {tableColumns.map((c) => (
                      <div key={c.name} className="uml-node-column-row">
                        <span className="uml-col-name">{c.name}</span>
                        <span className="uml-col-type">
                          {c.data_type.toLowerCase()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ),
            },
            position: { x: 0, y: 0 },
            className: "custom-uml-node",
            style: { width: nodeWidth },
          };
        });

        const initialEdges = rels.map((r, idx) => ({
          id: `e-${idx}`,
          source: r.origin_table,
          target: r.target_table,
          label: `${r.origin_column} → ${r.target_column}`,
          labelStyle: {
            fill: "#94a3b8",
            fontSize: "9px",
            fontFamily: "monospace",
          },
          style: { stroke: "#334155", strokeWidth: 1.5 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 14,
            height: 14,
            color: "#334155",
          },
        }));

        const { nodes: layoutedNodes, edges: layoutedEdges } =
          getLayoutedElements(initialNodes, initialEdges);

        setCache(currentDb, { nodes: layoutedNodes, edges: layoutedEdges });
        setNodes(layoutedNodes);
        setEdges(layoutedEdges);
      } catch (err) {
        setError(`Erro ao gerar diagrama: ${err}`);
      } finally {
        setLoading(false);
      }
    }

    initDiagram();
  }, [currentDb]);

  // EFFECT 2: Centraliza e atualiza o estado do nó ativo instantaneamente sem recarregar o banco
  useEffect(() => {
    if (nodes.length === 0 || !selectedTable) return;

    setHoveredOrClickedNode(selectedTable);

    const targetNode = nodes.find((n) => n.id === selectedTable);
    if (targetNode) {
      setCenter(targetNode.position.x + 120, targetNode.position.y + 40, {
        zoom: 1.1,
        duration: 400, // Transição suave
      });
    }
  }, [selectedTable, nodes.length, setCenter]);

  // EFFECT 3: Gerencia os destaques de conexões e opacidades na tela
  useEffect(() => {
    if (nodes.length === 0) return;

    const connectedNodeIds = new Set();
    if (hoveredOrClickedNode) {
      connectedNodeIds.add(hoveredOrClickedNode);
      edges.forEach((edge) => {
        if (edge.source === hoveredOrClickedNode)
          connectedNodeIds.add(edge.target);
        if (edge.target === hoveredOrClickedNode)
          connectedNodeIds.add(edge.source);
      });
    }

    setNodes((prevNodes) =>
      prevNodes.map((node) => {
        let opacity = 1;
        let border = "1px solid #334155";
        let boxShadow = "0 4px 6px -1px rgba(0, 0, 0, 0.3)";

        if (hoveredOrClickedNode) {
          if (node.id === hoveredOrClickedNode) {
            border = "2px solid #3b82f6";
            boxShadow = "0 0 12px rgba(59, 130, 246, 0.4)";
          } else if (connectedNodeIds.has(node.id)) {
            border = "1px solid #60a5fa";
          } else {
            opacity = 0.25;
          }
        }

        return {
          ...node,
          style: { ...node.style, opacity, border, boxShadow },
        };
      }),
    );

    setEdges((prevEdges) =>
      prevEdges.map((edge) => {
        const isRelated =
          hoveredOrClickedNode &&
          (edge.source === hoveredOrClickedNode ||
            edge.target === hoveredOrClickedNode);

        return {
          ...edge,
          style: {
            ...edge.style,
            stroke: isRelated
              ? "#3b82f6"
              : hoveredOrClickedNode
                ? "#1e293b"
                : "#334155",
            strokeWidth: isRelated ? 2.5 : 1.5,
            opacity: hoveredOrClickedNode && !isRelated ? 0.15 : 1,
          },
          markerEnd: {
            ...edge.markerEnd,
            color: isRelated
              ? "#3b82f6"
              : hoveredOrClickedNode
                ? "#1e293b"
                : "#334155",
          },
        };
      }),
    );
  }, [hoveredOrClickedNode]);

  if (loading && nodes.length === 0) {
    return <div className="loading-state">Mapeando chaves e colunas...</div>;
  }

  if (error) {
    return <div className="error-banner">{error}</div>;
  }

  return (
    <div className="uml-screen-container">
      <div className="uml-canvas-wrapper">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodeClick={(_, node) => setHoveredOrClickedNode(node.id)}
          onPaneClick={() => setHoveredOrClickedNode(null)}
          nodesDraggable={false}
          nodesConnectable={false}
          connectOnClick={false}
          fitView
        >
          <Background color="#1e293b" gap={18} size={1} />
          <Controls className="custom-flow-controls" />
        </ReactFlow>
      </div>
    </div>
  );
}

export default function UmlScreen({ selectedTable, currentDb }) {
  return (
    <ReactFlowProvider>
      <UmlCanvas selectedTable={selectedTable} currentDb={currentDb} />
    </ReactFlowProvider>
  );
}
