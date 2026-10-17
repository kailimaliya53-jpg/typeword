#!/usr/bin/env node
/**
 * 从 TypeWords 官方数据源同步词库 / 文章到本地 public/ 目录。
 *
 * 为什么要这个脚本：
 *   上游仓库只内置了 1 个词库(CET-4) 和 1 套文章(新概念1) 作为示例，
 *   完整词库（194 个）都在官方 CDN 上。跑一遍这个脚本，本地站点就有完整内容，
 *   之后不再依赖官方服务器。
 *
 * 用法：
 *   node scripts/mirror-official-dicts.mjs                  # 同步默认精选词库（约 45MB）
 *   node scripts/mirror-official-dicts.mjs --all            # 同步全部词库（约 400MB）
 *   node scripts/mirror-official-dicts.mjs --names="CET-4,CET-6,IELTS"
 *   node scripts/mirror-official-dicts.mjs --with-audio     # 额外下载文章音频（约 360MB，慎用）
 *
 * 环境变量：
 *   DICT_SOURCE  数据源地址，默认 https://files.typewords.cc
 */
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const SOURCE = (process.env.DICT_SOURCE || 'https://files.typewords.cc').replace(/\/+$/, '')
const ROOT = path.resolve(import.meta.dirname, '..')
const PUBLIC_DIR = path.join(ROOT, 'public')

// 默认同步的词库（按重要性排序）。想加词库就把名字加进来，或直接用 --all。
const DEFAULT_WORDS = [
  'CET-4',
  'CET-6',
  '考研',
  '专四',
  '高考 3500 词',
  'IELTS',
  'TOEFL',
  'GRE3000',
  '牛津3000词',
  '商务英语',
  '计算机专用英语',
  '程序员常用词',
]

// 默认同步的文章（新概念英语 1-4）
const DEFAULT_ARTICLES = ['新概念英语1', '新概念英语2', '新概念英语3', '新概念英语4']

const argv = process.argv.slice(2)
const ALL = argv.includes('--all')
const WITH_AUDIO = argv.includes('--with-audio')
const namesArg = argv.find(a => a.startsWith('--names='))
const NAMES = namesArg
  ? namesArg
      .slice('--names='.length)
      .replace(/^["']|["']$/g, '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
  : null

async function curl(url, extraArgs = []) {
  // 用 curl 而不是 fetch：兼容本地代理和自签名证书环境
  const { stdout } = await execFileAsync(
    'curl',
    ['-sk', '--fail', '--max-time', '120', ...extraArgs, url],
    { maxBuffer: 1024 * 1024 * 512 }
  )
  return stdout
}

async function fetchJson(url) {
  return JSON.parse(await curl(url))
}

async function download(url, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  await execFileAsync('curl', ['-sk', '--fail', '--max-time', '300', '-o', dest, url])
}

// 限制并发，避免把对方 CDN 打爆
async function mapLimit(items, limit, fn) {
  const results = []
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await fn(items[index], index)
    }
  })
  await Promise.all(workers)
  return results
}

function toLocalEntry(item, type) {
  return {
    ...item,
    enName: item.enName || item.id,
    type,
    version: item.version || 1,
  }
}

function orderByPreference(list, preferred) {
  const rank = new Map(preferred.map((name, index) => [name, index]))
  return [...list].sort((a, b) => {
    const ra = rank.has(a.name) ? rank.get(a.name) : Number.MAX_SAFE_INTEGER
    const rb = rank.has(b.name) ? rank.get(b.name) : Number.MAX_SAFE_INTEGER
    return ra - rb
  })
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n')
  const size = (fs.statSync(file).size / 1024).toFixed(1)
  console.log(`📝 写入 ${path.relative(ROOT, file)} (${size} KB)`)
}

async function main() {
  console.log(`📡 数据源: ${SOURCE}`)
  const [wordList, articleList] = await Promise.all([
    fetchJson(`${SOURCE}/list/word.json`),
    fetchJson(`${SOURCE}/list/article.json`),
  ])
  console.log(`📚 官方共有 ${wordList.length} 个词库 / ${articleList.length} 套文章`)

  let words
  if (ALL) {
    words = wordList
  } else {
    const wanted = NAMES || DEFAULT_WORDS
    words = wanted.map(name => {
      const found = wordList.find(x => x.name === name)
      if (!found) console.warn(`⚠️  未找到词库: ${name}`)
      return found
    }).filter(Boolean)
  }
  const articles = articleList.filter(x => DEFAULT_ARTICLES.includes(x.name) || NAMES?.includes(x.name))

  if (!words.length) {
    console.error('❌ 没有要同步的词库')
    process.exit(1)
  }

  let failed = 0
  const downloadDict = async (item, type) => {
    const dir = type === 'article' ? 'article' : 'word'
    const url = `${SOURCE}/dicts/${item.language}/${dir}/${item.url}`
    const dest = path.join(PUBLIC_DIR, 'dicts', item.language, dir, item.url)
    try {
      await download(url, dest)
      const size = fs.statSync(dest).size
      console.log(`  ✅ ${item.name} (${(size / 1048576).toFixed(2)} MB)`)
    } catch (e) {
      console.error(`  ❌ ${item.name} 下载失败: ${e.message}`)
      failed++
    }
  }

  console.log(`\n⬇️  同步 ${words.length} 个词库...`)
  await mapLimit(words, 6, item => downloadDict(item, 'word'))

  console.log(`\n⬇️  同步 ${articles.length} 套文章...`)
  await mapLimit(articles, 4, item => downloadDict(item, 'article'))

  if (WITH_AUDIO) {
    console.log('\n⬇️  同步文章音频（体积很大，请耐心等待）...')
    for (const item of articles) {
      const dir = path.join(PUBLIC_DIR, 'dicts', item.language, 'article')
      const data = JSON.parse(fs.readFileSync(path.join(dir, item.url), 'utf8'))
      const audioFiles = data.map(x => x.audioSrc).filter(Boolean)
      console.log(`  🎧 ${item.name}: ${audioFiles.length} 个音频`)
      await mapLimit(audioFiles, 4, async src => {
        const url = SOURCE + src.split('/').map(encodeURIComponent).join('/')
        const dest = path.join(PUBLIC_DIR, src)
        try {
          await download(url, dest)
        } catch (e) {
          console.error(`     ❌ ${src}: ${e.message}`)
          failed++
        }
      })
    }
  }

  const wordEntries = orderByPreference(words, NAMES || DEFAULT_WORDS).map(x =>
    toLocalEntry(x, 'word')
  )
  const articleEntries = orderByPreference(articles, DEFAULT_ARTICLES).map(x =>
    toLocalEntry(x, 'article')
  )

  writeJson(path.join(PUBLIC_DIR, 'list', 'word.json'), wordEntries)
  writeJson(path.join(PUBLIC_DIR, 'list', 'article.json'), articleEntries)
  // 首页“推荐”列表：直接用同步下来的这些
  writeJson(path.join(PUBLIC_DIR, 'list', 'recommend_word.json'), wordEntries)
  writeJson(path.join(PUBLIC_DIR, 'list', 'recommend_article.json'), articleEntries)

  console.log(`\n🎉 完成：${wordEntries.length} 个词库 + ${articleEntries.length} 套文章${failed ? `，失败 ${failed} 个` : ''}`)
  if (!WITH_AUDIO && articles.length) {
    console.log('ℹ️  未下载文章音频（体积约 360MB）。需要音频请加 --with-audio，或忽略此项（文字练习不受影响）。')
  }
}

main().catch(err => {
  console.error('❌ 同步失败:', err)
  process.exit(1)
})
