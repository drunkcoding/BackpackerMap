export interface RawPrice {
  priceLabel: string | null;
  priceAmount: number | null;
  currency: string | null;
}

export interface NormalizedPrice {
  priceLabel: string | null;
  priceAmount: number | null;
  currency: string | null;
}

const CURRENCY_SYMBOLS = ['£', '€', '$', '¥', '₹', '₩'];

function nightsBetween(checkin: string | null, checkout: string | null): number | null {
  if (!checkin || !checkout) return null;
  const start = Date.parse(`${checkin}T00:00:00Z`);
  const end = Date.parse(`${checkout}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const days = Math.round((end - start) / 86_400_000);
  return days > 0 ? days : null;
}

function parseBookingLabel(label: string): { amount: number; currency: string } | null {
  const match = label.match(/^\s*([£€$¥₹₩])\s*([\d.,]+)\s*$/);
  if (!match) return null;
  const symbol = match[1]!;
  const numeric = Number(match[2]!.replace(/,/g, ''));
  if (!Number.isFinite(numeric)) return null;
  return { amount: numeric, currency: symbol };
}

function labelHasTotalQualifier(label: string | null): boolean {
  if (!label) return false;
  return /\/\s*total\b/i.test(label) || /\btotal\b/i.test(label);
}

function formatTotal(amount: number, currency: string | null): string {
  const rounded = Math.round(amount);
  const sym = currency ?? '';
  const sep = sym && !CURRENCY_SYMBOLS.includes(sym.trim()) ? ' ' : '';
  return `${sym}${sep}${rounded} total`;
}

function formatPerNight(amount: number, currency: string | null): string {
  const rounded = Math.round(amount);
  const sym = currency ?? '';
  const sep = sym && !CURRENCY_SYMBOLS.includes(sym.trim()) ? ' ' : '';
  return `${sym}${sep}${rounded} / night`;
}

export function normalizePriceToTotal(
  provider: 'airbnb' | 'booking',
  raw: RawPrice,
  checkin: string | null,
  checkout: string | null,
): NormalizedPrice {
  const nights = nightsBetween(checkin, checkout);

  if (provider === 'airbnb') {
    if (raw.priceAmount === null) return raw;
    if (labelHasTotalQualifier(raw.priceLabel)) {
      return {
        priceLabel: formatTotal(raw.priceAmount, raw.currency),
        priceAmount: Math.round(raw.priceAmount),
        currency: raw.currency,
      };
    }
    if (!nights) {
      return {
        priceLabel: formatPerNight(raw.priceAmount, raw.currency),
        priceAmount: raw.priceAmount,
        currency: raw.currency,
      };
    }
    const total = raw.priceAmount * nights;
    return {
      priceLabel: formatTotal(total, raw.currency),
      priceAmount: Math.round(total),
      currency: raw.currency,
    };
  }

  // Booking: priceAmount is usually null (provider doesn't parse it); priceLabel
  // is a single symbolic per-night value like "£76" or "€ 1,823". Parse, then
  // multiply by nights when we have dates.
  const parsed = raw.priceLabel ? parseBookingLabel(raw.priceLabel) : null;
  if (!parsed) {
    if (raw.priceAmount !== null && nights) {
      const total = raw.priceAmount * nights;
      return {
        priceLabel: formatTotal(total, raw.currency),
        priceAmount: Math.round(total),
        currency: raw.currency,
      };
    }
    return raw;
  }

  if (!nights) {
    return {
      priceLabel: formatPerNight(parsed.amount, parsed.currency),
      priceAmount: parsed.amount,
      currency: parsed.currency,
    };
  }
  const total = parsed.amount * nights;
  return {
    priceLabel: formatTotal(total, parsed.currency),
    priceAmount: Math.round(total),
    currency: parsed.currency,
  };
}
