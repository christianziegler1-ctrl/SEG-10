/* =========================================================
   EINSATZBOARD – APP.JS  v8
========================================================= */

let dragged = null
let halteplatzCount = 0
let abschnittCount = 0

let totalPatients = 0
let currentPatientBox = null

let einsatzAktiv = false
let autosaveTimer = null
let einsatzDateiHandle = null
let letzterAutosave = null

let einsatzStartZeit = null
let timerInterval = null

let eventLog = []
let vehicleHotkeysActive = false

let currentSichtung = null
let sichtungCounts = { SK1: 0, SK2: 0, SK3: 0, SK4: 0 }
let demografieLog = []

let alarmstufen = []
let aktiveAlarmstufe = null

let fahrzeugLog = {}

document.addEventListener("DOMContentLoaded", () => {
  initDrag()
  initSEG()
  initEnter()
  initPatients()
  initShortcuts()
  document.querySelectorAll(".patients").forEach(p => {
    if(!p.dataset.manual) p.dataset.manual = p.innerText.trim() || "0"
  })
  updatePatients()
  initReloadProtection()
  renderShortcutList()
  // Beim Start prüfen ob laufender Einsatz in Firebase vorhanden
  pruefeFirebaseBackup()
})

async function pruefeFirebaseBackup(){
  if(!FIREBASE_URL) return
  try {
    const res = await fetch(FIREBASE_URL + "/backup.json?t=" + Date.now())
    if(!res.ok) return
    const data = await res.json()
    if(!data || !data.html || !data.timestamp) return

    // Nur anzeigen wenn Einsatz aus den letzten 24 Stunden
    const alter = Date.now() - new Date(data.timestamp).getTime()
    if(alter > 24 * 60 * 60 * 1000) return

    const ts = new Date(data.timestamp).toLocaleString("de-AT")

    // Dezentes Popup unten links
    const popup = document.createElement("div")
    popup.id = "restorePopup"
    popup.style.cssText = [
      "position:fixed","bottom:60px","left:14px","z-index:9999",
      "background:var(--bg-panel)","border:2px solid var(--accent-blue)",
      "border-radius:10px","padding:14px 16px","max-width:280px",
      "font-family:'Rajdhani',sans-serif","box-shadow:0 4px 20px rgba(0,0,0,0.3)"
    ].join(";")
    popup.innerHTML = `
      <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:var(--accent-blue);margin-bottom:6px">⚡ Laufender Einsatz gefunden</div>
      <div style="font-size:13px;color:var(--text-secondary);margin-bottom:10px">Letzter Stand: <b style="color:var(--text-primary)">${ts}</b></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
        <button onclick="document.getElementById('restorePopup')?.remove();einsatzAusFirebaseWiederherstellen()"
          style="padding:8px;background:rgba(26,86,219,0.1);border:1.5px solid rgba(26,86,219,0.4);color:var(--accent-blue);border-radius:6px;font-family:'Rajdhani',sans-serif;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;cursor:pointer">
          ☁ Fortführen
        </button>
        <button onclick="document.getElementById('restorePopup')?.remove()"
          style="padding:8px;background:var(--bg-card);border:1.5px solid var(--border);color:var(--text-dim);border-radius:6px;font-family:'Rajdhani',sans-serif;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;cursor:pointer">
          Ignorieren
        </button>
      </div>
    `
    document.body.appendChild(popup)
    // Automatisch nach 20 Sekunden ausblenden
    setTimeout(() => popup.remove(), 20000)
  } catch(e) {}
}

/* VOLLBILD */
function toggleFullscreen(){
  if(!document.fullscreenElement){
    document.documentElement.requestFullscreen().catch(err=>console.warn(err))
  }else{
    document.exitFullscreen()
  }
}
document.addEventListener("fullscreenchange", ()=>{
  const btn = document.getElementById("fullscreenBtn")
  if(!btn) return
  btn.textContent = document.fullscreenElement ? "✕" : "⛶"
  btn.title = document.fullscreenElement ? "Vollbild beenden" : "Vollbild"
})

/* DRAG & DROP */
function initDrag(){
  document.querySelectorAll(".bereich, .zufahrt").forEach(area=>{
    area.addEventListener("dragover", e=>e.preventDefault())
    area.addEventListener("drop", e=>{
      e.preventDefault()
      if(!dragged) return
      let drop = area.querySelector(".drop")
      if(drop){
        drop.appendChild(dragged)
        sortVehicles(drop)
      }else{
        area.appendChild(dragged)
      }
      const itemName = dragged.dataset.fkName || dragged.children[2]?.innerText || dragged.children[1]?.innerText || "Element"
      const ziel = area.querySelector(".bheader")?.innerText || area.querySelector(".abschnittName")?.value || (area.id==="zufahrt" ? "Zufahrt" : "Unbekannt")
      logEvent(itemName + " verschoben nach: " + ziel)
      updatePatients()
      saveState()
    })
  })
}

/* FAHRZEUG MENU */
function openVehicleMenu(){
  closePopup()
  vehicleHotkeysActive = true
  document.getElementById("vehiclePopup").style.display="flex"
}
function closeVehicleMenu(){
  vehicleHotkeysActive = false
  document.getElementById("vehiclePopup").style.display="none"
}

/* FUEHRUNGSKRAFT MENU */
function openFuehrungskraftMenu(){
  closePopup()
  document.getElementById("fuehrungskraftPopup").style.display="flex"
}
function closeFuehrungskraftMenu(){
  document.getElementById("fuehrungskraftPopup").style.display="none"
}
function createFuehrungskraft(typ){
  closeFuehrungskraftMenu()
  openNamePopup(typ + " – Name (optional)", "", function(name){
    name = name || ""
    const fk = document.createElement("div")
    fk.className = "fuehrungskraft"
    fk.draggable = true
    fk.dataset.id = Date.now() + Math.random()
    fk.dataset.fkName = name ? (typ + " " + name) : typ
    fk.innerHTML = '<div class="deleteFk">X</div><div class="fkTyp">' + typ + '</div>' + (name ? '<div class="fkName">' + name + '</div>' : '')
    fk.querySelector(".deleteFk").onclick = (e) => {
      e.stopPropagation()
      logEvent("Fuehrungskraft entfernt: " + fk.dataset.fkName)
      fk.remove()
      saveState()
    }
    fk.addEventListener("dragstart", ()=>{ dragged = fk })
    logEvent("Fuehrungskraft erstellt: " + fk.dataset.fkName)
    document.getElementById("zufahrt").appendChild(fk)
    saveState()
  }, true) // optional = true
}

/* EIGENES NAME-POPUP statt prompt() – verhindert Vollbild-Abbruch */
let _namePopupCallback = null
let _namePopupOptional = false

function openNamePopup(title, placeholder, callback, optional){
  _namePopupCallback = callback
  _namePopupOptional = optional || false
  const popup = document.getElementById("namePopup")
  document.getElementById("namePopupTitle").textContent = title
  const input = document.getElementById("namePopupInput")
  input.value = ""
  input.placeholder = optional ? "(optional, Enter zum Ueberspringen)" : placeholder
  popup.style.display = "flex"
  setTimeout(()=>input.focus(), 50)
}

function namePopupConfirm(){
  const val = document.getElementById("namePopupInput").value.trim()
  if(!_namePopupOptional && !val) return
  document.getElementById("namePopup").style.display = "none"
  if(_namePopupCallback) _namePopupCallback(val)
  _namePopupCallback = null
}

function namePopupCancel(){
  document.getElementById("namePopup").style.display = "none"
  _namePopupCallback = null
}

document.addEventListener("DOMContentLoaded", ()=>{
  document.getElementById("namePopupInput")?.addEventListener("keydown", (e)=>{
    if(e.key === "Enter"){ e.preventDefault(); namePopupConfirm() }
    if(e.key === "Escape"){ e.preventDefault(); namePopupCancel() }
  })
})

/* FAHRZEUG ERSTELLEN */
function createVehicle(type){
  closeVehicleMenu()
  openNamePopup(type + " Kennung eingeben", "", function(name){
    if(!name || !name.trim()) return
    name = name.trim()
    let v = document.createElement("div")
    v.className = "vehicle " + type
    v.draggable = true
    v.dataset.id = Date.now() + Math.random()
    v.innerHTML = '<div class="deleteVehicle">X</div><div>' + type + '</div><div>' + name + '</div>'
    v.querySelector(".deleteVehicle").onclick = (e) => {
      e.stopPropagation()
      delete fahrzeugLog[v.dataset.id]
      logEvent("Fahrzeug geloescht: " + name)
      v.remove()
      updatePatients()
      saveState()
    }
    v.addEventListener("dragstart", ()=>{ dragged = v })
    v.onclick = (e) => {
      if(e.target.classList.contains("patBadge") || e.target.classList.contains("deleteVehicle")) return
      v.classList.toggle("active")
      const fLog = fahrzeugLog[v.dataset.id]
      if(v.classList.contains("active")){
        if(fLog){ fLog.eingetroffen = new Date().toLocaleTimeString(); fLog.aktiv = true }
        logEvent("Fahrzeug eingetroffen: " + name)
      }else{
        if(fLog) fLog.aktiv = false
        logEvent("Fahrzeug Einsatz beendet: " + name)
      }
      saveState()
    }
    document.getElementById("zufahrt").appendChild(v)
    sortVehicles(document.getElementById("zufahrt"))
    fahrzeugLog[v.dataset.id] = { name, type, zeit: new Date().toLocaleTimeString(), aktiv: false }
    logEvent("Fahrzeug erstellt: " + type + " " + name)
    updatePatients()
    saveState()
  }, false) // optional = false, Eingabe pflicht
}

