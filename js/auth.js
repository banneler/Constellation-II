// auth.js
console.log("auth.js script started parsing.");
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './shared_constants.js';

document.addEventListener("DOMContentLoaded", () => {
  console.log("DOMContentLoaded fired for auth.js.");

  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // --- DOM Element Selectors (Auth specific) ---
  const authContainer = document.getElementById("auth-container");
  const authForm = document.getElementById("auth-form");
  const authTitle = document.getElementById("auth-title");
  const authError = document.getElementById("auth-error");
  const authEmailInput = document.getElementById("auth-email");
  const authPasswordInput = document.getElementById("auth-password");
  const authSubmitBtn = document.getElementById("auth-submit-btn");
  const authToggleLink = document.getElementById("auth-toggle-link");

  // Debugging console logs for element selection
  console.log("Auth Container:", authContainer);
  console.log("Auth Form:", authForm);
  console.log("Auth Email Input:", authEmailInput);
  console.log("Auth Password Input:", authPasswordInput);
  console.log("Auth Submit Button:", authSubmitBtn);
  console.log("Auth Toggle Link:", authToggleLink);

  let isLoginMode = true;

  // --- Event Listener Setup (Auth specific) ---
  authToggleLink.addEventListener("click", (e) => {
    e.preventDefault();
    console.log("Toggle link clicked."); // Debugging log
    isLoginMode = !isLoginMode;
    authTitle.textContent = isLoginMode ? "Login" : "Sign Up";
    authSubmitBtn.textContent = isLoginMode ? "Login" : "Sign Up";
    authToggleLink.textContent = isLoginMode ?
      "Need an account? Sign Up" :
      "Have an account? Login";
    authError.textContent = "";
  });

  // Debugging log for listener attachment
  console.log("Attaching form submit listener to:", authForm);
  authForm.addEventListener("submit", async (e) => {
    e.preventDefault(); // IMPORTANT: This stops the default form submission (page reload)
    console.log("Auth form submitted!"); // Debugging log
    const email = authEmailInput.value;
    const password = authPasswordInput.value;
    authError.textContent = "";

    console.log("Attempting auth with email:", email); // Debugging log

    const {
      error
    } = isLoginMode ?
      await supabase.auth.signInWithPassword({
        email,
        password
      }) :
      await supabase.auth.signUp({
        email,
        password
      });

    if (error) {
      console.error("Supabase Auth Error:", error.message); // Debugging log for Supabase errors
      authError.textContent = error.message;
    } else if (!isLoginMode) {
      console.log("Sign up successful. Check email for confirmation."); // Debugging log
      authError.textContent = "Check your email for a confirmation link!";
    } else {
      console.log("Login successful. Redirecting to dashboard.html."); // Debugging log
      authForm.reset();
      window.location.href = "dashboard.html";
    }
  });

  // --- App Initialization (Auth Page) ---
  supabase.auth.onAuthStateChange(async (event, session) => {
    console.log("Auth event fired on auth page:", event); // Debugging log for auth state changes
    if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && session) {
      // If already signed in, redirect to dashboard
      console.log("User is signed in or has an initial session. Redirecting."); // Debugging log
      window.location.href = "dashboard.html";
    }
    // If signed out, ensure auth container is visible (already the default state for this page)
  });
});
