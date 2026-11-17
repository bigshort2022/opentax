export type CaliforniaFilingStatus =
  | "single"
  | "joint"
  | "separate"
  | "head_of_household"
  | "qualifying_surviving_spouse";

interface TaxBracket {
  readonly over: number;
  readonly baseTax: number;
  readonly rate: number;
}

// FTB Tax News, October 2025, "2025 California tax rate schedules".
const SCHEDULE_X: readonly TaxBracket[] = [
  { over: 0, baseTax: 0, rate: 0.01 },
  { over: 11_079, baseTax: 110.79, rate: 0.02 },
  { over: 26_264, baseTax: 414.49, rate: 0.04 },
  { over: 41_452, baseTax: 1_022.01, rate: 0.06 },
  { over: 57_542, baseTax: 1_987.41, rate: 0.08 },
  { over: 72_724, baseTax: 3_201.97, rate: 0.093 },
  { over: 371_479, baseTax: 30_986.19, rate: 0.103 },
  { over: 445_771, baseTax: 38_638.27, rate: 0.113 },
  { over: 742_953, baseTax: 72_219.84, rate: 0.123 },
];

const SCHEDULE_Y: readonly TaxBracket[] = [
  { over: 0, baseTax: 0, rate: 0.01 },
  { over: 22_158, baseTax: 221.58, rate: 0.02 },
  { over: 52_528, baseTax: 828.98, rate: 0.04 },
  { over: 82_904, baseTax: 2_044.02, rate: 0.06 },
  { over: 115_084, baseTax: 3_974.82, rate: 0.08 },
  { over: 145_448, baseTax: 6_403.94, rate: 0.093 },
  { over: 742_958, baseTax: 61_972.37, rate: 0.103 },
  { over: 891_542, baseTax: 77_276.52, rate: 0.113 },
  { over: 1_485_906, baseTax: 144_439.65, rate: 0.123 },
];

const SCHEDULE_Z: readonly TaxBracket[] = [
  { over: 0, baseTax: 0, rate: 0.01 },
  { over: 22_173, baseTax: 221.73, rate: 0.02 },
  { over: 52_530, baseTax: 828.87, rate: 0.04 },
  { over: 67_716, baseTax: 1_436.31, rate: 0.06 },
  { over: 83_805, baseTax: 2_401.65, rate: 0.08 },
  { over: 98_990, baseTax: 3_616.45, rate: 0.093 },
  { over: 505_208, baseTax: 41_394.72, rate: 0.103 },
  { over: 606_251, baseTax: 51_802.15, rate: 0.113 },
  { over: 1_010_417, baseTax: 97_472.91, rate: 0.123 },
];

function scheduleFor(status: CaliforniaFilingStatus): readonly TaxBracket[] {
  switch (status) {
    case "single":
    case "separate":
      return SCHEDULE_X;
    case "joint":
    case "qualifying_surviving_spouse":
      return SCHEDULE_Y;
    case "head_of_household":
      return SCHEDULE_Z;
  }
}

function rateScheduleTax(
  taxableIncome: number,
  brackets: readonly TaxBracket[],
): number {
  let selected = brackets[0];
  for (const bracket of brackets) {
    if (taxableIncome < bracket.over) break;
    selected = bracket;
  }
  return Math.round(
    selected.baseTax + (taxableIncome - selected.over) * selected.rate,
  );
}

function taxTableMidpoint(taxableIncome: number): number {
  if (taxableIncome <= 50) return 25;
  const lower = 51 + Math.floor((taxableIncome - 51) / 100) * 100;
  const upper = Math.min(lower + 99, 100_000);
  return (lower + upper) / 2;
}

/** Calculates Form 540 line 31 tax from the FTB TY2025 table or rate schedule. */
export function calculateOrdinaryTax(
  taxableIncome: number,
  filingStatus: CaliforniaFilingStatus,
): number {
  if (!Number.isSafeInteger(taxableIncome) || taxableIncome < 0) {
    throw new RangeError(
      "Taxable income must be a nonnegative whole-dollar amount",
    );
  }
  if (
    filingStatus !== "single" && filingStatus !== "joint" &&
    filingStatus !== "separate" && filingStatus !== "head_of_household" &&
    filingStatus !== "qualifying_surviving_spouse"
  ) {
    throw new RangeError("Unsupported California filing status");
  }
  const brackets = scheduleFor(filingStatus);
  const incomeForTax = taxableIncome <= 100_000
    ? taxTableMidpoint(taxableIncome)
    : taxableIncome;
  return rateScheduleTax(incomeForTax, brackets);
}