/* SEG BUTTONS */
function initSEG(){
  document.querySelectorAll(".seg").forEach(btn=>{
    btn.onclick=()=>{
      if(btn._wasDragged){ btn._wasDragged=false; return }
      btn.classList.toggle("active")
      const text=btn.innerText.trim()
      logEvent(btn.classList.contains("active")?"SEG aktiviert: "+text:"SEG deaktiviert: "+text)
      saveState()
    }
    btn.setAttribute("draggable","true")
    btn.addEventListener("dragstart",e=>{
      btn._wasDragged=true; dragged=btn; e.dataTransfer.effectAllowed="move"
    })
    btn.addEventListener("dragend",()=>{ dragged=null })
  })
  document.querySelectorAll(".bereich, #zufahrt").forEach(area=>{
    area.addEventListener("dragover",e=>{
      if(dragged&&dragged.classList.contains("seg")){ e.preventDefault(); e.dataTransfer.dropEffect="move" }
    })
    area.addEventListener("drop",e=>{
      if(!dragged||!dragged.classList.contains("seg")) return
      e.preventDefault(); e.stopPropagation()
      const segName=dragged.dataset.seg||dragged.innerText.trim()
      // Entferne evtl. vorhandene Badge dieses SEG aus anderen Bereichen (nicht das Original)
      document.querySelectorAll(".seg-badge").forEach(b=>{ if(b.dataset.seg===segName) b.remove() })
      const badge=document.createElement("div")
      badge.className="seg-badge"; badge.dataset.seg=segName
      // Badge ist auch draggable (für Verschieben zwischen Bereichen)
      badge.draggable=true
      badge.addEventListener("dragstart",ev=>{ dragged=badge; ev.dataTransfer.effectAllowed="move" })
      badge.addEventListener("dragend",()=>{ dragged=null })
      badge.innerHTML=segName+' <span class="seg-badge-remove" onclick="this.parentElement.remove();saveState()">×</span>'
      const drop=area.classList.contains("drop")?area:area.querySelector(".drop")
      if(drop) area.insertBefore(badge,drop); else area.appendChild(badge)
      logEvent("SEG zugewiesen: "+segName+" → "+(area.querySelector(".bheader,.abschnittName")?.innerText?.trim()||area.id||"Bereich"))
      saveState()
    })
  })
  // segButtons als Rückgabe-Ziel
  document.querySelector(".segButtons")?.addEventListener("dragover",e=>{
    if(dragged&&(dragged.classList.contains("seg")||dragged.classList.contains("seg-badge"))){ e.preventDefault() }
  })
  document.querySelector(".segButtons")?.addEventListener("drop",e=>{
    if(!dragged) return
    // Nur Badge entfernen, nie das Original (.seg in .segButtons)
    if(dragged.classList.contains("seg")) return
    const segName=dragged.dataset.seg
    if(!segName) return
    e.preventDefault()
    document.querySelectorAll(".seg-badge").forEach(b=>{ if(b.dataset.seg===segName) b.remove() })
    logEvent("SEG zurück: "+segName)
    saveState()
  })
  document.querySelectorAll(".unit").forEach(h=>{
    h.onclick=()=>{
      h.classList.toggle("active")
      const text=h.innerText.trim()
      logEvent(h.classList.contains("active")?"Bereich aktiviert: "+text:"Bereich deaktiviert: "+text)
      saveState()
    }
  })
}

/* HALTEPLATZ */
function createHalteplatz(){
  halteplatzCount++
  let hp = document.createElement("div")
  hp.className = "bereich"
  hp.innerHTML = '<div class="deleteHP">X</div><div class="bheader">Halteplatz ' + halteplatzCount + '</div><input class="adressfeld" placeholder="Adresse / Standort\u2026"><div class="drop"></div>'
  hp.querySelector(".deleteHP").onclick = (e) => {
    e.stopPropagation()
    retteZuZufahrt(hp)
    hp.remove()
    logEvent("Halteplatz geloescht")
    saveState()
  }
  document.getElementById("halteplaetze").appendChild(hp)
  logEvent("Halteplatz erstellt: Halteplatz " + halteplatzCount)
  initDrag()
  saveState()
}

/* EINSATZABSCHNITT */
function createAbschnitt(){
  abschnittCount++
  const ab = document.createElement("div")
  ab.className = "bereich abschnitt"
  ab.innerHTML =
    '<div class="deleteHP">X</div>' +
    '<div class="abschnittHeader"><input class="abschnittName" value="Abschnitt ' + abschnittCount + '" placeholder="Abschnitt benennen\u2026"></div>' +
    '<div class="patients" data-unit="ABSCHNITT' + abschnittCount + '">0</div>' +
    '<input class="adressfeld" placeholder="Adresse / Standort\u2026">' +
    '<div class="drop"></div>'
  ab.querySelector(".deleteHP").onclick = (e) => {
    e.stopPropagation()
    retteZuZufahrt(ab)
    logEvent("Abschnitt geloescht")
    ab.remove()
    saveState()
  }
  document.getElementById("abschnitteContainer").appendChild(ab)
  logEvent("Abschnitt erstellt: Abschnitt " + abschnittCount)
  initDrag(); initPatients()
  saveState()
}

/* VORSICHTUNG */
function createVorsichtung(){
  if(document.getElementById("vorsichtung")) return
  let v = document.createElement("div")
  v.className = "bereich"
  v.id = "vorsichtung"
  v.innerHTML = '<div class="deleteHP">X</div><div class="bheader unit">Vorsichtung</div><div class="patients" data-unit="VORSICHT">0</div><input class="adressfeld" placeholder="Adresse / Standort\u2026"><div class="drop"></div>'
  v.querySelector(".deleteHP").onclick = (e) => {
    e.stopPropagation()
    retteZuZufahrt(v)
    v.remove()
    logEvent("Vorsichtung geloescht")
    updateDashboard()
    saveState()
  }
  document.getElementById("vorsichtungContainer").appendChild(v)
  logEvent("Vorsichtung erstellt")
  initDrag(); initPatients(); initSEG()
  updateDashboard(); saveState()
}

/* PSS */
function createPSS(){
  if(document.getElementById("pss")) return
  let p = document.createElement("div")
  p.className = "bereich"
  p.id = "pss"
  p.innerHTML = '<div class="deleteHP">X</div><div class="bheader unit">Patientensammelstelle</div><div class="patients" data-unit="PSS">0</div><input class="adressfeld" placeholder="Adresse / Standort\u2026"><div class="drop"></div>'
  p.querySelector(".deleteHP").onclick = (e) => {
    e.stopPropagation()
    retteZuZufahrt(p)
    p.remove()
    logEvent("PSS geloescht")
    updateDashboard(); saveState()
  }
  document.getElementById("pssContainer").appendChild(p)
  logEvent("PSS erstellt")
  initDrag(); initPatients(); initSEG()
  updateDashboard(); saveState()
}

/* BER */
function createBER(){
  if(document.getElementById("ber")) return
  const ber = document.createElement("div")
  ber.className = "bereich blue"
  ber.id = "ber"
  ber.innerHTML = '<div class="deleteHP">X</div><div class="bheader unit">BER \u2013 Bereitstellungsraum</div><div class="patients" data-unit="BER">0</div><input class="adressfeld" placeholder="Adresse / Standort\u2026"><div class="drop"></div>'
  ber.querySelector(".deleteHP").onclick = (e) => {
    e.stopPropagation()
    retteZuZufahrt(ber)
    ber.remove()
    logEvent("BER geloescht")
    updateDashboard(); saveState()
  }
  document.getElementById("berContainer").appendChild(ber)
  logEvent("BER erstellt")
  initDrag(); initPatients(); initSEG()
  updateDashboard(); saveState()
}

/* FUNK */
function initEnter(){
  function handleEnter(e){ if(e.key==="Enter"){ e.preventDefault(); sendFunk() } }
  document.getElementById("funkVon")?.addEventListener("keydown",handleEnter)
  document.getElementById("funkAn")?.addEventListener("keydown",handleEnter)
  document.getElementById("funkText")?.addEventListener("keydown",handleEnter)
}
function sendFunk(){
  let von=document.getElementById("funkVon").value
  let an=document.getElementById("funkAn").value
  let text=document.getElementById("funkText").value
  if(text==="") return
  let time=new Date().toLocaleTimeString()
  let line=document.createElement("div")
  line.innerText=time+" | "+von+" \u2192 "+an+": "+text
  document.getElementById("log").prepend(line)
  logEvent("Funkspruch: "+von+" -> "+an+": "+text)
  document.getElementById("funkText").value=""
  document.getElementById("funkVon").value=""
  document.getElementById("funkAn").value=""
  saveState()
}

