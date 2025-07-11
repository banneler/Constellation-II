// js/sequences.js (full updated code)
import { SUPABASE_URL, SUPABASE_ANON_KEY, parseCsvRow, themes, setupModalListeners, showModal, hideModal } from './shared_constants.js';

document.addEventListener("DOMContentLoaded", async () => {
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  let state = {
    currentUser: null,
    sequences: [],
    sequence_steps: [],
    selectedSequenceId: null,
  };

  // --- DOM Element Selectors (Sequences specific) ---
  const logoutBtn = document.getElementById("logout-btn");
  // const debugBtn = document.getElementById("debug-btn"); // REMOVE THIS LINE
  const sequenceList = document.getElementById("sequence-list");
  const addSequenceBtn = document.getElementById("add-sequence-btn");
  const importSequenceBtn = document.getElementById("import-sequence-btn");
  const sequenceCsvInput = document.getElementById("sequence-csv-input");
  const deleteSequenceBtn = document.getElementById("delete-sequence-btn");
  const sequenceStepsTable = document.querySelector("#sequence-steps-table tbody");
  const addStepBtn = document.getElementById("add-step-btn");
  const renameSequenceBtn = document.getElementById("rename-sequence-btn");
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

    const userSpecificTables = ["sequences"];
    const publicTables = ["sequence_steps"];

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
      renderSequenceList();
      renderSequenceSteps();
    }
  }

  // --- Render Functions (Sequences specific) ---
  const renderSequenceList = () => {
    if (!sequenceList) return;
    sequenceList.innerHTML = "";
    state.sequences
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
      .forEach((seq) => {
        const i = document.createElement("div");
        i.className = "list-item";
        i.textContent = seq.name;
        i.dataset.id = seq.id;
        if (seq.id === state.selectedSequenceId) i.classList.add("selected");
        sequenceList.appendChild(i);
      });
  };

  const renderSequenceSteps = () => {
    if (!sequenceStepsTable) return;
    sequenceStepsTable.innerHTML = "";
    if (state.selectedSequenceId) {
      const steps = state.sequence_steps.filter(
        (s) => s.sequence_id === state.selectedSequenceId
      );
      steps
        .sort((a, b) => a.step_number - b.step_number)
        .forEach((step) => {
          const row = sequenceStepsTable.insertRow();
          row.innerHTML = `<td>${step.step_number}</td><td>${
            step.type
          }</td><td>${step.subject || ""}</td><td>${
            step.message || ""
          }</td><td>${step.delay_days}</td>`;
        });
    }
  };

  // --- Event Listener Setup (Sequences specific) ---
  setupModalListeners();

  themeToggleBtn.addEventListener("click", cycleTheme);

  logoutBtn.addEventListener("click", async () => {
    await supabase.auth.signOut();
    window.location.href = "index.html";
  });

  // debugBtn.addEventListener("click", () => { // REMOVE THIS LISTENER
  //   console.log(JSON.stringify(state, null, 2));
  //   alert("Current app state logged to console (F12).");
  // });

  sequenceList.addEventListener("click", (e) => {
    const item = e.target.closest(".list-item");
    if (item) {
      state.selectedSequenceId = Number(item.dataset.id);
      renderSequenceList();
      renderSequenceSteps();
    }
  });

  addSequenceBtn.addEventListener("click", async () => {
    showModal(
      "New Sequence Name",
      `<label>Sequence Name</label><input type="text" id="modal-sequence-name" required>`,
      async () => {
        const name = document
          .getElementById("modal-sequence-name")
          .value.trim();
        if (name) {
          await supabase
            .from("sequences")
            .insert([{
              name: name,
              user_id: state.currentUser.id
            }]);
          await loadAllData();
          hideModal();
        } else {
          alert("Sequence name is required.");
        }
      }
    );
  });

  renameSequenceBtn.addEventListener("click", () => {
    if (!state.selectedSequenceId)
      return alert("Please select a sequence to rename.");
    const selectedSequence = state.sequences.find(
      (s) => s.id === state.selectedSequenceId
    );
    if (!selectedSequence) return alert("Selected sequence not found.");
    showModal(
      "Rename Sequence",
      `<label>New Sequence Name</label><input type="text" id="modal-new-sequence-name" value="${selectedSequence.name}" required>`,
      async () => {
        const newName = document
          .getElementById("modal-new-sequence-name")
          .value.trim();
        if (newName && newName !== selectedSequence.name) {
          await supabase
            .from("sequences")
            .update({
              name: newName
            })
            .eq("id", state.selectedSequenceId);
          await loadAllData();
          alert("Sequence renamed successfully!");
          hideModal();
        } else if (newName === selectedSequence.name) {
          hideModal();
        } else {
          alert("New sequence name cannot be empty.");
        }
      }
    );
  });

  deleteSequenceBtn.addEventListener("click", async () => {
    if (!state.selectedSequenceId) return alert("Please select a sequence.");
    showModal(
      "Confirm Deletion",
      "Are you sure? This will delete the sequence and all its steps. This cannot be undone.",
      async () => {
        await supabase
          .from("sequences")
          .delete()
          .eq("id", state.selectedSequenceId);
        state.selectedSequenceId = null;
        await loadAllData();
        hideModal();
      }
    );
  });

  importSequenceBtn.addEventListener("click", () => {
    if (!state.selectedSequenceId)
      return alert(
        "Please select a sequence template first before importing steps."
      );
    sequenceCsvInput.click();
  });

  sequenceCsvInput.addEventListener("change", (e) => {
    if (!state.selectedSequenceId) return;
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = async function(e) {
      const rows = e.target.result.split("\n").filter((r) => r.trim() !== "");
      const selectedSequence = state.sequences.find(
        (s) => s.id === state.selectedSequenceId
      );
      const newRecords = rows
        .slice(1)
        .map((row) => {
          const c = parseCsvRow(row);
          return {
            sequence_id: state.selectedSequenceId,
            step_number: parseInt(c[0], 10),
            type: c[1] || "",
            subject: c[2] || "",
            message: c[3] || "",
            delay_days: parseInt(c[4], 10) || 0
          };
        })
        .filter((record) => !isNaN(record.step_number));
      if (newRecords.length > 0) {
        const {
          error
        } = await supabase
          .from("sequence_steps")
          .insert(newRecords);
        if (error) {
          alert("Error importing sequence steps: " + error.message);
        } else {
          alert(
            `${newRecords.length} steps imported into "${selectedSequence.name}".`
          );
          await loadAllData();
        }
      } else {
        alert("No valid records found to import.");
      }
    };
    r.readAsText(f);
    e.target.value = "";
  });

  addStepBtn.addEventListener("click", () => {
    if (!state.selectedSequenceId) return alert("Please select a sequence.");
    const steps = state.sequence_steps.filter(
      (s) => s.sequence_id === state.selectedSequenceId
    );
    const nextNum =
      steps.length > 0 ? Math.max(...steps.map((s) => s.step_number)) + 1 : 1;
    showModal(
      "Add Sequence Step",
      `<label>Step Number</label><input type="number" id="modal-step-number" value="${nextNum}" required><label>Type</label><input type="text" id="modal-step-type" required placeholder="e.g., Email, Call, LinkedIn"><label>Subject (for Email)</label><input type="text" id="modal-step-subject" placeholder="Optional"><label>Message (for Email/Notes)</label><textarea id="modal-step-message" placeholder="Optional"></textarea><label>Delay (Days after previous step)</label><input type="number" id="modal-step-delay" value="0" required>`,
      async () => {
        const newStep = {
          sequence_id: state.selectedSequenceId,
          step_number: parseInt(
            document.getElementById("modal-step-number").value
          ),
          type: document.getElementById("modal-step-type").value.trim(),
          subject: document.getElementById("modal-step-subject").value.trim(),
          message: document.getElementById("modal-step-message").value.trim(),
          delay_days: parseInt(
            document.getElementById("modal-step-delay").value
          )
        };
        if (!newStep.type) {
          alert("Step Type is required.");
          return;
        }
        await supabase.from("sequence_steps").insert([newStep]);
        await loadAllData();
        hideModal();
      }
    );
  });

  // --- App Initialization (Sequences Page) ---
  const savedTheme = localStorage.getItem('crm-theme') || 'dark';
  const savedThemeIndex = themes.indexOf(savedTheme);
  currentThemeIndex = savedThemeIndex !== -1 ? savedThemeIndex : 0;
  applyTheme(themes[currentThemeIndex]);

  // Check user session on page load
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    state.currentUser = session.user;
    await loadAllData();
  } else {
    window.location.href = "index.html"; // Redirect to auth page if not signed in
  }
});
