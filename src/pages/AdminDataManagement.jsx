import { useState } from 'react';
import { useAuth } from '../components/AuthContext';
import { logAudit } from '../hooks/useAudit';
import { supabase } from '../lib/supabase';
import { useToast } from '../components/ToastContext';
import Papa from 'papaparse';

const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzY2p5cWdmbmNxb3FxZWdyY2p3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjY2OTgxNSwiZXhwIjoyMDg4MjQ1ODE1fQ.OCe9Kx7CJkdgukE_7-dBmMpF24Tqmmz0Vo7OjmdSQ6k';
const SUPABASE_URL = 'https://uscjyqgfncqoqqegrcjw.supabase.co';

// â”€â”€ Template definitions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const TEMPLATES = {
  accounts: {
    version: 'v1',
    label: 'Accounts',
    filename: 'MedEx_Accounts_Template_v1.csv',
    requiredCols: ['Account', 'Region'],
    optionalCols: ['Status', 'Rep', 'Item Catalog'],
    description: 'Account name, region, status, rep assignment and catalog',
    csvContent: [
      '#MedEx_Template,accounts,v1',
      'Account,Region,Status,Rep,Item Catalog',
      'Example Account,Austin,Open,Jane Smith,Claimsoft Catalog',
    ].join('\n'),
  },
  users: {
    version: 'v1',
    label: 'Users',
    filename: 'MedEx_Users_Template_v1.csv',
    requiredCols: ['EmailAddress'],
    optionalCols: ['FirstName', 'LastName', 'FullName', 'Role', 'Region', 'Status'],
    description: 'User name, email, role, region and status',
    csvContent: [
      '#MedEx_Template,users,v1',
      'FirstName,LastName,FullName,EmailAddress,Role,Region,Status',
      'Jane,Smith,Jane Smith,jsmith@medexpsi.com,rep,Austin,Active',
    ].join('\n'),
  },
  claimsoft_catalog: {
    version: 'v1',
    label: 'Claimsoft Catalog',
    filename: 'MedEx_ClaimsoftCatalog_Template_v1.csv',
    requiredCols: ['ItemNumber', 'Description'],
    optionalCols: [
      'ItemCategory','ItemType','ProductFamily','Size','Side',
      'Barcode1','Barcode2','NDCNumber','VendorPartNumber','VendorName',
      'VendorDescription','Manufacturer','CostPerItem','PurchaseUOM',
      'ItemsPerUOM','BillableItem','HCPCS','Mod1','Mod2','Mod3','Mod4',
      'SellingPrice','IsTaxable','ParLevel','MinOrderQuantity',
      'AllowNegQty','IsSerialized','IsAvailable','DiscontinueDate',
    ],
    description: 'Claimsoft item number, description, vendor, barcodes, pricing and clinical codes',
    csvContent: [
      '#MedEx_Template,claimsoft_catalog,v1',
      'ItemNumber,ItemCategory,ItemType,ProductFamily,Description,Size,Side,Barcode1,Barcode2,NDCNumber,AllowNegQty,IsSerialized,SerialNumber,TransferCanCreatePO,VendorPartNumber,VendorName,VendorDescription,Manufacturer,CostPerItem,PurchaseUOM,CostPerUOM,ItemsPerUOM,LeadTime,BillableItem,HCPCS,Mod1,Mod2,Mod3,Mod4,SellingPrice,RentalPrice,UsedPrice,IsTaxable,IsOxygenItem,NonMedicareItem,Warehouse,Location,Bin,QOH,IsAvailable,ParLevel,MinOrderQuantity,Devices,CMN,NewItemNumber,Instructions,RequiredForms,LinkText,QRCodeURL,DiscontinueDate',
      'CS-001,Category,Type,Family,Example Item Description,Medium,,123456,,,,,,,,Claimsoft,Claimsoft Description,Claimsoft Mfg,10.00,EA,10.00,1,0,Yes,A4570,,,,,25.00,,,,,,,,,,1,1,0,5,,,,,,,',
    ].join('\n'),
  },
  edge_catalog: {
    version: 'v1',
    label: 'Account Edge',
    filename: 'MedEx_EdgeCatalog_Template_v1.csv',
    requiredCols: ['Item Number', 'Item Name'],
    optionalCols: [
      'Buy','Sell','Inventory','Description','Primary Vendor',
      'Vendor Item Number','Custom Field 3','Sell Unit Measure',
      'Selling Price','Standard Cost','Reorder Quantity','Minimum Level',
      'Brand','Inactive Item','Custom List 1','Custom List 2','Custom List 3',
    ],
    description: 'Account Edge item number, name, vendor, pricing and inventory levels',
    csvContent: [
      '#MedEx_Template,edge_catalog,v1',
      'Item Number,Item Name,Buy,Sell,Inventory,Asset Acct,Income Acct,Expense/COS Acct,Item Picture,Description,Use Desc. On Sale,Custom List 1,Custom List 2,Custom List 3,Custom Field 1,Custom Field 2,Custom Field 3,Primary Vendor,Vendor Item Number,Tax When Bought,Buy Unit Measure,# Items/Buy Unit,Reorder Quantity,Minimum Level,Selling Price,Sell Unit Measure,Tax When Sold,# Items/Sell Unit,Quantity Break 1,Quantity Break 2,Quantity Break 3,Quantity Break 4,Quantity Break 5,Price Level A Qty Break 1,Price Level B Qty Break 1,Price Level C Qty Break 1,Price Level D Qty Break 1,Price Level E Qty Break 1,Price Level F Qty Break 1,Price Level A Qty Break 2,Price Level B Qty Break 2,Price Level C Qty Break 2,Price Level D Qty Break 2,Price Level E Qty Break 2,Price Level F Qty Break 2,Price Level A Qty Break 3,Price Level B Qty Break 3,Price Level C Qty Break 3,Price Level D Qty Break 3,Price Level E Qty Break 3,Price Level F Qty Break 3,Price Level A Qty Break 4,Price Level B Qty Break 4,Price Level C Qty Break 4,Price Level D Qty Break 4,Price Level E Qty Break 4,Price Level F Qty Break 4,Price Level A Qty Break 5,Price Level B Qty Break 5,Price Level C Qty Break 5,Price Level D Qty Break 5,Price Level E Qty Break 5,Price Level F Qty Break 5,Inactive Item,Standard Cost,Sell Location,Buy Location,Brand,Weight,Unit of Weight,Web Description,Sold in Web Store,Web Store Price,Item Record ID,Track Serial Number,Warranty Applies when Sold,Warranty Period,Unit of Warranty Period,Kit Item',
      'EDG-001,Example Item Name,Yes,Yes,Yes,,,,,Example description,,,,,,,Custom Field 3 Value,Edge Vendor,EDG-VENDOR-001,,,,5,2,25.00,EA,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,No,20.00,,,,,,,,,,,,,,',
    ].join('\n'),
  },
  referral_sources: {
    version: 'v1',
    label: 'Claimsoft Referral',
    filename: 'MedEx_ClaimsoftReferral_Template_v1.csv',
    requiredCols: ['Referral Source Name'],
    optionalCols: ['Rep', 'Region'],
    description: 'Claimsoft referral source name, assigned rep and region',
    csvContent: [
      '#MedEx_Template,referral_sources,v1',
      'Referral Source Name,Rep,Region',
      'Example Referral Source,Jane Smith,Austin',
    ].join('\n'),
  },
};