/* PATIENTEN */
function initPatients(){
  document.querySelectorAll(".bereich").forEach(b=>{
    if(!b.classList.contains("zufahrtContainer") && !b.classList.contains("bergetrupp")) addSkButtons(b)
  })
  document.querySelectorAll(".patients").forEach(el=>{
    el.onclick=(e)=>{
      e.stopPropagation()
      currentPatientBox=el
      document.getElementById("patientInput").value=""
      document.getElementById("patientPopup").style.display="flex"
    }
  })
}
function closePopup(){
  document.getElementById("patientPopup").style.display="none"
  document.getElementById("vehiclePopup").style.display="none"
  const fp=document.getElementById("fuehrungskraftPopup")
  if(fp) fp.style.display="none"
  vehicleHotkeysActive=false
  let box=document.getElementById("vehicleSelectBox")
  if(box) box.style.display="none"
  resetSichtungUI()
}
function patientAction(action){
  const amount=parseInt(document.getElementById("patientInput").value)
  if(!amount) return
  if(!currentPatientBox) return
  if(!currentPatientBox.classList.contains("patBadge")){
    let currentManual=parseInt(currentPatientBox.dataset.manual||"0")||0
    if(action==="add"){
      currentPatientBox.dataset.manual=currentManual+amount
      totalPatients+=amount
      if(currentSichtung){
        sichtungCounts[currentSichtung]=(sichtungCounts[currentSichtung]||0)+amount
        currentPatientBox.dataset.sichtung=currentSichtung
        logEvent("Patienten angelegt: "+amount+" ("+currentSichtung+")")
      }else{ logEvent("Patienten angelegt: "+amount) }
      const me=parseInt(document.getElementById("dem_m_erw")?.value)||0
      const we=parseInt(document.getElementById("dem_w_erw")?.value)||0
      const mk=parseInt(document.getElementById("dem_m_kind")?.value)||0
      const wk=parseInt(document.getElementById("dem_w_kind")?.value)||0
      if(me||we||mk||wk){
        demografieLog.push({m_erw:me,w_erw:we,m_kind:mk,w_kind:wk,sk:currentSichtung||"",ts:new Date().toLocaleTimeString()})
        ;["dem_m_erw","dem_w_erw","dem_m_kind","dem_w_kind"].forEach(id=>{const el=document.getElementById(id);if(el)el.value=""})
      }
    }else if(action==="DELETE"){
      let d=Math.min(amount,currentManual)
      currentPatientBox.dataset.manual=currentManual-d
      totalPatients=Math.max(0,totalPatients-d)
      // SK-Zähler abziehen: gewählte SK oder SK des Bereichs
      const skDel = currentSichtung || currentPatientBox.dataset.sichtung
      if(skDel&&sichtungCounts[skDel]) sichtungCounts[skDel]=Math.max(0,sichtungCounts[skDel]-d)
      const delBereich = currentPatientBox.closest(".bereich")
      if(delBereich && skDel && delBereich._skCounts){
        delBereich._skCounts[skDel]=Math.max(0,(delBereich._skCounts[skDel]||0)-d)
        updateSkButtons(delBereich)
      }
      logEvent("Patienten geloescht: "+d+(skDel?" ("+skDel+")":""))
    }else if(action==="remove"||action==="RUECK"){
      currentPatientBox.dataset.manual=Math.max(0,currentManual-amount)
      logEvent(action==="RUECK"?"Patienten Rueckfuehrung: "+amount:"Patienten entfernt: "+amount)
    }else{
      if(currentManual<amount) return
      currentPatientBox.dataset.manual=currentManual-amount
      // SK-Zähler im Quellbereich reduzieren
      const quellBereich = currentPatientBox.closest(".bereich")
      const skToMove = currentSichtung || null
      if(quellBereich && skToMove && quellBereich._skCounts){
        quellBereich._skCounts[skToMove] = Math.max(0,(quellBereich._skCounts[skToMove]||0)-amount)
        updateSkButtons(quellBereich)
      }
      // Globale SK-Zähler: kein Ändern da Patient weiter existiert
      document.querySelectorAll(".patients").forEach(p=>{
        if(p.dataset.unit===action){
          p.dataset.manual=(parseInt(p.dataset.manual||"0")||0)+amount
          // SK-Zähler im Zielbereich erhöhen
          const zielBereich = p.closest(".bereich")
          if(zielBereich && skToMove){
            zielBereich._skCounts = zielBereich._skCounts||{SK1:0,SK2:0,SK3:0,SK4:0}
            zielBereich._skCounts[skToMove] = (zielBereich._skCounts[skToMove]||0)+amount
            updateSkButtons(zielBereich)
          }
        }
      })
      logEvent("Patienten umverteilt"+(skToMove?" ("+skToMove+")":"")+" -> "+action+": "+amount)
    }
  }else{
    let current=parseInt(currentPatientBox.innerText)||0
    if(action==="remove"||action==="RUECK"){
      let nv=Math.max(0,current-amount)
      if(nv===0){ currentPatientBox.remove() }else{ currentPatientBox.innerText=nv }
      logEvent(action==="RUECK"?"Patienten Rueckfuehrung vom Fahrzeug: "+amount:"Patienten vom Fahrzeug entfernt: "+amount)
    }else if(action==="EVAK"||action==="21"||action==="22"||action==="TRANSPORT"){
      if(current<amount) return
      currentPatientBox.innerText=current-amount
      if((parseInt(currentPatientBox.innerText)||0)===0) currentPatientBox.remove()
      // SK vom Fahrzeug-Quellbereich in Zielbereich übertragen
      const vehBereich=currentPatientBox.closest(".bereich")
      const skMove=currentSichtung||null
      document.querySelectorAll(".patients").forEach(p=>{
        if(p.dataset.unit===action){
          p.dataset.manual=(parseInt(p.dataset.manual||"0")||0)+amount
          // SK-Zähler im Zielbereich erhöhen
          if(skMove){
            const ziel=p.closest(".bereich")
            if(ziel){ ziel._skCounts=ziel._skCounts||{SK1:0,SK2:0,SK3:0,SK4:0}; ziel._skCounts[skMove]=(ziel._skCounts[skMove]||0)+amount; updateSkButtons(ziel) }
          }
        }
      })
      if(vehBereich&&skMove&&vehBereich._skCounts){
        vehBereich._skCounts[skMove]=Math.max(0,(vehBereich._skCounts[skMove]||0)-amount)
        updateSkButtons(vehBereich)
      }
      logEvent("Patienten vom Fahrzeug umverteilt"+(skMove?" ("+skMove+")":"")+" -> "+action+": "+amount)
    }
  }
  updatePatients(); closePopup(); saveState()
}
function openPatientMenu(){
  const zufahrtBox=document.querySelector('.patients[data-unit="ZUFAHRT"]')
  currentPatientBox=zufahrtBox
  document.getElementById("patientInput").value=""
  closePopup()
  document.getElementById("patientPopup").style.display="flex"
}
function toggleVehicleSelect(){
  let box=document.getElementById("vehicleSelectBox")
  box.style.display=box.style.display==="none"?"block":"none"
  let select=document.getElementById("vehicleSelect")
  select.innerHTML=""
  document.querySelectorAll(".vehicle").forEach(v=>{
    let name=v.children[2]?.innerText||v.children[1]?.innerText||"Fahrzeug"
    let option=document.createElement("option")
    option.value=v.dataset.id; option.text=name
    select.appendChild(option)
  })
}
function assignPatientsToVehicle(){
  let amount=parseInt(document.getElementById("patientInput").value)
  if(!amount||!currentPatientBox) return
  if(!currentPatientBox.classList.contains("patBadge")){
    let cm=parseInt(currentPatientBox.dataset.manual||"0")||0
    if(cm<amount) return
    currentPatientBox.dataset.manual=cm-amount
  }else{
    let c=parseInt(currentPatientBox.innerText)||0
    if(c<amount) return
    let nv=c-amount
    if(nv===0){ currentPatientBox.remove() }else{ currentPatientBox.innerText=nv }
  }
  let id=document.getElementById("vehicleSelect").value
  let vehicle=document.querySelector('[data-id="'+id+'"]')
  if(!vehicle) return
  let badge=vehicle.querySelector(".patBadge")
  if(!badge){
    badge=document.createElement("div")
    badge.className="patBadge"
    badge.onclick=(e)=>{ e.stopPropagation(); currentPatientBox=badge; document.getElementById("patientInput").value=""; document.getElementById("patientPopup").style.display="flex" }
    vehicle.appendChild(badge)
  }
  badge.innerText=(parseInt(badge.innerText)||0)+amount
  logEvent("Patienten auf Fahrzeug "+(vehicle.children[2]?.innerText||"Fahrzeug")+": "+amount)
  updatePatients(); closePopup(); saveState()
}
function updatePatients(){
  document.querySelectorAll(".patients").forEach(field=>{
    let manual=parseInt(field.dataset.manual||"0")||0
    let vehicleTotal=0
    let unit=field.dataset.unit
    if(unit==="ZUFAHRT"){
      document.querySelectorAll("#zufahrt .vehicle").forEach(v=>{ let b=v.querySelector(".patBadge"); if(b) vehicleTotal+=parseInt(b.innerText)||0 })
    }else{
      field.parentElement.querySelectorAll(".vehicle").forEach(v=>{ let b=v.querySelector(".patBadge"); if(b) vehicleTotal+=parseInt(b.innerText)||0 })
    }
    let total=manual+vehicleTotal
    field.innerText=total
    if(unit==="ZUFAHRT") field.style.display=total===0?"none":"block"
  })
  updateDashboard()
}

