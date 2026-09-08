# Inspection Flow Spec — Hive → Form → Database

## Scope

Connect the "Przegląd" button on each hive card to a multi-step inspection
form. The form saves a draft on every step (localStorage). On final submit,
the complete inspection is saved to the database. PDF generation is out of
scope for this spec — handled separately.

---

## User flow

```
Dashboard
  └── HiveCard "Przegląd" button
        └── /inspect/[hiveId]          ← inspection form, 7 steps
              └── on submit
                    └── POST to DB (Inspection + update Hive.currentInspectionId)
                          └── redirect /dashboard?inspected=[hiveId]
```

---

## Route

```
app/
└── (dashboard)/
    └── inspect/
        └── [hiveId]/
            └── page.tsx     ← server component, loads hive + prefill data
```

### URL pattern

```
/inspect/[hiveId]
```

`hiveId` is the Prisma `Hive.id` (cuid). It arrives from the dashboard
hive card as a Next.js Link href — no query params needed.

---

## HiveCard update (Dashboard Spec 1 → update)

Update the "Przegląd" button in `components/dashboard/HiveCard.tsx` to
be a `<Link>` pointing to the inspection route:

```tsx
import Link from 'next/link'

// replace the existing <button className="btn-xs primary">
<Link
  href={`/inspect/${hive.id}`}
  className="btn-xs primary flex-1 text-center"
>
  Przegląd
</Link>
```

No `onClick` handler needed — navigation is handled by Next.js router.

---

## Page server component (`app/(dashboard)/inspect/[hiveId]/page.tsx`)

The page is a server component that:
1. Verifies auth + ownership
2. Loads hive data and last inspection for prefill
3. Passes data to the client-side form component

```ts
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect, notFound } from 'next/navigation'
import { InspectionForm } from '@/components/inspection/InspectionForm'

interface Props {
  params: { hiveId: string }
}

export default async function InspectPage({ params }: Props) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  // ── ownership check ───────────────────────────────────────────────────────
  // Verify hive belongs to this user's apiary.
  // Without this, any logged-in user could inspect any hive by ID.
  const hive = await prisma.hive.findFirst({
    where: {
      id: params.hiveId,
      apiary: { userId: session.user.id },   // ownership enforced here
    },
    include: {
      apiary: { select: { name: true, location: true } },
      currentInspection: true,               // for prefill
    },
  })

  if (!hive) notFound()   // 404 for non-existent or unauthorized hive

  return (
    <InspectionForm
      hiveId={hive.id}
      hiveLabel={hive.label}
      hiveType={hive.hiveType}
      apiaryName={hive.apiary.name}
      prefill={hive.currentInspection}     // null if never inspected
    />
  )
}
```

---

## Draft system — localStorage

Draft is saved to localStorage on every step change. Key is scoped to
`hiveId` so drafts for different hives don't collide.

```ts
// draft key pattern
const DRAFT_KEY = (hiveId: string) => `hivewise:draft:${hiveId}`

// save draft (called on every step advance)
export function saveDraft(hiveId: string, data: Partial<InspectionDraft>) {
  try {
    const existing = loadDraft(hiveId) ?? {}
    localStorage.setItem(
      DRAFT_KEY(hiveId),
      JSON.stringify({ ...existing, ...data, savedAt: Date.now() })
    )
  } catch {
    // localStorage unavailable (private mode etc.) — fail silently
  }
}

// load draft
export function loadDraft(hiveId: string): InspectionDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY(hiveId))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    // discard drafts older than 24 hours
    if (Date.now() - parsed.savedAt > 1000 * 60 * 60 * 24) {
      clearDraft(hiveId)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

// clear draft after successful submit
export function clearDraft(hiveId: string) {
  try {
    localStorage.removeItem(DRAFT_KEY(hiveId))
  } catch {}
}
```

### Draft resume prompt

When the form mounts and a valid draft exists, show a resume banner
before rendering step 1:

```tsx
{hasDraft && !dismissed && (
  <div className="draft-banner">
    <span>Masz niezakończony przegląd z {formatDraftAge(draft.savedAt)}.</span>
    <button onClick={resumeDraft}>Wznów</button>
    <button onClick={discardDraft}>Zacznij od nowa</button>
  </div>
)}
```

"Zacznij od nowa" clears the draft and resets form to step 1 with prefill
data from last inspection. "Wznów" restores draft state and jumps to the
last completed step.

---

## Form state shape (`InspectionDraft`)

