window.dataAnalysisSampleFiles = [
    { path: 'sales/quarterly-sales.csv', size: 12480, mtime: 1791849600000 },
    { path: 'sales/revenue-plan.xlsx', size: 48210, mtime: 1791763200000 },
    { path: 'customers.json', size: 22680, mtime: 1791676800000 },
    { path: 'research/survey-responses.tsv', size: 8640, mtime: 1791590400000 },
    { path: 'archive/orders.parquet', size: 3145728, mtime: 1791504000000 },
    { path: 'reports/quarterly-summary.pdf', size: 128040, mtime: 1791849600000 },
  ];
// The sample table behind the page's labeled sample summaries and the sample conversation.
window.dataAnalysisSampleRows = [
    { month: '2026-07-01', region: 'North', revenue: 7480, orders: 94 },
    { month: '2026-07-01', region: 'South', revenue: 5000, orders: 62 },
    { month: '2026-08-01', region: 'North', revenue: 8360, orders: 105 },
    { month: '2026-08-01', region: 'South', revenue: 6200, orders: 77 },
    { month: '2026-09-01', region: 'North', revenue: 9240, orders: 116 },
    { month: '2026-09-01', region: 'South', revenue: 7000, orders: 87 },
  ];
const demoMode = (window.gezel || window.makeDemoGezel({
  page: { typeName: 'Data Analysis' },
  existingPaths: window.dataAnalysisSampleFiles.map(file => file.path),
  data: {
    'sales/quarterly-sales.csv': () => ['month,region,revenue,orders']
      .concat(window.dataAnalysisSampleRows.map(row => [row.month, row.region, row.revenue, row.orders].join(',')))
      .join('\n') + '\n',
  },
  chat: window.demoChat,
})).page.mode === 'demo';
