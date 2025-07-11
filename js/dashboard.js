// js/dashboard.js (full updated code)
import { SUPABASE_URL, SUPABASE_ANON_KEY, MONTHLY_QUOTA, formatDate, formatCurrencyK, addDays, themes, setupModalListeners, showModal, hideModal } from './shared_constants.js';

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
    deals: [],
  };

  // --- DOM Element Selectors (Dashboard specific) ---
  const logoutBtn = document.getElementById("logout-btn");
  // const debugBtn = document.getElementById("debug-btn"); // REMOVE THIS LINE
  const dashboardTable = document.querySelector("#dashboard-table tbody");
  const recentActivitiesTable = document.querySelector("#recent-activities-table tbody");
  const allTasksTable = document.querySelector("#all-tasks-table tbody");
  const themeToggleBtn = document.getElementById("theme-toggle-btn");
  const themeNameSpan = document.getElementById("theme-name");
  const metricCurrentCommit = document.getElementById("metric-current-commit");
  const metricBestCase = document.getElementById("metric-best-case");
  const metricFunnel = document.getElementById("metric-funnel");

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

  // --- Utility for getting start of local day ---
  function getStartOfLocalDayISO() {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set to the start of the *local* day
    return today.toISOString();
  }

  // --- Data Fetching Function ---
  async function loadAllData() {
    if (!state.currentUser) return;
    console.log("loadAllData: Fetching all user data...");

    const userSpecificTables = ["contacts", "accounts", "sequences", "activities", "contact_sequences", "deals"];
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
              `loadAllData: Supabase error fetching ${tableName}:`,
              result.value.error.message
            );
            state[tableName] = [];
          } else {
            state[tableName] = result.value.data || [];
          }
        } else {
          console.error(`loadAllData: Failed to fetch ${tableName}:`, result.reason);
          state[tableName] = [];
        }
      });
      console.log("loadAllData: All data fetched. Calling render functions.");
    } catch (error) {
      console.error("loadAllData: Critical error in loadAllData:", error);
    } finally {
      renderDashboard();
      renderDealsMetrics();
    }
  }

  // --- Render Functions (Defined as function declarations to ensure hoisting) ---
  function renderDashboard() {
    if (!dashboardTable || !recentActivitiesTable || !allTasksTable) return;
    console.log("renderDashboard: Starting render process.");
    dashboardTable.innerHTML = "";
    recentActivitiesTable.innerHTML = "";
    allTasksTable.innerHTML = "";
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normalize 'today' to start of local day
    console.log("renderDashboard: Current 'today' date for filtering (normalized local):", today.toISOString());

    const dueSequenceSteps = state.contact_sequences
      .filter(
        (cs) => {
          const nextStepDate = new Date(cs.next_step_due_date);
          // Normalize nextStepDate to start of its *local* day for comparison
          nextStepDate.setHours(0, 0, 0, 0);

          const isDue = nextStepDate <= today;
          const isActive = cs.status === "Active";

          // Detailed debugging for the specific contact sequence (csId: 5 from your logs)
          if (cs.id === 5) {
              console.log(`renderDashboard: Checking csId 5 -- Raw DB Date: ${cs.next_step_due_date}, Normalized Date for Comparison: ${nextStepDate.toISOString()}, IsDue: ${isDue}, Status: ${cs.status}, IsActive: ${isActive}`);
          }
          return isDue && isActive;
        }
      )
      .sort(
        (a, b) =>
        new Date(a.next_step_due_date) - new Date(b.next_step_due_date)
      );

    console.log("renderDashboard: Number of due sequence steps after filtering:", dueSequenceSteps.length);
    if (dueSequenceSteps.length === 0) {
        console.log("renderDashboard: No due sequence steps found to display.");
    }

    dueSequenceSteps.forEach((cs) => {
        const contact = state.contacts.find((c) => c.id === cs.contact_id);
        const sequence = state.sequences.find((s) => s.id === cs.sequence_id);
        if (!contact || !sequence) {
            console.warn(`renderDashboard: Missing contact or sequence for CS ID ${cs.id}`);
            return;
        }
        const step = state.sequence_steps.find(
            (s) =>
            s.sequence_id === sequence.id &&
            s.step_number === cs.current_step_number
        );
        if (!step) {
            console.warn(`renderDashboard: Missing step for CS ID ${cs.id}, Seq ID ${sequence.id}, Step Num ${cs.current_step_number}`);
            return;
        }

        const row = dashboardTable.insertRow();
        const desc = step.subject || step.message || "";
        let btnHtml = "";
        const type = step.type.toLowerCase();
        if (type === "email" && contact.email) {
            btnHtml = `<button class="btn-primary send-email-btn" data-cs-id="${cs.id}" data-contact-id="${contact.id}" data-subject="${encodeURIComponent(step.subject)}" data-message="${encodeURIComponent(step.message)}">Send Email</button>`;
        } else if (type === "linkedin") {
            btnHtml = `<button class="btn-primary linkedin-step-btn" data-id="${cs.id}">Go to LinkedIn</button>`;
        } else {
            btnHtml = `<button class="btn-primary complete-step-btn" data-id="${cs.id}">Complete</button>`;
        }
        row.innerHTML = `<td>${formatDate(cs.next_step_due_date)}</td><td>${contact.first_name} ${contact.last_name}</td><td>${sequence.name}</td><td>${step.step_number}: ${step.type}</td><td>${desc}</td><td>${btnHtml}</td>`;
    });

    state.contact_sequences
      .filter((cs) => cs.status === "Active")
      .sort(
        (a, b) =>
        new Date(a.next_step_due_date) - new Date(b.next_step_due_date)
      )
      .forEach((cs) => {
        const contact = state.contacts.find((c) => c.id === cs.contact_id);
        if (!contact) return;
        const account = contact.account_id ?
          state.accounts.find((a) => a.id === contact.account_id) :
          null;
        const row = allTasksTable.insertRow();
        row.innerHTML = `<td>${formatDate(cs.next_step_due_date)}</td><td>${contact.first_name} ${contact.last_name}</td><td>${account ? account.name : "N/A"}</td><td><button class="btn-secondary revisit-step-btn" data-cs-id="${cs.id}">Revisit Last Step</button></td>`;
      });

    state.activities
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 20)
      .forEach((act) => {
        const contact = state.contacts.find((c) => c.id === act.contact_id);
        const account = contact ?
          state.accounts.find((a) => a.id === contact.account_id) :
          null;
        const row = recentActivitiesTable.insertRow();
        row.innerHTML = `<td>${formatDate(act.date)}</td><td>${account ? account.name : "N/A"}</td><td>${contact ? `${contact.first_name} ${contact.last_name}` : "N/A"}</td><td>${act.type}: ${act.description}</td>`;
      });
  }

  function renderDealsMetrics() {
    if (!metricCurrentCommit) return;
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    let currentCommit = 0;
    let bestCase = 0;
    let totalFunnel = 0;
    state.deals.forEach((deal) => {
      const dealCloseDate = deal.close_month ?
        new Date(deal.close_month) :
        null;
      const isCurrentMonth =
        dealCloseDate &&
        dealCloseDate.getMonth() === currentMonth &&
        dealCloseDate.getFullYear() === currentYear;
      totalFunnel += deal.mrc || 0;
      if (isCurrentMonth) {
        bestCase += deal.mrc || 0;
        if (deal.is_committed) {
          currentCommit += deal.mrc || 0;
        }
      }
    });
    const commitPercentage =
      MONTHLY_QUOTA > 0 ?
      ((currentCommit / MONTHLY_QUOTA) * 100).toFixed(1) :
      0;
    const bestCasePercentage =
      MONTHLY_QUOTA > 0 ? ((bestCase / MONTHLY_QUOTA) * 100).toFixed(1) : 0;
    metricCurrentCommit.textContent = formatCurrencyK(currentCommit);
    metricBestCase.textContent = formatCurrencyK(bestCase);
    metricFunnel.textContent = formatCurrencyK(totalFunnel);
    document.getElementById(
      "commit-quota-percent"
    ).textContent = `${commitPercentage}%`;
    document.getElementById(
      "best-case-quota-percent"
    ).textContent = `${bestCasePercentage}%`;
  }

  async function completeStep(csId) {
    console.log(`completeStep: Attempting to complete step for csId: ${csId}`);
    const cs = state.contact_sequences.find((c) => c.id === csId);
    if (!cs) {
      console.warn(`completeStep: Contact sequence with ID ${csId} not found.`);
      return;
    }
    const sequence = state.sequences.find((s) => s.id === cs.sequence_id);
    const contact = state.contacts.find((c) => c.id === cs.contact_id);
    const step = state.sequence_steps.find(
      (s) =>
      s.sequence_id === cs.sequence_id &&
      s.step_number === cs.current_step_number
    );
    if (contact && sequence && step) {
      console.log("completeStep: Inserting activity...");
      const { error: activityError } = await supabase.from("activities").insert([{
        contact_id: contact.id,
        account_id: contact.account_id,
        date: new Date().toISOString(),
        type: `Sequence: ${step.type}`,
        description: step.subject || step.message || "Completed step",
        user_id: state.currentUser.id
      }]);
      if (activityError) {
        console.error("completeStep: Error inserting activity:", activityError.message);
      } else {
        console.log("completeStep: Activity inserted successfully.");
      }
    }
    const nextStep = state.sequence_steps.find(
      (s) =>
      s.sequence_id === cs.sequence_id &&
      s.step_number === cs.current_step_number + 1
    );

    if (nextStep) {
      console.log(`completeStep: Moving to next step (${nextStep.step_number})...`);
      const { error: updateError } = await supabase
        .from("contact_sequences")
        .update({
          current_step_number: nextStep.step_number,
          last_completed_date: new Date().toISOString(),
          next_step_due_date: addDays(
            new Date(),
            nextStep.delay_days
          ).toISOString()
        })
        .eq("id", cs.id);
      if (updateError) {
        console.error("completeStep: Error updating contact_sequences for next step:", updateError.message);
      } else {
        console.log("completeStep: Contact sequence updated for next step successfully.");
      }
    } else {
      console.log("completeStep: No next step found. Setting sequence status to 'Completed'.");
      const { error: completionError } = await supabase
        .from("contact_sequences")
        .update({
          status: "Completed"
        })
        .eq("id", cs.id);
      if (completionError) {
        console.error("completeStep: Error setting contact_sequences status to 'Completed':", completionError.message);
      } else {
        console.log("completeStep: Contact sequence status set to 'Completed' successfully.");
      }
    }
    console.log("completeStep: Calling loadAllData after step completion.");
    await loadAllData();
  }

  // --- Event Listener Setup (Dashboard specific) ---
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

  dashboardTable.addEventListener("click", async (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.classList.contains("complete-step-btn")) {
      completeStep(Number(t.dataset.id));
    } else if (t.classList.contains("send-email-btn")) {
      const csId = Number(t.dataset.csId);
      const contactId = Number(t.dataset.contactId);
      const subject = decodeURIComponent(t.dataset.subject);
      let message = decodeURIComponent(t.dataset.message);
      const contact = state.contacts.find((c) => c.id === contactId);
      if (!contact) return alert("Contact not found.");
      message = message.replace(/{{firstName}}/g, contact.first_name);
      const mailtoLink = `mailto:${contact.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
      window.open(mailtoLink, "_blank");
      completeStep(csId);
    } else if (t.classList.contains("linkedin-step-btn")) {
      const csId = Number(t.dataset.id);
      window.open("https://www.linkedin.com/feed/", "_blank");
      completeStep(csId);
    }
  });

  allTasksTable.addEventListener("click", async (e) => {
    const targetButton = e.target.closest(".revisit-step-btn");
    if (!targetButton) {
      console.log("Revisit button not clicked or target is null.");
      return;
    }
    const csId = Number(targetButton.dataset.csId);
    console.log(`Revisit button clicked for csId: ${csId}`);
    const contactSequence = state.contact_sequences.find(
      (cs) => cs.id === csId
    );
    if (!contactSequence) {
      console.warn(`Contact sequence with ID ${csId} not found in state.`);
      return;
    }

    const originalStepNumber = contactSequence.current_step_number;
    const newStepNumber = Math.max(1, originalStepNumber - 1);
    console.log(`Proposed new step number: ${newStepNumber} (from original: ${originalStepNumber})`);

    showModal(
      "Revisit Step",
      `Are you sure you want to revisit step ${newStepNumber} for this sequence?`,
      async () => {
        console.log("Modal confirmed. Attempting Supabase update for revisit...");
        const { data, error } = await supabase
          .from("contact_sequences")
          .update({
            current_step_number: newStepNumber,
            next_step_due_date: getStartOfLocalDayISO(), // Uses the new utility function
            status: "Active"
          })
          .eq("id", csId)
          .select();

        if (error) {
          console.error("Supabase error revisiting step:", error.message);
          alert("Error revisiting step: " + error.message);
        } else {
          console.log("Supabase update successful for revisit:", data);
          const updatedCsInMemory = state.contact_sequences.find(cs => cs.id === csId);
          console.log("State of csId 5 IN-MEMORY BEFORE loadAllData:", updatedCsInMemory);

          await loadAllData();

          const updatedCsAfterFetch = state.contact_sequences.find(cs => cs.id === csId);
          console.log("State of csId 5 AFTER loadAllData (newly fetched):", updatedCsAfterFetch);

          alert("Sequence step updated successfully!");
          hideModal();
        }
      }
    );
  });

  // --- App Initialization (Dashboard Page) ---
  const savedTheme = localStorage.getItem('crm-theme') || 'dark';
  const savedThemeIndex = themes.indexOf(savedTheme);
  currentThemeIndex = savedThemeIndex !== -1 ? savedThemeIndex : 0;
  applyTheme(themes[currentThemeIndex]);

  // Check user session on page load
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    state.currentUser = session.user;
    await loadAllData(); // Initial data load on page entry
  } else {
    window.location.href = "index.html"; // Redirect if not signed in
  }
});
