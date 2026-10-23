import { WORK_MOODS } from '@/lib/work-taxonomy'

export function WorkMoodSelector({
  selected,
  onChange,
}: {
  selected: string[]
  onChange: (moods: string[]) => void
}) {
  const toggleMood = (mood: string) => {
    onChange(selected.includes(mood)
      ? selected.filter((item) => item !== mood)
      : [...selected, mood])
  }

  return (
    <fieldset>
      <legend className="text-sm font-bold">Mood <span className="font-normal text-muted-foreground">(choose up to 3)</span></legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {WORK_MOODS.map((mood) => {
          const active = selected.includes(mood)
          const atLimit = selected.length >= 3 && !active
          return (
            <button
              key={mood}
              type="button"
              aria-pressed={active}
              disabled={atLimit}
              onClick={() => toggleMood(mood)}
              className={`min-h-10 rounded-full border px-3 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 ${
                active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:border-accent'
              }`}
            >
              {mood}
            </button>
          )
        })}
      </div>
      {selected.length >= 3 && <p className="mt-2 text-xs text-muted-foreground">Hanggang tatlong mood lang ang puwedeng piliin.</p>}
    </fieldset>
  )
}
