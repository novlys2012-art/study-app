// Study modes carried over from kviz-final. Split further as features are rebuilt.
import { FU_Q, BOOK, ACC, GRP, FU_T } from "../data/fu.js";
import { MAT_G, MAT_Q, MAT_T, MAT_CALC, MAT_CT } from "../data/mat.js";
import { ES_TOPICS, ES_GLOSS, ES_TR, ES_CARDS } from "../data/es.js";

// Odkaz na Google formulár na nahlasovanie chýb. {id} a {q} sa nahradia číslom a textom otázky.
// Ak je prázdny, tlačidlo skopíruje text hlásenia do schránky.
const REPORT_URL = "";
// Odkazy na aktuálne znenie predpisov na Slov-Lex (bez dátumu = vždy platné znenie)
const SL="https://www.slov-lex.sk/ezbierky/pravne-predpisy/SK/ZZ/";
const LAWS=[
 {re:/431\/2002|o účtovníctve|ZoÚ/i,name:"Zákon o účtovníctve (431/2002)",url:SL+"2002/431/"},
 {re:/23054\/2002|postup\w* účtovani|opatreni\w* MF|opatreni\w* minister/i,name:"Postupy účtovania (opatrenie 23054/2002-92)",url:SL+"2002/740/"},
 {re:/595\/2003|dani z príjmov|ZDP/i,name:"Zákon o dani z príjmov (595/2003)",url:SL+"2003/595/"},
 {re:/513\/1991|obchodn\w* zákonník/i,name:"Obchodný zákonník (513/1991)",url:SL+"1991/513/"},
 {re:/566\/2001|o cenných papieroch/i,name:"Zákon o cenných papieroch (566/2001)",url:SL+"2001/566/"}
];
// ===== Predmety. Nový predmet = nový riadok: vlastné otázky (q), témy (t) a kľúč pre postup (key).
// soon:true zobrazí kartu „pripravujeme“ bez otázok.
const SUBJECTS=[
  {id:"fu",code:"FÚ",name:"Finančné účtovníctvo",term:"ZS 2026",q:FU_Q,t:FU_T,key:"fu-kviz-postup-v1",extras:true,acct:true,tabs:["quiz","book","acc"],
   title:"Testové otázky na precvičenie",
   lede:()=>FU_Q.length+" otázok, "+BOOK.length+" cvičení na zaúčtovanie a zoznam účtov. Ťukni na číslo účtu a zobrazí sa jeho názov.",
   foot:"Otázky pripravili študenti, zdroje odkazujú na prezentácie Ing. Martiny Mateášovej, PhD. Ak nájdeš chybu v otázke, napíš autorovi kvízu. Stránka anonymne počíta návštevy, bez cookies a osobných údajov.",
   extra:()=>[[BOOK.length,"cvičení na zaúčtovanie"]]},
  // Španielčina nemá otázky s možnosťami, ale zošit s cvičeniami (workbook), pozri ES_TOPICS nižšie
  {id:"es",code:"ES",name:"Španielčina A1–A2",term:"ZS 2026",q:[],t:{},key:"cuaderno-es:v1",workbook:true,
   title:"Cuaderno de español",
   lede:()=>ES_TOPICS.length+" tém a "+ES_EXN+" cvičení z prezentácií z hodín, k tomu kartičky so slovíčkami, test naprieč témami, časovanie slovies a zoznam tvojich chýb.",
   foot:"Cvičenia vychádzajú z prezentácií z hodín španielčiny. Postup sa ukladá iba v tomto prehliadači."},
  // Matematika: teória zo skúšok, príklady (téma pr) sú nové podľa ich vzoru; g = graf alebo vzorec, a = pole pri viacerých správnych odpovediach
  {id:"mat",code:"MAT",name:"Matematika I",term:"ZS 2026",q:MAT_Q,t:MAT_T,key:"mat-kviz-postup-v1",html:true,calc:true,tabs:["quiz","calc"],
   title:"Teória a príklady zo skúšok",
   lede:()=>MAT_Q.filter(x=>x.t!=="pr").length+" teoretických otázok zo skúšok a "+MAT_Q.filter(x=>x.t==="pr").length+" nových príkladov s možnosťami. V záložke Príklady na výpočet je ďalších "+MAT_CALC.length+" príkladov, kde výsledok napíšeš sám. Grafy sú prekreslené zo skúšok.",
   foot:"Teoretické otázky sú zo skúšok z Matematiky I, príklady na precvičenie sú nové podľa ich vzoru. Kde bola na skúške označená nesprávna odpoveď, vysvetlenie to spomína. Postup sa ukladá iba v tomto prehliadači.",
   extra:()=>[[MAT_CALC.length,"príkladov na výpočet"]]},
];
const HOME_FOOT="Postup sa ukladá iba v tomto prehliadači, pre každý predmet zvlášť. Ak nájdeš chybu v otázke, napíš autorovi kvízu.";
let CUR=null,QUESTIONS=[],TOPICS={};
const L="ABCD";
const $=id=>document.getElementById(id);
let picked=new Set();const corr=x=>Array.isArray(x.a)?x.a:[x.a];
let list=[],i=0,score=0,wrong=[],answered=false,count="20",topic="all",mode="all",order=[];
// stabilné ID otázky z jej textu, aby postup prežil pridanie nových otázok
function hid(s){let h=5381;for(let k=0;k<s.length;k++)h=((h<<5)+h+s.charCodeAt(k))>>>0;return h.toString(36).slice(-5).padStart(5,"0")}
SUBJECTS.forEach(sj=>sj.q.forEach(x=>{if(!x.id)x.id=hid(x.t+"|"+x.q)}));
let KEY="";
let P={};
function loadProgress(){KEY=CUR.key;try{P=JSON.parse(localStorage.getItem(KEY))||{}}catch(e){P={}}}
function save(){try{localStorage.setItem(KEY,JSON.stringify(P))}catch(e){}}
const PIN=/žiadn|všetk|ani jedn|vyššie|predchádzaj|uveden.{0,10}možnost|\b[a-dA-D]\)|\b[a-dA-D] aj [a-dA-D]\b/i;

const ACCT=/((?<![\d\/.×*:]|[×*:x]\s)(?:MD\s*)?\d{2,3}[x*]?\s*\/\s*(?:D\s*)?\d{2,3}[x*]?(?:\s*\/\s*\d{2,3}[x*]?)*(?![\d\/-]|\s*[=×*]))/g;
const SINGLE=/(?<![\d\/.,§×*:]|[×*:x]\s)(\d{3}|\d{2}[x*])(?![\d.,\/]|\s*(?:%|€|eur|dní|dni|ks|z\.\s?z|[×*:=]|x\s))/gi;
const TYPES={A:"Aktívny",P:"Pasívny",K:"Korekčný (znižuje aktíva)",N:"Nákladový",V:"Výnosový",VI:"Vlastné imanie",Z:"Premenlivý zostatok",U:"Uzávierkový"};
function accInfo(c){
  if(ACC[c])return {n:c,name:ACC[c][0],type:ACC[c][1]};
  if(/^\d{2}[x*]$/.test(c)&&GRP[c.slice(0,2)])return {n:c,name:"Účtová skupina "+c.slice(0,2)+" – "+GRP[c.slice(0,2)],type:null,group:true};
  return null;
}
function tok(c,single){const s=document.createElement("span");s.className="an"+(single?" single":"");s.setAttribute("role","button");s.tabIndex=0;s.dataset.a=c;s.textContent=c;return s}
function addSingles(el,part){
  let last=0;SINGLE.lastIndex=0;let m;
  while((m=SINGLE.exec(part))){
    const before=part.slice(Math.max(0,m.index-4),m.index);
    if(!accInfo(m[1])||/(č\.|§)\s*$/.test(before))continue;
    if(m.index>last)el.appendChild(document.createTextNode(part.slice(last,m.index)));
    el.appendChild(tok(m[1],true));last=m.index+m[1].length;
  }
  if(last<part.length)el.appendChild(document.createTextNode(part.slice(last)));
}
function fill(el,text){
  el.textContent="";
  if(CUR&&CUR.html){el.innerHTML=String(text);return}
  if(CUR&&!CUR.acct){el.textContent=String(text);return}
  String(text).split(ACCT).forEach((part,k)=>{
    if(!part)return;
    if(k%2){
      const s=document.createElement("span");s.className="acct";
      part.split(/(\d{2,3}[x*]?)/).forEach((p,j)=>{if(!p)return;if(j%2&&accInfo(p))s.appendChild(tok(p));else s.appendChild(document.createTextNode(p))});
      el.appendChild(s);
    } else addSingles(el,part);
  });
}
function accountsIn(text){
  const set=new Set();
  String(text).split(ACCT).forEach((part,k)=>{
    if(k%2)(part.match(/\d{2,3}[x*]?/g)||[]).forEach(c=>{if(ACC[c])set.add(c)});
    else{SINGLE.lastIndex=0;let m;while((m=SINGLE.exec(part))){const b=part.slice(Math.max(0,m.index-4),m.index);if(ACC[m[1]]&&!/(č\.|§)\s*$/.test(b))set.add(m[1])}}
  });
  return set;
}
function shuffle(a){a=a.slice();for(let k=a.length-1;k>0;k--){const j=Math.floor(Math.random()*(k+1));[a[k],a[j]]=[a[j],a[k]]}return a}
let quizView="setup";
function show(id){
  ["home","setup","quiz","end","book","acc","calc","es"].forEach(s=>$(s).hidden=s!==id);
  $("esKeys").hidden=true;$("mKeys").hidden=true;document.body.classList.remove("es-keys-on");
  $("tabs").hidden=id==="home"||!CUR||!CUR.tabs;[...$("tabs").children].forEach(b=>b.hidden=!CUR||!CUR.tabs||!CUR.tabs.includes(b.dataset.v));$("crumb").hidden=id==="home";
  if(["setup","quiz","end"].includes(id))quizView=id;
  const v=["book","acc","calc"].includes(id)?id:"quiz";
  [...$("tabs").children].forEach(b=>{if(b.dataset.v===v)b.setAttribute("aria-current","page");else b.removeAttribute("aria-current")});
  closePop();window.scrollTo({top:0});
}