/* =========================================================
   SCHNELL-SICHTUNG
========================================================= */
function schnellSichtung(bereich, sk, delta){
  delta = delta||1
  const field=bereich.querySelector(".patients")
  if(!field) return
  // Nicht unter 0
  const prevManual=parseInt(field.dataset.manual||"0")||0
  if(delta<0 && prevManual<=0) return
  field.dataset.manual=Math.max(0,prevManual+delta)
  sichtungCounts[sk]=Math.max(0,(sichtungCounts[sk]||0)+delta)
  bereich._skCounts=bereich._skCounts||{SK1:0,SK2:0,SK3:0,SK4:0}
  bereich._skCounts[sk]=Math.max(0,(bereich._skCounts[sk]||0)+delta)
  updateSkButtons(bereich)
  updatePatients()
  logEvent("Schnell-SK: "+(delta>0?"+":"")+delta+" "+sk+" in "+(bereich.querySelector(".bheader,.abschnittName")?.innerText||"Bereich"))
  saveState()
}
function updateSkButtons(bereich){
  const counts=bereich._skCounts||{SK1:0,SK2:0,SK3:0,SK4:0}
  bereich.querySelectorAll(".sk-btn").forEach(btn=>{
    const n=counts[btn.dataset.sk]||0
    btn.innerHTML=n>0?"<b>"+n+"</b>":"&nbsp;"
    btn.classList.toggle("has-count",n>0)
  })
}
function addSkButtons(bereich){
  if(bereich.querySelector(".sk-buttons")) return
  // SK-Buttons
  const skDiv=document.createElement("div")
  skDiv.className="sk-buttons"
  const skBtns=[
    {cls:"sk1",sk:"SK1",title:"SK1 Rot (Klick +1, Rechtsklick -1)"},
    {cls:"sk2",sk:"SK2",title:"SK2 Gelb (Klick +1, Rechtsklick -1)"},
    {cls:"sk3",sk:"SK3",title:"SK3 Grün (Klick +1, Rechtsklick -1)"},
    {cls:"sk4",sk:"SK4",title:"SK4 Schwarz (Klick +1, Rechtsklick -1)"},
  ]
  skDiv.innerHTML=skBtns.map(b=>`<button class="sk-btn ${b.cls}" title="${b.title}" data-sk="${b.sk}" data-lbl="">&nbsp;</button>`).join("")
  skDiv.querySelectorAll(".sk-btn").forEach(btn=>{
    btn.addEventListener("click",e=>{ e.stopPropagation(); schnellSichtung(btn.closest(".bereich"),btn.dataset.sk,1) })
    btn.addEventListener("contextmenu",e=>{ e.preventDefault(); e.stopPropagation(); schnellSichtung(btn.closest(".bereich"),btn.dataset.sk,-1) })
  })
  bereich.appendChild(skDiv)
  // Demografie-Buttons
  const demDiv=document.createElement("div")
  demDiv.className="dem-buttons"
  const demBtns=[
    {cls:"dem-me",key:"me",title:"♂ Erw (Klick +1, Rechtsklick -1)"},
    {cls:"dem-we",key:"we",title:"♀ Erw (Klick +1, Rechtsklick -1)"},
    {cls:"dem-mk",key:"mk",title:"♂ Kind (Klick +1, Rechtsklick -1)"},
    {cls:"dem-wk",key:"wk",title:"♀ Kind (Klick +1, Rechtsklick -1)"},
  ]
  demDiv.innerHTML=demBtns.map(b=>`<button class="dem-btn ${b.cls}" title="${b.title}" data-dem="${b.key}">&nbsp;</button>`).join("")
  demDiv.querySelectorAll(".dem-btn").forEach(btn=>{
    btn.addEventListener("click",e=>{ e.stopPropagation(); schnellDemografie(btn.closest(".bereich"),btn.dataset.dem,1) })
    btn.addEventListener("contextmenu",e=>{ e.preventDefault(); e.stopPropagation(); schnellDemografie(btn.closest(".bereich"),btn.dataset.dem,-1) })
  })
  bereich.appendChild(demDiv)
}

function schnellDemografie(bereich, key, delta){
  if(!bereich) return
  bereich._demCounts = bereich._demCounts||{me:0,we:0,mk:0,wk:0}
  bereich._demCounts[key] = Math.max(0,(bereich._demCounts[key]||0)+delta)
  updateDemButtons(bereich)
  saveState()
}

function updateDemButtons(bereich){
  const c=bereich._demCounts||{me:0,we:0,mk:0,wk:0}
  const labels={me:"♂E",we:"♀E",mk:"♂K",wk:"♀K"}
  bereich.querySelectorAll(".dem-btn").forEach(btn=>{
    const n=c[btn.dataset.dem]||0
    btn.innerHTML=n>0?"<b>"+n+"</b>":"&nbsp;"
    btn.title=labels[btn.dataset.dem]+" (Klick +1, Rechtsklick -1)"
    btn.classList.toggle("has-count",n>0)
  })
}
function sichtungKorrigieren(bereich,alteSK,neueSK){
  if(alteSK===neueSK) return
  if(alteSK&&sichtungCounts[alteSK]>0) sichtungCounts[alteSK]--
  sichtungCounts[neueSK]=(sichtungCounts[neueSK]||0)+1
  updatePatients()
  logEvent("SK korrigiert: "+alteSK+" → "+neueSK)
  saveState()
}

/* SICHERHEIT: Fahrzeuge/FK bei Bereich-Loeschen zurueck in Zufahrt */
function retteZuZufahrt(bereich){
  const zufahrt = document.getElementById("zufahrt")
  if(!zufahrt) return
  const items = bereich.querySelectorAll(".vehicle, .fuehrungskraft")
  if(items.length === 0) return
  items.forEach(item => {
    const name = item.classList.contains("fuehrungskraft")
      ? (item.querySelector(".fkTyp")?.innerText || "FK")
      : (item.children[2]?.innerText || "Fahrzeug")
    zufahrt.appendChild(item)
    logEvent(name + " -> Zufahrt gerettet")
  })
  sortVehicles(zufahrt)
  updatePatients()
}

function sortVehicles(container){
  let items = [...container.querySelectorAll(".vehicle, .fuehrungskraft")]
  items.sort((a, b) => {
    const aFK = a.classList.contains("fuehrungskraft") ? 0 : 1
    const bFK = b.classList.contains("fuehrungskraft") ? 0 : 1
    if(aFK !== bFK) return aFK - bFK
    const nA = (a.querySelector(".fkTyp") || a.children[2])?.innerText || ""
    const nB = (b.querySelector(".fkTyp") || b.children[2])?.innerText || ""
    return nA.localeCompare(nB)
  })
  items.forEach(v => container.appendChild(v))
}

