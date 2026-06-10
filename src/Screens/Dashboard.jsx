import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Database, LogOut } from "lucide-react"; // Opcional se usar ícones
import "../App.css";

import TableDataScreen from "./TableDataScreen";
import TableStructureScreen from "./StructureScreen";
import QueryTextScreen from "./QueryTextScreen";
import QueryDynamicScreen from "./QueryDynamicScreen";
import UmlScreen from "./UmlScreen";

function DashboardScreen({ onDisconnect }) {
  const [databases, setDatabases] = useState([]);
  const [currentDb, setCurrentDb] = useState("");
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState("");
  const [tableData, setTableData] = useState({ columns: [], rows: [] });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("dados");

  // Carrega as databases disponíveis e depois lista as tabelas do banco padrão inicial
  useEffect(() => {
    async function initDashboard() {
      try {
        const dbList = await invoke("get_databases");
        setDatabases(dbList);

        // Carrega tabelas do banco inicial ativo
        await loadTablesList();
      } catch (err) {
        setError(`Erro ao iniciar painel: ${err}`);
      }
    }
    initDashboard();
  }, []);

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

  // Trata a alteração do banco no Select do Header
  const handleDatabaseChange = async (newDb) => {
    setLoading(true);
    setError("");
    try {
      await invoke("switch_database", { newDb });
      setCurrentDb(newDb);
      // Recarrega a lista de tabelas do novo banco injetado
      await loadTablesList();
    } catch (err) {
      setError(`Falha ao alternar banco: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const renderTabContent = () => {
    if (loading && activeTab === "dados") {
      return <div className="loading-state">Carregando dados...</div>;
    }
    switch (activeTab) {
      case "dados":
        return <TableDataScreen tableData={tableData} />;
      case "estrutura":
        return <TableStructureScreen selectedTable={selectedTable} />;
      case "query_texto":
        return <QueryTextScreen selectedTable={selectedTable} />;
      case "query_dinamica":
        return <QueryDynamicScreen selectedTable={selectedTable} />;
      case "uml":
        return <UmlScreen selectedTable={selectedTable} />;
      default:
        return null;
    }
  };

  return (
    <div className="dashboard-layout">
      {/* Barra Lateral */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h3>EasyPost</h3>
          <button onClick={onDisconnect} className="btn-disconnect">
            Sair
          </button>
        </div>
        <div className="sidebar-title">TABELAS ({tables.length})</div>
        <ul className="table-list">
          {tables.map((table) => (
            <li
              key={table}
              className={selectedTable === table ? "active" : ""}
              onClick={() => handleSelectTable(table)}
            >
              📊 {table}
            </li>
          ))}
        </ul>
      </aside>

      {/* Conteúdo Principal */}
      <main className="main-content">
        {error && <div className="error-banner">{error}</div>}

        <header className="tabs-navigation-bar">
          {/* Seletor Dinâmico de Database no Header */}
          <div className="db-switcher-container">
            <select
              value={currentDb}
              onChange={(e) => handleDatabaseChange(e.target.value)}
              className="db-select-dropdown"
            >
              {databases.map((db) => (
                <option key={db} value={db}>
                  🗄️ {db}
                </option>
              ))}
            </select>
            <span className="db-table-separator">/</span>
            <div className="current-table-indicator">
              {selectedTable || "Sem seleção"}
            </div>
          </div>

          <nav className="tabs-container">
            <button
              className={activeTab === "dados" ? "tab-btn active" : "tab-btn"}
              onClick={() => setActiveTab("dados")}
            >
              Dados
            </button>
            <button
              className={
                activeTab === "estrutura" ? "tab-btn active" : "tab-btn"
              }
              onClick={() => setActiveTab("estrutura")}
            >
              Estrutura
            </button>
            <button
              className={
                activeTab === "query_texto" ? "tab-btn active" : "tab-btn"
              }
              onClick={() => setActiveTab("query_texto")}
            >
              Query SQL
            </button>
            <button
              className={
                activeTab === "query_dinamica" ? "tab-btn active" : "tab-btn"
              }
              onClick={() => setActiveTab("query_dinamica")}
            >
              Query Dinâmica
            </button>
            <button
              className={activeTab === "uml" ? "tab-btn active" : "tab-btn"}
              onClick={() => setActiveTab("uml")}
            >
              Diagrama UML
            </button>
          </nav>
        </header>

        <div className="grid-container">{renderTabContent()}</div>
      </main>
    </div>
  );
}

export default DashboardScreen;
