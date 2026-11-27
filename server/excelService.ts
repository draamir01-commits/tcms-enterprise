import ExcelJS from 'exceljs';
import type { ExcelTemplateType } from '../src/types/tcms.ts';

export type { ExcelTemplateType };

export interface TemplateColumnDef {
  header: string;
  key: string;
  width: number;
  required?: boolean;
  formatHint: string;
  example: string;
  example2?: string;
  dropdownOptions?: string[];
  textFormat?: boolean;
}

export interface TemplateMeta {
  title: string;
  description: string;
  instructions: string[];
  columns: TemplateColumnDef[];
}

export const TEMPLATE_DEFINITIONS: Record<ExcelTemplateType, TemplateMeta> = {
  candidates: {
    title: 'Candidate Bulk Registration Template',
    description: 'Register individual or company-sponsored training candidates into TCMS.',
    instructions: [
      'Enter candidate records on the "Data Entry" sheet starting from Row 2.',
      'Required fields: Full Name English, Full Name Arabic, Nationality, Mobile, and at least one of Iqama Number or Passport Number.',
      'Dates must use YYYY-MM-DD format (e.g., 1992-05-14).',
      'Duplicate Iqama or Passport numbers are flagged during preview and never overwritten without explicit authorized confirmation.',
    ],
    columns: [
      { header: 'Full Name English *', key: 'fullNameEn', width: 28, required: true, formatHint: 'Text (max 160 chars)', example: 'Tariq Al-Mansoor', example2: 'Nadia Al-Harbi' },
      { header: 'Full Name Arabic', key: 'fullNameAr', width: 28, formatHint: 'Arabic text (defaults to EN if blank)', example: 'طارق المنصور', example2: 'نادية الحربي' },
      { header: 'Gender (male/female)', key: 'gender', width: 20, formatHint: 'male | female', example: 'male', example2: 'female', dropdownOptions: ['male', 'female'] },
      { header: 'Iqama Number', key: 'iqamaNumber', width: 20, formatHint: '10 digits (or provide Passport)', example: '2458910234', example2: '1084523190', textFormat: true },
      { header: 'Iqama Expiry (YYYY-MM-DD)', key: 'iqamaExpiryDate', width: 24, formatHint: 'YYYY-MM-DD', example: '2028-06-30', example2: '2029-01-15', textFormat: true },
      { header: 'Passport Number', key: 'passportNumber', width: 20, formatHint: 'Alphanumeric (6-20 chars)', example: 'P9842105', example2: 'N7721904', textFormat: true },
      { header: 'Passport Expiry (YYYY-MM-DD)', key: 'passportExpiryDate', width: 26, formatHint: 'YYYY-MM-DD', example: '2030-03-20', example2: '2031-09-10', textFormat: true },
      { header: 'Nationality *', key: 'nationality', width: 18, required: true, formatHint: 'Country / Nationality', example: 'Saudi Arabia', example2: 'Egypt' },
      { header: 'Date of Birth (YYYY-MM-DD)', key: 'dateOfBirth', width: 24, formatHint: 'YYYY-MM-DD', example: '1991-08-19', example2: '1994-02-11', textFormat: true },
      { header: 'Mobile *', key: 'mobile', width: 20, required: true, formatHint: 'Phone (+9665XXXXXXXX)', example: '+966501234567', example2: '+966559876543', textFormat: true },
      { header: 'Email', key: 'email', width: 28, formatHint: 'Valid email address', example: 'tariq.mansoor@example.com', example2: 'nadia.harbi@example.com' },
      { header: 'Company Name', key: 'companyName', width: 26, formatHint: 'Employer / Organization name', example: 'Gulf Industrial Energy Co.', example2: 'Arabian Grid Services' },
      { header: 'Employee ID', key: 'employeeId', width: 18, formatHint: 'Company staff badge/ID', example: 'EMP-4012', example2: 'EMP-4013', textFormat: true },
      { header: 'Job Title', key: 'jobTitle', width: 22, formatHint: 'Text', example: 'Safety Technician', example2: 'Electrical Supervisor' },
      { header: 'Department', key: 'department', width: 20, formatHint: 'Text', example: 'HSE Operations', example2: 'Plant Maintenance' },
      { header: 'Work Location', key: 'workLocation', width: 20, formatHint: 'City / Site', example: 'Jubail Industrial City', example2: 'Yanbu Refinery' },
      { header: 'Address', key: 'address', width: 28, formatHint: 'Text', example: 'King Fahd Rd, Jubail', example2: 'Al-Bahr St, Yanbu' },
      { header: 'Emergency Contact', key: 'emergencyContact', width: 24, formatHint: 'Name & phone', example: 'Sami Al-Mansoor +966500001122', example2: 'Khalid Al-Harbi +966500002233' },
    ],
  },
  corporate_employees: {
    title: 'Corporate Employee Registration Template',
    description: 'Bulk register corporate employees automatically scoped to your organization.',
    instructions: [
      'Enter corporate employee records on the "Data Entry" sheet starting from Row 2.',
      'Required fields: Full Name English, Full Name Arabic, Nationality, Mobile, and at least one of Iqama Number or Passport Number.',
      'All employees imported via this template are linked to the selected Corporate Organization.',
      'Cross-organization candidate records cannot be viewed or overwritten by corporate client accounts.',
    ],
    columns: [
      { header: 'Full Name English *', key: 'fullNameEn', width: 28, required: true, formatHint: 'Text (max 160 chars)', example: 'Faisal Al-Qahtani', example2: 'Rashed Al-Dosari' },
      { header: 'Full Name Arabic', key: 'fullNameAr', width: 28, formatHint: 'Arabic text (defaults to EN if blank)', example: 'فيصل القحطاني', example2: 'راشد الدوسري' },
      { header: 'Gender (male/female)', key: 'gender', width: 20, formatHint: 'male | female', example: 'male', example2: 'male', dropdownOptions: ['male', 'female'] },
      { header: 'Iqama Number', key: 'iqamaNumber', width: 20, formatHint: '10 digits (or provide Passport)', example: '1092345678', example2: '2390123456', textFormat: true },
      { header: 'Iqama Expiry (YYYY-MM-DD)', key: 'iqamaExpiryDate', width: 24, formatHint: 'YYYY-MM-DD', example: '2028-11-15', example2: '2027-09-20', textFormat: true },
      { header: 'Passport Number', key: 'passportNumber', width: 20, formatHint: 'Alphanumeric (6-20 chars)', example: 'K4412098', example2: 'M8834120', textFormat: true },
      { header: 'Passport Expiry (YYYY-MM-DD)', key: 'passportExpiryDate', width: 26, formatHint: 'YYYY-MM-DD', example: '2031-04-01', example2: '2029-12-30', textFormat: true },
      { header: 'Nationality *', key: 'nationality', width: 18, required: true, formatHint: 'Country / Nationality', example: 'Saudi Arabia', example2: 'India' },
      { header: 'Date of Birth (YYYY-MM-DD)', key: 'dateOfBirth', width: 24, formatHint: 'YYYY-MM-DD', example: '1989-03-22', example2: '1993-07-09', textFormat: true },
      { header: 'Mobile *', key: 'mobile', width: 20, required: true, formatHint: 'Phone (+9665XXXXXXXX)', example: '+966504445566', example2: '+966557778899', textFormat: true },
      { header: 'Email', key: 'email', width: 28, formatHint: 'Valid email address', example: 'faisal.q@corp-client.sa', example2: 'rashed.d@corp-client.sa' },
      { header: 'Employee ID', key: 'employeeId', width: 18, formatHint: 'Corporate employee badge/ID', example: 'CORP-1042', example2: 'CORP-1043', textFormat: true },
      { header: 'Job Title', key: 'jobTitle', width: 22, formatHint: 'Text', example: 'Rig Safety Officer', example2: 'Crane Operator' },
      { header: 'Department', key: 'department', width: 20, formatHint: 'Text', example: 'Field Operations', example2: 'Lifting & Rigging' },
      { header: 'Work Location', key: 'workLocation', width: 20, formatHint: 'Site / Facility', example: 'Dammam Terminal', example2: 'Abqaiq Plant' },
      { header: 'Address', key: 'address', width: 28, formatHint: 'Text', example: 'Al-Khobar Corniche', example2: 'Dammam 2nd Industrial' },
      { header: 'Emergency Contact', key: 'emergencyContact', width: 24, formatHint: 'Name & phone', example: 'Saad Al-Qahtani +966501112233', example2: 'Omar Al-Dosari +966502223344' },
    ],
  },
  enrollment_requests: {
    title: 'Bulk Enrollment Requests Template',
    description: 'Submit corporate or bulk course enrollment requests for registered candidates/employees.',
    instructions: [
      'Identify each candidate by Candidate ID (preferred, e.g., CND-2026-00001) OR Iqama/Passport Number.',
      'Provide the exact Course Code (e.g., SAF-101) as listed in the Course Catalogue.',
      'Preferred Batch Number is optional; if specified, it must belong to the same Course Code.',
      'Corporate clients create Pending Review enrollment requests; Administrators can review & approve them into confirmed batches.',
    ],
    columns: [
      { header: 'Candidate ID', key: 'candidateId', width: 20, formatHint: 'e.g. CND-2026-00001 (or Iqama/Passport)', example: 'CND-2026-00001', example2: 'CND-2026-00002', textFormat: true },
      { header: 'Iqama Number', key: 'iqamaNumber', width: 18, formatHint: 'Optional lookup if Candidate ID omitted', example: '2458910234', example2: '1084523190', textFormat: true },
      { header: 'Passport Number', key: 'passportNumber', width: 18, formatHint: 'Optional lookup if Candidate ID omitted', example: '', example2: '', textFormat: true },
      { header: 'Course Code *', key: 'courseCode', width: 18, required: true, formatHint: 'Existing active Course Code', example: 'SAF-101', example2: 'FIR-201', textFormat: true },
      { header: 'Preferred Batch Number', key: 'preferredBatchNumber', width: 24, formatHint: 'Optional Batch # (e.g. BTH-2026-0001)', example: 'BTH-2026-0001', example2: '', textFormat: true },
      { header: 'Request Notes', key: 'requestNotes', width: 34, formatHint: 'Optional instructions or shift preference', example: 'Morning shift requested for site deployment', example2: 'Urgent renewal before site audit' },
    ],
  },
  enrollments: {
    title: 'Direct Batch Enrollment Upload Template',
    description: 'Enroll registered candidates directly into active training batches (Administrators only).',
    instructions: [
      'Provide Candidate ID (or Iqama/Passport Number), Course Code, and exact Batch Number.',
      'Initial Status defaults to "confirmed" (or set "pending").',
      'Enrollment will fail validation if the batch is cancelled, closed, or full (unless capacity override is handled in Enrollments).',
    ],
    columns: [
      { header: 'Candidate ID *', key: 'candidateId', width: 20, required: true, formatHint: 'e.g. CND-2026-00001', example: 'CND-2026-00001', example2: 'CND-2026-00002', textFormat: true },
      { header: 'Course Code *', key: 'courseCode', width: 18, required: true, formatHint: 'Active Course Code', example: 'SAF-101', example2: 'SAF-101', textFormat: true },
      { header: 'Batch Number *', key: 'batchNumber', width: 22, required: true, formatHint: 'Active Batch Number (e.g. BTH-2026-0001)', example: 'BTH-2026-0001', example2: 'BTH-2026-0001', textFormat: true },
      { header: 'Status (pending/confirmed)', key: 'status', width: 24, formatHint: 'confirmed | pending', example: 'confirmed', example2: 'pending', dropdownOptions: ['confirmed', 'pending'] },
      { header: 'Notes', key: 'notes', width: 30, formatHint: 'Optional enrollment notes', example: 'Sponsored by HSE department', example2: 'Prerequisite verified' },
    ],
  },
  attendance: {
    title: 'Batch Attendance Upload Template',
    description: 'Bulk upload session attendance records for an assigned training batch.',
    instructions: [
      'Identify each trainee using Enrollment Number (e.g. ENR-2026-0001) or Candidate ID + Batch Number.',
      'Attendance Date must use YYYY-MM-DD format (e.g. 2026-05-12).',
      'Attendance Status must be one of: present, absent, late, excused.',
      'Submission Status can be "draft" or "submitted". Trainers cannot overwrite already submitted & locked sessions; Administrators must supply a Correction Reason.',
    ],
    columns: [
      { header: 'Batch Number *', key: 'batchNumber', width: 20, required: true, formatHint: 'Batch # (e.g. BTH-2026-0001)', example: 'BTH-2026-0001', example2: 'BTH-2026-0001', textFormat: true },
      { header: 'Enrollment ID', key: 'enrollmentNumber', width: 20, formatHint: 'e.g. ENR-2026-0001 (or Candidate ID)', example: 'ENR-2026-0001', example2: 'ENR-2026-0002', textFormat: true },
      { header: 'Candidate ID', key: 'candidateId', width: 20, formatHint: 'e.g. CND-2026-00001 (if Enrollment ID blank)', example: 'CND-2026-00001', example2: 'CND-2026-00002', textFormat: true },
      { header: 'Attendance Date (YYYY-MM-DD) *', key: 'date', width: 26, required: true, formatHint: 'YYYY-MM-DD', example: '2026-05-12', example2: '2026-05-12', textFormat: true },
      { header: 'Attendance Status *', key: 'status', width: 22, required: true, formatHint: 'present | absent | late | excused', example: 'present', example2: 'late', dropdownOptions: ['present', 'absent', 'late', 'excused'] },
      { header: 'Remarks', key: 'remarks', width: 28, formatHint: 'Optional session remarks', example: 'Attended full practical drill', example2: 'Arrived 10 mins late' },
      { header: 'Submission Mode (draft/submitted)', key: 'submissionStatus', width: 26, formatHint: 'draft | submitted', example: 'draft', example2: 'draft', dropdownOptions: ['draft', 'submitted'] },
      { header: 'Correction Reason', key: 'correctionReason', width: 28, formatHint: 'Required if Admin overwrites locked record', example: '', example2: '' },
    ],
  },
  courses: {
    title: 'Course Catalogue Bulk Upload Template',
    description: 'Bulk register safety & technical courses into the TCMS catalogue.',
    instructions: [
      'Course Code must be unique across the catalogue.',
      'Duration Unit must be one of: hours, days, weeks.',
      'Min Attendance % and Passing Score must be numeric percentages between 0 and 100.',
    ],
    columns: [
      { header: 'Course Code *', key: 'courseCode', width: 16, required: true, formatHint: 'Unique code (e.g. SAF-101)', example: 'SAF-101', example2: 'ELC-204', textFormat: true },
      { header: 'Title English *', key: 'titleEn', width: 30, required: true, formatHint: 'English course title', example: 'H2S Gas Safety & Escape', example2: 'High Voltage Electrical Safety' },
      { header: 'Title Arabic *', key: 'titleAr', width: 30, required: true, formatHint: 'Arabic course title', example: 'السلامة من غاز كبريتيد الهيدروجين', example2: 'سلامة الجهد الكهربائي العالي' },
      { header: 'Category *', key: 'category', width: 24, required: true, formatHint: 'Course category', example: 'Industrial Safety', example2: 'Electrical Safety' },
      { header: 'Course Type', key: 'courseType', width: 18, formatHint: 'theoretical | practical | blended | certification | refresher', example: 'blended', example2: 'certification', dropdownOptions: ['theoretical', 'practical', 'blended', 'certification', 'refresher'] },
      { header: 'Duration *', key: 'duration', width: 14, required: true, formatHint: 'Positive number', example: '3', example2: '16' },
      { header: 'Duration Unit (hours/days/weeks) *', key: 'durationUnit', width: 28, required: true, formatHint: 'hours | days | weeks', example: 'days', example2: 'hours', dropdownOptions: ['hours', 'days', 'weeks'] },
      { header: 'Min Attendance % *', key: 'minAttendancePct', width: 18, required: true, formatHint: '0 - 100', example: '80', example2: '85' },
      { header: 'Min Exam Score *', key: 'minExamScore', width: 18, required: true, formatHint: '0 - 100', example: '70', example2: '75' },
      { header: 'Course Fee (SAR)', key: 'fee', width: 16, formatHint: 'Numeric SAR fee', example: '1200', example2: '1800' },
      { header: 'Validity Months', key: 'validityMonths', width: 16, formatHint: '0 = No expiry', example: '24', example2: '36' },
    ],
  },
  trainers: {
    title: 'Trainers Directory Bulk Upload Template',
    description: 'Bulk register certified instructors and trainers.',
    instructions: [
      'Required fields: Name English, Name Arabic, Mobile, Email, Specialization.',
      'Employment Status options: full_time, part_time, contract, freelance.',
    ],
    columns: [
      { header: 'Name English *', key: 'nameEn', width: 28, required: true, formatHint: 'Text', example: 'Eng. Hassan Al-Zahrani', example2: 'Dr. Kareem Mahmoud' },
      { header: 'Name Arabic *', key: 'nameAr', width: 28, required: true, formatHint: 'Arabic text', example: 'م. حسن الزهراني', example2: 'د. كريم محمود' },
      { header: 'Mobile *', key: 'mobile', width: 20, required: true, formatHint: '+9665XXXXXXXX', example: '+966509988776', example2: '+966551122334', textFormat: true },
      { header: 'Email *', key: 'email', width: 28, required: true, formatHint: 'Valid email address', example: 'hassan.z@tcms.sa', example2: 'kareem.m@tcms.sa' },
      { header: 'Nationality', key: 'nationality', width: 18, formatHint: 'Country / Nationality', example: 'Saudi Arabia', example2: 'Jordan' },
      { header: 'Specialization *', key: 'specialization', width: 26, required: true, formatHint: 'Primary training discipline', example: 'Industrial & Fire Safety', example2: 'Electrical & LOTO' },
      { header: 'Qualifications', key: 'qualifications', width: 30, formatHint: 'Degrees / Diplomas', example: 'NEBOSH Diploma, B.Sc Mechanical', example2: 'PhD Electrical Engineering' },
      { header: 'Certifications', key: 'certifications', width: 28, formatHint: 'Accreditations', example: 'OSHA 501, IOSH Managing Safely', example2: 'NFPA 70E Certified Instructor' },
      { header: 'Experience Years', key: 'experienceYears', width: 16, formatHint: 'Integer (0-60)', example: '12', example2: '9' },
      { header: 'Employment Status', key: 'employmentStatus', width: 20, formatHint: 'full_time | part_time | contract | freelance', example: 'full_time', example2: 'contract', dropdownOptions: ['full_time', 'part_time', 'contract', 'freelance'] },
    ],
  },
};

