import { promises as fs } from 'fs'
import path from 'path'
import { NextResponse } from 'next/server'

const FICHES_PATH = path.join(process.cwd(), 'src', 'app', 'espace', 'admin', 'fiches-horaires', 'fiches.json')

export async function GET() {
  try {
    const raw = await fs.readFile(FICHES_PATH, 'utf8')
    const data = JSON.parse(raw)
    return NextResponse.json(data)
  } catch (err) {
    if (err.code === 'ENOENT') return NextResponse.json([])
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const body = await request.json()
    const fiches = Array.isArray(body.fiches) ? body.fiches : []
    await fs.mkdir(path.dirname(FICHES_PATH), { recursive: true })
    await fs.writeFile(FICHES_PATH, JSON.stringify(fiches, null, 2), 'utf8')
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