function pool(){
  let l=topic==="all"?QUESTIONS:QUESTIONS.filter(x=>x.t===topic);
  if(mode==="new")l=l.filter(x=>!P[x.id]);
  if(mode==="wrong")l=l.filter(x=>P[x.id]&&P[x.id].l===0);
  return l;
}
function updAvail(){
  const n=pool().length;
  $("avail").textContent=n?("Dostupných otázok: "+n+(count!=="all"&&n>+count?", v kole bude "+count+".":".")):(mode==="wrong"?"Zatiaľ nemáš žiadne chyby v tejto téme.":"V tejto téme si už videl všetky otázky.");
  $("go").disabled=!n;$("go").style.opacity=n?1:.5;
}
function setupProgress(){
  const ids=Object.keys(P).filter(id=>QUESTIONS.some(x=>x.id===id));
  const seen=ids.length,ok=ids.filter(id=>P[id].l===1).length;
  const box=$("prog");box.innerHTML="";
  [["videné",seen+" / "+QUESTIONS.length],["naposledy správne",ok],["na zopakovanie",seen-ok]].forEach(([a,b])=>{const s=document.createElement("span");const bb=document.createElement("b");bb.textContent=b;s.append(bb," "+a);box.appendChild(s)});
  $("progWrap").hidden=!seen;$("confirm").hidden=true;$("reset").hidden=false;
}
function setup(){
  setupProgress();
  const box=$("topics");box.innerHTML="";
  const rows=[["all","Všetky témy",QUESTIONS.length]].concat(Object.keys(TOPICS).map(k=>[k,TOPICS[k],QUESTIONS.filter(x=>x.t===k).length]).filter(r=>r[2]));
  rows.forEach(([k,name,n])=>{
    const lab=document.createElement("label");lab.className="topic";
    const inp=document.createElement("input");inp.type="radio";inp.name="topic";inp.value=k;inp.id="topic-"+k;inp.checked=k===topic;
    inp.onchange=()=>{topic=k;updAvail()};
    const s=document.createElement("span");s.textContent=name;
    const c=document.createElement("span");c.className="n";c.textContent=n;
    lab.append(inp,s,c);box.appendChild(lab);
  });
  show("setup");updAvail();
}
$("reset").onclick=()=>{$("confirm").hidden=false;$("reset").hidden=true};
$("no").onclick=()=>{$("confirm").hidden=true;$("reset").hidden=false};
$("yes").onclick=()=>{P={};save();setup()};
$("modes").onclick=e=>{const b=e.target.closest("button");if(!b)return;mode=b.dataset.m;[...$("modes").children].forEach(x=>x.setAttribute("aria-pressed",x===b));updAvail()};
function pressCount(b){[...$("counts").querySelectorAll("button")].forEach(x=>x.setAttribute("aria-pressed",x===b))}
$("counts").onclick=e=>{const b=e.target.closest("button");if(!b)return;count=b.dataset.n;pressCount(b);$("customN").value="";$("customN").classList.remove("on");updAvail()};
$("customN").oninput=()=>{
  const v=parseInt($("customN").value,10);
  if(v>=1){count=String(v);pressCount(null);$("customN").classList.add("on")}
  else{count="20";pressCount($("counts").querySelector('[data-n="20"]'));$("customN").classList.remove("on")}
  updAvail();
};
$("go").onclick=()=>{
  let l=shuffle(pool());if(!l.length)return;
  if(count!=="all")l=l.slice(0,+count);
  try{window.goatcounter&&window.goatcounter.count&&window.goatcounter.count({path:"kolo/"+topic+"/"+mode,title:"Kolo: "+(TOPICS[topic]||"Všetky témy"),event:true})}catch(e){}
  start(l);
};
function start(qs){list=qs;i=0;score=0;wrong=[];show("quiz");render()}
function render(){
  const x=list[i];answered=false;
  $("qtopic").textContent=TOPICS[x.t]||"";
  $("pos").textContent=String(i+1).padStart(2,"0")+" / "+String(list.length).padStart(2,"0")+"  ·  správne "+score;
  $("pg").style.width=(i/list.length*100)+"%";
  fill($("q"),x.q);
  const g=$("qfig");g.innerHTML=x.g?(typeof MAT_G!=="undefined"&&MAT_G[x.g])||x.g:"";g.hidden=!x.g;
  const multi=Array.isArray(x.a);picked=new Set();$("multi").hidden=!multi;$("check").hidden=!multi;$("check").disabled=true;$("check").style.opacity=.5;
  order=x.o.map((_,k)=>k);
  if(!x.o.some(o=>PIN.test(o)))order=shuffle(order);
  const box=$("opts");box.innerHTML="";
  order.forEach((oi,k)=>{
    const b=document.createElement("button");b.type="button";b.className="opt";
    const kk=document.createElement("span");kk.className="k";kk.textContent=L[k];
    const tt=document.createElement("span");tt.className="t";fill(tt,x.o[oi]);
    if(multi)b.setAttribute("aria-pressed","false");
    b.append(kk,tt);b.onclick=()=>answer(k);box.appendChild(b);
  });
  $("fb").hidden=true;$("more").hidden=true;$("next").hidden=true;
}
function answer(k){
  if(answered)return;
  const x=list[i];
  if(Array.isArray(x.a)){
    const b=$("opts").children[k];if(picked.has(k))picked.delete(k);else picked.add(k);
    b.setAttribute("aria-pressed",picked.has(k));$("check").disabled=!picked.size;$("check").style.opacity=picked.size?1:.5;return;
  }
  grade(new Set([k]));
}
function grade(sel){
  answered=true;
  const x=list[i],C=new Set(corr(x).map(a=>order.indexOf(a))),ok=C.size===sel.size&&[...sel].every(n=>C.has(n));
  if(ok)score++;else wrong.push(x);
  const r=P[x.id]||{n:0,c:0};r.n++;if(ok)r.c++;r.l=ok?1:0;P[x.id]=r;save();
  [...$("opts").children].forEach((b,n)=>{b.setAttribute("aria-disabled","true");b.removeAttribute("aria-pressed");if(C.has(n)){b.classList.add("ok");if(!sel.has(n)&&Array.isArray(x.a))b.classList.add("missed")}else if(sel.has(n))b.classList.add("no");else b.classList.add("dim")});
  $("check").hidden=true;
  $("qid").textContent="Otázka #"+x.id;$("toast").hidden=true;
  const fb=$("fb");fb.className="fb "+(ok?"good":"bad");
  const cl=[...C].sort().map(n=>L[n]);
  $("verdict").textContent=ok?"Správne.":"Nesprávne. "+(cl.length>1?"Správne odpovede sú "+cl.slice(0,-1).join(", ")+" a "+cl[cl.length-1]+".":"Správna odpoveď je "+cl[0]+".");
  const m=$("more");m.innerHTML="";
  const p=document.createElement("p");fill(p,x.e);m.appendChild(p);
  if(x.x){const pp=document.createElement("p");const b=document.createElement("strong");b.textContent="Príklad: ";pp.appendChild(b);const s=document.createElement("span");fill(s,x.x);pp.appendChild(s);m.appendChild(pp)}
  const src=document.createElement("div");src.className="src";src.textContent="Zdroj: "+x.s;m.appendChild(src);
  const found=LAWS.filter(l=>l.re.test(x.e+" "+(x.x||"")+" "+x.s));
  if(found.length){const w=document.createElement("div");w.className="laws";const lb=document.createElement("span");lb.className="src";lb.textContent="Aktuálne znenie:";w.appendChild(lb);
    found.forEach(l=>{const a=document.createElement("a");a.href=l.url;a.target="_blank";a.rel="noopener";a.textContent=l.name+" ↗";w.appendChild(a)});m.appendChild(w)}
  m.hidden=true;$("toggle").textContent="Zobraziť vysvetlenie";fb.hidden=false;
  $("pos").textContent=String(i+1).padStart(2,"0")+" / "+String(list.length).padStart(2,"0")+"  ·  správne "+score;
  $("next").textContent=i===list.length-1?"Zobraziť výsledok":"Ďalšia otázka";$("next").hidden=false;$("next").focus({preventScroll:true});
}
$("toggle").onclick=()=>{const m=$("more");m.hidden=!m.hidden;$("toggle").textContent=m.hidden?"Zobraziť vysvetlenie":"Skryť vysvetlenie"};
$("report").onclick=()=>{
  const x=list[i];
  if(REPORT_URL){const u=REPORT_URL.replace("{id}",encodeURIComponent(x.id)).replace("{q}",encodeURIComponent(x.q));const a=document.createElement("a");a.href=u;a.target="_blank";a.rel="noopener";document.body.appendChild(a);a.click();a.remove();return}
  const pl=s=>{if(!CUR||!CUR.html)return String(s);const d=document.createElement("div");d.innerHTML=s;return d.textContent};
  const txt="Chyba v otázke #"+x.id+": "+pl(x.q)+"\nOznačená odpoveď: "+corr(x).map(a=>pl(x.o[a])).join(" | ")+"\nČo je zle: ";
  const done=m=>{$("toast").textContent=m;$("toast").hidden=false};
  try{navigator.clipboard.writeText(txt).then(()=>done("Skopírované, pošli to autorovi kvízu."),()=>done("Číslo otázky: #"+x.id))}catch(e){done("Číslo otázky: #"+x.id)}
};
$("check").onclick=()=>{if(!answered&&picked.size)grade(new Set(picked))};
$("next").onclick=()=>{i++;i<list.length?render():finish()};
$("quit").onclick=()=>{list=list.slice(0,answered?i+1:i);list.length?finish():setup()};
function finish(){
  show("end");
  const n=list.length,pct=Math.round(score/n*100);
  $("final").innerHTML="";$("final").append(score+" / "+n);const sm=document.createElement("small");sm.textContent=" "+pct+" %";$("final").appendChild(sm);
  $("note").textContent=pct>=90?"Výborne, túto časť máš zvládnutú.":pct>=70?"Dobrý výsledok. Prejdi si otázky nižšie.":"Oplatí sa vrátiť k prezentáciám a skúsiť kolo znova.";
  const ul=$("miss");ul.innerHTML="";
  wrong.forEach(x=>{const li=document.createElement("li");const q=document.createElement("div");fill(q,x.q);const a=document.createElement("div");a.className="a";fill(a,"Správne: "+corr(x).map(k=>x.o[k]).join(" · "));li.append(q,a);ul.appendChild(li)});
  $("missWrap").hidden=!wrong.length;$("retry").hidden=!wrong.length;
}
$("retry").onclick=()=>start(shuffle(wrong));
$("again").onclick=setup;
document.addEventListener("keydown",e=>{
  if(e.key==="Escape"){closePop();return}
  if((e.key==="Enter"||e.key===" ")&&document.activeElement&&document.activeElement.classList.contains("an")){e.preventDefault();openPop(document.activeElement.dataset.a,document.activeElement);return}
  if($("quiz").hidden||e.metaKey||e.ctrlKey||e.altKey)return;
  const n="1234".indexOf(e.key)>=0?"1234".indexOf(e.key):"abcd".indexOf(e.key.toLowerCase());
  if(!answered&&n>=0&&n<order.length){e.preventDefault();answer(n)}
  else if(!answered&&e.key==="Enter"&&!$("check").hidden&&picked.size){e.preventDefault();$("check").click()}
  else if(answered&&e.key==="Enter"&&document.activeElement!==$("toggle")){e.preventDefault();$("next").click()}
});
// ===== Popup s názvom účtu
const QCOUNT={},BCOUNT={};
FU_Q.forEach(x=>{accountsIn([x.q].concat(x.o,[x.e,x.x||""]).join(" | ")).forEach(c=>{(QCOUNT[c]=QCOUNT[c]||[]).push(x)})});
BOOK.forEach(b=>{b.md.concat(b.d).forEach(c=>{BCOUNT[c]=(BCOUNT[c]||0)+1})});
function closePop(){const p=$("pop");if(p)p.hidden=true}
function openPop(c,anchor){
  const info=accInfo(c);if(!info)return;
  const p=$("pop");p.innerHTML="";
  const top=document.createElement("div");top.className="top";
  const n=document.createElement("span");n.className="num";n.textContent=info.n;top.appendChild(n);
  if(info.type){const ch=document.createElement("span");ch.className="chip";ch.textContent=TYPES[info.type];top.appendChild(ch)}
  const nm=document.createElement("div");nm.className="nm";nm.textContent=info.name;
  p.append(top,nm);
  if(!info.group){
    const qs=QCOUNT[c]||[],bc=BCOUNT[c]||0;
    const mt=document.createElement("div");mt.className="meta2";mt.textContent="V otázkach: "+qs.length+" · v cvičeniach Zaúčtuj to: "+bc;p.appendChild(mt);
    if(qs.length){const b=document.createElement("button");b.type="button";b.className="tiny";b.textContent="Precvičiť otázky s účtom "+c;b.onclick=()=>{closePop();start(shuffle(qs))};p.appendChild(b)}
  }
  p.hidden=false;
  const r=anchor.getBoundingClientRect(),w=p.offsetWidth;
  let left=r.left+window.scrollX;left=Math.max(window.scrollX+16,Math.min(left,window.scrollX+document.documentElement.clientWidth-w-16));
  p.style.left=left+"px";p.style.top=(r.bottom+window.scrollY+6)+"px";
}
document.addEventListener("click",e=>{
  const t=e.target.closest(".an");
  if(t){
    if(t.closest("#opts")&&!answered)return;
    e.stopPropagation();e.preventDefault();openPop(t.dataset.a,t);return;
  }
  if(!e.target.closest("#pop"))closePop();
},true);
window.addEventListener("resize",closePop);

// ===== Prepínanie častí
$("tabs").onclick=e=>{const b=e.target.closest("button");if(!b)return;const v=b.dataset.v;
  if(v==="quiz"){if(quizView==="setup")setup();else show(quizView)}
  else if(v==="book")bookOpen();else if(v==="calc")calcOpen();else accOpen();
  try{history.replaceState(null,"","#"+(v==="quiz"?CUR.id:v==="book"?"zauctuj":v==="calc"?"mat-vypocty":"ucty"))}catch(e){}
};

// ===== Zaúčtuj to
BOOK.forEach(b=>{b.id=hid("b|"+b.q)});
const BKEY="fu-zauctuj-v1";let BP={};
try{BP=JSON.parse(localStorage.getItem(BKEY))||{}}catch(e){BP={}}
let bTopicSel="all",bList=[],bi=0,bDone=false,bRight=0,bSeen=0,bTipLvl=0;
const CLS_SHORT={"0":"dlhodobý majetok","1":"zásoby","2":"finančné účty","3":"zúčtovacie vzťahy","4":"kapitálové účty a dlhodobé záväzky","5":"náklady","6":"výnosy","7":"uzávierkové účty"};
function tipLine(side,codes,lvl){
  const c=codes[0],i=accInfo(c)||{name:"",type:null};
  const row=document.createElement("div");
  const s=document.createElement("b");s.textContent=side+": ";row.appendChild(s);
  if(lvl===1)row.append((TYPES[i.type]||"Účet").toLowerCase()+" účet (trieda "+c[0]+" – "+CLS_SHORT[c[0]]+")");
  else if(lvl===2)row.append(codes.map(x=>(accInfo(x)||{name:""}).name).join(" alebo "));
  else row.append(codes.map(x=>x+" – "+(accInfo(x)||{name:""}).name).join(" alebo "));
  return row;
}
function showTip(){
  const x=bList[bi],box=$("bTip");box.innerHTML="";
  const h=document.createElement("div");h.className="lvl";h.textContent=["","Tip 1 z 3: typ účtu","Tip 2 z 3: názov účtu","Tip 3 z 3: číslo účtu"][bTipLvl];
  box.append(h,tipLine("MD",x.md,bTipLvl),tipLine("D",x.d,bTipLvl));box.hidden=false;
  $("bTipBtn").textContent=bTipLvl<3?"Ďalší tip ("+(bTipLvl+1)+"/3)":"Tip (3/3)";$("bTipBtn").disabled=bTipLvl>=3;$("bTipBtn").style.opacity=bTipLvl>=3?.5:1;
}
$("bTipBtn").onclick=()=>{if(bDone||bTipLvl>=3)return;bTipLvl++;showTip()};
const fine=window.matchMedia&&matchMedia("(pointer:fine)").matches;
function bookOpen(){
  const box=$("bTopics");box.innerHTML="";
  [["all","Všetky"]].concat(Object.keys(FU_T).filter(k=>BOOK.some(b=>b.t===k)).map(k=>[k,FU_T[k]])).forEach(([k,name])=>{
    const n=k==="all"?BOOK.length:BOOK.filter(b=>b.t===k).length;
    const b=document.createElement("button");b.type="button";b.textContent=name+" ("+n+")";b.setAttribute("aria-pressed",k===bTopicSel);
    b.onclick=()=>{bTopicSel=k;[...box.children].forEach(x=>x.setAttribute("aria-pressed",x===b));bStart()};box.appendChild(b);
  });
  show("book");if(!bList.length)bStart();else bRender();
}
function bStart(){bList=shuffle(bTopicSel==="all"?BOOK:BOOK.filter(b=>b.t===bTopicSel));bi=0;bRight=0;bSeen=0;bRender()}
function nameHint(v){const c=(v.match(/\d{3}/)||[""])[0];if(!c)return"";const i=accInfo(c);return i?i.name:"Tento účet nie je v zozname."}
function bRender(){
  const x=bList[bi];bDone=false;
  $("bTopic").textContent=FU_T[x.t]||"";
  const mastered=BOOK.filter(b=>BP[b.id]===1).length;
  $("bPos").textContent="správne "+bRight+" z "+bSeen+"  ·  zvládnuté "+mastered+" / "+BOOK.length;
  fill($("bQ"),x.q);
  ["bMd","bD"].forEach(id=>{const i=$(id);i.value="";i.className="";i.readOnly=false;$(id+"N").textContent=""});
  $("bFb").hidden=true;$("bNext").hidden=true;$("bActions").hidden=false;
  bTipLvl=0;$("bTip").hidden=true;$("bTipBtn").textContent="Tip";$("bTipBtn").disabled=false;$("bTipBtn").style.opacity=1;
  if(fine)$("bMd").focus({preventScroll:true});
}
["bMd","bD"].forEach(id=>{$(id).addEventListener("input",()=>{$(id+"N").textContent=nameHint($(id).value)})});
function code(v){return (String(v).match(/\d{3}/)||[""])[0]}
function bCheck(reveal){
  if(bDone)return;
  const x=bList[bi],m=code($("bMd").value),d=code($("bD").value);
  if(!reveal&&(!m||!d)){$((!m?"bMd":"bD")).focus();return}
  bDone=true;
  const okM=!reveal&&x.md.includes(m),okD=!reveal&&x.d.includes(d),ok=okM&&okD;
  bSeen++;if(ok)bRight++;BP[x.id]=ok&&!bTipLvl?1:0;try{localStorage.setItem(BKEY,JSON.stringify(BP))}catch(e){}
  if(!reveal){$("bMd").className=okM?"good":"bad";$("bD").className=okD?"good":"bad"}
  $("bMd").readOnly=true;$("bD").readOnly=true;
  const fb=$("bFb");fb.className="fb "+(ok?"good":"bad");
  $("bVerdict").textContent=reveal?"Riešenie:":ok?(bTipLvl?"Správne, s tipom. Bez tipu sa to započíta ako zvládnuté.":"Správne."):(okM?"Strana MD je správne, strana D nie.":okD?"Strana D je správne, strana MD nie.":"Nesprávne.");
  fill($("bSol"),"MD "+x.md.join(" alebo ")+" / D "+x.d.join(" alebo "));
  const mo=$("bMore");mo.innerHTML="";
  const names=document.createElement("p");names.className="hint";
  names.textContent=[...new Set(x.md.concat(x.d))].map(c=>c+" – "+(accInfo(c)||{name:""}).name).join(" · ");
  const p=document.createElement("p");fill(p,x.e);
  const s=document.createElement("div");s.className="src";s.textContent="Zdroj: "+x.s;
  mo.append(names,p,s);
  fb.hidden=false;$("bActions").hidden=true;$("bNext").hidden=false;
  $("bPos").textContent="správne "+bRight+" z "+bSeen+"  ·  zvládnuté "+BOOK.filter(b=>BP[b.id]===1).length+" / "+BOOK.length;
  $("bNext").focus({preventScroll:true});
}
$("bCheck").onclick=()=>bCheck(false);
$("bShow").onclick=()=>bCheck(true);
$("bForm").onsubmit=e=>{e.preventDefault();bCheck(false)};
["bMd","bD"].forEach(id=>$(id).addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();if(id==="bMd"&&!code($("bD").value))$("bD").focus();else bCheck(false)}}));
$("bNext").onclick=()=>{bi++;if(bi>=bList.length){bList=shuffle(bList);bi=0}bRender()};