export async function generateImportTemplateWorkbook(type: ExcelTemplateType): Promise<Buffer> {
  const meta = TEMPLATE_DEFINITIONS[type] || TEMPLATE_DEFINITIONS.candidates;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'TCMS Enterprise';
  wb.created = new Date();

  // Sheet 1: Clean Data Entry sheet (row 1 = headers, rows 2..100 formatted & validated)
  const ws = wb.addWorksheet('Data Entry', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  ws.columns = meta.columns.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width,
  }));

  const headerRow = ws.getRow(1);
  headerRow.height = 28;
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0F172A' },
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };

  meta.columns.forEach((col, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.note = `${col.required ? 'REQUIRED' : 'Optional'}\nFormat: ${col.formatHint}\nExample: ${col.example}`;
    if (col.textFormat) {
      ws.getColumn(idx + 1).numFmt = '@';
    }
    if (col.dropdownOptions && col.dropdownOptions.length > 0) {
      const listFormula = `"${col.dropdownOptions.join(',')}"`;
      for (let r = 2; r <= 200; r++) {
        ws.getCell(r, idx + 1).dataValidation = {
          type: 'list',
          allowBlank: !col.required,
          formulae: [listFormula],
          showErrorMessage: true,
          errorTitle: 'Invalid Selection',
          error: `Choose one of: ${col.dropdownOptions.join(', ')}`,
        };
      }
    }
  });

  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: meta.columns.length },
  };

  // Sheet 2: Instructions, Field Guide & Sample Examples
  const guide = wb.addWorksheet('Instructions & Examples');
  guide.getColumn(1).width = 30;
  guide.getColumn(2).width = 22;
  guide.getColumn(3).width = 14;
  guide.getColumn(4).width = 34;
  guide.getColumn(5).width = 30;
  guide.getColumn(6).width = 30;

  const titleRow = guide.addRow([meta.title]);
  titleRow.font = { bold: true, size: 14, color: { argb: 'FF0F172A' } };
  guide.addRow([meta.description]);
  guide.addRow([]);

  const instrTitle = guide.addRow(['Upload Rules & Instructions']);
  instrTitle.font = { bold: true, size: 11, color: { argb: 'FF0F172A' } };
  meta.instructions.forEach((line, idx) => {
    guide.addRow([`${idx + 1}. ${line}`]);
  });
  guide.addRow([]);

  const specHeader = guide.addRow([
    'Column Heading',
    'System Field Key',
    'Required',
    'Format / Accepted Values',
    'Example Row 1',
    'Example Row 2',
  ]);
  specHeader.height = 24;
  specHeader.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
  specHeader.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E293B' },
  };
  specHeader.alignment = { vertical: 'middle' };

  meta.columns.forEach((col) => {
    const r = guide.addRow([
      col.header,
      col.key,
      col.required ? 'YES' : 'No',
      col.formatHint,
      col.example,
      col.example2 || '',
    ]);
    if (col.required) {
      r.getCell(3).font = { bold: true, color: { argb: 'FFB91C1C' } };
    }
  });

  const arr = await wb.xlsx.writeBuffer();
  return Buffer.from(arr);
}

