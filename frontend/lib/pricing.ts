// Pricing knowledge base: published payer benchmarks over the Medicare allowed
// amount. The CMS fee schedules give the Medicare allowed amount per service;
// these multipliers turn that into a payer specific basis so the patient sees an
// estimate for their coverage, not a national Medicare number. Each multiplier is
// a published benchmark (not a single hospital's negotiated rate), with a source.

export type Payer = 'commercial' | 'medicare' | 'medicaid' | 'selfpay'

export interface PayerBenchmark {
  label: string
  multiplier: number // relative to the Medicare (CMS) allowed amount
  coinsurance: number // typical member share after the deductible
  source: string
}

export const PAYERS: Record<Payer, PayerBenchmark> = {
  commercial: {
    label: 'Commercial PPO',
    multiplier: 2.5,
    coinsurance: 0.2,
    source: 'RAND Hospital Price Transparency Study 2024: commercial prices average about 254% of Medicare',
  },
  medicare: {
    label: 'Medicare',
    multiplier: 1.0,
    coinsurance: 0.2,
    source: 'CMS fee schedules, the Medicare allowed amount',
  },
  medicaid: {
    label: 'Medicaid',
    multiplier: 0.72,
    coinsurance: 0.0,
    source: 'MACPAC: Medicaid physician fees average about 72% of Medicare',
  },
  selfpay: {
    label: 'Self pay',
    multiplier: 1.5,
    coinsurance: 1.0,
    source: 'Self pay list price proxy; varies widely, ask about prompt pay discounts',
  },
}

export const PAYER_ORDER: Payer[] = ['commercial', 'medicare', 'medicaid', 'selfpay']
