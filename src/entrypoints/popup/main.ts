import '@/assets/css/theme.css';
import '@/assets/css/popup.css';

// Popup surface (spec §6): one-click scan of the current tab → composite score,
// per-category breakdown, pass/fail/na checklist with fix-prompts. Stub until M1.
const button = document.getElementById('scan-button');
button?.addEventListener('click', () => {
  console.log('[agent-readiness] scan requested');
});
