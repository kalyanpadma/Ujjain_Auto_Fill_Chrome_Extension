// Popup logic: manage saved devotees and trigger fill on the active tab.

const $ = (id) => document.getElementById(id);

const form = $("person-form");
const formTitle = $("form-title");
const saveBtn = $("save-btn");
const cancelBtn = $("cancel-btn");
const listEl = $("person-list");
const emptyMsg = $("empty-msg");
const countEl = $("count");
const aadhaarInput = $("aadhaar");
const aadhaarHint = $("aadhaar-hint");
const photoInput = $("photo");
const photoPreview = $("photo-preview");
const photoImg = $("photo-img");

// Holds the current devotee's compressed face photo as a data URL (or null).
let currentPhoto = null;

// Downscale + JPEG-compress an image file to keep storage small.
function compressImage(file, maxDim = 480, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDim) { height = (height * maxDim) / width; width = maxDim; }
        else if (height > maxDim) { width = (width * maxDim) / height; height = maxDim; }
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(width);
        canvas.height = Math.round(height);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function showPhoto(dataUrl) {
  currentPhoto = dataUrl || null;
  if (currentPhoto) {
    photoImg.src = currentPhoto;
    photoPreview.classList.remove("hidden");
  } else {
    photoImg.removeAttribute("src");
    photoPreview.classList.add("hidden");
  }
}

photoInput.addEventListener("change", async () => {
  const file = photoInput.files[0];
  if (!file) return;
  try {
    showPhoto(await compressImage(file));
  } catch {
    alert("Could not read that image. Try a JPG or PNG.");
  }
  photoInput.value = ""; // allow re-selecting same file later
});

$("photo-remove").addEventListener("click", () => showPhoto(null));

// Pretty-format the Aadhaar field as the user types.
aadhaarInput.addEventListener("input", () => {
  const cursorAtEnd = aadhaarInput.selectionStart === aadhaarInput.value.length;
  aadhaarInput.value = formatAadhaar(aadhaarInput.value);
  if (cursorAtEnd) {
    aadhaarInput.selectionStart = aadhaarInput.selectionEnd = aadhaarInput.value.length;
  }
  validateAadhaar(false);
});

function validateAadhaar(showOk) {
  const digits = aadhaarDigits(aadhaarInput.value);
  aadhaarHint.classList.remove("error");
  if (digits.length === 0) {
    aadhaarHint.textContent = "";
    return true; // emptiness handled by required attr
  }
  if (digits.length !== 12) {
    aadhaarHint.textContent = `${digits.length}/12 digits`;
    return false;
  }
  if (!isValidAadhaar(digits)) {
    aadhaarHint.textContent = "Checksum looks invalid — double-check the number.";
    aadhaarHint.classList.add("error");
    return false;
  }
  aadhaarHint.textContent = showOk ? "✓ Valid format" : "";
  return true;
}

function resetForm() {
  form.reset();
  $("person-id").value = "";
  $("relationship").value = "Self";
  $("idProofType").value = "Aadhaar Card";
  formTitle.textContent = "Add devotee";
  saveBtn.textContent = "Save devotee";
  cancelBtn.classList.add("hidden");
  aadhaarHint.textContent = "";
  showPhoto(null);
}

cancelBtn.addEventListener("click", resetForm);

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const digits = aadhaarDigits(aadhaarInput.value);
  if (digits.length !== 12) {
    validateAadhaar(true);
    aadhaarInput.focus();
    return;
  }
  const person = {
    id: $("person-id").value || "",
    fullName: $("fullName").value.trim(),
    age: $("age").value.trim(),
    gender: $("gender").value,
    relationship: $("relationship").value || "Self",
    idProofType: $("idProofType").value,
    aadhaar: formatAadhaar(digits),
    photo: currentPhoto || null,
  };
  await PersonStore.upsert(person);
  resetForm();
  await render();
});

async function startEdit(id) {
  const p = await PersonStore.get(id);
  if (!p) return;
  $("person-id").value = p.id;
  $("fullName").value = p.fullName || "";
  $("age").value = p.age || "";
  $("gender").value = p.gender || "";
  $("relationship").value = p.relationship || "Self";
  $("idProofType").value = p.idProofType || "Aadhaar Card";
  aadhaarInput.value = formatAadhaar(p.aadhaar);
  showPhoto(p.photo || null);
  formTitle.textContent = "Edit devotee";
  saveBtn.textContent = "Update devotee";
  cancelBtn.classList.remove("hidden");
  window.scrollTo(0, 0);
}

async function activeBookingTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/shrimahakaleshwar\.mp\.gov\.in/.test(tab.url || "")) {
    alert("Open the Mahakaleshwar booking page first, then click Fill.");
    return null;
  }
  return tab;
}

async function sendToPage(tab, message) {
  try {
    await chrome.tabs.sendMessage(tab.id, message);
  } catch (err) {
    // Content script not injected yet (page loaded before install/reload).
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
    await chrome.tabs.sendMessage(tab.id, message);
  }
}

async function fillOnPage(id) {
  const p = await PersonStore.get(id);
  if (!p) return;
  const tab = await activeBookingTab();
  if (!tab) return;
  await sendToPage(tab, { type: "FILL_PERSON", person: p });
  window.close();
}

async function fillAllOnPage() {
  const persons = await PersonStore.getAll();
  if (!persons.length) return;
  const tab = await activeBookingTab();
  if (!tab) return;
  await sendToPage(tab, { type: "FILL_ALL", persons });
  window.close();
}

document.getElementById("fill-all-btn").addEventListener("click", fillAllOnPage);

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

async function render() {
  const persons = await PersonStore.getAll();
  countEl.textContent = persons.length;
  listEl.innerHTML = "";
  emptyMsg.classList.toggle("hidden", persons.length > 0);
  document.getElementById("fill-all-btn").classList.toggle("hidden", persons.length === 0);

  for (const p of persons) {
    const li = document.createElement("li");
    li.className = "person";
    li.innerHTML = `
      <div class="name">${escapeHtml(p.fullName)}</div>
      <div class="meta">${escapeHtml(p.age)} yrs · ${escapeHtml(p.gender)} ·
        ${escapeHtml(p.relationship || "Self")} ·
        ${escapeHtml(p.idProofType)} · ${escapeHtml(formatAadhaar(p.aadhaar))}
        ${p.photo ? '· <span class="has-photo">📷 photo</span>' : ""}</div>
      <div class="btns">
        <button class="fill" data-act="fill">Fill</button>
        <button class="edit" data-act="edit">Edit</button>
        <button class="del" data-act="del">Delete</button>
      </div>`;
    li.querySelector('[data-act="fill"]').addEventListener("click", () => fillOnPage(p.id));
    li.querySelector('[data-act="edit"]').addEventListener("click", () => startEdit(p.id));
    li.querySelector('[data-act="del"]').addEventListener("click", async () => {
      if (confirm(`Delete ${p.fullName}?`)) {
        await PersonStore.remove(p.id);
        await render();
      }
    });
    listEl.appendChild(li);
  }
}

render();