Full TypeScript type covering all 7 steps. Matches the Prisma `Inspection`
JSON column shapes exactly so submit is a direct pass-through.

```ts
// types/inspection-draft.ts

export interface InspectionDraft {
  // meta — filled automatically, not by user
  hiveId:          string
  inspectedAt:     string    // ISO string, set on submit
  savedAt:         number    // timestamp for draft age check

  // step 1 — colony (behaviour collected first, before opening hive)
  colony?: {
    behavior:     'calm' | 'nervous' | 'aggressive' | 'swarm_mood'
    honey_stores: 'sufficient' | 'low' | 'none'
    honey_kg:     number
    hive_space:   'ok' | 'tight' | 'loose' | 'added_super'
    frames_covered: number
  }

  // step 2 — queen
  queen?: {
    queen_status:       'seen' | 'not_seen_brood_ok' | 'missing'
    queen_marked:       boolean
    queen_marker_color: string
    queen_cells:        'none' | 'emergency' | 'swarm' | 'supersedure'
    queen_cells_count:  number
  }

  // step 3 — brood
  brood?: {
    brood_eggs:    boolean
    brood_open:    boolean
    brood_capped:  boolean
    brood_drone:   boolean
    brood_pattern: number    // 1–5
  }

  // step 4 — comb (frame-by-frame, new system)
  comb?: {
    hive_capacity: number
    frames: Array<{
      number: number
      honey:  number    // 0–10
      pollen: number
      brood:  number
      empty:  number
    }>
    low_confidence: boolean   // user flagged uncertain entries
  }

  // step 5 — health
  health?: {
    issues_observed: boolean
    conditions:      string[]
    other:           string
    varroa_drop_count: number
  }

  // step 6 — actions
  actions?: {
    performed: boolean
    selected:  string[]
    other:     string
  }

  // step 7 — notes
  notes?: string
}
```

---

## Form steps

```
Step 1 — Kolonia      (behavior, space, honey stores)
Step 2 — Matka        (queen status, cells, marking)
Step 3 — Czerw        (eggs, open, capped, drone, pattern)
Step 4 — Plastry      (frame-by-frame comb system, voice input)
Step 5 — Zdrowie      (issues observed → condition list)
Step 6 — Działania    (actions performed → action list)
Step 7 — Podsumowanie (review all, notes field, submit button)
```

Progress indicator: `3 / 7` in top-right corner + thin progress line
at top of screen. No step labels — just the fraction.

On every "Dalej" click: save current step data to draft, advance step.
On "Wstecz" click: go back without clearing data.

---

## Prefill from last inspection

If `currentInspection` exists (passed as `prefill` prop), pre-populate
form fields with values from the previous inspection. This saves the
beekeeper from re-entering unchanged data.

```ts
function buildInitialValues(
  prefill: Inspection | null,
  draft: InspectionDraft | null
): Partial<InspectionDraft> {
  // draft takes priority over prefill
  if (draft) return draft

  if (!prefill) return {}

  // cast JSON columns to typed shapes
  return {
    queen:   prefill.queen   as QueenData   ?? undefined,
    colony:  prefill.colony  as ColonyData  ?? undefined,
    brood:   prefill.brood   as BroodData   ?? undefined,
    comb:    prefill.comb    as CombData    ?? undefined,
    health:  prefill.health  as HealthData  ?? undefined,
    actions: prefill.actions as ActionsData ?? undefined,
    // notes: intentionally not prefilled — fresh each inspection
  }
}
```

Prefill values are shown with reduced opacity or a "z poprzedniego
przeglądu" label so the beekeeper knows they're looking at old data.

---

## Submit server action (`actions/submitInspection.ts`)

Called on step 7 "Zapisz przegląd" button. Runs server-side.

