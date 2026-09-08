# Hive Detail Page Spec — Summary, Charts & Print

## Scope

Build the hive detail page accessible via the "Szczegóły" button on each
hive card. The page shows the current hive state (from last inspection),
a Recharts line chart of honey estimates over time, full inspection
history, and a print button that triggers a clean print layout using
`window.print()`. No PDF microservice, no R2 — print is handled entirely
by the browser.

---

## Route

```
app/
└── (dashboard)/
    └── hive/
        └── [hiveId]/
            └── page.tsx
```

### URL pattern

```
/hive/[hiveId]
```

---

## HiveCard update

Update the "Szczegóły" button in `components/dashboard/HiveCard.tsx`:

```tsx
import Link from 'next/link'

<Link
  href={`/hive/${hive.id}`}
  className="btn-xs flex-1 text-center"
>
  Szczegóły
</Link>
```

---

## Data fetching (`app/(dashboard)/hive/[hiveId]/page.tsx`)

Server component. One query fetches everything the page needs.

```ts
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect, notFound } from 'next/navigation'

export default async function HiveDetailPage({ params }: { params: { hiveId: string } }) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const hive = await prisma.hive.findFirst({
    where: {
      id: params.hiveId,
      apiary: { userId: session.user.id },   // ownership enforced
    },
    include: {
      apiary: {
        select: { name: true, location: true },
      },
      currentInspection: true,
      inspections: {
        orderBy: { inspectedAt: 'asc' },
        select: {
          id:          true,
          inspectedAt: true,
          honeyKg:     true,        // scalar — no JSON unpacking needed
          queen:       true,        // JSON — for history list summary
          colony:      true,        // JSON — for behavior/strength
          health:      true,        // JSON — for health flags in history
          notes:       true,
        },
      },
    },
  })

  if (!hive) notFound()

  return <HiveDetailView hive={hive} userName={session.user.name ?? ''} />
}
```

`honeyKg` is a scalar column (derived on inspection submit) — no JSON
parsing needed for the chart. All JSON columns are only used in the
history list for human-readable summaries.

---

## Free vs Premium data scope

Apply the inspection history limit before passing to the component:

```ts
import { prisma } from '@/lib/prisma'

const subscription = await prisma.subscription.findUnique({
  where: { userId: session.user.id },
  select: { tier: true },
})

const isPremium = subscription?.tier === 'PREMIUM'

// Free: last 3 months of inspections
// Premium: full history
const cutoffDate = isPremium
  ? null
  : new Date(Date.now() - 1000 * 60 * 60 * 24 * 90)

// apply to the inspections query:
inspections: {
  orderBy: { inspectedAt: 'asc' },
  where: cutoffDate ? { inspectedAt: { gte: cutoffDate } } : undefined,
  select: { ... }
}
```

Pass `isPremium` to the view so it can show an upgrade prompt when
the user hits the free limit.

---

## Page layout

```
┌─────────────────────────────────────────────────────────┐
│ ← Pasieka Turawa                    [🖨 Drukuj raport]  │  topbar
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Ul 3 · Pasieka Turawa              [status pill]       │  hero
│  Wielkopolski · ostatni przegląd 8 cze 2026             │
│                                                         │
├──────────────┬──────────────┬──────────────┬────────────┤
│  Matka       │  Siła        │  Czerw       │  Miód      │  stat cards
│  Niewidziana │  ●●●○○       │  Jaja+otw.   │  ~4,2 kg   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Trend miodu (kg)                                       │  chart
│  [Recharts LineChart]                                   │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Historia przeglądów                                    │  history
│  [inspection list]                                      │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Topbar

```tsx
<div className="detail-topbar">
  <Link href="/dashboard" className="back-link">
    <ChevronLeftIcon />
    {hive.apiary.name}
  </Link>
  <PrintButton />    {/* client component — calls window.print() */}
</div>
```

Back link goes to `/dashboard`, not `history.back()` — more predictable.

---

## Hero section

```tsx
<div className="hive-hero">
  <div className="hive-hero-left">
    <h1 className="hive-hero-title">
      {hive.label}
      <span className="hive-hero-apiary">· {hive.apiary.name}</span>
    </h1>
    <p className="hive-hero-meta">
      {hiveTypeLabel[hive.hiveType]} · ostatni przegląd{' '}
      {formatDate(hive.currentInspection?.inspectedAt ?? null)}
    </p>
  </div>
  <StatusPill status={deriveHiveStatus(hive.currentInspection)} />
</div>
```

`hiveTypeLabel` mapping:
```ts
const hiveTypeLabel: Record<HiveType, string> = {
  WIELKOPOLSKI: 'Ramka wielkopolska',
  DADANT:       'Dadant',
  LANGSTROTH:   'Langstroth',
  WARRE:        'Warré',
  LAYENS:       'Layens',
  OTHER:        'Inny typ',
}
```

---

## Stat cards (4-column grid)

Each card has a label and a value derived from `currentInspection`.
All return a neutral "—" state when `currentInspection` is null.

```tsx
<div className="stat-grid">
  <StatCard label="Matka"   value={queenStatusLabel} color={queenColor} />
  <StatCard label="Siła"    value={<StrengthDots value={strength} />} />
  <StatCard label="Czerw"   value={broodSummary} />
  <StatCard label="Miód"    value={honeyLabel} color="amber" />
