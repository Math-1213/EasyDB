import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Key, Link, ShieldAlert } from "lucide-react";
import "../App.css";

export default function TableStructureScreen({ selectedTable }) {
  const [structure, setStructure] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadStructure() {
      if (!selectedTable) return;
      setLoading(true);
      setError("");
      try {
        const data = await invoke("get_table_structure", {
          tableName: selectedTable,
        });
        setStructure(data);
      } catch (err) {
        setError(`Erro ao carregar estrutura: ${err}`);
      } finally {
        setLoading(false);
      }
    }
    loadStructure();
  }, [selectedTable]);

  if (!selectedTable) {
    return (
      <div className="empty-state">
        Selecione uma tabela para ver a estrutura.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="loading-state">Carregando metadados da estrutura...</div>
    );
  }

  if (error) {
    return <div className="error-banner">{error}</div>;
  }

  return (
    <div className="structure-screen-container">
      <div className="structure-header">
        <h3>
          Definição de Colunas de <span>{selectedTable}</span>
        </h3>
      </div>

      <div className="table-responsive-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: "60px", textAlign: "center" }}>Keys</th>
              <th>Coluna</th>
              <th>Tipo de Dado</th>
              <th>Aceita Nulo (Nullable)</th>
              <th>Valor Padrão (Default)</th>
            </tr>
          </thead>
          <tbody>
            {structure.map((col) => (
              <tr key={col.name}>
                <td style={{ textAlign: "center" }}>
                  <div className="cell-keys-container">
                    {col.is_primary && (
                      <Key
                        size={14}
                        className="icon-pk"
                        title="Primary Key (Chave Primária)"
                      />
                    )}
                    {col.is_foreign && (
                      <Link
                        size={14}
                        className="icon-fk"
                        title="Foreign Key (Chave Estrangeira)"
                      />
                    )}
                  </div>
                </td>
                <td className="col-name-cell">{col.name}</td>
                <td className="col-type-cell">
                  <code>{col.data_type}</code>
                </td>
                <td>
                  <span
                    className={`badge-nullable ${col.is_nullable === "YES" ? "yes" : "no"}`}
                  >
                    {col.is_nullable}
                  </span>
                </td>
                <td className="col-default-cell">
                  {col.column_default ? (
                    <code>{col.column_default}</code>
                  ) : (
                    <span className="null-text">none</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
