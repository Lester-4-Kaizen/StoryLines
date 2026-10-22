export function SettingRow({
  title,
  description,
  control,
}: {
  title: string
  description: string
  control: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-4 border-b border-border pb-5">
      <div className="flex-1">
        <h2 className="text-sm font-bold">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      {control}
    </div>
  )
}