```ts
'use server'

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { InspectionDraft } from '@/types/inspection-draft'
import { loginLimiter } from '@/lib/ratelimit'   // reuse auth limiter pattern

export async function submitInspectionAction(
  hiveId: string,
  draft: InspectionDraft
) {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Musisz być zalogowany.' }

  // ── ownership check ───────────────────────────────────────────────────────
  const hive = await prisma.hive.findFirst({
    where: {
      id: hiveId,
      apiary: { userId: session.user.id },
    },
  })
  if (!hive) return { error: 'Nie masz dostępu do tego ula.' }

  // ── validate required sections ────────────────────────────────────────────
  if (!draft.queen || !draft.colony || !draft.brood || !draft.comb) {
    return { error: 'Wypełnij wszystkie wymagane sekcje.' }
  }

  // ── validate comb frame sums ──────────────────────────────────────────────
  for (const frame of draft.comb.frames) {
    const sum = frame.honey + frame.pollen + frame.brood + frame.empty
    if (sum !== 10) {
      return {
        error: `Ramka ${frame.number}: suma musi wynosić 10 (wynosi ${sum}).`
      }
    }
  }

  // ── derive summary fields for queryable columns ───────────────────────────
  const totalHoneyTenths = draft.comb.frames.reduce((acc, f) => acc + f.honey, 0)
  const honeyKg = (totalHoneyTenths / draft.comb.frames.length / 10) *
                  (hive.hiveType === 'DADANT' ? 3.5 : 1.2)   // approx kg per frame

  const honeySufficiency = draft.colony.honey_stores === 'sufficient' ? 'SUFFICIENT'
    : draft.colony.honey_stores === 'low' ? 'LOW'
    : 'NONE'

  // ── write inspection + update hive in one transaction ────────────────────
  const inspection = await prisma.$transaction(async (tx) => {
    const newInspection = await tx.inspection.create({
      data: {
        hiveId,
        userId:      session.user.id,
        inspectedAt: new Date(),
        queen:       draft.queen!,
        colony:      draft.colony!,
        brood:       draft.brood!,
        comb:        draft.comb!,
        health:      draft.health  ?? { issues_observed: false, conditions: [], other: '', varroa_drop_count: 0 },
        actions:     draft.actions ?? { performed: false, selected: [], other: '' },
        notes:       draft.notes   ?? '',
        // derived scalar fields
        combSchemaVersion: 2,
        honeyKg,
        honeySufficiency,
        combCondition: 'GOOD',   // derive from comb data in follow-up spec
      },
    })

    // update denormalized pointer on Hive
    await tx.hive.update({
      where: { id: hiveId },
      data: { currentInspectionId: newInspection.id },
    })

    return newInspection
  })

  // draft cleanup happens client-side after redirect confirms success
  redirect(`/dashboard?inspected=${hiveId}`)
}
```

---

## Post-submit dashboard feedback

On `/dashboard`, read the `inspected` query param and show a success
toast or inline confirmation:

```tsx
// app/(dashboard)/dashboard/page.tsx
const inspectedHiveId = searchParams.inspected

// pass to client component to show toast:
// "✓ Przegląd zapisany dla Ula 3"
```

---

## Error handling

| Scenario | Behavior |
|----------|----------|
| hiveId not found | `notFound()` → Next.js 404 page |
| hiveId belongs to another user | `notFound()` → same 404 (don't leak existence) |
| Submit with missing sections | return `{ error }`, stay on step 7 |
| Frame sum !== 10 | return `{ error }`, highlight offending frame |
| Prisma transaction fails | return `{ error: 'Błąd zapisu. Spróbuj ponownie.' }` |
| localStorage unavailable | draft silently disabled, form still works |

---

## Acceptance criteria

- [ ] "Przegląd" button on HiveCard navigates to `/inspect/[hiveId]`
- [ ] Visiting `/inspect/[hiveId]` for another user's hive returns 404
- [ ] Visiting `/inspect/[hiveId]` unauthenticated redirects to `/login`
- [ ] Form loads with prefill values from `currentInspection` if exists
- [ ] Prefill values are visually marked as "z poprzedniego przeglądu"
- [ ] Draft is saved to localStorage on every step advance
- [ ] Draft resume banner appears when returning to an in-progress inspection
- [ ] "Zacznij od nowa" clears draft and resets to prefill values
- [ ] "Wznów" restores draft and jumps to last completed step
- [ ] Draft older than 24 hours is discarded automatically
- [ ] Step 7 shows full summary of all entered data
- [ ] Submit creates `Inspection` record in database
- [ ] Submit updates `Hive.currentInspectionId` in same transaction
- [ ] Submit with invalid frame sums returns error message
- [ ] After successful submit, redirects to `/dashboard?inspected=[hiveId]`
- [ ] Dashboard shows success feedback for the inspected hive
- [ ] Draft is cleared client-side after successful redirect

---

## What this spec does NOT cover

- PDF generation (separate spec — PdfGenerationJob flow)
- Voice input for comb section (useVoiceFrame hook — separate spec)
- Inspection history view per hive
- Editing a submitted inspection
- Deleting an inspection
