/**
 * ScBee design system. Light canvas: warm paper, ink, one amber signal colour.
 * Display type is Fraunces, interface type is Inter, data and agent-facing text is JetBrains Mono.
 * Agent view inverts the page to a dark terminal so the two audiences are visibly different.
 */
export const CSS = `
@font-face{font-family:"Fraunces";src:url(/fonts/fraunces.woff2) format("woff2");font-weight:100 900;font-style:normal;font-display:swap}
@font-face{font-family:"Fraunces";src:url(/fonts/fraunces-italic.woff2) format("woff2");font-weight:100 900;font-style:italic;font-display:swap}
@font-face{font-family:"Inter";src:url(/fonts/inter.woff2) format("woff2");font-weight:100 900;font-style:normal;font-display:swap}
@font-face{font-family:"JetBrains Mono";src:url(/fonts/jetbrains-mono.woff2) format("woff2");font-weight:400;font-style:normal;font-display:swap}
:root{
  --paper:#ffffff;--paper2:#f5f5f4;--ink:#0d0d0d;--ink2:#3d3d3d;--mute:#737373;--hair:rgba(13,13,13,.16);--hair2:rgba(13,13,13,.08);
  --amber:#f2a20f;--amber-ink:#8a5a00;--ok:#1e7a46;--bad:#b8402a;
  --term:#0f0f10;--term-ink:#ececec;--term-mute:#8f8f8f;--term-line:rgba(236,236,236,.16);
  --serif:"Fraunces",Georgia,"Times New Roman",serif;--sans:"Inter",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;--mono:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  --max:1240px;--gut:clamp(20px,4vw,48px);
}
*{box-sizing:border-box}
:root{color-scheme:light}
[hidden]{display:none!important}
html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}
body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.6 var(--sans);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;overflow-wrap:break-word}
::selection{background:var(--amber);color:var(--ink)}
a{color:inherit;text-decoration-line:underline;text-decoration-color:var(--amber);text-decoration-thickness:2px;text-underline-offset:4px}
a:hover{text-decoration-color:var(--ink)}
h1,h2,h3{font-family:var(--serif);font-weight:380;letter-spacing:-.025em;line-height:1.05;margin:0}
p{margin:0 0 1em}
img,svg,canvas{max-width:100%}
.wrap{max-width:var(--max);margin:0 auto;padding:0 var(--gut)}
.mono{font-family:var(--mono)}
.label{font:400 11px/1.4 var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--mute)}
.mute{color:var(--mute)}
.center{text-align:center}
.small{font-size:14px}
.num-xl{font-size:clamp(88px,13vw,180px)}.num-m{font-size:clamp(72px,9vw,120px)}
.h-l{font-size:clamp(30px,4.4vw,60px)!important;word-break:break-word}.h-m{font-size:26px}
.flush{margin:0!important}
.fixlist{padding-left:20px;color:var(--ink2)}
.tagline{font:italic 360 clamp(22px,2.6vw,34px)/1.2 var(--serif);color:var(--ink);max-width:26em;margin:0 0 1em}
.desc{font-size:17px;color:var(--ink2);max-width:44em}
.map .legend .d-ver,.map .legend .d-proj{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;vertical-align:-1px}
.map .legend .d-ver{background:var(--ink);box-shadow:0 0 0 2px var(--amber)}
.map .legend .d-proj{background:var(--paper);border:1.4px solid var(--mute)}
.mt8{margin-top:8px}.mt16{margin-top:16px}.mt24{margin-top:24px}.mt40{margin-top:40px}
.hide-sm{}
:focus-visible{outline:2px solid var(--ink);outline-offset:3px;border-radius:2px}

/* accessibility helpers */
.skip{position:absolute;left:12px;top:-60px;z-index:50;background:var(--ink);color:var(--paper);padding:10px 16px;border-radius:999px;text-decoration:none;font:500 14px var(--sans);transition:top .15s}
.skip:focus{top:12px}
.sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0;list-style:none}
/* long user text must never widen the page */
.rows>li>*,.post>*,.comp>*,.gapgrid>*,.numerals>*,.split>*,.hero-grid>*,.agent-head>*,.score-head>*,.sec-head>*,.heroside>*{min-width:0}
.rows .nm,.rows .tg,.post h3,.post p,.items li,.tagline,.desc,.lead,.use code,.agent-head h1,.h-l{overflow-wrap:anywhere}
/* header */
header.top{position:sticky;top:0;z-index:20;background:rgba(255,255,255,.88);backdrop-filter:saturate(1.2) blur(10px);border-bottom:1px solid var(--hair2)}
header.top .wrap{display:flex;align-items:center;justify-content:space-between;height:68px;gap:20px}
.brand{display:flex;align-items:center;gap:10px;text-decoration:none;font:420 24px/1 var(--serif);letter-spacing:-.03em}
.brand svg{width:26px;height:26px}
header nav{display:flex;align-items:center;gap:26px}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:40px}.pair>section{min-width:0}@media(max-width:760px){.pair{grid-template-columns:1fr;gap:8px}}.menu{display:none;position:relative}
.menu summary{list-style:none;cursor:pointer;font:400 11px var(--mono);letter-spacing:.08em;text-transform:uppercase;border:1px solid var(--hair);border-radius:999px;padding:7px 14px;color:var(--ink)}
.menu summary::-webkit-details-marker{display:none}
.menu[open] summary{background:var(--ink);color:var(--paper);border-color:var(--ink)}
.menu-panel{position:absolute;right:0;top:calc(100% + 10px);width:min(260px,calc(100vw - 2 * var(--gut)));background:var(--paper);border:1px solid var(--ink);border-radius:6px;padding:8px;display:flex;flex-direction:column;gap:2px;z-index:30}
.menu-panel a{padding:11px 12px;text-decoration:none;font-size:16px;border-radius:4px}
.menu-panel a:hover{background:var(--paper2)}
.menu-panel .btn{margin-top:6px;justify-content:center;color:var(--paper)!important}
header nav a.nl{font:400 12px var(--mono);letter-spacing:.08em;text-transform:uppercase;text-decoration:none;color:var(--ink2)}
header nav a.nl:hover{color:var(--ink);text-decoration:underline;text-decoration-color:var(--amber)}
.view{display:inline-flex;border:1px solid var(--hair);border-radius:999px;padding:3px;font:400 11px var(--mono);letter-spacing:.08em;text-transform:uppercase}
.view a{text-decoration:none;padding:5px 12px;border-radius:999px;color:var(--mute)}
.view a.on{background:var(--ink);color:var(--paper)}
.btn{display:inline-flex;align-items:center;gap:8px;background:var(--ink);color:var(--paper)!important;padding:12px 22px;border:1px solid var(--ink);border-radius:999px;font:500 14px/1.2 var(--sans);text-decoration:none;cursor:pointer;transition:background .15s,color .15s,border-color .15s}
.btn:hover{background:var(--amber);border-color:var(--amber);color:var(--ink)!important}
.btn.ghost{background:transparent;color:var(--ink)!important;border-color:var(--hair)}
.btn.ghost:hover{background:var(--ink);color:var(--paper)!important;border-color:var(--ink)}
.btn.sm{padding:8px 16px;font-size:13px}

/* sections */
.sec{border-top:1px solid var(--hair2);padding:clamp(56px,8vw,120px) 0}
.sec.tight{padding:clamp(40px,5vw,72px) 0}
.sec-head{display:grid;grid-template-columns:minmax(80px,200px) 1fr;gap:24px;align-items:baseline;margin-bottom:clamp(28px,4vw,56px)}
.sec-head h2{font-size:clamp(32px,4.6vw,64px)}
.sec-head .lead{grid-column:2;max-width:42em;margin:12px 0 0}
.lead{font-size:clamp(17px,1.5vw,20px);line-height:1.55;color:var(--ink2)}
em{font-style:italic;font-family:var(--serif);color:var(--ink)}

/* hero */
.hero{padding:clamp(40px,6vw,88px) 0 clamp(40px,6vw,80px)}
.hero-grid{display:grid;grid-template-columns:minmax(0,6.3fr) minmax(0,5.7fr);gap:clamp(24px,4vw,72px);align-items:center}
.display{font-size:clamp(40px,5.7vw,88px);line-height:.98;letter-spacing:-.04em;font-weight:360}
.hero .lead{margin:24px 0 0;max-width:33em}
.paste{display:flex;align-items:center;gap:8px;border-bottom:1.5px solid var(--ink);margin:36px 0 10px;max-width:640px}
.paste input{flex:1;min-width:0;background:transparent;border:0;outline:0;font:400 clamp(18px,2vw,24px)/1.3 var(--sans);padding:14px 0;color:var(--ink)}
.paste input::placeholder{color:var(--mute)}
.paste:focus-within{border-bottom-color:var(--amber);box-shadow:0 1.5px 0 var(--amber)}
.paste button{flex:none;display:grid;place-items:center;width:46px;height:46px;border-radius:50%;border:0;background:var(--ink);color:var(--paper);font-size:20px;cursor:pointer;transition:background .15s,transform .15s}
.paste button:hover{background:var(--amber);color:var(--ink);transform:translateX(2px)}
.paste-note{font:400 12px/1.6 var(--mono);color:var(--mute);max-width:640px}
.paste-note a{color:var(--ink)}
.altform{display:flex;gap:10px;align-items:center;margin-top:14px;max-width:640px}
.altform input{flex:1;min-width:0;background:transparent;border:1px solid var(--hair);border-radius:999px;padding:10px 16px;font:400 14px var(--sans);color:var(--ink)}
.ticker{display:flex;flex-wrap:wrap;gap:0;margin-top:40px;border-top:1px solid var(--hair2);padding-top:18px;font:400 12px var(--mono);color:var(--ink2)}
.ticker span{padding:0 20px 0 0;margin-right:20px;border-right:1px solid var(--hair)}
.ticker span:last-child{border:0}
.ticker b{font-weight:400;color:var(--ink);font-size:15px}
#result{margin-top:14px;font:400 13px/1.6 var(--mono)}
#result pre{background:var(--term);color:var(--term-ink);padding:14px 16px;border-radius:6px;overflow:auto;white-space:pre-wrap;word-break:break-all}
#result.err,.err{color:var(--bad)}

/* hero side: the caption and the map */
.heroside{display:flex;flex-direction:column;gap:12px;min-width:0}
.aside{text-align:right}
.aside-t{font:360 clamp(20px,2vw,28px)/1.15 var(--serif);letter-spacing:-.02em;margin:0}
.aside-s{font:400 12px/1.5 var(--mono);letter-spacing:.02em;color:var(--mute);margin:8px 0 0}
.leader{display:block;margin:4px 0 -2px auto;color:var(--mute)}
.kicker{display:none;font:360 clamp(20px,5.4vw,26px)/1.15 var(--serif);letter-spacing:-.02em;margin:0 0 18px}
.map .legend .d-ghost{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;vertical-align:-1px;border:1.4px dashed var(--ink);background:var(--paper)}
/* living map */
.map{position:relative;border:1px solid var(--hair);border-radius:6px;background:
  radial-gradient(circle at 1px 1px,rgba(13,13,13,.13) 1px,transparent 0) 0 0/22px 22px,var(--paper2);aspect-ratio:1/1.08;overflow:hidden}
.map canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.map .cap{position:absolute;left:14px;top:12px;right:14px;display:flex;justify-content:space-between;pointer-events:none}
.map .legend{position:absolute;left:14px;bottom:12px;right:14px;display:flex;flex-wrap:wrap;gap:6px 16px;font:400 10.5px var(--mono);letter-spacing:.04em;color:var(--ink2);pointer-events:none}
.map .map-msg{position:absolute;left:24px;right:24px;top:45%;text-align:center;font:400 13px/1.5 var(--mono);color:var(--ink2);margin:0}
.map .tip{position:absolute;z-index:3;max-width:240px;background:var(--ink);color:var(--paper);padding:10px 12px;border-radius:4px;font:400 12px/1.45 var(--sans);pointer-events:none;opacity:0;transition:opacity .12s}
.map .tip b{display:block;font:500 13px var(--sans)}
.map .tip.on{opacity:1}

/* rows (ruled lists instead of boxed cards) */
.rows{list-style:none;margin:0;padding:0;border-top:1px solid var(--ink)}
.rows>li{border-bottom:1px solid var(--hair);padding:22px 0;display:grid;grid-template-columns:minmax(0,3fr) minmax(0,5fr) auto;gap:8px 28px;align-items:start}
.rows .nm{font:420 clamp(22px,2.4vw,30px)/1.1 var(--serif);letter-spacing:-.02em}
.rows .nm a{text-decoration:none}.rows .nm a:hover{text-decoration:underline;text-decoration-color:var(--amber)}
.rows .tg{color:var(--ink2)}
.rows .meta{font:400 11px var(--mono);color:var(--mute);letter-spacing:.04em}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.chip{font:400 11px var(--mono);padding:3px 9px;border:1px solid var(--hair);border-radius:999px;color:var(--ink2);letter-spacing:.02em}
.badge{display:inline-flex;align-items:center;gap:6px;font:400 11px var(--mono);letter-spacing:.04em;color:var(--mute)}
.badge::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--hair)}
.badge.ok{color:var(--ok)}.badge.ok::before{background:var(--ok)}

/* the gap */
.gapgrid{display:grid;grid-template-columns:repeat(3,1fr);border-top:1px solid var(--ink)}
.gapgrid>div{padding:28px 32px 32px 0;border-right:1px solid var(--hair);display:flex;flex-direction:column;gap:0}
.gapgrid>div+div{padding-left:32px}
.gapgrid>div:last-child{border-right:0}
.gapgrid h3{font:420 clamp(22px,2.2vw,30px)/1.12 var(--serif);letter-spacing:-.02em;margin:14px 0 12px}
.gapgrid p{color:var(--ink2);font-size:15.5px;margin:0 0 22px}
.gapgrid .answer{margin-top:auto;border-top:1px solid var(--hair);padding-top:14px;font-size:15px;color:var(--ink)}
.gapgrid .answer .label{display:block;margin-bottom:6px;color:var(--amber-ink)}
/* specimen numerals */
.numerals{display:grid;grid-template-columns:repeat(3,1fr);border-top:1px solid var(--ink)}
.numerals>div{padding:28px 28px 32px 0;border-right:1px solid var(--hair)}
.numerals>div+div{padding-left:28px}
.numerals>div:last-child{border:0}
.numerals .n{font:300 clamp(64px,9vw,132px)/.9 var(--serif);letter-spacing:-.05em;color:var(--ink)}
.numerals .n small{font-size:.32em;letter-spacing:0;color:var(--mute)}
.numerals h3{font:500 15px var(--sans);letter-spacing:0;margin:18px 0 6px}
.numerals p{color:var(--ink2);font-size:15px;margin:0}
.tag{display:inline-block;margin-top:14px;font:400 10.5px var(--mono);letter-spacing:.08em;text-transform:uppercase;padding:3px 9px;border:1px solid var(--hair);border-radius:999px;color:var(--mute)}
.measured{margin-top:36px;border:1px solid var(--ink);border-radius:6px;padding:22px 26px;background:var(--paper)}
.measured p{margin:6px 0;color:var(--ink2)}
.measured .label{margin-bottom:10px}

/* two-col editorial */
.split{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,7fr);gap:clamp(24px,5vw,80px);align-items:start}
.list{list-style:none;margin:0;padding:0}
.list>li{border-top:1px solid var(--hair);padding:14px 0}
.list>li:last-child{border-bottom:1px solid var(--hair)}
.specimen{border:1px solid var(--ink);border-radius:6px;background:var(--paper);padding:clamp(20px,3vw,36px)}
.ring{display:block}

/* board */
.posts{list-style:none;margin:0;padding:0;border-top:1px solid var(--ink)}
.post{border-bottom:1px solid var(--hair);padding:22px 0;display:grid;grid-template-columns:150px minmax(0,1fr);gap:8px 28px}
.post h3{font:420 clamp(20px,2vw,26px)/1.15 var(--serif);margin:0 0 6px}
.post p{margin:0 0 8px;color:var(--ink2)}
.kind{font:400 11px var(--mono);letter-spacing:.1em;text-transform:uppercase}
.kind-offer{color:var(--ok)}.kind-wanted{color:var(--amber-ink)}.kind-launch{color:#2f5fb8}
.by{font:400 12px var(--mono);color:var(--mute)}
.tabs{display:flex;gap:6px;flex-wrap:wrap;margin:24px 0 18px}
.tab{font:400 12px var(--mono);letter-spacing:.08em;text-transform:uppercase;text-decoration:none;padding:7px 14px;border:1px solid var(--hair);border-radius:999px;color:var(--ink2)}
.tab.on{background:var(--ink);color:var(--paper);border-color:var(--ink)}
.search{display:flex;gap:8px;max-width:520px;margin:6px 0 28px}
.search input{flex:1;min-width:0;background:transparent;border:1px solid var(--hair);border-radius:999px;padding:11px 18px;font:400 15px var(--sans);color:var(--ink)}

/* pages */
.page{padding:clamp(40px,6vw,88px) 0 clamp(56px,8vw,112px)}
.page h1{font-size:clamp(40px,6vw,84px);line-height:.98;letter-spacing:-.035em;margin-bottom:20px}
.page .lead{max-width:40em}
.h2s{font:500 12px var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--mute);margin:44px 0 12px;font-family:var(--mono)}
.prose{max-width:46em}
.prose p,.prose li{font-size:17px;line-height:1.65;color:var(--ink2)}
.prose h2{font-size:30px;margin:40px 0 10px}
.agent-head{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:20px;align-items:end;margin-bottom:8px}
.use{display:flex;align-items:center;justify-content:space-between;gap:14px;background:var(--term);color:var(--term-ink);border-radius:6px;padding:16px 20px;font:400 14px var(--mono);max-width:760px}
.use code{white-space:pre-wrap;word-break:break-word}.use .p{color:var(--amber)}
.use .btn{background:transparent;color:var(--term-ink)!important;border-color:var(--term-line)}
.use .btn:hover{background:var(--amber);color:var(--ink)!important}

/* score page */
.score-head{display:grid;grid-template-columns:auto minmax(0,1fr);gap:clamp(20px,4vw,56px);align-items:center;margin-bottom:12px}
.band{display:inline-block;font:400 11px var(--mono);letter-spacing:.1em;text-transform:uppercase;padding:4px 12px;border:1px solid var(--ink);border-radius:999px}
.fixes{border:1px solid var(--ink);border-radius:6px;padding:22px 26px;margin:28px 0;background:var(--paper)}
.fixes h2{font:500 12px var(--mono);letter-spacing:.1em;text-transform:uppercase;margin-bottom:10px}
.fixes ol{margin:0;padding-left:20px}.fixes li{padding:5px 0}
.comps{border-top:1px solid var(--ink);margin:28px 0}
.comp{border-bottom:1px solid var(--hair);padding:20px 0;display:grid;grid-template-columns:minmax(0,3fr) minmax(0,9fr);gap:8px 32px}
.comp h3{font:420 22px var(--serif)}
.comp .sc{font:400 12px var(--mono);color:var(--mute);margin-top:4px}
.comp meter{width:100%;height:4px;margin:0 0 10px;-webkit-appearance:none;appearance:none;display:block}
.comp meter::-webkit-meter-bar{background:var(--hair2);border:0;border-radius:2px;height:4px}
.comp meter::-webkit-meter-optimum-value,.comp meter::-webkit-meter-suboptimum-value,.comp meter::-webkit-meter-even-less-good-value{background:var(--ink);border-radius:2px}
.items{list-style:none;margin:0;padding:0;display:grid;gap:7px}
.items li{font-size:14.5px;line-height:1.5;color:var(--ink2)}
.items li::before{display:inline-block;width:18px;font-family:var(--mono)}
.items .ok::before{content:"\\2713";color:var(--ok)}
.items .no::before{content:"\\00d7";color:var(--bad)}
.items strong{color:var(--ink);font-weight:500}
.items .fix{display:block;margin-left:18px;color:var(--mute);font-size:13.5px}
.share{display:flex;gap:10px;flex-wrap:wrap;margin:14px 0}
.note{font:400 12px/1.6 var(--mono);color:var(--mute)}
.galaxy{display:block;width:100%;height:auto;border-radius:6px;background:var(--paper2);border:1px solid var(--hair);margin-bottom:14px}

/* gallery */
.gal-list{list-style:none;margin:12px 0 36px;padding:0;border-top:1px solid var(--ink)}
.gal-card{display:grid;grid-template-columns:64px minmax(0,1fr);gap:20px;align-items:center;border-bottom:1px solid var(--hair);padding:18px 0;text-decoration:none}
.gal-card:hover strong{text-decoration:underline;text-decoration-color:var(--amber)}
.gal-score{font:300 40px/1 var(--serif);letter-spacing:-.04em}

/* forms */
.reg{display:flex;gap:10px;max-width:640px;margin:0 0 12px}
.reg input,.mform input,.mform textarea,.mform select{font:400 15px var(--sans);padding:12px 14px;border:1px solid var(--hair);border-radius:4px;background:var(--paper);color:var(--ink)}
.reg input{flex:1;min-width:0}
.mform{display:grid;gap:16px;margin-top:24px;max-width:720px}
.mform label{display:grid;gap:6px;font:500 13px var(--sans)}
.mform label .mute{font-weight:400}
.mrow{display:flex;gap:10px;flex-wrap:wrap}
#k{flex:1;min-width:0}
.card{border:1px solid var(--hair);border-radius:6px;padding:22px;background:var(--paper)}

/* agent view */
.agentview{background:var(--term);color:var(--term-ink);border-radius:6px;padding:clamp(20px,3vw,36px);font:400 13.5px/1.7 var(--mono);white-space:pre-wrap;word-break:break-word;overflow:auto;margin:0}
.agentview a{color:var(--amber)}
.agent-note{font:400 12px/1.6 var(--mono);color:var(--mute);margin:0 0 14px}

/* inverted block */
.invert{background:var(--term);color:var(--term-ink)}
.invert .label,.invert .mute{color:var(--term-mute)}
.invert h2{color:var(--term-ink)}
.invert .lead{color:#c9c9c9}
.invert em{color:var(--term-ink)}
.invert .use{background:rgba(236,236,236,.06);border:1px solid var(--term-line)}
.codebox{background:rgba(236,236,236,.05);border:1px solid var(--term-line);border-radius:6px;padding:22px 24px;font:400 13px/1.75 var(--mono);color:var(--term-ink);overflow:auto;white-space:pre-wrap}
.codebox .c{color:var(--term-mute)}.codebox .k{color:var(--amber)}

/* footer */
.foot{border-top:1px solid var(--hair2);padding:56px 0 28px;overflow:hidden}
.foot-grid{display:grid;grid-template-columns:minmax(0,5fr) repeat(3,minmax(0,2fr));gap:32px}
.foot .fh{font:400 11px var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--mute);margin:0 0 12px}
.foot a{display:block;text-decoration:none;padding:3px 0;font-size:14.5px;color:var(--ink2)}
.foot a:hover{color:var(--ink);text-decoration:underline;text-decoration-color:var(--amber)}
.foot .say{font:380 clamp(22px,2.6vw,34px)/1.15 var(--serif);letter-spacing:-.02em;max-width:14em}
.word{font:360 clamp(96px,21vw,300px)/.8 var(--serif);letter-spacing:-.06em;color:var(--ink);opacity:.07;margin:56px 0 -2vw;white-space:nowrap;user-select:none}
.fine{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-top:12px;font:400 11px var(--mono);color:var(--mute)}

@media (max-width:980px){
  .hero-grid,.split{grid-template-columns:1fr}
  .aside{display:none}
  .kicker{display:block}
  .map{aspect-ratio:1/1.1}
  .rows>li{grid-template-columns:1fr}
  .numerals,.gapgrid{grid-template-columns:1fr}
  .gapgrid>div{border-right:0;border-bottom:1px solid var(--hair);padding:24px 0}
  .gapgrid>div+div{padding-left:0}
  .numerals>div{border-right:0;border-bottom:1px solid var(--hair);padding:24px 0}
  .numerals>div+div{padding-left:0}
  .sec-head{grid-template-columns:1fr}.sec-head .lead{grid-column:1}
  .post{grid-template-columns:1fr}
  .comp{grid-template-columns:1fr}
  .foot-grid{grid-template-columns:1fr 1fr}.foot-grid>:first-child{grid-column:1/-1}
}
@media (max-width:720px){
  .hide-sm{display:none!important}
  .menu{display:block}
  header nav{gap:14px}
  .brand{font-size:21px}
  .score-head{grid-template-columns:1fr}
  .agent-head{grid-template-columns:1fr}
  .ticker span{padding-right:14px;margin-right:14px}
  .altform,.reg,.search{flex-direction:column;align-items:stretch}
}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important;scroll-behavior:auto!important}}
`;
