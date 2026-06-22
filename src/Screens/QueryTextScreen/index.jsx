import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { downloadDir } from "@tauri-apps/api/path";
import {
  Play,
  Database,
  ShieldAlert,
  Download,
  CheckCircle,
} from "lucide-react";
import "./styles.css";
import * as fs from "@tauri-apps/plugin-fs";
import { isTauri } from "@tauri-apps/api/core";

export default function QueryTextScreen({ selectedTable }) {
  const [sql, setSql] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    console.log("TAURI:", window.__TAURI__);
    console.log(fs);
    console.log("isTauri =", isTauri());
  }, []);

  useEffect(() => {
    if (selectedTable) {
      setSql(`SELECT * FROM ${selectedTable} LIMIT 100;`);
    } else {
      setSql("SELECT * FROM ");
    }
  }, [selectedTable]);

  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(""), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  const handleExecute = async () => {
    if (!sql.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    setSuccessMessage("");

    try {
      const queryResult = await invoke("execute_raw_query", { sql });
      setResult(queryResult);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  // Exportação para CSV
  const exportToCSV = async () => {
    if (!result || !result.columns.length) return;

    try {
      const downloads = await downloadDir();
      const fileName = `query_result_${Date.now()}.csv`;
      const filePath = `${downloads}/${fileName}`;

      const headerRow = result.columns.join(",");
      const dataRows = result.rows.map((row) =>
        row
          .map((cell) => {
            const str = cell === null || cell === undefined ? "" : String(cell);
            if (str.includes(",") || str.includes("\n") || str.includes('"')) {
              return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
          })
          .join(","),
      );

      const csvContent = "\uFEFF" + [headerRow, ...dataRows].join("\n");

      await writeTextFile(filePath, csvContent);
      setSuccessMessage(`CSV exportado: ${fileName}`);
    } catch (err) {
      setError(`Erro ao salvar CSV: ${err}`);
      console.error(err);
    }
  };

  // Exportação para Excel (XLS)
  const exportToExcel = async () => {
    if (!result || !result.columns.length) return;

    try {
      const downloads = await downloadDir();
      const fileName = `query_result_${Date.now()}.xls`;
      const filePath = `${downloads}/${fileName}`;

      let html = "<table border='1'><thead><tr>";
      result.columns.forEach((col) => {
        html += `<th style='background-color: #0f172a; color: #ffffff; font-weight: bold;'>${col}</th>`;
      });
      html += "</tr></thead><tbody>";

      result.rows.forEach((row) => {
        html += "<tr>";
        row.forEach((cell) => {
          html += `<td>${cell === null || cell === undefined ? "" : cell}</td>`;
        });
        html += "</tr>";
      });
      html += "</tbody></table>";

      const template = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head><meta charset="utf-8" /><style>td { mso-number-format:"\\@"; }</style></head>
        <body>${html}</body>
        </html>
      `;

      await writeTextFile(filePath, template);
      setSuccessMessage(`Excel exportado: ${fileName}`);
    } catch (err) {
      setError(`Erro ao salvar Excel: ${err}`);
    }
  };

  return (
    <div className="query-screen-container">
      <div className="query-editor-zone">
        <textarea
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          placeholder="Digite seu comando SQL aqui..."
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

      <div className="query-result-zone">
        {error && (
          <div className="error-banner flex-align">
            <ShieldAlert size={16} style={{ marginRight: "8px" }} />
            <span>{error}</span>
          </div>
        )}

        {successMessage && (
          <div className="success-banner flex-align">
            <CheckCircle size={16} style={{ marginRight: "8px" }} />
            <span className="success-text">{successMessage}</span>
          </div>
        )}

        {result && (
          <div className="query-status-bar">
            <div className="status-info">
              <Database size={14} style={{ marginRight: "6px" }} />
              <span>{result.message}</span>
            </div>

            {result.columns.length > 0 && (
              <div className="export-buttons-group">
                <button onClick={exportToCSV} className="btn-export">
                  <Download size={12} style={{ marginRight: "4px" }} /> CSV
                </button>
                <button onClick={exportToExcel} className="btn-export excel">
                  <Download size={12} style={{ marginRight: "4px" }} /> Excel
                </button>
              </div>
            )}
          </div>
        )}

        <div className="table-responsive-wrapper">
          {result && result.columns.length > 0 && (
            <table className="data-table">
              <colgroup>
                {result.columns.map((colName, colIndex) => {
                  let maxLength = colName.length;
                  result.rows.forEach((row) => {
                    const cellValue = row[colIndex]
                      ? String(row[colIndex])
                      : "";
                    if (cellValue.length > maxLength)
                      maxLength = cellValue.length;
                  });
                  const width = `${Math.min(50, maxLength + 4)}ch`;
                  return (
                    <col key={colName} style={{ width, minWidth: width }} />
                  );
                })}
              </colgroup>
              <thead>
                <tr>
                  {result.columns.map((col) => (
                    <th key={col} className="sortable-th">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex} title={cell}>
                        {cell}
                      </td>
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
