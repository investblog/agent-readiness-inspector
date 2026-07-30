export default defineBackground(() => {
  // Probe layer lands here (spec §5): fetch with credentials from the service
  // worker, feed ProbeResponses to the check-engine. Stub until M1.
  console.log('[agent-readiness] background ready');
});
