# Hive Detail Spec — Extension: On-Demand PDF Generation

## Scope

Extend the hive detail page (`/hive/[hiveId]`) with a "Pobierz PDF"
button that generates a PDF of the last inspection on-demand via the
WeasyPrint microservice on Render. The PDF is streamed back to the
browser as a file download. Nothing is stored on R2 — generation is
stateless. Rate limiting is applied per userId.

This spec extends `hive-detail-spec.md` — all layout, chart and print
decisions from that spec remain unchanged.

---

## User flow

```
Hive detail page
  └── "Pobierz PDF" button click
        └── POST /api/inspections/[inspectionId]/pdf  (Next.js route handler)
              ├── auth check
              ├── ownership check
              ├── rate limit check (Upstash)
              ├── quota check (UsagePeriod)
              └── POST to Render microservice
                    └── stream PDF bytes back to browser
                          └── browser triggers file download
                                └── increment UsagePeriod.pdfGenerationsUsed
```

---

## Button placement

Two buttons side by side in the topbar, right-aligned:

```tsx
<div className="topbar-actions">
  <PrintButton />       {/* existing — window.print() */}
  <PdfButton
    inspectionId={hive.currentInspection?.id ?? null}
    disabled={!hive.currentInspection}
  />
</div>
```

When `currentInspection` is null (no inspections yet), the PDF button
is rendered as disabled with tooltip "Brak przeglądów do pobrania".

---

## PDF button component (`components/hive/PdfButton.tsx`)

Client component. Handles loading state, error display, and file download
trigger. Uses `fetch` directly — not a server action — because the
response is a binary file stream, not JSON.

```tsx
'use client'

import { useState } from 'react'
import { DownloadIcon, LoaderIcon } from '@/components/icons'

interface PdfButtonProps {
  inspectionId: string | null
  disabled?: boolean
}

export function PdfButton({ inspectionId, disabled }: PdfButtonProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  async function handleDownload() {
    if (!inspectionId || loading) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/inspections/${inspectionId}/pdf`, {
        method: 'POST',
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))

        // quota exceeded — show upgrade prompt
        if (res.status === 429) {
          setError(body.error ?? 'Przekroczono limit PDF. Spróbuj później.')
          return
        }

        setError(body.error ?? 'Nie udało się wygenerować PDF.')
        return
      }

      // stream bytes → blob → download
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')

      a.href     = url
      a.download = `hivewise-inspekcja-${inspectionId.slice(0, 8)}.pdf`
      a.click()

      URL.revokeObjectURL(url)
    } catch {
      setError('Błąd połączenia. Sprawdź internet i spróbuj ponownie.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="pdf-btn-wrapper">
      <button
        onClick={handleDownload}
        disabled={disabled || loading}
        className="btn"
        title={disabled ? 'Brak przeglądów do pobrania' : 'Pobierz PDF ostatniego przeglądu'}
      >
        {loading
          ? <><LoaderIcon className="spin" /> Generowanie...</>
          : <><DownloadIcon /> Pobierz PDF</>
        }
      </button>
      {error && (
        <p className="pdf-error">{error}</p>
      )}
    </div>
  )
}
```

---

## API route handler (`app/api/inspections/[inspectionId]/pdf/route.ts`)

Route handler (not server action) because the response is a binary
stream — server actions can only return serializable data.

```ts
import { NextRequest, NextResponse } from 'next/server'
import { auth }    from '@/lib/auth'
import { prisma }  from '@/lib/prisma'
import { pdfLimiter } from '@/lib/ratelimit'
import { getIp }   from '@/lib/ratelimit-helpers'

