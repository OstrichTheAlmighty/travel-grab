"use client";

import { FormEvent, useState } from "react";

const demoUrl =
  process.env.NEXT_PUBLIC_DEMO_URL || "https://runway.streamlit.app";

const steps = [
  {
    title: "Name the thing",
    copy: "Tell Runway what you want, what it costs, and the date you want it by.",
  },
  {
    title: "See the real tradeoff",
    copy: "Runway reads spending patterns and finds the flexible categories that can move the timeline.",
  },
  {
    title: "Choose the path",
    copy: "Get a practical weekly plan that protects essentials and focuses on changes that feel realistic.",
  },
];

const examples = [
  "Can I afford Coachella by July?",
  "What would make Hawaii possible this summer?",
  "If I cut takeout twice a week, can I buy this?",
];

const signals = [
  "Restaurants and dining",
  "Coffee runs",
  "Shopping",
  "Entertainment",
  "Subscriptions",
  "Other discretionary spending",
];

export default function Page() {
  const [waitlistEmail, setWaitlistEmail] = useState("");
  const [waitlistSubmitted, setWaitlistSubmitted] = useState(false);

  function joinWaitlist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!waitlistEmail.trim()) {
      return;
    }
    setWaitlistSubmitted(true);
  }

  return (
    <main className="min-h-screen overflow-hidden bg-ink text-white">
      <section className="relative px-6 pb-24 pt-6 sm:px-8 lg:px-12">
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:72px_72px] [mask-image:linear-gradient(to_bottom,black,transparent_88%)]" />
        <nav className="mx-auto flex max-w-7xl items-center justify-between rounded-full border border-line bg-white/[0.04] px-5 py-3 backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-white text-sm font-black text-ink">
              R
            </div>
            <span className="text-sm font-semibold tracking-wide text-white">
              Runway
            </span>
          </div>
          <div className="hidden items-center gap-8 text-sm text-white/68 md:flex">
            <a href="#how">How it works</a>
            <a href="#plans">Plans</a>
            <a href="#why">Why Runway</a>
          </div>
          <a
            href={demoUrl}
            className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-runway-mint"
          >
            Try the demo
          </a>
        </nav>

        <div className="mx-auto grid max-w-7xl items-center gap-14 pb-8 pt-20 lg:grid-cols-[1.03fr_0.97fr] lg:pt-28">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-runway-mint/30 bg-runway-mint/10 px-4 py-2 text-sm text-runway-mint">
              AI financial planning around goals
            </div>
            <h1 className="max-w-5xl text-5xl font-semibold leading-[0.95] tracking-tight text-white sm:text-7xl lg:text-8xl">
              How can I afford this by this date?
            </h1>
            <p className="mt-8 max-w-2xl text-lg leading-8 text-white/70 sm:text-xl">
              Runway turns the thing you want into a clear plan: what it takes
              each week, what spending changes would help, and how realistic the
              timeline feels.
            </p>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <a
                href={demoUrl}
                className="rounded-full bg-runway-mint px-6 py-4 text-center text-sm font-bold text-ink shadow-glow transition hover:scale-[1.02]"
              >
                Try the demo
              </a>
              <a
                href="#how"
                className="rounded-full border border-line bg-white/[0.04] px-6 py-4 text-center text-sm font-semibold text-white/86 transition hover:bg-white/[0.08]"
              >
                See how it works
              </a>
            </div>
            <div className="mt-10 flex flex-wrap gap-3">
              {examples.map((example) => (
                <span
                  key={example}
                  className="rounded-full border border-line bg-white/[0.04] px-4 py-2 text-sm text-white/64"
                >
                  {example}
                </span>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-8 -z-10 rounded-[3rem] bg-runway-blue/20 blur-3xl" />
            <div className="rounded-[2rem] border border-line bg-panel/90 p-4 shadow-card backdrop-blur">
              <div className="rounded-[1.5rem] border border-line bg-ink p-5">
                <div className="flex items-center justify-between border-b border-line pb-4">
                  <div>
                    <p className="text-sm text-white/50">Goal</p>
                    <p className="mt-1 text-2xl font-semibold">Hawaii trip</p>
                  </div>
                  <div className="rounded-full bg-runway-mint/12 px-3 py-1 text-sm font-medium text-runway-mint">
                    Achievable
                  </div>
                </div>

                <div className="grid gap-3 py-5 sm:grid-cols-3">
                  <Metric label="Cost" value="$1,800" />
                  <Metric label="Target" value="Aug 11" />
                  <Metric label="Need" value="$140/wk" />
                </div>

                <div className="rounded-2xl bg-white/[0.04] p-4">
                  <p className="text-sm font-medium text-white/70">
                    This week&apos;s plan
                  </p>
                  <div className="mt-4 space-y-3">
                    <PlanRow action="Skip 1 restaurant visit" amount="+$22" />
                    <PlanRow action="Reduce shopping by 15%" amount="+$31" />
                    <PlanRow action="Pause unused subscriptions" amount="+$15/mo" />
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-runway-blue/20 bg-runway-blue/10 p-4">
                  <p className="text-sm text-white/62">
                    Runway protects rent, bills, savings, groceries, health, and
                    essential transportation by default.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 py-16 sm:px-8 lg:px-12">
        <div className="mx-auto grid max-w-7xl gap-8 border-y border-line py-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-runway-mint">
              Early access
            </p>
            <h2 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
              Want early access to Runway?
            </h2>
          </div>
          <form
            onSubmit={joinWaitlist}
            className="flex flex-col gap-3 sm:flex-row"
          >
            <label className="sr-only" htmlFor="waitlist-email">
              Email
            </label>
            <input
              id="waitlist-email"
              type="email"
              required
              value={waitlistEmail}
              onChange={(event) => {
                setWaitlistEmail(event.target.value);
                setWaitlistSubmitted(false);
              }}
              placeholder="you@example.com"
              className="min-h-14 flex-1 rounded-full border border-line bg-white/[0.05] px-5 text-white outline-none transition placeholder:text-white/36 focus:border-runway-mint"
            />
            <button
              type="submit"
              className="min-h-14 rounded-full bg-runway-mint px-6 text-sm font-bold text-ink shadow-glow transition hover:scale-[1.02]"
            >
              Join the waitlist
            </button>
            {waitlistSubmitted ? (
              <p className="self-center text-sm font-medium text-runway-mint">
                You're on the waitlist.
              </p>
            ) : null}
          </form>
        </div>
      </section>

      <section id="how" className="px-6 py-20 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-runway-mint">
              How it works
            </p>
            <h2 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
              A decision engine for the life you want.
            </h2>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {steps.map((step, index) => (
              <div
                key={step.title}
                className="rounded-3xl border border-line bg-white/[0.04] p-6"
              >
                <div className="mb-8 grid h-10 w-10 place-items-center rounded-full bg-white text-sm font-black text-ink">
                  {index + 1}
                </div>
                <h3 className="text-xl font-semibold">{step.title}</h3>
                <p className="mt-3 leading-7 text-white/62">{step.copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="plans" className="px-6 py-20 sm:px-8 lg:px-12">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-runway-blue">
              Affordability intelligence
            </p>
            <h2 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
              Plans that feel human, not punitive.
            </h2>
            <p className="mt-6 text-lg leading-8 text-white/64">
              Runway focuses on flexible spending first, explains the tradeoff,
              and shows whether the plan changes the timeline enough to matter.
            </p>
          </div>
          <div className="grid gap-3">
            {signals.map((signal) => (
              <div
                key={signal}
                className="flex items-center justify-between rounded-2xl border border-line bg-white/[0.04] p-4"
              >
                <span className="font-medium">{signal}</span>
                <span className="text-sm text-runway-mint">
                  flexible signal
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="why" className="px-6 py-20 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-7xl rounded-[2rem] border border-line bg-white/[0.04] p-8 sm:p-12">
          <div className="grid gap-10 lg:grid-cols-[1fr_0.8fr] lg:items-end">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-runway-gold">
                Why Runway
              </p>
              <h2 className="mt-4 max-w-4xl text-4xl font-semibold tracking-tight sm:text-6xl">
                Because wanting something should come with a path, not guilt.
              </h2>
              <p className="mt-6 max-w-3xl text-lg leading-8 text-white/64">
                Runway helps people understand what would have to change this
                week to make a goal possible, without turning their life into a
                spreadsheet.
              </p>
            </div>
            <a
              href={demoUrl}
              className="rounded-full bg-white px-6 py-4 text-center text-sm font-bold text-ink transition hover:bg-runway-mint"
            >
              Try the demo
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white/[0.035] p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-white/42">
        {label}
      </p>
      <p className="mt-2 text-lg font-semibold">{value}</p>
    </div>
  );
}

function PlanRow({ action, amount }: { action: string; amount: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl bg-white/[0.04] px-4 py-3">
      <span className="text-sm text-white/78">{action}</span>
      <span className="shrink-0 text-sm font-semibold text-runway-mint">
        {amount}
      </span>
    </div>
  );
}
