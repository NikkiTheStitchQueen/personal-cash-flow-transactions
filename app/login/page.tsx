type LoginPageProps = {
  searchParams: Promise<{ error?: string; next?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error, next } = await searchParams;
  const errorMessage = error === "missing-password"
    ? "Set CASH_FLOW_TRACKER_PASSWORD before signing in."
    : error === "invalid"
      ? "That password did not work."
      : "";

  return (
    <main className="login-screen">
      <section className="login-panel" aria-labelledby="login-title">
        <div>
          <p className="eyebrow">Personal cash flow tracker</p>
          <h1 id="login-title">Sign in</h1>
        </div>

        <form className="login-form" action="/api/login" method="post">
          <input name="next" type="hidden" value={next ?? "/"} />
          <label>
            Password
            <input name="password" type="password" autoComplete="current-password" required autoFocus />
          </label>
          {errorMessage && <div className="form-error">{errorMessage}</div>}
          <button className="primary-button" type="submit">Open tracker</button>
        </form>
      </section>
    </main>
  );
}
