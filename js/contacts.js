// js/contacts.js (full updated code)
import { SUPABASE_URL, SUPABASE_ANON_KEY, formatDate, parseCsvRow, themes, setupModalListeners, showModal, hideModal } from './shared_constants.js';

document.addEventListener("DOMContentLoaded", async () => {
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  let state = {
    currentUser: null,
    contacts: [],
    accounts: [],
    sequences: [],
    sequence_steps: [],
    activities: [],
    contact_sequences: [],
    selectedContactId: null,
  };

  // --- DOM Element Selectors (Contacts specific) ---
  const logoutBtn = document.getElementById("logout-btn");
  // const debugBtn = document.getElementById("debug-btn"); // REMOVE THIS LINE
  const contactList = document.getElementById("contact-list");
  const contactForm = document.getElementById("contact-form");
  const contactSearch = document.getElementById("contact-search");
  const bulkImportContactsBtn = document.getElementById("bulk-import-contacts-btn");
  const contactCsvInput = document.getElementById("contact-csv-input");
  const addContactBtn = document.getElementById("add-contact-btn");
  const deleteContactBtn = document.getElementById("delete-contact-btn");
  const logActivityBtn = document.getElementById("log-activity-btn");
  const assignSequenceBtn = document.getElementById("assign-sequence-btn");
  const contactActivitiesList = document.getElementById("contact-activities-list");
  const contactSequenceInfoText = document.getElementById("contact-sequence-info-text");
  const removeFromSequenceBtn = document.getElementById("remove-from-sequence-btn");
  const noSequenceText = document.getElementById("no-sequence-text");
  const sequenceStatusContent = document.getElementById("sequence-status-content");
  const ringChart = document.getElementById("ring-chart");
  const ringChartText = document.getElementById("ring-chart-text");
  const themeToggleBtn = document.getElementById("theme-toggle-btn");
  const themeNameSpan = document.getElementById("theme-name");

  // --- Theme Toggle Logic ---
  let currentThemeIndex = 0;
  function applyTheme(themeName) {
    if (!themeNameSpan) return;
    document.body.classList.remove('theme-dark', 'theme-light', 'theme-green');
    document.body.classList.add(`theme-${themeName}`);
    const capitalizedThemeName = themeName.charAt(0).toUpperCase() + themeName.slice(1);
    themeNameSpan.textContent = capitalizedThemeName;
    localStorage.setItem('crm-theme', themeName);
  }
  function cycleTheme() {
    currentThemeIndex = (currentThemeIndex + 1) % themes.length;
    const newTheme = themes[currentThemeIndex];
    applyTheme(newTheme);
  }

  // --- Data Fetching ---
  async function loadAllData() {
    if (!state.currentUser) return;

    const userSpecificTables = ["contacts", "accounts", "activities", "contact_sequences", "sequences"]; // Added sequences for contact_sequences
    const publicTables = ["sequence_steps"]; // Needed for sequence details on contact

    const userPromises = userSpecificTables.map((table) =>
      supabase.from(table).select("*").eq("user_id", state.currentUser.id)
    );
    const publicPromises = publicTables.map((table) =>
      supabase.from(table).select("*")
    );

    const allPromises = [...userPromises, ...publicPromises];
    const allTableNames = [...userSpecificTables, ...publicTables];

    try {
      const results = await Promise.allSettled(allPromises);
      results.forEach((result, index) => {
        const tableName = allTableNames[index];
        if (result.status === "fulfilled") {
          if (result.value.error) {
            console.error(
              `Supabase error fetching ${tableName}:`,
              result.value.error.message
            );
            state[tableName] = [];
          } else {
            state[tableName] = result.value.data || [];
          }
        } else {
          console.error(`Failed to fetch ${tableName}:`, result.reason);
          state[tableName] = [];
        }
      });
    } catch (error) {
      console.error("Critical error in loadAllData:", error);
    } finally {
      renderContactList();
      renderContactDetails();
    }
  }

  // --- Render Functions (Contacts specific) ---
  const renderContactList = () => {
    if (!contactList) return;
    const searchTerm = contactSearch.value.toLowerCase();
    const filteredContacts = state.contacts
      .filter(
        (c) =>
        (c.first_name || "").toLowerCase().includes(searchTerm) ||
        (c.last_name || "").toLowerCase().includes(searchTerm) ||
        (c.email || "").toLowerCase().includes(searchTerm)
      )
      .sort((a, b) => (a.last_name || "").localeCompare(b.last_name || ""));

    contactList.innerHTML = "";
    filteredContacts.forEach((contact) => {
      const item = document.createElement("div");
      item.className = "list-item";
      const inActiveSequence = state.contact_sequences.some(
        (cs) => cs.contact_id === contact.id && cs.status === "Active"
      );
      item.innerHTML = `${contact.first_name} ${contact.last_name} ${
           inActiveSequence
             ? '<span class="sequence-status-icon" style="color: var(--completed-color);">🔄</span>'
             : ""
         }`;
      item.dataset.id = contact.id;
      if (contact.id === state.selectedContactId)
        item.classList.add("selected");
      contactList.appendChild(item);
    });
  };

  const renderContactDetails = () => {
    if (!contactForm) return;
    const contact = state.contacts.find(
      (c) => c.id === state.selectedContactId
    );
    const accountDropdown = document.getElementById("contact-account-name");
    const lastSavedEl = document.getElementById("contact-last-saved");

    if (!accountDropdown || !lastSavedEl) return;

    accountDropdown.innerHTML = '<option value="">-- No Account --</option>';
    state.accounts
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
      .forEach((acc) => {
        const o = document.createElement("option");
        o.value = acc.id;
        o.textContent = acc.name;
        accountDropdown.appendChild(o);
      });

    if (contact) {
      contactForm.querySelector("#contact-id").value = contact.id;
      contactForm.querySelector("#contact-first-name").value =
        contact.first_name || "";
      contactForm.querySelector("#contact-last-name").value =
        contact.last_name || "";
      contactForm.querySelector("#contact-email").value = contact.email || "";
      contactForm.querySelector("#contact-phone").value = contact.phone || "";
      contactForm.querySelector("#contact-title").value = contact.title || "";
      contactForm.querySelector("#contact-notes").value = contact.notes || "";
      lastSavedEl.textContent = contact.last_saved ?
        `Last Saved: ${formatDate(contact.last_saved)}` :
        "";
      accountDropdown.value = contact.account_id || "";

      contactActivitiesList.innerHTML = "";
      state.activities
        .filter((act) => act.contact_id === contact.id)
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .forEach((act) => {
          const li = document.createElement("li");
          li.textContent = `[${formatDate(act.date)}] ${act.type}: ${
            act.description
          }`;
          let borderColor = "var(--primary-blue)"; // Default color
          const activityTypeLower = act.type.toLowerCase();
          if (activityTypeLower.includes("email")) {
            borderColor = "var(--warning-yellow)";
          } else if (activityTypeLower.includes("call")) {
            borderColor = "var(--completed-color)";
          } else if (activityTypeLower.includes("meeting")) { // NEW CONDITION ADDED HERE
            borderColor = "var(--meeting-purple)";          // Uses the new CSS variable
          }
          li.style.borderLeftColor = borderColor;
          contactActivitiesList.appendChild(li);
        });

      const activeSequence = state.contact_sequences.find(
        (cs) => cs.contact_id === contact.id && cs.status === "Active"
      );
      if (activeSequence) {
        const sequence = state.sequences.find(
          (s) => s.id === activeSequence.sequence_id
        );
        const steps = state.sequence_steps.filter(
          (s) => s.sequence_id === activeSequence.sequence_id
        );
        if (sequence && steps.length > 0) {
          const totalSteps = steps.length;
          const currentStep = activeSequence.current_step_number;
          const lastCompleted = currentStep - 1;
          const percentage =
            totalSteps > 0 ? Math.round((lastCompleted / totalSteps) * 100) : 0;
          ringChart.style.background = `conic-gradient(var(--completed-color) ${percentage}%, #3c3c3c ${percentage}%)`;
          ringChartText.textContent = `${lastCompleted}/${totalSteps}`;
          contactSequenceInfoText.textContent = `Enrolled in "${sequence.name}" (On Step ${currentStep} of ${totalSteps}).`;
          sequenceStatusContent.classList.remove("hidden");
          noSequenceText.classList.add("hidden");
        }
      } else {
        sequenceStatusContent.classList.add("hidden");
        noSequenceText.classList.remove("hidden");
      }
    } else {
      contactForm.reset();
      contactForm.querySelector("#contact-id").value = "";
      lastSavedEl.textContent = "";
      contactActivitiesList.innerHTML = "";
      sequenceStatusContent.classList.add("hidden");
      noSequenceText.textContent = "Select a contact to see details.";
      noSequenceText.classList.remove("hidden");
    }
  };

  // --- Event Listener Setup (Contacts specific) ---
  setupModalListeners(); // Setup for shared modal functionality

  themeToggleBtn.addEventListener("click", cycleTheme);

  logoutBtn.addEventListener("click", async () => {
    await supabase.auth.signOut();
    window.location.href = "index.html"; // Redirect to auth page after logout
  });

  // debugBtn.addEventListener("click", () => { // REMOVE THIS LISTENER
  //   console.log(JSON.stringify(state, null, 2));
  //   alert("Current app state logged to console (F12).");
  // });

  contactSearch.addEventListener("input", renderContactList);

  addContactBtn.addEventListener("click", () => {
    state.selectedContactId = null;
    renderContactList();
    renderContactDetails();
    contactForm.querySelector("#contact-first-name").focus();
  });

  contactList.addEventListener("click", (e) => {
    const item = e.target.closest(".list-item");
    if (item) {
      state.selectedContactId = Number(item.dataset.id);
      renderContactList();
      renderContactDetails();
    }
  });

  contactForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = Number(contactForm.querySelector("#contact-id").value);
    const data = {
      first_name: contactForm
        .querySelector("#contact-first-name")
        .value.trim(),
      last_name: contactForm.querySelector("#contact-last-name").value.trim(),
      email: contactForm.querySelector("#contact-email").value.trim(),
      phone: contactForm.querySelector("#contact-phone").value.trim(),
      title: contactForm.querySelector("#contact-title").value.trim(),
      account_id: Number(contactForm.querySelector("#contact-account-name").value) ||
        null,
      notes: contactForm.querySelector("#contact-notes").value,
      last_saved: new Date().toISOString(),
      user_id: state.currentUser.id
    };
    if (id) {
      await supabase.from("contacts").update(data).eq("id", id);
    } else {
      if (!data.first_name || !data.last_name)
        return alert("First and Last name are required.");
      await supabase.from("contacts").insert([data]);
    }
    await loadAllData();
  });

  deleteContactBtn.addEventListener("click", async () => {
    if (!state.selectedContactId) return;
    showModal(
      "Confirm Deletion",
      "Are you sure you want to delete this contact?",
      async () => {
        await supabase
          .from("contacts")
          .delete()
          .eq("id", state.selectedContactId);
        state.selectedContactId = null;
        await loadAllData();
        hideModal();
      }
    );
  });

  bulkImportContactsBtn.addEventListener("click", () =>
    contactCsvInput.click()
  );

  contactCsvInput.addEventListener("change", (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = async function(e) {
      const rows = e.target.result.split("\n").filter((r) => r.trim() !== "");
      const newRecords = rows
        .map((row) => {
          const c = parseCsvRow(row);
          return {
            first_name: c[0] || "",
            last_name: c[1] || "",
            email: c[2] || "",
            phone: c[3] || "",
            title: c[4] || "",
            user_id: state.currentUser.id
          };
        })
        .filter((c) => c.first_name && c.last_name);
      if (newRecords.length > 0) {
        await supabase.from("contacts").insert(newRecords);
        alert(`${newRecords.length} contacts imported.`);
        await loadAllData();
      }
    };
    r.readAsText(f);
    e.target.value = "";
  });

  logActivityBtn.addEventListener("click", () => {
    if (!state.selectedContactId) return alert("Please select a contact.");
    showModal(
      "Log Activity",
      `<label>Activity Type</label><input type="text" id="modal-activity-type" required placeholder="e.g., Call, Email, Meeting"><label>Description</label><textarea id="modal-activity-desc" required placeholder="Details of the activity"></textarea>`,
      async () => {
        const contact = state.contacts.find(
          (c) => c.id === state.selectedContactId
        );
        const newActivity = {
          contact_id: state.selectedContactId,
          account_id: contact ? contact.account_id : null,
          date: new Date().toISOString(),
          type: document.getElementById("modal-activity-type").value.trim(),
          description: document
            .getElementById("modal-activity-desc")
            .value.trim(),
          user_id: state.currentUser.id
        };
        if (!newActivity.type || !newActivity.description) {
          alert("All fields are required.");
          return;
        }
        await supabase.from("activities").insert([newActivity]);
        await loadAllData();
        alert("Activity logged!");
        hideModal();
      }
    );
  });

  assignSequenceBtn.addEventListener("click", () => {
    if (!state.selectedContactId) return alert("Please select a contact.");
    const isAlreadyInSequence = state.contact_sequences.some(
      (cs) =>
      cs.contact_id === state.selectedContactId && cs.status === "Active"
    );
    if (isAlreadyInSequence) {
      alert("This contact is already in an active sequence.");
      return;
    }
    const optionsHtml = state.sequences
      .map((s) => `<option value="${s.id}">${s.name}</option>`)
      .join("");
    if (!optionsHtml) return alert("No sequences found.");
    showModal(
      "Assign Sequence",
      `<label>Select a sequence:</label><select id="modal-sequence-select">${optionsHtml}</select>`,
      async () => {
        const sequenceId = Number(
          document.getElementById("modal-sequence-select").value
        );
        const steps = state.sequence_steps.filter(
          (s) => s.sequence_id === sequenceId
        );
        if (steps.length === 0) {
          alert("Cannot assign an empty sequence.");
          return;
        }
        const firstStep = steps.sort(
          (a, b) => a.step_number - b.step_number
        )[0];
        const newEnrollment = {
          user_id: state.currentUser.id,
          contact_id: state.selectedContactId,
          sequence_id: sequenceId,
          current_step_number: firstStep.step_number,
          status: "Active",
          last_completed_date: new Date().toISOString(),
          next_step_due_date: addDays(
            new Date(),
            firstStep.delay_days
          ).toISOString()
        };
        await supabase.from("contact_sequences").insert([newEnrollment]);
        alert("Sequence assigned!");
        await loadAllData();
        hideModal();
      }
    );
  });

  removeFromSequenceBtn.addEventListener("click", async () => {
    if (!state.selectedContactId) return;
    showModal(
      "Confirm Removal",
      "Are you sure you want to remove this contact from the sequence?",
      async () => {
        await supabase
          .from("contact_sequences")
          .delete()
          .eq("contact_id", state.selectedContactId)
          .eq("status", "Active");
        await loadAllData();
        alert("Contact removed from sequence.");
        hideModal();
      }
    );
  });

  // --- App Initialization (Contacts Page) ---
  const savedTheme = localStorage.getItem('crm-theme') || 'dark';
  const savedThemeIndex = themes.indexOf(savedTheme);
  currentThemeIndex = savedThemeIndex !== -1 ? savedThemeIndex : 0;
  applyTheme(themes[currentThemeIndex]);

  // Check user session on page load
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    state.currentUser = session.user;
    // Potentially get selectedContactId from URL parameter if navigating from another page
    const urlParams = new URLSearchParams(window.location.search);
    const contactIdFromUrl = urlParams.get('contactId');
    if (contactIdFromUrl) {
        state.selectedContactId = Number(contactIdFromUrl);
    }
    await loadAllData();
  } else {
    window.location.href = "index.html"; // Redirect to auth page if not signed in
  }
});
