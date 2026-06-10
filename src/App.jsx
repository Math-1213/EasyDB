import { useState } from "react";
import "./App.css";
import ConnectScreen from "./Screens/Connect";
import DashboardScreen from "./Screens/Dashboard";

function App() {
  const [isConnected, setIsConnected] = useState(false);

  if (isConnected) {
    return <DashboardScreen onDisconnect={() => setIsConnected(false)} />;
  }

  return <ConnectScreen onConnectSuccess={() => setIsConnected(true)} />;
}

export default App;