function extractCellString(cell: ExcelJS.Cell): string {
  const val = cell.value;
  if (val === null || val === undefined) return '';
  if (val instanceof Date) {
    if (Number.isNaN(val.getTime())) return '';
    return val.toISOString().slice(0, 10);
  }
  if (typeof val === 'string') return val.trim();
  if (typeof val === 'number') return String(val).trim();
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  if (typeof val === 'object') {
    if ('result' in val) {
      const resVal = (val as ExcelJS.CellFormulaValue).result;
      if (resVal instanceof Date) return resVal.toISOString().slice(0, 10);
      if (resVal !== null && resVal !== undefined && typeof resVal !== 'object') {
        return String(resVal).trim();
      }
    }
    if ('richText' in val && Array.isArray((val as ExcelJS.CellRichTextValue).richText)) {
      return (val as ExcelJS.CellRichTextValue).richText.map((r) => r.text || '').join('').trim();
    }
    if ('text' in val && typeof (val as { text?: unknown }).text === 'string') {
      return String((val as { text: string }).text).trim();
    }
    if ('error' in val) return '';
  }
  return String(cell.text || '').trim();
}

export async function parseSpreadsheetBuffer(
  buffer: Buffer,
  isCsv: boolean
): Promise<{ headers: string[]; rows: Array<Record<string, string>> }> {
  if (isCsv) {
    const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) return { headers: [], rows: [] };
    const splitCsv = (line: string) => {
      const out: string[] = [];
      let cur = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') {
            cur += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (ch === ',' && !inQuotes) {
          out.push(cur.trim());
          cur = '';
        } else {
          cur += ch;
        }
      }
      out.push(cur.trim());
      return out;
    };
    const headers = splitCsv(lines[0]);
    const rows: Array<Record<string, string>> = [];
    for (const line of lines.slice(1)) {
      const vals = splitCsv(line);
      const obj: Record<string, string> = {};
      let hasData = false;
      headers.forEach((h, idx) => {
        if (!h) return;
        const val = (vals[idx] || '').trim();
        if (val) hasData = true;
        obj[h] = val;
      });
      if (hasData) rows.push(obj);
    }
    return { headers, rows };
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = wb.getWorksheet('Data Entry') || wb.worksheets[0];
  if (!ws) return { headers: [], rows: [] };

  const headers: string[] = [];
  const headerRow = ws.getRow(1);
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber - 1] = extractCellString(cell);
  });

  const rows: Array<Record<string, string>> = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const obj: Record<string, string> = {};
    let hasData = false;
    headers.forEach((h, idx) => {
      if (!h) return;
      const cell = row.getCell(idx + 1);
      const val = extractCellString(cell);
      if (val) hasData = true;
      obj[h] = val;
    });
    if (hasData) rows.push(obj);
  });

  return { headers: headers.filter(Boolean), rows };
}

