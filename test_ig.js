import pkg from 'instagram-url-direct';
const { instagramGetUrl } = pkg;

async function test() {
    try {
        const url = 'https://www.instagram.com/stories/taimaa.homs/3859998701956215367/';
        console.log('Testing URL:', url);
        const result = await instagramGetUrl(url);
        console.log('Result:', result);
    } catch (e) {
        console.error('Error:', e);
    }
}
test();
