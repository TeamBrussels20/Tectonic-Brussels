const eur = new Intl.NumberFormat("en-BE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
})
const eurCompact = new Intl.NumberFormat("en-BE", {
  style: "currency",
  currency: "EUR",
  notation: "compact",
  maximumFractionDigits: 1,
})

export const formatEur = (n: number) => eur.format(n)
export const formatEurCompact = (n: number) => eurCompact.format(n)

export function age(dob: string | null) {
  if (!dob) return null
  const d = new Date(dob)
  const now = new Date()
  const hadBirthday = now >= new Date(now.getFullYear(), d.getMonth(), d.getDate())
  return now.getFullYear() - d.getFullYear() - (hadBirthday ? 0 : 1)
}

export const humanize = (s: string) => (s.charAt(0).toUpperCase() + s.slice(1)).replaceAll("_", " ")

export const initials = (name: string) =>
  name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")

export function monthLabel(month: string) {
  return new Date(`${month}-01`).toLocaleDateString("en-GB", { month: "short" })
}
