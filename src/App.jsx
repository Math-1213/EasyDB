import { useState } from "react";
import ConnectScreen from "./Screens/Connect/index.jsx";
import { Plus, X, Database } from "lucide-react";
import DashboardScreen from "./Screens/Dashboard/index.jsx";

function App() {
  const [tabs, setTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);
  const [showConnect, setShowConnect] = useState(true);

  // Auxiliar para gerar o título baseado na config
  const generateTabTitle = (config) => {
    const shortHost = config.host.split(".")[0] || config.host;
    return `${config.database} (${config.user}@${shortHost})`;
  };

  const handleNewConnection = (config) => {
    const newTab = {
      id: Date.now().toString(),
      title: generateTabTitle(config),
      config: config,
    };

    setTabs([...tabs, newTab]);
    setActiveTabId(newTab.id);
    setShowConnect(false);
  };

  // Nova função para atualizar os dados da aba dinamicamente
  const handleUpdateTabConfig = (updatedConfig) => {
    setTabs((prevTabs) =>
      prevTabs.map((tab) =>
        tab.id === activeTabId
          ? {
              ...tab,
              title: generateTabTitle(updatedConfig),
              config: updatedConfig,
            }
          : tab,
      ),
    );
  };

  const closeTab = (tabId, e) => {
    e.stopPropagation();
    const filteredTabs = tabs.filter((t) => t.id !== tabId);
    setTabs(filteredTabs);

    if (activeTabId === tabId) {
      if (filteredTabs.length > 0) {
        setActiveTabId(filteredTabs[filteredTabs.length - 1].id);
      } else {
        setShowConnect(true);
      }
    }
  };

  const activeTab = tabs.find((t) => t.id === activeTabId);

  return (
    <div className="app-layout">
      {tabs.length > 0 && (
        <div className="tabs-bar">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`tab-item ${activeTabId === tab.id && !showConnect ? "active" : ""}`}
              onClick={() => {
                setActiveTabId(tab.id);
                setShowConnect(false);
              }}
            >
              <Database size={14} className="tab-icon" />
              <span className="tab-title">{tab.title}</span>
              <button
                className="btn-close-tab"
                onClick={(e) => closeTab(tab.id, e)}
              >
                <X size={12} />
              </button>
            </div>
          ))}

          <button
            className={`tab-item-plus ${showConnect ? "active" : ""}`}
            onClick={() => setShowConnect(true)}
            title="Nova Conexão"
          >
            <Plus size={16} />
          </button>
        </div>
      )}

      <div className="main-content">
        {showConnect ? (
          <ConnectScreen onConnectSuccess={handleNewConnection} />
        ) : (
          <div className="dashboard-view">
            {/* Repassamos a config atual e a função que atualiza a aba */}
            <DashboardScreen
              config={activeTab?.config}
              onUpdateTabConfig={handleUpdateTabConfig}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
