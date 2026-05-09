/**
 * Bare-apex landing. The middleware doesn't rewrite the apex itself
 * (only its subdomains), so this page is what visitors to the apex
 * see. Intentionally minimal.
 */
export default function ApexLanding() {
  return (
    <main style={{ padding: "4rem 1.5rem", maxWidth: 720, margin: "0 auto" }}>
      <h1 style={{ fontSize: "2rem", margin: 0 }}>Autoresearch</h1>
      <p style={{ color: "#666" }}>Nothing to see here.</p>
    </main>
  );
}
