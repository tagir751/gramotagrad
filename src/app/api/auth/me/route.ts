import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { handleApiError } from '@/lib/api'

export async function GET() {
  try {
    const s = await requireSession()
    return NextResponse.json(s)
  } catch (e) {
    return handleApiError(e)
  }
}
