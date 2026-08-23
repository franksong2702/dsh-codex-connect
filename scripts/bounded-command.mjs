import { spawn, spawnSync } from 'node:child_process'

const DEFAULT_MAX_BUFFER = 16 * 1024 * 1024

function cleanupFailure(value) {
  return value instanceof Error ? value : new Error(String(value))
}

const WINDOWS_META_CHARACTER = /([()\][%!^"`<>&|;, *?])/gu

function escapeWindowsCommand(value) {
  return value.replace(WINDOWS_META_CHARACTER, '^$1')
}

function escapeWindowsArgument(value, doubleEscapeMetaCharacters) {
  let escaped = String(value)
    .replace(/(?=(\\+?)?)\1"/gu, '$1$1\\"')
    .replace(/(?=(\\+?)?)\1$/gu, '$1$1')
  escaped = `"${escaped}"`.replace(WINDOWS_META_CHARACTER, '^$1')
  return doubleEscapeMetaCharacters
    ? escaped.replace(WINDOWS_META_CHARACTER, '^$1')
    : escaped
}

export function resolveCommandInvocation(command, args, platform = process.platform) {
  if (platform === 'win32' && /\.(?:bat|cmd)$/iu.test(command)) {
    const doubleEscapeMetaCharacters = /[\\/]node_modules[\\/]\.bin[\\/][^\\/]+\.cmd$/iu.test(command)
    const shellCommand = [
      escapeWindowsCommand(command),
      ...args.map(argument => escapeWindowsArgument(argument, doubleEscapeMetaCharacters)),
    ].join(' ')
    return {
      command: process.env.ComSpec ?? process.env.COMSPEC ?? process.env.comspec ?? 'cmd.exe',
      args: ['/d', '/s', '/c', `"${shellCommand}"`],
      windowsVerbatimArguments: true,
    }
  }
  return { command, args, windowsVerbatimArguments: false }
}

function terminateProcessTree(child) {
  if (!Number.isInteger(child.pid) || child.pid <= 0) return undefined
  if (process.platform === 'win32') {
    if (child.exitCode !== null || child.signalCode !== null) return undefined
    const cleanup = spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
      encoding: 'utf8',
      timeout: 10_000,
      windowsHide: true,
    })
    if (cleanup.error !== undefined) return cleanup.error
    if (cleanup.status !== 0) {
      return new Error((cleanup.stderr || cleanup.stdout || `taskkill exited ${String(cleanup.status)}`).trim())
    }
    return undefined
  }
  try {
    process.kill(-child.pid, 'SIGKILL')
    return undefined
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ESRCH') return undefined
    return cleanupFailure(error)
  }
}

/**
 * Run a command with bounded output and terminate its process tree on timeout.
 *
 * @param {string} command executable path or name
 * @param {string[]} args command arguments
 * @param {{ cwd?: string, env?: NodeJS.ProcessEnv, timeoutMs?: number, maxBuffer?: number }} [options] process options
 * @returns {Promise<{ status: number | null, signal: NodeJS.Signals | null, stdout: string, stderr: string, error?: Error, cleanupError?: Error }>} captured result
 */
export function runBoundedCommand(command, args, options = {}) {
  return new Promise(resolve => {
    const maxBuffer = options.maxBuffer ?? DEFAULT_MAX_BUFFER
    const invocation = resolveCommandInvocation(command, args)
    const child = spawn(invocation.command, invocation.args, {
      cwd: options.cwd,
      env: options.env,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsVerbatimArguments: invocation.windowsVerbatimArguments,
      windowsHide: true,
    })
    const stdout = []
    const stderr = []
    let outputBytes = 0
    let commandError
    let cleanupError
    let settled = false

    const stopTree = error => {
      if (commandError !== undefined) return
      commandError = error
      cleanupError = terminateProcessTree(child)
    }
    const capture = target => chunk => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      const remaining = maxBuffer - outputBytes
      if (remaining <= 0) {
        const error = new Error(`command output exceeded ${String(maxBuffer)} bytes`)
        Object.assign(error, { code: 'ENOBUFS' })
        stopTree(error)
        return
      }
      target.push(buffer.subarray(0, remaining))
      outputBytes += Math.min(buffer.length, remaining)
      if (buffer.length > remaining) {
        const error = new Error(`command output exceeded ${String(maxBuffer)} bytes`)
        Object.assign(error, { code: 'ENOBUFS' })
        stopTree(error)
      }
    }
    child.stdout.on('data', capture(stdout))
    child.stderr.on('data', capture(stderr))
    child.on('error', error => {
      commandError = error
    })

    const timeout = options.timeoutMs === undefined
      ? undefined
      : setTimeout(() => {
          const error = new Error(`command timed out after ${String(options.timeoutMs)}ms`)
          Object.assign(error, { code: 'ETIMEDOUT' })
          stopTree(error)
        }, options.timeoutMs)

    child.on('close', (status, signal) => {
      if (settled) return
      settled = true
      if (timeout !== undefined) clearTimeout(timeout)
      resolve({
        status,
        signal,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
        ...(commandError === undefined ? {} : { error: commandError }),
        ...(cleanupError === undefined ? {} : { cleanupError }),
      })
    })
  })
}
