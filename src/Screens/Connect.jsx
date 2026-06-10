import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Save, Trash2 } from "lucide-react";
import "../App.css";

function ConnectScreen({ onConnectSuccess }) {
  const [config, setConfig] = useState({
    // host: "ep-soft-firefly-aca18i1s-pooler.sa-east-1.aws.neon.tech",
    // port: "5432",
    // user: "neondb_owner",
    // password: "npg_BbOf2LH5GYZC",
    // database: "neondb",
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

  // Carrega os presets salvos no localStorage ao iniciar
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

  const handleConnect = async (e) => {
    e.preventDefault();
    setLoading(true);
    setStatus("Tentando conectar...");

    try {
      const response = await invoke("connect_db", { config });
      setStatus(response);
      if (response === "Conectado com sucesso!") {
        onConnectSuccess();
      }
    } catch (error) {
      setStatus(`Erro: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  // Salva o preset atual
  const handleSavePreset = (e) => {
    e.preventDefault();
    if (!presetName.trim()) return;

    const newPreset = {
      id: Date.now(),
      name: presetName,
      config: { ...config },
    };

    const updated = [...presets, newPreset];
    setPresets(updated);
    localStorage.setItem("easypost_presets", JSON.stringify(updated));
    setPresetName("");
    setStatus(`Preset "${newPreset.name}" salvo!`);
  };

  // Carrega as configurações de um preset selecionado
  const handleSelectPreset = (preset) => {
    setConfig({ ...preset.config });
    setStatus(`Preset "${preset.name}" carregado.`);
  };

  // Deleta um preset
  const handleDeletePreset = (id, e) => {
    e.stopPropagation(); // Evita carregar o preset ao clicar em deletar
    const updated = presets.filter((p) => p.id !== id);
    setPresets(updated);
    localStorage.setItem("easypost_presets", JSON.stringify(updated));
  };

  return (
    <div className="login-container">
      <h1>EasyPost</h1>
      <p>Conecte-se ao seu banco PostgreSQL</p>

      {/* Painel de Presets Salvose */}
      {presets.length > 0 && (
        <div className="presets-section">
          <label className="preset-label">Presets Salvos</label>
          <div className="presets-list">
            {presets.map((p) => (
              <div
                key={p.id}
                className="preset-badge"
                onClick={() => handleSelectPreset(p)}
              >
                <span>{p.name}</span>
                <button
                  type="button"
                  onClick={(e) => handleDeletePreset(p.id, e)}
                  className="btn-delete-preset"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
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

        {/* Campo para salvar o preset atual */}
        <div className="save-preset-container">
          <input
            type="text"
            placeholder="Nome do preset (ex: Produção)..."
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            className="preset-name-input"
          />
          <button
            type="button"
            onClick={handleSavePreset}
            disabled={!presetName.trim()}
            className="btn-save-preset"
            title="Salvar campos atuais como Preset"
          >
            <Save size={14} /> Salvar
          </button>
        </div>

        <button type="submit" disabled={loading} className="btn-connect-main">
          {loading ? "Conectando..." : "Conectar"}
        </button>
      </form>

      {status && <div className="status-message">{status}</div>}
    </div>
  );
}

export default ConnectScreen;
