import ExcelJS from 'exceljs'

export interface ParsedAccount {
  code: string
  description: string
}

export interface ParsedItrCode {
  code: string
  description: string
}

export interface ParsedBudgetLine {
  description: string
  account_code: string
  itr_code: string
  budget_value: number
}

export interface ParsedBudgetSheet {
  cost_center_code: string   // extracted from sheet name or cell
  accounts: ParsedAccount[]
  itr_codes: ParsedItrCode[]
  budget_lines: ParsedBudgetLine[]
}

/**
 * Parse a Finance budget Excel file.
 *
 * Expected layout (one sheet per cost center):
 *   - Sheet name contains the cost center code (first 4 digits)
 *   - Each data row has:
 *       Col A: visible flag (skip blank/subtotal rows)
 *       Col B: combined key (cost_center_code + account_code)
 *       Col D: account code  (e.g. "3300010")
 *       Col E: account description (e.g. "Other operating Income Group")
 *       Col F or later: a column whose header contains "Budget" or "Plan" → budget value
 *       ITR code: parsed from the description cell when the pattern "<CODE> <Description>" appears
 *
 * The mapping is intentionally kept in one place so Finance can adjust
 * column letters here without touching the rest of the application.
 */

const COL_ACCOUNT_CODE  = 4  // D
const COL_ACCOUNT_DESC  = 5  // E
const COL_BUDGET_VALUE  = 9  // I  ← adjust to match the actual budget column

// Rows 1-7 are headers; data starts at row 8
const DATA_START_ROW = 8

// A row is a real budget line (not a subtotal) when col D has a short numeric code
function isDataRow(accountCode: string | null): boolean {
  if (!accountCode) return false
  return /^\d{4,10}$/.test(accountCode.trim())
}

// Some descriptions carry an embedded ITR code: "12345 Some description"
function extractItrCode(raw: string): { code: string; description: string } | null {
  const m = raw.trim().match(/^(\d{5,})\s+(.+)/)
  if (m) return { code: m[1], description: m[2].trim() }
  return null
}

function cellStr(cell: ExcelJS.Cell): string {
  const v = cell.value
  if (v === null || v === undefined) return ''
  if (typeof v === 'object' && 'result' in v) return String((v as any).result ?? '')
  return String(v)
}

function cellNum(cell: ExcelJS.Cell): number {
  const v = cell.value
  if (v === null || v === undefined) return 0
  if (typeof v === 'object' && 'result' in v) return Number((v as any).result ?? 0)
  return Number(v) || 0
}

export async function parseBudgetExcel(filePath: string): Promise<ParsedBudgetSheet[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(filePath)

  const sheets: ParsedBudgetSheet[] = []

  for (const ws of wb.worksheets) {
    // Extract cost center code from sheet name (first 4 consecutive digits)
    const ccMatch = ws.name.match(/\d{4}/)
    const costCenterCode = ccMatch ? ccMatch[0] : ws.name

    const accountsMap = new Map<string, ParsedAccount>()
    const itrMap      = new Map<string, ParsedItrCode>()
    const lines: ParsedBudgetLine[] = []

    ws.eachRow((row, rn) => {
      if (rn < DATA_START_ROW) return

      const accountCode = cellStr(row.getCell(COL_ACCOUNT_CODE))
      if (!isDataRow(accountCode)) return

      const accountDesc  = cellStr(row.getCell(COL_ACCOUNT_DESC))
      const budgetValue  = cellNum(row.getCell(COL_BUDGET_VALUE))

      // Upsert account
      if (!accountsMap.has(accountCode)) {
        accountsMap.set(accountCode, { code: accountCode, description: accountDesc || accountCode })
      }

      // Try to parse an ITR code from the description
      let itrCode = 'UNKNOWN'
      let lineDesc = accountDesc
      const itrParsed = extractItrCode(accountDesc)
      if (itrParsed) {
        itrCode = itrParsed.code
        lineDesc = itrParsed.description
        if (!itrMap.has(itrCode)) {
          itrMap.set(itrCode, { code: itrCode, description: itrParsed.description })
        }
      }

      lines.push({
        description: lineDesc || accountDesc,
        account_code: accountCode,
        itr_code: itrCode,
        budget_value: budgetValue,
      })
    })

    sheets.push({
      cost_center_code: costCenterCode,
      accounts: [...accountsMap.values()],
      itr_codes: [...itrMap.values()],
      budget_lines: lines,
    })
  }

  return sheets
}
