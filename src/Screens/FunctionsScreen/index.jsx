import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Plus,
  Trash2,
  Play,
  Edit2,
  Check,
  X,
  GripVertical,
  ChevronDown,
  ChevronRight,
  FunctionSquare,
  Info,
  Copy,
} from "lucide-react";
import "./styles.css";

// ─────────────────────────────────────────────
// Parsing de parâmetros do template
// ─────────────────────────────────────────────
function parseParams(template) {
  const regex = /\$\{([^}]+)\}/g;
  const params = [];
  let match;
  let idx = 0;

  while ((match = regex.exec(template)) !== null) {
    const raw = match[1].trim();

    // Select: "Op1"|"Op2"|...
    if (raw.startsWith('"')) {
      const options = raw.split("|").map((o) => o.trim().replace(/^"|"$/g, ""));
      params.push({
        id: idx++,
        raw,
        type: "select",
        options,
        value: options[0] || "",
      });
      continue;
    }

    switch (raw) {
      case "integer":
        params.push({ id: idx++, raw, type: "integer", value: "" });
        break;
      case "float":
        params.push({ id: idx++, raw, type: "float", value: "" });
        break;
      case "text":
        params.push({ id: idx++, raw, type: "text", value: "" });
        break;
      case "date":
        params.push({ id: idx++, raw, type: "date", value: "" });
        break;
      case "datetime":
        params.push({ id: idx++, raw, type: "datetime", value: "" });
        break;
      case "boolean":
        params.push({ id: idx++, raw, type: "boolean", value: "true" });
        break;
      default:
        params.push({ id: idx++, raw, type: "text", value: "" });
    }
  }

  return params;
}

function buildQuery(template, params) {
  let paramIdx = 0;
  return template.replace(/\$\{([^}]+)\}/g, () => {
    const p = params[paramIdx++];
    if (!p) return "NULL";

    switch (p.type) {
      case "text":
      case "select":
      case "date":
      case "datetime":
        // Escapa aspas simples internas e envolve em ''
        return `'${p.value.replace(/'/g, "''")}'`;
      case "boolean":
        return p.value; // true / false sem aspas
      case "integer":
      case "float":
        return p.value === "" ? "NULL" : p.value; // numérico sem aspas
      default:
        return `'${p.value.replace(/'/g, "''")}'`;
    }
  });
}

