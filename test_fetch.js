// Simulate fast path
async function test() {
    const url = "https://instagram.fdac24-2.fna.fbcdn.net/o1/v/t2/f2/m367/AQNHFsmmhStBuuchjuP8KOgYgew1ORMYnnWjFaTNSnePXeGX-Tgf03wj1TveoIdKFyS2JRhZTAmaL2_OM6mcjdbJEqBost15HBN4rDc.mp4?_nc_cat=111&_nc_oc=AdqpEaTIjFded9gO10vH2lA2ffwT_6fpxx1Y-_Vd-oI3cOaEtOFW0zhALQ1zJaojtzQ&_nc_sid=5e9851&_nc_ht=instagram.fdac24-2.fna.fbcdn.net&_nc_ohc=C8lWR-JB3GgQ7kNvwFettek&efg=eyJ2ZW5jb2RlX3RhZyI6Inhwdl9wcm9ncmVzc2l2ZS5JTlNUQUdSQU0uU1RPUlkuQzMuMTA4MC5kYXNoX2Jhc2VsaW5lXzEwODBwX3YxIiwieHB2X2Fzc2V0X2lkIjoxNzkxNzc2MDMxMDMyMDQwNiwiYXNzZXRfYWdlX2RheXMiOjAsInZpX3VzZWNhc2VfaWQiOjEwMTAwLCJkdXJhdGlvbl9zIjoyMCwidXJsZ2VuX3NvdXJjZSI6Ind3dyJ9&ccb=17-1&vs=6cbbfafa7464e4e3&_nc_vs=HBksFQIYQGlnX2VwaGVtZXJhbC8xQjQyNDJBQjBCM0E1QTVENzU0RTE2QTJDRkU4QTk5QV92aWRlb19kYXNoaW5pdC5tcDQVAALIARIAFQIYUWlnX3hwdl9wbGFjZW1lbnRfcGVybWFuZW50X3YyLzBGNEFDRTM1MEU4QTRBNkYyREI0QkU2N0FFMDM3MkEzX2F1ZGlvX2Rhc2hpbml0Lm1wNBUCAsgBEgAoABgAGwKIB3VzZV9vaWwBMRJwcm9ncmVzc2l2ZV9yZWNpcGUBMRUAACas9Lyn9YbUPxUCKAJDMywXQDQAAAAAAAAYFmRhc2hfYmFzZWxpbmVfMTA4MHBfdjERAHXoB2XonQEA&_nc_gid=mvYWjPdjilJNf27QYD3TmQ&_nc_zt=28&_nc_ss=7a32e&oh=00_Afz7cBRWdfTYLTCsiKv6kieiro3FyFlic0_RGH02X9LEeA&oe=69C99568";
    
    console.log("Fetching...", url.includes('fbcdn.net'));
    try {
        const resp = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }});
        console.log("OK?", resp.ok, resp.status);
    } catch(e) { console.error(e) }
}
test();
