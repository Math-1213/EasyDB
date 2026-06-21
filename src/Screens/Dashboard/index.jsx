import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Database,
  LogOut,
  TableProperties,
  Layers,
  Code,
  PlayCircle,
  Network,
} from "lucide-react";
import "./styles.css";
import "../../App.css";

import TableDataScreen from "../TableDataScreen";
import TableStructureScreen from "../StructureScreen";
import QueryTextScreen from "../QueryTextScreen";
import QueryDynamicScreen from "../QueryDynamicScreen";
import UmlScreen from "../UmlScreen";

function DashboardScreen({ onDisconnect, config, onUpdateTabConfig }) {
  const [databases, setDatabases] = useState([]);
  const [currentDb, setCurrentDb] = useState("");
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState("");
  const [tableData, setTableData] = useState({ columns: [], rows: [] });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("dados");
  const [joinedTables, setJoinedTables] = useState([]);

  // Estado e Referência para a largura da Sidebar
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const isResizingRef = useRef(false);

  useEffect(() => {
    async function initDashboard() {
      try {
        const dbList = await invoke("get_databases");
        setDatabases(dbList);
        if (config?.database) {
          setCurrentDb(config.database);
        }
        await loadTablesList();
      } catch (err) {
        setError(`Erro ao iniciar painel: ${err}`);
      }
    }
    initDashboard();
  }, [config?.database]);

  const loadTablesList = async () => {
    try {
      const list = await invoke("get_tables");
      setTables(list);
      if (list.length > 0) {
        handleSelectTable(list[0]);
      } else {
        setSelectedTable("");
        setTableData({ columns: [], rows: [] });
      }
    } catch (err) {
      setError(`Erro ao carregar tabelas: ${err}`);
    }
  };

  const handleSelectTable = async (tableName) => {
    setSelectedTable(tableName);
    setLoading(true);
    setError("");
    try {
      const data = await invoke("get_table_data", { tableName });
      setTableData(data);
    } catch (err) {
      setError(`Erro ao carregar dados da tabela: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDatabaseChange = async (newDb) => {
    const newConfig = { ...config, database: newDb };
    setLoading(true);
    setError("");
    try {
      await invoke("switch_database", { newDb });
      setCurrentDb(newDb);
      await loadTablesList();
    } catch (err) {
      setError(`Falha ao alternar banco: ${err}`);
    } finally {
      setLoading(false);
    }
    onUpdateTabConfig(newConfig);
  };

  // Funções para controlar o redimensionamento da barra lateral
  const startResizing = (e) => {
    e.preventDefault();
    isResizingRef.current = true;
    document.addEventListener("mousemove", resizeSidebar);
    document.addEventListener("mouseup", stopResizing);
    document.body.style.cursor = "col-resize"; // Força o cursor no app
  };

  const resizeSidebar = (e) => {
    if (!isResizingRef.current) return;
    // Define limites mínimo (180px) e máximo (500px) para a barra
    if (e.clientX >= 180 && e.clientX <= 500) {
      setSidebarWidth(e.clientX);
    }
  };

  const stopResizing = () => {
    isResizingRef.current = false;
    document.removeEventListener("mousemove", resizeSidebar);
    document.removeEventListener("mouseup", stopResizing);
    document.body.style.cursor = "default";
  };

  const handleTableClick = (e, tableName) => {
    if (e.ctrlKey || e.shiftKey) {
      // Força ir para a aba de Query Dinâmica para ver a alteração
      setActiveTab("query_dinamica");

      if (tableName === selectedTable) return; // Não faz nada com a tabela base

      setJoinedTables((prev) => {
        if (prev.includes(tableName)) {
          // Se já está no JOIN, remove (desseleciona)
          return prev.filter((t) => t !== tableName);
        } else {
          // Se não está, adiciona
          return [...prev, tableName];
        }
      });
    } else {
      // Clique comum: limpa os Joins anteriores e troca a tabela base
      setJoinedTables([]);
      handleSelectTable(tableName);
    }
  };

  const renderTabContent = () => {
    if (loading && activeTab === "dados") {
      return <div className="loading-state">Carregando dados...</div>;
    }
    switch (activeTab) {
      case "dados":
        return <TableDataScreen tableName={selectedTable} />;
      case "estrutura":
        return <TableStructureScreen selectedTable={selectedTable} />;
      case "query_texto":
        return <QueryTextScreen selectedTable={selectedTable} />;
      case "query_dinamica":
        // Passando os novos estados de controle para a tela dinâmica
        return (
          <QueryDynamicScreen
            selectedTable={selectedTable}
            joinedTables={joinedTables}
          />
        );
      case "uml":
        return (
          <UmlScreen selectedTable={selectedTable} currentDb={currentDb} />
        );
      default:
        return null;
    }
  };

  return (
    <div className="dashboard-layout">
      {/* Barra Lateral com largura inline dinâmica */}
      <aside
        className="sidebar"
        style={{ width: `${sidebarWidth}px`, minWidth: `${sidebarWidth}px` }}
      >
        <div className="sidebar-header">
          <h3>EasyPost</h3>
          <button onClick={onDisconnect} className="btn-disconnect">
            <LogOut size={12} /> Sair
          </button>
        </div>
        <div className="sidebar-title">TABELAS ({tables.length})</div>
        <ul className="table-list">
          {tables.map((table) => (
            <li
              key={table}
              className={
                selectedTable === table
                  ? "active"
                  : joinedTables.includes(table)
                    ? "joined-active"
                    : ""
              }
              onClick={(e) => handleTableClick(e, table)} // <-- Passa o evento aqui
            >
              <TableProperties size={14} className="li-icon" />{" "}
              <span>{table}</span>
            </li>
          ))}
        </ul>
      </aside>

      {/* Divisória clicável e arrastável */}
      <div className="sidebar-resizer" onMouseDown={startResizing} />

      {/* Conteúdo Principal */}
      <main className="main-content">
        {error && <div className="error-banner">{error}</div>}

        <header className="tabs-navigation-bar">
          <div className="db-switcher-container">
            <div className="select-wrapper">
              <Database size={14} className="select-icon" />
              <select
                value={currentDb}
                onChange={(e) => handleDatabaseChange(e.target.value)}
                className="db-select-dropdown"
              >
                {databases.map((db) => (
                  <option key={db} value={db}>
                    {db}
                  </option>
                ))}
              </select>
            </div>
            <span className="db-table-separator">/</span>
            <div className="current-table-indicator">
              {selectedTable || "Sem seleção"}
            </div>
          </div>

          <nav className="tabs-container">
            <button
              className={`tab-btn ${activeTab === "dados" ? "active" : ""}`}
              onClick={() => setActiveTab("dados")}
            >
              <Layers size={14} /> Dados
            </button>
            <button
              className={`tab-btn ${activeTab === "estrutura" ? "active" : ""}`}
              onClick={() => setActiveTab("estrutura")}
            >
              <TableProperties size={14} /> Estrutura
            </button>
            <button
              className={`tab-btn ${activeTab === "query_texto" ? "active" : ""}`}
              onClick={() => setActiveTab("query_texto")}
            >
              <Code size={14} /> Query SQL
            </button>
            <button
              className={`tab-btn ${activeTab === "query_dinamica" ? "active" : ""}`}
              onClick={() => setActiveTab("query_dinamica")}
            >
              <PlayCircle size={14} /> Query Dinâmica
            </button>
            <button
              className={`tab-btn ${activeTab === "uml" ? "active" : ""}`}
              onClick={() => setActiveTab("uml")}
            >
              <Network size={14} /> Diagrama UML
            </button>
          </nav>
        </header>

        <div className="grid-container">{renderTabContent()}</div>
      </main>
    </div>
  );
}

export default DashboardScreen;
