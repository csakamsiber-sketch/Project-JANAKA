const { execSync } = require('node:child_process');

const ports = process.argv.slice(2).filter(Boolean).map((value) => Number(value)).filter((value) => Number.isInteger(value));

if (ports.length === 0) {
  process.exit(0);
}

function run(command) {
  try {
    return execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    return '';
  }
}

function getListeningPorts() {
  const lines = run('netstat -ano -p tcp');
  if (!lines) return new Map();

  const occupied = new Map();
  for (const line of lines.split(/\r?\n/)) {
    const match = line.match(/\s((?:\[[^\]]+\]|\d+\.\d+\.\d+\.\d+|\*|0\.0\.0\.0|::|\[::\])):(\d+)\s+\S+\s+LISTENING\s+(\d+)/i);
    if (!match) continue;

    const port = Number(match[2]);
    const pid = Number(match[3]);
    if (!ports.includes(port) || !Number.isInteger(pid)) continue;
    occupied.set(port, pid);
  }

  return occupied;
}

let attempts = 0;
while (attempts < 12) {
  const occupied = getListeningPorts();

  if (occupied.size === 0) {
    console.log(`Ports ${ports.join(', ')} are ready.`);
    process.exit(0);
  }

  for (const [port, pid] of occupied.entries()) {
    run(`taskkill /PID ${pid} /F`);
    console.log(`Released stale port ${port} from PID ${pid}.`);
  }

  attempts += 1;
  if (attempts < 12) {
    const waitMs = 500;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, waitMs);
  }
}

console.error(`Ports ${ports.join(', ')} are still in use. Please stop the process manually.`);
process.exit(1);