// ===== Zoznam účtov
const CLASSES={"0":"Trieda 0 – Dlhodobý majetok","1":"Trieda 1 – Zásoby","2":"Trieda 2 – Finančné účty","3":"Trieda 3 – Zúčtovacie vzťahy","4":"Trieda 4 – Kapitálové účty a dlhodobé záväzky","5":"Trieda 5 – Náklady","6":"Trieda 6 – Výnosy","7":"Trieda 7 – Uzávierkové účty a podsúvahové účty"};
let aMode="all";
$("aMode").onclick=e=>{const b=e.target.closest("button");if(!b)return;aMode=b.dataset.m;[...$("aMode").children].forEach(x=>x.setAttribute("aria-pressed",x===b));accRender()};
function accOpen(){show("acc");accRender()}
function accRender(){
  const q=($("aSearch").value||"").trim().toLowerCase();
  const norm=s=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  const qq=norm(q);
  const list=$("aList");list.innerHTML="";let any=false;
  Object.keys(CLASSES).forEach(cl=>{
    const codes=Object.keys(ACC).filter(c=>c[0]===cl&&(aMode==='all'||QCOUNT[c]||BCOUNT[c])&&(!qq||c.startsWith(qq)||norm(ACC[c][0].toLowerCase()).includes(qq))).sort();
    if(!codes.length)return;any=true;
    const g=document.createElement("div");g.className="agroup";
    const h=document.createElement("h3");h.textContent=CLASSES[cl];g.appendChild(h);
    codes.forEach(c=>{
      const r=document.createElement("div");r.className="arow";
      const n=document.createElement("span");n.className="n";n.textContent=c;
      const nm=document.createElement("span");nm.className="nm";nm.textContent=ACC[c][0];
      const ch=document.createElement("span");ch.className="chip";ch.textContent=TYPES[ACC[c][1]];
      const sub=document.createElement("div");sub.className="sub";
      const qs=QCOUNT[c]||[],bc=BCOUNT[c]||0;
      if(qs.length||bc){const info=document.createElement("span");info.textContent="otázky: "+qs.length+" · cvičenia: "+bc;sub.appendChild(info)}
      if(qs.length){const b=document.createElement("button");b.type="button";b.className="link";b.textContent="Precvičiť otázky";b.onclick=()=>start(shuffle(qs));sub.appendChild(b)}
      sub.prepend(ch);r.append(n,nm,sub);g.appendChild(r);
    });
    list.appendChild(g);
  });
  if(!any){const p=document.createElement("p");p.className="empty";p.textContent="Žiadny účet nezodpovedá hľadaniu „"+q+"“.";list.appendChild(p)}
}
$("aSearch").addEventListener("input",accRender);
(function(){const dl=$("acctlist");Object.keys(ACC).sort().forEach(c=>{const o=document.createElement("option");o.value=c;o.label=c+" – "+ACC[c][0];o.textContent=c+" – "+ACC[c][0];dl.appendChild(o)})})();

function setLook(l){if(l)document.body.dataset.look=l;else delete document.body.dataset.look;[...$("looks").querySelectorAll("button")].forEach(b=>b.setAttribute("aria-pressed",b.dataset.l===l));try{localStorage.setItem("fu-kviz-vzhlad",l)}catch(e){}}
$("looks").onclick=e=>{const b=e.target.closest("button");if(b)setLook(b.dataset.l)};
// Predvolený vzhľad je Kocky; uložená voľba (aj prázdna = Účtovná kniha) má prednosť
let look0=null;try{look0=localStorage.getItem("fu-kviz-vzhlad")}catch(e){}
setLook(look0==null?"kocky":look0);
// ===== Preklad: slovenské vety (tlačidlo Preklad) a slovník slov a fráz (ťuknutie na slovo)


// V týchto cvičeniach by preklad slov prezradil odpoveď
const ES_NOGLOSS=new Set(["saludos-0","presente-2","genero-plural-0"]);
const ES_GKEYS=new Map(Object.entries(ES_GLOSS).filter(([,v])=>v).map(([k,v])=>[k.toLowerCase(),v]));
const ES_LETTER=/[A-Za-zÁÉÍÓÚÑÜáéíóúñü]+/g;
// Text rozdelí na slová a najdlhšie frázy zo slovníka (do 5 slov) zabalí do klikateľných spanov
function esGlossFrag(text){
  const frag=document.createDocumentFragment(),words=[];let m;ES_LETTER.lastIndex=0;
  while((m=ES_LETTER.exec(text)))words.push({s:m.index,e:m.index+m[0].length,w:m[0].toLowerCase()});
  let pos=0,k=0;
  while(k<words.length){
    let hit=0,key="";
    for(let n=Math.min(5,words.length-k);n>=1;n--){
      let ok=true;for(let j=k;j<k+n-1;j++)if(text.slice(words[j].e,words[j+1].s)!==" "){ok=false;break}
      if(!ok)continue;
      key=words.slice(k,k+n).map(x=>x.w).join(" ");
      if(ES_GKEYS.has(key)){hit=n;break}
    }
    if(!hit){k++;continue}
    const s=words[k].s,e=words[k+hit-1].e;
    if(s>pos)frag.append(text.slice(pos,s));
    const sp=document.createElement("span");sp.className="es-w";sp.tabIndex=0;sp.setAttribute("role","button");sp.dataset.g=key;sp.textContent=text.slice(s,e);
    frag.append(sp);pos=e;k+=hit;
  }
  if(pos<text.length)frag.append(text.slice(pos));
  return frag;
}
function esGlossTree(root){const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),nodes=[];while(w.nextNode())nodes.push(w.currentNode);nodes.forEach(n=>n.replaceWith(esGlossFrag(n.nodeValue)))}
const esPop=document.createElement("div");esPop.className="es-pop";esPop.hidden=true;esPop.setAttribute("role","status");document.body.append(esPop);
let esPopFor=null;
function esPopClose(){esPop.hidden=true;esPopFor=null}
function esPopOpen(sp){
  if(esPopFor===sp){esPopClose();return}
  esPopFor=sp;esPop.textContent="";
  const b=document.createElement("b");b.textContent=sp.textContent;
  const t=document.createElement("span");t.textContent=ES_GKEYS.get(sp.dataset.g);
  esPop.append(b,t);esPop.hidden=false;
  const r=sp.getBoundingClientRect(),vw=document.documentElement.clientWidth,pw=esPop.offsetWidth;
  esPop.style.left=(window.scrollX+Math.max(12,Math.min(r.left,vw-pw-12)))+"px";
  esPop.style.top=(window.scrollY+r.bottom+6)+"px";
}
document.addEventListener("click",e=>{const sp=e.target.closest&&e.target.closest(".es-w");if(sp){esPopOpen(sp);return}if(!esPop.contains(e.target))esPopClose()});
document.addEventListener("keydown",e=>{
  if(e.key==="Escape")esPopClose();
  else if((e.key==="Enter"||e.key===" ")&&document.activeElement&&document.activeElement.classList.contains("es-w")){e.preventDefault();esPopOpen(document.activeElement)}
});
window.addEventListener("resize",esPopClose);
// Tlačidlo, ktoré ukáže alebo skryje slovenský preklad viet cvičenia
function esTrButton(trs,cls){
  if(!trs.length)return null;
  const b=document.createElement("button");b.type="button";b.className=cls;b.textContent="Preklad";b.setAttribute("aria-pressed","false");
  b.onclick=()=>{const on=b.getAttribute("aria-pressed")!=="true";trs.forEach(x=>x.hidden=!on);b.setAttribute("aria-pressed",String(on));b.textContent=on?"Skryť preklad":"Preklad"};
  return b;
}

