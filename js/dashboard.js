// dashboard.js
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
  const debugBtn = document.getElementById("debug-btn");
  const dashboardTable = document.querySelector("#dashboard-table tbody");
  const recentActivitiesTable = document.querySelector("#recent-activities-table tbody");
  const allTasksTable = document.querySelector("#all-tasks-table tbody");
  const themeToggleBtn = document.getElementById("theme-toggle-btn");
  const themeNameSpan = document.getElementById("theme-name");
  const metricCurrentCommit = document.getElementById("metric-current-commit");
  const metricBestCase = document.getElementById("metric-best-case");
  const metricFunnel = document.getElementById("metric-funnel");

  // --- Theme Toggle Logic (Duplicated for now, consider a shared module) ---
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
      renderDashboard();
      renderDealsMetrics(); // Dashboard also has deal metrics
    }
  }

  // --- Specific Render Functions for Dashboard ---
  const renderDashboard = () => {
    if (!dashboardTable || !recentActivitiesTable || !allTasksTable) return;
    dashboardTable.innerHTML = "";
    recentActivitiesTable.innerHTML = "";
    allTasksTable.innerHTML = "";
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    state.contact_sequences
      .filter(
        (cs) =>
        new Date(cs.next_step_due_date) <= today && cs.status === "Active"
      )
      .sort(
        (a, b) =>
        new Date(a.next_step_due_date) - new Date(b.next_step_due_date)
      )
      .forEach((cs) => {
        const contact = state.contacts.find((c) => c.id === cs.contact_id);
        const sequence = state.sequences.find((s) => s.id === cs.sequence_id);
        if (!contact || !sequence) return;
        const step = state.sequence_steps.find(
          (s) =>
          s.sequence_id === sequence.id &&
          s.step_number === cs.current_step_number
        );
        if (!step) return;
        const row = dashboardTable.insertRow();
        const desc = step.subject || step.message || "";
        let btnHtml = "";
        const type = step.type.toLowerCase();
        if (type === "email" && contact.email) {
          btnHtml = `<button class="btn-primary send-email-btn" data-cs-id="${
            cs.id
          }" data-contact-id="${contact.id}" data-subject="${encodeURIComponent(
            step.subject
          )}" data-message="${encodeURIComponent(
            step.message
          )}">Send Email</button>`;
        } else if (type === "linkedin") {
          btnHtml = `<button class="btn-primary linkedin-step-btn" data-id="${cs.id}">Go to LinkedIn</button>`;
        } else {
          btnHtml = `<button class="btn-primary complete-step-btn" data-id="${cs.id}">Complete</button>`;
        }
        row.innerHTML = `<td>${formatDate(cs.next_step_due_date)}</td><td>${
          contact.first_name
        } ${contact.last_name}</td><td>${sequence.name}</td><td>${
          step.step_number
        }: ${step.type}</td><td>${desc}</td><td>${btnHtml}</td>`;
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
        row.innerHTML = `<td>${formatDate(cs.next_step_due_date)}</td><td>${
          contact.first_name
        } ${contact.last_name}</td><td>${
          account ? account.name : "N/A"
        }</td><td><button class="btn-secondary revisit-step-btn" data-cs-id="${
          cs.id
        }">Revisit Last Step</button></td>`;
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
        row.innerHTML = `<td>${formatDate(act.date)}</td><td>${
          account ? account.name : "N/A"
        }</td><td>${
          contact ? `${contact.first_name} ${contact.last_name}` : "N/A"
        }</td><td>${act.type}: ${act.description}</td>`;
      });
  };

  const renderDealsMetrics = () => {
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
  };

  async function completeStep(csId) {
    const cs = state.contact_sequences.find((c) => c.id === csId);
    if (!cs) return;
    const sequence = state.sequences.find((s) => s.id === cs.sequence_id);
    const contact = state.contacts.find((c) => c.id === cs.contact_id);
    const step = state.sequence_steps.find(
      (s) =>
      s.sequence_id === cs.sequence_id &&
      s.step_number === cs.current_step_number
    );
    if (contact && sequence && step) {
      await supabase.from("activities").insert([{
        contact_id: contact.id,
        account_id: contact.account_id,
        date: new Date().toISOString(),
        type: `Sequence: ${step.type}`,
        description: step.subject || step.message || "Completed step",
        user_id: state.currentUser.id // Make sure user_id is added here
      }]);
    }
    const nextStep = state.sequence_steps.find(
      (s) =>
      s.sequence_id === cs.sequence_id &&
      s.step_number === cs.current_step_number + 1
    );
    if (nextStep) {
      await supabase
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
    } else {
      await supabase
        .from("contact_sequences")
        .update({
          status: "Completed"
        })
        .eq("id", cs.id);
    }
    await loadAllData();
  }

  // --- Event Listener Setup (Dashboard specific) ---
  setupModalListeners(); // Setup for shared modal functionality

  themeToggleBtn.addEventListener("click", cycleTheme);

  logoutBtn.addEventListener("click", async () => {
    await supabase.auth.signOut();
    window.location.href = "index.html"; // Redirect to auth page after logout
  });

  debugBtn.addEventListener("click", () => {
    console.log(JSON.stringify(state, null, 2));
    alert("Current app state logged to console (F12).");
  });

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
      const mailtoLink = `mailto:${
        contact.email
      }?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(
        message
      )}`;
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
    if (targetButton) {
      const csId = Number(targetButton.dataset.csId);
      const contactSequence = state.contact_sequences.find(
        (cs) => cs.id === csId
      );
      if (contactSequence) {
        const newStepNumber = Math.max(
          1,
          contactSequence.current_step_number - 1
        );
        showModal(
          "Revisit Step",
          `Are you sure you want to revisit step ${newStepNumber} for this sequence?`,
          async () => {
            await supabase
              .from("contact_sequences")
              .update({
                current_step_number: newStepNumber,
                next_step_due_date: new Date().toISOString(),
                status: "Active"
              })
              .eq("id", csId);
            await loadAllData();
            alert("Sequence step updated successfully!");
            hideModal();
          }
        );
      }
    }
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
    await loadAllData();
  } else {
    // If no session, redirect to auth page
    window.location.href = "index.html";
  }
});