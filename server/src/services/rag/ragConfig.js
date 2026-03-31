import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// 持久化目录：server/.rag/
export const RAG_DIR = process.env.RAG_DIR || join(__dirname, '../../../.rag')

export const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'openai/text-embedding-3-small'
export const OPENAI_EMBEDDING_BATCH_SIZE = Number(process.env.OPENAI_EMBEDDING_BATCH_SIZE || 64)
export const EMBEDDING_BASE_URL = process.env.EMBEDDING_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
export const EMBEDDING_API_KEY = process.env.EMBEDDING_API_KEY || process.env.OPENAI_API_KEY || ''

// Chunking（中文 OCR 文本偏好字符切分）
export const CHUNK_SIZE_CHARS = Number(process.env.RAG_CHUNK_SIZE_CHARS || 500)
export const CHUNK_OVERLAP_CHARS = Number(process.env.RAG_CHUNK_OVERLAP_CHARS || 80)
export const MAX_CHUNKS_PER_EVIDENCE = Number(process.env.RAG_MAX_CHUNKS_PER_EVIDENCE || 60)

// 检索结果注入 LLM 的预算
export const RETRIEVE_TOP_K = Number(process.env.RAG_RETRIEVE_TOP_K || 12)
export const RETRIEVE_MAX_CHARS_FOR_PROMPT = Number(process.env.RAG_RETRIEVE_MAX_CHARS_FOR_PROMPT || 3500)

