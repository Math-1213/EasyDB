import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Plus, Trash2, Play, Columns, Filter } from "lucide-react";
import "../App.css";

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

export default function QueryDynamicScreen({ selectedTable }) {
  const [columns, setColumns] = useState([]);
  const [selectedCols, setSelectedCols] = useState({});
  const [whereClauses, setWhereClauses] = useState([]);
  const [sqlText, setSqlText] = useState(""); // Estado do editor de texto editável

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Carrega as colunas da tabela atual sempre que ela mudar
  useEffect(() => {
    async function fetchColumns() {
      if (!selectedTable) return;
      try {
        setError("");
        const structure = await invoke("get_table_structure", {
          tableName: selectedTable,
        });
        const colNames = structure.map((c) => c.name);
        setColumns(colNames);

        // Por padrão, inicializa todas as colunas marcadas como selecionadas
        const initialSelection = {};
        colNames.forEach((name) => {
          initialSelection[name] = true;
        });
        setSelectedCols(initialSelection);
        setWhereClauses([]);
        setResult(null);
      } catch (err) {
        setError(`Erro ao buscar colunas: ${err}`);
      }
    }
    fetchColumns();
  }, [selectedTable]);

  // Sincroniza e reconstrói o SQL no editor sempre que houver alteração nos controles visuais
  useEffect(() => {
    if (!selectedTable) {
      setSqlText("");
      return;
    }

    const activeCols = Object.keys(selectedCols).filter((k) => selectedCols[k]);
    const colsPart = activeCols.length > 0 ? activeCols.join(", ") : "*";

    let sql = `SELECT ${colsPart} FROM ${selectedTable}`;

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
      sql += ` WHERE ${clauses.join(" AND ")}`;
    }

    sql += " LIMIT 100;";
    setSqlText(sql);
  }, [selectedTable, selectedCols, whereClauses]);

  // Alterna seleção individual de coluna
  const toggleColumn = (colName) => {
    setSelectedCols((prev) => ({ ...prev, [colName]: !prev[colName] }));
  };

  // Selecionar Todas ou Nenhuma coluna
  const toggleAllColumns = (selectAll) => {
    const updated = {};
    columns.forEach((name) => {
      updated[name] = selectAll;
    });
    setSelectedCols(updated);
  };

  // Funções do Construtor de Condições WHERE
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

  // Executa o comando que estiver escrito no editor (manual ou dinâmico)
  const handleRunQuery = async () => {
    if (!sqlText.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const queryResult = await invoke("execute_raw_query", {
        sql: sqlText,
      });
      setResult(queryResult);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
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
        {/* Painel Esquerdo: Ferramentas de Seleção */}
        <div className="builder-controls-panel">
          {/* Seção 1: Colunas */}
          <div className="control-card">
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
                  <span>{col}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Seção 2: Filtros Condicionais WHERE */}
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
        </div>

        {/* Painel Direito: Query Interativa Textual & Resultados */}
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

          {/* Renderização da Tabela de Resposta */}
          <div className="dynamic-table-results">
            {error && <div className="error-banner">{error}</div>}

            {result && (
              <div className="table-responsive-wrapper">
                {result.columns.length > 0 ? (
                  <table className="data-table">
                    <thead>
                      <tr>
                        {result.columns.map((col) => (
                          <th key={col}>{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.length === 0 ? (
                        <tr>
                          <td
                            colSpan={result.columns.length}
                            className="no-results-td"
                          >
                            Nenhum registro retornado para esta configuração.
                          </td>
                        </tr>
                      ) : (
                        result.rows.map((row, rIdx) => (
                          <tr key={rIdx}>
                            {row.map((cell, cIdx) => (
                              <td key={cIdx}>{cell}</td>
                            ))}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                ) : (
                  <div className="empty-state">{result.message}</div>
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
