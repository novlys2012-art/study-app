// Built-in local-only sample subject so guests can try summaries, quiz-to-source jumps and past-exam ranking
// immediately without signing in. Flagged sample: true so subjects.js and sync.js never push it to an account.
import { loadSubjects, saveSubjects } from "./subjects.js";

export const SAMPLE_ID = "sample-biochem";

function skSample() {
  const file = "bunkova-biochemia.pdf";
  return {
    id: SAMPLE_ID,
    sample: true,
    lang: "sk",
    code: "BIO",
    name: "Bunková biochémia (ukážka)",
    term: "Ukážkový predmet",
    topics: {
      g: "Glykolýza a regulácia",
      o: "Oxidačná fosforylácia",
      c: "Citrátový cyklus",
    },
    topicInfo: {
      g: {
        summary: "Štiepenie glukózy na pyruvát v cytozole a kľúčové regulačné enzýmy (hexokináza, PFK-1, pyruvátkináza).",
        weakSpots: [
          "Zámena regulačných účinkov AMP (aktivátor) a ATP/citrátu (inhibítory) na PFK-1",
          "Čistý zisk ATP (2 ATP) verzus celkový zisk (4 ATP) na jednu molekulu glukózy",
        ],
      },
      o: {
        summary: "Prenos elektrónov v dýchacom reťazci a syntéza ATP cez protónový gradient na vnútornej membráne mitochondrií.",
        weakSpots: [
          "Komplex II (sukcinátdehydrogenáza) nepumpuje protóny cez vnútornú membránu",
          "Rozdiel medzi inhibítormi dýchacieho reťazca a odpájačmi (uncouplers)",
        ],
      },
      c: {
        summary: "Oxidácia acetyl-CoA v matrixe mitochondrií s tvorbou NADH, FADH2 a GTP.",
        weakSpots: [
          "Izocitrátdehydrogenáza ako hlavný krok limitujúci rýchlosť cyklu",
          "Výťažok jedného otočenia cyklu (3 NADH, 1 FADH2, 1 GTP, 2 CO2)",
        ],
      },
    },
    files: [
      {
        name: file,
        title: "Energetický metabolizmus bunky",
        pagesBefore: 24,
        pagesAfter: 2.5,
        summary: [
          "## Glykolýza a regulácia",
          "- Glykolýza prebieha v cytozole všetkých buniek a nevyžaduje kyslík.",
          "- **Hlavným regulačným enzýmom glykolýzy je fosfofruktokináza-1 (PFK-1), aktivovaná AMP a fruktóza-2,6-bisfosfátom a inhibovaná ATP a citrátom.**",
          "- Z jednej molekuly glukózy vznikajú v glykolýze 2 molekuly pyruvátu, čistý zisk je 2 ATP a 2 NADH.",
          "- Tri nevratné reakcie glykolýzy katalyzujú hexokináza, fosfofruktokináza-1 a pyruvátkináza.",
          "",
          "## Citrátový cyklus",
          "- Citrátový cyklus prebieha v matrixe mitochondrií a spája metabolizmus sacharidov, lipidov a aminokyselín.",
          "- **Jedno otočenie citrátového cyklu z jednej molekuly acetyl-CoA poskytuje 3 NADH, 1 FADH2, 1 GTP a 2 CO2.**",
          "- Hlavným regulačným enzýmom citrátového cyklu je izocitrátdehydrogenáza, ktorú aktivuje ADP a inhibujú ATP a NADH.",
          "",
          "## Oxidačná fosforylácia",
          "- Dýchací reťazec je uložený vo vnútornej membráne mitochondrií a vytvára protónový gradient v medzimembránovom priestore.",
          "- **Komplex II (sukcinátdehydrogenáza) prenáša elektróny z FADH2 na ubichinón, ale nepumpuje protóny do medzimembránového priestoru.**",
          "- Konečným akceptorom elektrónov v dýchacom reťazci je molekulový kyslík (O2), ktorý sa redukuje na vodu.",
          "- Odpájače (napr. termogenín UCP1) umožňujú návrat protónov do matrixu bez syntézy ATP a energiu uvoľňujú ako teplo.",
        ].join("\n"),
        keyTerms: [
          { term: "PFK-1", def: "Fosfofruktokináza-1 – kľúčový regulačný enzým glykolýzy." },
          { term: "Protónový gradient", def: "Elektrochemický rozdiel H+ na vnútornej mitochondriálnej membráne, ktorý poháňa ATP-syntázu." },
          { term: "Odpájač (uncoupler)", def: "Látka, ktorá rozruší spojenie medzi prenosom elektrónov a syntézou ATP; energia sa mení na teplo." },
        ],
      },
    ],
    questions: [
      {
        id: "sbq1",
        t: "g",
        q: "Ktorý enzým je hlavným regulačným bodom glykolýzy?",
        o: ["Fosfofruktokináza-1 (PFK-1)", "Enoláza", "Fosfoglycerátmutáza", "Aldoláza"],
        a: 0,
        e: "PFK-1 katalyzuje prvý záväzný krok glykolýzy a reaguje na energetický stav bunky (aktivuje ju AMP, inhibuje ATP a citrát).",
        x: "Pri vysokej hladine ATP a citrátu v pokoji sa PFK-1 spomalí a glukóza sa šetrí.",
        s: `Hlavným regulačným enzýmom glykolýzy je fosfofruktokináza-1 (PFK-1) (${file}, str. 4)`,
      },
      {
        id: "sbq2",
        t: "g",
        q: "Aký je čistý výťažok glykolýzy z jednej molekuly glukózy?",
        o: ["2 pyruváty, 2 ATP a 2 NADH", "2 pyruváty, 4 ATP a 2 NADH", "1 pyruvát, 2 ATP a 1 NADH", "2 acetyl-CoA, 2 ATP a 4 NADH"],
        a: 0,
        e: "V investičnej fáze sa spotrebujú 2 ATP a vo výťažkovej vzniknú 4 ATP, preto je čistý zisk 2 ATP a 2 NADH.",
        x: "Pri anaeróbnom šprinte sval získava rýchlo práve tieto 2 ATP na glukózu.",
        s: `Z jednej molekuly glukózy vznikajú v glykolýze 2 molekuly pyruvátu, čistý zisk je 2 ATP a 2 NADH (${file}, str. 5)`,
      },
      {
        id: "sbq3",
        t: "g",
        q: "Ktoré enzýmy katalyzujú nevratné reakcie glykolýzy? (Označ všetky správne.)",
        o: ["Hexokináza", "Fosfofruktokináza-1", "Pyruvátkináza", "Triózafosfátizomeráza"],
        a: [0, 1, 2],
        e: "Nevratné kroky katalyzujú tri kinázy: hexokináza, PFK-1 a pyruvátkináza. V glukoneogenéze ich musia obísť iné enzýmy.",
        x: "",
        s: `Tri nevratné reakcie glykolýzy katalyzujú hexokináza, fosfofruktokináza-1 a pyruvátkináza (${file}, str. 6)`,
      },
      {
        id: "sbq4",
        t: "c",
        q: "Čo vznikne pri jednom otočení citrátového cyklu z jednej molekuly acetyl-CoA?",
        o: ["3 NADH, 1 FADH2, 1 GTP a 2 CO2", "2 NADH, 2 FADH2, 1 ATP a 1 CO2", "4 NADH, 1 FADH2, 2 GTP a 2 CO2", "3 NADH, 2 FADH2, 0 GTP a 3 CO2"],
        a: 0,
        e: "Dva uhlíky acetyl-CoA sa uvoľnia ako 2 CO2 a redukčné ekvivalenty sa uložia do 3 NADH a 1 FADH2 plus 1 GTP.",
        x: "Z jednej glukózy vzniknú 2 acetyl-CoA, takže celý zisk na glukózu je dvojnásobný.",
        s: `Jedno otočenie citrátového cyklu z jednej molekuly acetyl-CoA poskytuje 3 NADH, 1 FADH2, 1 GTP a 2 CO2 (${file}, str. 12)`,
      },
      {
        id: "sbq5",
        t: "c",
        q: "Kde v eukaryotickej bunke prebieha citrátový cyklus?",
        o: ["V matrixe mitochondrií", "V cytozole", "V medzimembránovom priestore", "V hladkom endoplazmatickom retikule"],
        a: 0,
        e: "Enzýmy citrátového cyklu sú rozpustné v matrixe mitochondrií (s výnimkou sukcinátdehydrogenázy viazanej vo vnútornej membráne).",
        x: "",
        s: `Citrátový cyklus prebieha v matrixe mitochondrií (${file}, str. 11)`,
      },
      {
        id: "sbq6",
        t: "o",
        q: "Ktorý komplex dýchacieho reťazca NEpumpuje protóny do medzimembránového priestoru?",
        o: ["Komplex II (sukcinátdehydrogenáza)", "Komplex I (NADH-dehydrogenáza)", "Komplex III (cytochróm bc1)", "Komplex IV (cytochróm c oxidáza)"],
        a: 0,
        e: "Komplex II iba odovzdá elektróny z FADH2 na ubichinón; preto dáva FADH2 menej ATP ako NADH.",
        x: "Zatiaľ čo komplexy I, III a IV pumpujú H+, komplex II leží bokom od protónového čerpania.",
        s: `Komplex II (sukcinátdehydrogenáza) prenáša elektróny z FADH2 na ubichinón, ale nepumpuje protóny (${file}, str. 18)`,
      },
      {
        id: "sbq7",
        t: "o",
        q: "Čo je konečným akceptorom elektrónov v dýchacom reťazci?",
        o: ["Molekulový kyslík (O2)", "NAD+", "Pyruvát", "Oxid uhličitý (CO2)"],
        a: 0,
        e: "Komplex IV odovzdáva elektróny molekulovému kyslíku, ktorý sa s protónmi redukuje na molekuly vody.",
        x: "Bez kyslíka sa zastaví celý dýchací reťazec aj regenerácia NAD+ v mitochondriách.",
        s: `Konečným akceptorom elektrónov v dýchacom reťazci je molekulový kyslík (O2), ktorý sa redukuje na vodu (${file}, str. 19)`,
      },
      {
        id: "sbq8",
        t: "o",
        q: "Aký účinok má odpájač (napr. termogenín UCP1) v mitochondriách hnedého tukového tkaniva?",
        o: [
          "Umožní návrat protónov do matrixu bez syntézy ATP a uvoľní energiu ako teplo",
          "Zablokuje prenos elektrónov v komplexe IV a zastaví spotrebu kyslíka",
          "Zdvojnásobí syntézu ATP pri rovnakej spotrebe kyslíka",
          "Presmeruje glykolýzu z cytozolu do matrixu",
        ],
        a: 0,
        e: "Odpájače odbúrajú protónový gradient mimo ATP-syntázy, takže dýchací reťazec beží rýchlo, ale namiesto ATP vzniká teplo.",
        x: "Novorodenci využívajú termogenín v hnedom tuku na netrasovú termogenézu.",
        s: `Odpájače (napr. termogenín UCP1) umožňujú návrat protónov do matrixu bez syntézy ATP a energiu uvoľňujú ako teplo (${file}, str. 22)`,
      },
    ],
    exams: [
      {
        id: "sbx1",
        name: "Skúška 2025 – riadny termín",
        year: 2025,
        questions: [
          { id: "sbe1", n: "1", text: "Vysvetlite alosterickú reguláciu fosfofruktokinázy-1 (PFK-1).", topic: "Glykolýza a regulácia", points: 6 },
          { id: "sbe2", n: "2", text: "Prečo má FADH2 nižší výťažok ATP než NADH?", topic: "Oxidačná fosforylácia", points: 4 },
        ],
      },
      {
        id: "sbx2",
        name: "Skúška 2024 – riadny termín",
        year: 2024,
        questions: [
          { id: "sbe3", n: "1", text: "Vymenujte tri nevratné kroky glykolýzy a ich enzýmy.", topic: "Glykolýza a regulácia", points: 5 },
          { id: "sbe4", n: "2", text: "Napíšte energetickú bilanciu jedného otočenia citrátového cyklu.", topic: "Citrátový cyklus", points: 5 },
        ],
      },
      {
        id: "sbx3",
        name: "Skúška 2023 – opravný termín",
        year: 2023,
        questions: [
          { id: "sbe5", n: "1", text: "Aká je úloha kyslíka a komplexu IV v dýchacom reťazci?", topic: "Oxidačná fosforylácia", points: 5 },
          { id: "sbe6", n: "2", text: "Ako odpájače (UCP1) ovplyvňujú spotrebu kyslíka a syntézu ATP?", topic: "Oxidačná fosforylácia", points: 5 },
        ],
      },
      {
        id: "sbx4",
        name: "Skúška 2022 – riadny termín",
        year: 2022,
        questions: [
          { id: "sbe7", n: "1", text: "Porovnajte čistý a celkový zisk ATP v glykolýze.", topic: "Glykolýza a regulácia", points: 4 },
          { id: "sbe8", n: "2", text: "Ktorý enzým limituje rýchlosť citrátového cyklu a ako sa reguluje?", topic: "Citrátový cyklus", points: 4 },
        ],
      },
      {
        id: "sbx5",
        name: "Skúška 2021 – riadny termín",
        year: 2021,
        questions: [
          { id: "sbe9", n: "1", text: "Ktoré metabolity aktivujú a inhibujú PFK-1 v glykolýze?", topic: "Glykolýza a regulácia", points: 5 },
          { id: "sbe10", n: "2", text: "Ktoré komplexy dýchacieho reťazca pumpujú protóny?", topic: "Oxidačná fosforylácia", points: 5 },
        ],
      },
    ],
  };
}