// ===== Španielčina: režimy precvičovania (moje chyby, kartičky, test, časovanie)
const ESM_K={miss:"cuaderno-es:chyby",cards:"cuaderno-es:karticky",tests:"cuaderno-es:testy",conj:"cuaderno-es:casovanie"};
const ESM_MODES={
  chyby:{t:"Moje chyby",sk:"Vety, v ktorých si urobil chybu. Keď ich vyriešiš správne, zo zoznamu zmiznú."},
  karticky:{t:"Kartičky so slovíčkami",sk:"Slovíčka z hodín. Spomeň si, otoč kartičku a označ, či si vedel."},
  test:{t:"Test naprieč témami",sk:"Náhodné úlohy zo všetkých tém, s časomierou a skóre."},
  casovanie:{t:"Časovanie slovies",sk:"Rýchlo napíš správny tvar slovesa pre danú osobu."}
};
const ESM_TYPING=new Set(["chyby","test","casovanie"]);
let esmTimer=null;
function esmStop(){if(esmTimer){clearInterval(esmTimer);esmTimer=null}}
function esmGet(k,d){try{const v=JSON.parse(localStorage.getItem(k));return v==null?d:v}catch(e){return d}}
function esmSet(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
const esmNorm=s=>(s||"").normalize("NFC").toLowerCase().replace(/[¿?¡!.,;:«»"“”()]/g," ").replace(/\s+/g," ").trim();
const esmBare=s=>esmNorm(s).normalize("NFD").replace(/[̀-ͯ]/g,"");
function esmGrade(v,ans){if(!esmNorm(v))return "empty";if(ans.some(a=>esmNorm(a)===esmNorm(v)))return "ok";if(ans.some(a=>esmBare(a)===esmBare(v)))return "warn";return "bad"}
function esmEl(tag,attrs={},...kids){
  const n=document.createElement(tag);
  for(const [k,v] of Object.entries(attrs)){
    if(k==="class")n.className=v;else if(k==="html")n.innerHTML=v;
    else if(k.startsWith("on"))n.addEventListener(k.slice(2),v);else n.setAttribute(k,v);
  }
  kids.forEach(c=>{if(c!=null)n.append(c)});return n;
}
const esmBtn=(label,fn,ghost)=>esmEl("button",{type:"button",class:"m-btn"+(ghost?" ghost":""),onclick:fn},label);
const esmPts=p=>p%1?String(p).replace(".",","):String(p);
const esmFmt=s=>Math.floor(s/60)+":"+String(Math.floor(s%60)).padStart(2,"0");
function esmShuffle(a){a=a.slice();for(let k=a.length-1;k>0;k--){const j=Math.floor(Math.random()*(k+1));[a[k],a[j]]=[a[j],a[k]]}return a}
function esmChips(opts,val,on,multi){
  const box=esmEl("div",{class:"m-chips"});
  opts.forEach(([v,l])=>{
    const b=esmEl("button",{type:"button","aria-pressed":String(multi?val.has(v):v===val)},l);
    b.onclick=()=>{
      if(multi){if(val.has(v)){if(val.size>1)val.delete(v)}else val.add(v);[...box.children].forEach((x,i)=>x.setAttribute("aria-pressed",String(val.has(opts[i][0]))))}
      else{[...box.children].forEach(x=>x.setAttribute("aria-pressed","false"));b.setAttribute("aria-pressed","true")}
      on(v);
    };
    box.append(b);
  });
  return box;
}
// Ak je začiatok režimu nad okrajom obrazovky, posunie ho späť do pohľadu
function esmTop(el){if(el.getBoundingClientRect().top<0)el.scrollIntoView({block:"start"})}
function esmScoreClass(pct){return pct>=85?"m-good":pct>=55?"m-mid":"m-low"}

/* ---------- chyby: zapisujú sa z každého skontrolovaného cvičenia ---------- */
function esRecord(tid,ei,results){
  const m=esmGet(ESM_K.miss,{});
  results.forEach(([ii,ok])=>{const k=tid+"|"+ei+"|"+ii;if(ok)delete m[k];else m[k]=(m[k]||0)+1});
  esmSet(ESM_K.miss,m);
}
function esMissList(){
  const m=esmGet(ESM_K.miss,{});
  return Object.keys(m).map(k=>{const [tid,ei,ii]=k.split("|");return {tid,ei:+ei,ii:+ii,n:m[k]}})
    .filter(r=>{const t=ES_TOPICS.find(x=>x.id===r.tid);return t&&t.ex[r.ei]&&t.ex[r.ei].items[r.ii]!=null});
}

/* ---------- vykreslenie vybraných úloh z rôznych tém (chyby, test) ---------- */
function esmItems(refs){
  const ol=esmEl("ol",{class:"m-items"}),all=[],trs=[];
  refs.forEach(ref=>{
    const t=ES_TOPICS.find(x=>x.id===ref.tid),ex=t.ex[ref.ei],raw=ex.items[ref.ii];
    const [src,note]=Array.isArray(raw)?raw:[raw,null];
    const key=ref.tid+"-"+ref.ei,gloss=!ES_NOGLOSS.has(key),txt=x=>gloss?esGlossFrag(x):x;
    const it={ref,blanks:[],notes:[]};
    const li=esmEl("li",{},esmEl("span",{class:"m-src"},t.title+" · "+ex.title),esmEl("span",{class:"m-ins"},ex.sk));
    if(ex.context){const c=esmEl("div",{html:ex.context});if(gloss)esGlossTree(c);li.append(esmEl("details",{class:"m-ctx"},esmEl("summary",{},"Text k úlohe"),c))}
    const line=esmEl("div",{class:"m-line"});
    const re=/\{([^}]*)\}|\[([^\]]*)\]/g;let last=0,m;
    while((m=re.exec(src))){
      if(m.index>last)line.append(txt(src.slice(last,m.index)));
      const fb=esmEl("span",{class:"m-fb"});
      if(m[1]!=null&&m[1].startsWith("=")){
        const sel=esmEl("select",{class:"m-blank","aria-label":"odpoveď"},esmEl("option",{value:""},"—"),...ex.pool.map(o=>esmEl("option",{value:o},o)));
        const b={type:"select",el:sel,fb,right:m[1].slice(1)};sel.onchange=()=>esmClear(b);it.blanks.push(b);line.append(sel,fb);
      }else if(m[1]!=null){
        const answers=m[1].split("|").map(s=>s.trim()),len=Math.max(...answers.map(a=>a.length));
        const inp=esmEl("input",{class:"m-blank m-input"+(ex.wide?" wide":""),type:"text",autocomplete:"off",autocapitalize:"off",spellcheck:"false","aria-label":"odpoveď"});
        if(!ex.wide)inp.style.width=Math.min(Math.max(len+2,5),34)+"ch";
        const b={type:"text",el:inp,fb,answers};inp.oninput=()=>esmClear(b);it.blanks.push(b);line.append(inp,fb);
      }else{
        const opts=m[2].split(";").map(s=>s.trim()),wrap=esmEl("span",{class:"m-choice",role:"group"});
        const b={type:"choice",el:wrap,fb,right:opts.map(o=>o.startsWith("*")),picked:-1,btns:[]};
        opts.forEach((o,k)=>{const btn=esmEl("button",{type:"button","aria-pressed":"false"},o.replace(/^\*/,""));btn.onclick=()=>{b.picked=k;b.btns.forEach((x,j)=>x.setAttribute("aria-pressed",String(j===k)));esmClear(b)};b.btns.push(btn);wrap.append(btn)});
        it.blanks.push(b);line.append(wrap,fb);
      }
      last=re.lastIndex;
    }
    if(last<src.length)line.append(txt(src.slice(last)));
    li.append(line);
    const tr=(ES_TR[key]||[])[ref.ii];
    if(tr){const n=esmEl("span",{class:"m-tr",hidden:""},tr);li.append(n);trs.push(n)}
    if(note){const n=esmEl("span",{class:"m-note",hidden:""},note);li.append(n);it.notes.push(n)}
    ol.append(li);all.push(it);
  });
  // Enter skočí na ďalšie políčko
  const inputs=[...ol.querySelectorAll("input")];
  inputs.forEach((inp,k)=>inp.addEventListener("keydown",e=>{if(e.key==="Enter"&&inputs[k+1]){e.preventDefault();inputs[k+1].focus()}}));
  function check(){
    let pts=0,tot=0;const rec={};
    all.forEach(it=>{
      let ok=true;const tried=it.blanks.some(esmTried);
      it.blanks.forEach(b=>{tot++;const r=esmMarkBlank(b);pts+=r;if(r<.5)ok=false});
      if(tried)(rec[it.ref.tid+"|"+it.ref.ei]=rec[it.ref.tid+"|"+it.ref.ei]||[]).push([it.ref.ii,ok]);
      it.notes.forEach(n=>n.hidden=false);
    });
    Object.entries(rec).forEach(([k,v])=>{const [tid,ei]=k.split("|");esRecord(tid,+ei,v)});
    return {pts,tot};
  }
  return {el:ol,check,trBtn:esTrButton(trs,"m-btn ghost")};
}
// Nevyplnené vety sa do chýb nezapisujú
function esmTried(b){return b.type==="choice"?b.picked>=0:!!esmNorm(b.el.value)}
function esmClear(b){b.el.classList.remove("ok","warn","bad","missing");if(b.btns)b.btns.forEach(x=>x.classList.remove("right"));b.fb.textContent="";b.fb.className="m-fb"}
function esmMark(b,s,t){esmClear(b);b.el.classList.add(s);b.fb.className="m-fb "+(s==="missing"?"bad":s);b.fb.textContent=t||""}
function esmMarkBlank(b){
  if(b.type==="text"){
    const g=esmGrade(b.el.value,b.answers);
    if(g==="ok"){esmMark(b,"ok","✓");return 1}
    if(g==="warn"){esmMark(b,"warn","Pozor na diakritiku: "+b.answers.find(a=>esmBare(a)===esmBare(b.el.value)));return .5}
    esmMark(b,"bad","→\u00a0"+b.answers[0]);return 0;
  }
  if(b.type==="select"){if(b.el.value===b.right){esmMark(b,"ok","✓");return 1}esmMark(b,"bad","→\u00a0"+b.right);return 0}
  const showRight=()=>b.btns.forEach((x,k)=>b.right[k]&&x.classList.add("right"));
  if(b.picked<0){esmMark(b,"missing","");showRight();return 0}
  if(b.right[b.picked]){esmMark(b,"ok","✓");return 1}
  esmMark(b,"bad","");showRight();return 0;
}

/* ---------- vstup do režimu ---------- */
function esmRender(box,mode,back){
  esmStop();box.innerHTML="";
  const head=esmEl("div",{class:"m-head"});
  if(back)head.append(esmEl("button",{type:"button",class:"m-link",onclick:back},"← Všetky témy"));
  head.append(esmEl("h2",{},ESM_MODES[mode].t),esmEl("p",{class:"m-sub"},ESM_MODES[mode].sk));
  const body=esmEl("div",{class:"m-body"});
  box.append(head,body);
  ({chyby:esmMistakes,karticky:esmCards,test:esmExam,casovanie:esmConj})[mode](body);
}
function esmModeCount(mode){
  if(mode==="chyby"){const n=esMissList().length;return n?n+" na zopakovanie":"zatiaľ žiadne"}
  if(mode==="karticky"){const st=esmGet(ESM_K.cards,{}),tot=Object.values(ES_CARDS).reduce((s,d)=>s+d.c.length,0);return Object.values(st).filter(v=>v===1).length+" / "+tot}
  if(mode==="test"){const h=esmGet(ESM_K.tests,[]);return h.length?"naposledy "+Math.round(h[0].p/h[0].t*100)+" %":"20 úloh"}
  const h=esmGet(ESM_K.conj,[]);return h.length?"naposledy "+esmPts(h[0].ok)+" / "+h[0].n:ESC_V.length+" slovies";
}

/* ---------- 1. moje chyby ---------- */
function esmMistakes(body){
  body.innerHTML="";
  const list=esMissList().sort((a,b)=>b.n-a.n);
  if(!list.length){body.append(esmEl("div",{class:"m-card"},esmEl("p",{class:"m-hint"},"Zatiaľ tu nič nie je. Keď v cvičení, teste alebo tu skontroluješ odpovede a niečo bude zle, veta sa sem uloží. Po správnom vyriešení zo zoznamu zmizne.")));return}
  const shown=list.slice(0,25),set=esmItems(shown);
  const score=esmEl("span",{class:"m-score","aria-live":"polite"});
  const again=esmBtn("Ďalšie kolo",()=>esmMistakes(body),"ghost");again.hidden=true;
  const check=esmBtn("Skontrolovať",()=>{const r=set.check();score.textContent=esmPts(r.pts)+" / "+r.tot;score.className="m-score "+esmScoreClass(r.pts/r.tot*100);check.hidden=true;again.hidden=false});
  const clear=esmEl("button",{type:"button",class:"m-link"},"Vymazať zoznam chýb");
  const confirm=esmEl("span",{class:"m-confirm",hidden:""},"Naozaj vymazať všetky chyby? ",
    esmBtn("Vymazať",()=>{esmSet(ESM_K.miss,{});esmMistakes(body)},"ghost"),esmBtn("Zrušiť",()=>{confirm.hidden=true;clear.hidden=false},"ghost"));
  clear.onclick=()=>{clear.hidden=true;confirm.hidden=false};
  body.append(esmEl("div",{class:"m-card"},
    esmEl("p",{class:"m-meta"},"Na zopakovanie: "+list.length+(list.length>25?" · zobrazujem 25, ktoré si pokazil najčastejšie":"")),
    set.el,esmEl("div",{class:"m-foot"},check,again,set.trBtn,score),esmEl("div",{},clear,confirm)));
}

/* ---------- 2. kartičky ---------- */
function esmCards(body){
  body.innerHTML="";const st=esmGet(ESM_K.cards,{});
  const rows=esmEl("div",{class:"m-rows"});
  Object.entries(ES_CARDS).forEach(([id,d])=>{
    const known=d.c.filter(c=>st[id+"|"+c[0]]===1).length;
    rows.append(esmEl("button",{type:"button",class:"m-row",onclick:()=>esmDeck(body,id)},
      esmEl("span",{class:"tt"},esmEl("b",{},d.n),esmEl("small",{},d.sk)),
      esmEl("span",{class:"m-pct"+(known===d.c.length?" full":"")},known+" / "+d.c.length)));
  });
  body.append(esmEl("div",{class:"m-card"},esmEl("p",{class:"m-hint"},"Vyber balíček. Pozri sa na slovo, skús si spomenúť a otoč kartičku. Slovíčka, ktoré nevieš, sa vrátia o pár kartičiek neskôr."),rows));
}
function esmDeck(body,id,opts){
  opts=opts||{dir:"es",only:true};
  const d=ES_CARDS[id],st=esmGet(ESM_K.cards,{}),k=c=>id+"|"+c[0];
  let queue=esmShuffle(d.c.filter(c=>!opts.only||st[k(c)]!==1));
  body.innerHTML="";esmTop(body);
  const ctrl=esmEl("div",{class:"m-ctrl"},
    esmChips([["es","ES → SK"],["sk","SK → ES"]],opts.dir,v=>esmDeck(body,id,{...opts,dir:v})),
    esmChips([[true,"Len tie, čo neviem"],[false,"Všetky"]],opts.only,v=>esmDeck(body,id,{...opts,only:v})));
  const stat=esmEl("p",{class:"m-meta"});
  const face=esmEl("div",{class:"m-face"}),back=esmEl("div",{class:"m-back",hidden:""});
  const flash=esmEl("button",{type:"button",class:"m-flash","aria-label":"Otočiť kartičku"},face,back,esmEl("span",{class:"m-turn"},"ťukni a otoč"));
  const yes=esmBtn("Vedel som",()=>know(true)),no=esmBtn("Nevedel som",()=>know(false),"ghost");
  const acts=esmEl("div",{class:"m-foot"},yes,no);
  const keyHint=esmEl("p",{class:"m-hint m-keyhint"},"Na počítači: medzerník otočí kartičku, 1 = vedel som, 2 = nevedel som.");
  const area=esmEl("div",{class:"m-card"},stat,flash,acts,keyHint);
  body.append(esmEl("div",{class:"m-head-row"},esmEl("button",{type:"button",class:"m-link",onclick:()=>esmCards(body)},"← Balíčky"),esmEl("b",{},d.n+" · "+d.sk)),ctrl,area);
  let cur=null;
  function update(){const s=esmGet(ESM_K.cards,{});stat.textContent="Zostáva "+queue.length+(cur?" + 1":"")+" · vieš "+d.c.filter(c=>s[k(c)]===1).length+" / "+d.c.length}
  function next(){
    cur=queue.shift()||null;
    if(!cur){
      area.innerHTML="";
      area.append(esmEl("p",{class:"m-big"},opts.only?"Hotovo, tento balíček už vieš celý.":"Hotovo, prešiel si všetky kartičky."),
        esmEl("div",{class:"m-foot"},esmBtn("Znova všetky",()=>esmDeck(body,id,{...opts,only:false})),esmBtn("Iný balíček",()=>esmCards(body),"ghost")));
      return;
    }
    face.textContent=opts.dir==="es"?cur[0]:cur[1];back.textContent=opts.dir==="es"?cur[1]:cur[0];back.hidden=true;flash.classList.remove("on");update();
  }
  flash.onclick=()=>{back.hidden=!back.hidden;flash.classList.toggle("on",!back.hidden)};
  const onKey=e=>{
    if(!flash.isConnected){document.removeEventListener("keydown",onKey);return}
    if(!cur||e.metaKey||e.ctrlKey||e.altKey||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;
    if(e.key===" "&&e.target.tagName!=="BUTTON"){e.preventDefault();flash.click()}
    else if(e.key==="1"){e.preventDefault();know(true)}
    else if(e.key==="2"){e.preventDefault();know(false)}
  };
  document.addEventListener("keydown",onKey);
  function know(ok){const s=esmGet(ESM_K.cards,{});s[k(cur)]=ok?1:0;esmSet(ESM_K.cards,s);if(!ok)queue.splice(Math.min(3,queue.length),0,cur);next()}
  next();
}

/* ---------- 3. test naprieč témami ---------- */
function esmExam(body,count){
  esmStop();body.innerHTML="";count=count||20;
  const hist=esmGet(ESM_K.tests,[]);
  body.append(esmEl("div",{class:"m-card"},
    esmEl("p",{class:"m-label"},"Počet úloh"),
    esmChips([[10,"10"],[20,"20"],[30,"30"]],count,v=>count=v),
    esmEl("p",{class:"m-hint"},"Úlohy sa vyberú náhodne zo všetkých tém, každé políčko je jeden bod. Časomiera beží od začiatku, kým test neodovzdáš. Chyby sa uložia do Mojich chýb."),
    esmEl("div",{class:"m-foot"},esmBtn("Začať test",()=>esmExamRun(body,count)))));
  if(hist.length){
    const ul=esmEl("ul",{class:"m-hist"});
    hist.slice(0,8).forEach(h=>{const pct=Math.round(h.p/h.t*100);ul.append(esmEl("li",{},
      esmEl("span",{},new Date(h.d).toLocaleDateString("sk-SK")),esmEl("b",{class:esmScoreClass(pct)},pct+" %"),esmEl("span",{},esmPts(h.p)+" / "+h.t),esmEl("span",{},esmFmt(h.s))))});
    body.append(esmEl("div",{class:"m-card"},esmEl("p",{class:"m-label"},"Posledné testy"),ul));
  }
}
function esmExamRun(body,count){
  esmStop();body.innerHTML="";esmTop(body);
  const refs=[];ES_TOPICS.forEach(t=>t.ex.forEach((e,ei)=>e.items.forEach((_,ii)=>refs.push({tid:t.id,ei,ii}))));
  const set=esmItems(esmShuffle(refs).slice(0,count)),t0=Date.now();
  const clock=esmEl("span",{class:"m-clock"},"0:00");
  esmTimer=setInterval(()=>{if(!clock.isConnected){esmStop();return}clock.textContent=esmFmt((Date.now()-t0)/1000)},1000);
  const score=esmEl("span",{class:"m-score","aria-live":"polite"});
  const again=esmBtn("Nový test",()=>esmExam(body,count),"ghost");again.hidden=true;
  const submit=esmBtn("Odovzdať test",()=>{
    esmStop();const sec=Math.round((Date.now()-t0)/1000),r=set.check(),pct=Math.round(r.pts/r.tot*100);
    submit.hidden=true;again.hidden=false;clock.textContent=esmFmt(sec);
    score.textContent=esmPts(r.pts)+" z "+r.tot+" bodov · "+pct+" % · "+esmFmt(sec);score.className="m-score "+esmScoreClass(pct);
    const h=esmGet(ESM_K.tests,[]);h.unshift({d:Date.now(),p:r.pts,t:r.tot,s:sec});esmSet(ESM_K.tests,h.slice(0,20));
  });
  body.append(esmEl("div",{class:"m-card"},esmEl("div",{class:"m-bar"},esmEl("span",{class:"m-meta"},count+" úloh zo všetkých tém"),clock),set.el,esmEl("div",{class:"m-foot"},submit,again,score)));
}

/* ---------- 4. časovanie slovies ---------- */
const ESC_P=["yo","tú","él / ella / usted","nosotros","vosotros","ellos / ustedes"];
const ESC_PSK=["ja","ty","on, ona, vy – zdvorilo","my","vy","oni, vy – viacerí"];
const ESC_G={reg:"Pravidelné",bota:"Slovesá bota",irr:"Nepravidelné",refl:"Zvratné"};
// [neurčitok, význam, skupina, zmena kmeňa alebo vlastné tvary]
const ESC_V=[
 ["hablar","hovoriť","reg"],["estudiar","študovať","reg"],["trabajar","pracovať","reg"],["desayunar","raňajkovať","reg"],["escuchar","počúvať","reg"],["preparar","pripravovať","reg"],
 ["comer","jesť","reg"],["aprender","učiť sa","reg"],["comprender","rozumieť","reg"],["leer","čítať","reg"],["vivir","bývať, žiť","reg"],["escribir","písať","reg"],
 ["querer","chcieť","bota","ie"],["pensar","myslieť","bota","ie"],["empezar","začať","bota","ie"],["cerrar","zatvoriť","bota","ie"],["preferir","mať radšej","bota","ie"],
 ["pedir","pýtať si, objednať","bota","i"],["repetir","opakovať","bota","i"],
 ["poder","môcť","bota","ue"],["volver","vrátiť sa","bota","ue"],["dormir","spať","bota","ue"],["volar","lietať","bota","ue"],["jugar","hrať (sa)","bota","ue"],
 ["ser","byť (kto, aký)","irr",["soy","eres","es","somos","sois","son"]],["estar","byť (kde, ako sa cíti)","irr",["estoy","estás","está","estamos","estáis","están"]],
 ["tener","mať","irr",["tengo","tienes","tiene","tenemos","tenéis","tienen"]],["salir","vyjsť, odísť","irr",["salgo","sales","sale","salimos","salís","salen"]],
 ["llamarse","volať sa","refl"],["levantarse","vstať","refl"],["ducharse","sprchovať sa","refl"],["lavarse","umývať sa","refl"],["peinarse","česať sa","refl"],["bañarse","kúpať sa","refl"],["afeitarse","holiť sa","refl"],
 ["acostarse","ísť spať","refl","ue"],["despertarse","zobudiť sa","refl","ie"],["vestirse","obliecť sa","refl","i"],["sentarse","sadnúť si","refl","ie"],["irse","odísť","refl",["voy","vas","va","vamos","vais","van"]],
];
function escForms(v){
  const [inf,,type,x]=v;
  let forms;
  if(Array.isArray(x))forms=x;
  else{
    const base=type==="refl"?inf.slice(0,-2):inf,stem=base.slice(0,-2);
    const E={ar:["o","as","a","amos","áis","an"],er:["o","es","e","emos","éis","en"],ir:["o","es","e","imos","ís","en"]}[base.slice(-2)];
    let st=stem;
    if(x){const from=x==="ue"?(base==="jugar"?"u":"o"):"e",i=stem.lastIndexOf(from);st=stem.slice(0,i)+x+stem.slice(i+1)}
    forms=E.map((e,k)=>(k===3||k===4?stem:st)+e);
  }
  if(type==="refl"){const pr=["me","te","se","nos","os","se"];forms=forms.map((f,k)=>pr[k]+" "+f)}
  return forms;
}
function esmConj(body,sel){
  esmStop();body.innerHTML="";
  sel=sel||{groups:new Set(Object.keys(ESC_G)),n:20};
  const hist=esmGet(ESM_K.conj,[]);
  body.append(esmEl("div",{class:"m-card"},
    esmEl("p",{class:"m-label"},"Ktoré slovesá"),esmChips(Object.entries(ESC_G),sel.groups,()=>{},true),
    esmEl("p",{class:"m-label"},"Počet otázok"),esmChips([[10,"10"],[20,"20"],[40,"40"]],sel.n,v=>sel.n=v),
    esmEl("p",{class:"m-hint"},"Dostaneš sloveso a osobu, napíš tvar v prítomnom čase a stlač Enter. Pri zvratných slovesách napíš aj zámeno (me levanto)."),
    esmEl("div",{class:"m-foot"},esmBtn("Začať",()=>esmConjRun(body,sel)))));
  if(hist.length){
    const ul=esmEl("ul",{class:"m-hist"});
    hist.slice(0,8).forEach(h=>{const pct=Math.round(h.ok/h.n*100);ul.append(esmEl("li",{},esmEl("span",{},new Date(h.d).toLocaleDateString("sk-SK")),esmEl("b",{class:esmScoreClass(pct)},esmPts(h.ok)+" / "+h.n),esmEl("span",{},esmFmt(h.s))))});
    body.append(esmEl("div",{class:"m-card"},esmEl("p",{class:"m-label"},"Posledné kolá"),ul));
  }
}
function esmConjRun(body,sel){
  esmStop();body.innerHTML="";esmTop(body);
  const pool=[];ESC_V.filter(v=>sel.groups.has(v[2])).forEach(v=>{const f=escForms(v);f.forEach((form,p)=>pool.push({v,p,form}))});
  const qs=esmShuffle(pool).slice(0,sel.n),t0=Date.now(),wrong=[];
  let i=0,ok=0,checked=false;
  const pos=esmEl("span",{class:"m-meta"}),clock=esmEl("span",{class:"m-clock"},"0:00");
  esmTimer=setInterval(()=>{if(!clock.isConnected){esmStop();return}clock.textContent=esmFmt((Date.now()-t0)/1000)},1000);
  const verb=esmEl("p",{class:"m-verb"}),mean=esmEl("p",{class:"m-mean"}),person=esmEl("p",{class:"m-person"});
  const inp=esmEl("input",{class:"m-conj m-input",type:"text",autocomplete:"off",autocapitalize:"off",spellcheck:"false","aria-label":"tvar slovesa"});
  const fb=esmEl("p",{class:"m-fb big"});
  const go=esmBtn("Skontrolovať",step);
  const card=esmEl("div",{class:"m-card"},esmEl("div",{class:"m-bar"},pos,clock),verb,mean,person,inp,fb,esmEl("div",{class:"m-foot"},go));
  body.append(card);
  inp.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();step()}});
  function show(){
    const q=qs[i];checked=false;
    pos.textContent=(i+1)+" / "+qs.length+" · správne "+ok;
    verb.textContent=q.v[0];mean.textContent=q.v[1]+" · "+ESC_G[q.v[2]];
    person.textContent=ESC_P[q.p]+" ("+ESC_PSK[q.p]+")";
    inp.value="";inp.className="m-conj m-input";inp.readOnly=false;fb.textContent="";fb.className="m-fb big";go.textContent="Skontrolovať";inp.focus();
  }
  function step(){
    const q=qs[i];
    if(!checked){
      if(!esmNorm(inp.value)){fb.textContent="Napíš tvar slovesa.";fb.className="m-fb big";inp.focus();return}
      const g=esmGrade(inp.value,[q.form]);checked=true;inp.readOnly=true;
      if(g==="ok"){ok++;inp.classList.add("ok");fb.textContent="✓ "+q.form;fb.classList.add("ok")}
      else if(g==="warn"){ok+=.5;inp.classList.add("warn");fb.textContent="Pozor na diakritiku: "+q.form;fb.classList.add("warn");wrong.push([q,inp.value])}
      else{inp.classList.add("bad");fb.textContent="Správne: "+q.form;fb.classList.add("bad");wrong.push([q,inp.value])}
      pos.textContent=(i+1)+" / "+qs.length+" · správne "+esmPts(ok);
      go.textContent=i+1<qs.length?"Ďalej":"Výsledok";return;
    }
    i++;if(i<qs.length){show();return}
    esmStop();const sec=Math.round((Date.now()-t0)/1000),pct=Math.round(ok/qs.length*100);
    const h=esmGet(ESM_K.conj,[]);h.unshift({d:Date.now(),ok,n:qs.length,s:sec});esmSet(ESM_K.conj,h.slice(0,20));
    card.innerHTML="";
    card.append(esmEl("p",{class:"m-big "+esmScoreClass(pct)},esmPts(ok)+" / "+qs.length),esmEl("p",{class:"m-meta"},pct+" % správne · čas "+esmFmt(sec)));
    if(wrong.length){const ul=esmEl("ul",{class:"m-wrong"});wrong.forEach(([q,a])=>ul.append(esmEl("li",{},esmEl("b",{},q.v[0]+" · "+ESC_P[q.p]),esmEl("span",{}," → "+q.form),esmEl("small",{}," (napísal si: "+a+")"))));card.append(esmEl("p",{class:"m-label"},"Na zopakovanie"),ul)}
    card.append(esmEl("div",{class:"m-foot"},esmBtn("Ďalšie kolo",()=>esmConjRun(body,sel)),esmBtn("Nastavenia",()=>esmConj(body,sel),"ghost")));
  }
  if(!qs.length){card.innerHTML="";card.append(esmEl("p",{class:"m-hint"},"Vyber aspoň jednu skupinu slovies."));return}
  show();
}

