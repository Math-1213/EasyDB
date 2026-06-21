import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Key, Link } from "lucide-react";
import "./styles.css";

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
      <div className="table-responsive-wrapper">
        <table className="data-table">
          <colgroup>
            <col style={{ width: "80px" }} />
            <col style={{ width: "25%" }} />
            <col style={{ width: "25%" }} />
            <col style={{ width: "15%" }} />
            <col style={{ width: "35%" }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ textAlign: "center" }}>Keys</th>
              <th>Coluna</th>
              <th>Tipo de Dado</th>
              <th>Nullable</th>
              <th>Valor Padrão (Default)</th>
            </tr>
          </thead>
          <tbody>
            {structure.map((col) => {
              // Gera o texto explicativo caso a coluna seja uma FK
              const fkTitle = col.foreign_target_table
                ? `Foreign Key -> References ${col.foreign_target_table}(${col.foreign_target_column})`
                : "Foreign Key (Chave Estrangeira)";

              return (
                <tr key={col.name}>
                  <td style={{ textAlign: "center" }}>
                    <div className="cell-keys-container">
                      {col.is_primary && <Key size={14} className="icon-pk" />}
                      {col.is_foreign && (
                        <Link size={14} className="icon-fk" title={fkTitle} />
                      )}
                    </div>
                  </td>
                  <td className="col-name-cell">
                    {col.name}
                    {col.foreign_target_table && (
                      <span className="fk-reference-lbl">
                        ➔ {col.foreign_target_table}
                      </span>
                    )}
                  </td>
                  <td className="col-type-cell">
                    <code>{col.data_type}</code>
                  </td>
                  <td>
                    <span
                      className={`badge-nullable ${col.is_nullable === "YES" ? "yes" : "no"}`}
                    >
                      {col.is_nullable === "YES" ? "NULL" : "NOT NULL"}
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
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
