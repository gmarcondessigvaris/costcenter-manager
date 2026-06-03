import ExcelJS from 'exceljs'

export interface ParsedBudgetLine {
  code: string
  name: string
  allocated_amount: number
}

export async function parseBudgetExcel(filePath: string): Promise<ParsedBudgetLine[]> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filePath)
  const worksheet = workbook.worksheets[0]

  const lines: ParsedBudgetLine[] = []
  let headerSkipped = false

  worksheet.eachRow((row) => {
    const codeVal = row.getCell(1).value
    const nameVal = row.getCell(2).value
    const amountVal = row.getCell(3).value

    if (codeVal === null && nameVal === null) return

    // Skip the first non-numeric row (header)
    if (!headerSkipped && isNaN(Number(codeVal))) {
      headerSkipped = true
      return
    }

    const code = String(codeVal ?? '').trim()
    const name = String(nameVal ?? '').trim()
    if (!code || !name) return

    const amount = Number(amountVal) || 0
    lines.push({ code, name, allocated_amount: Math.round(amount * 100) / 100 })
  })

  return lines
}