const ES_KIND={completar:"doplň",elegir:"vyber","V/F":"pravda / nepravda",relacionar:"priraď",traducir:"prelož"};
const ES_KEY="cuaderno-es:v1";
const ES_EXN=ES_TOPICS.reduce((s,t)=>s+t.ex.length,0);
const ES_ITEMS=ES_TOPICS.reduce((s,t)=>s+t.ex.reduce((a,e)=>a+e.items.length,0),0);
let esBest={},esLast=null;
function esLoad(){try{esBest=JSON.parse(localStorage.getItem(ES_KEY)||"{}")||{}}catch(e){esBest={}}}
function esSave(tid,i,pct){esBest[tid]=esBest[tid]||{};if((esBest[tid][i]??-1)<pct)esBest[tid][i]=pct;try{localStorage.setItem(ES_KEY,JSON.stringify(esBest))}catch(e){}}
function esPct(t){const b=esBest[t.id]||{};return Math.round(t.ex.reduce((s,_,i)=>s+(b[i]||0),0)/t.ex.length)}
function esAll(){esLoad();return Math.round(ES_TOPICS.reduce((s,t)=>s+esPct(t),0)/ES_TOPICS.length)}
const esNorm=s=>(s||"").normalize("NFC").toLowerCase().replace(/[¿?¡!.,;:«»"“”()]/g," ").replace(/\s+/g," ").trim();
const esBare=s=>esNorm(s).normalize("NFD").replace(/[̀-ͯ]/g,"");
function esGrade(v,answers){
  if(!esNorm(v))return "empty";
  if(answers.some(a=>esNorm(a)===esNorm(v)))return "ok";
  if(answers.some(a=>esBare(a)===esBare(v)))return "warn";
  return "bad";
}
function esEl(tag,attrs={},...kids){
  const n=document.createElement(tag);
  for(const [k,v] of Object.entries(attrs)){
    if(k==="class")n.className=v;else if(k==="html")n.innerHTML=v;
    else if(k.startsWith("on"))n.addEventListener(k.slice(2),v);else n.setAttribute(k,v);
  }
  kids.forEach(c=>{if(c!=null)n.append(c)});return n;
}
function esOpen(tid){
  esLoad();show("es");
  const t=ES_TOPICS.find(x=>x.id===tid);
  if(ESM_MODES[tid]){
    esmRender($("es"),tid,()=>esOpen(""));setHash("es-"+tid);
    if(ESM_TYPING.has(tid)){$("esKeys").hidden=false;document.body.classList.add("es-keys-on")}
    return;
  }
  if(!t){esIndex();setHash("es");return}
  esTopic(t);setHash("es-"+t.id);
}
function esIndex(){
  const box=$("es");box.innerHTML="";
  const rows=esEl("div",{class:"es-rows"});
  ES_TOPICS.forEach((t,i)=>{
    const p=esPct(t);
    rows.append(esEl("button",{type:"button",class:"es-row",onclick:()=>esOpen(t.id)},
      esEl("span",{class:"n"},String(i+1).padStart(2,"0")),
      esEl("span",{class:"tt"},esEl("b",{},t.title),esEl("small",{},t.sk)),
      esEl("span",{class:"pct"+(p===100?" full":"")},p?p+" %":t.ex.length+" cvič.")));
  });
  const modes=esEl("div",{class:"es-rows"});
  Object.entries(ESM_MODES).forEach(([id,m])=>modes.append(esEl("button",{type:"button",class:"es-row",onclick:()=>esOpen(id)},
    esEl("span",{class:"n"},"▸"),esEl("span",{class:"tt"},esEl("b",{},m.t),esEl("small",{},m.sk)),esEl("span",{class:"pct"},esmModeCount(id)))));
  box.append(esEl("div",{class:"sheet"},esEl("p",{class:"label"},"Precvičovanie"),modes));
  box.append(esEl("div",{class:"sheet"},
    esEl("p",{class:"label"},"Témy · Temas"),
    esEl("p",{class:"hint"},"Vyber tému. V každej je krátke zhrnutie gramatiky a cvičenia. Odpovede píš do políčok a daj Skontrolovať; chýbajúca diakritika (á, ñ…) sa označí žltou a počíta sa za pol bodu. Ťukni na podčiarknuté slovo a uvidíš jeho preklad, tlačidlo Preklad ukáže celé vety po slovensky."),
    rows));
}
function esTopic(t){
  const box=$("es");box.innerHTML="";
  const i=ES_TOPICS.indexOf(t),prev=ES_TOPICS[i-1],next=ES_TOPICS[i+1];
  box.append(esEl("div",{class:"es-head"},
    esEl("button",{type:"button",class:"link",onclick:()=>esOpen("")},"← Všetky témy"),
    esEl("h2",{},t.title),esEl("p",{class:"sk"},t.sk)));
  box.append(esEl("details",{class:"es-rule",open:""},esEl("summary",{},"Recuerda · Zapamätaj si"),esEl("div",{html:t.recuerda})));
  t.ex.forEach((ex,idx)=>box.append(esExercise(t,ex,idx)));
  const go=x=>()=>esOpen(x.id);
  box.append(esEl("div",{class:"es-pager"},
    prev?esEl("button",{type:"button",class:"link",onclick:go(prev)},"← "+prev.title):esEl("span"),
    next?esEl("button",{type:"button",class:"link",onclick:go(next)},next.title+" →"):esEl("span")));
  $("esKeys").hidden=false;document.body.classList.add("es-keys-on");
}
function esExercise(t,ex,idx){
  const id=t.id+"-"+idx,blanks=[],notes=[],trs=[],tr=ES_TR[id]||[],gloss=!ES_NOGLOSS.has(id);
  const txt=x=>gloss?esGlossFrag(x):x;
  const ol=esEl("ol",{class:"es-items"});
  ex.items.forEach((raw,ik)=>{
    const [src,note]=Array.isArray(raw)?raw:[raw,null],b0=blanks.length;
    const li=esEl("li");const re=/\{([^}]*)\}|\[([^\]]*)\]/g;let last=0,m;
    while((m=re.exec(src))){
      if(m.index>last)li.append(txt(src.slice(last,m.index)));
      const fb=esEl("span",{class:"es-fb"});
      if(m[1]!=null&&m[1].startsWith("=")){
        const sel=esEl("select",{class:"es-blank",id:id+"-b"+blanks.length,"aria-label":"odpoveď"},esEl("option",{value:""},"—"),...ex.pool.map(o=>esEl("option",{value:o},o)));
        const b={type:"select",el:sel,fb,right:m[1].slice(1)};sel.addEventListener("change",()=>esClear(b));blanks.push(b);li.append(sel,fb);
      }else if(m[1]!=null){
        const answers=m[1].split("|").map(s=>s.trim()),len=Math.max(...answers.map(a=>a.length));
        const inp=esEl("input",{class:"es-blank"+(ex.wide?" wide":""),type:"text",id:id+"-b"+blanks.length,autocomplete:"off",autocapitalize:"off",spellcheck:"false","aria-label":"odpoveď"});
        if(!ex.wide)inp.style.width=Math.min(Math.max(len+2,5),34)+"ch";
        const b={type:"text",el:inp,fb,answers};inp.addEventListener("input",()=>esClear(b));blanks.push(b);li.append(inp,fb);
      }else{
        const opts=m[2].split(";").map(s=>s.trim());
        const wrap=esEl("span",{class:"es-choice",role:"group"});
        const b={type:"choice",el:wrap,fb,right:opts.map(o=>o.startsWith("*")),picked:-1,btns:[]};
        opts.forEach((o,k)=>{const btn=esEl("button",{type:"button","aria-pressed":"false",onclick:()=>{b.picked=k;b.btns.forEach((x,j)=>x.setAttribute("aria-pressed",String(j===k)));esClear(b)}},o.replace(/^\*/,""));b.btns.push(btn);wrap.append(btn)});
        blanks.push(b);li.append(wrap,fb);
      }
      last=re.lastIndex;
    }
    if(last<src.length)li.append(txt(src.slice(last)));
    if(tr[ik]){const n=esEl("span",{class:"es-tr",hidden:""},tr[ik]);li.append(n);trs.push(n)}
    if(note){const n=esEl("span",{class:"es-note",hidden:""},note);li.append(n);notes.push(n)}
    for(let q=b0;q<blanks.length;q++)blanks[q].ii=ik;
    ol.append(li);
  });
  const score=esEl("span",{class:"es-score","aria-live":"polite"});
  const check=()=>esCheck(blanks,notes,score,t.id,idx);
  const sec=esEl("section",{class:"sheet es-ex",id},
    esEl("div",{class:"es-ex-head"},esEl("h3",{},(idx+1)+". "+ex.title,esEl("small",{},ex.tsk)),esEl("span",{class:"es-kind"},ex.kind+" · "+(ES_KIND[ex.kind]||""))),
    esEl("p",{class:"es-sk"},ex.sk),
    ex.context?(()=>{const c=esEl("div",{class:"es-ctx",html:ex.context});if(gloss)esGlossTree(c);return c})():null,
    ol,
    esEl("div",{class:"es-foot"},
      esEl("button",{class:"btn",type:"button",onclick:check},"Skontrolovať"),
      esEl("button",{class:"btn ghost",type:"button",onclick:()=>esReveal(blanks,notes)},"Ukázať riešenie"),
      esTrButton(trs,"btn ghost"),
      esEl("button",{class:"link",type:"button",onclick:()=>esReset(blanks,notes,score)},"Vymazať"),
      score));
  // Enter skočí na ďalšie políčko, na poslednom skontroluje cvičenie
  const inputs=blanks.filter(b=>b.type==="text").map(b=>b.el);
  inputs.forEach((inp,k)=>inp.addEventListener("keydown",e=>{if(e.key!=="Enter")return;e.preventDefault();if(inputs[k+1])inputs[k+1].focus();else check()}));
  return sec;
}
function esClear(b){b.el.classList.remove("ok","warn","bad","missing");if(b.btns)b.btns.forEach(x=>x.classList.remove("right"));b.fb.textContent="";b.fb.className="es-fb"}
function esMark(b,state,text){esClear(b);b.el.classList.add(state);b.fb.className="es-fb "+(state==="missing"?"bad":state);b.fb.textContent=text||""}
function esShowRight(b){b.btns.forEach((x,k)=>b.right[k]&&x.classList.add("right"))}
function esCheck(blanks,notes,score,tid,idx){
  let pts=0;
  blanks.forEach(b=>{
    if(b.type==="text"){
      const g=esGrade(b.el.value,b.answers);
      if(g==="ok"){pts++;esMark(b,"ok","✓")}
      else if(g==="warn"){pts+=.5;esMark(b,"warn","Pozor na diakritiku: "+b.answers.find(a=>esBare(a)===esBare(b.el.value)))}
      else esMark(b,"bad","→\u00a0"+b.answers[0]);
    }else if(b.type==="select"){
      if(b.el.value===b.right){pts++;esMark(b,"ok","✓")}else esMark(b,"bad","→\u00a0"+b.right);
    }else{
      if(b.picked<0){esMark(b,"missing","");esShowRight(b)}
      else if(b.right[b.picked]){pts++;esMark(b,"ok","✓")}
      else{esMark(b,"bad","");esShowRight(b)}
    }
  });
  notes.forEach(n=>n.hidden=false);
  const pct=Math.round(pts/blanks.length*100);
  score.textContent=(pts%1?String(pts).replace(".",","):pts)+" / "+blanks.length;
  score.className="es-score "+(pct>=85?"good":pct>=55?"mid":"low");
  esSave(tid,idx,pct);
  // zápis do Mojich chýb: veta je zle, ak má aspoň jedno zlé políčko
  // nevyplnené vety sa nezapisujú
  const items={},tried={};blanks.forEach(b=>{const good=b.el.classList.contains("ok")||b.el.classList.contains("warn");items[b.ii]=(items[b.ii]??true)&&good;if(esmTried(b))tried[b.ii]=true});
  esRecord(tid,idx,Object.entries(items).filter(([ii])=>tried[ii]).map(([ii,ok])=>[+ii,ok]));
}
function esReveal(blanks,notes){
  blanks.forEach(b=>{
    if(b.type==="text"){if(!b.el.classList.contains("ok"))esMark(b,"bad","→\u00a0"+b.answers[0])}
    else if(b.type==="select"){if(b.el.value!==b.right)esMark(b,"bad","→\u00a0"+b.right)}
    else if(!(b.picked>=0&&b.right[b.picked])){esMark(b,b.picked<0?"missing":"bad","");esShowRight(b)}
  });
  notes.forEach(n=>n.hidden=false);
}
function esReset(blanks,notes,score){
  blanks.forEach(b=>{esClear(b);if(b.type==="choice"){b.picked=-1;b.btns.forEach(x=>x.setAttribute("aria-pressed","false"))}else b.el.value=""});
  notes.forEach(n=>n.hidden=true);score.textContent="";score.className="es-score";
}
// Lišta so španielskymi písmenami: vloží znak do posledného políčka, v ktorom si písal
document.addEventListener("focusin",e=>{if(e.target.classList&&(e.target.classList.contains("es-blank")||e.target.classList.contains("m-input"))&&e.target.tagName==="INPUT")esLast=e.target});
["á","é","í","ó","ú","ñ","ü","¿","¡"].forEach(ch=>$("esKeys").append(esEl("button",{type:"button","aria-label":"Napísať "+ch,
  onmousedown:e=>e.preventDefault(),
  onclick:()=>{const inp=esLast;if(!inp||!document.body.contains(inp))return;
    const s=inp.selectionStart??inp.value.length,en=inp.selectionEnd??s;
    inp.value=inp.value.slice(0,s)+ch+inp.value.slice(en);inp.focus();inp.setSelectionRange(s+1,s+1);inp.dispatchEvent(new Event("input"))}},ch)));

