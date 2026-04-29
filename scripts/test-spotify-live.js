// Quick live test with real valid track IDs
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const TRACKS = [
    { id: '4iV5W9uYEdYUVa79Axb7Rh', desc: 'Blinding Lights - The Weeknd (EN)' },
    { id: '0V3wPSX9ygBnCm8psDIegu', desc: 'Anti-Hero - Taylor Swift (EN)' },
];

async function testTrack(trackId, desc) {
    console.log('\n' + '═'.repeat(60));
    console.log(`🎵 ${desc}`);
    console.log('   Track ID:', trackId);
    console.log('═'.repeat(60));

    // oEmbed
    try {
        const url = `https://open.spotify.com/oembed?url=https://open.spotify.com/track/${trackId}`;
        const res = await fetch(url, { headers: { 'User-Agent': UA } });
        console.log('[oEmbed] Status:', res.status);
        if (res.ok) {
            const d = await res.json();
            console.log('[oEmbed] title:', d.title);
            console.log('[oEmbed] author_name:', d.author_name || '(EMPTY!)');
            console.log('[oEmbed] thumbnail_url:', (d.thumbnail_url || '').slice(0, 80));
            console.log('[oEmbed] All keys:', Object.keys(d));
        } else {
            const t = await res.text();
            console.log('[oEmbed] ERROR body:', t.slice(0, 200));
        }
    } catch (e) {
        console.log('[oEmbed] EXCEPTION:', e.message);
    }

    // Embed page
    try {
        const url = `https://open.spotify.com/embed/track/${trackId}`;
        const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'text/html' } });
        console.log('\n[Embed] Status:', res.status);
        const html = await res.text();
        console.log('[Embed] HTML length:', html.length);

        const scriptTagPattern = '__NEXT_DATA__';
        const hasNextData = html.includes(scriptTagPattern);
        console.log('[Embed] Has __NEXT_DATA__:', hasNextData);

        if (hasNextData) {
            const startIdx = html.indexOf(scriptTagPattern);
            const jsonStart = html.indexOf('>', startIdx) + 1;
            const jsonEnd = html.indexOf('</script>', jsonStart);
            const jsonStr = html.slice(jsonStart, jsonEnd);
            console.log('[Embed] JSON length:', jsonStr.length);

            const nd = JSON.parse(jsonStr);
            const pp = nd?.props?.pageProps;
            console.log('[Embed] pageProps keys:', Object.keys(pp || {}));
            console.log('[Embed] pageProps.status:', pp?.status);

            // Search all paths
            const paths = {
                'state.data.entity': pp?.state?.data?.entity,
                'track': pp?.track,
                'data.track.track': pp?.data?.track?.track,
                'serverSideTrackData.data.trackUnion': pp?.serverSideTrackData?.data?.trackUnion,
            };

            for (const [path, val] of Object.entries(paths)) {
                if (val) {
                    const rawArtists = val.artists?.items || val.artists || [];
                    const names = rawArtists.map(a => a.profile?.name || a.name || '?').join(', ');
                    console.log(`[Embed] ✅ Found entity at [${path}]`);
                    console.log('  name:', val.name);
                    console.log('  artists:', names);
                    console.log('  album.name:', val.album?.name);
                } 
            }

            const anyFound = Object.values(paths).some(Boolean);
            if (!anyFound) {
                console.log('[Embed] ❌ No entity at any known path');
                // Show what IS in state.data
                if (pp?.state?.data) {
                    console.log('[Embed] state.data keys:', Object.keys(pp.state.data));
                }
                // First 2000 chars of pageProps to discover the structure
                console.log('[Embed] pageProps preview:', JSON.stringify(pp).slice(0, 2000));
            }
        }
    } catch (e) {
        console.log('[Embed] EXCEPTION:', e.message);
    }

    // OG tags from main page
    try {
        const res = await fetch(`https://open.spotify.com/track/${trackId}`, { headers: { 'User-Agent': UA } });
        console.log('\n[OG] Status:', res.status);
        const html = await res.text();
        const getOg = (prop) => {
            const m = html.match(new RegExp(`<meta property="${prop}" content="(.*?)"`, 'i')) ||
                      html.match(new RegExp(`<meta content="(.*?)" property="${prop}"`, 'i'));
            return m ? m[1] : null;
        };
        console.log('[OG] og:title:', getOg('og:title') || '(null)');
        console.log('[OG] og:description:', getOg('og:description') || '(null)');
        console.log('[OG] og:image exists:', !!getOg('og:image'));
    } catch (e) {
        console.log('[OG] EXCEPTION:', e.message);
    }
}

(async () => {
    for (const t of TRACKS) {
        await testTrack(t.id, t.desc);
    }
    console.log('\n' + '═'.repeat(60));
    console.log('Done!');
})();
