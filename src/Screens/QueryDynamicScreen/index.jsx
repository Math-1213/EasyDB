import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Plus, Trash2, Play, Columns, Filter, Link2 } from "lucide-react";
import "./styles.css";

const OPERATORS = [
  { value: "=", label: "=" },
  { value: "!=", label: "!=" },
  { value: ">", label: ">" },
  { value: "<", label: "<" },
  { value: ">=", label: "≥" },
  { value: "<=", label: "≤" },
  { value: "LIKE", label: "Contém" },
  { value: "ILIKE", label: "Contém (Ignorar Caixa)" },
];

export default function QueryDynamicScreen({
  selectedTable,
  joinedTables = [],
  onAddJoinTable,
}) {
  const [columns, setColumns] = useState([]);
  const [selectedCols, setSelectedCols] = useState({});
  const [whereClauses, setWhereClauses] = useState([]);
  const [sqlText, setSqlText] = useState("");
  const [relationships, setRelationships] = useState([]);
  const [orderBy, setOrderBy] = useState({ column: "", direction: "DESC" });

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [colWidths, setColWidths] = useState({});
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const resizingRef = useRef(false);

  useEffect(() => {
    async function fetchRelationships() {
      try {
        const rels = await invoke("get_db_relationships");
        setRelationships(rels || []);
      } catch (err) {
        console.error("Erro ao buscar chaves estrangeiras:", err);
      }
    }
    fetchRelationships();
  }, []);

  useEffect(() => {
    async function fetchAllColumns() {
      if (!selectedTable) return;
      try {
        setError("");
        const targets = [selectedTable, ...joinedTables];
        let aggregatedCols = [];
        let newSelection = { ...selectedCols };

        for (const table of targets) {
          const structure = await invoke("get_table_structure", {
            tableName: table,
          });
          const prefixed = structure.map((c) => `${table}.${c.name}`);
          aggregatedCols = [...aggregatedCols, ...prefixed];

          prefixed.forEach((col) => {
            if (newSelection[col] === undefined) {
              newSelection[col] = true;
            }
          });
        }

        Object.keys(newSelection).forEach((key) => {
          const tName = key.split(".")[0];
          if (!targets.includes(tName)) {
            delete newSelection[key];
          }
        });

        setColumns(aggregatedCols);
        setSelectedCols(newSelection);

        // Define a primeira coluna como ordenação padrão caso não haja nenhuma selecionada
        if (aggregatedCols.length > 0 && !orderBy.column) {
          setOrderBy({ column: aggregatedCols[0], direction: "DESC" });
        }
      } catch (err) {
        setError(`Erro ao estruturar colunas: ${err}`);
      }
    }
    fetchAllColumns();
  }, [selectedTable, joinedTables]);

  useEffect(() => {
    if (!selectedTable) {
      setSqlText("");
      return;
    }

    const activeCols = Object.keys(selectedCols).filter((k) => selectedCols[k]);

    // Mapeia colunas para o formato "tabela.coluna AS `tabela.coluna`"
    // Isso evita conflitos de nomes repetidos e resolve a leitura no frontend
    const colsPart =
      activeCols.length > 0
        ? activeCols.map((c) => `${c} AS "${c}"`).join(", ")
        : "*";

    let sql = `SELECT ${colsPart} \nFROM ${selectedTable}`;

    const currentJoined = [];
    joinedTables.forEach((table) => {
      const match = relationships.find(
        (r) =>
          (r.table === table &&
            (r.foreign_table === selectedTable ||
              currentJoined.includes(r.foreign_table))) ||
          (r.foreign_table === table &&
            (r.table === selectedTable || currentJoined.includes(r.table))),
      );

      if (match) {
        sql += ` \nLEFT JOIN ${table} ON ${match.table}.${match.column} = ${match.foreign_table}.${match.foreign_column}`;
      } else {
        sql += ` \nCROSS JOIN ${table}`;
      }
      currentJoined.push(table);
    });

    if (whereClauses.length > 0) {
      const clauses = whereClauses.map((w) => {
        const formattedValue =
          w.operator === "LIKE" || w.operator === "ILIKE"
            ? `'%${w.value}%'`
            : isNaN(Number(w.value)) || w.value.trim() === ""
              ? `'${w.value}'`
              : w.value;

        return `${w.column} ${w.operator} ${formattedValue}`;
      });
      sql += ` \nWHERE ${clauses.join(" AND ")}`;
    }

    // Adiciona ORDER BY
    if (orderBy.column) {
      sql += ` \nORDER BY ${orderBy.column} ${orderBy.direction}`;
    }

    sql += "\nLIMIT 100;";
    setSqlText(sql);
  }, [
    selectedTable,
    selectedCols,
    whereClauses,
    joinedTables,
    relationships,
    orderBy,
  ]);

  const toggleColumn = (colName) => {
    setSelectedCols((prev) => ({ ...prev, [colName]: !prev[colName] }));
  };

  const toggleAllColumns = (selectAll) => {
    const updated = {};
    columns.forEach((name) => {
      updated[name] = selectAll;
    });
    setSelectedCols(updated);
  };

  const addWhereClause = () => {
    if (columns.length === 0) return;
    setWhereClauses([
      ...whereClauses,
      { id: Date.now(), column: columns[0], operator: "=", value: "" },
    ]);
  };

  const updateWhereClause = (id, field, val) => {
    setWhereClauses(
      whereClauses.map((w) => (w.id === id ? { ...w, [field]: val } : w)),
    );
  };

  const removeWhereClause = (id) => {
    setWhereClauses(whereClauses.filter((w) => w.id !== id));
  };

  const handleRunQuery = async () => {
    if (!sqlText.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const queryResult = await invoke("execute_raw_query", { sql: sqlText });

      // Normalização: se o backend devolver nomes de colunas sem alias estruturado,
      // nós limpamos o array de colunas para exibição amigável.
      if (queryResult && queryResult.columns) {
        queryResult.columns = queryResult.columns.map((col) => {
          // Remove aspas ou prefixos duplicados se existirem
          return col.replace(/"/g, "");
        });
      }

      setResult(queryResult);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleMouseDown = (col, e) => {
    const startX = e.pageX;
    const startWidth = colWidths[col] || 150;

    const onMouseMove = (moveEvent) => {
      const newWidth = Math.max(50, startWidth + (moveEvent.pageX - startX));
      setColWidths((prev) => ({ ...prev, [col]: newWidth }));
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  const handleResizeMouseDown = (e) => {
    e.preventDefault();
    resizingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    // Captura a largura atual do painel e a posição inicial do mouse no momento do clique
    const startWidth = sidebarWidth;
    const startX = e.clientX;

    const onMouseMove = (moveEvent) => {
      if (!resizingRef.current) return;

      // Calcula a diferença de movimento do mouse
      const deltaX = moveEvent.clientX - startX;

      // Aplica a diferença com base na largura inicial
      const newWidth = Math.max(250, Math.min(800, startWidth + deltaX));
      setSidebarWidth(newWidth);
    };

    const onMouseUp = () => {
      resizingRef.current = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "default";
      document.body.style.userSelect = "auto";
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  if (!selectedTable) {
    return (
      <div className="empty-state">
        Selecione uma tabela na barra lateral para montar a consulta
        estruturada.
      </div>
    );
  }

  return (
    <div className="dynamic-screen-container">
      <div className="dynamic-workspace-grid">
        <div
          className="builder-controls-panel"
          style={{ width: sidebarWidth, minWidth: sidebarWidth }}
        >
          {joinedTables.length > 0 && (
            <div className="control-card active-joins-card">
              <div className="card-header-title">
                <Link2 size={13} color="#4caf50" />{" "}
                <h4>Vínculos Ativos ({joinedTables.length})</h4>
              </div>
              <div className="joined-tables-tags">
                {joinedTables.map((t) => (
                  <span key={t} className="join-tag">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Seção 1: Colunas */}
          <div className="control-card margin-top-card">
            <div className="card-header-title">
              <Columns size={14} /> <h4>Colunas a Exibir</h4>
            </div>
            <div className="bulk-selection-actions">
              <button
                onClick={() => toggleAllColumns(true)}
                className="btn-link-action"
              >
                Todas
              </button>
              <button
                onClick={() => toggleAllColumns(false)}
                className="btn-link-action"
              >
                Nenhuma
              </button>
            </div>
            <div className="columns-checkbox-list">
              {columns.map((col) => (
                <label key={col} className="checkbox-item-row">
                  <input
                    type="checkbox"
                    checked={!!selectedCols[col]}
                    onChange={() => toggleColumn(col)}
                  />
                  <span className="prefixed-col-name">
                    <small>{col.split(".")[0]}.</small>
                    <strong>{col.split(".")[1]}</strong>
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Seção 2: Filtros */}
          <div className="control-card margin-top-card">
            <div className="card-header-title">
              <Filter size={14} /> <h4>Filtros da Consulta (WHERE)</h4>
            </div>
            <button onClick={addWhereClause} className="btn-add-where">
              <Plus size={12} /> Adicionar Condição
            </button>

            <div className="where-clauses-wrapper">
              {whereClauses.map((w) => (
                <div key={w.id} className="dynamic-where-row">
                  <select
                    value={w.column}
                    onChange={(e) =>
                      updateWhereClause(w.id, "column", e.target.value)
                    }
                    className="filter-select compact"
                  >
                    {columns.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>

                  <select
                    value={w.operator}
                    onChange={(e) =>
                      updateWhereClause(w.id, "operator", e.target.value)
                    }
                    className="filter-select compact operator"
                  >
                    {OPERATORS.map((op) => (
                      <option key={op.value} value={op.value}>
                        {op.label}
                      </option>
                    ))}
                  </select>

                  <input
                    type="text"
                    value={w.value}
                    onChange={(e) =>
                      updateWhereClause(w.id, "value", e.target.value)
                    }
                    placeholder="Valor..."
                    className="filter-val-input compact"
                  />

                  <button
                    onClick={() => removeWhereClause(w.id)}
                    className="btn-delete-where"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Seção 3: Ordenação */}
          <div className="control-card margin-top-card">
            <div className="card-header-title">
              <Filter size={14} /> <h4>Ordenação</h4>
            </div>
            <div className="dynamic-where-row">
              <select
                value={orderBy.column}
                onChange={(e) =>
                  setOrderBy((prev) => ({ ...prev, column: e.target.value }))
                }
                className="filter-select compact"
              >
                <option value="">Sem ordenação</option>
                {columns.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                value={orderBy.direction}
                onChange={(e) =>
                  setOrderBy((prev) => ({ ...prev, direction: e.target.value }))
                }
                className="filter-select compact"
              >
                <option value="ASC">ASC</option>
                <option value="DESC">DESC</option>
              </select>
            </div>
          </div>
        </div>

        {/* Resizer do painel esquerdo */}
        <div className="panel-resizer" onMouseDown={handleResizeMouseDown} />

        {/* Painel Direito */}
        <div className="builder-preview-panel">
          <div className="sql-live-preview-box">
            <div className="preview-header">Editor SQL Dinâmico / Manual</div>
            <textarea
              value={sqlText}
              onChange={(e) => setSqlText(e.target.value)}
              className="sql-dynamic-textarea"
              placeholder="SELECT * FROM..."
              spellCheck={false}
            />
            <div className="preview-action-row">
              <button
                onClick={handleRunQuery}
                disabled={loading}
                className="btn-execute-dynamic"
              >
                <Play size={13} style={{ marginRight: "5px" }} />
                {loading ? "Processando..." : "Executar Consulta"}
              </button>
            </div>
          </div>

          <div className="dynamic-table-results">
            {error && <div className="error-banner">{error}</div>}

            {result && (
              <div className="table-responsive-wrapper">
                {result.columns && result.columns.length > 0 ? (
                  <table className="data-table">
                    <thead>
                      <tr>
                        {result.columns.map((col) => (
                          <th
                            key={col}
                            style={{ width: colWidths[col] || 150 }}
                            onMouseDown={(e) => handleMouseDown(col, e)}
                          >
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.map((row, rIdx) => (
                        <tr key={rIdx}>
                          {row.map((cell, cIdx) => (
                            <td key={cIdx} title={cell}>
                              {cell ?? ""}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="empty-state">
                    {result.message || "Query executada com sucesso."}
                  </div>
                )}
              </div>
            )}

            {!result && !error && (
              <div className="empty-state">
                Altere os filtros à esquerda ou edite o SQL manualmente acima.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
