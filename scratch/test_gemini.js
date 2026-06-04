const axios = require('axios');

const geminiKey = process.env.GEMINI_API_KEY || 'AIzaSyBcLLByyx8tHgEmC8nDLBCMj8wjepQ8ulQ';
const prompt = 'Olá! Faça um pequeno resumo de teste de uma frase.';

async function testModel(model) {
	try {
		console.log(`Testing model: ${model}...`);
		const response = await axios.post(
			`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
			{
				contents: [{ parts: [{ text: prompt }] }]
			}
		);
		console.log(`[${model}] Success! Response:`, response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim());
	} catch (error) {
		console.error(`[${model}] Failed:`);
		if (error.response) {
			console.error('  Status:', error.response.status);
			console.error('  Data:', JSON.stringify(error.response.data, null, 2));
		} else {
			console.error('  Error:', error.message);
		}
	}
}

async function run() {
	await testModel('gemini-2.5-flash-lite');
	await testModel('gemini-flash-latest');
	await testModel('gemini-flash-lite-latest');
}

run();