</div>
```

### Derived values

```ts
// queen
const queen = currentInspection?.queen as QueenData | undefined
const queenStatusLabel = queen
  ? { seen: 'Widziana', not_seen_brood_ok: 'Niewidziana, OK', missing: 'Brak matki' }[queen.queen_status]
  : '—'

// strength (frames covered → 0–5 dots)
const colony = currentInspection?.colony as ColonyData | undefined
const strength = colony ? Math.round(colony.frames_covered / 2) : 0

// brood summary
const brood = currentInspection?.brood as BroodData | undefined
const broodParts = brood ? [
  brood.brood_eggs   && 'jaja',
  brood.brood_open   && 'otwarty',
  brood.brood_capped && 'kryty',
  brood.brood_drone  && 'trutowy',
].filter(Boolean).join(' + ') : '—'

// honey
const honeyLabel = currentInspection?.honeyKg != null
  ? `~${currentInspection.honeyKg.toFixed(1)} kg`
  : '—'
```

---

## Honey trend chart (Recharts)

Client component. Receives `inspections` as prop (already filtered by
Free/Premium scope server-side).

```tsx
'use client'

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'

interface ChartPoint {
  date:    string    // formatted for display: "8 cze"
  honeyKg: number | null
}

interface HoneyChartProps {
  inspections: Array<{ inspectedAt: Date; honeyKg: number | null }>
  isPremium:   boolean
}

