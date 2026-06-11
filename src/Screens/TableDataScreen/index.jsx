import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core"; // Ou de onde você importa seus comandos nativos
import {
  Plus,
  Trash2,
  ChevronsUpDown,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import "./styles.css";

const OPERATORS = [
  { value: "=", label: "=" },
  { value: ">", label: ">" },
  { value: ">=", label: "≥" },
  { value: "<", label: "<" },
  { value: "<=", label: "≤" },
  { value: "contains", label: "Contém" },
  { value: "starts_with", label: "Começa com" },
  { value: "between", label: "Entre" },
];

export default function TableDataScreen({ tableName }) {
  // Estados de Configuração da Tabela Assíncrona
  const [columns, setColumns] = useState([]);
  const [rows, setRows] = useState([]);
  const [totalCount, setTotalCount] = useState(0); // Total de linhas reais no Banco de Dados inteiro
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Estados de Consulta
  const [filters, setFilters] = useState([]);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: "asc" });
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);

  // Interface de tamanho e edição de células
  const [colWidths, setColWidths] = useState({});
  const [editingCell, setEditingCell] = useState({
    rowIndex: null,
    colIndex: null,
  });
  const [editValue, setEditValue] = useState("");

  // Dispara a busca no banco sempre que qualquer parâmetro mudar
  useEffect(() => {
    fetchDataFromBackend();
  }, [tableName, filters, sortConfig, currentPage, pageSize]);

  const fetchDataFromBackend = async () => {
    try {
      // Exemplo de payload enviado ao Rust/Tauri para montar o SQL correto dinamicamente
      console.log("Buscando dados da tabela: ", {
        tableName,
        limit: pageSize,
        offset: (currentPage - 1) * pageSize,
        sortConfig,
        filters,
      });
      const response = await invoke("get_table_data_paginated", {
        tableName,
        limit: pageSize,
        offset: (currentPage - 1) * pageSize,
        sortColumn: sortConfig.key,
        sortDirection: sortConfig.direction,
        filters: filters.map((f) => ({
          column: f.column,
          operator: f.operator,
          value: f.value,
          value2: f.value2,
        })),
      });

      setColumns(response.columns || []);
      setRows(response.rows || []);
      setTotalCount(response.total_count || 0); // O backend deve rodar um: SELECT COUNT(*) FROM... com os mesmos filtros
    } catch (err) {
      console.error("Erro ao buscar dados do backend:", err);
    }
  };

  const formatCellValue = (value) => {
    if (value === null || value === undefined) return "";
    if (value instanceof Date) return value.toLocaleString();
    if (typeof value === "object") {
      if (value.secs_since_epoch !== undefined) {
        return new Date(value.secs_since_epoch * 1000).toLocaleString();
      }
      return JSON.stringify(value);
    }
    return String(value);
  };

  const handleSort = (columnName) => {
    let direction = "asc";
    if (sortConfig.key === columnName && sortConfig.direction === "asc") {
      direction = "desc";
    } else if (
      sortConfig.key === columnName &&
      sortConfig.direction === "desc"
    ) {
      columnName = null;
      direction = "asc";
    }
    setSortConfig({ key: columnName, direction });
    setCurrentPage(1); // Reseta para a primeira página ao reordenar
  };

  const handleMouseDown = (e, colName) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = colWidths[colName] || 180;

    const handleMouseMove = (moveEvent) => {
      const newWidth = Math.max(80, startWidth + (moveEvent.clientX - startX));
      setColWidths((prev) => ({ ...prev, [colName]: newWidth }));
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const addFilter = () => {
    if (!columns.length) return;
    setFilters([
      ...filters,
      {
        id: Date.now(),
        column: columns[0],
        operator: "=",
        value: "",
        value2: "",
      },
    ]);
  };

  const removeFilter = (id) => {
    setFilters(filters.filter((f) => f.id !== id));
    setCurrentPage(1);
  };

  const updateFilter = (id, field, value) => {
    setFilters(
      filters.map((f) => (f.id === id ? { ...f, [field]: value } : f)),
    );
    setCurrentPage(1);
  };

  const handleCellDoubleClick = (rowIndex, colIndex, currentValue) => {
    setEditingCell({ rowIndex, colIndex });
    setEditValue(formatCellValue(currentValue));
  };

  const handleSaveUpdate = async (rowIndex, colIndex) => {
    // Pegamos o valor diretamente do estado controlado 'editValue'
    const newValue = editValue;

    setEditingCell({ rowIndex: null, colIndex: null });
    setLoading(true);
    setError("");

    try {
      // 1. Busca a estrutura para identificar qual coluna é a PK
      const structure = await invoke("get_table_structure", {
        tableName: tableName, // Correção: de selectedTable para tableName
      });
      const pkColumnInfo = structure.find((c) => c.is_primary);

      if (!pkColumnInfo) {
        throw new Error(
          "Não foi possível atualizar: esta tabela não possui uma Primary Key definida.",
        );
      }

      const pkColumnName = pkColumnInfo.name;

      // 2. Localiza o index do cabeçalho correspondente à PK e à coluna atual
      const pkColIndex = columns.indexOf(pkColumnName); // Correção: de tableData.columns para columns
      const columnName = columns[colIndex]; // Correção: de tableData.columns para columns

      // 3. Pega o valor identificador da linha atual
      const pkValue = rows[rowIndex][pkColIndex]; // Correção: de tableData.rows para rows

      // 4. Dispara o update para o Rust
      await invoke("update_table_cell", {
        tableName: tableName, // Correção: de selectedTable para tableName
        columnName: columnName,
        newValue: newValue,
        pkColumn: pkColumnName,
        pkValue: String(pkValue),
      });

      // 5. Recarrega os dados atualizados do banco
      await fetchDataFromBackend();
    } catch (err) {
      console.error(err);
      setError(`Erro ao atualizar registro: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  if (!columns.length && !rows.length) {
    return (
      <div className="empty-state">Carregando ou tabela sem colunas...</div>
    );
  }

  // Gera o padrão de larguras dinâmicas (ex: "max-content max-content...")
  const getGridTemplateColumns = () => {
    if (!columns.length) return "1fr";

    return columns
      .map((colName, colIndex) => {
        // Mede o tamanho do texto do cabeçalho
        let maxLength = colName.length;

        // Percorre todas as linhas verificando o tamanho do texto daquela célula específica
        rows.forEach((row) => {
          const cellValue = row[colIndex] ? String(row[colIndex]) : "";
          if (cellValue.length > maxLength) {
            maxLength = cellValue.length;
          }
        });

        // Define um tamanho dinâmico aproximado em ch (largura do caractere '0') com um respiro de padding
        return `minmax(${maxLength + 4}ch, max-content)`;
      })
      .join(" ");
  };

  return (
    <div className="table-screen-container">
      {/* Filtros */}
      <div className="filter-builder-zone">
        <div className="filter-builder-header">
          <button onClick={addFilter} className="btn-add-filter">
            <Plus size={14} style={{ marginRight: "4px" }} /> Adicionar Filtro
          </button>
          {filters.length > 0 && (
            <span className="results-badge">
              {totalCount} registros encontrados nos filtros
            </span>
          )}
        </div>

        {filters.map((f) => (
          <div key={f.id} className="filter-row">
            <select
              value={f.column}
              onChange={(e) => updateFilter(f.id, "column", e.target.value)}
              className="filter-select"
            >
              {columns.map((col) => (
                <option key={col} value={col}>
                  {col}
                </option>
              ))}
            </select>

            <select
              value={f.operator}
              onChange={(e) => updateFilter(f.id, "operator", e.target.value)}
              className="filter-select operator"
            >
              {OPERATORS.map((op) => (
                <option key={op.value} value={op.value}>
                  {op.label}
                </option>
              ))}
            </select>

            <input
              type="text"
              placeholder={f.operator === "between" ? "Mínimo" : "Valor..."}
              value={f.value}
              onChange={(e) => updateFilter(f.id, "value", e.target.value)}
              className="filter-val-input"
            />

            {f.operator === "between" && (
              <>
                <span className="filter-between-and">e</span>
                <input
                  type="text"
                  placeholder="Máximo"
                  value={f.value2}
                  onChange={(e) => updateFilter(f.id, "value2", e.target.value)}
                  className="filter-val-input"
                />
              </>
            )}

            <button
              onClick={() => removeFilter(f.id)}
              className="btn-remove-filter"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* Tabela de Dados */}
      <div className="table-responsive-wrapper">
        <table className="data-table">
          {/* O colgroup define a largura de cada coluna sem quebrar a estrutura da tabela */}
          <colgroup>
            {columns.map((colName, colIndex) => {
              // Mede o tamanho do texto do cabeçalho
              let maxLength = colName.length;

              // Percorre as linhas para achar o maior texto desta coluna
              rows.forEach((row) => {
                const cellValue = row[colIndex] ? String(row[colIndex]) : "";
                if (cellValue.length > maxLength) {
                  maxLength = cellValue.length;
                }
              });

              // Caso você tenha redimensionado manualmente via mouse, usa o colWidths, senão usa o auto-size calculado
              const width = colWidths[colName] || `${maxLength + 4}ch`;

              return (
                <col
                  key={colName}
                  style={{
                    width: typeof width === "number" ? `${width}px` : width,
                    minWidth: typeof width === "number" ? `${width}px` : width,
                  }}
                />
              );
            })}
          </colgroup>

          <thead>
            <tr>
              {columns.map((col) => {
                const isSorted = sortConfig.key === col;
                return (
                  <th key={col} className="sortable-th">
                    <div className="th-content" onClick={() => handleSort(col)}>
                      <span className="th-text">{col}</span>
                      <span
                        className={`sort-icon ${isSorted ? sortConfig.direction : ""}`}
                      >
                        {isSorted ? (
                          sortConfig.direction === "asc" ? (
                            <ChevronUp size={14} />
                          ) : (
                            <ChevronDown size={14} />
                          )
                        ) : (
                          <ChevronsUpDown size={14} />
                        )}
                      </span>
                    </div>
                    <div
                      className="col-resizer"
                      onMouseDown={(e) => handleMouseDown(e, col)}
                    />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="no-results-td">
                  Nenhum registro encontrado.
                </td>
              </tr>
            ) : (
              rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => {
                    const isEditing =
                      editingCell.rowIndex === rowIndex &&
                      editingCell.colIndex === cellIndex;
                    const stringifiedValue = formatCellValue(cell);

                    return (
                      <td
                        key={cellIndex}
                        onDoubleClick={() =>
                          handleCellDoubleClick(rowIndex, cellIndex, cell)
                        }
                        title={stringifiedValue}
                      >
                        {isEditing ? (
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => handleSaveUpdate(rowIndex, cellIndex)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter")
                                handleSaveUpdate(rowIndex, cellIndex);
                              if (e.key === "Escape")
                                setEditingCell({
                                  rowIndex: null,
                                  colIndex: null,
                                });
                            }}
                            className="cell-edit-input"
                            autoFocus
                          />
                        ) : (
                          stringifiedValue
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Paginação de Banco de Dados */}
      <div className="table-pagination-bar">
        <div className="pagination-info">
          Exibindo de {Math.min(totalCount, (currentPage - 1) * pageSize + 1)} a{" "}
          {Math.min(totalCount, currentPage * pageSize)} de {totalCount}{" "}
          registros totais
        </div>

        <div className="pagination-controls">
          <select
            className="filter-select page-size-select"
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setCurrentPage(1);
            }}
          >
            <option value={50}>50 por página</option>
            <option value={100}>100 por página</option>
            <option value={500}>500 por página</option>
          </select>

          <div className="pagination-buttons">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="btn-page-nav"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="page-indicator">
              {currentPage} de {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="btn-page-nav"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
