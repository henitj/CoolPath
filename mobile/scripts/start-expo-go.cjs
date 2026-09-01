#!/usr/bin/env node
/*
 * Start the SDK-54 project in the stock Expo Go client without making a
 * startup-time request to Expo's version API. The lockfile and `expo-doctor`
 * remain the source of truth for dependency validation; this only makes the
 * QR workflow resilient on restricted corporate/sandbox networks.
 */
const { spawn } = require('node:child_process')

process.env.EXPO_NO_DEPENDENCY_VALIDATION = '1'
const requested = process.argv.slice(2)
// `--go` is meaningful only for native targets; omit it for Expo's browser
// development command while retaining the same resilient startup behavior.
const args = ['expo', 'start', ...(requested.includes('--web') ? [] : ['--go']), ...requested]
const command = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const child = spawn(command, args, { stdio: 'inherit', env: process.env })

child.on('error', (error) => {
  console.error(`Unable to start Expo Go: ${error.message}`)
  process.exitCode = 1
})
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exitCode = code ?? 1
})
