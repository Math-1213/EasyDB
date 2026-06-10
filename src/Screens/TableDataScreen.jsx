import { useState, useMemo } from "react";
import {
  Plus,
  Trash2,
  ChevronsUpDown,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import "../App.css";

const OPERATORS = [
  { value: "=", label: "=" },
  { value: ">", label: ">" },
  { value: ">=", label: "≥" },
  { value: "<", label: "<" },
  { value: "<=", label: "≤" },
  { value: "contains", label: "Contém" },
  { value: "starts_with", label: "Começa com" },
  { value: "between", label: "Entre (X e Y)" },
];

export default function TableDataScreen({ tableData }) {
  const [filters, setFilters] = useState([]);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: "asc" });

  // Estados para gerenciar a edição em linha da célula
  const [editingCell, setEditingCell] = useState({
    rowIndex: null,
    colIndex: null,
  });
  const [editValue, setEditValue] = useState("");
  const [localRows, setLocalRows] = useState(null);

  // Inicializa ou sincroniza os dados locais de linhas quando tableData mudar
  const currentRows = useMemo(() => {
    if (localRows !== null) return localRows;
    return tableData?.rows || [];
  }, [tableData, localRows]);

  const addFilter = () => {
    if (!tableData.columns.length) return;
    setFilters([
      ...filters,
      {
        id: Date.now(),
        column: tableData.columns[0],
        operator: "=",
        value: "",
        value2: "",
      },
    ]);
  };

  const removeFilter = (id) => {
    setFilters(filters.filter((f) => f.id !== id));
  };

  const updateFilter = (id, field, value) => {
    setFilters(
      filters.map((f) => (f.id === id ? { ...f, [field]: value } : f)),
    );
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
  };

  // Ativa o modo de edição na célula ao dar duplo clique
  const handleCellDoubleClick = (rowIndex, colIndex, currentValue) => {
    setEditingCell({ rowIndex, colIndex });
    setEditValue(String(currentValue ?? ""));
  };

  // Salva a alteração da célula
  const handleSaveUpdate = (rowIndex, colIndex) => {
    const updatedRows = [...currentRows];

    // Preserva o tipo numérico se o valor original já era um número
    const originalValue = updatedRows[rowIndex][colIndex];
    const isNumber =
      typeof originalValue === "number" && !isNaN(Number(editValue));

    updatedRows[rowIndex][colIndex] = isNumber ? Number(editValue) : editValue;

    setLocalRows(updatedRows);
    setEditingCell({ rowIndex: null, colIndex: null });

    // TODO: Adicionar o invoke do Tauri aqui para atualizar o registro diretamente no Banco de Dados
    // Exemplo: await invoke("update_cell_value", { table: tableData.name, column: tableData.columns[colIndex], value: editValue, ...idRow })
  };

  const processedRows = useMemo(() => {
    if (!tableData || !currentRows) return [];
    let rows = [...currentRows];

    filters.forEach((f) => {
      const colIndex = tableData.columns.indexOf(f.column);
      if (colIndex === -1) return;

      rows = rows.filter((row) => {
        const cellValue = row[colIndex];
        const cellStr = String(cellValue).toLowerCase();
        const filterStr = f.value.toLowerCase();

        const cellNum = Number(cellValue);
        const filterNum = Number(f.value);
        const filterNum2 = Number(f.value2);
        const isNumericCompare = !isNaN(cellNum) && !isNaN(filterNum);

        switch (f.operator) {
          case "=":
            return isNumericCompare
              ? cellNum === filterNum
              : cellStr === filterStr;
          case ">":
            return isNumericCompare ? cellNum > filterNum : cellStr > filterStr;
          case ">=":
            return isNumericCompare
              ? cellNum >= filterNum
              : cellStr >= filterStr;
          case "<":
            return isNumericCompare ? cellNum < filterNum : cellStr < filterStr;
          case "<=":
            return isNumericCompare
              ? cellNum <= filterNum
              : cellStr <= filterStr;
          case "contains":
            return cellStr.includes(filterStr);
          case "starts_with":
            return cellStr.startsWith(filterStr);
          case "between":
            if (!isNaN(cellNum) && !isNaN(filterNum) && !isNaN(filterNum2)) {
              return cellNum >= filterNum && cellNum <= filterNum2;
            }
            return false;
          default:
            return true;
        }
      });
    });

    if (sortConfig.key !== null) {
      const colIndex = tableData.columns.indexOf(sortConfig.key);
      rows.sort((a, b) => {
        const valA = a[colIndex];
        const valB = b[colIndex];
        const numA = Number(valA);
        const numB = Number(valB);

        if (!isNaN(numA) && !isNaN(numB)) {
          return sortConfig.direction === "asc" ? numA - numB : numB - numA;
        }
        return sortConfig.direction === "asc"
          ? String(valA).localeCompare(String(valB))
          : String(valB).localeCompare(String(valA));
      });
    }

    return rows;
  }, [tableData, currentRows, filters, sortConfig]);

  if (!tableData || tableData.columns.length === 0) {
    return <div className="empty-state">Tabela vazia ou sem colunas.</div>;
  }

  return (
    <div className="table-screen-container">
      <div className="filter-builder-zone">
        <div className="filter-builder-header">
          <button onClick={addFilter} className="btn-add-filter">
            <Plus size={14} style={{ marginRight: "4px" }} /> Adicionar Filtro
          </button>
          {filters.length > 0 && (
            <span className="results-badge">
              {processedRows.length} de {tableData.rows.length} linhas filtradas
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
              {tableData.columns.map((col) => (
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
              title="Remover filtro"
            >
              <Trash2 size={14} className="icon-trash" />
            </button>
          </div>
        ))}
      </div>

      <div className="table-responsive-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              {tableData.columns.map((col) => {
                const isSorted = sortConfig.key === col;
                return (
                  <th
                    key={col}
                    onClick={() => handleSort(col)}
                    className="sortable-th"
                  >
                    <div className="th-content">
                      {col}
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
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {processedRows.length === 0 ? (
              <tr>
                <td
                  colSpan={tableData.columns.length}
                  className="no-results-td"
                >
                  Nenhum registro corresponde aos filtros definidos.
                </td>
              </tr>
            ) : (
              processedRows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => {
                    const isEditing =
                      editingCell.rowIndex === rowIndex &&
                      editingCell.colIndex === cellIndex;

                    return (
                      <td
                        key={cellIndex}
                        onDoubleClick={() =>
                          handleCellDoubleClick(rowIndex, cellIndex, cell)
                        }
                        style={{ position: "relative" }}
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
                          String(cell ?? "")
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
    </div>
  );
}