export function HoneyChart({ inspections, isPremium }: HoneyChartProps) {
  const data: ChartPoint[] = inspections
    .filter(i => i.honeyKg !== null)
    .map(i => ({
      date:    new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short' })
                       .format(new Date(i.inspectedAt)),
      honeyKg: i.honeyKg,
    }))

  if (data.length === 0) {
    return (
      <div className="chart-empty">
        <p>Brak danych do wykresu.</p>
        <p className="chart-empty-sub">Wykonaj kilka przeglądów żeby zobaczyć trend.</p>
      </div>
    )
  }

  if (data.length === 1) {
    return (
      <div className="chart-empty">
        <p>Potrzeba co najmniej 2 przeglądów żeby pokazać trend.</p>
      </div>
    )
  }

  return (
    <div className="chart-wrapper">
      <div className="chart-header">
        <span className="chart-title">Trend miodu (kg)</span>
        {!isPremium && (
          <span className="chart-limit-notice">
            Ostatnie 3 miesiące · <a href="/settings/billing">Premium</a> odblokuje pełną historię
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(255,255,255,0.05)"
            vertical={false}
          />
          <XAxis
            dataKey="date"
            tick={{ fill: 'var(--muted)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: 'var(--muted)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${v} kg`}
            width={48}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border-2)',
              borderRadius: '8px',
              fontSize: '12px',
              color: 'var(--foreground)',
            }}
            formatter={(value: number) => [`${value.toFixed(1)} kg`, 'Miód']}
          />
          <Line
            type="monotone"
            dataKey="honeyKg"
            stroke="var(--accent-warm)"      /* amber — honey color */
            strokeWidth={2}
            dot={{ fill: 'var(--accent-warm)', r: 4, strokeWidth: 0 }}
            activeDot={{ r: 6, strokeWidth: 0 }}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
```

Install Recharts if not already present:

```bash
npm install recharts
```

---

## Inspection history list

Chronologically descending list of all inspections (newest first)
below the chart.

```tsx
<div className="history-section">
  <h2 className="section-label">Historia przeglądów</h2>

  {hive.inspections.length === 0 && (
    <p className="history-empty">Brak przeglądów dla tego ula.</p>
  )}

  {[...hive.inspections].reverse().map((inspection) => (
    <HistoryRow key={inspection.id} inspection={inspection} />
  ))}

  {!isPremium && hive.inspections.length >= 1 && (
    <div className="history-limit-banner">
      Wyświetlasz przeglądy z ostatnich 3 miesięcy.
      <a href="/settings/billing">Przejdź na Premium</a> żeby zobaczyć całą historię.
    </div>
  )}
</div>
```

### HistoryRow component

```tsx
interface HistoryRowProps {
  inspection: {
    id:          string
    inspectedAt: Date
    honeyKg:     number | null
    queen:       unknown   // JSON
    health:      unknown   // JSON
    notes:       string
  }
}

function HistoryRow({ inspection }: HistoryRowProps) {
  const queen  = inspection.queen  as QueenData  | undefined
  const health = inspection.health as HealthData | undefined

  const queenBadge = queen?.queen_status === 'missing'           ? { label: 'Brak matki',    color: 'danger'  }
    : queen?.queen_status === 'not_seen_brood_ok'                ? { label: 'Matka niewidz.', color: 'warning' }
    : queen?.queen_cells === 'swarm' || queen?.queen_cells === 'emergency'
                                                                 ? { label: 'Mateczniki',     color: 'warning' }
    : { label: 'OK', color: 'ok' }

  return (
    <div className="history-row">
      <div className="history-row-left">
        <span className="history-date">
          {formatDate(inspection.inspectedAt)}
        </span>
        <StatusBadge variant={queenBadge.color}>{queenBadge.label}</StatusBadge>
        {health?.issues_observed && (
          <StatusBadge variant="warning">Zdrowie</StatusBadge>
        )}
      </div>
      <div className="history-row-right">
        {inspection.honeyKg != null && (
          <span className="history-honey">
            ~{inspection.honeyKg.toFixed(1)} kg
          </span>
        )}
        {inspection.notes && (
          <span className="history-notes" title={inspection.notes}>
            📝
          </span>
        )}
      </div>
    </div>
  )
}
```

---

## Print button (`components/hive/PrintButton.tsx`)

Client component. Uses `window.print()` — no API call, no cost.

```tsx
'use client'

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="btn"
    >
      <PrinterIcon />
      Drukuj raport
    </button>
  )
}
```

---

## Print CSS (`globals.css` addition)

Controls what the printed page looks like. Everything in `.no-print`
is hidden. Only `.print-only` content (if any) is shown. The report
prints as a clean document without navigation, buttons, or dark background.

```css
@media print {
  /* hide all UI chrome */
  .sidebar,
  .topbar,
  .print-btn,
  .chart-limit-notice,
  .history-limit-banner,
  .hive-actions,
  .back-link         { display: none !important; }

  /* reset dark theme for print */
  body, .main, .content {
    background: #ffffff !important;
    color:      #111827 !important;
  }

  /* stat cards — readable on white */
  .stat-card {
    background: #f9fafb !important;
    border:     1px solid #e5e7eb !important;
    color:      #111827 !important;
  }

  /* chart — keep visible, recharts renders as SVG so it prints well */
  .chart-wrapper {
    break-inside: avoid;
  }

  /* history rows */
  .history-row {
    border-bottom: 1px solid #e5e7eb !important;
    break-inside:  avoid;
  }

  /* page header for print */
  .print-header {
    display:       block !important;   /* hidden on screen, shown on print */
    margin-bottom: 24px;
    font-size:     11px;
    color:         #6b7280;
  }

  /* force single column */
  .stat-grid {
    grid-template-columns: repeat(2, 1fr) !important;
  }
}

/* hidden on screen, shown only when printing */
.print-header {
  display: none;
}
```

### Print header (shown only on print)

Add this at the top of the page content, hidden on screen:

```tsx
<div className="print-header">
  <strong>Hivewise</strong> · {hive.apiary.name} · {hive.label} ·
  Raport wygenerowany {new Date().toLocaleDateString('pl-PL')}
</div>
```

---

## TypeScript types

Reuse types from `types/inspection-draft.ts`. No new types needed —
`QueenData`, `ColonyData`, `BroodData`, `HealthData` cover all JSON
columns used on this page.

---

## Acceptance criteria

- [ ] "Szczegóły" button on HiveCard navigates to `/hive/[hiveId]`
- [ ] Visiting `/hive/[hiveId]` for another user's hive returns 404
- [ ] Visiting unauthenticated redirects to `/login`
- [ ] Hero shows hive label, apiary name, type, last inspection date
- [ ] Status pill reflects derived status from last inspection
- [ ] 4 stat cards show queen status, strength dots, brood summary, honey kg
- [ ] All stat cards show "—" when no inspections exist
- [ ] Honey chart renders when ≥ 2 inspections with honeyKg exist
- [ ] Chart shows empty state message when < 2 data points
- [ ] Chart uses amber color (`var(--accent-warm)`) for the line
- [ ] Chart tooltip shows formatted kg value in Polish
- [ ] Free users see only last 3 months of data in chart and history
- [ ] Free users see upgrade prompt below chart and history list
- [ ] Premium users see full history, no upgrade prompt
- [ ] History list is sorted newest first
- [ ] History rows show date, queen badge, health badge (if issues), honey kg
- [ ] Print button triggers `window.print()`
- [ ] Print layout hides sidebar, topbar, buttons
- [ ] Print layout resets dark background to white
- [ ] Print layout shows print header with apiary name and date
- [ ] Recharts SVG renders correctly in print preview
- [ ] No TypeScript errors, no Prisma type errors

---

## What this spec does NOT cover

- PDF generation via WeasyPrint microservice (separate spec, premium feature)
- R2 storage for PDFs (separate spec)
- Editing or deleting an inspection from the history list
- Inspection detail modal / expanded view
- AI insights section (separate spec, premium feature)
- Second chart (brood trend, colony strength trend) — add in follow-up