/* DASHBOARD */
function updateDashboard(){
  const rtw=document.querySelectorAll(".vehicle.RTW").length
  const ktw=document.querySelectorAll(".vehicle.KTW").length
  const nef=document.querySelectorAll(".vehicle.NEF").length
  const fisu=document.querySelectorAll(".vehicle.FISU").length
  const nah=document.querySelectorAll(".vehicle.NAH").length
  const totalVehicles=document.querySelectorAll(".vehicle").length

  // Alarmstufe Banner – nutzt das fest im HTML verankerte Element
  const banner = document.getElementById("alarmBanner")
  if(banner){
    if(aktiveAlarmstufe !== null && alarmstufen[aktiveAlarmstufe]){
      const stufe = alarmstufen[aktiveAlarmstufe]
      banner.style.display = "block"
      banner.innerHTML = "&#9889; ALARMSTUFE "+(aktiveAlarmstufe+1)+" – "+(stufe.titel || "Alarmstufe "+(aktiveAlarmstufe+1))
    } else {
      banner.style.display = "none"
    }
  }

  let vEl=document.getElementById("dashVehicles")
  let vContent=vEl.querySelector(".dashVehiclesContent")
  if(!vContent){ vContent=document.createElement("div"); vContent.className="dashVehiclesContent"; vEl.appendChild(vContent) }
  const totalFK = document.querySelectorAll(".fuehrungskraft").length
  vContent.innerHTML="RTW: "+rtw+"<br>KTW: "+ktw+"<br>NEF: "+nef+"<br>FISU: "+fisu+"<br>NAH: "+nah+"<br>Fzg. Gesamt: <strong>"+totalVehicles+"</strong><br>FK Einheiten: <strong>"+totalFK+"</strong>"

  function vu(unit){ const b=document.querySelector('[data-unit="'+unit+'"]'); return b?b.parentElement.querySelectorAll(".vehicle").length:0 }
  let segRows="<b>Fzg. nach Bereich</b><br>SEG-21: "+vu("21")+"<br>SEG-22: "+vu("22")+"<br>EVAK: "+vu("EVAK")+"<br>Transport: "+vu("TRANSPORT")
  document.querySelectorAll("#halteplaetze .bereich").forEach(hp=>{
    const label=hp.querySelector(".bheader")?.innerText||"HP"
    segRows+="<br>"+label+": "+hp.querySelectorAll(".vehicle").length
  })
  document.querySelectorAll("#abschnitteContainer .abschnitt").forEach(ab=>{
    const label=ab.querySelector("[contenteditable]")?.innerText||"Abschnitt"
    segRows+="<br>"+label+": "+ab.querySelectorAll(".vehicle, .fuehrungskraft").length
  })
  document.getElementById("dashSEG").innerHTML=segRows

  function pu(unit){ const el=document.querySelector('[data-unit="'+unit+'"]'); return el?(parseInt(el.innerText)||0):null }
  let patRows="<b>Patienten</b><br>Gesamt: <strong>"+totalPatients+"</strong>"
  const pPSS=pu("PSS"); if(pPSS!==null) patRows+="<br>PSS: "+pPSS
  const pVor=pu("VORSICHT"); if(pVor!==null) patRows+="<br>Vorsichtung: "+pVor
  const pBER=pu("BER"); if(pBER!==null) patRows+="<br>BER: "+pBER
  patRows+="<br>SEG-21: "+(pu("21")??0)+"<br>SEG-22: "+(pu("22")??0)+"<br>EVAK: "+(pu("EVAK")??0)+"<br>Transport: "+(pu("TRANSPORT")??0)
  patRows+='<br><span class="dash-sk1">SK1: '+sichtungCounts.SK1+'</span>'
  patRows+='<br><span class="dash-sk2">SK2: '+sichtungCounts.SK2+'</span>'
  patRows+='<br><span class="dash-sk3">SK3: '+sichtungCounts.SK3+'</span>'
  patRows+='<br><span class="dash-sk4">SK4: '+sichtungCounts.SK4+'</span>'
  // Demografie-Summe aus allen Bereichen
  let totMe=0,totWe=0,totMk=0,totWk=0
  document.querySelectorAll(".bereich").forEach(b=>{
    if(b._demCounts){
      totMe+=b._demCounts.me||0; totWe+=b._demCounts.we||0
      totMk+=b._demCounts.mk||0; totWk+=b._demCounts.wk||0
    }
  })
  const hasDem=totMe||totWe||totMk||totWk
  if(hasDem) patRows+='<br><span style="color:var(--text-dim);font-size:11px">♂E:'+totMe+' ♀E:'+totWe+' ♂K:'+totMk+' ♀K:'+totWk+'</span>'
  document.getElementById("dashPatients").innerHTML=patRows
  syncToFirebase()
}


/* =========================================================
   FIREBASE LIVE-SYNC
   Schreibt bei jeder Änderung die Dashboard-Daten ins Firebase.
   FIREBASE_CONFIG wird vom Benutzer einmalig eingetragen.
========================================================= */

// Diese Zeile einmalig mit deinen Firebase-Daten befüllen (siehe Anleitung)
const FIREBASE_URL = "https://seg-10-dashboard-default-rtdb.europe-west1.firebasedatabase.app"

function syncToFirebase(){
  if(!FIREBASE_URL) return // Kein Firebase konfiguriert

  const rtw  = document.querySelectorAll(".vehicle.RTW").length
  const ktw  = document.querySelectorAll(".vehicle.KTW").length
  const nef  = document.querySelectorAll(".vehicle.NEF").length
  const fisu = document.querySelectorAll(".vehicle.FISU").length
  const nah  = document.querySelectorAll(".vehicle.NAH").length
  const fk   = document.querySelectorAll(".fuehrungskraft").length

  function pu(unit){ const el=document.querySelector('[data-unit="'+unit+'"]'); return el?(parseInt(el.innerText)||0):0 }

  // Bereiche sammeln
  const bereiche = []
  document.querySelectorAll("#halteplaetze .bereich").forEach(hp=>{
    bereiche.push({ name: hp.querySelector(".bheader")?.innerText||"HP", fzg: hp.querySelectorAll(".vehicle").length })
  })
  document.querySelectorAll("#abschnitteContainer .abschnitt").forEach(ab=>{
    const name = ab.querySelector(".abschnittName")?.value || "Abschnitt"
    bereiche.push({ name, fzg: ab.querySelectorAll(".vehicle, .fuehrungskraft").length })
  })

  const alarmstufeText = (aktiveAlarmstufe !== null && alarmstufen[aktiveAlarmstufe])
    ? "ALARMSTUFE " + (aktiveAlarmstufe+1) + " – " + alarmstufen[aktiveAlarmstufe].titel
    : ""

  const data = {
    ts: new Date().toISOString(),
    alarm: alarmstufeText,
    fahrzeuge: { rtw, ktw, nef, fisu, nah, gesamt: rtw+ktw+nef+fisu+nah, fk },
    patienten: {
      gesamt: totalPatients,
      sk1: sichtungCounts.SK1, sk2: sichtungCounts.SK2,
      sk3: sichtungCounts.SK3, sk4: sichtungCounts.SK4,
      pss: pu("PSS"), vorsichtung: pu("VORSICHT"), ber: pu("BER"),
      seg21: pu("21"), seg22: pu("22"), evak: pu("EVAK"), transport: pu("TRANSPORT")
    },
    bereiche,
    segVorOrt: [...document.querySelectorAll(".seg.active")].map(b => b.innerText.trim()),
    einsatzAktiv,
    timer: document.getElementById("timer")?.innerText || "00:00:00"
  }

  fetch(FIREBASE_URL + "/dashboard.json", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  }).catch(()=>{}) // Fehler still ignorieren – kein Popup
}

/* SAVE */
function saveState(){
  if(!einsatzAktiv||!einsatzDateiHandle) return
  let data={
    timestamp: new Date().toISOString(),
    einsatzStartZeit: einsatzStartZeit, // Timer-Startzeit mitspeichern
    log: eventLog,
    tagebuch: tagebuch,
    demografieLog: demografieLog,
    theme: document.documentElement.getAttribute("data-theme")||"light",
    sichtungCounts
  }
  saveAlarmstufen(); data.alarmstufen=alarmstufen; data.html=document.body.innerHTML
  writeFile(data)
  // Backup in Firebase – inkl. HTML und Startzeit
  if(FIREBASE_URL){
    fetch(FIREBASE_URL + "/backup.json", {
      method:"PUT",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(data)
    }).catch(()=>{})
  }
}
async function writeFile(data){
  try{
    const writable=await einsatzDateiHandle.createWritable()
    await writable.write(JSON.stringify(data,null,2))
    await writable.close()
    letzterAutosave=new Date(); updateAutosaveIndicator()
  }catch(err){ console.error("Autosave Fehler",err) }
}
function updateAutosaveIndicator(){
  const el=document.getElementById("autosaveIndicator")
  if(!el) return
  el.textContent="Autosave "+(letzterAutosave?letzterAutosave.toLocaleTimeString():"--:--")
}

/* EINSATZ */
async function startEinsatz(){
  try{
    const fh=await window.showSaveFilePicker({ suggestedName:"einsatz_"+new Date().toISOString().slice(0,16).replace("T","_").replace(":","-")+".json", types:[{description:"JSON",accept:{"application/json":[".json"]}}] })
    einsatzDateiHandle=fh; einsatzAktiv=true
    logEvent("Einsatz gestartet"); startTimer()
    autosaveTimer=setInterval(()=>saveState(),30000)
  }catch(err){ console.log("Speichern abgebrochen") }
}
function endEinsatz(){
  if(!confirm("Einsatz wirklich beenden?")) return
  logEvent("Einsatz beendet"); saveState(); clearInterval(autosaveTimer); stopTimer(); einsatzAktiv=false
}

/* =========================================================
   EINSATZ WIEDERHERSTELLEN
========================================================= */

// Option 1: Aus lokaler JSON-Datei
async function einsatzAusDateiLaden(){
  try {
    const [fh] = await window.showOpenFilePicker({
      types:[{description:"JSON Einsatzdatei",accept:{"application/json":[".json"]}}]
    })
    const file = await fh.getFile()
    const text = await file.text()
    const data = JSON.parse(text)

    if(!data.html){
      alert("Keine gültige Einsatzdatei.")
      return
    }

    if(!confirm("Einsatz aus Datei wiederherstellen?\nAktuelle Ansicht wird überschrieben.")) return

    // HTML wiederherstellen
    document.body.innerHTML = data.html

    // State wiederherstellen
    if(data.sichtungCounts) sichtungCounts = data.sichtungCounts
    if(data.alarmstufen)    alarmstufen    = data.alarmstufen
    if(data.log)            eventLog       = data.log
    if(data.tagebuch)       { tagebuch = data.tagebuch; const el=document.getElementById("tagebuchLetzter"); if(el&&tagebuch.length) el.textContent=tagebuch[tagebuch.length-1] }
    if(data.theme)          document.documentElement.setAttribute("data-theme", data.theme)

    // Speicherdatei – neuen Handle anlegen (alte Datei kann nicht direkt wiederverwendet werden)
    const neuFh = await window.showSaveFilePicker({
      suggestedName: fh.name,
      types:[{description:"JSON",accept:{"application/json":[".json"]}}]
    })
    einsatzDateiHandle = neuFh
    einsatzAktiv = true

    // Neu initialisieren
    initDrag(); initSEG(); initPatients(); initShortcuts()
    updatePatients(); updateDashboard()
    startTimer(data.einsatzStartZeit || null)
    autosaveTimer = setInterval(()=>saveState(), 30000)

    logEvent("Einsatz aus Datei wiederhergestellt")
    saveState()

  } catch(err){
    if(err.name !== "AbortError") alert("Fehler beim Laden: " + err.message)
  }
}

