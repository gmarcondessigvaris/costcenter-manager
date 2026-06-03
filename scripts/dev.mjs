import { spawn } from 'child_process'
import { existsSync, copyFileSync } from 'fs'

// Auto-copy .env.example → .env if .env is missing
for (const dir of ['backend-node', 'frontend']) {
  if (!existsSync(`${dir}/.env`) && existsSync(`${dir}/.env.example`)) {
    copyFileSync(`${dir}/.env.example`, `${dir}/.env`)
    console.log(`Copied ${dir}/.env.example → ${dir}/.env`)
  }
}

function run(cmd, args, cwd, label) {
  const p = spawn(cmd, args, { cwd, shell: true })
  p.stdout.on('data', d => process.stdout.write(`[${label}] ${d}`))
  p.stderr.on('data', d => process.stderr.write(`[${label}] ${d}`))
  p.on('exit', code => console.log(`[${label}] exited with code ${code}`))
  return p
}

// Install deps if node_modules missing
if (!existsSync('backend-node/node_modules')) {
  console.log('[setup] Installing backend dependencies...')
  const i = spawn('npm', ['install', '--ignore-scripts'], { cwd: 'backend-node', shell: true, stdio: 'inherit' })
  await new Promise(r => i.on('exit', r))
}
if (!existsSync('frontend/node_modules')) {
  console.log('[setup] Installing frontend dependencies...')
  const i = spawn('npm', ['install', '--ignore-scripts'], { cwd: 'frontend', shell: true, stdio: 'inherit' })
  await new Promise(r => i.on('exit', r))
}

run('node', ['--experimental-strip-types', '--watch', 'src/index.ts'], 'backend-node', 'api')
run('npm', ['run', 'dev'], 'frontend', 'ui')
