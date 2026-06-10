import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "../App.css";

function ConnectScreen({ onConnectSuccess }) {
  const [config, setConfig] = useState({
    host: "ep-soft-firefly-aca18i1s-pooler.sa-east-1.aws.neon.tech",
    port: "5432",
    user: "neondb_owner",
    password: "npg_BbOf2LH5GYZC",
    database: "neondb",
    // host: "localhost",
    // port: "5432",
    // user: "postgres",
    // password: "",
    // database: "",
  });

  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="login-container">
      <h1>EasyPost</h1>
      <p>Conecte-se ao seu banco PostgreSQL</p>

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

        <button type="submit" disabled={loading}>
          {loading ? "Conectando..." : "Conectar"}
        </button>
      </form>

      {status && <div className="status-message">{status}</div>}
    </div>
  );
}

export default ConnectScreen;
