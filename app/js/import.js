/**
 * app/js/import.js — CSV 导入逻辑 (D231)
 *
 * 拖拽 CSV → 前端解析预览 → POST /api/import/csv → 显示结果
 */
(function () {
  'use strict';

  var currentContent = '';
  var dropZone = document.getElementById('drop-zone');
  var fileInput = document.getElementById('file-input');
  var previewSection = document.getElementById('preview-section');
  var previewTable = document.getElementById('preview-table');
  var btnImport = document.getElementById('btn-import');
  var resultDiv = document.getElementById('import-result');

  // ── 拖拽/选择 ──

  dropZone.addEventListener('click', function () { fileInput.click(); });

  dropZone.addEventListener('dragover', function (e) { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', function () { dropZone.classList.remove('drag-over'); });
  dropZone.addEventListener('drop', function (e) { e.preventDefault(); dropZone.classList.remove('drag-over'); handleFile(e.dataTransfer.files[0]); });

  fileInput.addEventListener('change', function () { if (fileInput.files[0]) handleFile(fileInput.files[0]); });

  // ── 文件处理 ──

  function handleFile(file) {
    if (!file) return;
    if (!file.name.endsWith('.csv')) {
      showToast('Please select a CSV file', 'error'); return;
    }
    var reader = new FileReader();
    reader.onload = function (e) {
      var text = e.target.result;
      if (!text || text.trim().length === 0) {
        showToast('Empty file', 'error'); return;
      }
      currentContent = text;
      renderPreview(text);
    };
    reader.readAsText(file);
  }

  // ── 预览 ──

  function renderPreview(text) {
    var lines = text.split('\n').filter(function (l) { return l.trim().length > 0; });
    if (lines.length < 2) {
      showToast('CSV must have header + at least 1 data row', 'error'); return;
    }

    var header = parseLine(lines[0]);
    var previewRows = lines.slice(1, 11).map(parseLine);

    var html = '<table class="admin-table"><thead><tr>';
    header.forEach(function (h) { html += '<th>' + escapeHtml(h.trim()) + '</th>'; });
    html += '</tr></thead><tbody>';
    previewRows.forEach(function (row) {
      html += '<tr>';
      header.forEach(function (_, i) { html += '<td>' + escapeHtml(row[i] || '') + '</td>'; });
      html += '</tr>';
    });
    html += '</tbody></table>';
    html += '<p class="text-secondary">' + (lines.length - 1) + ' data rows found. ' + (lines.length > 11 ? 'Showing first 10.' : '') + '</p>';

    previewTable.innerHTML = html;
    previewSection.style.display = 'block';
    resultDiv.innerHTML = '';
  }

  function parseLine(line) {
    var result = [], current = '', inQuotes = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (ch === '"') { inQuotes = !inQuotes; }
      else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
      else { current += ch; }
    }
    result.push(current.trim());
    return result;
  }

  // ── 导入 ──

  btnImport.addEventListener('click', function () {
    if (!currentContent) return;
    btnImport.disabled = true;
    btnImport.textContent = 'Importing...';

    api.post('/api/import/csv', { content: currentContent }).then(function (r) { return r.json(); }).then(function (data) {
      if (data.ok) {
        resultDiv.innerHTML = '<div class="import-success">✅ Successfully imported ' + data.imported + ' records.</div>';
        if (data.warnings && data.warnings.length > 0) {
          resultDiv.innerHTML += '<div class="import-warnings"><p>' + data.warnings.length + ' warnings:</p><ul><li>' + data.warnings.join('</li><li>') + '</li></ul></div>';
        }
      } else {
        resultDiv.innerHTML = '<div class="error-message visible">Import failed: ' + (data.message || data.error || 'unknown') + '</div>';
      }
      btnImport.disabled = false;
      btnImport.textContent = 'Import to GraphStore';
    }).catch(function (err) {
      resultDiv.innerHTML = '<div class="error-message visible">Service unavailable. <a href="#" onclick="location.reload()">Retry</a></div>';
      btnImport.disabled = false;
      btnImport.textContent = 'Import to GraphStore';
    });
  });

  function escapeHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
})();