const IMPORT_TYPES = [
  { key: 'accounts',          label: 'Accounts',             desc: 'Account name, region, status, rep, catalog' },
  { key: 'users',             label: 'Users',                desc: 'FirstName, LastName, Email, Role, Region' },
  { key: 'claimsoft_catalog', label: 'Claimsoft Catalog',    desc: 'ItemNumber, Description + 47 optional fields' },
  { key: 'edge_catalog',      label: 'Account Edge', desc: 'Item Number, Item Name + 74 optional fields' },
  { key: 'referral_sources',  label: 'Claimsoft Referral',   desc: 'Referral Source Name, Rep, Region' },
];

function parseVersionStamp(rawText, expectedType) {
  const firstLine = rawText.split('\n')[0].trim();
  if (!firstLine.startsWith('#MedEx_Template')) {
    return { valid: false, error: 'This file was not generated from a MedEx template. Please download the correct template and re-import.' };
  }
  const parts       = firstLine.replace('#MedEx_Template,', '').split(',');
  const fileType    = (parts[0] || '').trim();
  const fileVersion = (parts[1] || '').trim();
  const tmpl        = TEMPLATES[expectedType];
  if (fileType !== expectedType) {
    return { valid: false, error: 'Wrong template type. Expected "' + tmpl.label + '" template but received "' + fileType + '". Please use the correct template.' };
  }
  if (fileVersion !== tmpl.version) {
    return { valid: false, error: 'Outdated template version (received ' + fileVersion + ', expected ' + tmpl.version + '). Please download the latest template and re-import.' };
  }
  return { valid: true };
}

