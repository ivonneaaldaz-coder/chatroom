import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const THROTTLE_MINUTES = 45
const OFFLINE_AFTER_MS = 2 * 60 * 1000

function validUsername(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9_-]{2,30}$/.test(value)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const from = String(body?.from || '').toLowerCase()
    const to = String(body?.to || '').toLowerCase()

    if (!validUsername(from) || !validUsername(to) || from === to) {
      return NextResponse.json({ ok: false }, { status: 400 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const resendKey = process.env.RESEND_API_KEY
    const fromAddress = process.env.DM_NOTIFY_FROM
    const chatUrl = process.env.CHATROOM_PUBLIC_URL || 'https://chat.ivonnealdaz.com'

    if (!supabaseUrl || !serviceKey || !resendKey || !fromAddress) {
      return NextResponse.json({ ok: true, skipped: 'email_not_configured' }, { status: 202 })
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    })

    // Only notify when there is a real unread DM from this sender in the last 5 minutes.
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const { data: unread } = await supabase
      .from('dm_messages')
      .select('id')
      .eq('from_username', from)
      .eq('to_username', to)
      .eq('deleted', false)
      .is('read_at', null)
      .gte('created_at', fiveMinutesAgo)
      .limit(1)

    if (!unread?.length) {
      return NextResponse.json({ ok: true, skipped: 'no_unread_dm' })
    }

    const { data: recipient } = await supabase
      .from('users')
      .select('notification_email, dm_email_notifications_enabled, last_seen_at')
      .eq('username', to)
      .maybeSingle()

    if (!recipient?.dm_email_notifications_enabled || !recipient.notification_email) {
      return NextResponse.json({ ok: true, skipped: 'recipient_opted_out' })
    }

    const lastSeen = recipient.last_seen_at ? new Date(recipient.last_seen_at).getTime() : 0
    if (lastSeen && Date.now() - lastSeen < OFFLINE_AFTER_MS) {
      return NextResponse.json({ ok: true, skipped: 'recipient_online' })
    }

    const { data: state } = await supabase
      .from('dm_email_notification_state')
      .select('last_sent_at')
      .eq('username', to)
      .maybeSingle()

    if (state?.last_sent_at) {
      const lastSent = new Date(state.last_sent_at).getTime()
      if (Date.now() - lastSent < THROTTLE_MINUTES * 60 * 1000) {
        return NextResponse.json({ ok: true, skipped: 'throttled' })
      }
    }

    const subject = `you have a DM waiting in CHATROOM.exe`
    const html = `
      <div style="font-family:Courier New,monospace;color:#111;max-width:560px">
        <h2 style="font-size:18px">CHATROOM.exe</h2>
        <p><strong>${from}</strong> sent you a private message while you were away.</p>
        <p>Your message is waiting in the chatroom.</p>
        <p style="margin:24px 0">
          <a href="${chatUrl}" style="background:#000080;color:#fff;padding:10px 14px;text-decoration:none">
            open CHATROOM.exe →
          </a>
        </p>
        <p style="font-size:12px;color:#666">
          You received this because offline DM emails are enabled for ${to}.
        </p>
      </div>
    `

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [recipient.notification_email],
        subject,
        html,
      }),
    })

    if (!emailRes.ok) {
      const detail = await emailRes.text()
      console.error('dm email failed', detail)
      return NextResponse.json({ ok: false }, { status: 502 })
    }

    await supabase
      .from('dm_email_notification_state')
      .upsert({ username: to, last_sent_at: new Date().toISOString() })

    return NextResponse.json({ ok: true, sent: true })
  } catch (error) {
    console.error('dm notification error', error)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
