import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ReactFlow, Background, Controls, MarkerType } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "../App.css";

export default function UmlScreen({ selectedTable }) {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function generateDiagram() {
      setLoading(true);
      setError("");
      try {
        // 1. Busca todas as tabelas para criar os Nós
        const tables = await invoke("get_tables");
        // 2. Busca todas as Foreign Keys para criar os Relacionamentos (Edges)
        const rels = await invoke("get_db_relationships");

        // Configuração simples de Grid/Posicionamento em colunas para os nós
        const columnsCount = 3;
        const nodeWidth = 220;
        const nodeHeight = 100;

        const generatedNodes = tables.map((tableName, index) => {
          const col = index % columnsCount;
          const row = Math.floor(index / columnsCount);
          const isCurrent = tableName === selectedTable;

          return {
            id: tableName,
            data: {
              label: (
                <div
                  className={`uml-node-inner ${isCurrent ? "active-node" : ""}`}
                >
                  <div className="uml-node-title">{tableName}</div>
                  <div className="uml-node-type">Tabela Relacional</div>
                </div>
              ),
            },
            position: {
              x: col * (nodeWidth + 60) + 40,
              y: row * (nodeHeight + 60) + 40,
            },
            style: {
              background: isCurrent ? "#2d3c2d" : "#252526",
              color: "#fff",
              border: isCurrent ? "1px solid #4caf50" : "1px solid #3c3c3c",
              borderRadius: "6px",
              padding: "0px",
              width: nodeWidth,
            },
          };
        });

        // Mapeia os relacionamentos como linhas conectoras com setas direcionais
        const generatedEdges = rels.map((r, idx) => ({
          id: `e-${idx}`,
          source: r.origin_table,
          target: r.target_table,
          label: `${r.origin_column} ➔ ${r.target_column}`,
          labelStyle: {
            fill: "#888",
            fontSize: "10px",
            fontFamily: "monospace",
          },
          style: { stroke: "#555", strokeWidth: 2 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 16,
            height: 16,
            color: "#555",
          },
        }));

        setNodes(generatedNodes);
        setEdges(generatedEdges);
      } catch (err) {
        setError(`Erro ao gerar diagrama de relacionamentos: ${err}`);
      } finally {
        setLoading(false);
      }
    }

    generateDiagram();
  }, [selectedTable]);

  if (loading) {
    return (
      <div className="loading-state">
        Mapeando chaves estrangeiras e renderizando modelo UML...
      </div>
    );
  }

  if (error) {
    return <div className="error-banner">{error}</div>;
  }

  return (
    <div className="uml-screen-container">
      <div className="uml-header">
        <h3>Diagrama de Entidade-Relacionamento do Banco</h3>
        <p>
          Use o mouse para arrastar as tabelas ou o scroll para aplicar zoom.
        </p>
      </div>
      <div className="uml-canvas-wrapper">
        <ReactFlow nodes={nodes} edges={edges} fitView>
          <Background color="#333" gap={16} />
          <Controls
            style={{
              background: "#2d2d2d",
              border: "1px solid #555",
              color: "#fff",
            }}
          />
        </ReactFlow>
      </div>
    </div>
  );
}