function validateRequiredCols(rows, importType) {
  if (!rows || rows.length === 0) return { valid: false, error: 'No data rows found in file.' };
  const required = TEMPLATES[importType]?.requiredCols || [];
  const cols      = Object.keys(rows[0]);
  const missing   = required.filter(r => !cols.includes(r));
  if (missing.length > 0) {
    return { valid: false, error: 'Missing required columns: ' + missing.join(', ') + '. Please check your template.' };
  }
  return { valid: true };
}

export default function AdminDataManagement() {
  const toast = useToast();
  const { profile } = useAuth();

  const [importType, setImportType]       = useState('accounts');
  const [file, setFile]                   = useState(null);
  const [rawText, setRawText]             = useState('');
  const [preview, setPreview]             = useState([]);
  const [importing, setImporting]         = useState(false);
  const [importResults, setImportResults] = useState(null);
  const [versionError, setVersionError]   = useState(null);

  function handleFile(e) {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f);
    setImportResults(null);
    setVersionError(null);
    setPreview([]);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      setRawText(text);

      const vCheck = parseVersionStamp(text, importType);
      if (!vCheck.valid) { setVersionError(vCheck.error); return; }

      const lines   = text.split('\n');
      const csvBody = lines.slice(1).join('\n');
      Papa.parse(csvBody, {
        header: true, skipEmptyLines: true,
        complete: (res) => {
          const colCheck = validateRequiredCols(res.data, importType);
          if (!colCheck.valid) { setVersionError(colCheck.error); return; }
          setPreview(res.data.slice(0, 5));
        }
      });
    };
    reader.readAsText(f);
  }

  function resetImport() {
    setFile(null); setRawText(''); setPreview([]);
    setImportResults(null); setVersionError(null);
  }

  function downloadTemplate(type) {
    const tmpl = TEMPLATES[type];
    if (!tmpl) return;
    const blob = new Blob([tmpl.csvContent], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = tmpl.filename; a.click();
    URL.revokeObjectURL(url);
  }

  async function runImport() {
    if (!file || !rawText) { toast.error('Please select a CSV file'); return; }
    if (versionError)       { toast.error('Fix template errors before importing'); return; }

    setImporting(true); setImportResults(null);

    const lines   = rawText.split('\n');
    const csvBody = lines.slice(1).join('\n');

    Papa.parse(csvBody, {
      header: true, skipEmptyLines: true,
      complete: async (res) => {
        const rows = res.data;
        let inserted = 0, updated = 0, errors = 0, errorDetails = [];

        try {

          // â”€â”€ ACCOUNTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
          if (importType === 'accounts') {
            for (const row of rows) {
              const name    = (row['Account']      || '').trim();
              const region  = (row['Region']       || '').trim();
              const status  = (row['Status']       || 'Open').trim();
              const repRaw  = (row['Rep']          || '').trim();
              const catalog = (row['Item Catalog'] || '').trim();
              if (!name) { errors++; errorDetails.push('Row skipped: missing Account name'); continue; }
              const catalogSource = catalog.toLowerCase().includes('edge') ? 'edge'
                : catalog.toLowerCase().includes('claimsoft') ? 'claimsoft' : null;
              const { data: regionData } = await supabase.from('regions').select('id').eq('name', region).maybeSingle();
              const { error } = await supabase.from('accounts').upsert({
                name,
                is_active:      status.toLowerCase() === 'open' || status.toLowerCase() === 'active',
                catalog_source: catalogSource,
                region_id:      regionData?.id || null,
                rep_name_raw:   repRaw || null,
              }, { onConflict: 'name' });
              if (error) { errors++; errorDetails.push(name + ': ' + error.message); }
              else inserted++;
            }
          }

          // â”€â”€ USERS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
          else if (importType === 'users') {
            for (const row of rows) {
              const email     = (row['EmailAddress'] || row['Email'] || '').trim();
              const firstName = (row['FirstName']    || '').trim();
              const lastName  = (row['LastName']     || '').trim();
              const fullName  = (row['FullName']     || (firstName + ' ' + lastName).trim()).trim();
              const role      = (row['Role']         || 'rep').trim().toLowerCase();
              const region    = (row['Region']       || '').trim();
              const status    = (row['Status']       || 'Active').trim();
              const isActive  = status.toLowerCase() === 'active' || status.toLowerCase() === 'open';
              if (!email) { errors++; errorDetails.push('Row skipped: missing EmailAddress'); continue; }

              try {
                // Step 1: Check Auth for existing user by email
                const listRes = await fetch(
                  SUPABASE_URL + '/auth/v1/admin/users?email=' + encodeURIComponent(email),
                  { headers: { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY } }
                );
                const listJson = await listRes.json();
                const authUsers = listJson.users || [];
                const existingAuth = authUsers.find(u => u.email?.toLowerCase() === email.toLowerCase());

                if (existingAuth) {
                  // Auth user exists â€” upsert profile
                  const { error: upErr } = await supabase.from('profiles').upsert({
                    id:        existingAuth.id,
                    full_name: fullName || null,
                    email,
                    role,
                    region:    region || null,
                    is_active: isActive,
                  }, { onConflict: 'id' });
                  if (upErr) { errors++; errorDetails.push(email + ' (profile upsert): ' + upErr.message); }
                  else updated++;
                } else {
                  // Brand new user â€” create in Auth
                  const createRes = await fetch(SUPABASE_URL + '/auth/v1/admin/users', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'apikey': SERVICE_KEY,
                      'Authorization': 'Bearer ' + SERVICE_KEY,
                    },
                    body: JSON.stringify({
                      email,
                      password: 'MedEx1234!',
                      email_confirm: true,
                      user_metadata: { full_name: fullName },
                    }),
                  });
                  const createJson = await createRes.json();
                  if (!createRes.ok) {
                    errors++;
                    errorDetails.push(email + ' (auth create): ' + (createJson.msg || createJson.message || JSON.stringify(createJson)));
                    continue;
                  }
                  // Insert profile row using new auth ID
                  const { error: profErr } = await supabase.from('profiles').insert({
                    id:        createJson.id,
                    full_name: fullName || null,
                    email,
                    role,
                    region:    region || null,
                    is_active: isActive,
                  });
                  if (profErr) {
                    errors++;
                    errorDetails.push(email + ' (profile insert): ' + profErr.message);
                  } else {
                    inserted++;
                  }
                }
              } catch (err) {
                errors++;
                errorDetails.push(email + ' (unexpected): ' + err.message);
              }
            }
          }

          // â”€â”€ CLAIMSOFT CATALOG â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
          else if (importType === 'claimsoft_catalog') {
            for (let i = 0; i < rows.length; i += 100) {
              const batch = rows.slice(i, i + 100).map(row => {
                const itemNumber = (row['ItemNumber'] || '').trim();
                if (!itemNumber) return null;
                const discontinue = (row['DiscontinueDate'] || '').trim();
                return {
                  item_number:        itemNumber,
                  description:        (row['Description']       || '').trim(),
                  primary_vendor:     (row['VendorName']         || row['Manufacturer'] || '').trim() || null,
                  catalog_source:     'claimsoft',
                  category:           (row['ItemCategory']       || '').trim() || null,
                  barcode1:           (row['Barcode1']           || '').trim() || null,
                  barcode2:           (row['Barcode2']           || '').trim() || null,
                  uom:                (row['ItemsPerUOM']         || '').trim() || null,
                  selling_price:      parseFloat(row['SellingPrice'])   || null,
                  standard_cost:      parseFloat(row['CostPerItem'])    || null,
                  hcpcs:              (row['HCPCS']              || '').trim() || null,
                  mod1:               (row['Mod1']               || '').trim() || null,
                  mod2:               (row['Mod2']               || '').trim() || null,
                  mod3:               (row['Mod3']               || '').trim() || null,
                  mod4:               (row['Mod4']               || '').trim() || null,
                  vendor_part_number: (row['VendorPartNumber']   || '').trim() || null,
                  par_level:          parseFloat(row['ParLevel'])        || null,
                  min_order_qty:      parseFloat(row['MinOrderQuantity']) || null,
                  is_active:          !discontinue,
                };
              }).filter(Boolean);
              const { error } = await supabase.from('item_catalog').upsert(batch, { onConflict: 'item_number,catalog_source' });
              if (error) { errors += batch.length; errorDetails.push('Batch error: ' + error.message); }
              else inserted += batch.length;
            }
          }

          // â”€â”€ ACCOUNT EDGE CATALOG â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
          else if (importType === 'edge_catalog') {
            for (let i = 0; i < rows.length; i += 100) {
              const batch = rows.slice(i, i + 100).map(row => {
                const itemNumber = (row['Item Number'] || '').trim();
                if (!itemNumber) return null;
                const inactive = (row['Inactive Item'] || '').trim().toLowerCase();
                return {
                  item_number:        itemNumber,
                  description:        (row['Item Name']          || '').trim(),
                  primary_vendor:     (row['Primary Vendor']     || '').trim() || null,
                  catalog_source:     'edge',
                  category:           (row['Custom List 1']      || '').trim() || null,
                  barcode1:           (row['Custom Field 3']     || '').trim() || null,
                  barcode2:           null,
                  uom:                (row['Sell Unit Measure']  || '').trim() || null,
                  selling_price:      parseFloat(row['Selling Price'])  || null,
                  standard_cost:      parseFloat(row['Standard Cost'])  || null,
                  hcpcs:              null,
                  mod1:               null,
                  mod2:               null,
                  mod3:               null,
                  mod4:               null,
                  vendor_part_number: (row['Vendor Item Number'] || '').trim() || null,
                  par_level:          parseFloat(row['Minimum Level'])   || null,
                  min_order_qty:      parseFloat(row['Reorder Quantity']) || null,
                  is_active:          inactive !== 'yes' && inactive !== 'true' && inactive !== '1',
                };
              }).filter(Boolean);
              const { error } = await supabase.from('item_catalog').upsert(batch, { onConflict: 'item_number,catalog_source' });
              if (error) { errors += batch.length; errorDetails.push('Batch error: ' + error.message); }
              else inserted += batch.length;
            }
          }

          // â”€â”€ CLAIMSOFT REFERRAL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
          else if (importType === 'referral_sources') {
            for (let i = 0; i < rows.length; i += 100) {
              const batch = rows.slice(i, i + 100).map(row => {
                const sourceName = (row['Referral Source Name'] || '').trim();
                if (!sourceName) return null;
                return {
                  source_name: sourceName,
                  rep:         (row['Rep']    || '').trim() || null,
                  region:      (row['Region'] || '').trim() || null,
                };
              }).filter(Boolean);
              const { error } = await supabase.from('referral_sources').upsert(batch, { onConflict: 'source_name' });
              if (error) { errors += batch.length; errorDetails.push('Batch error: ' + error.message); }
              else inserted += batch.length;
            }
          }

          setImportResults({ inserted, updated, errors, total: rows.length, errorDetails });
          // Audit log
          await logAudit(profile, IMPORT_ACTION_MAP[importType] || 'IMPORT_UNKNOWN', 'import', {
            target_type: importType,
            target_name: file?.name || 'unknown file',
            details: { inserted, updated, errors, total: rows.length, file: file?.name },
          });
          if (errors === 0) toast.success('Import Complete | ' + inserted + ' new, ' + updated + ' updated â€” ' + (inserted + updated) + ' total');
          else {
            const detail = errorDetails.slice(0, 3).join('; ') + (errorDetails.length > 3 ? '...' : '');
            toast.warning('Import finished | ' + (inserted + updated) + ' succeeded, ' + errors + ' error(s): ' + detail);
          }

        } catch (err) {
          toast.error('Import failed: ' + err.message);
        }
        setImporting(false);
      }
    });
  }


  const IMPORT_ACTION_MAP = {
    accounts:          'IMPORT_ACCOUNTS',
    users:             'IMPORT_USERS',
    claimsoft_catalog: 'IMPORT_CLAIMSOFT_CATALOG',
    edge_catalog:      'IMPORT_EDGE_CATALOG',
    referral_sources:  'IMPORT_REFERRAL_SOURCES',
  };
  const tmpl = TEMPLATES[importType];

  return (
    <div>
      <div className="import-grid">

        {/* â”€â”€ Left panel â”€â”€ */}
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-head-title">Import Data</div>
              <div className="card-head-sub">Upload a versioned MedEx CSV template</div>
            </div>
          </div>
          <div className="card-body">

            <div className="field-label">What are you importing?</div>
            {IMPORT_TYPES.map(({ key, label, desc }) => (
              <div
                key={key}
                className={'import-opt' + (importType === key ? ' sel' : '')}
                onClick={() => { setImportType(key); resetImport(); }}
              >
                <div className="import-opt-title">{label}</div>
                <div className="import-opt-sub">{desc}</div>
              </div>
            ))}

            {/* Template download */}
            <div className="field-label">Step 1 - Download Template</div>
            <div style={{
              background: 'var(--bg)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '12px 14px', marginBottom: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
            }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{tmpl.filename}</div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{tmpl.description}</div>
                <div style={{ fontSize: 10, color: 'var(--blue)', fontWeight: 600, marginTop: 4 }}>
                  Required: {tmpl.requiredCols.join(', ')}
                </div>
              </div>
              <button
                className="btn btn-outline"
                style={{ whiteSpace: 'nowrap', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}
                onClick={() => downloadTemplate(importType)}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M6 1v7M3 5.5l3 3 3-3M1 10h10" stroke="#475569" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Template
              </button>
            </div>

            {/* File upload */}
            <div className="field-label">Step 2 - Upload Completed CSV</div>
            <label className="file-drop" style={{
              borderColor: versionError ? 'var(--red)' : file && !versionError ? 'var(--blue-action)' : 'var(--border)',
              background:  versionError ? 'var(--red-light)' : file && !versionError ? 'var(--blue-light)' : 'var(--bg)',
            }}>
              <input type="file" accept=".csv" onChange={handleFile} style={{ display: 'none' }} />
              <div style={{ fontWeight: 600, color: versionError ? 'var(--red)' : file ? 'var(--blue-action)' : 'var(--text-mid)' }}>
                {file ? file.name : 'Choose CSV file...'}
              </div>
              <div style={{ fontSize: 12, marginTop: 4, color: 'var(--text-dim)' }}>
                {file ? (file.size / 1024).toFixed(1) + ' KB' : 'Click to browse'}
              </div>
            </label>

            {/* Version / column error */}
            {versionError && (
              <div style={{ padding: '12px 14px', borderRadius: 8, marginTop: 10, background: 'var(--red-light)', border: '1px solid #FECACA' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--red)', marginBottom: 3 }}>Template Error</div>
                <div style={{ fontSize: 12, color: 'var(--red)' }}>{versionError}</div>
              </div>
            )}

            {/* Import results */}
            {importResults && (
              <div style={{
                padding: '12px 14px', borderRadius: 8, marginTop: 12,
                background: importResults.errors === 0 ? 'var(--green-light)' : 'var(--amber-light)',
                border: '1px solid ' + (importResults.errors === 0 ? '#86EFAC' : '#FDE68A'),
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: importResults.errors === 0 ? 'var(--green)' : 'var(--amber)' }}>
                  Import Complete
                </div>
                <div style={{ fontSize: 12, marginTop: 3, color: 'var(--text-mid)' }}>
                  {importResults.inserted + importResults.updated} processed - {importResults.errors} errors - {importResults.total} total rows
                </div>
                {importResults.errorDetails?.length > 0 && (
                  <div style={{ marginTop: 8, maxHeight: 80, overflowY: 'auto' }}>
                    {importResults.errorDetails.map((e, i) => (
                      <div key={i} style={{ fontSize: 11, color: 'var(--red)', marginTop: 2 }}>{e}</div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Buttons */}
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button
                className="btn btn-primary"
                style={{ flex: 1 }}
                onClick={runImport}
                disabled={importing || !file || !!versionError}
              >
                {importing ? 'Importing...' : 'Run Import'}
              </button>
              {file && <button className="btn btn-outline" onClick={resetImport}>Clear</button>}
            </div>

          </div>
        </div>

        {/* â”€â”€ Right panel: preview â”€â”€ */}
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-head-title">File Preview</div>
              <div className="card-head-sub">First 5 rows of your CSV</div>
            </div>
          </div>
          <div className="card-body">
            {preview.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-dim)' }}>
                {versionError ? (
                  <>
                    <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--red)', marginBottom: 8 }}>!</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--red)' }}>Template Error</div>
                    <div style={{ fontSize: 12, marginTop: 4, color: 'var(--red)', maxWidth: 260, margin: '8px auto 0' }}>{versionError}</div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>No file selected</div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>Upload a CSV to preview its contents</div>
                    <div style={{ fontSize: 11, marginTop: 12, color: 'var(--blue)', fontWeight: 600 }}>
                      Template version {tmpl.version} required
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ fontSize: 11 }}>
                  <thead>
                    <tr>{Object.keys(preview[0]).slice(0, 6).map(k => <th key={k}>{k}</th>)}</tr>
                  </thead>
                  <tbody>
                    {preview.map((row, i) => (
                      <tr key={i}>{Object.values(row).slice(0, 6).map((v, j) => <td key={j}>{v}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8 }}>
                  Showing up to 6 columns - {preview.length} rows previewed
                </div>
                <div style={{ marginTop: 10, padding: '8px 10px', background: 'var(--green-light)', borderRadius: 6, border: '1px solid #86EFAC' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)' }}>
                    Template {tmpl.version} verified - ready to import
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
