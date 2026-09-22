try {
  const stored = JSON.parse(localStorage.getItem("opencord:prefs"));

  if (stored && stored.state && stored.state.theme === "dark") {
    document.documentElement.classList.add("dark");
  }
} catch {
  // Unreadable or unavailable storage is the same answer as no preference: the
  // default theme, which the stylesheet already carries.
}
