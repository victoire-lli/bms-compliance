import { useState, useRef, useEffect } from "react";
import * as XLSX from "xlsx";

const CATEGORIES = ["Jeux & Loisirs","Santé / Bien-être / Soulagement douleurs","Article de puériculture","Textile maison","Textile lit","Hygiène","Ustensiles cuisine","Robot ménager","Autres"];
const ZONES = ["EU","US","UK","EU + US","EU + UK","EU + US + UK","Autre"];
const CIBLES = ["Adultes","Enfants < 3 ans","Enfants 3–14 ans","Enfants < 14 ans","Seniors","Tous publics"];
const CERTIFS = ["GOTS","OEKO-TEX","CE","REACH","EN 71","CPSC","AP Non-Toxic","GPSR","EUDR","FSC","ISO 9001","Prop 65","BS 7972"];
const RISK_CRITERIA = [
  {level:"ÉLEVÉ",color:"#DC2626",bg:"#FEF2F2",items:["Produit destiné aux enfants (< 14 ans)","Substances chimiques dans le produit","Allégations santé / médical","Article de puériculture","Cumul ≥ 3 certifications manquantes","Catégorie à historique de rappels élevé"]},
  {level:"MOYEN",color:"#D97706",bg:"#FFFBEB",items:["Produit adulte avec certifications requises non obtenues","Allégations marketing à valider","Multi-marchés avec exigences divergentes","Norme identifiée mais dossier incomplet"]},
  {level:"FAIBLE",color:"#16A34A",bg:"#F0FDF4",items:["Textile standard adulte sur marché unique","Certifications déjà en place","Pas d'allégations complexes","Catégorie bien connue sans rappels récents"]},
];
const C = {
  navy:"#0A1628",blue:"#1A56DB",blueL:"#EBF2FF",
  red:"#DC2626",redL:"#FEF2F2",redB:"#FECACA",
  amber:"#D97706",amberL:"#FFFBEB",amberB:"#FDE68A",
  green:"#16A34A",greenL:"#F0FDF4",greenB:"#BBF7D0",
  purple:"#7C3AED",purpleL:"#FAF5FF",purpleB:"#DDD6FE",
  teal:"#0D9488",tealL:"#F0FDFA",tealB:"#99F6E4",
  g50:"#F9FAFB",g100:"#F3F4F6",g200:"#E5E7EB",g400:"#9CA3AF",g600:"#4B5563",g900:"#111827",
};
const font = "'IBM Plex Sans',system-ui,sans-serif";
const inp = {fontFamily:font,fontSize:13,padding:"9px 12px",border:"1.5px solid #E5E7EB",borderRadius:10,background:"#F9FAFB",color:"#111827",outline:"none",width:"100%"};

// ── localStorage helpers (remplace window.storage) ──
function loadHistory() {
  try { return Promise.resolve(JSON.parse(localStorage.getItem("compliance_history") || "[]")); }
  catch(e) { return Promise.resolve([]); }
}
function saveHistory(h) {
  try { localStorage.setItem("compliance_history", JSON.stringify(h)); } catch(e) {}
  return Promise.resolve();
}
function loadLibrary() {
  try { return JSON.parse(localStorage.getItem("normes_library") || "[]"); } catch(e) { return []; }
}
function saveLibrary(lib) {
  try { localStorage.setItem("normes_library", JSON.stringify(lib)); } catch(e) {}
}

function repairJSON(t) {
  let s = t.replace(/```json|```/g,"").trim().replace(/,\s*$/,"").replace(/,\s*"[^"]*$/,"");
  const ob=(s.match(/{/g)||[]).length-(s.match(/}/g)||[]).length;
  const oa=(s.match(/\[/g)||[]).length-(s.match(/\]/g)||[]).length;
  for(let i=0;i<oa;i++) s+="]";
  for(let i=0;i<ob;i++) s+="}";
  return s;
}
function riskMeta(level) {
  if(level==="ÉLEVÉ") return {bg:C.redL,bc:C.redB,lbl:"Risque ÉLEVÉ",lc:C.red,dot:C.red};
  if(level==="MOYEN") return {bg:C.amberL,bc:C.amberB,lbl:"Risque MOYEN",lc:C.amber,dot:C.amber};
  return {bg:C.greenL,bc:C.greenB,lbl:"Risque FAIBLE",lc:C.green,dot:C.green};
}

// ── API call via Netlify Function proxy ──
async function callClaude(messages, maxTokens) {
  const mt = maxTokens || 1500;
  const body = Array.isArray(messages)
    ? {model:"claude-sonnet-4-20250514",max_tokens:mt,messages}
    : {model:"claude-sonnet-4-20250514",max_tokens:mt,messages:[{role:"user",content:messages}]};
  const res = await fetch("/api/claude", {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify(body)
  });
  const raw = await res.json();
  if(!res.ok) throw new Error(raw.error ? raw.error.message : "Erreur API");
  return (raw.content.find(function(b){return b.type==="text";}).text||"").replace(/```json|```/g,"").trim();
}

// ── UI atoms ──
function MktTag(props) {
  return <span style={{fontSize:10,fontWeight:600,padding:"2px 8px",borderRadius:10,background:C.navy,color:"#fff"}}>{props.m}</span>;
}
function CountCard(props) {
  const m={must:{bg:C.redL,bc:C.redB,nc:C.red},nice:{bg:C.greenL,bc:C.greenB,nc:C.green},risk:{bg:C.amberL,bc:C.amberB,nc:C.amber},miss:{bg:C.purpleL,bc:C.purpleB,nc:C.purple}};
  const s=m[props.type];
  return <div style={{padding:12,borderRadius:10,textAlign:"center",border:"1px solid "+s.bc,background:s.bg}}><div style={{fontSize:22,fontWeight:700,color:s.nc}}>{props.n}</div><div style={{fontSize:11,fontWeight:600,color:C.g600,marginTop:2}}>{props.label}</div></div>;
}
function RiskInfo() {
  const [open,setOpen]=useState(false);
  return (
    <div style={{position:"relative",display:"inline-block"}}>
      <button onClick={function(){setOpen(function(o){return !o;});}} style={{width:18,height:18,borderRadius:"50%",background:C.g200,border:"none",cursor:"pointer",fontSize:11,fontWeight:700,color:C.g600,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:font}}>?</button>
      {open && (
        <div style={{position:"absolute",top:24,right:0,zIndex:100,background:"#fff",border:"1px solid "+C.g200,borderRadius:12,padding:16,width:340,boxShadow:"0 4px 24px rgba(0,0,0,.1)"}}>
          <div style={{fontSize:12,fontWeight:700,color:C.g900,marginBottom:10}}>Comment est défini le niveau de risque ?</div>
          {RISK_CRITERIA.map(function(r){return(
            <div key={r.level} style={{marginBottom:10,background:r.bg,borderRadius:8,padding:"8px 12px"}}>
              <div style={{fontSize:11,fontWeight:700,color:r.color,marginBottom:4}}>{r.level}</div>
              {r.items.map(function(it,i){return <div key={i} style={{fontSize:11,color:C.g600,marginBottom:2}}>• {it}</div>;})}
            </div>
          );})}
          <button onClick={function(){setOpen(false);}} style={{fontSize:11,color:C.g400,background:"none",border:"none",cursor:"pointer",marginTop:4,fontFamily:font}}>Fermer</button>
        </div>
      )}
    </div>
  );
}

