import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Use local Supabase instance
const SUPABASE_URL = 'http://127.0.0.1:54321';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function readCurrentTables() {
  console.log('Reading tables from Supabase...');
  
  try {
    // Get all table names from information_schema
    const { data: tableData, error: tableError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .neq('table_type', 'VIEW');
    
    if (tableError) {
      console.error('Error fetching tables:', tableError);
      return;
    }
    
    console.log('Found tables:', tableData?.map(t => t.table_name));
    
    // For each table, get column information
    const allColumns: any[] = [];
    
    for (const table of tableData || []) {
      const { data: columnData, error: columnError } = await supabase
        .from('information_schema.columns')
        .select(`
          table_name,
          column_name,
          data_type,
          is_nullable,
          column_default,
          ordinal_position
        `)
        .eq('table_schema', 'public')
        .eq('table_name', table.table_name)
        .order('ordinal_position');
      
      if (columnError) {
        console.error(`Error fetching columns for ${table.table_name}:`, columnError);
        continue;
      }
      
      allColumns.push(...(columnData || []));
    }
    
    console.log(`Total columns found: ${allColumns.length}`);
    
    // Group by table and generate TypeScript types
    const tablesByName = new Map();
    allColumns.forEach(col => {
      if (!tablesByName.has(col.table_name)) {
        tablesByName.set(col.table_name, []);
      }
      tablesByName.get(col.table_name).push(col);
    });
    
    // Generate a simple database types file
    let output = `// Generated from Supabase schema on ${new Date().toISOString()}

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
`;

    for (const [tableName, columns] of tablesByName) {
      output += `      ${tableName}: {
        Row: {
`;
      
      for (const col of columns) {
        const tsType = mapPostgresToTS(col.data_type, col.is_nullable === 'YES');
        output += `          ${col.column_name}: ${tsType}
`;
      }
      
      output += `        }
        Insert: {
`;
      
      for (const col of columns) {
        const isOptional = col.is_nullable === 'YES' || col.column_default !== null;
        const tsType = mapPostgresToTS(col.data_type, col.is_nullable === 'YES');
        output += `          ${col.column_name}${isOptional ? '?' : ''}: ${tsType}
`;
      }
      
      output += `        }
        Update: {
`;
      
      for (const col of columns) {
        const tsType = mapPostgresToTS(col.data_type, col.is_nullable === 'YES');
        output += `          ${col.column_name}?: ${tsType}
`;
      }
      
      output += `        }
      }
`;
    }

    output += `    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// Helper types
`;

    for (const tableName of tablesByName.keys()) {
      const pascalCase = toPascalCase(tableName);
      output += `export type ${pascalCase} = Database['public']['Tables']['${tableName}']['Row']
export type ${pascalCase}Insert = Database['public']['Tables']['${tableName}']['Insert']
export type ${pascalCase}Update = Database['public']['Tables']['${tableName}']['Update']

`;
    }

    // Write to file
    const outputPath = path.join(__dirname, '../src/types/database.types.ts');
    fs.writeFileSync(outputPath, output);
    console.log(`✅ Database types written to: ${outputPath}`);
    
    // Also generate simple models
    generateSimpleModels(tablesByName);
    
  } catch (error) {
    console.error('Error:', error);
  }
}

function mapPostgresToTS(dataType: string, isNullable: boolean): string {
  const nullable = isNullable ? ' | null' : '';
  
  switch (dataType.toLowerCase()) {
    case 'text':
    case 'varchar':
    case 'character varying':
    case 'uuid':
    case 'character':
      return `string${nullable}`;
    case 'integer':
    case 'bigint':
    case 'smallint':
    case 'numeric':
    case 'real':
    case 'double precision':
      return `number${nullable}`;
    case 'boolean':
      return `boolean${nullable}`;
    case 'timestamp with time zone':
    case 'timestamp without time zone':
    case 'date':
    case 'time':
      return `string${nullable}`;
    case 'json':
    case 'jsonb':
      return `Json${nullable}`;
    case 'bytea':
      return `string${nullable}`;
    default:
      return `unknown${nullable}`;
  }
}

function toPascalCase(str: string): string {
  return str.split('_').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  ).join('');
}

function generateSimpleModels(tablesByName: Map<string, any[]>) {
  console.log('Generating simple models...');
  
  let output = `import type { Database } from './database.types';

// Base types
`;

  for (const tableName of tablesByName.keys()) {
    const pascalCase = toPascalCase(tableName);
    output += `export type ${pascalCase}Row = Database['public']['Tables']['${tableName}']['Row'];
`;
  }

  output += `
// Enhanced models with potential relationships
`;

  for (const tableName of tablesByName.keys()) {
    const pascalCase = toPascalCase(tableName);
    output += `export interface ${pascalCase} extends ${pascalCase}Row {
  // Add relationships and computed properties as needed
}

`;
  }

  const modelsPath = path.join(__dirname, '../src/types/models.ts');
  fs.writeFileSync(modelsPath, output);
  console.log(`✅ Models written to: ${modelsPath}`);
}

// Run the script
readCurrentTables().catch(console.error);