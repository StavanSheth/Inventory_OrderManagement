/**
 * Client-side Export Utilities for Excel (.xls) and PDF reports with applied filters.
 */

export interface ExportColumn {
  header: string;
  key: string;
  format?: 'currency' | 'number' | 'date' | 'text';
}

export interface ExportOptions {
  filename: string;
  title: string;
  subtitle?: string;
  filterSummary?: Record<string, string | number | undefined | null>;
  columns: ExportColumn[];
  data: Array<Record<string, any>>;
}

/**
 * Generates and downloads a formatted Excel (.xls) spreadsheet.
 * Opens natively in Microsoft Excel, Google Sheets, and LibreOffice with full styling.
 */
export function exportToExcel({
  filename,
  title,
  subtitle,
  filterSummary,
  columns,
  data,
}: ExportOptions): void {
  const cleanFilename = filename.endsWith('.xls') ? filename : `${filename}.xls`;

  // Filter summary rows
  let filterRowsXml = '';
  if (filterSummary) {
    const activeFilters = Object.entries(filterSummary).filter(
      ([_, val]) => val !== undefined && val !== null && val !== '' && val !== 'ALL'
    );
    if (activeFilters.length > 0) {
      filterRowsXml += `
        <Row>
          <Cell ss:StyleID="FilterHeader"><Data ss:Type="String">Applied Filters:</Data></Cell>
          <Cell ss:StyleID="FilterVal"><Data ss:Type="String">${escapeXml(
            activeFilters.map(([k, v]) => `${k}: ${v}`).join(' | ')
          )}</Data></Cell>
        </Row>
      `;
    }
  }

  // Header row
  const headerCellsXml = columns
    .map(
      (col) =>
        `<Cell ss:StyleID="Header"><Data ss:Type="String">${escapeXml(col.header)}</Data></Cell>`
    )
    .join('');

  // Data rows
  const dataRowsXml = data
    .map((row, index) => {
      const rowStyle = index % 2 === 0 ? 'RowEven' : 'RowOdd';
      const cellsXml = columns
        .map((col) => {
          const val = row[col.key];
          if (val === undefined || val === null) {
            return `<Cell ss:StyleID="${rowStyle}"><Data ss:Type="String">-</Data></Cell>`;
          }

          if (col.format === 'number') {
            const numVal = Number(val);
            return isNaN(numVal)
              ? `<Cell ss:StyleID="${rowStyle}"><Data ss:Type="String">${escapeXml(String(val))}</Data></Cell>`
              : `<Cell ss:StyleID="${rowStyle}Number"><Data ss:Type="Number">${numVal}</Data></Cell>`;
          }

          if (col.format === 'currency') {
            const numVal = Number(val);
            return isNaN(numVal)
              ? `<Cell ss:StyleID="${rowStyle}"><Data ss:Type="String">${escapeXml(String(val))}</Data></Cell>`
              : `<Cell ss:StyleID="${rowStyle}Currency"><Data ss:Type="Number">${numVal}</Data></Cell>`;
          }

          return `<Cell ss:StyleID="${rowStyle}"><Data ss:Type="String">${escapeXml(String(val))}</Data></Cell>`;
        })
        .join('');
      return `<Row>${cellsXml}</Row>`;
    })
    .join('');

  // Full XML Spreadsheet 2003 content
  const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center"/>
   <Borders/>
   <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="11" ss:Color="#000000"/>
  </Style>
  <Style ss:ID="Title">
   <Font ss:FontName="Calibri" ss:Size="16" ss:Bold="1" ss:Color="#2b1233"/>
   <Alignment ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="Subtitle">
   <Font ss:FontName="Calibri" ss:Size="11" ss:Italic="1" ss:Color="#6f5569"/>
  </Style>
  <Style ss:ID="FilterHeader">
   <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#d61c5d"/>
  </Style>
  <Style ss:ID="FilterVal">
   <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#2b1233"/>
  </Style>
  <Style ss:ID="Header">
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#2b1233" ss:Pattern="Solid"/>
   <Alignment ss:Vertical="Center" ss:Horizontal="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#d61c5d"/>
   </Borders>
  </Style>
  <Style ss:ID="RowEven">
   <Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#EEEEEE"/>
   </Borders>
  </Style>
  <Style ss:ID="RowOdd">
   <Interior ss:Color="#FFF7F9" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#EEEEEE"/>
   </Borders>
  </Style>
  <Style ss:ID="RowEvenNumber">
   <Alignment ss:Horizontal="Right"/>
   <NumberFormat ss:Format="#,##0"/>
   <Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/>
   <Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#EEEEEE"/></Borders>
  </Style>
  <Style ss:ID="RowOddNumber">
   <Alignment ss:Horizontal="Right"/>
   <NumberFormat ss:Format="#,##0"/>
   <Interior ss:Color="#FFF7F9" ss:Pattern="Solid"/>
   <Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#EEEEEE"/></Borders>
  </Style>
  <Style ss:ID="RowEvenCurrency">
   <Alignment ss:Horizontal="Right"/>
   <NumberFormat ss:Format="[$₹-4009] #,##0.00"/>
   <Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/>
   <Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#EEEEEE"/></Borders>
  </Style>
  <Style ss:ID="RowOddCurrency">
   <Alignment ss:Horizontal="Right"/>
   <NumberFormat ss:Format="[$₹-4009] #,##0.00"/>
   <Interior ss:Color="#FFF7F9" ss:Pattern="Solid"/>
   <Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#EEEEEE"/></Borders>
  </Style>
 </Styles>
 <Worksheet ss:Name="Report">
  <Table>
   <Row>
    <Cell ss:StyleID="Title"><Data ss:Type="String">${escapeXml(title)}</Data></Cell>
   </Row>
   ${
     subtitle
       ? `<Row><Cell ss:StyleID="Subtitle"><Data ss:Type="String">${escapeXml(subtitle)} • Generated: ${new Date().toLocaleString()}</Data></Cell></Row>`
       : `<Row><Cell ss:StyleID="Subtitle"><Data ss:Type="String">Generated: ${new Date().toLocaleString()}</Data></Cell></Row>`
   }
   ${filterRowsXml}
   <Row></Row>
   <Row>${headerCellsXml}</Row>
   ${dataRowsXml}
  </Table>
 </Worksheet>
</Workbook>`;

  const blob = new Blob([xmlContent], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  triggerDownload(blob, cleanFilename);
}

/**
 * Exports all database tables into a single multi-sheet Excel (.xls) workbook.
 * Each database table is placed on its own named sheet with formatted headers.
 */
export function exportAllTablesToExcel(
  tables: Record<string, Array<Record<string, any>>>,
  filenamePrefix = 'melt_database_all_tables_backup'
): void {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const cleanFilename = `${filenamePrefix}_${timestamp}.xls`;

  const commonStylesXml = `
  <Styles>
   <Style ss:ID="Default" ss:Name="Normal">
    <Alignment ss:Vertical="Center"/>
    <Borders/>
    <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="11" ss:Color="#000000"/>
   </Style>
   <Style ss:ID="Title">
    <Font ss:FontName="Calibri" ss:Size="15" ss:Bold="1" ss:Color="#2b1233"/>
    <Alignment ss:Vertical="Center"/>
   </Style>
   <Style ss:ID="Subtitle">
    <Font ss:FontName="Calibri" ss:Size="10" ss:Italic="1" ss:Color="#6f5569"/>
   </Style>
   <Style ss:ID="Header">
    <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
    <Interior ss:Color="#2b1233" ss:Pattern="Solid"/>
    <Alignment ss:Vertical="Center" ss:Horizontal="Center"/>
    <Borders>
     <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#d61c5d"/>
    </Borders>
   </Style>
   <Style ss:ID="RowEven">
    <Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/>
    <Borders>
     <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#EEEEEE"/>
    </Borders>
   </Style>
   <Style ss:ID="RowOdd">
    <Interior ss:Color="#FFF7F9" ss:Pattern="Solid"/>
    <Borders>
     <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#EEEEEE"/>
    </Borders>
   </Style>
   <Style ss:ID="RowEvenNumber">
    <Alignment ss:Horizontal="Right"/>
    <NumberFormat ss:Format="#,##0.##"/>
    <Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/>
    <Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#EEEEEE"/></Borders>
   </Style>
   <Style ss:ID="RowOddNumber">
    <Alignment ss:Horizontal="Right"/>
    <NumberFormat ss:Format="#,##0.##"/>
    <Interior ss:Color="#FFF7F9" ss:Pattern="Solid"/>
    <Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#EEEEEE"/></Borders>
   </Style>
  </Styles>
  `;

  // Worksheets for each table
  const worksheetsXml = Object.entries(tables).map(([tableName, rows]) => {
    const sheetName = tableName.slice(0, 31).replace(/[:\\/?*\[\]]/g, '_');
    const headers = rows && rows.length > 0 ? Object.keys(rows[0]) : ['status', 'note'];
    const headerCells = headers
      .map((h) => `<Cell ss:StyleID="Header"><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`)
      .join('');

    let dataRowsXml = '';
    if (!rows || rows.length === 0) {
      dataRowsXml = `<Row><Cell ss:StyleID="RowEven"><Data ss:Type="String">No records</Data></Cell><Cell ss:StyleID="RowEven"><Data ss:Type="String">Table is currently empty</Data></Cell></Row>`;
    } else {
      dataRowsXml = rows
        .map((row, idx) => {
          const rowStyle = idx % 2 === 0 ? 'RowEven' : 'RowOdd';
          const cells = headers
            .map((h) => {
              const val = row[h];
              if (val === undefined || val === null) {
                return `<Cell ss:StyleID="${rowStyle}"><Data ss:Type="String">-</Data></Cell>`;
              }
              if (typeof val === 'number') {
                return `<Cell ss:StyleID="${rowStyle}Number"><Data ss:Type="Number">${val}</Data></Cell>`;
              }
              if (typeof val === 'boolean') {
                return `<Cell ss:StyleID="${rowStyle}"><Data ss:Type="String">${val ? 'TRUE' : 'FALSE'}</Data></Cell>`;
              }
              if (typeof val === 'object') {
                return `<Cell ss:StyleID="${rowStyle}"><Data ss:Type="String">${escapeXml(JSON.stringify(val))}</Data></Cell>`;
              }
              return `<Cell ss:StyleID="${rowStyle}"><Data ss:Type="String">${escapeXml(String(val))}</Data></Cell>`;
            })
            .join('');
          return `<Row>${cells}</Row>`;
        })
        .join('');
    }

    return `
  <Worksheet ss:Name="${escapeXml(sheetName)}">
   <Table>
    <Row>
     <Cell ss:StyleID="Title"><Data ss:Type="String">Melt Database Backup: ${escapeXml(tableName)}</Data></Cell>
    </Row>
    <Row>
     <Cell ss:StyleID="Subtitle"><Data ss:Type="String">Total Rows: ${rows ? rows.length : 0} • Backup Timestamp: ${new Date().toLocaleString()}</Data></Cell>
    </Row>
    <Row></Row>
    <Row>${headerCells}</Row>
    ${dataRowsXml}
   </Table>
  </Worksheet>`;
  }).join('\n');

  const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
  ${commonStylesXml}
  ${worksheetsXml}
</Workbook>`;

  const blob = new Blob([xmlContent], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  triggerDownload(blob, cleanFilename);
}

/**
 * Generates and triggers the native browser print/PDF dialog with a styled report document.
 * Universal across all browsers without heavy external bundle dependencies.
 */
export function exportToPdf({
  filename: _filename,
  title,
  subtitle,
  filterSummary,
  columns,
  data,
}: ExportOptions): void {
  const activeFilters = filterSummary
    ? Object.entries(filterSummary).filter(
        ([_, val]) => val !== undefined && val !== null && val !== '' && val !== 'ALL'
      )
    : [];

  const filterHtml =
    activeFilters.length > 0
      ? `<div style="margin-bottom: 16px; padding: 10px 14px; background: #fff0f5; border: 1px solid #f4d3dd; border-radius: 8px; font-size: 12px; color: #2b1233;">
          <strong style="color: #d61c5d; margin-right: 8px;">Applied Filters:</strong>
          ${activeFilters.map(([k, v]) => `<span style="display: inline-block; background: #ffffff; padding: 2px 8px; border-radius: 4px; margin-right: 6px; border: 1px solid #ffd1dc;"><strong>${escapeHtml(k)}:</strong> ${escapeHtml(String(v))}</span>`).join('')}
         </div>`
      : '';

  const tableHeaderHtml = columns
    .map(
      (col) =>
        `<th style="padding: 10px 12px; background: #2b1233; color: #ffffff; font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 2px solid #d61c5d; text-align: ${
          col.format === 'currency' || col.format === 'number' ? 'right' : 'left'
        };">${escapeHtml(col.header)}</th>`
    )
    .join('');

  const tableRowsHtml = data
    .map((row, idx) => {
      const bg = idx % 2 === 0 ? '#ffffff' : '#fff9fa';
      const cells = columns
        .map((col) => {
          const val = row[col.key];
          let formattedVal = '-';
          if (val !== undefined && val !== null) {
            if (col.format === 'currency') {
              formattedVal = `₹${Number(val).toFixed(2)}`;
            } else if (col.format === 'number') {
              formattedVal = String(val);
            } else {
              formattedVal = String(val);
            }
          }
          const align = col.format === 'currency' || col.format === 'number' ? 'right' : 'left';
          return `<td style="padding: 8px 12px; border-bottom: 1px solid #f0e4ea; font-size: 12px; color: #2b1233; text-align: ${align};">${escapeHtml(formattedVal)}</td>`;
        })
        .join('');
      return `<tr style="background: ${bg};">${cells}</tr>`;
    })
    .join('');

  const printHtml = `<!DOCTYPE html>
<html>
<head>
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: auto; margin: 15mm; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 20px;
      color: #2b1233;
      background: #ffffff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .header-container {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      border-bottom: 3px solid #d61c5d;
      padding-bottom: 14px;
      margin-bottom: 16px;
    }
    .brand-title {
      font-size: 24px;
      font-weight: 800;
      color: #2b1233;
      margin: 0 0 4px 0;
    }
    .brand-subtitle {
      font-size: 13px;
      color: #6f5569;
      margin: 0;
    }
    .meta-box {
      text-align: right;
      font-size: 11px;
      color: #6f5569;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
    }
    .footer-note {
      margin-top: 24px;
      border-top: 1px solid #f0e4ea;
      padding-top: 12px;
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: #6f5569;
    }
  </style>
</head>
<body>
  <div class="header-container">
    <div>
      <h1 class="brand-title">🍧 IceCream Melt</h1>
      <p class="brand-subtitle">${escapeHtml(title)}${subtitle ? ` • ${escapeHtml(subtitle)}` : ''}</p>
    </div>
    <div class="meta-box">
      <div>Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}</div>
      <div>Total Records: ${data.length}</div>
    </div>
  </div>

  ${filterHtml}

  <table>
    <thead>
      <tr>${tableHeaderHtml}</tr>
    </thead>
    <tbody>
      ${tableRowsHtml}
    </tbody>
  </table>

  <div class="footer-note">
    <span>Melt Gelato Management Platform • Confidential</span>
    <span>Page 1 of 1</span>
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 200);
    };
  </script>
</body>
</html>`;

  // Create an invisible iframe to print without redirecting or creating jarring popups
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (doc) {
    doc.open();
    doc.write(printHtml);
    doc.close();
    setTimeout(() => {
      document.body.removeChild(iframe);
    }, 60000);
  }
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
