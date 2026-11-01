const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function getDockerCommand() {
  // 1. Verificar se docker responde diretamente
  const check = spawnSync("docker", ["--version"], { shell: true });
  if (check.status === 0) {
    return { cmd: "docker", binDir: null };
  }

  // 2. Procurar em caminhos conhecidos do Docker Desktop no Windows
  const candidates = [
    path.join(
      process.env.LOCALAPPDATA || "",
      "Programs",
      "DockerDesktop",
      "resources",
      "bin",
      "docker.exe",
    ),
    "C:\\Users\\Home\\AppData\\Local\\Programs\\DockerDesktop\\resources\\bin\\docker.exe",
    "C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe",
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return { cmd: candidate, binDir: path.dirname(candidate) };
    }
  }

  return { cmd: "docker", binDir: null };
}

const { cmd, binDir } = getDockerCommand();

const env = { ...process.env };
if (binDir) {
  env.PATH = `${binDir};${env.PATH || ""}`;
}

const args = process.argv.slice(2);
const composeFile = path.resolve(
  __dirname,
  "..",
  "infra",
  "docker-compose.yml",
);
const fullArgs = ["compose", "-f", composeFile, ...args];

console.log(`[INFRA] Executando: ${cmd} ${fullArgs.join(" ")}`);
const result = spawnSync(cmd, fullArgs, {
  stdio: "inherit",
  shell: true,
  env,
});

process.exit(result.status || 0);