export async function POST(
  req: NextRequest,
  { params }: { params: { inspectionId: string } }
) {
  // ── auth ──────────────────────────────────────────────────────────────────
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Musisz być zalogowany.' }, { status: 401 })
  }

  // ── rate limit (Redis — fast, before any DB call) ─────────────────────────
  const { success, reset } = await pdfLimiter.limit(session.user.id)
  if (!success) {
    const retryAfter = Math.ceil((reset - Date.now()) / 1000)
    return NextResponse.json(
      { error: `Przekroczono limit PDF. Spróbuj za ${retryAfter} sekund.` },
      {
        status: 429,
        headers: { 'Retry-After': String(retryAfter) },
      }
    )
  }

  // ── ownership check ───────────────────────────────────────────────────────
  // Verify the inspection belongs to this user.
  // Never trust inspectionId from the URL alone.
  const inspection = await prisma.inspection.findFirst({
    where: {
      id:     params.inspectionId,
      userId: session.user.id,          // ownership enforced here
    },
    include: {
      hive: {
        include: {
          apiary: {
            select: { name: true, location: true },
          },
        },
      },
    },
  })

  if (!inspection) {
    return NextResponse.json({ error: 'Inspekcja nie istnieje.' }, { status: 404 })
  }

  // ── quota check (Prisma — business logic) ─────────────────────────────────
  const periodStart = new Date(Date.UTC(
    new Date().getFullYear(),
    new Date().getMonth(),
    1
  ))

  const [period, subscription] = await Promise.all([
    prisma.usagePeriod.findUnique({
      where: { userId_periodStart: { userId: session.user.id, periodStart } },
    }),
    prisma.subscription.findUnique({
      where: { userId: session.user.id },
      select: { tier: true },
    }),
  ])

  const pdfLimit = subscription?.tier === 'PREMIUM' ? 100 : 20
  const used     = period?.pdfGenerationsUsed ?? 0

  if (used >= pdfLimit) {
    return NextResponse.json(
      {
        error: subscription?.tier === 'PREMIUM'
          ? 'Osiągnąłeś miesięczny limit 100 PDF.'
          : 'Osiągnąłeś miesięczny limit 20 PDF. Przejdź na Premium po więcej.',
        upgradeRequired: subscription?.tier !== 'PREMIUM',
      },
      { status: 429 }
    )
  }

  // ── call Render microservice ───────────────────────────────────────────────
  const payload = buildPdfPayload(inspection)

  let pdfResponse: Response
  try {
    pdfResponse = await fetch(
      `${process.env.PDF_SERVICE_URL}/generate-pdf`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
        signal:  AbortSignal.timeout(30_000),   // 30s timeout — Render cold starts
      }
    )
  } catch (err) {
    console.error('[pdf] microservice fetch failed:', err)
    return NextResponse.json(
      { error: 'Serwis PDF jest chwilowo niedostępny. Spróbuj za chwilę.' },
      { status: 503 }
    )
  }

  if (!pdfResponse.ok) {
    console.error('[pdf] microservice error:', pdfResponse.status)
    return NextResponse.json(
      { error: 'Nie udało się wygenerować PDF.' },
      { status: 502 }
    )
  }

  // ── increment usage counter ───────────────────────────────────────────────
  // Do this after successful generation so failed requests don't count.
  await prisma.usagePeriod.upsert({
    where:  { userId_periodStart: { userId: session.user.id, periodStart } },
    create: { userId: session.user.id, periodStart, pdfGenerationsUsed: 1 },
    update: { pdfGenerationsUsed: { increment: 1 } },
  })

  // ── stream PDF bytes to browser ───────────────────────────────────────────
  const filename = `hivewise-inspekcja-${params.inspectionId.slice(0, 8)}.pdf`

  return new NextResponse(pdfResponse.body, {
    status:  200,
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control':       'no-store',
    },
  })
}
```

---

## Payload builder (`lib/pdf-payload.ts`)

Assembles the JSON payload the FastAPI microservice expects.
Matches `InspectionPayload` Pydantic model from the microservice spec.

```ts
import { Inspection, Hive, Apiary } from '../generated/prisma'
import {
  QueenData, ColonyData, BroodData,
  CombData, HealthData, ActionsData,
} from '@/types/inspection-draft'