export interface ErrorReportRowInput {
  rowNumber: number;
  status: string;
  missingFields?: string[];
  formatErrors?: string[];
  duplicateDetails?: Array<{ existingDetails?: string; candidateId?: string; idType?: string }>;
  errors: string[];
  data: Record<string, string>;
}

export async function generateImportErrorWorkbook(
  rows: ErrorReportRowInput[]
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Import Errors', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  const dynamicKeys = Array.from(
    new Set(rows.flatMap((r) => Object.keys(r.data || {})))
  ).slice(0, 18);

  const baseCols = [
    { header: 'Row #', key: 'rowNumber', width: 10 },
    { header: 'Row Status', key: 'status', width: 16 },
    { header: 'Missing Required Fields', key: 'missingFields', width: 32 },
    { header: 'Data Format Errors', key: 'formatErrors', width: 34 },
    { header: 'Duplicate Matches', key: 'duplicates', width: 34 },
    { header: 'All Issues / Failure Reason', key: 'errors', width: 44 },
  ];

  ws.columns = [
    ...baseCols,
    ...dynamicKeys.map((k) => ({ header: k, key: `data_${k}`, width: 22 })),
  ];

  const headerRow = ws.getRow(1);
  headerRow.height = 24;
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0F172A' },
  };
  headerRow.alignment = { vertical: 'middle' };

  for (const r of rows) {
    const dupSummary = (r.duplicateDetails || [])
      .map((d) => d.existingDetails || `${d.idType || 'match'} ${d.candidateId || ''}`.trim())
      .filter(Boolean)
      .join('; ');
    const rowPayload: Record<string, unknown> = {
      rowNumber: r.rowNumber,
      status: r.status.toUpperCase(),
      missingFields: (r.missingFields || []).join(', '),
      formatErrors: (r.formatErrors || []).join('; '),
      duplicates: dupSummary,
      errors: (r.errors || []).join('; '),
    };
    for (const k of dynamicKeys) {
      rowPayload[`data_${k}`] = r.data?.[k] ?? '';
    }
    const added = ws.addRow(rowPayload);
    if (r.status === 'duplicate') {
      added.getCell(2).font = { bold: true, color: { argb: 'FFB45309' } };
    } else if (r.status === 'invalid' || r.status === 'failed') {
      added.getCell(2).font = { bold: true, color: { argb: 'FFB91C1C' } };
    }
  }

  const arr = await wb.xlsx.writeBuffer();
  return Buffer.from(arr);
}

