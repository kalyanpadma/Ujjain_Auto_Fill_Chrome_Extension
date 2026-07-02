// Shared storage helpers for saved devotees.
// A "person" looks like:
//   { id, fullName, age, gender, relationship, idProofType, aadhaar }
// Stored under chrome.storage.local key "persons".

const STORAGE_KEY = "persons";

const PersonStore = {
  async getAll() {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    return Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY] : [];
  },

  async saveAll(persons) {
    await chrome.storage.local.set({ [STORAGE_KEY]: persons });
  },

  async upsert(person) {
    const persons = await this.getAll();
    if (person.id) {
      const idx = persons.findIndex((p) => p.id === person.id);
      if (idx >= 0) persons[idx] = person;
      else persons.push(person);
    } else {
      person.id = "p_" + Date.now() + "_" + Math.floor(Math.random() * 1e6);
      persons.push(person);
    }
    await this.saveAll(persons);
    return person;
  },

  async remove(id) {
    const persons = (await this.getAll()).filter((p) => p.id !== id);
    await this.saveAll(persons);
  },

  async get(id) {
    return (await this.getAll()).find((p) => p.id === id) || null;
  },
};

// Normalise an Aadhaar string to 12 digits (strips spaces/dashes).
function aadhaarDigits(value) {
  return (value || "").replace(/\D/g, "");
}

// Format 12 digits as "1234 5678 9012" for display/entry.
function formatAadhaar(value) {
  const d = aadhaarDigits(value).slice(0, 12);
  return d.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

// Verhoeff checksum validation used by real Aadhaar numbers.
function isValidAadhaar(value) {
  const d = aadhaarDigits(value);
  if (!/^\d{12}$/.test(d)) return false;
  const dTable = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
    [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
    [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
    [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
    [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
    [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
    [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
    [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
  ];
  const p = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
    [5, 8, 0, 9, 1, 6, 7, 4, 3, 2],
    [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
    [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
    [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
  ];
  let c = 0;
  const reversed = d.split("").reverse();
  for (let i = 0; i < reversed.length; i++) {
    c = dTable[c][p[i % 8][parseInt(reversed[i], 10)]];
  }
  return c === 0;
}
