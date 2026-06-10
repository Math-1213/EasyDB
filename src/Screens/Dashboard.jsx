import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import "../App.css";

import TableDataScreen from "./TableDataScreen";
import TableStructureScreen from "./StructureScreen";
import QueryTextScreen from "./QueryTextScreen";
import QueryDynamicScreen from "./QueryDynamicScreen";
import UmlScreen from "./UmlScreen";

function DashboardScreen({ onDisconnect }) {
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState("");
  const [tableData, setTableData] = useState({ columns: [], rows: [] });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Estado que controla a aba ativa no painel principal
  const [activeTab, setActiveTab] = useState("dados");

  useEffect(() => {
    async function loadTables() {
      try {
        const list = await invoke("get_tables");
        setTables(list);
        if (list.length > 0) {
          handleSelectTable(list[0]);
        }
      } catch (err) {
        setError(`Erro ao carregar tabelas: ${err}`);
      }
    }
    loadTables();
  }, []);

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

  // Renderizador condicional do conteúdo dependendo da aba selecionada
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

      {/* Conteúdo Principal com Sistema de Abas Superior */}
      <main className="main-content">
        {error && <div className="error-banner">{error}</div>}

        {/* Menu de Abas Superior (Estilo Postbird / DevTools) */}
        <header className="tabs-navigation-bar">
          <div className="current-table-indicator">
            {selectedTable || "Sem seleção"}
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

        {/* Área onde o conteúdo da aba selecionada é injetado */}
        <div className="grid-container">{renderTabContent()}</div>
      </main>
    </div>
  );
}

export default DashboardScreen;