export async function exportTableToWorkbook(
  title: string,
  headers: string[],
  rows: Array<Array<string | number>>,
  format: 'xlsx' | 'csv',
  subtitle?: string
): Promise<Buffer> {
  if (format === 'csv') {
    const escapeCsv = (val: string | number) => {
      const str = String(val ?? '');
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };
    const lines = [headers.map(escapeCsv).join(','), ...rows.map((r) => r.map(escapeCsv).join(','))];
    return Buffer.from('\uFEFF' + lines.join('\n'), 'utf8');
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = 'TCMS Enterprise';
  wb.created = new Date();

  const sheetName = (title || 'Export').replace(/[\\/?*[\]:]/g, '').slice(0, 31) || 'Export';
  const ws = wb.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  const headerRow = ws.addRow(headers);
  headerRow.height = 25;
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0F172A' },
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'left' };

  rows.forEach((r, idx) => {
    const dataRow = ws.addRow(r);
    if (idx % 2 === 1) {
      dataRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF8FAFC' },
      };
    }
  });

  headers.forEach((h, colIdx) => {
    let maxLen = h.length;
    for (const r of rows.slice(0, 200)) {
      const cellLen = String(r[colIdx] ?? '').length;
      if (cellLen > maxLen) maxLen = cellLen;
    }
    ws.getColumn(colIdx + 1).width = Math.min(44, Math.max(14, maxLen + 4));
  });

  if (headers.length > 0) {
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: headers.length },
    };
  }

  const metaSheet = wb.addWorksheet('Export Metadata');
  metaSheet.getColumn(1).width = 22;
  metaSheet.getColumn(2).width = 50;
  metaSheet.addRow(['Report / Dataset', title]);
  if (subtitle) metaSheet.addRow(['Scope / Filter', subtitle]);
  metaSheet.addRow(['Generated At (UTC)', new Date().toISOString()]);
  metaSheet.addRow(['Total Rows', rows.length]);
  metaSheet.getColumn(1).font = { bold: true };

  const arr = await wb.xlsx.writeBuffer();
  return Buffer.from(arr);
}