// ─────────────────────────────────────────────
// Storage helpers (por banco)
// ─────────────────────────────────────────────
function loadFunctions(dbKey) {
  try {
    const raw = localStorage.getItem(`fn_${dbKey}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveFunctions(dbKey, fns) {
  localStorage.setItem(`fn_${dbKey}`, JSON.stringify(fns));
}

// ─────────────────────────────────────────────
// Componente de Input por tipo
// ─────────────────────────────────────────────
function ParamInput({ param, onChange }) {
  switch (param.type) {
    case "integer":
      return (
        <input
          type="number"
          step="1"
          value={param.value}
          onChange={(e) => onChange(param.id, e.target.value)}
          className="param-input"
          placeholder="inteiro"
        />
      );
    case "float":
      return (
        <input
          type="number"
          step="any"
          value={param.value}
          onChange={(e) => onChange(param.id, e.target.value)}
          className="param-input"
          placeholder="decimal"
        />
      );
    case "date":
      return (
        <input
          type="date"
          value={param.value}
          onChange={(e) => onChange(param.id, e.target.value)}
          className="param-input param-date"
        />
      );
    case "datetime":
      return (
        <input
          type="datetime-local"
          value={param.value}
          onChange={(e) => onChange(param.id, e.target.value)}
          className="param-input param-date"
        />
      );
    case "boolean":
      return (
        <select
          value={param.value}
          onChange={(e) => onChange(param.id, e.target.value)}
          className="param-input param-select"
        >
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      );
    case "select":
      return (
        <select
          value={param.value}
          onChange={(e) => onChange(param.id, e.target.value)}
          className="param-input param-select"
        >
          {param.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    default:
      return (
        <input
          type="text"
          value={param.value}
          onChange={(e) => onChange(param.id, e.target.value)}
          className="param-input"
          placeholder="texto"
        />
      );
  }
}

// ─────────────────────────────────────────────
// Painel de resultado
// ─────────────────────────────────────────────
function ResultTable({ result, usedSql }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(usedSql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  if (!result) return null;

  if (result.error) {
    return <div className="fn-error-banner">{result.error}</div>;
  }

  if (!result.columns?.length) {
    return (
      <div className="fn-result-empty">
        ✓ Executado com sucesso — {result.message}
      </div>
    );
  }

  // Calcula largura ideal por coluna
  const colWidths = result.columns.map((col, colIdx) => {
    const headerLen = col.length;
    const maxValueLen = result.rows.reduce((max, row) => {
      const cell = row[colIdx] != null ? String(row[colIdx]) : "";
      return Math.max(max, cell.length);
    }, 0);
    const ch = Math.max(headerLen, Math.min(maxValueLen, 40)); // cap em 40ch
    return `${ch + 3}ch`;
  });

  return (
    <div className="fn-result-wrapper">
      {/* Query usada */}
      <div className="fn-result-sql">
        <div className="fn-result-sql-header">
          <span>Query executada</span>
          <button className="fn-copy-btn" onClick={handleCopy}>
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? "Copiado!" : "Copiar"}
          </button>
        </div>
        <pre>{usedSql}</pre>
      </div>

      <div className="fn-result-meta">{result.message}</div>

      <div className="fn-result-scroll">
        <table className="data-table fn-result-table">
          <colgroup>
            {colWidths.map((w, i) => (
              <col key={i} style={{ width: w, minWidth: w }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {result.columns.map((col) => (
                <th key={col} title={col}>
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => {
                  const str = cell != null ? String(cell) : "";
                  return (
                    <td key={j} title={str}>
                      {str}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Card de uma função
// ─────────────────────────────────────────────
function FunctionCard({
  fn,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(fn.name);
  const [editGroup, setEditGroup] = useState(fn.group);
  const [editTemplate, setEditTemplate] = useState(fn.template);
  const [params, setParams] = useState(() => parseParams(fn.template));
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [usedSql, setUsedSql] = useState("");

  // Reparsa params quando o template mudar ao editar
  useEffect(() => {
    if (!editing) {
      setParams(parseParams(fn.template));
    }
  }, [fn.template, editing]);

  const handleParamChange = (id, value) => {
    setParams((prev) => prev.map((p) => (p.id === id ? { ...p, value } : p)));
  };

  const handleRun = async () => {
    setRunning(true);
    setResult(null);
    try {
      const sql = buildQuery(fn.template, params);
      setUsedSql(sql); // ← guarda para debug
      const res = await invoke("execute_raw_query", { sql });
      setResult({ columns: res.columns, rows: res.rows, message: res.message });
    } catch (err) {
      setResult({ error: String(err) });
    } finally {
      setRunning(false);
    }
  };

  const handleSaveEdit = () => {
    onUpdate({
      ...fn,
      name: editName,
      group: editGroup,
      template: editTemplate,
    });
    setEditing(false);
    setParams(parseParams(editTemplate));
    setResult(null);
  };

  const handleCancelEdit = () => {
    setEditName(fn.name);
    setEditGroup(fn.group);
    setEditTemplate(fn.template);
    setEditing(false);
  };

  const parsedParams = editing ? parseParams(editTemplate) : params;

  return (
    <div className={`fn-card ${expanded ? "fn-card--open" : ""}`}>
      {/* Header */}
      <div
        className="fn-card-header"
        onClick={() => !editing && setExpanded((v) => !v)}
      >
        <div className="fn-card-drag">
          <button
            className="fn-move-btn"
            onClick={(e) => {
              e.stopPropagation();
              onMoveUp();
            }}
            disabled={isFirst}
            title="Mover para cima"
          >
            ▲
          </button>
          <button
            className="fn-move-btn"
            onClick={(e) => {
              e.stopPropagation();
              onMoveDown();
            }}
            disabled={isLast}
            title="Mover para baixo"
          >
            ▼
          </button>
        </div>

        <div className="fn-card-meta">
          {editing ? (
            <div
              className="fn-edit-header-inputs"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                className="fn-edit-input fn-edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Nome da função"
              />
              <input
                className="fn-edit-input fn-edit-group"
                value={editGroup}
                onChange={(e) => setEditGroup(e.target.value)}
                placeholder="Grupo (opcional)"
              />
            </div>
          ) : (
            <>
              <span className="fn-card-name">{fn.name || "Sem nome"}</span>
              {fn.group && <span className="fn-card-group">{fn.group}</span>}
            </>
          )}
        </div>

        <div className="fn-card-actions" onClick={(e) => e.stopPropagation()}>
          {editing ? (
            <>
              <button
                className="fn-action-btn fn-save-btn"
                onClick={handleSaveEdit}
                title="Salvar"
              >
                <Check size={14} />
              </button>
              <button
                className="fn-action-btn fn-cancel-btn"
                onClick={handleCancelEdit}
                title="Cancelar"
              >
                <X size={14} />
              </button>
            </>
          ) : (
            <>
              <button
                className="fn-action-btn"
                onClick={() => {
                  setEditing(true);
                  setExpanded(true);
                }}
                title="Editar"
              >
                <Edit2 size={14} />
              </button>
              <button
                className="fn-action-btn fn-delete-btn"
                onClick={() => onDelete(fn.id)}
                title="Excluir"
              >
                <Trash2 size={14} />
              </button>
            </>
          )}
          <span className="fn-chevron">
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
        </div>
      </div>

      {/* Body */}
      {expanded && (
        <div className="fn-card-body">
          {/* Template */}
          <div className="fn-section-label">Template SQL</div>
          {editing ? (
            <textarea
              className="fn-template-editor"
              value={editTemplate}
              onChange={(e) => setEditTemplate(e.target.value)}
              rows={4}
              spellCheck={false}
            />
          ) : (
            <pre className="fn-template-preview">{fn.template}</pre>
          )}

          {/* Params */}
          {parsedParams.length > 0 && (
            <div className="fn-params-zone">
              <div className="fn-section-label">Parâmetros</div>
              <div className="fn-params-grid">
                {parsedParams.map((p, i) => (
                  <div key={p.id} className="fn-param-row">
                    <span className="fn-param-label">
                      <code>${`{${p.raw}}`}</code>
                    </span>
                    <ParamInput
                      param={p}
                      onChange={editing ? () => {} : handleParamChange}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Run */}
          {!editing && (
            <div className="fn-run-zone">
              <button
                className="fn-run-btn"
                onClick={handleRun}
                disabled={running}
              >
                <Play size={14} />
                {running ? "Executando..." : "Executar"}
              </button>
            </div>
          )}

          <ResultTable result={result} usedSql={usedSql} />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Modal de nova função
// ─────────────────────────────────────────────
function NewFunctionModal({ onSave, onClose }) {
  const [name, setName] = useState("");
  const [group, setGroup] = useState("");
  const [template, setTemplate] = useState("");
  const textareaRef = useRef(null);
  const preview = parseParams(template);

  const insertToken = (token) => {
    const el = textareaRef.current;
    if (!el) {
      setTemplate((t) => t + token);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = template.slice(0, start) + token + template.slice(end);
    setTemplate(next);
    // Reposiciona o cursor após o token inserido
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const handleSave = () => {
    if (!template.trim()) return;
    onSave({
      id: Date.now().toString(),
      name: name || "Sem nome",
      group: group.trim(),
      template: template.trim(),
    });
  };

  return (
    <div className="fn-modal-overlay" onClick={onClose}>
      <div className="fn-modal" onClick={(e) => e.stopPropagation()}>
        <div className="fn-modal-header">
          <h3>Nova Função</h3>
          <button className="fn-action-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="fn-modal-body">
          <label className="fn-label">Nome</label>
          <input
            className="fn-edit-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Buscar animal por ID"
          />

          <label className="fn-label">
            Grupo <span className="fn-label-hint">(opcional)</span>
          </label>
          <input
            className="fn-edit-input"
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            placeholder="Ex: Animals, Reports..."
          />

          <label className="fn-label">Template SQL</label>
          <textarea
            ref={textareaRef}
            className="fn-template-editor"
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            rows={5}
            placeholder={"SELECT * FROM animals WHERE id = ${integer}"}
            spellCheck={false}
          />

          {/* Referência de tipos */}
          <div className="fn-types-ref">
            <div className="fn-types-ref-title">
              <Info size={12} /> Clique para inserir no template
            </div>
            <div className="fn-types-grid">
              {[
                ["${integer}", "Número inteiro"],
                ["${float}", "Número decimal"],
                ["${text}", "Texto livre"],
                ["${date}", "Seletor de data"],
                ["${datetime}", "Data + hora"],
                ["${boolean}", "true / false"],
                ['${"A"|"B"|"C"}', "Select fixo"],
              ].map(([token, desc]) => (
                <div
                  key={token}
                  className="fn-type-row fn-type-row--clickable"
                  onClick={() => insertToken(token)}
                  title={`Inserir ${token}`}
                >
                  <code>{token}</code>
                  <span>{desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Preview de params */}
          {preview.length > 0 && (
            <div className="fn-modal-preview">
              <div className="fn-section-label">Parâmetros detectados</div>
              {preview.map((p) => (
                <div key={p.id} className="fn-type-row">
                  <code>${`{${p.raw}}`}</code>
                  <span className="fn-param-type-badge">{p.type}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="fn-modal-footer">
          <button className="fn-cancel-text-btn" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="fn-run-btn"
            onClick={handleSave}
            disabled={!template.trim()}
          >
            <Check size={14} /> Salvar Função
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Tela principal
// ─────────────────────────────────────────────
export default function FunctionsScreen({ currentDb }) {
  const [functions, setFunctions] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState("");

  const dbKey = currentDb || "default";

  useEffect(() => {
    setFunctions(loadFunctions(dbKey));
  }, [dbKey]);

  const persist = (fns) => {
    setFunctions(fns);
    saveFunctions(dbKey, fns);
  };

  const handleAdd = (fn) => {
    persist([...functions, fn]);
    setShowModal(false);
  };

  const handleUpdate = (updated) => {
    persist(functions.map((f) => (f.id === updated.id ? updated : f)));
  };

  const handleDelete = (id) => {
    persist(functions.filter((f) => f.id !== id));
  };

  const handleMoveUp = (idx) => {
    if (idx === 0) return;
    const fns = [...functions];
    [fns[idx - 1], fns[idx]] = [fns[idx], fns[idx - 1]];
    persist(fns);
  };

  const handleMoveDown = (idx) => {
    if (idx === functions.length - 1) return;
    const fns = [...functions];
    [fns[idx], fns[idx + 1]] = [fns[idx + 1], fns[idx]];
    persist(fns);
  };

  // Agrupa e filtra
  const filtered = functions.filter(
    (f) =>
      f.name.toLowerCase().includes(search.toLowerCase()) ||
      (f.group || "").toLowerCase().includes(search.toLowerCase()),
  );

  const groups = [...new Set(filtered.map((f) => f.group || ""))];

  return (
    <div className="fn-screen">
      {/* Toolbar */}
      <div className="fn-toolbar">
        <input
          className="fn-search"
          placeholder="Buscar funções..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="fn-run-btn" onClick={() => setShowModal(true)}>
          <Plus size={14} /> Nova Função
        </button>
      </div>

      {/* Lista agrupada */}
      <div className="fn-list">
        {filtered.length === 0 && (
          <div className="fn-empty">
            <FunctionSquare size={32} />
            <p>Nenhuma função criada ainda.</p>
            <p>Crie funções SQL reutilizáveis com parâmetros dinâmicos.</p>
          </div>
        )}

        {groups.map((group) => {
          const groupFns = filtered.filter((f) => (f.group || "") === group);
          return (
            <div key={group} className="fn-group">
              {group && <div className="fn-group-label">{group}</div>}
              {groupFns.map((fn) => {
                const realIdx = functions.findIndex((f) => f.id === fn.id);
                return (
                  <FunctionCard
                    key={fn.id}
                    fn={fn}
                    onUpdate={handleUpdate}
                    onDelete={handleDelete}
                    onMoveUp={() => handleMoveUp(realIdx)}
                    onMoveDown={() => handleMoveDown(realIdx)}
                    isFirst={realIdx === 0}
                    isLast={realIdx === functions.length - 1}
                  />
                );
              })}
            </div>
          );
        })}
      </div>

      {showModal && (
        <NewFunctionModal
          onSave={handleAdd}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
