/**
 * Spotify Debug Script
 * Run: node scripts/test-spotify.js
 * 
 * Tests all 3 methods used by SpotifyService.ts and prints exactly
 * what each API returns so you can see where the artist name is lost.
 */

// ─── CONFIG ─────────────────────────────────────────────────────────────────
// Paste ANY Spotify track URL here to test
const TEST_URL = 'https://open.spotify.com/track/3n3Ppam7vgaVa1iaRUIOKE'; // Shape of You - Ed Sheeran
// Also try with your own track ID - paste a regional track to test
// const TEST_URL = 'https://open.spotify.com/track/YOUR_TRACK_ID_HERE';

const TRACK_ID = TEST_URL.match(/track\/([a-zA-Z0-9]+)/)?.[1];

if (!TRACK_ID) {
    console.error('❌ Could not extract track ID from URL. Update TEST_URL in the script.');
    process.exit(1);
}

console.log('═'.repeat(60));
console.log('🎵 SPOTIFY DEBUG SCRIPT');
console.log('═'.repeat(60));
console.log('Track ID:', TRACK_ID);
console.log('URL:', TEST_URL);
console.log('');

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
};

// ─── METHOD 1: oEmbed ────────────────────────────────────────────────────────
async function testOEmbed() {
    console.log('─'.repeat(60));
    console.log('📡 METHOD 1: oEmbed API');
    console.log('─'.repeat(60));
    const url = `https://open.spotify.com/oembed?url=${encodeURIComponent(TEST_URL)}`;
    console.log('Request URL:', url);
    try {
        const res = await fetch(url, { headers: HEADERS });
        console.log('Status:', res.status, res.statusText);
        if (res.ok) {
            const data = await res.json();
            console.log('\n✅ Full oEmbed response:');
            console.log(JSON.stringify(data, null, 2));
            console.log('\n📌 Key fields:');
            console.log('  title       :', data.title);
            console.log('  author_name :', data.author_name, data.author_name ? '✅' : '❌ MISSING');
            console.log('  thumbnail_url:', data.thumbnail_url);
        } else {
            console.log('❌ Request failed');
            const text = await res.text();
            console.log('Response body:', text.slice(0, 300));
        }
    } catch (e) {
        console.log('❌ Exception:', e.message);
    }
    console.log('');
}

// ─── METHOD 2: Embed page __NEXT_DATA__ ──────────────────────────────────────
async function testEmbedPage() {
    console.log('─'.repeat(60));
    console.log('🔍 METHOD 2: Embed page __NEXT_DATA__ JSON');
    console.log('─'.repeat(60));
    const url = `https://open.spotify.com/embed/track/${TRACK_ID}`;
    console.log('Request URL:', url);
    try {
        const res = await fetch(url, { headers: HEADERS });
        console.log('Status:', res.status, res.statusText);
        if (res.ok) {
            const html = await res.text();
            const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
            if (match) {
                console.log('\n✅ Found __NEXT_DATA__');
                const nextData = JSON.parse(match[1]);

                // Try all known paths
                const entity =
                    nextData?.props?.pageProps?.state?.data?.entity ||
                    nextData?.props?.pageProps?.track ||
                    nextData?.props?.pageProps?.data?.track?.track;

                if (entity) {
                    console.log('\n📌 Parsed entity:');
                    console.log('  name         :', entity.name, entity.name ? '✅' : '❌');
                    const rawArtists = entity.artists?.items || entity.artists || [];
                    const artistNames = rawArtists.map(a => a.profile?.name || a.name || '?').join(', ');
                    console.log('  artists      :', artistNames, artistNames ? '✅' : '❌ MISSING');
                    console.log('  album.name   :', entity.album?.name);
                    const imgs = entity.album?.images?.items || entity.album?.images || [];
                    console.log('  album images :', imgs.length, 'found');
                    console.log('  duration     :', entity.duration?.totalMilliseconds || entity.duration_ms, 'ms');

                    console.log('\n📦 Full entity structure (keys only):');
                    console.log(JSON.stringify(Object.keys(entity), null, 2));
                    
                    console.log('\n📦 Full entity (first 3000 chars):');
                    console.log(JSON.stringify(entity, null, 2).slice(0, 3000));
                } else {
                    console.log('❌ Entity not found in __NEXT_DATA__');
                    console.log('\nAvailable pageProps keys:', Object.keys(nextData?.props?.pageProps || {}));
                    console.log('\nFull __NEXT_DATA__ (first 2000 chars):');
                    console.log(JSON.stringify(nextData, null, 2).slice(0, 2000));
                }
            } else {
                console.log('❌ __NEXT_DATA__ script tag not found in HTML');
                console.log('\nHTML snippet (first 2000 chars):');
                console.log(html.slice(0, 2000));
            }
        } else {
            console.log('❌ Request failed');
            const text = await res.text();
            console.log('Response:', text.slice(0, 300));
        }
    } catch (e) {
        console.log('❌ Exception:', e.message);
    }
    console.log('');
}

// ─── METHOD 3: OG tag scraping ───────────────────────────────────────────────
async function testOGFallback() {
    console.log('─'.repeat(60));
    console.log('🕸️  METHOD 3: Open Graph tag scraping');
    console.log('─'.repeat(60));
    console.log('Request URL:', TEST_URL);
    try {
        const res = await fetch(TEST_URL, { headers: HEADERS });
        console.log('Status:', res.status, res.statusText);
        if (res.ok) {
            const html = await res.text();
            const getMeta = (prop) => {
                const m = html.match(new RegExp(`<meta property="${prop}" content="(.*?)"`, 'i')) ||
                          html.match(new RegExp(`<meta content="(.*?)" property="${prop}"`, 'i'));
                return m ? m[1] : null;
            };
            const title = getMeta('og:title');
            const desc = getMeta('og:description');
            const image = getMeta('og:image');
            console.log('\n📌 OG tags found:');
            console.log('  og:title       :', title, title ? '✅' : '❌');
            console.log('  og:description :', desc, desc ? '✅' : '❌');
            console.log('  og:image       :', image ? image.slice(0, 80) + '...' : null);
            if (desc) {
                const parts = desc.split(' · ');
                console.log('\n  Description parts split by " · ":', parts);
                console.log('  → Extracted artist would be:', parts[0]);
            }
        } else {
            console.log('❌ Request failed');
        }
    } catch (e) {
        console.log('❌ Exception:', e.message);
    }
    console.log('');
}

// ─── Run all tests ────────────────────────────────────────────────────────────
(async () => {
    await testOEmbed();
    await testEmbedPage();
    await testOGFallback();
    console.log('═'.repeat(60));
    console.log('✅ Debug complete. Check output above for which method works.');
    console.log('═'.repeat(60));
})();
