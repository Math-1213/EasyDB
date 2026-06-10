import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Play, Database, AlertCircle } from "lucide-react";
import "./styles.css";
import "../../App.css";

export default function QueryTextScreen({ selectedTable }) {
  const [sql, setSql] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Alimenta o editor com um comando padrão ao selecionar uma tabela na barra lateral
  useEffect(() => {
    if (selectedTable) {
      setSql(`SELECT * FROM ${selectedTable} LIMIT 100;`);
    } else {
      setSql("SELECT * FROM ");
    }
  }, [selectedTable]);

  const handleExecute = async () => {
    if (!sql.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const queryResult = await invoke("execute_raw_query", { sql });
      setResult(queryResult);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="query-screen-container">
      {/* Área do Editor */}
      <div className="query-editor-zone">
        <textarea
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          placeholder="Digite seu comando SQL aqui... (Ex: SELECT * FROM tabela)"
          className="sql-editor-box"
        />
        <div className="query-actions-bar">
          <button
            onClick={handleExecute}
            disabled={loading}
            className="btn-execute"
          >
            <Play size={14} style={{ marginRight: "6px" }} />
            {loading ? "Executando..." : "Executar Query"}
          </button>
        </div>
      </div>

      {/* Área de Resultados */}
      <div className="query-result-zone">
        {error && (
          <div className="error-banner flex-align">
            <ShieldAlert size={16} style={{ marginRight: "8px" }} />
            <span>{error}</span>
          </div>
        )}

        {result && (
          <div className="query-status-bar">
            <Database size={14} style={{ marginRight: "6px" }} />
            <span>{result.message}</span>
          </div>
        )}

        <div className="table-responsive-wrapper">
          {result && result.columns.length > 0 && (
            <table className="data-table">
              <thead>
                <tr>
                  {result.columns.map((col) => (
                    <th key={col}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
