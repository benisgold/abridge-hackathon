const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

/** Whole dollars, e.g. $1,171. Used everywhere so figures can't drift apart. */
export function formatUSD(amount: number): string {
  return usd.format(amount)
}

export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  return `${month}/${day}/${year}`
}