// Option 2: Aus Firebase (letzter gespeicherter Stand)
async function einsatzAusFirebaseWiederherstellen(){
  if(!FIREBASE_URL){
    alert("Keine Firebase URL konfiguriert.")
    return
  }
  try {
    const res = await fetch(FIREBASE_URL + "/backup.json?t=" + Date.now())
    if(!res.ok) throw new Error("Keine Verbindung")
    const data = await res.json()

    if(!data || !data.html){
      alert("Kein Backup in Firebase gefunden.")
      return
    }

    const ts = data.timestamp ? new Date(data.timestamp).toLocaleString("de-AT") : "unbekannt"
    if(!confirm("Letzter Stand: " + ts + "\nEinsatz aus Firebase wiederherstellen?")) return

    document.body.innerHTML = data.html
    if(data.sichtungCounts) sichtungCounts = data.sichtungCounts
    if(data.alarmstufen)    alarmstufen    = data.alarmstufen
    if(data.log)            eventLog       = data.log
    if(data.theme)          document.documentElement.setAttribute("data-theme", data.theme)

    // Neues lokales Speicherziel wählen
    const fh = await window.showSaveFilePicker({
      suggestedName: "einsatz_wiederhergestellt_" + new Date().toISOString().slice(0,10) + ".json",
      types:[{description:"JSON",accept:{"application/json":[".json"]}}]
    })
    einsatzDateiHandle = fh
    einsatzAktiv = true

    initDrag(); initSEG(); initPatients(); initShortcuts()
    updatePatients(); updateDashboard()
    startTimer(data.einsatzStartZeit || null)
    autosaveTimer = setInterval(()=>saveState(), 30000)

    logEvent("Einsatz aus Firebase wiederhergestellt")
    saveState()

  } catch(err){
    if(err.name !== "AbortError") alert("Fehler: " + err.message)
  }
}
function startTimer(startZeit){
  if(timerInterval) clearInterval(timerInterval)
  // Wenn startZeit übergeben wird (Wiederherstellung) – dort weiterlaufen
  einsatzStartZeit = startZeit || Date.now()
  timerInterval=setInterval(()=>{
    let diff=Date.now()-einsatzStartZeit
    let h=Math.floor(diff/3600000),m=Math.floor(diff/60000)%60,s=Math.floor(diff/1000)%60
    const el=document.getElementById("timer")
    if(el) el.innerText=String(h).padStart(2,"0")+":"+String(m).padStart(2,"0")+":"+String(s).padStart(2,"0")
  },1000)
}
function stopTimer(){ clearInterval(timerInterval); timerInterval=null }