// ===== Matematika: zhovievavá kontrola napísaných odpovedí (x2 = x^2 = x², ex = e^x, ln x, inf = ∞, 0,5 = 1/2 …)
const MC=(()=>{
const SUP={"⁰":"0","¹":"1","²":"2","³":"3","⁴":"4","⁵":"5","⁶":"6","⁷":"7","⁸":"8","⁹":"9","⁻":"-","⁺":"+"};
const NAMES=["odmocnina","sqrt","exp","abs","log","ln","sin","cos","tg","tan","pi","e","x","y"];
const FN={sqrt:Math.sqrt,odmocnina:Math.sqrt,exp:Math.exp,abs:Math.abs,log:Math.log,ln:Math.log,sin:Math.sin,cos:Math.cos,tg:Math.tan,tan:Math.tan};
const strip=s=>String(s).normalize("NFD").replace(/[̀-ͯ]/g,"");
function prep(s){
  s=String(s).trim();
  s=s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]+/g,m=>"^("+[...m].map(c=>SUP[c]).join("")+")").replace(/ˣ/g,"^x").replace(/ʸ/g,"^y");
  s=s.replace(/[−–—]/g,"-").replace(/[·×∙⋅]/g,"*").replace(/[÷:]/g,"/").replace(/\*\*/g,"^").replace(/√/g," sqrt ").replace(/π/g,"pi");
  s=s.toLowerCase();
  s=s.replace(/\|([^|]*)\|/g,"abs($1)").replace(/[\[{]/g,"(").replace(/[\]}]/g,")");
  if(s.includes("="))s=s.slice(s.lastIndexOf("=")+1);           // F(x) = …, y = …
  s=s.replace(/([+-])\s*(c|k|konst\w*)\s*(?=$|[+-])/g,"");        // + C
  s=s.replace(/(\d),(\d)/g,"$1.$2").replace(/\s+na\s+/g,"^");     // 0,5 → 0.5; x na 3 → x^3
  return s;
}
function lex(s){
  const t=[];let i=0;
  while(i<s.length){
    const c=s[i];
    if(c===" "){i++;continue}
    const sp=i>0&&s[i-1]===" ";
    if(/[\d.]/.test(c)){let j=i;while(j<s.length&&/[\d.]/.test(s[j]))j++;const v=parseFloat(s.slice(i,j));if(isNaN(v))throw new Error("Nerozumiem číslu „"+s.slice(i,j)+"“.");t.push({k:"n",v,sp});i=j;continue}
    if(/[a-z]/.test(c)){
      let j=i;while(j<s.length&&/[a-z]/.test(s[j]))j++;
      let w=s.slice(i,j),first=true;
      while(w){const n=NAMES.find(n=>w.startsWith(n));if(!n)throw new Error("Nerozumiem zápisu „"+w+"“. Použi x, y, e, ln, sqrt.");t.push({k:"i",v:n,sp:first&&sp});first=false;w=w.slice(n.length)}
      i=j;continue;
    }
    if("+-*/^()".includes(c)){t.push({k:c,sp});i++;continue}
    throw new Error("Nerozumiem znaku „"+c+"“.");
  }
  // x2 → x^2 (číslo hneď za premennou alebo zátvorkou); ex → e^x
  const o=[];
  t.forEach((k,n)=>{
    const p=o[o.length-1];
    if(k.k==="n"&&!k.sp&&p&&((p.k==="i"&&(p.v==="x"||p.v==="y"))||p.k===")"))o.push({k:"^",sp:false});
    if(k.k==="i"&&k.v==="x"&&!k.sp&&p&&p.k==="i"&&p.v==="e"&&!(t[n+1]&&t[n+1].k==="^"))o.push({k:"^",sp:false});
    o.push(k);
  });
  return o;
}
// tight = násobenie bez medzery viaže silnejšie ako delenie (1/2x = 1/(2x)), loose = bežné poradie
function parse(s,tight){
  const t=lex(prep(s));let p=0;
  const peek=()=>t[p],eat=k=>{if(t[p]&&t[p].k===k){p++;return true}return false};
  const startsAtom=k=>k&&(k.k==="n"||k.k==="i"||k.k==="(");
  function expr(){let a=term();while(peek()&&(peek().k==="+"||peek().k==="-")){const o=t[p++].k;a=[o,a,term()]}return a}
  function term(){let a=imp();for(;;){const k=peek();if(!k)break;
    if(k.k==="*"||k.k==="/"){p++;a=[k.k,a,imp()]}
    else if(startsAtom(k)&&(k.sp||!tight))a=["*",a,imp()];
    else break}return a}
  function imp(){let a=signed();while(tight&&startsAtom(peek())&&!peek().sp)a=["*",a,power()];return a}
  function signed(){if(eat("-"))return["neg",signed()];if(eat("+"))return signed();return power()}
  function power(){const a=atom();if(eat("^"))return["^",a,signed()];return a}
  function atom(){
    const k=t[p++];if(!k)throw new Error("Odpoveď je neúplná.");
    if(k.k==="n")return["n",k.v];
    if(k.k==="("){const a=expr();if(!eat(")"))throw new Error("Chýba zatváracia zátvorka.");return a}
    if(k.k==="i"){if(FN[k.v])return["f",k.v,power()];if(k.v==="e")return["n",Math.E,"e"];if(k.v==="pi")return["n",Math.PI,"π"];return["v",k.v]}
    throw new Error("Nečakaný znak „"+k.k+"“.");
  }
  const a=expr();if(p<t.length)throw new Error(t[p].k===")"?"Je tam zatváracia zátvorka navyše.":"Nerozumiem koncu odpovede.");return a;
}
function ev(a,V){switch(a[0]){
  case"n":return a[1];case"v":if(!(a[1] in V))throw new Error("Premenná "+a[1]+" sem nepatrí.");return V[a[1]];
  case"neg":return-ev(a[1],V);case"f":return FN[a[1]](ev(a[2],V));
  case"+":return ev(a[1],V)+ev(a[2],V);case"-":return ev(a[1],V)-ev(a[2],V);
  case"*":return ev(a[1],V)*ev(a[2],V);case"/":return ev(a[1],V)/ev(a[2],V);case"^":return Math.pow(ev(a[1],V),ev(a[2],V))}}
