const https = require('https');

function testApi() {
  const url = 'https://api.globoesporte.globo.com/tabela/b5ff9c28-476e-4816-a699-7645acc94cd0/fase/segunda-fase-copa-do-mundo-2026/classificacao/';
  
  const options = {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  };

  https.get(url, options, (res) => {
    let rawData = '';
    res.on('data', (chunk) => { rawData += chunk; });
    res.on('end', () => {
      try {
        const parsed = JSON.parse(rawData);
        console.log('Main Keys:', Object.keys(parsed));
        
        if (parsed.secao) {
          console.log('secao type:', typeof parsed.secao, Array.isArray(parsed.secao) ? 'Array' : 'Object');
          if (Array.isArray(parsed.secao)) {
            console.log('secao length:', parsed.secao.length);
            if (parsed.secao.length > 0) {
              console.log('First secao entry keys:', Object.keys(parsed.secao[0]));
              // If there's games in the section, print them
              console.log('First secao item details:', JSON.stringify(parsed.secao[0], null, 2).substring(0, 800));
            }
          } else {
            console.log('secao keys:', Object.keys(parsed.secao));
          }
        }
      } catch (e) {
        console.error(e);
      }
    });
  });
}

testApi();