function NormContest(props) {
  const [open,setOpen]=useState(false);
  const [text,setText]=useState("");
  const [result,setResult]=useState(null);
  const [loading,setLoading]=useState(false);
  function run() {
    if(!text.trim()) return;
    setLoading(true); setResult(null);
    var p = "Tu es expert en compliance produit e-commerce (EU/US/UK/Amazon).\nPRODUIT : "+props.productContext+"\nNORME CONTESTÉE : "+props.norm+"\nARGUMENT : "+text+"\nJSON uniquement sans markdown :\n{\"verdict\":\"CONTESTATION VALIDE\"|\"CONTESTATION PARTIELLE\"|\"NORME APPLICABLE\",\"explication\":\"3-4 phrases\",\"recommandation\":\"action concrète\",\"nouvelle_norme\":{\"applicable\":false,\"nom\":\"\",\"type\":\"nice\",\"what\":\"\",\"why_mandatory\":\"\",\"risk_if_missing\":\"\",\"benefit\":\"\",\"markets\":[\"EU\"]},\"avocat_requis\":false,\"sources\":[]}";
    callClaude(p).then(function(txt){
      setResult(JSON.parse(repairJSON(txt)));
      setLoading(false);
    }).catch(function(e){
      setResult({verdict:"ERREUR",explication:e.message,recommandation:"",nouvelle_norme:{applicable:false},avocat_requis:false,sources:[]});
      setLoading(false);
    });
  }
  var vs = result ? (result.verdict==="CONTESTATION VALIDE" ? {bg:C.greenL,bc:C.greenB,tc:C.green} : result.verdict==="CONTESTATION PARTIELLE" ? {bg:C.amberL,bc:C.amberB,tc:C.amber} : {bg:C.redL,bc:C.redB,tc:C.red}) : null;
  return (
    <div style={{marginTop:10}}>
      <button onClick={function(){setOpen(function(o){return !o;});setResult(null);setText("");}} style={{fontFamily:font,fontSize:12,fontWeight:700,borderRadius:20,cursor:"pointer",border:"1.5px solid "+C.amber,color:C.amber,background:"transparent",padding:"5px 14px"}}>{open?"Annuler":"Contester cette norme ↗"}</button>
      {open && (
        <div style={{marginTop:10,background:C.amberL,border:"1.5px solid "+C.amberB,borderRadius:10,padding:14}}>
          <div style={{fontSize:12,fontWeight:700,color:"#92400E",marginBottom:8}}>Votre argument de contestation</div>
          <textarea value={text} onChange={function(e){setText(e.target.value);}} placeholder="Ex : Le marquage CE ne s'applique pas aux textiles de maison." style={{fontFamily:font,fontSize:12,padding:"8px 10px",border:"1.5px solid "+C.amberB,borderRadius:8,background:"#fff",color:C.g900,outline:"none",width:"100%",resize:"vertical",minHeight:72}}/>
          <button onClick={run} disabled={loading||!text.trim()} style={{marginTop:8,fontFamily:font,fontSize:12,fontWeight:700,borderRadius:8,padding:"7px 16px",background:C.navy,color:"#fff",border:"none",cursor:loading||!text.trim()?"not-allowed":"pointer",opacity:loading||!text.trim()?0.5:1}}>{loading?"Analyse…":"Analyser →"}</button>
          {result && vs && (
            <div style={{marginTop:12,background:vs.bg,border:"1px solid "+vs.bc,borderRadius:8,padding:14}}>
              <div style={{fontSize:13,fontWeight:700,color:vs.tc,marginBottom:8}}>{result.verdict}</div>
              <div style={{fontSize:12,color:"#374151",lineHeight:1.6,marginBottom:8}}>{result.explication}</div>
              {result.recommandation && <div style={{fontSize:12,color:"#374151",marginBottom:8}}>{result.recommandation}</div>}
              {result.nouvelle_norme && result.nouvelle_norme.applicable && (
                <div style={{background:"#fff",border:"1.5px solid "+C.greenB,borderRadius:8,padding:12,marginBottom:8}}>
                  <div style={{fontSize:12,fontWeight:700,color:C.green,marginBottom:6,display:"flex",alignItems:"center",gap:8}}>
                    Norme de remplacement : {result.nouvelle_norme.nom}
                    <button onClick={function(){if(props.onAddNorm) props.onAddNorm(result.nouvelle_norme);}} style={{fontFamily:font,fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:20,background:C.greenL,border:"1.5px solid "+C.greenB,color:C.green,cursor:"pointer"}}>+ Ajouter</button>
                  </div>
                  <div style={{fontSize:12,color:C.g600}}>{result.nouvelle_norme.what}</div>
                </div>
              )}
              {result.avocat_requis && <div style={{fontSize:11,fontWeight:600,color:C.purple,background:C.purpleL,padding:"4px 10px",borderRadius:20,display:"inline-block",border:"1px solid "+C.purpleB}}>Vérification avocat recommandée</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RiskContest(props) {
  const [open,setOpen]=useState(false);
  const [text,setText]=useState("");
  const [result,setResult]=useState(null);
  const [loading,setLoading]=useState(false);
  function run() {
    if(!text.trim()) return;
    setLoading(true); setResult(null);
    var p = "Tu es expert en compliance e-commerce.\nPRODUIT : "+props.productContext+"\nRISQUE CONTESTÉ : "+props.risk+"\nARGUMENT : "+text+"\nJSON uniquement :\n{\"verdict\":\"RISQUE SURÉVALUÉ\"|\"RISQUE CORRECTEMENT ÉVALUÉ\"|\"RISQUE SOUS-ÉVALUÉ\",\"explication\":\"3 phrases\",\"nouvelle_probabilite\":25,\"recommandation\":\"mesure concrète\",\"avocat_requis\":false}";
    callClaude(p).then(function(txt){
      var d = JSON.parse(repairJSON(txt));
      setResult(d);
      if(props.onUpdateRisk && d.nouvelle_probabilite != null) props.onUpdateRisk(d.nouvelle_probabilite);
      setLoading(false);
    }).catch(function(e){
      setResult({verdict:"ERREUR",explication:e.message,nouvelle_probabilite:null,recommandation:"",avocat_requis:false});
      setLoading(false);
    });
  }
  var vc = result ? (result.verdict==="RISQUE SURÉVALUÉ" ? {bg:C.greenL,bc:C.greenB,tc:C.green} : result.verdict==="RISQUE SOUS-ÉVALUÉ" ? {bg:C.redL,bc:C.redB,tc:C.red} : {bg:C.amberL,bc:C.amberB,tc:C.amber}) : null;
  return (
    <div style={{marginTop:10}}>
      <button onClick={function(){setOpen(function(o){return !o;});setResult(null);setText("");}} style={{fontFamily:font,fontSize:12,fontWeight:700,borderRadius:20,cursor:"pointer",border:"1.5px solid "+C.amber,color:C.amber,background:"transparent",padding:"5px 14px"}}>{open?"Annuler":"Contester ce risque ↗"}</button>
      {open && (
        <div style={{marginTop:10,background:C.amberL,border:"1.5px solid "+C.amberB,borderRadius:10,padding:14}}>
          <textarea value={text} onChange={function(e){setText(e.target.value);}} placeholder="Ex : Notre produit est vendu exclusivement à des adultes..." style={{fontFamily:font,fontSize:12,padding:"8px 10px",border:"1.5px solid "+C.amberB,borderRadius:8,background:"#fff",color:C.g900,outline:"none",width:"100%",resize:"vertical",minHeight:64}}/>
          <button onClick={run} disabled={loading||!text.trim()} style={{marginTop:8,fontFamily:font,fontSize:12,fontWeight:700,borderRadius:8,padding:"7px 16px",background:C.navy,color:"#fff",border:"none",cursor:loading||!text.trim()?"not-allowed":"pointer",opacity:loading||!text.trim()?0.5:1}}>{loading?"Analyse…":"Analyser →"}</button>
          {result && vc && (
            <div style={{marginTop:10,background:vc.bg,border:"1px solid "+vc.bc,borderRadius:8,padding:12}}>
              <div style={{fontSize:13,fontWeight:700,color:vc.tc,marginBottom:6}}>{result.verdict}</div>
              <div style={{fontSize:12,color:"#374151",lineHeight:1.6,marginBottom:6}}>{result.explication}</div>
              {result.nouvelle_probabilite != null && <div style={{fontSize:12,fontWeight:600,color:C.g900,marginBottom:6}}>Probabilité révisée : {result.nouvelle_probabilite}%</div>}
              {result.recommandation && <div style={{fontSize:12,color:"#374151"}}>{result.recommandation}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NormCard(props) {
  var n=props.n, type=props.type;
  var bgs={must:C.redL,nice:C.greenL,miss:C.amberL,rec:C.g100};
  var bcs={must:C.redB,nice:C.greenB,miss:C.amberB,rec:C.g200};
  var CAT_META={marquage:{label:"Marquage",bg:"#EFF6FF",cl:"#1D4ED8",icon:"◈"},test:{label:"Test labo",bg:"#FEF3C7",cl:"#92400E",icon:"⚗"},documentation:{label:"Document",bg:"#F5F3FF",cl:"#5B21B6",icon:"📄"},certification:{label:"Certif.",bg:"#ECFDF5",cl:"#065F46",icon:"✦"},test_complementaire:{label:"Test complémentaire",bg:"#FEF9C3",cl:"#713F12",icon:"⚗"}};
  var SEV_META={danger:{label:"Danger",bg:"#FEE2E2",cl:C.red,border:C.redB},majeur:{label:"Majeur",bg:"#FEF3C7",cl:C.amber,border:C.amberB},mineur:{label:"Mineur",bg:"#F0FDF4",cl:C.green,border:C.greenB}};
  var cat=CAT_META[n.category]||null;
  var sev=SEV_META[n.severity]||null;
  return (
    <div style={{borderRadius:10,padding:16,marginBottom:10,border:"1.5px solid "+(props.isNew?C.green:bcs[type]),background:bgs[type],position:"relative"}}>
      {props.isNew && <div style={{position:"absolute",top:-1,right:12,fontSize:10,fontWeight:700,background:C.green,color:"#fff",padding:"2px 8px",borderRadius:"0 0 6px 6px"}}>AJOUTÉ</div>}
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12,marginBottom:8,flexWrap:"wrap"}}>
        <span style={{fontSize:14,fontWeight:700,color:C.g900,flex:1}}>{n.norm||n.description}</span>
        <div style={{display:"flex",gap:5,flexWrap:"wrap",flexShrink:0,alignItems:"center"}}>
          {cat && <span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:20,background:cat.bg,color:cat.cl}}>{cat.icon} {cat.label}</span>}
          {sev && <span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:20,background:sev.bg,color:sev.cl,border:"1px solid "+sev.border}}>{sev.label}</span>}
          {n.lawyer && <span style={{fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:20,textTransform:"uppercase",background:C.purpleL,color:C.purple,border:"1px solid "+C.purpleB}}>Avocat</span>}
        </div>
      </div>
      <div style={{fontSize:13,color:C.g600,marginBottom:8,lineHeight:1.6}}>{n.what||n.reason||""}</div>
      {type==="must" && (
        <div>
          <div style={{height:1,background:C.g200,margin:"10px 0"}}/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div><div style={{fontSize:10,fontWeight:700,color:C.g900,marginBottom:3,textTransform:"uppercase",letterSpacing:".04em"}}>Pourquoi obligatoire</div><div style={{fontSize:12,color:C.g600,lineHeight:1.5}}>{n.why_mandatory}</div></div>
            <div style={{background:sev?sev.bg:"#fff",borderRadius:8,padding:"8px 10px",border:"1px solid "+(sev?sev.border:C.g200)}}>
              <div style={{fontSize:10,fontWeight:700,color:sev?sev.cl:C.g900,marginBottom:3,textTransform:"uppercase",letterSpacing:".04em"}}>Risque si absent</div>
              <div style={{fontSize:12,color:sev?sev.cl:C.red,lineHeight:1.5,fontWeight:600}}>{n.risk_if_missing}</div>
            </div>
          </div>
        </div>
      )}
      {type==="nice" && <div><div style={{fontSize:10,fontWeight:700,color:C.g900,marginBottom:3,textTransform:"uppercase",letterSpacing:".04em"}}>Bénéfice concret</div><div style={{fontSize:12,color:C.green,lineHeight:1.5}}>{n.benefit}</div></div>}
      {type==="miss" && <div><div style={{fontSize:10,fontWeight:700,color:C.amber,marginBottom:3,textTransform:"uppercase",letterSpacing:".04em"}}>Recommandation</div><div style={{fontSize:12,color:"#92400E",lineHeight:1.5}}>{n.recommendation}</div></div>}
      {n.cost_max > 0 && <div style={{display:"inline-flex",alignItems:"center",gap:6,marginTop:10,padding:"3px 10px",borderRadius:20,background:C.g100,border:"1px solid "+C.g200}}><span style={{fontSize:11,fontWeight:700,color:C.g600}}>Coût estimé : {(n.cost_min||0).toLocaleString("fr-FR")}–{n.cost_max.toLocaleString("fr-FR")}€</span>{n.cost_note && <span style={{fontSize:11,color:C.g400}}>— {n.cost_note}</span>}</div>}
      {n.cost_max===0 && n.category==="marquage" && <div style={{display:"inline-flex",alignItems:"center",gap:6,marginTop:10,padding:"3px 10px",borderRadius:20,background:C.greenL,border:"1px solid "+C.greenB}}><span style={{fontSize:11,fontWeight:700,color:C.green}}>Coût : 0€ — apposition visuelle uniquement</span></div>}
      {(n.markets||[]).length > 0 && <div style={{display:"flex",gap:4,marginTop:8,flexWrap:"wrap"}}>{n.markets.map(function(m){return <MktTag key={m} m={m}/>;})}</div>}
      {(n.labos||[]).length > 0 && type==="must" && n.category==="test" && <div style={{marginTop:8}}><div style={{fontSize:10,fontWeight:700,color:C.g600,textTransform:"uppercase",letterSpacing:".05em",marginBottom:4}}>Labos accrédités</div><div style={{display:"flex",flexWrap:"wrap",gap:4}}>{n.labos.map(function(l){return <span key={l} style={{fontSize:11,padding:"2px 8px",borderRadius:6,background:C.tealL,color:C.teal,border:"1px solid "+C.tealB,fontWeight:600}}>{l}</span>;})}</div></div>}
      {(type==="must"||type==="nice") && <NormContest norm={n.norm} productContext={props.productContext} onAddNorm={props.onAddNorm}/>}
    </div>
  );
}

function RiskItem(props) {
  var r=props.r;
  const [prob,setProb]=useState(Math.min(100,Math.max(0,parseInt(r.probability)||0)));
  var st=prob>=60?{cl:C.red,bg:"#FEE2E2"}:prob>=30?{cl:C.amber,bg:"#FEF3C7"}:{cl:C.green,bg:"#DCFCE7"};
  return (
    <div style={{borderRadius:10,padding:"14px 16px",marginBottom:10,border:"1px solid "+C.g200,background:"#fff"}}>
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12,marginBottom:8}}>
        <span style={{fontSize:13,fontWeight:700,color:C.g900,flex:1}}>{r.risk}</span>
        <span style={{fontSize:13,fontWeight:700,padding:"4px 12px",borderRadius:20,background:st.bg,color:st.cl,whiteSpace:"nowrap"}}>{prob}%</span>
      </div>
      <div style={{height:5,background:C.g100,borderRadius:99,marginBottom:10,overflow:"hidden"}}><div style={{height:"100%",width:prob+"%",background:st.cl,borderRadius:99,transition:"width .4s"}}/></div>
      <div style={{fontSize:12,color:C.g600,lineHeight:1.5,marginBottom:6}}>{r.description}</div>
      {(r.amazon_keywords||[]).length > 0 && <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:6}}>{r.amazon_keywords.map(function(k){return <span key={k} style={{fontSize:11,fontFamily:"monospace",padding:"2px 8px",borderRadius:6,background:C.g100,color:C.g600,border:"1px solid "+C.g200}}>{k}</span>;})}</div>}
      <RiskContest risk={r.risk} productContext={props.productContext} onUpdateRisk={setProb}/>
    </div>
  );
}

function MarquageTab(props) {
  var data=props.data, meta=props.meta;
  var allNorms=[].concat(
    (data.must_have||[]).map(function(n){return Object.assign({},n,{_t:"must"});}),
    (data.nice_to_have||[]).map(function(n){return Object.assign({},n,{_t:"nice"});})
  );
  const [checked,setChecked]=useState(new Set());
  const [markings,setMarkings]=useState(null);
  const [loading,setLoading]=useState(false);
  function toggle(norm){setChecked(function(p){var n=new Set(p);n.has(norm)?n.delete(norm):n.add(norm);return n;});}
  function generate() {
    if(checked.size===0) return;
    setLoading(true); setMarkings(null);
    var validated=allNorms.filter(function(n){return checked.has(n.norm);});
    var p = "Tu es expert en compliance produit, marquages réglementaires ET avertissements de sécurité.\n"
      +"PRODUIT : "+meta.pname+" — "+meta.cat+" — "+meta.zone+"\n"
      +"NORMES VALIDÉES : "+validated.map(function(n){return n.norm;}).join(", ")+"\n\n"
      +"Génère DEUX types de marquages :\n"
      +"1. MARQUAGES LÉGAUX : textes et logos obligatoires liés aux normes validées (CE, GPSR, REACH, etc.)\n"
      +"2. AVERTISSEMENTS DE SÉCURITÉ : mentions de sécurité adaptées au type de produit.\n"
      +"   - Textile lit/maison : 'Laver avant première utilisation'\n"
      +"   - Sac plastique : 'ATTENTION - Risque de suffocation. Tenir hors de portée des enfants.'\n"
      +"   - Jouets/puériculture : âge minimum, surveillance adulte, pièces petites\n"
      +"   - Protections sport : limites de protection, vitesse max, vérification avant usage\n"
      +"   - Produits électriques : tension, ne pas immerger, garder au sec\n\n"
      +"JSON uniquement. texte_legal MAX 2 phrases. exemples = 3-4 formulations courtes réelles.\n"
      +"{\"marquages\":[{\"norm\":\"Nom\",\"type\":\"legal\"|\"securite\",\"texte_legal\":\"texte exact\",\"placement\":[\"étiquette\",\"packaging\",\"listing Amazon\"],\"format\":\"instructions courtes\",\"exemples\":[\"F1\",\"F2\",\"F3\"],\"priorite\":\"obligatoire\"|\"recommandé\"}]}";
    callClaude(p, 5000).then(function(txt){
      setMarkings(JSON.parse(repairJSON(txt)));
      setLoading(false);
    }).catch(function(e){
      setMarkings({error:e.message});
      setLoading(false);
    });
  }
  function exportMarquages() {
    if(!markings||!markings.marquages) return;
    var rows=markings.marquages.flatMap(function(m){var ex=Array.isArray(m.exemples)?m.exemples:[m.exemples||""];return ex.map(function(e,i){return {"Norme":i===0?m.norm:"","Type":i===0?(m.type||""):"","Priorité":i===0?m.priorite:"","Texte légal":i===0?m.texte_legal:"","Exemple":e,"Format":i===0?m.format:"","Placement":i===0?(m.placement||[]).join(", "):""}});});
    var wb=XLSX.utils.book_new();var ws=XLSX.utils.json_to_sheet(rows);ws["!cols"]=[{wch:20},{wch:10},{wch:12},{wch:36},{wch:42},{wch:28},{wch:36}];XLSX.utils.book_append_sheet(wb,ws,"Marquages créa");XLSX.writeFile(wb,"Marquages_"+meta.pname.replace(/[^a-zA-Z0-9]/g,"_").slice(0,30)+".xlsx");
  }
  return (
    <div>
      <div style={{background:C.tealL,border:"1px solid "+C.tealB,borderRadius:12,padding:"14px 18px",marginBottom:16}}>
        <div style={{fontSize:13,fontWeight:700,color:C.teal,marginBottom:4}}>Générateur de marquages & avertissements pour la créa</div>
        <div style={{fontSize:12,color:C.g600}}>Cochez les normes validées. L'outil génère les marquages légaux <strong>ET</strong> les avertissements de sécurité adaptés au produit.</div>
      </div>
      <div style={{background:"#fff",border:"1px solid "+C.g200,borderRadius:12,padding:16,marginBottom:16}}>
        {allNorms.length===0 && <div style={{fontSize:13,color:C.g400}}>Aucune norme dans l'analyse.</div>}
        {allNorms.map(function(n){return(
          <label key={n.norm} onClick={function(){toggle(n.norm);}} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 12px",borderRadius:8,cursor:"pointer",background:checked.has(n.norm)?C.greenL:"transparent",border:"1px solid "+(checked.has(n.norm)?C.greenB:C.g200),marginBottom:6}}>
            <div style={{width:18,height:18,borderRadius:4,border:"2px solid "+(checked.has(n.norm)?C.green:C.g400),background:checked.has(n.norm)?C.green:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              {checked.has(n.norm) && <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round"/></svg>}
            </div>
            <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:C.g900}}>{n.norm}</div><div style={{fontSize:11,color:C.g400}}>{n._t==="must"?"Obligation légale":"Nice to have"} · {(n.markets||[]).join(", ")}</div></div>
          </label>
        );})}
        <button onClick={generate} disabled={loading||checked.size===0} style={{marginTop:12,width:"100%",padding:"10px 16px",background:checked.size>0?C.teal:C.g200,color:"#fff",border:"none",borderRadius:10,fontFamily:font,fontSize:13,fontWeight:700,cursor:checked.size>0?"pointer":"not-allowed"}}>
          {loading?"Génération…":"Générer marquages & avertissements ("+checked.size+" norme"+(checked.size>1?"s":"")+")"}
        </button>
      </div>
      {markings && markings.error && <div style={{background:C.redL,border:"1px solid "+C.redB,borderRadius:10,padding:14,fontSize:13,color:C.red}}>{markings.error}</div>}
      {markings && markings.marquages && (
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{display:"flex",gap:8}}>
              <span style={{fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:20,background:"#FEF2F2",color:C.red,border:"1px solid "+C.redB}}>⚖ Légal</span>
              <span style={{fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:20,background:"#FFF7ED",color:"#C2410C",border:"1px solid #FED7AA"}}>⚠ Sécurité</span>
            </div>
            <button onClick={exportMarquages} style={{display:"flex",alignItems:"center",gap:6,padding:"7px 14px",background:C.greenL,border:"1.5px solid "+C.greenB,borderRadius:8,fontFamily:font,fontSize:12,fontWeight:700,color:C.green,cursor:"pointer"}}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>Exporter Excel
            </button>
          </div>
          {markings.marquages.map(function(m,i){
            var ex=Array.isArray(m.exemples)?m.exemples:[m.exemples||""];
            var isSecurite=m.type==="securite";
            var hBg=isSecurite?"#FFF7ED":C.tealL;
            var hBorder=isSecurite?"#FED7AA":C.tealB;
            var hColor=isSecurite?"#C2410C":C.teal;
            return(
              <div key={i} style={{background:"#fff",border:"1.5px solid "+hBorder,borderRadius:12,padding:16,marginBottom:12}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10,flexWrap:"wrap",gap:8}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:12,fontWeight:700,padding:"2px 8px",borderRadius:20,background:hBg,color:hColor,border:"1px solid "+hBorder}}>{isSecurite?"⚠ Sécurité":"⚖ Légal"}</span>
                    <div style={{fontSize:15,fontWeight:700,color:hColor}}>{m.norm}</div>
                  </div>
                  <span style={{fontSize:10,fontWeight:700,padding:"3px 10px",borderRadius:20,background:m.priorite==="obligatoire"?C.redL:"#DCFCE7",color:m.priorite==="obligatoire"?C.red:C.green,textTransform:"uppercase"}}>{m.priorite}</span>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                  {m.texte_legal && <div style={{background:C.g50,borderRadius:8,padding:"10px 12px",border:"1px solid "+C.g200}}>
                    <div style={{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",color:C.g400,marginBottom:4}}>Explication importante</div>
                    <div style={{fontSize:12,color:C.navy,lineHeight:1.5,fontFamily:"monospace"}}>{m.texte_legal}</div>
                  </div>}
                  {m.format && <div style={{background:C.g50,borderRadius:8,padding:"10px 12px",border:"1px solid "+C.g200}}>
                    <div style={{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",color:C.g400,marginBottom:4}}>Format / taille</div>
                    <div style={{fontSize:12,color:C.g600,lineHeight:1.5}}>{m.format}</div>
                  </div>}
                  <div style={{gridColumn:"1/-1",background:C.blueL,borderRadius:8,padding:"10px 12px",border:"1px solid rgba(26,86,219,.12)"}}>
                    <div style={{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",color:C.blue,marginBottom:8}}>Exemples de formulations</div>
                    <div style={{display:"flex",flexDirection:"column",gap:6}}>
                      {ex.map(function(e,j){return(
                        <div key={j} style={{display:"flex",alignItems:"flex-start",gap:8}}>
                          <span style={{width:18,height:18,borderRadius:4,background:C.blue,color:"#fff",fontSize:10,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1}}>{j+1}</span>
                          <span style={{fontSize:12,color:C.navy,lineHeight:1.5,fontFamily:"monospace"}}>{e}</span>
                        </div>
                      );})}
                    </div>
                  </div>
                  {m.placement && <div style={{background:C.g50,borderRadius:8,padding:"10px 12px",border:"1px solid "+C.g200}}>
                    <div style={{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",color:C.g400,marginBottom:4}}>Placement</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:4}}>{m.placement.map(function(p){return <span key={p} style={{fontSize:11,padding:"2px 8px",borderRadius:10,background:C.navy,color:"#fff"}}>{p}</span>;})}</div>
                  </div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ConcurrentTab(props) {
  const [url,setUrl]=useState(props.meta.competitor_url||"");
  const [text,setText]=useState(props.competitorInfo||"");
  const [photos,setPhotos]=useState(props.initialPhotos||[]);
  const [result,setResult]=useState(null);
  const [loading,setLoading]=useState(false);
  const fileRef=useRef(null);
  function handleFiles(files) {
    var promises=[];
    for(var i=0;i<files.length;i++){
      if(!files[i].type.startsWith("image/")) continue;
      (function(f){promises.push(new Promise(function(res,rej){var r=new FileReader();r.onload=function(){res({name:f.name,base64:r.result.split(",")[1],mediaType:f.type});};r.onerror=rej;r.readAsDataURL(f);}));})(files[i]);
    }
    Promise.all(promises).then(function(arr){setPhotos(function(p){return p.concat(arr).slice(0,6);});});
  }
  function analyze() {
    var hasInput=text.trim()||url.trim()||photos.length>0;
    if(!hasInput) return;
    setLoading(true); setResult(null);
    var userContent=[];
    for(var i=0;i<photos.length;i++){userContent.push({type:"image",source:{type:"base64",media_type:photos[i].mediaType,data:photos[i].base64}});}
    var lines=[];
    lines.push("Tu es expert en compliance produit e-commerce et analyse concurrentielle.");
    lines.push("NOTRE PRODUIT : "+props.meta.pname+" — "+props.meta.cat+" — "+props.meta.zone+" — "+props.meta.cible);
    if(url) lines.push("URL CONCURRENT : "+url);
    if(text) lines.push("DESCRIPTION : "+text);
    if(photos.length>0) lines.push("Photos du packaging jointes. Analyse UNIQUEMENT les certifications et mentions VISIBLES ET EXPLICITES.");
    lines.push("REGLES : 1. Ne jamais indiquer CE si non visible. 2. CE absent = pas un gap. 3. Source honnete. 4. Ne pas inventer.");
    lines.push("JSON uniquement :");
    lines.push("{\"certifs_concurrent\":[{\"nom\":\"certif\",\"source\":\"badge Amazon|texte listing|packaging visible|URL fournie|non verifiable\"}],\"nos_gaps\":[{\"norm\":\"Norme\",\"impact\":\"impact\",\"priorite\":\"haute\",\"recommandation\":\"action\"}],\"nos_avantages\":[{\"norm\":\"Norme\",\"valeur\":\"valeur\"}],\"synthese\":\"2 phrases\"}");
    userContent.push({type:"text",text:lines.join("\n")});
    callClaude([{role:"user",content:userContent}],2000).then(function(txt){
      setResult(JSON.parse(repairJSON(txt)));
      setLoading(false);
    }).catch(function(e){setResult({error:e.message});setLoading(false);});
  }
  var hasInput=text.trim()||url.trim()||photos.length>0;
  return (
    <div>
      <div style={{background:C.purpleL,border:"1px solid "+C.purpleB,borderRadius:12,padding:"14px 18px",marginBottom:16}}>
        <div style={{fontSize:13,fontWeight:700,color:C.purple,marginBottom:4}}>Analyse compliance concurrente</div>
        <div style={{fontSize:12,color:C.g600}}>Renseignez l'URL, décrivez les certifications, et/ou uploadez des photos du packaging concurrent.</div>
      </div>
      <div style={{background:"#fff",border:"1px solid "+C.g200,borderRadius:12,padding:16,marginBottom:16}}>
        <div style={{marginBottom:12}}>
          <label style={{fontSize:12,fontWeight:600,color:C.g600,display:"block",marginBottom:6}}>URL du listing concurrent</label>
          <div style={{position:"relative"}}>
            <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:C.g400,pointerEvents:"none"}}>🔗</span>
            <input value={url} onChange={function(e){setUrl(e.target.value);}} placeholder="https://www.amazon.fr/dp/..." style={{...inp,paddingLeft:30}}/>
          </div>
        </div>
        <div style={{marginBottom:12}}>
          <label style={{fontSize:12,fontWeight:600,color:C.g600,display:"block",marginBottom:6}}>Description certifications / allégations</label>
          <textarea value={text} onChange={function(e){setText(e.target.value);}} placeholder="Ex : Le concurrent affiche OEKO-TEX Standard 100, GOTS..." style={{...inp,resize:"vertical",minHeight:80}}/>
        </div>
        <div style={{marginBottom:12}}>
          <label style={{fontSize:12,fontWeight:600,color:C.g600,display:"block",marginBottom:6}}>Photos du packaging concurrent (max 6)</label>
          <div onDrop={function(e){e.preventDefault();handleFiles(Array.from(e.dataTransfer.files));}} onDragOver={function(e){e.preventDefault();}} onClick={function(){if(fileRef.current) fileRef.current.click();}} style={{border:"2px dashed "+C.purpleB,borderRadius:10,padding:"16px",textAlign:"center",cursor:"pointer",background:C.purpleL}}>
            <input ref={fileRef} type="file" accept="image/*" multiple style={{display:"none"}} onChange={function(e){handleFiles(Array.from(e.target.files));}}/>
            <div style={{fontSize:13,color:C.purple,fontWeight:600,marginBottom:2}}>📷 Glissez-déposez ou cliquez</div>
            <div style={{fontSize:11,color:C.g400}}>PNG, JPG, WEBP — packaging, étiquette, listing Amazon</div>
          </div>
          {photos.length>0 && <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:10,alignItems:"center"}}>
            {photos.map(function(p,i){return(<div key={i} style={{position:"relative",width:64,height:64}}><img src={"data:"+p.mediaType+";base64,"+p.base64} alt={p.name} style={{width:64,height:64,objectFit:"cover",borderRadius:8,border:"1px solid "+C.g200}}/><button onClick={function(){setPhotos(function(ps){return ps.filter(function(_,j){return j!==i;});});}} style={{position:"absolute",top:-6,right:-6,width:18,height:18,borderRadius:"50%",background:C.red,color:"#fff",border:"none",cursor:"pointer",fontSize:11,fontWeight:700,fontFamily:font}}>×</button></div>);})}
            <span style={{fontSize:11,color:C.purple,fontWeight:600}}>{photos.length} photo{photos.length>1?"s":""}</span>
          </div>}
        </div>
        <button onClick={analyze} disabled={loading||!hasInput} style={{width:"100%",padding:"10px 16px",background:loading||!hasInput?C.g200:C.purple,color:"#fff",border:"none",borderRadius:10,fontFamily:font,fontSize:13,fontWeight:700,cursor:loading||!hasInput?"not-allowed":"pointer"}}>{loading?"Analyse en cours…":"Analyser le concurrent →"}</button>
      </div>
      {result && result.error && <div style={{background:C.redL,border:"1px solid "+C.redB,borderRadius:10,padding:14,fontSize:13,color:C.red}}>{result.error}</div>}
      {result && !result.error && (
        <div>
          {result.synthese && <div style={{background:C.purpleL,border:"1px solid "+C.purpleB,borderRadius:10,padding:14,marginBottom:16,fontSize:13,color:C.purple,lineHeight:1.6,fontWeight:500}}>{result.synthese}</div>}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
            <div style={{background:"#fff",border:"1px solid "+C.g200,borderRadius:10,padding:14}}>
              <div style={{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",color:C.g600,marginBottom:10}}>Certifications concurrent</div>
              {(result.certifs_concurrent||[]).length===0 && <div style={{fontSize:12,color:C.g400}}>Aucune certification détectée.</div>}
              {(result.certifs_concurrent||[]).map(function(c,i){
                var nm=typeof c==="string"?c:(c.nom||"");
                var src=typeof c==="object"?c.source:null;
                var sc=src==="non verifiable"||src==="non vérifiable"?C.g400:src==="badge Amazon"?C.green:src==="URL fournie"?C.blue:C.amber;
                return(<div key={i} style={{display:"flex",alignItems:"flex-start",gap:8,background:C.g50,border:"1px solid "+C.g200,borderRadius:8,padding:"8px 10px",marginBottom:6}}>
                  <span style={{width:6,height:6,borderRadius:"50%",background:C.amber,flexShrink:0,marginTop:5,display:"inline-block"}}/>
                  <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:C.g900}}>{nm}</div>{src && <div style={{fontSize:10,fontWeight:700,color:sc,marginTop:2,padding:"1px 6px",background:sc+"22",borderRadius:10,display:"inline-block"}}>Source : {src}</div>}</div>
                  <button onClick={function(){if(props.onAddNorm) props.onAddNorm({nom:nm,type:"nice",what:"Certification identifiée chez le concurrent.",benefit:"Différenciation concurrentielle — le concurrent la possède.",markets:[props.meta.zone||"EU"]});}} style={{flexShrink:0,background:C.greenL,border:"1px solid "+C.greenB,borderRadius:6,padding:"3px 8px",fontSize:10,fontWeight:700,color:C.green,cursor:"pointer",fontFamily:font,whiteSpace:"nowrap"}}>+ Ajouter</button>
                </div>);
              })}
            </div>
            <div style={{background:C.greenL,border:"1px solid "+C.greenB,borderRadius:10,padding:14}}>
              <div style={{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",color:C.green,marginBottom:10}}>Nos avantages</div>
              {(result.nos_avantages||[]).length===0 && <div style={{fontSize:12,color:C.g400}}>Aucun avantage identifié.</div>}
              {(result.nos_avantages||[]).map(function(a,i){return(<div key={i} style={{marginBottom:8}}><div style={{fontSize:13,fontWeight:600,color:C.green}}>{a.norm}</div><div style={{fontSize:12,color:C.g600,lineHeight:1.4}}>{a.valeur}</div></div>);})}
            </div>
          </div>
          <div style={{fontSize:12,fontWeight:700,color:C.g900,marginBottom:10,textTransform:"uppercase",letterSpacing:".06em"}}>Nos gaps — actions à prendre</div>
          {(result.nos_gaps||[]).map(function(g,i){
            var pc=g.priorite==="haute"?{bg:C.redL,bc:C.redB,cl:C.red}:g.priorite==="moyenne"?{bg:C.amberL,bc:C.amberB,cl:C.amber}:{bg:C.greenL,bc:C.greenB,cl:C.green};
            return(<div key={i} style={{background:pc.bg,border:"1px solid "+pc.bc,borderRadius:10,padding:14,marginBottom:8}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}><span style={{fontSize:13,fontWeight:700,color:C.g900}}>{g.norm}</span><span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:20,background:"#fff",color:pc.cl,border:"1px solid "+pc.bc,textTransform:"uppercase"}}>{g.priorite}</span></div>
              <div style={{fontSize:12,color:C.g600,marginBottom:4}}>{g.impact}</div>
              <div style={{fontSize:12,fontWeight:600,color:pc.cl}}>{g.recommandation}</div>
            </div>);
          })}
        </div>
      )}
    </div>
  );
}

function NormesPlus(props) {
  const [input,setInput]=useState("");
  const [history,setHistory]=useState([]);
  const [loading,setLoading]=useState(false);
  const [library,setLibrary]=useState(function(){return loadLibrary();});
  function saveToLibrary(norm, result) {
    var entry={norm:norm,niveau:result.niveau,what:result.explication,markets:result.markets||[],addedAt:new Date().toLocaleDateString("fr-FR")};
    var next=library.filter(function(l){return l.norm.toLowerCase()!==norm.toLowerCase();}).concat([entry]).slice(-30);
    setLibrary(next);
    saveLibrary(next);
  }
  function analyze() {
    var normName=input.trim();
    if(!normName) return;
    setLoading(true);
    var p="Tu es expert en compliance produit e-commerce (EU/US/UK).\nPRODUIT : "+props.productContext+"\nNORME / TEST À ÉVALUER : "+normName+"\nJSON uniquement :\n{\"applicable\":\"OUI\"|\"NON\"|\"PARTIEL\"|\"À VÉRIFIER\",\"niveau\":\"must\"|\"nice\"|\"non_applicable\",\"explication\":\"3-4 phrases\",\"condition\":\"condition déclenchante si PARTIEL\",\"risque_si_absent\":\"1 phrase\",\"benefice\":\"1 phrase\",\"cout_min\":0,\"cout_max\":0,\"cout_note\":\"1 phrase\",\"markets\":[\"EU\"],\"sources\":[\"ref\"]}";
    callClaude(p,1200).then(function(txt){
      var result=JSON.parse(repairJSON(txt));
      setHistory(function(h){return [{norm:normName,result:result,id:Date.now()}].concat(h);});
      setInput(""); setLoading(false);
    }).catch(function(e){
      setHistory(function(h){return [{norm:normName,result:{applicable:"ERREUR",explication:e.message,niveau:"non_applicable"},id:Date.now()}].concat(h);});
      setLoading(false);
    });
  }
  function handleAdd(entry) {
    var r=entry.result;
    var normData={nom:entry.norm,type:r.niveau==="must"?"must":"nice",what:r.explication,why_mandatory:r.risque_si_absent||"",risk_if_missing:r.risque_si_absent||"",benefit:r.benefice||"",markets:r.markets||[],cost_min:r.cout_min||0,cost_max:r.cout_max||0,cost_note:r.cout_note||""};
    if(props.onAddNorm) props.onAddNorm(normData);
    saveToLibrary(entry.norm, r);
  }
  function colorFor(r){if(r.applicable==="OUI")return{bg:C.redL,bc:C.redB,cl:C.red,icon:"⚠"};if(r.applicable==="PARTIEL"||r.applicable==="À VÉRIFIER")return{bg:C.amberL,bc:C.amberB,cl:C.amber,icon:"~"};if(r.applicable==="NON")return{bg:C.greenL,bc:C.greenB,cl:C.green,icon:"✓"};return{bg:C.g100,bc:C.g200,cl:C.g600,icon:"?"};}
  function labelFor(r){if(r.applicable==="OUI")return r.niveau==="must"?"Obligatoire":"Recommandé";if(r.applicable==="PARTIEL")return "Applicable sous conditions";if(r.applicable==="À VÉRIFIER")return "À vérifier";if(r.applicable==="NON")return "Non applicable";return "Erreur";}
  return (
    <div>
      <div style={{background:C.blueL,border:"1px solid rgba(26,86,219,.2)",borderRadius:12,padding:"14px 18px",marginBottom:20}}>
        <div style={{fontSize:13,fontWeight:700,color:C.blue,marginBottom:4}}>✦ Tester une norme supplémentaire</div>
        <div style={{fontSize:12,color:C.g600,lineHeight:1.5}}>Entrez le nom d'une norme, d'un test labo ou d'une certification. L'IA analyse son applicabilité et vous propose de l'ajouter. Les normes ajoutées sont mémorisées pour vos prochaines analyses.</div>
      </div>
      {library.length>0 && (
        <div style={{background:"#fff",border:"1px solid "+C.g200,borderRadius:12,padding:"12px 16px",marginBottom:16}}>
          <div style={{fontSize:11,fontWeight:700,color:C.g600,textTransform:"uppercase",letterSpacing:".06em",marginBottom:8}}>📚 Bibliothèque ({library.length})</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
            {library.slice(-15).map(function(l,i){return(<button key={i} onClick={function(){setInput(l.norm);}} title={"Ajouté le "+l.addedAt} style={{fontSize:11,fontWeight:600,padding:"4px 10px",borderRadius:20,border:"1px solid "+C.blue+"44",background:C.blueL,color:C.blue,cursor:"pointer",fontFamily:font}}>{l.norm}</button>);})}
          </div>
        </div>
      )}
      <div style={{background:"#fff",border:"1px solid "+C.g200,borderRadius:12,padding:16,marginBottom:20}}>
        <label style={{fontSize:12,fontWeight:600,color:C.g600,display:"block",marginBottom:8}}>Norme ou test à analyser</label>
        <div style={{display:"flex",gap:10}}>
          <input value={input} onChange={function(e){setInput(e.target.value);}} onKeyDown={function(e){if(e.key==="Enter"&&!loading&&input.trim()) analyze();}} placeholder="Ex : EN 1888, ISO 8124, Prop 65, FSC, EUDR..." style={{...inp,flex:1}}/>
          <button onClick={analyze} disabled={loading||!input.trim()} style={{padding:"9px 18px",background:loading||!input.trim()?C.g200:C.navy,color:"#fff",border:"none",borderRadius:10,fontFamily:font,fontSize:13,fontWeight:700,cursor:loading||!input.trim()?"not-allowed":"pointer",whiteSpace:"nowrap",flexShrink:0}}>{loading?"Analyse…":"Analyser →"}</button>
        </div>
      </div>
      {history.length===0 && <div style={{textAlign:"center",padding:"32px 16px",color:C.g400,fontSize:13,lineHeight:1.8}}>Aucune norme testée.<br/><span style={{fontSize:12}}>Exemples : EN 1888-1 · EN 71-4 · ISO 8124 · Prop 65 · FSC · EUDR</span></div>}
      {history.map(function(entry){
        var c=colorFor(entry.result); var r=entry.result;
        var canAdd=(r.applicable==="OUI"||r.applicable==="PARTIEL"||r.applicable==="À VÉRIFIER")&&r.niveau!=="non_applicable";
        return(
          <div key={entry.id} style={{borderRadius:12,padding:16,marginBottom:12,border:"1.5px solid "+c.bc,background:c.bg}}>
            <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12,marginBottom:10,flexWrap:"wrap"}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <span style={{width:28,height:28,borderRadius:8,background:c.cl,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,flexShrink:0}}>{c.icon}</span>
                <div><div style={{fontSize:15,fontWeight:700,color:C.g900}}>{entry.norm}</div><div style={{fontSize:11,fontWeight:700,color:c.cl,textTransform:"uppercase",letterSpacing:".05em"}}>{labelFor(r)}</div></div>
              </div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                {r.niveau==="must" && <span style={{fontSize:10,fontWeight:700,padding:"3px 10px",borderRadius:20,background:C.redL,color:C.red,border:"1px solid "+C.redB,textTransform:"uppercase"}}>Obligatoire</span>}
                {r.niveau==="nice" && <span style={{fontSize:10,fontWeight:700,padding:"3px 10px",borderRadius:20,background:C.greenL,color:C.green,border:"1px solid "+C.greenB,textTransform:"uppercase"}}>Optionnel</span>}
                {canAdd && <button onClick={function(){handleAdd(entry);}} style={{fontSize:12,fontWeight:700,padding:"6px 14px",borderRadius:20,border:"1.5px solid "+c.cl,background:"#fff",color:c.cl,cursor:"pointer",fontFamily:font}}>+ Ajouter à l'analyse</button>}
              </div>
            </div>
            <div style={{fontSize:13,color:C.g600,lineHeight:1.6,marginBottom:10}}>{r.explication}</div>
            {r.condition && <div style={{background:"#fff",borderRadius:8,padding:"8px 12px",marginBottom:8,border:"1px solid "+c.bc}}><div style={{fontSize:10,fontWeight:700,color:c.cl,textTransform:"uppercase",letterSpacing:".04em",marginBottom:3}}>Condition déclenchante</div><div style={{fontSize:12,color:C.g600}}>{r.condition}</div></div>}
            {r.risque_si_absent && r.applicable!=="NON" && <div style={{background:"#fff",borderRadius:8,padding:"8px 12px",marginBottom:8,border:"1px solid "+C.redB}}><div style={{fontSize:10,fontWeight:700,color:C.red,textTransform:"uppercase",letterSpacing:".04em",marginBottom:3}}>Risque si absent</div><div style={{fontSize:12,color:C.red,fontWeight:600}}>{r.risque_si_absent}</div></div>}
            {r.benefice && r.niveau==="nice" && <div style={{background:"#fff",borderRadius:8,padding:"8px 12px",marginBottom:8,border:"1px solid "+C.greenB}}><div style={{fontSize:10,fontWeight:700,color:C.green,textTransform:"uppercase",letterSpacing:".04em",marginBottom:3}}>Bénéfice</div><div style={{fontSize:12,color:C.green}}>{r.benefice}</div></div>}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8,marginTop:8}}>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{(r.markets||[]).map(function(m){return <MktTag key={m} m={m}/>;})}</div>
              {r.cout_max>0 && <div style={{fontSize:11,color:C.g600,fontWeight:600,background:"#fff",padding:"3px 10px",borderRadius:20,border:"1px solid "+C.g200}}>Coût : {(r.cout_min||0).toLocaleString("fr-FR")}–{r.cout_max.toLocaleString("fr-FR")} €</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function exportXLSX(history) {
  var wb=XLSX.utils.book_new();
  var summary=history.map(function(h){return {"Date":h.date,"Produit":h.meta.pname,"Catégorie":h.meta.cat,"Zone":h.meta.zone,"Cible":h.meta.cible,"Niveau de risque":h.data.risk_level,"Résumé":h.data.risk_summary,"Obligations":(h.data.must_have||[]).length,"Nice to have":(h.data.nice_to_have||[]).length,"Risques":(h.data.customer_risks||[]).length};});
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(summary),"Résumé");
  history.forEach(function(h,idx){
    var rows=[].concat(
      (h.data.must_have||[]).map(function(n){return {"Type":"OBLIGATOIRE","Catégorie":n.category||"","Norme":n.norm,"Description":n.what,"Pourquoi":n.why_mandatory,"Risque si absent":n.risk_if_missing,"Sévérité":n.severity||"","Coût min €":n.cost_min||0,"Coût max €":n.cost_max||0,"Marchés":(n.markets||[]).join(", ")};}),
      (h.data.nice_to_have||[]).map(function(n){return {"Type":"OPTIONNEL","Catégorie":n.category||"","Norme":n.norm,"Description":n.what,"Bénéfice":n.benefit,"Coût min €":n.cost_min||0,"Coût max €":n.cost_max||0,"Marchés":(n.markets||[]).join(", ")};}),
      (h.data.customer_risks||[]).map(function(r){return {"Type":"RISQUE","Norme":r.risk,"Description":r.description,"Probabilité %":r.probability};})
    );
    if(rows.length>0){var sn=(h.meta.pname.slice(0,18)+"_"+(idx+1)).replace(/[^a-zA-Z0-9_]/g,"_").slice(0,31);XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),sn);}
  });
  XLSX.writeFile(wb,"BMS_Compliance_Historique.xlsx");
}

function exportJSON(entry) {
  var blob=new Blob([JSON.stringify({meta:entry.meta,data:entry.data,date:entry.date},null,2)],{type:"application/json"});
  var a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="Compliance_"+entry.meta.pname.replace(/[^a-zA-Z0-9]/g,"_").slice(0,30)+".json";a.click();URL.revokeObjectURL(a.href);
}

function buildReportHTML(entry) {
  var d=entry.data,m=entry.meta;
  var riskLvl=d.risk_level||"FAIBLE";
  var isEleve=riskLvl.includes("LEV"),isMoyen=riskLvl.includes("MOY");
  var rColor=isEleve?"#DC2626":isMoyen?"#D97706":"#16A34A";
  var rBg=isEleve?"#FEF2F2":isMoyen?"#FFFBEB":"#F0FDF4";
  var sevColor=function(s){return s==="danger"?"#DC2626":s==="majeur"?"#D97706":"#16A34A";};
  var sevBg=function(s){return s==="danger"?"#FEF2F2":s==="majeur"?"#FFFBEB":"#F0FDF4";};
  var allC=[].concat(d.must_have||[],d.nice_to_have||[]).filter(function(n){return n.cost_max>0;});
  var totalMin=allC.reduce(function(s,n){return s+(n.cost_min||0);},0);
  var totalMax=allC.reduce(function(s,n){return s+(n.cost_max||0);},0);
  var GROUP_DEF=[{cat:"test",label:"Tests laboratoire",icon:"⚗",bc:"#FDE68A",cl:"#92400E"},{cat:"documentation",label:"Documentation",icon:"📄",bc:"#DDD6FE",cl:"#5B21B6"},{cat:"marquage",label:"Marquages",icon:"◈",bc:"#BFDBFE",cl:"#1D4ED8"}];
  var mustGroups=GROUP_DEF.map(function(g){return Object.assign({},g,{items:(d.must_have||[]).filter(function(n){return n.category===g.cat;})});}).filter(function(g){return g.items.length>0;});
  var p=[];
  p.push("<!DOCTYPE html><html><head><meta charset='utf-8'><title>Compliance — "+m.pname+"</title>");
  p.push("<style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:system-ui,sans-serif;background:#fff;color:#111827;padding:32px;max-width:900px;margin:0 auto;}@media print{.no-print{display:none!important;}body{padding:16px;}}</style></head><body>");
  p.push("<div style='background:#0A1628;color:#fff;padding:14px 20px;border-radius:12px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center;'>");
  p.push("<div><div style='font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;opacity:.6;margin-bottom:4px;'>BMS International — Compliance Produit</div><div style='font-size:18px;font-weight:700;'>"+m.pname+"</div></div>");
  p.push("<div style='text-align:right;font-size:11px;opacity:.7;'>Généré le "+(entry.date||"")+"<br>Analyse IA — à vérifier avec un juriste</div></div>");
  p.push("<div style='font-size:13px;color:#6B7280;margin-bottom:16px;'>"+m.cat+" · "+m.zone+" · "+m.cible+(m.hs?" · HS "+m.hs:"")+"</div>");
  p.push("<div style='padding:12px 16px;border-radius:10px;border:1.5px solid "+rColor+";background:"+rBg+";display:flex;align-items:center;gap:12px;margin-bottom:16px;'>");
  p.push("<strong style='font-size:14px;color:"+rColor+";'>"+riskLvl+"</strong><span style='font-size:13px;color:#4B5563;'>"+(d.risk_summary||"")+"</span></div>");
  if(totalMax>0){
    var mustMaxV=(d.must_have||[]).filter(function(n){return n.cost_max>0;}).reduce(function(s,n){return s+(n.cost_max||0);},0);
    var mustMinV=(d.must_have||[]).filter(function(n){return n.cost_max>0;}).reduce(function(s,n){return s+(n.cost_min||0);},0);
    var niceMaxV=(d.nice_to_have||[]).filter(function(n){return n.cost_max>0;}).reduce(function(s,n){return s+(n.cost_max||0);},0);
    var niceMinV=(d.nice_to_have||[]).filter(function(n){return n.cost_max>0;}).reduce(function(s,n){return s+(n.cost_min||0);},0);
    p.push("<div style='background:#EFF6FF;border:1.5px solid #BFDBFE;border-radius:10px;padding:14px 18px;margin-bottom:16px;'>");
    p.push("<div style='font-size:10px;font-weight:700;text-transform:uppercase;color:#6B7280;margin-bottom:4px;'>Budget total estimé</div>");
    p.push("<div style='font-size:24px;font-weight:700;color:#0A1628;'>"+totalMin.toLocaleString("fr-FR")+" – "+totalMax.toLocaleString("fr-FR")+" €</div>");
    p.push("<div style='display:flex;gap:24px;margin-top:8px;'>");
    if(mustMaxV>0) p.push("<div><div style='font-size:10px;font-weight:700;color:#DC2626;text-transform:uppercase;margin-bottom:2px;'>Obligatoire</div><div style='font-size:14px;font-weight:700;'>"+mustMinV.toLocaleString("fr-FR")+"–"+mustMaxV.toLocaleString("fr-FR")+" €</div></div>");
    if(niceMaxV>0) p.push("<div><div style='font-size:10px;font-weight:700;color:#16A34A;text-transform:uppercase;margin-bottom:2px;'>Optionnel</div><div style='font-size:14px;font-weight:700;'>"+niceMinV.toLocaleString("fr-FR")+"–"+niceMaxV.toLocaleString("fr-FR")+" €</div></div>");
    p.push("</div></div>");
  }
  var counters=[[( d.must_have||[]).length,"Obligatoire","#DC2626","#FEF2F2","#FECACA"],[(d.nice_to_have||[]).length,"Optionnel","#16A34A","#F0FDF4","#BBF7D0"],[(d.customer_risks||[]).length,"Risques","#D97706","#FFFBEB","#FDE68A"],[(d.norms_not_accessible||[]).length,"À acquérir","#7C3AED","#FAF5FF","#DDD6FE"]];
  p.push("<div style='display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px;'>");
  counters.forEach(function(c){p.push("<div style='text-align:center;padding:12px;border-radius:10px;border:1.5px solid "+c[4]+";background:"+c[3]+";'><div style='font-size:22px;font-weight:700;color:"+c[2]+";'>"+c[0]+"</div><div style='font-size:11px;font-weight:600;color:#4B5563;margin-top:2px;'>"+c[1]+"</div></div>");});
  p.push("</div>");
  if(mustGroups.length>0){
    p.push("<div style='font-size:12px;font-weight:700;text-transform:uppercase;color:#111827;margin-bottom:12px;padding-bottom:6px;border-bottom:2px solid #E5E7EB;'>Normes obligatoires</div>");
    mustGroups.forEach(function(g){
      p.push("<div style='display:flex;align-items:center;gap:8px;margin:14px 0 8px;padding-bottom:6px;border-bottom:2px solid "+g.bc+";'><span style='font-size:12px;font-weight:700;padding:3px 12px;border-radius:20px;border:1px solid "+g.bc+";color:"+g.cl+";background:"+g.bc+"33;'>"+g.icon+" "+g.label+" ("+g.items.length+")</span></div>");
      g.items.forEach(function(n){
        var sc=sevColor(n.severity),sb=sevBg(n.severity);
        p.push("<div style='border:1px solid #E5E7EB;border-left:4px solid "+sc+";border-radius:8px;padding:12px 14px;margin-bottom:8px;background:#fff;'>");
        p.push("<div style='display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;'><strong style='font-size:13px;color:#111827;flex:1;'>"+(n.norm||"")+"</strong>");
        if(n.severity) p.push("<span style='font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;background:"+sb+";color:"+sc+";margin-left:8px;'>"+n.severity+"</span>");
        p.push("</div>");
        if(n.what) p.push("<div style='font-size:12px;color:#4B5563;margin-bottom:6px;'>"+n.what+"</div>");
        if(n.risk_if_missing) p.push("<div style='font-size:11px;color:"+sc+";font-weight:600;'>⚠ "+n.risk_if_missing+"</div>");
        if(n.cost_max>0) p.push("<div style='font-size:11px;color:#9CA3AF;margin-top:4px;'>Coût : "+(n.cost_min||0).toLocaleString("fr-FR")+"–"+n.cost_max.toLocaleString("fr-FR")+" €</div>");
        p.push("</div>");
      });
    });
  }
  if((d.nice_to_have||[]).length>0){
    p.push("<div style='font-size:12px;font-weight:700;text-transform:uppercase;color:#16A34A;margin:20px 0 12px;padding-bottom:6px;border-bottom:2px solid #BBF7D0;'>Certifications optionnelles</div>");
    (d.nice_to_have||[]).forEach(function(n){p.push("<div style='border:1px solid #BBF7D0;border-radius:8px;padding:12px 14px;margin-bottom:8px;background:#F0FDF4;'><strong style='font-size:13px;'>"+n.norm+"</strong><div style='font-size:12px;color:#4B5563;margin-top:4px;'>"+(n.benefit||n.what||"")+"</div>"+(n.cost_max>0?"<div style='font-size:11px;color:#9CA3AF;margin-top:4px;'>Coût : "+(n.cost_min||0).toLocaleString("fr-FR")+"–"+n.cost_max.toLocaleString("fr-FR")+" €</div>":"")+"</div>");});
  }
  if((d.customer_risks||[]).length>0){
    p.push("<div style='font-size:12px;font-weight:700;text-transform:uppercase;color:#D97706;margin:20px 0 12px;padding-bottom:6px;border-bottom:2px solid #FDE68A;'>Risques consommateur</div>");
    (d.customer_risks||[]).forEach(function(r){var prob=Math.min(100,Math.max(0,parseInt(r.probability)||0));var rc=prob>=60?"#DC2626":prob>=30?"#D97706":"#16A34A";p.push("<div style='border:1px solid #E5E7EB;border-radius:8px;padding:12px;margin-bottom:8px;background:#FFFBEB;'><div style='display:flex;justify-content:space-between;margin-bottom:4px;'><strong style='font-size:13px;'>"+(r.risk||"")+"</strong><span style='font-size:12px;font-weight:700;color:"+rc+";'>"+prob+"%</span></div><div style='height:6px;background:#E5E7EB;border-radius:99px;overflow:hidden;margin-bottom:6px;'><div style='height:100%;width:"+prob+"%;background:"+rc+";border-radius:99px;'></div></div>"+(r.description?"<div style='font-size:12px;color:#4B5563;'>"+r.description+"</div>":"")+"</div>");});
  }
  if(d.lawyer_needed&&(d.lawyer_topics||[]).length>0){
    p.push("<div style='background:#FAF5FF;border:1.5px solid #DDD6FE;border-radius:10px;padding:14px 18px;margin-top:20px;'><div style='font-size:13px;font-weight:700;color:#7C3AED;margin-bottom:8px;'>Conseil juridique recommandé</div>");
    (d.lawyer_topics||[]).forEach(function(t){p.push("<div style='font-size:12px;color:#4C1D95;margin-bottom:4px;'>• "+t+"</div>");});
    p.push("</div>");
  }
  p.push("<div style='margin-top:32px;padding-top:16px;border-top:1px solid #E5E7EB;font-size:11px;color:#9CA3AF;text-align:center;'>BMS International · Analyse générée par IA · Non substituable à un conseil juridique</div>");
  p.push("<div class='no-print' style='position:fixed;bottom:24px;right:24px;'><button onclick='window.print()' style='background:#0A1628;color:#fff;border:none;padding:12px 24px;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.3);'>🖨 Imprimer / PDF</button></div>");
  p.push("</body></html>");
  return p.join("");
}

function PrintPreview(props) {
  var html=buildReportHTML(props.entry);
  function downloadHTML() {
    var blob=new Blob([html],{type:"text/html;charset=utf-8"});
    var a=document.createElement("a");a.href=URL.createObjectURL(blob);
    a.download="Compliance_"+props.entry.meta.pname.replace(/[^a-zA-Z0-9]/g,"_").slice(0,30)+".html";
    document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(a.href);
  }
  return (
    <div style={{position:"fixed",inset:0,zIndex:1000,background:"rgba(0,0,0,.75)",display:"flex",flexDirection:"column"}}>
      <div style={{background:C.navy,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 20px",flexShrink:0,flexWrap:"wrap",gap:8}}>
        <div style={{fontSize:13,fontWeight:700,color:"#fff"}}>Aperçu rapport — {props.entry.meta.pname}</div>
        <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
          <button onClick={downloadHTML} style={{background:C.green,color:"#fff",border:"none",borderRadius:8,padding:"7px 16px",fontFamily:font,fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
            Télécharger HTML → ouvrir dans Chrome → Ctrl+P → PDF
          </button>
          <button onClick={props.onClose} style={{background:"rgba(255,255,255,.15)",color:"#fff",border:"none",borderRadius:8,padding:"7px 14px",fontFamily:font,fontSize:13,fontWeight:600,cursor:"pointer"}}>✕ Fermer</button>
        </div>
      </div>
      <iframe srcDoc={html} style={{flex:1,border:"none",background:"#fff"}} title="Aperçu"/>
    </div>
  );
}

function Sidebar(props) {
  return (
    <div style={{width:252,flexShrink:0,background:"#fff",border:"1px solid "+C.g200,borderRadius:16,display:"flex",flexDirection:"column",maxHeight:"92vh",position:"sticky",top:24}}>
      <div style={{padding:"14px 16px 12px",borderBottom:"1px solid "+C.g200}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
          <div style={{fontSize:12,fontWeight:700,textTransform:"uppercase",letterSpacing:".08em",color:C.g600}}>Historique ({props.history.length})</div>
          <button onClick={props.onNew} style={{fontFamily:font,fontSize:11,fontWeight:700,borderRadius:20,cursor:"pointer",border:"1.5px solid "+C.blue,color:C.blue,background:C.blueL,padding:"3px 10px"}}>+ Nouvelle</button>
        </div>
        {props.history.length>0 && (
          <button onClick={props.onExport} style={{width:"100%",padding:"6px 10px",background:C.greenL,border:"1px solid "+C.greenB,borderRadius:8,fontFamily:font,fontSize:11,fontWeight:700,color:C.green,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>Exporter tout Excel
          </button>
        )}
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"6px 0"}}>
        {props.history.length===0 && <div style={{padding:"24px 16px",textAlign:"center",color:C.g400,fontSize:12,lineHeight:1.6}}>Aucune analyse.<br/>Lancez votre première analyse.</div>}
        {props.history.map(function(h){
          var rs=riskMeta(h.data.risk_level),active=h.id===props.currentId;
          return (
            <div key={h.id} onClick={function(){props.onSelect(h);}} style={{padding:"9px 16px",cursor:"pointer",background:active?"#EFF6FF":"transparent",borderLeft:"3px solid "+(active?C.blue:"transparent")}}
              onMouseEnter={function(e){if(!active)e.currentTarget.style.background=C.g50;}} onMouseLeave={function(e){if(!active)e.currentTarget.style.background="transparent";}}>
              <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:6}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:600,color:active?C.blue:C.g900,marginBottom:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{h.meta.pname}</div>
                  <div style={{fontSize:11,color:C.g400,marginBottom:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{h.meta.cat} · {h.meta.zone}</div>
                  <div style={{display:"flex",alignItems:"center",gap:5}}>
                    <div style={{width:6,height:6,borderRadius:"50%",background:rs.dot,flexShrink:0}}/>
                    <span style={{fontSize:10,fontWeight:600,color:rs.lc}}>{h.data.risk_level}</span>
                    <span style={{fontSize:10,color:C.g400}}>{h.date}</span>
                  </div>
                </div>
                <button onClick={function(e){e.stopPropagation();props.onDelete(h.id);}} style={{background:"none",border:"none",color:C.g400,cursor:"pointer",fontSize:16,padding:"0 2px",lineHeight:1,flexShrink:0}}>×</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ResultsView(props) {
  var results=props.results;
  const [tab,setTab]=useState("must");
  const [showPrint,setShowPrint]=useState(false);
  var data=results.data,meta=results.meta;
  var rs=riskMeta(data.risk_level);
  var ctx=meta.pname+" — "+meta.cat+" — "+meta.zone+" — "+meta.cible;
  var mustHave=data.must_have||[];
  var nMarquage=mustHave.filter(function(n){return n.category==="marquage";}).length;
  var nTest=mustHave.filter(function(n){return n.category==="test";}).length;
  var nDoc=mustHave.filter(function(n){return n.category==="documentation";}).length;
  var nDanger=mustHave.filter(function(n){return n.severity==="danger";}).length;
  function addNorm(n){if(props.onAddNorm) props.onAddNorm(results.id,n);}
  var tabs=[{k:"must",l:"Obligatoire ("+mustHave.length+")"},{k:"nice",l:"Optionnel ("+((data.nice_to_have||[]).length)+")"},{k:"risks",l:"Risques consommateur ("+((data.customer_risks||[]).length)+")"},{k:"recalls",l:"Rappels ("+((data.product_recalls||[]).length)+")"},{k:"marquage",l:"Marquages créa"},{k:"concurrent",l:"Concurrent"},{k:"normes_plus",l:"✦ Normes +"}];
  var allC=[].concat(mustHave,data.nice_to_have||[]).filter(function(n){return n.cost_max>0;});
  var totalMin=allC.reduce(function(s,n){return s+(n.cost_min||0);},0);
  var totalMax=allC.reduce(function(s,n){return s+(n.cost_max||0);},0);
  var mustMaxV=mustHave.filter(function(n){return n.cost_max>0;}).reduce(function(s,n){return s+(n.cost_max||0);},0);
  var mustMinV=mustHave.filter(function(n){return n.cost_max>0;}).reduce(function(s,n){return s+(n.cost_min||0);},0);
  var niceMaxV=(data.nice_to_have||[]).filter(function(n){return n.cost_max>0;}).reduce(function(s,n){return s+(n.cost_max||0);},0);
  var niceMinV=(data.nice_to_have||[]).filter(function(n){return n.cost_max>0;}).reduce(function(s,n){return s+(n.cost_min||0);},0);
  var GROUP_DEF=[{cat:"test",label:"Tests laboratoire",icon:"⚗",bg:"#FEF3C7",bc:"#FDE68A",cl:"#92400E",prio:"priorité 1 — passer en premier"},{cat:"documentation",label:"Documentation",icon:"📄",bg:"#F5F3FF",bc:"#DDD6FE",cl:"#5B21B6",prio:"priorité 2 — en parallèle"},{cat:"marquage",label:"Marquages",icon:"◈",bg:"#EFF6FF",bc:"#BFDBFE",cl:"#1D4ED8",prio:"priorité 3 — après validation"}];
  var sevOrder={danger:0,majeur:1,mineur:2};
  var mustGrouped=GROUP_DEF.map(function(g){return Object.assign({},g,{items:mustHave.filter(function(n){return n.category===g.cat;}).sort(function(a,b){return (sevOrder[a.severity]||3)-(sevOrder[b.severity]||3);})});}).filter(function(g){return g.items.length>0;});
  var mustUncategorized=mustHave.filter(function(n){return !GROUP_DEF.find(function(g){return g.cat===n.category;});});
  return (
    <div style={{flex:1,minWidth:0}}>
      {showPrint && <PrintPreview entry={results} onClose={function(){setShowPrint(false);}}/>}
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:20,flexWrap:"wrap",gap:12}}>
        <div>
          <div style={{fontSize:20,fontWeight:700,color:C.navy}}>{meta.pname}</div>
          <div style={{fontSize:12,color:C.g400,marginTop:4}}>{meta.cat} · {meta.zone} · {meta.cible}{meta.hs?" · HS "+meta.hs:""}{results.date?" · "+results.date:""}</div>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
          <button onClick={function(){exportXLSX([results]);}} style={{display:"flex",alignItems:"center",gap:5,padding:"7px 14px",background:C.greenL,border:"1.5px solid "+C.greenB,borderRadius:8,fontFamily:font,fontSize:12,fontWeight:700,color:C.green,cursor:"pointer"}}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>Excel
          </button>
          <button onClick={function(){setShowPrint(true);}} style={{display:"flex",alignItems:"center",gap:5,padding:"7px 14px",background:"#FEF2F2",border:"1.5px solid #FECACA",borderRadius:8,fontFamily:font,fontSize:12,fontWeight:700,color:C.red,cursor:"pointer"}}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>PDF
          </button>
          <button onClick={function(){exportJSON(results);}} style={{display:"flex",alignItems:"center",gap:5,padding:"7px 14px",background:C.purpleL,border:"1.5px solid "+C.purpleB,borderRadius:8,fontFamily:font,fontSize:12,fontWeight:700,color:C.purple,cursor:"pointer"}}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>JSON
          </button>
          <button onClick={props.onNew} style={{background:"none",border:"1.5px solid "+C.g200,color:C.g600,padding:"7px 14px",borderRadius:8,fontFamily:font,fontSize:12,fontWeight:500,cursor:"pointer"}}>+ Nouvelle</button>
        </div>
      </div>
      <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:16}}>
        {meta.kw && <span style={{fontFamily:"monospace",fontSize:12,fontWeight:600,padding:"4px 12px",borderRadius:20,background:C.navy,color:"#fff"}}>{meta.kw}</span>}
        {[["Zone",meta.zone],["Cible",meta.cible]].concat(meta.hs?[["HS",meta.hs]]:[]).concat(meta.alleg&&meta.alleg!=="Aucune"?[["Allégations",meta.alleg]]:[]).concat(meta.certs&&meta.certs!=="Aucune"?[["Certifs",meta.certs]]:[]).map(function(pair){return(<span key={pair[0]} style={{fontSize:12,padding:"4px 10px",borderRadius:20,background:C.g100,color:C.g600,border:"1px solid "+C.g200}}><strong style={{color:C.g900}}>{pair[0]} :</strong> {pair[1]}</span>);})}
      </div>
      <div style={{display:"flex",alignItems:"center",gap:12,padding:"14px 18px",borderRadius:10,marginBottom:16,border:"1px solid "+rs.bc,background:rs.bg}}>
        <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" style={{flexShrink:0}}><path strokeLinecap="round" d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
        <span style={{fontSize:13,fontWeight:700,color:rs.lc,whiteSpace:"nowrap"}}>{rs.lbl}</span>
        <span style={{fontSize:13,color:C.g600,flex:1,lineHeight:1.5}}>{data.risk_summary}</span>
        <RiskInfo/>
      </div>
      {totalMax>0 && (
        <div style={{background:"#fff",border:"1.5px solid rgba(10,22,40,.12)",borderRadius:12,padding:"14px 18px",marginBottom:16,display:"flex",flexWrap:"wrap",gap:0,overflow:"hidden"}}>
          <div style={{flex:"0 0 auto",paddingRight:20,borderRight:"1px solid "+C.g200,marginRight:20}}>
            <div style={{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".08em",color:C.g400,marginBottom:4}}>Budget total estimé</div>
            <div style={{display:"flex",alignItems:"baseline",gap:6}}>
              <span style={{fontSize:24,fontWeight:700,color:C.navy}}>{totalMin.toLocaleString("fr-FR")}€</span>
              <span style={{fontSize:14,color:C.g400}}>→</span>
              <span style={{fontSize:24,fontWeight:700,color:C.navy}}>{totalMax.toLocaleString("fr-FR")}€</span>
            </div>
            <div style={{fontSize:11,color:C.g400,marginTop:2}}>Estimations indicatives — labos accrédités EU</div>
          </div>
          <div style={{display:"flex",gap:16,flex:1,flexWrap:"wrap",alignItems:"center"}}>
            {mustMaxV>0 && <div><div style={{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",color:C.red,marginBottom:2}}>Obligatoire</div><div style={{fontSize:15,fontWeight:700,color:C.g900}}>{mustMinV.toLocaleString("fr-FR")}–{mustMaxV.toLocaleString("fr-FR")}€</div></div>}
            {niceMaxV>0 && <div><div style={{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",color:C.green,marginBottom:2}}>Optionnel</div><div style={{fontSize:15,fontWeight:700,color:C.g900}}>{niceMinV.toLocaleString("fr-FR")}–{niceMaxV.toLocaleString("fr-FR")}€</div></div>}
          </div>
        </div>
      )}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:10}}>
        <CountCard n={mustHave.length} label="Obligatoire" type="must"/>
        <CountCard n={(data.nice_to_have||[]).length} label="Optionnel" type="nice"/>
        <CountCard n={(data.customer_risks||[]).length} label="Risques" type="risk"/>
        <CountCard n={(data.norms_not_accessible||[]).length} label="À acquérir" type="miss"/>
      </div>
      {mustHave.length>0 && (
        <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
          {nMarquage>0 && <div style={{display:"flex",alignItems:"center",gap:5,padding:"4px 12px",borderRadius:20,background:"#EFF6FF",border:"1px solid #BFDBFE"}}><span style={{fontSize:11,fontWeight:700,color:"#1D4ED8"}}>◈ {nMarquage} marquage{nMarquage>1?"s":""}</span></div>}
          {nTest>0 && <div style={{display:"flex",alignItems:"center",gap:5,padding:"4px 12px",borderRadius:20,background:"#FEF3C7",border:"1px solid #FDE68A"}}><span style={{fontSize:11,fontWeight:700,color:"#92400E"}}>⚗ {nTest} test{nTest>1?"s":""} labo</span></div>}
          {nDoc>0 && <div style={{display:"flex",alignItems:"center",gap:5,padding:"4px 12px",borderRadius:20,background:"#F5F3FF",border:"1px solid #DDD6FE"}}><span style={{fontSize:11,fontWeight:700,color:"#5B21B6"}}>📄 {nDoc} document{nDoc>1?"s":""}</span></div>}
          {nDanger>0 && <div style={{display:"flex",alignItems:"center",gap:5,padding:"4px 12px",borderRadius:20,background:C.redL,border:"1px solid "+C.redB}}><span style={{fontSize:11,fontWeight:700,color:C.red}}>⚠ {nDanger} critique{nDanger>1?"s":""}</span></div>}
        </div>
      )}
      {data.lawyer_needed && (
        <div style={{background:C.purpleL,border:"1.5px solid "+C.purpleB,borderRadius:16,padding:"18px 20px",marginBottom:16}}>
          <div style={{fontSize:14,fontWeight:700,color:C.purple,marginBottom:10,display:"flex",alignItems:"center",gap:8}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>Conseil juridique recommandé
          </div>
          <ul style={{paddingLeft:18}}>{(data.lawyer_topics||[]).map(function(t,i){return <li key={i} style={{fontSize:13,color:"#4C1D95",marginBottom:5,lineHeight:1.5}}>{t}</li>;})}</ul>
          {data.ai_limits && <div style={{background:"#fff",borderRadius:10,padding:"12px 16px",marginTop:12,border:"1px solid "+C.purpleB}}><div style={{fontSize:12,fontWeight:700,color:C.purple,marginBottom:6}}>Limites de cette analyse IA</div><div style={{fontSize:12,color:C.g600,lineHeight:1.6}}>{data.ai_limits}</div></div>}
        </div>
      )}
      {(data.norms_not_accessible||[]).length>0 && (
        <div style={{background:C.amberL,border:"1px solid "+C.amberB,borderRadius:16,padding:"18px 20px",marginBottom:16}}>
          <div style={{fontSize:13,fontWeight:700,color:C.amber,marginBottom:12}}>Normes sans accès direct ({data.norms_not_accessible.length}) — à acquérir</div>
          {data.norms_not_accessible.map(function(n,i){return <NormCard key={i} n={n} type="miss" productContext={ctx} onAddNorm={addNorm}/>;}) }
        </div>
      )}
      <div style={{display:"flex",gap:2,borderBottom:"2px solid "+C.g200,marginBottom:20,flexWrap:"wrap"}}>
        {tabs.map(function(t){return(<div key={t.k} onClick={function(){setTab(t.k);}} style={{padding:"8px 14px",fontSize:13,fontWeight:600,color:tab===t.k?C.blue:C.g600,cursor:"pointer",borderBottom:"2px solid "+(tab===t.k?C.blue:"transparent"),marginBottom:-2,whiteSpace:"nowrap"}}>{t.l}</div>);})}
      </div>
      {tab==="must" && (mustHave.length===0 ? <div style={{textAlign:"center",padding:32,color:C.g400,fontSize:13}}>Aucune obligation.</div> :
        <div>
          {mustGrouped.map(function(g){return(
            <div key={g.cat} style={{marginBottom:20}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10,paddingBottom:6,borderBottom:"2px solid "+g.bc}}>
                <span style={{fontSize:12,fontWeight:700,color:g.cl,background:g.bg,border:"1px solid "+g.bc,padding:"3px 12px",borderRadius:20}}>{g.icon} {g.label} ({g.items.length})</span>
                <span style={{fontSize:11,color:C.g400}}>— {g.prio}</span>
              </div>
              {g.items.map(function(n,i){return <NormCard key={i} n={n} type="must" productContext={ctx} onAddNorm={addNorm} isNew={n._new}/>;}) }
            </div>
          );})}
          {mustUncategorized.map(function(n,i){return <NormCard key={"u"+i} n={n} type="must" productContext={ctx} onAddNorm={addNorm} isNew={n._new}/>;}) }
        </div>
      )}
      {tab==="nice" && (!(data.nice_to_have||[]).length ? <div style={{textAlign:"center",padding:32,color:C.g400,fontSize:13}}>Aucun élément.</div> : data.nice_to_have.map(function(n,i){return <NormCard key={i} n={n} type="nice" productContext={ctx} onAddNorm={addNorm} isNew={n._new}/>;}))}
      {tab==="risks" && (!(data.customer_risks||[]).length ? <div style={{textAlign:"center",padding:32,color:C.g400,fontSize:13}}>Aucun risque identifié.</div> : data.customer_risks.map(function(r,i){return <RiskItem key={i} r={r} productContext={ctx}/>;}))}
      {tab==="recalls" && (!(data.product_recalls||[]).length ? <div style={{textAlign:"center",padding:32,color:C.g400,fontSize:13,lineHeight:1.6}}>Aucun rappel connu.<br/>Consultez <strong>RAPEX/Safety Gate</strong> (EU) ou <strong>CPSC.gov</strong> (US).</div> : data.product_recalls.map(function(r,i){return <NormCard key={i} n={r} type="rec" productContext={ctx}/>;}))}
      {tab==="marquage" && <MarquageTab data={data} meta={meta}/>}
      {tab==="concurrent" && <ConcurrentTab meta={meta} competitorInfo={meta.competitor||""} initialPhotos={meta.competitorPhotos||[]} onAddNorm={addNorm}/>}
      {tab==="normes_plus" && <NormesPlus productContext={ctx} onAddNorm={addNorm}/>}
    </div>
  );
}

function FormView(props) {
  const [form,setForm]=useState({pname:"",cat:"",kw:"",desc:"",composants:"",substances:"",zone:"",cible:"",hs:"",extra:"",competitor:"",competitor_url:""});
  const [tags,setTags]=useState([]);
  const [certifs,setCertifs]=useState(new Set());
  const [competitorPhotos,setCompetitorPhotos]=useState([]);
  const [tagInput,setTagInput]=useState("");
  const [loading,setLoading]=useState(false);
  const [loadingStep,setLoadingStep]=useState("Analyse en cours…");
  const [error,setError]=useState("");
  const tagRef=useRef(null);
  const photoRef=useRef(null);
  function sf(k,v){setForm(function(f){var u=Object.assign({},f);u[k]=v;return u;});}
  var canGo=form.pname&&form.cat&&form.zone&&form.cible;
  function handleTagKey(e){if(e.key==="Enter"||e.key===","){e.preventDefault();var v=tagInput.trim().replace(/,$/,"");if(v&&!tags.includes(v))setTags(function(t){return t.concat([v]);});setTagInput("");}}
  function toggleCertif(c){setCertifs(function(p){var n=new Set(p);n.has(c)?n.delete(c):n.add(c);return n;});}
  function handleCompetitorPhotos(files){
    var promises=[];
    for(var i=0;i<files.length;i++){if(!files[i].type.startsWith("image/")) continue;(function(f){promises.push(new Promise(function(res,rej){var r=new FileReader();r.onload=function(){res({name:f.name,base64:r.result.split(",")[1],mediaType:f.type});};r.onerror=rej;r.readAsDataURL(f);}));})(files[i]);}
    Promise.all(promises).then(function(arr){setCompetitorPhotos(function(p){return p.concat(arr).slice(0,6);});});
  }
  var SUBSTANCES=[{k:"colorants",l:"Colorants"},{k:"solvants",l:"Solvants"},{k:"retardateurs",l:"Retardateurs flamme"},{k:"plastifiants",l:"Plastifiants"},{k:"metaux",l:"Métaux lourds"},{k:"biocides",l:"Biocides"},{k:"parfums",l:"Parfums"},{k:"nanoparticules",l:"Nanoparticules"},{k:"aucun",l:"Aucune substance"}];
  function run() {
    setError(""); setLoading(true); setLoadingStep("Analyse compliance en cours…");
    var alleg=tags.join(", ")||"Aucune";
    var certs=Array.from(certifs).join(", ")||"Aucune";
    var lines=[];
    lines.push("Tu es expert en compliance produit pour un e-commerçant Amazon (EU/US/UK). Génère une analyse structurée, précise et NON redondante.");
    lines.push("PRODUIT : "+form.pname+" | KW: "+(form.kw||"—")+" | Desc: "+(form.desc||"—")+" | Cat: "+form.cat+" | Zone: "+form.zone+" | Cible: "+form.cible+" | HS: "+(form.hs||"—")+" | Allég: "+alleg+" | Certs: "+certs+" | Extra: "+(form.extra||"—")+" | Composants: "+(form.composants||"—")+" | Substances: "+(form.substances||"—"));
    lines.push("JSON uniquement sans markdown :");
    lines.push("{");
    lines.push("  \"risk_level\":\"ÉLEVÉ\"|\"MOYEN\"|\"FAIBLE\",");
    lines.push("  \"risk_summary\":\"phrase courte\",");
    lines.push("  \"lawyer_needed\":true,");
    lines.push("  \"lawyer_topics\":[\"max 3\"],");
    lines.push("  \"ai_limits\":\"limites de cette analyse\",");
    lines.push("  \"norms_not_accessible\":[{\"norm\":\"\",\"reason\":\"\",\"recommendation\":\"\"}],");
    lines.push("  \"must_have\":[{\"norm\":\"Nom court unique\",\"category\":\"marquage|test|documentation\",\"what\":\"1-2 phrases\",\"why_mandatory\":\"1 phrase\",\"risk_if_missing\":\"1 phrase\",\"severity\":\"danger|majeur|mineur\",\"cost_min\":0,\"cost_max\":0,\"cost_note\":\"1 phrase\",\"markets\":[\"EU\"],\"lawyer\":false,\"labos\":[\"SGS\"]}],");
    lines.push("  \"nice_to_have\":[{\"norm\":\"Nom court\",\"category\":\"certification|test_complementaire|autre\",\"what\":\"1-2 phrases\",\"benefit\":\"1 phrase\",\"severity\":\"mineur\",\"cost_min\":0,\"cost_max\":0,\"cost_note\":\"1 phrase\",\"markets\":[\"EU\"]}],");
    lines.push("  \"customer_risks\":[{\"risk\":\"Nom du risque pour le consommateur\",\"description\":\"impact concret (blessure, allergie, danger)\",\"probability\":30,\"amazon_keywords\":[\"\"],\"tos_keywords\":[\"\"]}],");
    lines.push("  \"product_recalls\":[{\"description\":\"\",\"reason\":\"\",\"year\":\"\",\"markets\":[\"EU\"],\"source\":\"\"}]");
    lines.push("}");
    lines.push("");
    lines.push("RÈGLE CRITIQUE — MARQUAGE CE :");
    lines.push("CE obligatoire UNIQUEMENT pour : Jouets (2009/48/CE), électronique (Directive BT+CEM), EPI, dispositifs médicaux, machines, équipements radio.");
    lines.push("INTERDIT pour : textiles, mobilier standard, puériculture non électrique, ustensiles cuisine non électriques, cosmétiques.");
    lines.push("Apposer CE non requis = infraction. Si doute → confidence=incertaine + vérification juridique.");
    lines.push("");
    lines.push("RÈGLES ABSOLUES :");
    lines.push("DÉDUPLICATION : Une norme = une seule entrée.");
    lines.push("FILTRAGE PAR ZONE : "+form.zone);
    lines.push("- EU uniquement : normes EU seulement. INTERDIRE US (CPSC, ASTM, Prop 65) et UK (UKCA).");
    lines.push("- US uniquement : normes US seulement.");
    lines.push("- UK uniquement : normes UK seulement.");
    lines.push("- Multi-marchés : inclure normes de chaque marché, préciser markets pour chaque norme.");
    lines.push("CATÉGORISATION : marquage=logo/mention physique. test=essai labo avec rapport. documentation=document administratif.");
    lines.push("ORDRE MUST_HAVE : 1.Tests danger 2.Tests majeur 3.Documentation danger 4.Documentation majeur 5.Marquages.");
    lines.push("EXCLUSIONS : étiquetage composition textile, symboles CARE, packaging éco, bonnes pratiques non réglementaires.");
    lines.push("SÉVÉRITÉ : danger=risque juridique/retrait/amende. majeur=retrait listing probable. mineur=impact commercial.");
    lines.push("RISQUES CONSOMMATEUR : impacts sur le consommateur final (blessure, allergie, étouffement, intoxication). PAS de risques business.");
    lines.push("COÛTS : Marquage=0/0. EN71=300/800. REACH SVHC=150/400. EN ISO textiles=100/300. DoC interne=0/0. DoC sous-traité=500/2000. OEKO-TEX=500/1500. GOTS=800/2500.");
    lines.push("LABOS : 2-3 parmi SGS, Bureau Veritas, Intertek, TUV Rheinland, Eurofins, LNE, IFTH, FCBA.");
    lines.push("NORMES SPÉCIFIQUES :");
    lines.push("- Chaise haute/puériculture assise : EN 14988-1, EN 14988-2, EN 71-1, EN 71-2, EN 71-3, GPSR, REACH SVHC. severity=danger.");
    lines.push("- Jouets <14 ans : EN 71-1, EN 71-2, EN 71-3 systématiquement.");
    lines.push("- Jouets électriques : EN 62115.");
    lines.push("- Poussettes/sièges auto : EN 1888, R44/R129.");
    lines.push("- Produits électriques : Directive BT, CEM, marquage CE.");
    lines.push("- Cosmétiques : Règlement CE 1223/2009, CPNP.");
    lines.push("- Contact alimentaire : Règlement CE 10/2011, CE 1935/2004.");
    lines.push("must_have 10 max, nice_to_have 4 max, customer_risks 5 max, product_recalls 3 max. Français simple.");
    var prompt=lines.join("\n");
    callClaude(prompt,7000).then(function(txt){
      var raw=JSON.parse(repairJSON(txt));
      var normKey=function(s){return (s||"").toLowerCase().replace(/\s*\([^)]*\)/g,"").replace(/\s+/g," ").trim();};
      var dedup=function(arr){var seen=new Set();return (arr||[]).filter(function(n){var k=normKey(n.norm||n.description||"");if(seen.has(k))return false;seen.add(k);return true;});};
      var catOrder={test:0,documentation:1,marquage:2};
      var sevOrder2={danger:0,majeur:1,mineur:2};
      var sortMust=function(arr){return arr.slice().sort(function(a,b){var ca=(catOrder[a.category]||3)-(catOrder[b.category]||3);if(ca!==0)return ca;return (sevOrder2[a.severity]||3)-(sevOrder2[b.severity]||3);});};
      var finalData=Object.assign({},raw,{must_have:sortMust(dedup(raw.must_have)),nice_to_have:dedup(raw.nice_to_have),norms_not_accessible:dedup(raw.norms_not_accessible)});
      props.onResult({data:finalData,meta:Object.assign({},form,{alleg:alleg,certs:certs,competitorPhotos:competitorPhotos})});
      setLoading(false);
    }).catch(function(e){setError("Erreur : "+e.message);setLoading(false);});
  }
  if(loading) return (
    <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16}}>
      <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
      <div style={{width:36,height:36,border:"3px solid "+C.g200,borderTopColor:C.blue,borderRadius:"50%",animation:"spin .8s linear infinite"}}/>
      <div style={{fontSize:14,color:C.g600,fontWeight:600}}>{loadingStep}</div>
      <div style={{fontSize:12,color:C.g400}}>EU · US · UK · Amazon TIC</div>
    </div>
  );
  return (
    <div style={{flex:1,minWidth:0}}>
      <div style={{fontSize:11,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:C.blue,marginBottom:6}}>BMS International</div>
      <h1 style={{fontSize:26,fontWeight:700,color:C.navy,marginBottom:6,fontFamily:font}}>Analyseur Compliance Produit</h1>
      <div style={{fontSize:14,color:C.g600,marginBottom:24}}>Renseignez les caractéristiques du produit pour obtenir une analyse réglementaire complète générée par IA.</div>
      <div style={{background:"#fff",border:"1px solid "+C.g200,borderRadius:16,padding:24,marginBottom:16}}>
        <div style={{fontSize:13,fontWeight:700,textTransform:"uppercase",letterSpacing:".08em",color:C.g600,marginBottom:16,display:"flex",alignItems:"center",gap:8}}><span style={{width:20,height:20,borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,background:C.blueL,color:C.blue,flexShrink:0}}>1</span>Identification du produit</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          <div style={{display:"flex",flexDirection:"column",gap:6}}><label style={{fontSize:12,fontWeight:600,color:C.g600}}>Nom du produit *</label><input style={inp} value={form.pname} onChange={function(e){sf("pname",e.target.value);}} placeholder="Ex : Couette 4 saisons microfibre 200x200"/></div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}><label style={{fontSize:12,fontWeight:600,color:C.g600}}>Catégorie *</label><select style={inp} value={form.cat} onChange={function(e){sf("cat",e.target.value);}}><option value="">— Sélectionner —</option>{CATEGORIES.map(function(x){return <option key={x}>{x}</option>;})}</select></div>
          <div style={{display:"flex",flexDirection:"column",gap:6,gridColumn:"1/-1"}}>
            <label style={{fontSize:12,fontWeight:600,color:C.g600}}>Keyword principal Amazon</label>
            <div style={{background:C.navy,borderRadius:10,padding:"14px 16px"}}>
              <div style={{fontSize:11,fontWeight:700,letterSpacing:".08em",textTransform:"uppercase",color:"rgba(255,255,255,.5)",marginBottom:8}}>Main keyword</div>
              <input style={{fontFamily:"monospace",fontSize:14,fontWeight:500,padding:"8px 12px",border:"1.5px solid rgba(255,255,255,.15)",borderRadius:8,background:"rgba(255,255,255,.08)",color:"#fff",outline:"none",width:"100%"}} value={form.kw} onChange={function(e){sf("kw",e.target.value);}} placeholder="Ex : couette adulte 200x200 hiver chaud..."/>
            </div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6,gridColumn:"1/-1"}}><label style={{fontSize:12,fontWeight:600,color:C.g600}}>Description du produit</label><textarea style={{...inp,resize:"vertical",minHeight:80}} value={form.desc} onChange={function(e){sf("desc",e.target.value);}} placeholder="Matériaux, composants, usage prévu..."/></div>
          <div style={{display:"flex",flexDirection:"column",gap:6,gridColumn:"1/-1"}}><label style={{fontSize:12,fontWeight:600,color:C.g600}}>Composants exacts</label><textarea style={{...inp,resize:"vertical",minHeight:56}} value={form.composants} onChange={function(e){sf("composants",e.target.value);}} placeholder="Ex : Coque 100% coton bio, rembourrage polyester 300g/m²..."/></div>
          <div style={{display:"flex",flexDirection:"column",gap:6,gridColumn:"1/-1"}}>
            <label style={{fontSize:12,fontWeight:600,color:C.g600}}>Substances potentiellement dangereuses</label>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {SUBSTANCES.map(function(s){var active=(form.substances||"").includes(s.k);return(<span key={s.k} onClick={function(){var cur=form.substances||"";var arr=cur?cur.split(",").map(function(x){return x.trim();}).filter(Boolean):[];var next=active?arr.filter(function(x){return x!==s.k;}):[].concat(arr,[s.k]);sf("substances",next.join(", "));}} style={{fontSize:11,fontWeight:600,padding:"5px 11px",borderRadius:20,cursor:"pointer",border:"1.5px solid "+(active?"#DC2626":"#E5E7EB"),background:active?"#FEF2F2":"#fff",color:active?"#DC2626":"#4B5563",userSelect:"none"}}>{s.l}</span>);})}
            </div>
          </div>
        </div>
      </div>
      <div style={{background:"#fff",border:"1px solid "+C.g200,borderRadius:16,padding:24,marginBottom:16}}>
        <div style={{fontSize:13,fontWeight:700,textTransform:"uppercase",letterSpacing:".08em",color:C.g600,marginBottom:16,display:"flex",alignItems:"center",gap:8}}><span style={{width:20,height:20,borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,background:C.blueL,color:C.blue,flexShrink:0}}>2</span>Marché et cible</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          <div style={{display:"flex",flexDirection:"column",gap:6}}><label style={{fontSize:12,fontWeight:600,color:C.g600}}>Zone(s) de vente *</label><select style={inp} value={form.zone} onChange={function(e){sf("zone",e.target.value);}}><option value="">— Sélectionner —</option>{ZONES.map(function(x){return <option key={x}>{x}</option>;})}</select></div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}><label style={{fontSize:12,fontWeight:600,color:C.g600}}>Cible client *</label><select style={inp} value={form.cible} onChange={function(e){sf("cible",e.target.value);}}><option value="">— Sélectionner —</option>{CIBLES.map(function(x){return <option key={x}>{x}</option>;})}</select></div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}><label style={{fontSize:12,fontWeight:600,color:C.g600}}>HS Code douanier</label><input style={inp} value={form.hs} onChange={function(e){sf("hs",e.target.value);}} placeholder="Ex : 6302.60"/></div>
        </div>
      </div>
      <div style={{background:"#fff",border:"1px solid "+C.g200,borderRadius:16,padding:24,marginBottom:16}}>
        <div style={{fontSize:13,fontWeight:700,textTransform:"uppercase",letterSpacing:".08em",color:C.g600,marginBottom:16,display:"flex",alignItems:"center",gap:8}}><span style={{width:20,height:20,borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,background:C.blueL,color:C.blue,flexShrink:0}}>3</span>Allégations et certifications</div>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            <label style={{fontSize:12,fontWeight:600,color:C.g600}}>Allégations marketing prévues</label>
            <div onClick={function(){if(tagRef.current) tagRef.current.focus();}} style={{display:"flex",flexWrap:"wrap",gap:6,padding:"8px 10px",border:"1.5px solid "+C.g200,borderRadius:10,background:C.g50,minHeight:42,alignItems:"center",cursor:"text"}}>
              {tags.map(function(t,i){return(<span key={i} style={{background:C.blueL,color:C.blue,fontSize:12,fontWeight:600,padding:"3px 8px",borderRadius:20,display:"flex",alignItems:"center",gap:4}}>{t}<button onClick={function(e){e.stopPropagation();setTags(function(ts){return ts.filter(function(_,j){return j!==i;});});}} style={{background:"none",border:"none",color:C.blue,cursor:"pointer",fontSize:13,lineHeight:1,padding:"0 2px"}}>×</button></span>);})}
              <input ref={tagRef} value={tagInput} onChange={function(e){setTagInput(e.target.value);}} onKeyDown={handleTagKey} placeholder={tags.length===0?"Ex: Bio, Hypoallergénique...":""} style={{border:"none",background:"transparent",outline:"none",fontSize:13,color:C.g900,minWidth:80,flex:1,fontFamily:font}}/>
            </div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            <label style={{fontSize:12,fontWeight:600,color:C.g600}}>Certifications attendues</label>
            <div style={{display:"flex",flexWrap:"wrap",gap:8}}>{CERTIFS.map(function(cert){return(<label key={cert} onClick={function(){toggleCertif(cert);}} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 12px",border:"1.5px solid "+(certifs.has(cert)?C.blue:C.g200),borderRadius:20,cursor:"pointer",fontSize:12,fontWeight:500,color:certifs.has(cert)?C.blue:C.g600,background:certifs.has(cert)?C.blueL:"#fff",userSelect:"none"}}>{cert}</label>);})}
            </div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}><label style={{fontSize:12,fontWeight:600,color:C.g600}}>Informations complémentaires</label><textarea style={{...inp,resize:"vertical",minHeight:56}} value={form.extra} onChange={function(e){sf("extra",e.target.value);}} placeholder="Piles incluses, pièces < 3cm, contact alimentaire, usage médical..."/></div>
        </div>
      </div>
      <div style={{background:"#fff",border:"1px solid "+C.g200,borderRadius:16,padding:24,marginBottom:16}}>
        <div style={{fontSize:13,fontWeight:700,textTransform:"uppercase",letterSpacing:".08em",color:C.g600,marginBottom:16,display:"flex",alignItems:"center",gap:8}}><span style={{width:20,height:20,borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,background:C.blueL,color:C.blue,flexShrink:0}}>4</span>Compliance concurrente (optionnel)</div>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div style={{fontSize:12,color:C.g600}}>Ces informations seront disponibles dans l'onglet Concurrent des résultats.</div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            <label style={{fontSize:12,fontWeight:600,color:C.g600}}>URL du listing concurrent</label>
            <div style={{position:"relative"}}>
              <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:C.g400,pointerEvents:"none"}}>🔗</span>
              <input style={{...inp,paddingLeft:30}} value={form.competitor_url} onChange={function(e){sf("competitor_url",e.target.value);}} placeholder="https://www.amazon.fr/dp/..."/>
            </div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            <label style={{fontSize:12,fontWeight:600,color:C.g600}}>Description certifications concurrent</label>
            <textarea style={{...inp,resize:"vertical",minHeight:56}} value={form.competitor} onChange={function(e){sf("competitor",e.target.value);}} placeholder="Ex : Le concurrent affiche OEKO-TEX Standard 100, GOTS..."/>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            <label style={{fontSize:12,fontWeight:600,color:C.g600}}>Photos du packaging concurrent (max 6)</label>
            <div onDrop={function(e){e.preventDefault();handleCompetitorPhotos(Array.from(e.dataTransfer.files));}} onDragOver={function(e){e.preventDefault();}} onClick={function(){if(photoRef.current) photoRef.current.click();}} style={{border:"2px dashed "+C.purpleB,borderRadius:10,padding:"16px",textAlign:"center",cursor:"pointer",background:C.purpleL}}>
              <input ref={photoRef} type="file" accept="image/*" multiple style={{display:"none"}} onChange={function(e){handleCompetitorPhotos(Array.from(e.target.files));}}/>
              <div style={{fontSize:13,color:C.purple,fontWeight:600,marginBottom:2}}>📷 Glissez-déposez ou cliquez</div>
              <div style={{fontSize:11,color:C.g400}}>PNG, JPG, WEBP</div>
            </div>
            {competitorPhotos.length>0 && (
              <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:6,alignItems:"center"}}>
                {competitorPhotos.map(function(p,i){return(<div key={i} style={{position:"relative",width:64,height:64}}><img src={"data:"+p.mediaType+";base64,"+p.base64} alt={p.name} style={{width:64,height:64,objectFit:"cover",borderRadius:8,border:"1px solid "+C.g200}}/><button onClick={function(e){e.stopPropagation();setCompetitorPhotos(function(ps){return ps.filter(function(_,j){return j!==i;});});}} style={{position:"absolute",top:-6,right:-6,width:18,height:18,borderRadius:"50%",background:C.red,color:"#fff",border:"none",cursor:"pointer",fontSize:11,fontWeight:700,fontFamily:font}}>×</button></div>);})}
                <span style={{fontSize:11,color:C.purple,fontWeight:600}}>{competitorPhotos.length} photo{competitorPhotos.length>1?"s":""}</span>
              </div>
            )}
          </div>
        </div>
      </div>
      {error && <div style={{background:C.redL,border:"1px solid "+C.redB,borderRadius:10,padding:14,marginBottom:16,fontSize:13,color:C.red}}>{error}</div>}
      <button onClick={canGo?run:undefined} disabled={!canGo} style={{width:"100%",padding:14,background:C.navy,color:"#fff",border:"none",borderRadius:10,fontFamily:font,fontSize:14,fontWeight:700,cursor:canGo?"pointer":"not-allowed",opacity:canGo?1:0.5,display:"flex",alignItems:"center",justifyContent:"center",gap:10,marginTop:8}}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        Lancer l'analyse compliance
      </button>
      <div style={{fontSize:11,color:C.g400,textAlign:"center",marginTop:10}}>* Champs obligatoires : Nom produit, Catégorie, Zone, Cible</div>
    </div>
  );
}

export default function App() {
  const [history,setHistory]=useState([]);
  const [current,setCurrent]=useState(null);
  const [loaded,setLoaded]=useState(false);
  useEffect(function(){loadHistory().then(function(h){setHistory(h);setLoaded(true);});},[]);
  function handleResult(result) {
    var now=new Date();
    var date=now.toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric"})+" "+now.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});
    var entry=Object.assign({},result,{id:Date.now().toString(),date:date});
    var next=[entry].concat(history).slice(0,20);
    setHistory(next); setCurrent(entry); saveHistory(next);
  }
  function handleDelete(id) {
    var next=history.filter(function(h){return h.id!==id;});
    setHistory(next); if(current&&current.id===id) setCurrent(null); saveHistory(next);
  }
  function handleAddNorm(entryId,normData) {
    var entry=history.find(function(h){return h.id===entryId;})||current;
    if(!entry) return;
    var norm={norm:normData.nom,what:normData.what,why_mandatory:normData.why_mandatory||"",risk_if_missing:normData.risk_if_missing||"",benefit:normData.benefit||"",markets:normData.markets||[],cost_min:normData.cost_min||0,cost_max:normData.cost_max||0,cost_note:normData.cost_note||"",lawyer:false,_new:true};
    var updated=normData.type==="must"
      ? Object.assign({},entry,{data:Object.assign({},entry.data,{must_have:(entry.data.must_have||[]).concat([norm])})})
      : Object.assign({},entry,{data:Object.assign({},entry.data,{nice_to_have:(entry.data.nice_to_have||[]).concat([norm])})});
    var next=history.map(function(h){return h.id===entryId?updated:h;});
    setHistory(next); setCurrent(updated); saveHistory(next);
  }
  if(!loaded) return <div style={{fontFamily:font,background:"#F8FAFC",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,color:C.g400}}>Chargement…</div>;
  return (
    <div style={{fontFamily:font,background:"#F8FAFC",minHeight:"100vh",padding:"24px 16px"}}>
      <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
      <div style={{maxWidth:1160,margin:"0 auto",display:"flex",gap:20,alignItems:"flex-start"}}>
        <Sidebar history={history} currentId={current&&current.id} onSelect={function(h){setCurrent(h);}} onDelete={handleDelete} onNew={function(){setCurrent(null);}} onExport={function(){exportXLSX(history);}}/>
        {current
          ? <ResultsView results={current} onNew={function(){setCurrent(null);}} onAddNorm={handleAddNorm}/>
          : <FormView onResult={handleResult}/>
        }
      </div>
    </div>
  );
}