// pekný zápis toho, ako sme odpoveď pochopili
const SUPS={"0":"⁰","1":"¹","2":"²","3":"³","4":"⁴","5":"⁵","6":"⁶","7":"⁷","8":"⁸","9":"⁹","-":"⁻"};
const num=v=>String(Math.round(v*1e6)/1e6).replace(".",",").replace("-","−");
function show(a,par){
  const pr={"+":1,"-":1,"*":2,"/":2,"neg":3,"^":4};
  const w=(s,q)=>q?"("+s+")":s;
  switch(a[0]){
    case"n":return a[2]||num(a[1]);case"v":return a[1];
    case"f":return(a[1]==="sqrt"||a[1]==="odmocnina"?"√":a[1])+"("+show(a[2],0)+")";
    case"neg":return w("−"+show(a[1],3),par>3);
    case"^":{const b=a[2];const base=show(a[1],5);
      if(b[0]==="n"&&!b[2]&&Number.isInteger(b[1]))return base+[...String(b[1])].map(c=>SUPS[c]).join("");
      if(b[0]==="neg"&&b[1][0]==="n"&&Number.isInteger(b[1][1]))return base+"⁻"+[...String(b[1][1])].map(c=>SUPS[c]).join("");
      if(b[0]==="v")return base+(b[1]==="x"?"ˣ":"ʸ");
      return base+"^("+show(b,0)+")"}
    case"*":{const l=show(a[1],2),r=show(a[2],2);const tight=a[1][0]!=="/"&&/[\dπ]$/.test(l)&&/^[a-zeπ√(]/.test(r)||/^[a-z]/.test(r)&&/[a-z)²³⁴⁵⁶⁷⁸⁹ˣʸ]$/.test(l);return w(l+(tight?"":" · ")+r,par>2)}
    case"/":return w(show(a[1],2)+"/"+show(a[2],3),par>2);
    default:return w(show(a[1],1)+(a[0]==="+"?" + ":" − ")+show(a[2],a[0]==="-"?2:1),par>1);
  }}
// vzorky, v ktorých porovnávame výrazy
const XS=[0.37,0.81,1.29,1.73,2.37,2.91,3.47,4.13],YS=[0.53,1.61,-0.71,2.27,-1.39,0.91,1.83,-0.47];
function same(user,ok,vars,upToConst){
  const pts=XS.map((x,i)=>{const V={};vars.forEach(v=>V[v]=v==="x"?x:YS[i]);return V});
  let d=null,n=0;
  for(const V of pts){const a=ev(user,V),b=ev(ok,V);if(!isFinite(a)||!isFinite(b))continue;n++;
    const diff=a-b,tol=1e-6*(1+Math.abs(b));
    if(upToConst){if(d===null)d=diff;else if(Math.abs(diff-d)>tol*10)return false}else if(Math.abs(diff)>tol)return false}
  return n>=3;
}
// čísla, nekonečno, neexistuje
function val(s){
  let z=strip(String(s).toLowerCase()).replace(/[−–—]/g,"-").trim();
  if(z.includes("="))z=z.slice(z.lastIndexOf("=")+1).trim();
  if(/neexist|nie je|ziadn|dne|^nie$|^none$/.test(z))return"none";
  const inf=z.replace(/\s/g,"");
  if(/^(\+)?(∞|inf\w*|nekonecn\w*|oo|plus\w*nekonecn\w*)$/.test(inf))return Infinity;
  if(/^-(∞|inf\w*|nekonecn\w*|oo)$/.test(inf)||/^minus\w*nekonecn\w*$/.test(inf))return-Infinity;
  const a=parse(z,true),v=ev(a,{});if(!isFinite(v))throw new Error("Nerozumiem číslu.");return v;
}
const eqv=(a,b)=>a===b||(typeof a==="number"&&typeof b==="number"&&isFinite(a)&&isFinite(b)&&Math.abs(a-b)<=1e-6*(1+Math.abs(b)));
// zoznam čísel: „-1; 1“, „-1 a 1“, „±2“, „x1 = -1, x2 = 1“
function vals(s,n){
  let z=String(s).replace(/[−–—]/g,"-").replace(/[a-z]\w*\s*=\s*/gi," ").replace(/\b(a|and|alebo)\b/gi,";");
  z=z.replace(/±\s*([\d.,\/]+)/g,"-$1;$1");
  const tries=[z.split(";")];
  if(!z.includes(";")){tries.push(z.split(/,\s+|\s+/));tries.push(z.split(/,|\s+/))}
  return tries.map(p=>p.map(x=>x.trim()).filter(Boolean)).filter(p=>p.length).map(p=>{try{return p.map(val)}catch(e){return null}}).filter(Boolean);
}
function sameSet(us,ok){if(us.length!==ok.length)return false;const left=ok.slice();return us.every(u=>{const k=left.findIndex(o=>eqv(u,o));if(k<0)return false;left.splice(k,1);return true})}
// body [x, y]
function pts(s){
  const z=String(s).replace(/[−–—]/g,"-").replace(/[a-z]\w*\s*=\s*/gi," ");
  const groups=[...z.matchAll(/[\[(]([^\])]*)[\])]/g)].map(m=>m[1]);
  const list=groups.length?groups:[z];
  return list.map(g=>{const c=[g.split(";"),g.split(/,\s*/),g.split(/\s+/)].map(p=>p.map(x=>x.trim()).filter(Boolean)).filter(p=>p.length===2);
    for(const p of c){try{return p.map(val)}catch(e){}}return null});
}
// intervaly: (-inf; -1) U (-1; 3>, R \ {-3, 3}
function ivs(s){
  let z=strip(String(s).toLowerCase()).replace(/[−–—]/g,"-").replace(/[⟨〈]/g,"<").replace(/[⟩〉]/g,">").replace(/∞|nekonecn\w*|\boo\b/g,"inf").replace(/∪/g," u ");
  if(z.includes("="))z=z.slice(z.lastIndexOf("=")+1);
  const ex=z.match(/^\s*r\s*(?:[\\\-]|bez)\s*\{([^}]*)\}\s*$/);
  if(ex){const c=vals(ex[1]);const pts=c.length?c.reduce((a,b)=>b.length>a.length?b:a):null;if(!pts)throw new Error("Nerozumiem množine.");pts.sort((a,b)=>a-b);const out=[];let l=-Infinity;pts.forEach(v=>{out.push([false,l,v,false]);l=v});out.push([false,l,Infinity,false]);return out}
  if(/^\s*r\s*$/.test(z))return[[false,-Infinity,Infinity,false]];
  const out=[];const re=/([\[(<])([^\[\]()<>]*)([\])>])/g;let m;
  while((m=re.exec(z))){
    const g=m[2];let p=g.includes(";")?g.split(";"):g.split(",");
    if(p.length===4)p=[p[0]+"."+p[1],p[2]+"."+p[3]];
    if(p.length===3){const a=[p[0]+"."+p[1],p[2]],b=[p[0],p[1]+"."+p[2]];try{p=val(a[0])<val(a[1])?a:b}catch(e){p=b}}
    if(p.length!==2)throw new Error("V intervale musia byť dve hranice, napr. (-1; 3).");
    out.push([m[1]!=="(",val(p[0]),val(p[1]),m[3]!==")"]);
  }
  if(!out.length)throw new Error("Interval píš ako (a; b) alebo <a; b>, viac intervalov spoj písmenom U.");
  return out.sort((a,b)=>a[1]-b[1]);
}
function sameIv(us,ok,loose){if(us.length!==ok.length)return false;return us.every((u,i)=>{const o=ok[i];
  return eqv(u[1],o[1])&&eqv(u[2],o[2])&&(loose||((u[0]===o[0]||!isFinite(o[1]))&&(u[3]===o[3]||!isFinite(o[2]))))})}
const showIv=l=>l.map(([a,x,y,b])=>(a&&isFinite(x)?"⟨":"(")+(isFinite(x)?num(x):"−∞")+"; "+(isFinite(y)?num(y):"∞")+(b&&isFinite(y)?"⟩":")")).join(" ∪ ");
// slovné odpovede: druh extrému, typ nespojitosti, typ asymptoty
const WORDS={
  ext:[["undecided",/nevie|neda|nemoz|rozhod|neurc|nezist|nevi/],["none",/ziad|nie je|nieje|nema|bez|sedl|none|^nie$|^ne$|^0$/],["infl",/infl/],["min",/min/],["max",/max/]],
  disc:[["neodstr",/neodstr|nie je odstr|skok|ii\.? druh|druheho/],["odstr",/odstr/]],
  asym:[["bez",/bez|zvisl|vertik/],["so",/so |smernic|vodorov|horizont|sikm/]]
};
const WNAME={undecided:"nevieme rozhodnúť",none:"žiadny extrém",infl:"inflexný bod",min:"ostré lokálne minimum",max:"ostré lokálne maximum",neodstr:"neodstrániteľný bod nespojitosti",odstr:"odstrániteľný bod nespojitosti",bez:"asymptota bez smernice",so:"asymptota so smernicou"};
function word(s,g){const z=strip(String(s).toLowerCase()).trim();const h=WORDS[g].find(([,re])=>re.test(z));return h?h[0]:null}
const WHELP={ext:"minimum, maximum, inflexný bod, žiadny extrém alebo nevieme rozhodnúť",disc:"odstrániteľný alebo neodstrániteľný",asym:"so smernicou alebo bez smernice"};
const showV=v=>v==="none"?"neexistuje":v===Infinity?"∞":v===-Infinity?"−∞":num(v);
// kontrola jedného políčka: {ok, seen (ako sme odpoveď pochopili), err}
function check(f,input){
  const s=String(input||"").trim();if(!s)return{ok:false,empty:true};
  try{
    switch(f.k){
      case"num":{const v=val(s);return{ok:eqv(v,f.v==="inf"?Infinity:f.v==="-inf"?-Infinity:f.v),seen:showV(v)}}
      case"nums":{const c=vals(s);const okv=f.v;const hit=c.find(l=>sameSet(l,okv));return{ok:!!hit,seen:(hit||c[0]||[]).map(showV).join("; ")}}
      case"expr":case"anti":{const vars=f.x||["x"],ok=parse(f.v,false);
        for(const tight of[true,false]){const a=parse(s,tight);if(same(a,ok,vars,f.k==="anti"))return{ok:true,seen:show(a,0)}}
        return{ok:false,seen:show(parse(s,true),0)}}
      case"pt":case"pts":{const okl=f.k==="pt"?[f.v]:f.v,u=pts(s);if(u.some(x=>!x))throw new Error("Bod píš ako [x; y].");
        const ok=u.length===okl.length&&okl.every(o=>u.some(p=>eqv(p[0],o[0])&&eqv(p[1],o[1])));
        return{ok,seen:u.map(p=>"["+num(p[0])+"; "+num(p[1])+"]").join(", ")}}
      case"set":{const u=ivs(s);return{ok:sameIv(u,ivs(f.v),f.loose),seen:showIv(u)}}
      case"word":{const w=word(s,f.g);if(!w)throw new Error("Tomu nerozumiem. Napíš napr. "+WHELP[f.g]+".");return{ok:w===f.v,seen:WNAME[w]}}
    }
  }catch(e){return{ok:false,err:e.message}}
}
function answer(f){
  switch(f.k){case"num":return showV(f.v==="inf"?Infinity:f.v==="-inf"?-Infinity:f.v);case"nums":return f.v.map(showV).join("; ");
    case"expr":return show(parse(f.v,false),0);case"anti":return show(parse(f.v,false),0)+" + C";
    case"pt":return"["+num(f.v[0])+"; "+num(f.v[1])+"]";case"pts":return f.v.map(p=>"["+num(p[0])+"; "+num(p[1])+"]").join(", ");
    case"set":return showIv(ivs(f.v));case"word":return WNAME[f.v]}}
// ako sme odpoveď pochopili, ukazuje sa už počas písania (nič neprezradí o správnosti)
function preview(f,input){const s=String(input||"").trim();if(!s)return"";
  if(["expr","anti"].includes(f.k)){try{return show(parse(s,true),0)}catch(e){return""}}
  const r=check(f,s);if(!r.seen)return"";
  if(f.k==="num"&&r.seen.replace(/\s/g,"")===s.replace(/\s/g,"").replace("-","−"))return"";
  return r.seen}
return{check,answer,preview,parse,show};
})();

