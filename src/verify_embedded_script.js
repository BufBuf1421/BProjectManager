#!/usr/bin/env node
/** Извлекает BLENDER_SAVE_SCRIPT из patched index.js и сохраняет во временный .py,
 *  затем (внешне) он проверяется py_compile. Также печатает фрагмент обработчика. */
const fs = require('fs');

const src = fs.readFileSync('/home/z/my-project/download/fixed/index.js', 'utf8');

const startMarker = 'const BLENDER_SAVE_SCRIPT = `';
const start = src.indexOf(startMarker);
if (start < 0) { console.error('FAIL: BLENDER_SAVE_SCRIPT not found'); process.exit(1); }
const pyStart = start + startMarker.length;
const end = src.indexOf('`;', pyStart);
if (end < 0) { console.error('FAIL: closing backtick not found'); process.exit(1); }

const script = src.slice(pyStart, end);
fs.writeFileSync('/home/z/my-project/scripts/extracted_save_blend.py', script);
console.log('Extracted', script.length, 'chars of embedded Python script');

// Быстрая проверка отсутствия опасных для template literal последовательностей
if (script.includes('\\`') || script.includes('${')) {
  console.error('FAIL: dangerous sequences in embedded script');
  process.exit(1);
}
console.log('Embedded script safe for JS template literal');

// Печатаем новый блок spawn для визуальной проверки
const idx = src.indexOf("const child = spawn(blenderPath, args, { stdio: 'ignore', windowsHide: true });");
console.log('\n--- spawn block preview ---');
console.log(src.slice(idx - 200, idx + 900));