type InspectionWithHive = Inspection & {
  hive: Hive & { apiary: Pick<Apiary, 'name' | 'location'> }
}

export function buildPdfPayload(inspection: InspectionWithHive) {
  return {
    // apiary metadata
    apiary_name:        inspection.hive.apiary.name,
    apiary_location:    inspection.hive.apiary.location ?? '',
    hive_label:         inspection.hive.label,
    hive_type:          inspection.hive.hiveType,
    inspection_date:    inspection.inspectedAt.toISOString().split('T')[0],

    // sections — cast JSON columns to typed shapes
    queen:   inspection.queen   as QueenData,
    colony:  inspection.colony  as ColonyData,
    brood:   inspection.brood   as BroodData,
    comb:    inspection.comb    as CombData,
    health:  inspection.health  as HealthData,
    actions: inspection.actions as ActionsData,
    notes:   inspection.notes,

    // derived scalar fields already computed on submit
    honey_kg: inspection.honeyKg,
  }
}
```

---

## Environment variable

```env
PDF_SERVICE_URL=https://your-service.onrender.com
```

Add to `.env` and to Vercel environment variables.
No trailing slash. The route handler appends `/generate-pdf`.

---

## Render cold start handling

Render free tier spins down after inactivity. First request after
a cold start can take 30–60 seconds. The route handler sets a 30s
`AbortSignal.timeout` — if the microservice doesn't respond in time,
the user gets a friendly error instead of a hanging request.

Consider adding a loading message in `PdfButton` after 5 seconds:

```tsx
// in PdfButton, add a slow-load message
const [slowLoad, setSlowLoad] = useState(false)

useEffect(() => {
  if (!loading) { setSlowLoad(false); return }
  const t = setTimeout(() => setSlowLoad(true), 5000)
  return () => clearTimeout(t)
}, [loading])

// render:
{slowLoad && (
  <p className="pdf-slow-notice">
    Uruchamianie serwisu PDF, to może chwilę potrwać...
  </p>
)}
```

---

## Security checklist

| Threat | Mitigation |
|--------|------------|
| Unauthenticated access | 401 before any DB call |
| Accessing another user's inspection (IDOR) | `userId` filter in Prisma query |
| Bill bombing (Render + usage quota) | Upstash rate limit + UsagePeriod quota |
| Quota bypass by concurrent requests | Rate limit fires before quota check |
| Hanging request on Render cold start | `AbortSignal.timeout(30_000)` |
| PDF service returning malicious content | `Content-Disposition: attachment` forces download, never inline render |

---

## Acceptance criteria

- [ ] "Pobierz PDF" button appears in topbar on hive detail page
- [ ] Button is disabled with tooltip when no inspections exist
- [ ] Clicking button shows loading spinner
- [ ] After 5 seconds of loading, slow-load notice appears
- [ ] Successful response triggers browser file download
- [ ] Downloaded file is named `hivewise-inspekcja-[id].pdf`
- [ ] Free user blocked after 20 PDF generations per month
- [ ] Premium user blocked after 100 PDF generations per month
- [ ] Rate limit error shows Polish message with retry time
- [ ] Quota error for free user includes upgrade prompt
- [ ] Microservice timeout returns friendly 503 error message
- [ ] Failed generation does NOT increment `pdfGenerationsUsed`
- [ ] Successful generation increments `pdfGenerationsUsed`
- [ ] `PDF_SERVICE_URL` read from env — not hardcoded
- [ ] No TypeScript errors

---

## What this spec does NOT cover

- R2 storage / caching of generated PDFs (future premium feature)
- PDF generation on inspection submit (separate decision)
- PDF for historical inspections other than the last one
- Retry mechanism for failed generation
- Render paid tier upgrade (eliminates cold start problem)
