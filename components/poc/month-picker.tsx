"use client"

export function MonthPicker({ currentMonth }: { currentMonth: string }) {
  return (
    <input
      type="month"
      defaultValue={currentMonth}
      onChange={(e) => {
        if (e.target.value) window.location.href = `/poc?month=${e.target.value}`
      }}
      className="bg-background border rounded-md px-3 py-2 text-sm"
    />
  )
}
