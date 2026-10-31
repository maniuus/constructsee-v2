const idr = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const money = new Intl.NumberFormat("id-ID", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const decimal = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 2,
});

const koef = new Intl.NumberFormat("id-ID", {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});

export const formatIDR = (value: number): string => idr.format(Number.isFinite(value) ? value : 0);

export const formatMoney = (value: number): string =>
  money.format(Number.isFinite(value) ? value : 0);

export const formatNumber = (value: number): string =>
  decimal.format(Number.isFinite(value) ? value : 0);

export const formatKoef = (value: number): string =>
  koef.format(Number.isFinite(value) ? value : 0);

export const parseNumeric = (raw: string): number => {
  const cleaned = raw.trim().replace(/[^\d.,-]/g, "");
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? value : 0;
};
