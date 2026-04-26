const { Buffer } = require('buffer');
try {
    const b = Buffer.from('{"a":1}');
    console.log(JSON.parse(b));
} catch(e) {
    console.error(e);
}
