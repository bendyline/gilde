window.dataAnalysisSampleFiles = [
    { path: 'sales/quarterly-sales.csv', size: 12480, mtime: 1791849600000 },
    { path: 'sales/revenue-plan.xlsx', size: 48210, mtime: 1791763200000 },
    { path: 'customers.json', size: 22680, mtime: 1791676800000 },
    { path: 'research/survey-responses.tsv', size: 8640, mtime: 1791590400000 },
    { path: 'archive/orders.parquet', size: 3145728, mtime: 1791504000000 },
    { path: 'reports/quarterly-summary.pdf', size: 128040, mtime: 1791849600000 },
  ];
const demoMode = (window.gezel || window.makeDemoGezel({ page: { typeName: 'Data Analysis' }, existingPaths: window.dataAnalysisSampleFiles.map(file => file.path) })).page.mode === 'demo';