/* RELOAD SCHUTZ */
function initReloadProtection(){
  window.addEventListener("keydown",function(e){
    const isF5=e.key==="F5", isCtrlR=(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="r"
    if(isF5||isCtrlR){
      e.preventDefault(); e.stopPropagation()
      if(confirm("Seite wirklich neu laden?\nAlle nicht gespeicherten Daten gehen verloren!")){
        window.removeEventListener("keydown",arguments.callee); window.location.reload()
      }
    }
  },true)
  window.addEventListener("beforeunload",function(e){ e.preventDefault(); e.returnValue="Seite verlassen?" })
}

function logEvent(text){ eventLog.push(new Date().toLocaleTimeString()+" | "+text) }

/* =========================================================
   EINSATZTAGEBUCH
========================================================= */
let tagebuch = []

function tagebuchSenden(){
  const inp = document.getElementById("tagebuchInput")
  const text = inp?.value?.trim()
  if(!text) return

  const time = new Date().toLocaleTimeString()
  const eintrag = time + "  |  " + text

  tagebuch.push(eintrag)

  const el = document.getElementById("tagebuchLetzter")
  if(el) el.textContent = eintrag

  inp.value = ""
  logEvent("Tagebuch: " + text)
  try{ localStorage.setItem("tagebuch", JSON.stringify(tagebuch)) }catch{}
  saveState()
}

document.addEventListener("DOMContentLoaded", ()=>{
  document.getElementById("tagebuchInput")?.addEventListener("keydown", e=>{
    if(e.key === "Enter"){ e.preventDefault(); tagebuchSenden() }
  })
  try{
    const saved=localStorage.getItem("tagebuch")
    if(saved){ tagebuch=JSON.parse(saved); const el=document.getElementById("tagebuchLetzter"); if(el&&tagebuch.length) el.textContent=tagebuch[tagebuch.length-1] }
  }catch{}
})

/* THEME */
function toggleTheme(){
  const html=document.documentElement
  const isLight=html.getAttribute("data-theme")==="light"
  html.setAttribute("data-theme",isLight?"dark":"light")
  const btn=document.getElementById("themeBtn")
  if(btn) btn.textContent=isLight?"\u2600":"\uD83C\uDF19"
  saveState()
}

/* SICHTUNG */
function setSichtung(cat){
  currentSichtung=(currentSichtung===cat)?null:cat
  document.querySelectorAll(".sichtBtn").forEach(b=>b.classList.remove("selected"))
  const label=document.getElementById("sichtungLabel")
  if(currentSichtung){
    const btn=document.querySelector(".sichtBtn."+cat.toLowerCase())
    if(btn) btn.classList.add("selected")
    label.textContent=cat; label.className="sichtungLabel "+cat
  }else{ label.textContent="\u2013"; label.className="sichtungLabel" }
}
function resetSichtungUI(){
  currentSichtung=null
  document.querySelectorAll(".sichtBtn").forEach(b=>b.classList.remove("selected"))
  const label=document.getElementById("sichtungLabel")
  if(label){ label.textContent="\u2013"; label.className="sichtungLabel" }
}
function sichtungSetzen(){
  if(!currentSichtung){ alert("Bitte zuerst eine Sichtungskategorie auswaehlen."); return }
  if(!currentPatientBox){ closePopup(); return }
  const inputAmount=parseInt(document.getElementById("patientInput").value)
  const bestand=parseInt(currentPatientBox.innerText)||0
  const zuweisung=(!isNaN(inputAmount)&&inputAmount>0)?Math.min(inputAmount,bestand):bestand
  if(zuweisung<=0){ alert("Keine Patienten vorhanden."); return }
  sichtungCounts[currentSichtung]=(sichtungCounts[currentSichtung]||0)+zuweisung
  logEvent("Sichtung zugewiesen: "+zuweisung+" Pat. -> "+currentSichtung)
  updatePatients(); closePopup(); saveState()
}

/* ALARMSTUFEN – fix 5 Stufen, vorbelegt aus GSM-DFB */
if(alarmstufen.length < 5){
  alarmstufen = [
    {
      titel: "A1 – Kleinlage",
      text: "RESSOURCEN:\n\u2022 SEG-3 (ersatzweise SEG-1)\n\u2022 SEG-10\n\u2022 SEG-21 oder SEG-22\n\u2022 2\u00d7 RTW\n\nFUNKKANAL: BRW-KAT-1\n\nEINSATZTAKTIK: Ein RTW als Bergebereitschaft/PSS, zweiter RTW im SEG-Bus. Geh\u00e4hige Patienten prim\u00e4r im SEG-Bus. SEG-10 als F\u00fchrungsunterst\u00fctzung.\n\nAUSRUFUNG gem\u00e4\u00df AO oder durch EL-RD auch auf Anfahrt."
    },
    {
      titel: "A2 – Mittellage",
      text: "RESSOURCEN:\n\u2022 SEG-1 (ersatzweise SEG-3), SEG-10\n\u2022 SEG-21 oder SEG-22, SEG-EVAK\n\u2022 MLS-Wien, ZTR-OA, SAN-Team HIO\n\u2022 2\u00d7 RTW, 2\u00d7 N-KTW, 1\u00d7 NEF\n\nFUNKKANAL: BRW-KAT-1\n\nMASSNAHMEN:\n\u2713 Gro\u00dfschadensprotokoll im Berufsrettungsportal\n\u2713 Vorverst\u00e4ndigung WIGEV Journaldienst\n\u2713 Alarmierung SAN-Team HIO\n\nEINSATZABSCHNITTE:\n1. Intervention (ZGKDT)\n2. Behandlung (erfahrene F\u00fchrungskraft)\n3. Transport (MLS Wien / QM Leitstelle)"
    },
    {
      titel: "A3 – Gro\u00dflage / MANV",
      text: "RESSOURCEN: SEG-1, SEG-3, SEG-10, SEG-21+22, SEG-EVAK, SEG-11+12, MLS-Wien, ZTR-OA, mind. 1\u00d7 FISU + RTW/N-KTW/NEF je MANV\n\nBHP-KAPAZIT\u00c4TEN:\n\u2022 SEG-21/22: je 25 Pl\u00e4tze (15\u00d7 SK3, 10\u00d7 SK1/SK2)\n\u2022 SEG-11/12: je 10 Pl\u00e4tze (SK1/SK2)\n\nMANV-STICHWORT (SK1+SK2):\nMANV-10: 5 RTW/NKTW, 2 NEF\nMANV-20: 9 RTW/NKTW, 3 NEF\nMANV-30: 13 RTW/NKTW, 4 NEF\nMANV-40: 17 RTW/NKTW, 5 NEF\nMANV-50: 21 RTW/NKTW, 6 NEF\nMANV-60: 25 RTW/NKTW, 7 NEF\n\nMASSNAHMEN: Gro\u00dfschadensprotokoll, Bettenabsprache SOP LS-33, Info Kommando MA70+MD-OS, Anforderung Transportressourcen SAN-Team HIO"
    },
    {
      titel: "A4 – \u00dcbergro\u00dflage",
      text: "AKTIVIERUNG wenn MA70-Behandlungskapazit\u00e4ten nicht ausreichen.\n\nZUS\u00c4TZLICHE BHP:\n\u2022 BF Wien AB Erg\u00e4nzungsmaterial (2\u00d7 MT-40, Wache Leopoldstadt)\n\u2022 Bis zu 5\u00d7 BHP 25 privater Rettungsorg. (je in 30-Min-Intervallen)\n\nMANV-STICHWORT A4:\nMANV-70: 29 RTW/NKTW, 8 NEF\nMANV-80: 33 RTW/NKTW, 9 NEF\nMANV-90: 37 RTW/NKTW, 10 NEF\nMANV-100: 41 RTW/NKTW, 11 NEF\nMANV-110: 45 RTW/NKTW, 12 NEF\n\nMASSNAHMEN: KTD auf Minimum, Ressourcen anderer Bundesl\u00e4nder, Nachbesetzung alle MA70-Ressourcen, Einberufung Einsatzstab MA70"
    },
    {
      titel: "A5 – Sonderlage / Dauerlage",
      text: "AKTIVIERUNG: Nur durch RDL oder Stellvertreter.\nF\u00fcr Eins\u00e4tze > 24h oder Sonderlagen mit erweiterter F\u00fchrungsstruktur.\n\nBESONDERHEITEN:\n\u2022 Einsatzf\u00fchrung aus dem Einsatzstab MA70 (nicht von vorne)\n\u2022 Gesamteinsatzleitung: RDL oder Beauftragter\n\u2022 Voller Zugriff auf alle Hilfseinheiten privater Org.\n\u2022 Ma\u00dfnahmen individuell zugeschnitten + dokumentieren\n\nKOMMUNIKATION:\nBRW-KAT-1 (bzw. KAT-2 bei Paralleleinsatz)\nSonderlagen SEG-Disponent: BRW-KAT-3"
    }
  ]
}

function openAlarmstufen(){
  saveAlarmstufen()
  renderAlarmstufen()
  switchAlarmTab("info")
  document.getElementById("alarmPopup").style.display="flex"
}
function closeAlarmPopup(){
  saveAlarmstufen()
  document.getElementById("alarmPopup").style.display="none"
  saveState()
}

function saveAlarmstufen(){
  const stufen=document.querySelectorAll(".alarmStufe")
  stufen.forEach((s,i)=>{
    if(alarmstufen[i]){
      alarmstufen[i].titel = s.querySelector(".alarmTitel").value
      alarmstufen[i].text  = s.querySelector("textarea").value
    }
  })
}

function renderAlarmstufen(){
  const c=document.getElementById("alarmStufen"); if(!c) return
  c.innerHTML=""
  alarmstufen.forEach((stufe,i)=>{
    const div=document.createElement("div")
    div.className="alarmStufe"
    div.innerHTML=`
      <div style="font-size:var(--fs-xs,11px);font-weight:700;letter-spacing:2px;color:var(--accent-red);margin-bottom:5px;text-transform:uppercase">Stufe ${i+1}</div>
      <input class="alarmTitel" placeholder="Bezeichnung (z.B. Kleinlage)" value="${stufe.titel.replace(/"/g,'&quot;')}">
      <textarea placeholder="Kräfte und Maßnahmen…&#10;z.B. SEG-10, 3× RTW, 1× NEF">${stufe.text}</textarea>
    `
    c.appendChild(div)
  })
}

function switchAlarmTab(tab){
  document.querySelectorAll(".alarmTab").forEach(b=>b.classList.remove("active"))
  document.getElementById("alarmTabInfo").style.display  = tab==="info"  ? "" : "none"
  document.getElementById("alarmTabAktiv").style.display = tab==="aktiv" ? "" : "none"
  if(tab==="info"){
    document.querySelectorAll(".alarmTab")[0].classList.add("active")
  }else{
    saveAlarmstufen()
    document.querySelectorAll(".alarmTab")[1].classList.add("active")
    renderAlarmAuswahl()
  }
}

function renderAlarmAuswahl(){
  const c=document.getElementById("alarmAuswahl"); if(!c) return
  c.innerHTML=""
  alarmstufen.forEach((stufe,i)=>{
    const btn=document.createElement("button")
    btn.className="alarmWahlBtn"+(aktiveAlarmstufe===i?" aktiv":"")
    btn.innerHTML=`<div class="wahlTitel">Stufe ${i+1} – ${stufe.titel||"Alarmstufe "+(i+1)}</div>${stufe.text?`<div class="wahlText">${stufe.text}</div>`:""}`
    btn.onclick=()=>{
      aktiveAlarmstufe=(aktiveAlarmstufe===i)?null:i
      renderAlarmAuswahl()
      updateDashboard()
      logEvent(aktiveAlarmstufe!==null
        ?"Alarmstufe aktiviert: Stufe "+(i+1)+" – "+(stufe.titel||"")
        :"Alarmstufe aufgehoben")
      saveState()
    }
    c.appendChild(btn)
  })
}

function alarmStufeDeaktivieren(){
  aktiveAlarmstufe=null
  renderAlarmAuswahl()
  updateDashboard()
  logEvent("Alarmstufe aufgehoben")
  saveState()
}

/* FAHRZEUGHISTORIE */
function openFahrzeugHistorie(){
  const liste=document.getElementById("fahrzeugHistorieListe"); if(!liste) return
  const fahrzeuge=[]
  document.querySelectorAll(".vehicle").forEach(v=>{
    const id=v.dataset.id,type=v.children[1]?.innerText||"",name=v.children[2]?.innerText||"",aktiv=v.classList.contains("active")
    const bereichHeader=v.closest(".bereich")?.querySelector(".bheader")?.innerText||(v.closest("#zufahrt")?"Zufahrt":"–")
    const aufTransport=v.closest(".bereich.blue")!==null
    const log=fahrzeugLog[id]||{}
    fahrzeuge.push({id,type,name,aktiv,bereichHeader,aufTransport,erstellt:log.zeit||"–",eingetroffen:log.eingetroffen||null})
  })
  if(fahrzeuge.length===0){ liste.innerHTML='<div style="color:var(--text-dim);font-size:13px;text-align:center;padding:16px 0;">Noch keine Fahrzeuge angelegt.</div>'; document.getElementById("fahrzeugHistoriePopup").style.display="flex"; return }
  let html='<div style="display:flex;flex-direction:column;gap:8px;max-height:55vh;overflow-y:auto;padding-right:4px;">'
  fahrzeuge.forEach(f=>{
    const farbe=f.aktiv?"var(--veh-active)":(f.aufTransport?"#888":"var(--veh-inactive)")
    const statusText=f.aktiv?"\u2705 Vor Ort \u2013 "+f.bereichHeader:(f.aufTransport?"\uD83D\uDE91 Transport \u2013 "+f.bereichHeader:"\u23F3 Noch nicht eingetroffen")
    html+='<div style="background:var(--bg-card);border:1.5px solid var(--border);border-left:4px solid '+farbe+';border-radius:7px;padding:10px 13px;"><div style="display:flex;justify-content:space-between;align-items:center;"><span style="font-family:\'Rajdhani\',sans-serif;font-size:15px;font-weight:700;color:var(--text-primary);">'+f.type+' \u00b7 '+f.name+'</span><span style="font-family:\'Share Tech Mono\',monospace;font-size:11px;color:var(--text-dim);">Angelegt: '+f.erstellt+'</span></div><div style="font-size:13px;font-weight:600;color:'+farbe+';margin-top:4px;">'+statusText+'</div>'+(f.eingetroffen?'<div style="font-size:12px;color:var(--text-dim);font-family:\'Share Tech Mono\',monospace;margin-top:2px;">Eingetroffen: '+f.eingetroffen+'</div>':'')+'</div>'
  })
  html+="</div>"; liste.innerHTML=html
  document.getElementById("fahrzeugHistoriePopup").style.display="flex"
}

/* EXPORT */
function exportEinsatz(){
  const now=new Date(),zeitstempel=now.toLocaleString("de-AT")
  let fahrzeugeRows=""
  document.querySelectorAll(".vehicle").forEach(v=>{
    const typ=v.children[1]?.innerText||"",name=v.children[2]?.innerText||"",aktiv=v.classList.contains("active")?"Eingetroffen":"Zugewiesen"
    const pats=v.querySelector(".patBadge")?.innerText||"0"
    const area=v.closest(".bereich")?.querySelector(".bheader")?.innerText||(v.closest("#zufahrt")?"Zufahrt":"–")
    fahrzeugeRows+="<tr><td>"+typ+"</td><td>"+name+"</td><td>"+aktiv+"</td><td>"+area+"</td><td>"+pats+"</td></tr>"
  })
  let funkRows=""; document.querySelectorAll("#log div").forEach(d=>{ funkRows+="<tr><td>"+d.innerText+"</td></tr>" })
  let logRows=eventLog.map(e=>"<tr><td>"+e+"</td></tr>").join("")
  const html='<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><title>Einsatzbericht SEG-10</title><style>body{font-family:Arial,sans-serif;font-size:13px;margin:30px;color:#111}h1{font-size:20px;border-bottom:3px solid #c0392b;padding-bottom:8px}h2{font-size:14px;margin-top:24px;color:#c0392b;text-transform:uppercase;letter-spacing:1px}.meta{color:#555;font-size:12px;margin-bottom:20px}table{width:100%;border-collapse:collapse;margin-bottom:16px}th{background:#c0392b;color:white;padding:6px 10px;text-align:left;font-size:12px}td{padding:5px 10px;border-bottom:1px solid #ddd}tr:nth-child(even) td{background:#f9f9f9}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}.sbox{border:1px solid #ddd;border-radius:6px;padding:10px;text-align:center}.sbox .num{font-size:28px;font-weight:bold}.sbox .lbl{font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1px}.t1 .num{color:#c0392b}.t2 .num{color:#d68910}.t3 .num{color:#1e8449}@media print{button{display:none}}</style></head><body><button onclick="window.print()" style="float:right;padding:8px 16px;background:#2563eb;color:white;border:none;border-radius:4px;cursor:pointer">Drucken</button><h1>Einsatzbericht SEG-10</h1><div class="meta">Berufsrettung Wien | '+zeitstempel+' | Patienten: <strong>'+totalPatients+'</strong></div><div class="summary"><div class="sbox"><div class="num">'+totalPatients+'</div><div class="lbl">Gesamt</div></div><div class="sbox t1"><div class="num">'+sichtungCounts.SK1+'</div><div class="lbl">SK1 Sofort</div></div><div class="sbox t2"><div class="num">'+sichtungCounts.SK2+'</div><div class="lbl">SK2 Dringend</div></div><div class="sbox t3"><div class="num">'+sichtungCounts.SK3+'</div><div class="lbl">SK3 Nicht dringend</div></div></div><h2>Fahrzeuge</h2><table><tr><th>Typ</th><th>Kennung</th><th>Status</th><th>Bereich</th><th>Patienten</th></tr>'+(fahrzeugeRows||"<tr><td colspan='5'>Keine Fahrzeuge</td></tr>")+'</table><h2>Funkprotokoll</h2><table><tr><th>Eintrag</th></tr>'+(funkRows||"<tr><td>Keine Funksprueche</td></tr>")+'</table><h2>Ereignisprotokoll</h2><table><tr><th>Eintrag</th></tr>'+(logRows||"<tr><td>Kein Log</td></tr>")+'</table></body></html>'
  const blob=new Blob([html],{type:"text/html;charset=utf-8"})
  const url=URL.createObjectURL(blob)
  const win=window.open(url,"_blank")
  if(win) win.focus()
  logEvent("Einsatz exportiert")
}

/* SHORTCUTS
   Ctrl+Shift+1-5: Fahrzeuge (Ziffern = keine Browser-Konflikte)
   Ctrl+Shift+6: Einsatz starten (Ziffer = kein AltGr-Problem)
   Ctrl+Alt+Buchstabe: restliche Aktionen (e.code = layout-unabhaengig)
   Fahrzeug-Menue offen: Tasten 1-5
*/
const SHORTCUTS=[
  // Fahrzeuge: Ctrl+Shift+Ziffer (konfliktfrei)
  {keys:"Ctrl+Shift+1", code:"Digit1", label:"RTW erstellen",             action:()=>createVehicle("RTW"),  cs:true},
  {keys:"Ctrl+Shift+2", code:"Digit2", label:"KTW erstellen",             action:()=>createVehicle("KTW"),  cs:true},
  {keys:"Ctrl+Shift+3", code:"Digit3", label:"NEF erstellen",             action:()=>createVehicle("NEF"),  cs:true},
  {keys:"Ctrl+Shift+4", code:"Digit4", label:"FISU erstellen",            action:()=>createVehicle("FISU"), cs:true},
  {keys:"Ctrl+Shift+5", code:"Digit5", label:"NAH erstellen",             action:()=>createVehicle("NAH"),  cs:true},
  // Einsatz starten: Ctrl+Shift+6 (Ziffer = kein AltGr)
  {keys:"Ctrl+Shift+6", code:"Digit6", label:"Einsatz starten",           action:()=>startEinsatz(),        cs:true},
  // Restliche: Ctrl+Alt+Buchstabe (e.code layout-unabhaengig)
  {keys:"Ctrl+Alt+E",   code:"KeyE",   label:"Einsatz beenden",           action:()=>endEinsatz()},
  {keys:"Ctrl+Alt+F",   code:"KeyF",   label:"Vollbild an/aus",           action:()=>toggleFullscreen()},
  {keys:"Ctrl+Alt+D",   code:"KeyD",   label:"Dark Mode an/aus",          action:()=>toggleTheme()},
  {keys:"Ctrl+Alt+V",   code:"KeyV",   label:"Fahrzeug-Menue oeffnen",    action:()=>openVehicleMenu()},
  {keys:"Ctrl+Alt+P",   code:"KeyP",   label:"Patienten-Menue oeffnen",   action:()=>openPatientMenu()},
  {keys:"Ctrl+Alt+A",   code:"KeyA",   label:"Alarmstufen oeffnen",       action:()=>openAlarmstufen()},
  {keys:"Ctrl+Alt+H",   code:"KeyH",   label:"Halteplatz erstellen",      action:()=>createHalteplatz()},
  {keys:"Ctrl+Alt+W",   code:"KeyW",   label:"PSS erstellen",             action:()=>createPSS()},
  {keys:"Ctrl+Alt+O",   code:"KeyO",   label:"Vorsichtung erstellen",     action:()=>createVorsichtung()},
  {keys:"Ctrl+Alt+B",   code:"KeyB",   label:"BER erstellen",             action:()=>createBER()},
  {keys:"Ctrl+Alt+X",   code:"KeyX",   label:"Abschnitt erstellen",       action:()=>createAbschnitt()},
  {keys:"Ctrl+Alt+G",   code:"KeyG",   label:"Funk - Eingabe fokussieren",action:()=>document.getElementById("funkVon")?.focus(), allowInInput:true},
  {keys:"Ctrl+Alt+K",   code:"KeyK",   label:"Shortcut-Uebersicht",       action:()=>{ const ov=document.getElementById("shortcutOverlay"); if(ov) ov.style.display="flex" }},
]

function initShortcuts(){
  window.addEventListener("keydown", function(e){

    if(e.key==="Escape"){
      closePopup()
      document.getElementById("alarmPopup").style.display="none"
      const ov=document.getElementById("shortcutOverlay"); if(ov) ov.style.display="none"
      return
    }

    const isInput = ["INPUT","TEXTAREA","SELECT"].includes(document.activeElement?.tagName)

    // Fahrzeug-Popup offen: Tasten 1-5
    if(vehicleHotkeysActive && !e.ctrlKey && !e.altKey && !e.shiftKey){
      if(e.code==="Digit1"){ e.preventDefault(); createVehicle("RTW"); return }
      if(e.code==="Digit2"){ e.preventDefault(); createVehicle("KTW"); return }
      if(e.code==="Digit3"){ e.preventDefault(); createVehicle("NEF"); return }
      if(e.code==="Digit4"){ e.preventDefault(); createVehicle("FISU"); return }
      if(e.code==="Digit5"){ e.preventDefault(); createVehicle("NAH"); return }
    }

    // Ctrl+Shift+Ziffer (Fahrzeuge + Einsatz starten)
    if(e.ctrlKey && e.shiftKey && !e.altKey){
      const sc = SHORTCUTS.find(s => s.cs && s.code === e.code)
      if(sc){
        e.preventDefault(); e.stopImmediatePropagation()
        if(!isInput) sc.action()
        return
      }
    }

    // Ctrl+Alt+Buchstabe – e.code ist layout-unabhaengig
    if(e.ctrlKey && e.altKey && !e.shiftKey){
      const sc = SHORTCUTS.find(s => !s.cs && s.code === e.code)
      if(sc){
        if(isInput && !sc.allowInInput) return
        e.preventDefault(); e.stopImmediatePropagation(); sc.action(); return
      }
    }

  }, true)
}

function renderShortcutList(){
  const el=document.getElementById("shortcutList"); if(!el) return
  el.innerHTML=SHORTCUTS.map(sc=>`<div style="display:flex;justify-content:space-between;gap:20px;padding:3px 0;border-bottom:1px solid var(--border)"><span style="color:var(--accent-blue);font-family:'Share Tech Mono',monospace;font-size:11px">${sc.keys}</span><span>${sc.label}</span></div>`).join("")
}
