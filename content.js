// Content script for the Shri Mahakaleshwar aarti booking form.
//
// The "Add Visitors Details" form renders its inputs WITHOUT id / name /
// label / placeholder (it's a React form, labels are just floating text). So
// keyword matching is useless here. Instead we match by STRUCTURE:
//
//   Number of Persons : <select> with numeric options  (skipped)
//   per visitor row   : text(Name) file(Face) select(Relationship)
//                       select(ID Proof Type) text(ID Proof No.)
//
// We drop checkbox/radio and the numeric "Number of Persons" select, then read
// the remaining controls in document order as repeating visitor rows:
//   [ Name(text), Face(file), Relationship(select), IDType(select), IDNumber(text) ]

(() => {
  if (window.__aartiAutofillLoaded) return;
  window.__aartiAutofillLoaded = true;

  const aadhaarDigits = (v) => (v || "").replace(/\D/g, "");

  // ---- value setters that satisfy React/controlled inputs ----------------
  function setValue(el, value) {
    const proto =
      el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    el.focus();
    if (setter) setter.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  function setSelect(sel, value) {
    const want = String(value || "").toLowerCase().trim();
    const opts = [...sel.options];
    let opt =
      opts.find((o) => o.value.toLowerCase().trim() === want) ||
      opts.find((o) => o.textContent.toLowerCase().trim() === want) ||
      opts.find((o) => o.textContent.toLowerCase().includes(want) && want.length > 1);
    // Aadhaar spelling variants for the ID-proof dropdown.
    if (!opt && /aadhaar|aadhar/.test(want)) {
      opt = opts.find((o) => /aadhaar|aadhar|uid/i.test(o.textContent));
    }
    // Gender: match on first letter if the option text differs (M/F).
    if (!opt && /^(male|female|other)$/.test(want)) {
      opt = opts.find((o) => o.textContent.trim().toLowerCase().startsWith(want[0]) &&
                             !/select/i.test(o.textContent));
    }
    if (!opt) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    if (setter) setter.call(sel, opt.value);
    else sel.value = opt.value;
    sel.dispatchEvent(new Event("input", { bubbles: true }));
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  // ---- structural detection ---------------------------------------------
  // A select whose options are all numbers (or a "Select" placeholder) is the
  // "Number of Persons" control — not part of a visitor row.
  function isNumericSelect(sel) {
    const opts = [...sel.options].map((o) => o.textContent.trim()).filter(Boolean);
    if (!opts.length) return false;
    return opts.every((o) => /^\d+$/.test(o) || /^(select|--.*--)?$/i.test(o));
  }

  // Controls in document order used for row grouping. Keeps file inputs (the
  // face upload) but drops radio/checkbox/buttons and the Number-of-Persons
  // select.
  function orderedControls() {
    return [...document.querySelectorAll("input, select, textarea")].filter((e) => {
      if (e.disabled) return false;
      const t = (e.type || "").toLowerCase();
      if (["hidden", "checkbox", "radio", "submit", "button", "image"].includes(t)) {
        return false;
      }
      if (e.tagName === "SELECT" && isNumericSelect(e)) return false;
      return true;
    });
  }

  const isText = (el) => el && (el.type === "text" || el.type === "tel" || el.type === "email");
  const isNumberish = (el) => el && (el.type === "number" || el.type === "text" || el.type === "tel");
  const isSelect = (el) => el && el.tagName === "SELECT";
  const isFile = (el) => el && el.type === "file";

  // Inject an image (data URL) into a file input the way the browser allows
  // scripts to: build a File and assign it via a DataTransfer list.
  async function setFile(input, dataUrl, name) {
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], name || "face.jpg", { type: blob.type || "image/jpeg" });
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return input.files.length === 1;
    } catch {
      return false;
    }
  }

  // Group the ordered controls into visitor rows.
  function getPersonRows() {
    const L = orderedControls();
    const rows = [];
    let i = 0;
    while (i < L.length) {
      if (!isText(L[i])) { i++; continue; }          // a row starts at Name (text)
      const row = { name: L[i++] };
      if (isFile(L[i])) row.photo = L[i++];           // Upload Your Face
      if (isNumberish(L[i])) row.age = L[i++];        // Age (older form variant)
      if (isSelect(L[i])) row.relationship = L[i++];  // Relationship
      if (isSelect(L[i])) row.idType = L[i++];        // ID Proof Type
      if (isText(L[i])) row.idNumber = L[i++];        // ID Proof Number
      rows.push(row);
    }
    return rows;
  }

  async function fillRow(row, person) {
    const done = [];
    if (row.name) { setValue(row.name, person.fullName); done.push("name"); }
    if (row.age) { setValue(row.age, String(person.age)); done.push("age"); }
    if (row.relationship && setSelect(row.relationship, person.relationship || "Self")) done.push("relationship");
    if (row.idType && setSelect(row.idType, person.idProofType || "Aadhaar")) done.push("ID type");
    if (row.idNumber) { setValue(row.idNumber, aadhaarDigits(person.aadhaar)); done.push("ID number"); }
    if (row.photo && person.photo) {
      const ok = await setFile(row.photo, person.photo, (person.fullName || "face") + ".jpg");
      if (ok) done.push("photo");
    }
    return done;
  }

  // Choose which row a single Fill should target: the row containing the
  // focused control, else the first row with an empty Name, else row 0.
  function targetRow(rows) {
    const active = document.activeElement;
    if (active) {
      const inFocus = rows.find((r) => Object.values(r).includes(active));
      if (inFocus) return inFocus;
    }
    return rows.find((r) => r.name && !r.name.value.trim()) || rows[0] || null;
  }

  async function fillOne(person) {
    const rows = getPersonRows();
    const row = targetRow(rows);
    if (!row) return { ok: false, filled: [] };
    return { ok: true, filled: await fillRow(row, person) };
  }

  async function fillAll(persons) {
    const rows = getPersonRows();
    if (!rows.length) return { rows: 0, count: 0 };
    let count = 0;
    for (let i = 0; i < persons.length && i < rows.length; i++) {
      await fillRow(rows[i], persons[i]);
      count++;
    }
    return { rows: rows.length, count };
  }

  // ---- toast -------------------------------------------------------------
  function toast(msg, ok = true) {
    let t = document.getElementById("aarti-toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "aarti-toast";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.background = ok ? "#2e8b57" : "#c0392b";
    t.classList.add("show");
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove("show"), 3000);
  }

  // ---- messages from popup ----------------------------------------------
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    (async () => {
      if (msg.type === "FILL_PERSON") {
        const res = await fillOne(msg.person);
        if (res.ok && res.filled.length) toast(`Filled row: ${res.filled.join(", ")}`, true);
        else toast("No visitor row found. Set 'Number of Persons' first.", false);
        sendResponse(res);
      } else if (msg.type === "FILL_ALL") {
        const res = await fillAll(msg.persons || []);
        if (res.count) toast(`Filled ${res.count} of ${res.rows} visitor row(s).`, true);
        else toast("No visitor rows found. Set 'Number of Persons' first.", false);
        sendResponse(res);
      }
    })();
    return true; // keep the message channel open for the async response
  });

  // ---- on-page floating panel -------------------------------------------
  buildPanel();

  function escapeHtml(s) {
    return (s || "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }

  function buildPanel() {
    const launcher = document.createElement("button");
    launcher.id = "aarti-launcher";
    launcher.title = "Aarti Booking Autofill";
    launcher.textContent = "🛕";
    document.body.appendChild(launcher);

    const panel = document.createElement("div");
    panel.id = "aarti-panel";
    panel.classList.add("hidden");
    panel.innerHTML = `
      <div class="aarti-head">
        <span>Devotees</span>
        <button id="aarti-close" title="Close">✕</button>
      </div>
      <div class="aarti-bulk"><button id="aarti-fill-all">⬇ Fill all rows</button></div>
      <div id="aarti-list"></div>
      <div class="aarti-foot">Set "Number of Persons" on the form first, then Fill.
        Single Fill targets the row you clicked into (or the first empty one).</div>`;
    document.body.appendChild(panel);

    launcher.addEventListener("click", async () => {
      panel.classList.toggle("hidden");
      if (!panel.classList.contains("hidden")) await renderPanel();
    });
    panel.querySelector("#aarti-close").addEventListener("click", () =>
      panel.classList.add("hidden")
    );
    panel.querySelector("#aarti-fill-all").addEventListener("click", async () => {
      const persons = await getPersons();
      const res = await fillAll(persons);
      if (res.count) toast(`Filled ${res.count} of ${res.rows} visitor row(s).`, true);
      else toast("No visitor rows found. Set 'Number of Persons' first.", false);
    });

    async function getPersons() {
      const data = await chrome.storage.local.get("persons");
      return Array.isArray(data.persons) ? data.persons : [];
    }

    async function renderPanel() {
      const persons = await getPersons();
      const list = panel.querySelector("#aarti-list");
      list.innerHTML = "";
      if (!persons.length) {
        list.innerHTML = `<div class="aarti-empty">No devotees saved yet.<br>
          Open the toolbar popup to add them.</div>`;
        return;
      }
      persons.forEach((p, idx) => {
        const row = document.createElement("div");
        row.className = "aarti-row";
        row.innerHTML = `
          <div class="aarti-info">
            <strong>${idx + 1}. ${escapeHtml(p.fullName)}</strong>
            <span>${escapeHtml(p.age)} · ${escapeHtml(p.gender)} · ${escapeHtml(p.aadhaar)}</span>
          </div>
          <button class="aarti-fill">Fill</button>`;
        row.querySelector(".aarti-fill").addEventListener("click", async () => {
          const res = await fillOne(p);
          if (res.ok && res.filled.length) toast(`Filled row: ${res.filled.join(", ")}`, true);
          else toast("No visitor row found. Set 'Number of Persons' first.", false);
        });
        list.appendChild(row);
      });
    }
  }
})();
