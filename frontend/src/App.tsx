import { useState } from "react";
import "./App.css";

export function App() {
  const [count, setCount] = useState(0);

  return (
    <div style={{ padding: "2rem", textAlign: "center", fontFamily: "sans-serif" }}>
      <h1>SIGA Universitário - Angola</h1>
      <p>Ambiente básico React + Vite configurado com sucesso.</p>
      <div style={{ marginTop: "1.5rem" }}>
        <button
          onClick={() => setCount((prev) => prev + 1)}
          style={{
            padding: "0.5rem 1rem",
            fontSize: "1rem",
            cursor: "pointer",
            borderRadius: "4px",
            border: "1px solid #ccc",
          }}
        >
          Contador: {count}
        </button>
      </div>
    </div>
  );
}

export default App;

