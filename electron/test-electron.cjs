// Test require('electron') from a file, not -e
try {
  const electron = require('electron');
  console.log('typeof electron:', typeof electron);
  console.log('electron.app:', typeof electron.app);
  console.log('electron.BrowserWindow:', typeof electron.BrowserWindow);
  console.log('keys:', Object.keys(electron).join(', '));
} catch(e) {
  console.log('Error:', e.message);
}
