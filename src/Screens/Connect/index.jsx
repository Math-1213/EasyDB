import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Save, Trash2, X, Check } from "lucide-react";
import "../../App.css";
import "./styles.css";

function ConnectScreen({ onConnectSuccess }) {
  const [config, setConfig] = useState({
    host: "",
    port: "5432",
    user: "",
    password: "",
    database: "",
  });
  const [presets, setPresets] = useState([]);
  const [presetName, setPresetName] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [presetToDelete, setPresetToDelete] = useState(null);

  useEffect(() => {
    const savedPresets = localStorage.getItem("easypost_presets");
    if (savedPresets) {
      setPresets(JSON.parse(savedPresets));
    }
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setConfig((prev) => ({ ...prev, [name]: value }));
  };

  const connectWithConfig = async (connectionConfig) => {
    setLoading(true);
    setStatus("Tentando conectar...");

    try {
      const response = await invoke("connect_db", {
        config: connectionConfig,
      });

      setStatus(response);

      if (response === "Conectado com sucesso!") {
        onConnectSuccess({ ...connectionConfig });
      }
    } catch (error) {
      setStatus(`Erro: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async (e) => {
    e.preventDefault();
    await connectWithConfig(config);
  };

  const handleSavePreset = (e) => {
    e.preventDefault();
    if (!presetName.trim()) return;

    const newPreset = {
      id: Date.now(),
      name: presetName,
      config: { ...config },
    };

    const updated = [...presets, newPreset];
    savePresetsList(updated);
    setPresetName("");
    setStatus(`Preset "${newPreset.name}" salvo!`);
  };

  const handleSelectPreset = (preset) => {
    if (presetToDelete) return;
    setConfig({ ...preset.config });
    setStatus(`Preset "${preset.name}" carregado.`);
  };

  const savePresetsList = (newList) => {
    setPresets(newList);
    localStorage.setItem("easypost_presets", JSON.stringify(newList));
  };

  const handlePresetDoubleClick = async (preset) => {
    if (presetToDelete) return;

    setConfig({ ...preset.config });

    await connectWithConfig(preset.config);
  };

  return (
    <div className="login-container">
      <h1>EasyPost</h1>
      <p>Conecte-se ao seu banco PostgreSQL</p>

      {presets.length > 0 && (
        <div className="presets-section">
          <label className="preset-label">Presets Salvos</label>
          <div className="presets-list">
            {presets.map((p) => {
              const isConfirming = presetToDelete === p.id;
              return (
                <div
                  key={p.id}
                  className={`preset-badge ${isConfirming ? "confirming" : ""}`}
                  onClick={() => handleSelectPreset(p)}
                  onDoubleClick={() => handlePresetDoubleClick(p)}
                >
                  <span>{isConfirming ? "Excluir?" : p.name}</span>

                  {isConfirming ? (
                    <div className="badge-confirm-actions">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const updated = presets.filter(
                            (item) => item.id !== p.id,
                          );
                          savePresetsList(updated);
                          setPresetToDelete(null);
                        }}
                        className="btn-badge-confirm"
                      >
                        <Check size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPresetToDelete(null);
                        }}
                        className="btn-badge-cancel"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPresetToDelete(p.id);
                      }}
                      className="btn-delete-preset"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <form onSubmit={handleConnect}>
        <div className="form-group">
          <label>Host</label>
          <input
            name="host"
            value={config.host}
            onChange={handleChange}
            required
          />
        </div>

        <div className="form-group-row">
          <div className="form-group">
            <label>Porta</label>
            <input
              name="port"
              value={config.port}
              onChange={handleChange}
              required
            />
          </div>
          <div className="form-group">
            <label>Banco de Dados</label>
            <input
              name="database"
              value={config.database}
              onChange={handleChange}
              placeholder="postgres"
              required
            />
          </div>
        </div>

        <div className="form-group">
          <label>Usuário</label>
          <input
            name="user"
            value={config.user}
            onChange={handleChange}
            required
          />
        </div>

        <div className="form-group">
          <label>Senha</label>
          <input
            type="password"
            name="password"
            value={config.password}
            onChange={handleChange}
          />
        </div>

        <div className="save-preset-container">
          <input
            type="text"
            placeholder="Nome do preset..."
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            className="preset-name-input"
          />
          <button
            type="button"
            onClick={handleSavePreset}
            disabled={!presetName.trim()}
            className="btn-save-preset"
          >
            <Save size={14} /> Salvar
          </button>
        </div>

        <button type="submit" disabled={loading} className="btn-connect-main">
          {loading ? "Conectando..." : "Conectar e Abrir Painel"}
        </button>
      </form>

      {status && <div className="status-message">{status}</div>}
    </div>
  );
}

export default ConnectScreen;
