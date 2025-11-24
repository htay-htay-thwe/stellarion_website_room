// Test Meshy API directly
const axios = require('axios');

const API_KEY = 'msy_imtf4LckbGLjhe4DdJjjLZhUqmtGCd4x040b';
const testImageUrl = 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800';

console.log('🔍 Testing Meshy API...\n');
console.log('API Key:', API_KEY.substring(0, 20) + '...');
console.log('Image URL:', testImageUrl);
console.log('');

// Test different endpoint variations
const endpoints = [
    { url: 'https://api.meshy.ai/v2/image-to-3d', method: 'POST' },
    { url: 'https://api.meshy.ai/v1/image-to-3d', method: 'POST' },
    { url: 'https://api.meshy.ai/openapi/v2/image-to-3d', method: 'POST' },
    { url: 'https://api.meshy.ai/openapi/v1/image-to-3d', method: 'POST' },
    { url: 'https://api.meshy.ai/api/v2/image-to-3d', method: 'POST' },
    { url: 'https://api.meshy.ai/api/v1/image-to-3d', method: 'POST' }
];

async function testEndpoint(endpoint) {
    console.log(`Testing: ${endpoint.method} ${endpoint.url}`);
    try {
        const response = await axios({
            method: endpoint.method,
            url: endpoint.url,
            data: {
                image_url: testImageUrl,
                enable_pbr: true
            },
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });
        
        console.log('✅ SUCCESS!');
        console.log('Response:', JSON.stringify(response.data, null, 2));
        console.log('\n');
        return endpoint.url;
    } catch (error) {
        console.log('❌ FAILED');
        console.log('Status:', error.response?.status);
        console.log('Error:', error.response?.data?.message || error.message);
        console.log('\n');
        return null;
    }
}

async function runTests() {
    console.log('========================================');
    console.log('TESTING ALL POSSIBLE ENDPOINTS');
    console.log('========================================\n');
    
    for (const endpoint of endpoints) {
        const success = await testEndpoint(endpoint);
        if (success) {
            console.log('🎉 FOUND WORKING ENDPOINT:', success);
            console.log('\n✅ Update server.js with this URL!');
            process.exit(0);
        }
    }
    
    console.log('========================================');
    console.log('❌ NO WORKING ENDPOINTS FOUND');
    console.log('========================================');
    console.log('\nPlease check Meshy documentation at:');
    console.log('https://docs.meshy.ai');
}

runTests();
