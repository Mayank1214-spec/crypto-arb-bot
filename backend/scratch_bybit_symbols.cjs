const https = require('https');

https.get('https://api.bytick.com/v5/market/instruments-info?category=option', (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      if (parsed.result && parsed.result.list) {
        const symbols = parsed.result.list.map(i => i.symbol);
        console.log("Total Bybit Option Symbols:", symbols.length);
        console.log("Sample Symbols:");
        console.log(symbols.slice(0, 20).join('\n'));
      } else {
        console.log("Unexpected format", parsed);
      }
    } catch (e) {
      console.error(e);
    }
  });
}).on('error', (e) => {
  console.error("HTTP Error:", e);
});
