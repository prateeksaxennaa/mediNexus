import fs from 'fs';
import path from 'path';
import { supabaseAdmin } from '../config/supabase.js';

interface MedicineRow {
  id: string;
  medicine_name: string;
  composition: string | null;
  therapeutic_class: string | null;
  chemical_class: string | null;
  uses: string | null;
  side_effects: string | null;
  substitutes: string | null;
  description: string | null;
  image_url: string | null;
}

// Simple RFC 4180 CSV line parser
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (c === '"' && next === '"') {
        currentField += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        currentField += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        currentRow.push(currentField);
        currentField = '';
      } else if (c === '\r') {
        // ignore
      } else if (c === '\n') {
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
      } else {
        currentField += c;
      }
    }
  }

  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return rows;
}

async function seed() {
  const csvPath = path.resolve(__dirname, '../../../medicines_schema_500.csv');
  if (!fs.existsSync(csvPath)) {
    console.error('CSV file not found at:', csvPath);
    process.exit(1);
  }

  console.log('Reading medicines CSV from:', csvPath);
  const rawText = fs.readFileSync(csvPath, 'utf-8');
  const parsed = parseCSV(rawText);

  const [headers, ...dataRows] = parsed;
  console.log(`Parsed ${dataRows.length} rows.`);

  const idIdx = headers.indexOf('id');
  const nameIdx = headers.indexOf('medicine_name');
  const compIdx = headers.indexOf('composition');
  const therIdx = headers.indexOf('therapeutic_class');
  const chemIdx = headers.indexOf('chemical_class');
  const usesIdx = headers.indexOf('uses');
  const sideIdx = headers.indexOf('side_effects');
  const subsIdx = headers.indexOf('substitutes');
  const descIdx = headers.indexOf('description');
  const imgIdx = headers.indexOf('image_url');

  const records: MedicineRow[] = [];
  for (const row of dataRows) {
    if (!row[nameIdx]) continue;
    records.push({
      id: row[idIdx],
      medicine_name: row[nameIdx],
      composition: row[compIdx] || null,
      therapeutic_class: row[therIdx] || null,
      chemical_class: row[chemIdx] || null,
      uses: row[usesIdx] || null,
      side_effects: row[sideIdx] || null,
      substitutes: row[subsIdx] || null,
      description: row[descIdx] || null,
      image_url: row[imgIdx] || null,
    });
  }

  console.log(`Uploading ${records.length} medicines in batches of 100...`);
  const batchSize = 100;
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const { error } = await (supabaseAdmin as any).from('medicines').upsert(batch, { onConflict: 'id' });
    if (error) {
      console.error(`Error inserting batch ${i / batchSize + 1}:`, error.message);
    } else {
      console.log(`  ✓ Inserted batch ${Math.floor(i / batchSize) + 1} (${Math.min(i + batchSize, records.length)}/${records.length})`);
    }
  }

  console.log('\n Medicines seeded successfully!');
}

seed().catch(err => {
  console.error('Seed script failed:', err);
  process.exit(1);
});