// ===== Matematika: príklady na výpočet, odpoveď sa píše do políčka
const CKEY="mat-vypocty-v1";let CP={};try{CP=JSON.parse(localStorage.getItem(CKEY))||{}}catch(e){CP={}}
let cTop="all",cList=[],ci=0,cShown=false,cLast=null;
const CPH={ext:"napr. minimum",disc:"napr. odstrániteľný",asym:"napr. so smernicou"};
const CHINT={
  anti:["napr. x^3 - e^x - 1/(2x^2)","Mocniny píš x^2 alebo x2, eˣ ako e^x alebo ex, ďalej ln x a sqrt(x). Konštantu C písať nemusíš."],
  expr:["napr. 3x^2 - 3","Mocniny píš x^2 alebo x2, eˣ ako e^x alebo ex, ďalej ln x a sqrt(x)."],
  num:["číslo","Číslo môže byť aj zlomok (1/2) alebo desatinné (0,5). Nekonečno napíš inf, a ak limita neexistuje, napíš neexistuje."],
  nums:["napr. -1; 1","Viac čísel oddeľ bodkočiarkou alebo slovom a."],
  pt:["napr. [1; -2]","Bod píš ako [x; y]."],
  pts:["napr. [1; 0], [-1; 0]","Body píš ako [x; y] a oddeľ ich čiarkou."],
  set:["napr. (-inf; -1) U (-1; 3>","Interval: ( ) je otvorený koniec, < > alebo [ ] uzavretý, nekonečno je inf a zjednotenie U."],
  word:["","Stačí slovom a aj skrátene, napr. min, max, žiadny, odstrániteľný."]
};
const cNorm=s=>String(s).replace(/\s/g,"").replace(/−/g,"-").toLowerCase();
function cSave(){try{localStorage.setItem(CKEY,JSON.stringify(CP))}catch(e){}}
function cEl(tag,cls,html){const e=document.createElement(tag);if(cls)e.className=cls;if(html!=null)e.innerHTML=html;return e}
function cChips(){
  const box=$("cTopics");box.innerHTML="";
  [["all","Všetky"]].concat(Object.keys(MAT_CT).map(k=>[k,MAT_CT[k]])).forEach(([k,name])=>{
    const l=k==="all"?MAT_CALC:MAT_CALC.filter(x=>x.t===k),done=l.filter(x=>CP[x.id]===1).length;
    const b=document.createElement("button");b.type="button";b.textContent=name+" "+done+"/"+l.length;b.setAttribute("aria-pressed",k===cTop);
    b.onclick=()=>{cTop=k;cStart()};box.appendChild(b);
  });
}
function calcOpen(){show("calc");$("mKeys").hidden=false;document.body.classList.add("es-keys-on");cChips();if(!cList.length)cStart();else cRender()}
function cStart(){cList=cTop==="all"?MAT_CALC:MAT_CALC.filter(x=>x.t===cTop);ci=Math.max(0,cList.findIndex(x=>CP[x.id]!==1));cChips();cRender()}
function cRender(){
  const x=cList[ci];cShown=false;
  $("cTopic").textContent=MAT_CT[x.t]||"";
  $("cPos").textContent="príklad "+(ci+1)+" z "+cList.length+"  ·  vyriešené "+MAT_CALC.filter(y=>CP[y.id]===1).length+" / "+MAT_CALC.length;
  $("cQ").innerHTML=x.q;
  const g=$("cFig");g.innerHTML=x.g?MAT_G[x.g]||"":"";g.hidden=!x.g;
  const form=$("cForm");form.innerHTML="";
  x.f.forEach((f,k)=>{
    const w=cEl("div","cfield"),lab=cEl("label",null,f.l);lab.htmlFor="cf"+k;
    const inp=document.createElement("input");inp.id="cf"+k;inp.type="text";inp.className="cinput";inp.autocomplete="off";inp.spellcheck=false;
    inp.setAttribute("autocapitalize","off");inp.setAttribute("autocorrect","off");inp.placeholder=f.k==="word"?CPH[f.g]||"":CHINT[f.k][0];
    const pv=cEl("div","cprev"),res=cEl("div","cres");res.hidden=true;
    inp.addEventListener("input",()=>{const p=MC.preview(f,inp.value);pv.textContent=p?"Rozumiem: "+p:"";inp.classList.remove("good","bad");res.hidden=true});
    inp.addEventListener("keydown",e=>{if(e.key!=="Enter")return;e.preventDefault();const nx=$("cf"+(k+1));if(nx&&!nx.value.trim())nx.focus();else cCheck()});
    w.append(lab,inp,pv,res);form.appendChild(w);
  });
  $("cHelp").textContent=[...new Set(x.f.map(f=>CHINT[f.k][1]))].join(" ");
  $("cTipBtn").hidden=!x.h;$("cTip").hidden=true;$("cTip").innerHTML=x.h?"<b>Nápoveda:</b> "+x.h:"";
  $("cFb").hidden=true;$("cSolWrap").hidden=true;$("cActions").hidden=false;$("cNext").hidden=true;$("cPrev").hidden=ci===0;
  $("cSol").innerHTML="";x.r.forEach(s=>$("cSol").appendChild(cEl("li",null,s)));
  if(fine)$("cf0").focus({preventScroll:true});
}
function cCheck(){
  const x=cList[ci];let ok=0,filled=0;
  x.f.forEach((f,k)=>{
    const inp=$("cf"+k),res=inp.parentNode.querySelector(".cres"),r=MC.check(f,inp.value);
    res.innerHTML="";res.hidden=false;
    if(r.empty){inp.classList.remove("good","bad");res.appendChild(cEl("span","cempty","Toto políčko je prázdne."));return}
    filled++;if(r.ok)ok++;
    inp.classList.toggle("good",!!r.ok);inp.classList.toggle("bad",!r.ok);
    const s=cEl("span",r.ok?"ok":"no");s.textContent=r.ok?"✓ Správne"+(r.seen&&["expr","anti"].includes(f.k)?", rozumiem: "+r.seen:""):r.err?"✗ "+r.err:"✗ Nesprávne"+(r.seen&&cNorm(r.seen)!==cNorm(inp.value)?" (rozumiem: "+r.seen+")":"");
    res.appendChild(s);
  });
  const all=ok===x.f.length,fb=$("cFb");fb.hidden=false;fb.className="fb "+(all?"good":"bad");
  $("cVerdict").textContent=all?"Správne, všetko sedí.":!filled?"Najprv napíš odpoveď do políčka.":ok+" z "+x.f.length+" je správne. Oprav červené políčka alebo si pozri riešenie.";
  if(all){if(!cShown)CP[x.id]=1;else if(CP[x.id]!==1)CP[x.id]=0;cSave();$("cSolWrap").hidden=false;$("cActions").hidden=true;$("cNext").hidden=false;cChips();$("cNext").focus({preventScroll:true})}
  else if(filled){if(CP[x.id]!==1){CP[x.id]=0;cSave()}}
  $("cPos").textContent="príklad "+(ci+1)+" z "+cList.length+"  ·  vyriešené "+MAT_CALC.filter(y=>CP[y.id]===1).length+" / "+MAT_CALC.length;
}
function cReveal(){
  const x=cList[ci];cShown=true;if(CP[x.id]!==1){CP[x.id]=0;cSave()}
  x.f.forEach((f,k)=>{const inp=$("cf"+k),res=inp.parentNode.querySelector(".cres");
    if(!res.hidden&&res.querySelector(".ok"))return;
    res.hidden=false;res.innerHTML="";const s=cEl("span","ans");s.textContent="Správna odpoveď: "+MC.answer(f);res.appendChild(s)});
  $("cSolWrap").hidden=false;$("cNext").hidden=false;
}
$("cCheck").onclick=cCheck;$("cShow").onclick=cReveal;
$("cTipBtn").onclick=()=>{$("cTip").hidden=!$("cTip").hidden};
$("cNext").onclick=()=>{ci=(ci+1)%cList.length;cRender();window.scrollTo({top:$("calc").offsetTop-12})};
$("cPrev").onclick=()=>{if(ci>0){ci--;cRender()}};
$("cForm").onsubmit=e=>{e.preventDefault();cCheck()};
// lišta so znakmi pre matematiku: vloží text do posledného políčka
document.addEventListener("focusin",e=>{if(e.target.classList&&e.target.classList.contains("cinput"))cLast=e.target});
[["^","^"],["/","/"],["(","("],[")",")"],["√","sqrt("],["∞","inf"],["eˣ","e^"],["ln","ln("]].forEach(([lab,ins])=>{
  const b=document.createElement("button");b.type="button";b.textContent=lab;b.setAttribute("aria-label","Vložiť "+lab);
  b.onmousedown=e=>e.preventDefault();
  b.onclick=()=>{const inp=cLast;if(!inp||!document.body.contains(inp))return;const s=inp.selectionStart??inp.value.length,en=inp.selectionEnd??s;
    inp.value=inp.value.slice(0,s)+ins+inp.value.slice(en);inp.focus();inp.setSelectionRange(s+ins.length,s+ins.length);inp.dispatchEvent(new Event("input"))};
  $("mKeys").appendChild(b);
});

// ===== Predmety a domovská stránka
const esc=t=>String(t).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const LASTKEY="kvizy-posledny-predmet";
function setHash(h){try{history.replaceState(null,"",h?"#"+h:location.pathname+location.search)}catch(e){}}
function head(eyebrow,title,lede,foot){$("eyebrow").textContent=eyebrow;$("h1").textContent=title;$("lede").textContent=lede;$("foot").textContent=foot}
function renderHome(){
  let last="";try{last=localStorage.getItem(LASTKEY)||""}catch(e){}
  const box=$("subjects");box.innerHTML="";
  SUBJECTS.forEach(sj=>{
    const b=document.createElement(sj.soon?"div":"button");b.className="sheet subj"+(sj.soon?" soon":"");
    if(sj.soon){
      b.innerHTML='<div class="subj-top"><span class="code">'+esc(sj.code)+'</span><span class="term">'+esc(sj.term||"")+'</span></div><p class="subj-name">'+esc(sj.name)+'</p><div class="subj-topics">Otázky pripravujeme.</div>';
      box.appendChild(b);return;
    }
    if(sj.workbook){
      b.type="button";b.onclick=()=>openSubject(sj.id);const pct=esAll(),started=Object.keys(esBest).length;
      b.innerHTML='<div class="subj-top"><span class="code">'+esc(sj.code)+'</span>'+(sj.id===last?'<span class="last">Naposledy otvorené</span>':'')+'<span class="term">'+esc(sj.term||"")+'</span></div>'
        +'<p class="subj-name">'+esc(sj.name)+'</p>'
        +'<div class="subj-topics">'+esc(ES_TOPICS.slice(0,5).map(t=>t.sk).join(" · "))+' · kartičky · test · časovanie slovies</div>'
        +'<div class="subj-stats">'+[[ES_TOPICS.length,"tém"],[ES_EXN,"cvičení"],[ES_ITEMS,"úloh"]].map(([n,l])=>'<span><b>'+n+'</b>'+esc(l)+'</span>').join("")+'</div>'
        +'<div class="bar" aria-hidden="true"><i style="width:'+pct+'%"></i></div>'
        +'<div class="subj-foot"><span>'+(started?'zvládnuté '+pct+' %':'Zatiaľ nezačaté')+'</span><span class="go">'+(started?'Pokračovať →':'Začať →')+'</span></div>';
      box.appendChild(b);return;
    }
    b.type="button";b.onclick=()=>openSubject(sj.id);
    let p={};try{p=JSON.parse(localStorage.getItem(sj.key))||{}}catch(e){}
    const ids=new Set(sj.q.map(x=>x.id)),seen=Object.keys(p).filter(k=>ids.has(k)),ok=seen.filter(k=>p[k].l===1).length;
    const tn=Object.keys(sj.t).filter(k=>sj.q.some(x=>x.t===k)).map(k=>sj.t[k]);
    const stats=[[sj.q.length,"otázok"],[tn.length,tn.length===1?"téma":tn.length<5?"témy":"tém"]].concat(sj.extra?sj.extra():[]);
    const pct=sj.q.length?Math.round(seen.length/sj.q.length*100):0;
    b.innerHTML='<div class="subj-top"><span class="code">'+esc(sj.code)+'</span>'+(sj.id===last&&SUBJECTS.length>1?'<span class="last">Naposledy otvorené</span>':'')+'<span class="term">'+esc(sj.term||"")+'</span></div>'
      +'<p class="subj-name">'+esc(sj.name)+'</p>'
      +'<div class="subj-topics">'+esc(tn.join(" · "))+'</div>'
      +'<div class="subj-stats">'+stats.map(([n,l])=>'<span><b>'+n+'</b>'+esc(l)+'</span>').join("")+'</div>'
      +'<div class="bar" aria-hidden="true"><i style="width:'+pct+'%"></i></div>'
      +'<div class="subj-foot"><span>'+(seen.length?'videné '+seen.length+' / '+sj.q.length+' · na zopakovanie '+(seen.length-ok):'Zatiaľ nezačaté')+'</span><span class="go">'+(seen.length?'Pokračovať →':'Začať →')+'</span></div>';
    box.appendChild(b);
  });
  if(!SUBJECTS.some(sj=>sj.soon)){
    const d=document.createElement("div");d.className="sheet subj soon";
    d.innerHTML='<div class="subj-top"><span class="code">+</span></div><p class="subj-name">Ďalší predmet</p><div class="subj-topics">Ďalšie predmety pribudnú sem, každý s vlastnými otázkami a vlastným postupom.</div>';
    box.appendChild(d);
  }
}
function goHome(){
  CUR=null;renderHome();
  head("Kvízy na precvičenie · ZS 2026","Vyber si predmet","Každý predmet má vlastné otázky, témy a vlastný postup.",HOME_FOOT);
  show("home");setHash("");
}
function openSubject(id,view){
  const sj=SUBJECTS.find(x=>x.id===id&&!x.soon);if(!sj){goHome();return}
  if(sj.workbook){
    CUR=sj;try{localStorage.setItem(LASTKEY,sj.id)}catch(e){}
    head(sj.name+" · "+(sj.term||""),sj.title,sj.lede(),sj.foot);esOpen(view);return;
  }
  if(CUR!==sj){CUR=sj;QUESTIONS=sj.q;TOPICS=sj.t;loadProgress();topic="all";mode="all";quizView="setup";list=[]}
  try{localStorage.setItem(LASTKEY,sj.id)}catch(e){}
  head(sj.name+" · "+(sj.term||""),sj.title||"Testové otázky na precvičenie",sj.lede?sj.lede():sj.q.length+" otázok na precvičenie.",sj.foot||HOME_FOOT);
  if(view==="book"&&sj.extras){bookOpen();setHash("zauctuj")}
  else if(view==="acc"&&sj.extras){accOpen();setHash("ucty")}
  else if(view==="calc"&&sj.calc){calcOpen();setHash("mat-vypocty")}
  else{setup();setHash(sj.id)}
}
$("crumb").onclick=goHome;
function route(){
  const h=location.hash.slice(1);
  if(h==="es"||h.startsWith("es-"))openSubject("es",h.slice(3));
  else if(h==="zauctuj")openSubject("fu","book");
  else if(h==="ucty")openSubject("fu","acc");
  else if(h==="mat-vypocty")openSubject("mat","calc");
  else if(SUBJECTS.some(x=>x.id===h&&!x.soon))openSubject(h);
  else goHome();
}
route();window.addEventListener("hashchange",route);