function csSample() {
  const file = "bunecna-biochemie.pdf";
  return {
    id: SAMPLE_ID,
    sample: true,
    lang: "cs",
    code: "BIO",
    name: "Buněčná biochemie (ukázka)",
    term: "Ukázkový předmět",
    topics: {
      g: "Glykolýza a regulace",
      o: "Oxidační fosforylace",
      c: "Citrátový cyklus",
    },
    topicInfo: {
      g: {
        summary: "Štěpení glukózy na pyruvát v cytozolu a klíčové regulační enzymy (hexokináza, PFK-1, pyruvátkináza).",
        weakSpots: [
          "Záměna regulačních účinků AMP (aktivátor) a ATP/citrátu (inhibitory) na PFK-1",
          "Čistý zisk ATP (2 ATP) oproti celkovému zisku (4 ATP) na jednu molekulu glukózy",
        ],
      },
      o: {
        summary: "Přenos elektronů v dýchacím řetězci a syntéza ATP přes protonový gradient na vnitřní membráně mitochondrií.",
        weakSpots: [
          "Komplex II (sukcinátdehydrogenáza) nepřečerpává protony přes vnitřní membránu",
          "Rozdíl mezi inhibitory dýchacího řetězce a odpřahovači (uncouplers)",
        ],
      },
      c: {
        summary: "Oxidace acetyl-CoA v matrixu mitochondrií s tvorbou NADH, FADH2 a GTP.",
        weakSpots: [
          "Izocitrátdehydrogenáza jako hlavní krok limitující rychlost cyklu",
          "Výtěžek jednoho otočení cyklu (3 NADH, 1 FADH2, 1 GTP, 2 CO2)",
        ],
      },
    },
    files: [
      {
        name: file,
        title: "Energetický metabolismus buňky",
        pagesBefore: 24,
        pagesAfter: 2.5,
        summary: [
          "## Glykolýza a regulace",
          "- Glykolýza probíhá v cytozolu všech buněk a nevyžaduje kyslík.",
          "- **Hlavním regulačním enzymem glykolýzy je fosfofruktokináza-1 (PFK-1), aktivovaná AMP a fruktóza-2,6-bisfosfátem a inhibovaná ATP a citrátem.**",
          "- Z jedné molekuly glukózy vznikají v glykolýze 2 molekuly pyruvátu, čistý zisk je 2 ATP a 2 NADH.",
          "- Tři nevratné reakce glykolýzy katalyzují hexokináza, fosfofruktokináza-1 a pyruvátkináza.",
          "",
          "## Citrátový cyklus",
          "- Citrátový cyklus probíhá v matrixu mitochondrií a propojuje metabolismus sacharidů, lipidů a aminokyselin.",
          "- **Jedno otočení citrátového cyklu z jedné molekuly acetyl-CoA poskytuje 3 NADH, 1 FADH2, 1 GTP a 2 CO2.**",
          "- Hlavním regulačním enzymem citrátového cyklu je izocitrátdehydrogenáza, kterou aktivuje ADP a inhibují ATP a NADH.",
          "",
          "## Oxidační fosforylace",
          "- Dýchací řetězec je uložen ve vnitřní membráně mitochondrií a vytváří protonový gradient v mezimembránovém prostoru.",
          "- **Komplex II (sukcinátdehydrogenáza) přenáší elektrony z FADH2 na ubichinon, ale nepřečerpává protony do mezimembránového prostoru.**",
          "- Konečným akceptorem elektronů v dýchacím řetězci je molekulární kyslík (O2), který se redukuje na vodu.",
          "- Odpřahovače (např. termogenin UCP1) umožňují návrat protonů do matrixu bez syntézy ATP a energii uvolňují jako teplo.",
        ].join("\n"),
        keyTerms: [
          { term: "PFK-1", def: "Fosfofruktokináza-1 – klíčový regulační enzym glykolýzy." },
          { term: "Protonový gradient", def: "Elektrochemický rozdíl H+ na vnitřní mitochondriální membráně, který pohání ATP-syntázu." },
          { term: "Odpřahovač (uncoupler)", def: "Látka, která rozpojí přenos elektronů a syntézu ATP; energie se mění v teplo." },
        ],
      },
    ],
    questions: [
      {
        id: "sbq1",
        t: "g",
        q: "Který enzym je hlavním regulačním bodem glykolýzy?",
        o: ["Fosfofruktokináza-1 (PFK-1)", "Enoláza", "Fosfoglycerátmutáza", "Aldoláza"],
        a: 0,
        e: "PFK-1 katalyzuje první závazný krok glykolýzy a reaguje na energetický stav buňky (aktivuje ji AMP, inhibuje ATP a citrát).",
        x: "Při vysoké hladině ATP a citrátu v klidu se PFK-1 zpomalí a glukóza se šetří.",
        s: `Hlavním regulačním enzymem glykolýzy je fosfofruktokináza-1 (PFK-1) (${file}, str. 4)`,
      },
      {
        id: "sbq2",
        t: "g",
        q: "Jaký je čistý výtěžek glykolýzy z jedné molekuly glukózy?",
        o: ["2 pyruváty, 2 ATP a 2 NADH", "2 pyruváty, 4 ATP a 2 NADH", "1 pyruvát, 2 ATP a 1 NADH", "2 acetyl-CoA, 2 ATP a 4 NADH"],
        a: 0,
        e: "V investiční fázi se spotřebují 2 ATP a ve výtěžkové vzniknou 4 ATP, proto je čistý zisk 2 ATP a 2 NADH.",
        x: "Při anaerobním sprintu sval získává rychle právě tyto 2 ATP na glukózu.",
        s: `Z jedné molekuly glukózy vznikají v glykolýze 2 molekuly pyruvátu, čistý zisk je 2 ATP a 2 NADH (${file}, str. 5)`,
      },
      {
        id: "sbq3",
        t: "g",
        q: "Které enzymy katalyzují nevratné reakce glykolýzy? (Označ všechny správné.)",
        o: ["Hexokináza", "Fosfofruktokináza-1", "Pyruvátkináza", "Triózafosfátizomeráza"],
        a: [0, 1, 2],
        e: "Nevratné kroky katalyzují tři kinázy: hexokináza, PFK-1 a pyruvátkináza. V glukoneogenezi je musí obejít jiné enzymy.",
        x: "",
        s: `Tři nevratné reakce glykolýzy katalyzují hexokináza, fosfofruktokináza-1 a pyruvátkináza (${file}, str. 6)`,
      },
      {
        id: "sbq4",
        t: "c",
        q: "Co vznikne při jednom otočení citrátového cyklu z jedné molekuly acetyl-CoA?",
        o: ["3 NADH, 1 FADH2, 1 GTP a 2 CO2", "2 NADH, 2 FADH2, 1 ATP a 1 CO2", "4 NADH, 1 FADH2, 2 GTP a 2 CO2", "3 NADH, 2 FADH2, 0 GTP a 3 CO2"],
        a: 0,
        e: "Dva uhlíky acetyl-CoA se uvolní jako 2 CO2 a redukční ekvivalenty se uloží do 3 NADH a 1 FADH2 plus 1 GTP.",
        x: "Z jedné glukózy vzniknou 2 acetyl-CoA, takže celý zisk na glukózu je dvojnásobný.",
        s: `Jedno otočení citrátového cyklu z jedné molekuly acetyl-CoA poskytuje 3 NADH, 1 FADH2, 1 GTP a 2 CO2 (${file}, str. 12)`,
      },
      {
        id: "sbq5",
        t: "c",
        q: "Kde v eukaryotické buňce probíhá citrátový cyklus?",
        o: ["V matrixu mitochondrií", "V cytozolu", "V mezimembránovém prostoru", "V hladkém endoplazmatickém retikulu"],
        a: 0,
        e: "Enzymy citrátového cyklu jsou rozpustné v matrixu mitochondrií (s výjimkou sukcinátdehydrogenázy vázané ve vnitřní membráně).",
        x: "",
        s: `Citrátový cyklus probíhá v matrixu mitochondrií (${file}, str. 11)`,
      },
      {
        id: "sbq6",
        t: "o",
        q: "Který komplex dýchacího řetězce NEpřečerpává protony do mezimembránového prostoru?",
        o: ["Komplex II (sukcinátdehydrogenáza)", "Komplex I (NADH-dehydrogenáza)", "Komplex III (cytochrom bc1)", "Komplex IV (cytochrom c oxidáza)"],
        a: 0,
        e: "Komplex II pouze předá elektrony z FADH2 na ubichinon; proto dává FADH2 méně ATP než NADH.",
        x: "Zatímco komplexy I, III a IV přečerpávají H+, komplex II stojí mimo čerpání protonů.",
        s: `Komplex II (sukcinátdehydrogenáza) přenáší elektrony z FADH2 na ubichinon, ale nepřečerpává protony (${file}, str. 18)`,
      },
      {
        id: "sbq7",
        t: "o",
        q: "Co je konečným akceptorem elektronů v dýchacím řetězci?",
        o: ["Molekulární kyslík (O2)", "NAD+", "Pyruvát", "Oxid uhličitý (CO2)"],
        a: 0,
        e: "Komplex IV předává elektrony molekulárnímu kyslíku, který se s protony redukuje na molekuly vody.",
        x: "Bez kyslíku se zastaví celý dýchací řetězec i regenerace NAD+ v mitochondriích.",
        s: `Konečným akceptorem elektronů v dýchacím řetězci je molekulární kyslík (O2), který se redukuje na vodu (${file}, str. 19)`,
      },
      {
        id: "sbq8",
        t: "o",
        q: "Jaký účinek má odpřahovač (např. termogenin UCP1) v mitochondriích hnědé tukové tkáně?",
        o: [
          "Umožní návrat protonů do matrixu bez syntézy ATP a uvolní energii jako teplo",
          "Zablokuje přenos elektronů v komplexu IV a zastaví spotřebu kyslíku",
          "Zdvojnásobí syntézu ATP při stejné spotřebě kyslíku",
          "Přesměruje glykolýzu z cytozolu do matrixu",
        ],
        a: 0,
        e: "Odpřahovače odbourají protonový gradient mimo ATP-syntázu, takže dýchací řetězec běží rychle, ale místo ATP vzniká teplo.",
        x: "Novorozenci využívají termogenin v hnědém tuku pro netřesovou termogenezi.",
        s: `Odpřahovače (např. termogenin UCP1) umožňují návrat protonů do matrixu bez syntézy ATP a energii uvolňují jako teplo (${file}, str. 22)`,
      },
    ],
    exams: [
      {
        id: "sbx1",
        name: "Zkouška 2025 – řádný termín",
        year: 2025,
        questions: [
          { id: "sbe1", n: "1", text: "Vysvětlete alosterickou regulaci fosfofruktokinázy-1 (PFK-1).", topic: "Glykolýza a regulace", points: 6 },
          { id: "sbe2", n: "2", text: "Proč má FADH2 nižší výtěžek ATP než NADH?", topic: "Oxidační fosforylace", points: 4 },
        ],
      },
      {
        id: "sbx2",
        name: "Zkouška 2024 – řádný termín",
        year: 2024,
        questions: [
          { id: "sbe3", n: "1", text: "Vyjmenujte tři nevratné kroky glykolýzy a jejich enzymy.", topic: "Glykolýza a regulace", points: 5 },
          { id: "sbe4", n: "2", text: "Napište energetickou bilanci jednoho otočení citrátového cyklu.", topic: "Citrátový cyklus", points: 5 },
        ],
      },
      {
        id: "sbx3",
        name: "Zkouška 2023 – opravný termín",
        year: 2023,
        questions: [
          { id: "sbe5", n: "1", text: "Jaká je role kyslíku a komplexu IV v dýchacím řetězci?", topic: "Oxidační fosforylace", points: 5 },
          { id: "sbe6", n: "2", text: "Jak odpřahovače (UCP1) ovlivňují spotřebu kyslíku a syntézu ATP?", topic: "Oxidační fosforylace", points: 5 },
        ],
      },
      {
        id: "sbx4",
        name: "Zkouška 2022 – řádný termín",
        year: 2022,
        questions: [
          { id: "sbe7", n: "1", text: "Porovnejte čistý a celkový zisk ATP v glykolýze.", topic: "Glykolýza a regulace", points: 4 },
          { id: "sbe8", n: "2", text: "Který enzym limituje rychlost citrátového cyklu a jak se reguluje?", topic: "Citrátový cyklus", points: 4 },
        ],
      },
      {
        id: "sbx5",
        name: "Zkouška 2021 – řádný termín",
        year: 2021,
        questions: [
          { id: "sbe9", n: "1", text: "Které metabolity aktivují a inhibují PFK-1 v glykolýze?", topic: "Glykolýza a regulace", points: 5 },
          { id: "sbe10", n: "2", text: "Které komplexy dýchacího řetězce přečerpávají protony?", topic: "Oxidační fosforylace", points: 5 },
        ],
      },
    ],
  };
}

export function buildSampleSubject(lang = "sk") {
  return lang === "cs" ? csSample() : skSample();
}

export function ensureSampleSubject(lang = "sk") {
  const list = loadSubjects();
  const sample = buildSampleSubject(lang);
  const idx = list.findIndex((sj) => sj.id === SAMPLE_ID);
  if (idx < 0) {
    saveSubjects([...list, sample]);
  } else if (list[idx].sample && list[idx].lang !== sample.lang) {
    const next = list.slice();
    next[idx] = { ...sample, exam: list[idx].exam };
    saveSubjects(next);
  }
  return SAMPLE_ID;
}
