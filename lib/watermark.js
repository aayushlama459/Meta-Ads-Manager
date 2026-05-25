// Burn a text watermark into a video buffer using ffmpeg.
//
// VPS is a Hostinger KVM1 (4GB RAM, 1 CPU core, Ubuntu 24.04). To keep memory
// pressure low on the single core we stream the input/output through temp
// files on disk instead of piping buffers around in memory.
//
// The watermark drifts on a sine wave inside the center 60% of the frame so
// it survives Reels/Stories edge-cropping but can't be easily cropped out.

import { spawn } from 'node:child_process'
import { promises as fs, existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import ffmpegStatic from 'ffmpeg-static'

// `drawtext` requires the binary to be linked against libfreetype, which is
// not guaranteed across builds. ffmpeg-static's Linux build skips it; some
// Homebrew builds skip it too. Probe each candidate once and cache the
// winner. Order is irrelevant — we pick the first one that has the filter.
const FFMPEG_CANDIDATES = [
  ffmpegStatic,
  '/usr/bin/ffmpeg',
  '/usr/local/bin/ffmpeg',
  '/opt/homebrew/bin/ffmpeg',
].filter(Boolean)

let resolvedFfmpegPath = null
let resolveFfmpegPromise = null

function probeFilters(bin) {
  return new Promise((resolve) => {
    const proc = spawn(bin, ['-hide_banner', '-filters'], { stdio: ['ignore', 'pipe', 'ignore'] })
    let out = ''
    proc.stdout.on('data', d => { out += d.toString() })
    proc.on('close', () => resolve(/\bdrawtext\b/.test(out)))
    proc.on('error', () => resolve(false))
  })
}

async function pickFfmpeg() {
  if (resolvedFfmpegPath) return resolvedFfmpegPath
  if (!resolveFfmpegPromise) {
    resolveFfmpegPromise = (async () => {
      for (const bin of FFMPEG_CANDIDATES) {
        if (!existsSync(bin)) continue
        if (await probeFilters(bin)) {
          resolvedFfmpegPath = bin
          return bin
        }
      }
      throw new Error(
        'No ffmpeg binary with the drawtext filter is available. ' +
        'Install one with freetype support (Linux: `apt install ffmpeg`, macOS: `brew install ffmpeg`).'
      )
    })()
  }
  return resolveFfmpegPromise
}

// drawtext's `text=` arg uses `:` as a key separator and `'` as a string
// delimiter, so any of these chars in the user's watermark would corrupt the
// filter. We write the text to a sidecar file and use `textfile=` instead,
// which sidesteps all escaping rules.
async function writeTextFile(dir, text) {
  const p = path.join(dir, 'watermark.txt')
  await fs.writeFile(p, text, 'utf8')
  return p
}

/**
 * Apply an animated text watermark to a video buffer.
 *
 * @param {Buffer} inputBuffer - The original video bytes.
 * @param {string} text        - Watermark text (phone number, brand, etc.).
 * @param {object} [opts]
 * @param {number} [opts.opacity=0.3]  - 0..1
 * @returns {Promise<Buffer>}  - New video bytes with watermark burned in.
 */
export async function applyTextWatermark(inputBuffer, text, opts = {}) {
  const opacity = Math.max(0, Math.min(1, opts.opacity ?? 0.3))
  const trimmed = (text || '').trim()
  if (!trimmed) throw new Error('Watermark text is empty')
  const ffmpegPath = await pickFfmpeg()

  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'wm-'))
  const inPath = path.join(tmpRoot, `in-${crypto.randomBytes(4).toString('hex')}.mp4`)
  const outPath = path.join(tmpRoot, `out-${crypto.randomBytes(4).toString('hex')}.mp4`)

  try {
    await fs.writeFile(inPath, inputBuffer)
    const textPath = await writeTextFile(tmpRoot, trimmed)

    // Sine-wave drift inside the central 60% of the frame.
    // x:  center ± 30% of width, period 8s
    // y:  center ± 30% of height, period 11s (coprime → non-repeating motion)
    // fontsize: ~3% of frame height (min 18px so it stays readable on small videos)
    const filter = [
      `drawtext=textfile='${textPath}'`,
      `fontcolor=white@${opacity.toFixed(2)}`,
      `fontsize='max(18,h/33)'`,
      `shadowcolor=black@${(opacity * 0.6).toFixed(2)}`,
      `shadowx=2`,
      `shadowy=2`,
      `x='(w-text_w)/2 + (w*0.3)*sin(2*PI*t/8)'`,
      `y='(h-text_h)/2 + (h*0.3)*sin(2*PI*t/11)'`,
    ].join(':')

    const args = [
      '-y',
      '-i', inPath,
      '-vf', filter,
      '-c:v', 'libx264',
      '-preset', 'veryfast',  // single-core VPS — favor speed over file size
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'copy',
      '-movflags', '+faststart',
      outPath,
    ]

    await runFfmpeg(ffmpegPath, args)

    const outBuffer = await fs.readFile(outPath)
    return outBuffer
  } finally {
    // Always clean up — even on failure — so temp space doesn't leak.
    await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {})
  }
}

function runFfmpeg(bin, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    proc.stderr.on('data', (d) => { stderr += d.toString() })
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code === 0) return resolve()
      // ffmpeg's stderr is verbose — take the last few lines for the user-facing error
      const tail = stderr.split('\n').filter(Boolean).slice(-4).join(' | ')
      reject(new Error(`ffmpeg (${bin}) exited ${code}: ${tail || 'no stderr'}`))
    })
  })
}
