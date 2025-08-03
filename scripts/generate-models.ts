import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Supabase configuration
const SUPABASE_URL = 'http://127.0.0.1:54321'; // Local development URL
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'; // Default local service key

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

interface TableInfo {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
  is_primary_key: boolean;
  foreign_table?: string;
  foreign_column?: string;
}

interface EnumInfo {
  enum_name: string;
  enum_values: string[];
}

async function getTableSchema(): Promise<TableInfo[]> {
  console.log('Fetching table schema from Supabase...');
  
  const { data, error } = await supabase.rpc('get_table_schema');
  
  if (error) {
    console.error('Error fetching table schema:', error);
    
    // Fallback: query information_schema directly
    const { data: fallbackData, error: fallbackError } = await supabase
      .from('information_schema.columns')
      .select(`
        table_name,
        column_name,
        data_type,
        is_nullable,
        column_default
      `)
      .eq('table_schema', 'public')
      .order('table_name')
      .order('ordinal_position');
    
    if (fallbackError) {
      throw new Error(`Failed to fetch schema: ${fallbackError.message}`);
    }
    
    return fallbackData || [];
  }
  
  return data || [];
}

async function getEnums(): Promise<EnumInfo[]> {
  console.log('Fetching enums from Supabase...');
  
  const { data, error } = await supabase
    .from('pg_type')
    .select(`
      typname,
      pg_enum!inner(enumlabel)
    `)
    .eq('typtype', 'e');
  
  if (error) {
    console.warn('Could not fetch enums:', error.message);
    return [];
  }
  
  // Group enum values by type name
  const enumMap = new Map<string, string[]>();
  
  (data || []).forEach((row: any) => {
    if (!enumMap.has(row.typname)) {
      enumMap.set(row.typname, []);
    }
    enumMap.get(row.typname)!.push(row.pg_enum.enumlabel);
  });
  
  return Array.from(enumMap.entries()).map(([enum_name, enum_values]) => ({
    enum_name,
    enum_values
  }));
}

function mapPostgresTypeToTypeScript(dataType: string, isNullable: boolean = false): string {
  const nullable = isNullable ? ' | null' : '';
  
  switch (dataType.toLowerCase()) {
    case 'text':
    case 'varchar':
    case 'char':
    case 'character varying':
    case 'uuid':
      return `string${nullable}`;
    case 'integer':
    case 'int4':
    case 'bigint':
    case 'int8':
    case 'smallint':
    case 'int2':
    case 'numeric':
    case 'decimal':
    case 'real':
    case 'double precision':
    case 'float4':
    case 'float8':
      return `number${nullable}`;
    case 'boolean':
    case 'bool':
      return `boolean${nullable}`;
    case 'timestamp':
    case 'timestamptz':
    case 'timestamp with time zone':
    case 'timestamp without time zone':
    case 'date':
    case 'time':
      return `string${nullable}`; // ISO string format
    case 'json':
    case 'jsonb':
      return `Json${nullable}`;
    case 'bytea':
      return `Uint8Array${nullable}`;
    case 'array':
      return `unknown[]${nullable}`;
    default:
      // Handle enum types and custom types
      if (dataType.includes('enum') || dataType.startsWith('user_')) {
        return `Database['public']['Enums']['${dataType}']${nullable}`;
      }
      return `unknown${nullable}`;
  }
}

function generateDatabaseTypes(tables: TableInfo[], enums: EnumInfo[]): string {
  console.log('Generating database types...');
  
  const tablesByName = new Map<string, TableInfo[]>();
  
  // Group columns by table
  tables.forEach(table => {
    if (!tablesByName.has(table.table_name)) {
      tablesByName.set(table.table_name, []);
    }
    tablesByName.get(table.table_name)!.push(table);
  });
  
  let output = `export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {\n`;

  // Generate table types
  for (const [tableName, columns] of tablesByName) {
    output += `      ${tableName}: {
        Row: {\n`;
    
    columns.forEach(col => {
      const tsType = mapPostgresTypeToTypeScript(col.data_type, col.is_nullable === 'YES');
      output += `          ${col.column_name}: ${tsType}\n`;
    });
    
    output += `        }
        Insert: {\n`;
    
    columns.forEach(col => {
      const isOptional = col.is_nullable === 'YES' || col.column_default !== null || col.is_primary_key;
      const tsType = mapPostgresTypeToTypeScript(col.data_type, col.is_nullable === 'YES');
      output += `          ${col.column_name}${isOptional ? '?' : ''}: ${tsType}\n`;
    });
    
    output += `        }
        Update: {\n`;
    
    columns.forEach(col => {
      const tsType = mapPostgresTypeToTypeScript(col.data_type, col.is_nullable === 'YES');
      output += `          ${col.column_name}?: ${tsType}\n`;
    });
    
    output += `        }
      }\n`;
  }
  
  output += `    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {\n`;

  // Generate enum types
  enums.forEach(enumInfo => {
    const values = enumInfo.enum_values.map(v => `'${v}'`).join(' | ');
    output += `      ${enumInfo.enum_name}: ${values}\n`;
  });

  output += `    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// Helper types for application
`;

  // Generate helper types for each table
  for (const tableName of tablesByName.keys()) {
    const pascalCaseName = tableName.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join('');
    
    output += `export type ${pascalCaseName} = Database['public']['Tables']['${tableName}']['Row']
export type ${pascalCaseName}Insert = Database['public']['Tables']['${tableName}']['Insert']
export type ${pascalCaseName}Update = Database['public']['Tables']['${tableName}']['Update']

`;
  }

  // Generate enum helper types
  enums.forEach(enumInfo => {
    const pascalCaseName = enumInfo.enum_name.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join('');
    
    output += `export type ${pascalCaseName} = Database['public']['Enums']['${enumInfo.enum_name}']
`;
  });

  return output;
}

