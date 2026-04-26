const { Buffer } = require('buffer'); // Use the npm package
try {
    const b = Buffer.from('{"a":1}');
    console.log('Buffer type:', b.constructor.name);
    console.log('JSON.parse(b):', JSON.parse(b));
} catch(e) {
    console.error('Error parsing buffer:', e);
}
