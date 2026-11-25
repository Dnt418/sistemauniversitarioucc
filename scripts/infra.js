const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function getComposeCommand() {
  const composeCandidates = [
    path.join(
      process.env.LOCALAPPDATA || "",
      "Programs",
      "DockerDesktop",
      "resources",
      "bin",
      "docker-compose.exe",
    ),
    "C:\\Users\\Home\\AppData\\Local\\Programs\\DockerDesktop\\resources\\bin\\docker-compose.exe",
    "C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker-compose.exe",
  ];

  for (const candidate of composeCandidates) {
    if (fs.existsSync(candidate)) {
      return {
        cmd: candidate,
        isComposeStandalone: true,
        binDir: path.dirname(candidate),
      };
    }
  }

  const checkCompose = spawnSync("docker-compose", ["--version"], {
    shell: true,
  });
  if (checkCompose.status === 0) {
    return { cmd: "docker-compose", isComposeStandalone: true, binDir: null };
  }

  const dockerCandidates = [
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

  for (const candidate of dockerCandidates) {
    if (fs.existsSync(candidate)) {
      return {
        cmd: candidate,
        isComposeStandalone: false,
        binDir: path.dirname(candidate),
      };
    }
  }

  return { cmd: "docker", isComposeStandalone: false, binDir: null };
}

const { cmd, isComposeStandalone, binDir } = getComposeCommand();

const env = { ...process.env };
if (binDir) {
  env.PATH = `${binDir};${env.PATH || ""}`;
}

const userArgs = process.argv.slice(2);
const composeFile = path.resolve(
  __dirname,
  "..",
  "infra",
  "docker-compose.yml",
);

let fullArgs = [];
if (isComposeStandalone) {
  fullArgs = ["-f", composeFile, ...userArgs];
} else {
  fullArgs = ["compose", "-f", composeFile, ...userArgs];
}

console.log(`[INFRA] Executando: "${cmd}" ${fullArgs.join(" ")}`);
const result = spawnSync(cmd, fullArgs, {
  stdio: "inherit",
  shell: true,
  env,
});

process.exit(result.status || 0);