function generateModels(tables: TableInfo[]): string {
  console.log('Generating enhanced models...');
  
  const tablesByName = new Map<string, TableInfo[]>();
  
  // Group columns by table
  tables.forEach(table => {
    if (!tablesByName.has(table.table_name)) {
      tablesByName.set(table.table_name, []);
    }
    tablesByName.get(table.table_name)!.push(table);
  });
  
  let output = `import type { Database } from './database.types';

// Base database types
`;

  // Generate base row types
  for (const tableName of tablesByName.keys()) {
    const pascalCaseName = tableName.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join('');
    
    output += `export type ${pascalCaseName}Row = Database['public']['Tables']['${tableName}']['Row'];
`;
  }

  output += `
// Enhanced model types with relationships and computed properties
`;

  // Generate enhanced interfaces
  for (const [tableName, columns] of tablesByName) {
    const pascalCaseName = tableName.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join('');
    
    output += `export interface ${pascalCaseName} extends ${pascalCaseName}Row {
  // Relationships can be added here based on foreign keys
`;
    
    // Look for foreign key relationships
    const foreignKeys = columns.filter(col => col.foreign_table);
    foreignKeys.forEach(fk => {
      if (fk.foreign_table) {
        const relatedModel = fk.foreign_table.split('_').map(word => 
          word.charAt(0).toUpperCase() + word.slice(1)
        ).join('');
        output += `  ${fk.foreign_table}?: ${relatedModel};\n`;
      }
    });
    
    // Add reverse relationships (one-to-many)
    for (const [otherTable, otherColumns] of tablesByName) {
      if (otherTable !== tableName) {
        const fkToThisTable = otherColumns.find(col => col.foreign_table === tableName);
        if (fkToThisTable) {
          const relatedModel = otherTable.split('_').map(word => 
            word.charAt(0).toUpperCase() + word.slice(1)
          ).join('');
          output += `  ${otherTable}?: ${relatedModel}[];\n`;
        }
      }
    }
    
    output += `  
  // Computed properties can be added here
}

`;
  }

  // Generate relationship types
  output += `// Extended types with full relationships for complex queries
`;

  for (const tableName of tablesByName.keys()) {
    const pascalCaseName = tableName.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join('');
    
    output += `export interface ${pascalCaseName}WithRelations extends ${pascalCaseName} {
  // Add specific relationship requirements here
}

`;
  }

  return output;
}

async function main() {
  try {
    console.log('Starting schema generation...');
    
    // Fetch schema information
    const [tables, enums] = await Promise.all([
      getTableSchema(),
      getEnums()
    ]);
    
    console.log(`Found ${tables.length} columns across ${new Set(tables.map(t => t.table_name)).size} tables`);
    console.log(`Found ${enums.length} enums`);
    
    // Generate database types
    const databaseTypes = generateDatabaseTypes(tables, enums);
    const typesPath = path.join(__dirname, '../src/types/database.types.ts');
    fs.writeFileSync(typesPath, databaseTypes);
    console.log(`✅ Generated database types: ${typesPath}`);
    
    // Generate enhanced models
    const models = generateModels(tables);
    const modelsPath = path.join(__dirname, '../src/types/models.ts');
    fs.writeFileSync(modelsPath, models);
    console.log(`✅ Generated enhanced models: ${modelsPath}`);
    
    console.log('✅ Schema generation completed successfully!');
    
  } catch (error) {
    console.error('❌ Error generating schema:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { main as generateModels };